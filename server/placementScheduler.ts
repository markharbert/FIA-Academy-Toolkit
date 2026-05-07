import type { IStorage } from "./storage";
import { checkGmailPlacement, checkGmailPlacementServiceAccount, isServiceAccountConfigured, type PlacementResult } from "./gmailOAuth";

const TICK_INTERVAL_MS  = 5 * 60 * 1000;   // scheduler wakes up every 5 min
const CHECK_INTERVAL_MS = 15 * 60 * 1000;  // check each user at most every 15 min
const STAGGER_MS        = 1500;             // delay between users to avoid API bursts

const DEFINITIVE_STATUSES = new Set(["primary", "promotions", "social", "updates", "forums", "spam"]);

function allResolved(results: PlacementResult[]): boolean {
  return results.length > 0 && results.every(r => DEFINITIVE_STATUSES.has(r.status));
}

// Returns true only if both result sets contain the same status for every inbox.
// Requires the same number of results and matching status per inboxId.
function resultsMatch(prev: unknown[] | null, next: PlacementResult[]): boolean {
  if (!prev || !Array.isArray(prev) || prev.length === 0) return false;
  if (prev.length !== next.length) return false;
  const prevMap = new Map(
    (prev as Array<{ inboxId: string; status: string }>).map(r => [r.inboxId, r.status])
  );
  return next.every(r => prevMap.get(r.inboxId) === r.status);
}

export async function runPlacementCheckForUser(
  storage: IStorage,
  userId: string,
  sendingFrom: string,
  previousResults: unknown[] | null = null,
  emailContext?: { messageId?: string | null; receivedAt?: Date | null; subject?: string | null }
): Promise<void> {
  try {
    const allInboxes = await storage.getSeedInboxes(true);
    const useServiceAccount = isServiceAccountConfigured();

    // With a service account we can check any Gmail inbox (no per-inbox OAuth needed).
    // Without one, fall back to only checking OAuth-connected inboxes.
    const targetInboxes = useServiceAccount
      ? allInboxes.filter(i => i.provider === "gmail")
      : allInboxes.filter(i => i.isConnected && i.provider === "gmail");

    if (targetInboxes.length === 0) return;

    const results: PlacementResult[] = (
      await Promise.all(
        targetInboxes.map(async inbox => {
          try {
            if (useServiceAccount) {
              return await checkGmailPlacementServiceAccount(inbox, sendingFrom, emailContext);
            }
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

    const definitiveNow = allResolved(results);
    const confirmedMatch = definitiveNow && resultsMatch(previousResults, results);

    if (definitiveNow) {
      if (confirmedMatch) {
        // Same definitive result on two consecutive checks — trustworthy, stop monitoring.
        await storage.setPlacementAutoCheckWindow(userId, null);
        // Permanently store confirmed results on the specific email record so they
        // are never overwritten when a new email arrives and opens a new window.
        if (emailContext?.messageId) {
          await storage.saveEmailPlacementResults(emailContext.messageId, userId, results);
        }
        const summary = results.map(r => `${r.label}: ${r.status}`).join(", ");
        console.log(`[PlacementScheduler] CONFIRMED for user ${userId} — ${summary} — monitoring stopped`);
      } else {
        // First time we've seen a definitive result. Keep monitoring; next check will confirm.
        const summary = results.map(r => `${r.label}: ${r.status}`).join(", ");
        console.log(`[PlacementScheduler] first definitive reading for user ${userId} — ${summary} — awaiting confirmation check`);
      }
    } else {
      const summary = results.map(r => `${r.label}: ${r.status}`).join(", ");
      console.log(`[PlacementScheduler] checked ${connected.length} inbox(es) for user ${userId} — ${summary}`);
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

      await runPlacementCheckForUser(
        storage,
        user.userId,
        user.effectiveSenderAddress,
        user.lastPlacementResults,
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
  console.log("[PlacementScheduler] started (tick every 5 min, check interval 15 min, confirmation required)");
}
