import type { IStorage } from "./storage";
import { checkGmailPlacement, checkGmailPlacementServiceAccount, isServiceAccountConfigured, isServiceAccountEligible, type PlacementResult } from "./gmailOAuth";
import { checkGmailPlacementImap } from "./imapPlacement";

const TICK_INTERVAL_MS     = 5 * 60 * 1000;   // scheduler wakes up every 5 min
const CHECK_INTERVAL_MS    = 15 * 60 * 1000;  // re-check interval if still not found
const STAGGER_MS           = 1500;             // delay between users to avoid API bursts
const MIN_INITIAL_DELAY_MS = 15 * 60 * 1000;  // wait 15 min after email arrives before first check

const DEFINITIVE_STATUSES = new Set(["primary", "promotions", "social", "updates", "forums", "spam"]);

// A result blocks lock-in only when it's "not_found" — meaning Gmail hasn't indexed
// the email yet and we should retry later. "error" and "not_connected" are permanent
// states for that inbox (bad token, no connection) and must never prevent the other
// inboxes from being locked in. "not_found" is the only truly temporary state.
function allResolved(results: PlacementResult[]): boolean {
  return results.length > 0 && results.every(r => r.status !== "not_found");
}

export async function runPlacementCheckForUser(
  storage: IStorage,
  userId: string,
  sendingFrom: string,
  emailContext?: { messageId?: string | null; receivedAt?: Date | null; subject?: string | null }
): Promise<void> {
  try {
    const allInboxes = await storage.getSeedInboxes(true);
    const saConfigured = isServiceAccountConfigured();

    // Routing:
    //   SA (DWD)   — Google Workspace accounts (isServiceAccountEligible), never expires
    //   IMAP       — personal @gmail.com with authMethod='imap' + App Password, never expires
    //   OAuth      — legacy personal @gmail.com OAuth tokens (kept for backward compat)
    const targetInboxes = allInboxes.filter(i =>
      i.provider === "gmail" && (
        (saConfigured && isServiceAccountEligible(i.email)) ||
        i.authMethod === "imap" ||
        (i.isConnected && i.oauthAccessToken)
      )
    );

    if (targetInboxes.length === 0) return;

    const results: PlacementResult[] = (
      await Promise.all(
        targetInboxes.map(async inbox => {
          try {
            // 1. Service Account (Google Workspace)
            if (saConfigured && isServiceAccountEligible(inbox.email)) {
              return await checkGmailPlacementServiceAccount(inbox, sendingFrom, emailContext);
            }
            // 2. IMAP + App Password (personal Gmail, permanent)
            if (inbox.authMethod === "imap") {
              return await checkGmailPlacementImap(
                {
                  id:           inbox.id,
                  label:        inbox.label,
                  email:        inbox.email,
                  provider:     inbox.provider,
                  imapPassword: inbox.imapPassword,
                },
                sendingFrom,
                emailContext
              );
            }
            // 3. Legacy OAuth (personal Gmail)
            return await checkGmailPlacement(
              {
                id:                inbox.id,
                label:             inbox.label,
                email:             inbox.email,
                provider:          inbox.provider,
                oauthAccessToken:  inbox.oauthAccessToken,
                oauthRefreshToken: inbox.oauthRefreshToken,
              },
              sendingFrom,
              emailContext
            );
          } catch (err: any) {
            if (err?.code === "OAUTH_INVALID_GRANT") {
              console.warn(`[PlacementScheduler] invalid_grant for inbox ${inbox.email} — marking needs-reconnect`);
              await storage.markSeedInboxNeedsReconnect(inbox.id);
            } else {
              console.error(`[PlacementScheduler] unexpected error for inbox ${inbox.email}:`, err?.message);
            }
            return {
              inboxId: inbox.id,
              label: inbox.label,
              email: inbox.email,
              provider: inbox.provider,
              checkedAt: new Date().toISOString(),
              status: "error" as const,
            } satisfies PlacementResult;
          }
        })
      )
    );

    await storage.saveLastPlacementResults(userId, results);

    const summary = results.map(r => `${r.label}: ${r.status}`).join(", ");

    if (allResolved(results)) {
      // First definitive result — lock it in immediately, stop monitoring.
      // No second confirmation check needed: Gmail's categorisation is final within
      // minutes of delivery and the 15-min indexing hold ensures we're reading the
      // right email before we ever run a search.
      await storage.setPlacementAutoCheckWindow(userId, null);
      if (emailContext?.messageId) {
        await storage.saveEmailPlacementResults(emailContext.messageId, userId, results);
      }
      console.log(`[PlacementScheduler] LOCKED IN for user ${userId} — ${summary} — monitoring stopped`);
    } else {
      console.log(`[PlacementScheduler] checked ${targetInboxes.length} inbox(es) for user ${userId} — ${summary} — will retry`);
    }
  } catch (err: any) {
    console.error(`[PlacementScheduler] error for user ${userId}:`, err?.message);
  }
}

export function startPlacementScheduler(storage: IStorage): void {
  async function tick() {
    const now = new Date();
    let users: Awaited<ReturnType<IStorage["getUsersWithActivePlacementMonitoring"]>>;
    try {
      users = await storage.getUsersWithActivePlacementMonitoring(now);
    } catch (err: any) {
      console.error("[PlacementScheduler] failed to query active users:", err?.message);
      return;
    }

    for (const user of users) {
      const lastCheck      = user.lastPlacementCheckedAt ? new Date(user.lastPlacementCheckedAt).getTime() : 0;
      const timeSinceCheck = now.getTime() - lastCheck;

      if (timeSinceCheck < CHECK_INTERVAL_MS) continue;

      // Hold off until 15 minutes after the email arrived.
      // Gmail needs time to index new mail before searches return accurate results.
      if (user.placementCheckReceivedAt) {
        const emailAgeMs = now.getTime() - new Date(user.placementCheckReceivedAt).getTime();
        if (emailAgeMs < MIN_INITIAL_DELAY_MS) {
          console.log(
            `[PlacementScheduler] holding — email arrived ${Math.round(emailAgeMs / 1000)}s ago for user ${user.userId}, ` +
            `waiting until 15min mark`
          );
          continue;
        }
      }

      await runPlacementCheckForUser(
        storage,
        user.userId,
        user.effectiveSenderAddress,
        { messageId: user.placementCheckMessageId, receivedAt: user.placementCheckReceivedAt, subject: user.placementCheckSubject }
      );
      await new Promise(r => setTimeout(r, STAGGER_MS));
    }
  }

  tick().catch(err => console.error("[PlacementScheduler] initial tick error:", err));
  setInterval(
    () => tick().catch(err => console.error("[PlacementScheduler] tick error:", err)),
    TICK_INTERVAL_MS
  );
  console.log("[PlacementScheduler] started (tick every 5 min, 15-min initial hold, locks in on first definitive result)");
}
