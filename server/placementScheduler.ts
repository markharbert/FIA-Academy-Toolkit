import type { IStorage } from "./storage";
import { checkGmailPlacement, type PlacementResult } from "./gmailOAuth";

const TICK_INTERVAL_MS   = 5 * 60 * 1000;   // run the scheduler tick every 5 min
const PHASE1_WINDOW_MS   = 60 * 60 * 1000;  // first 1 hour → phase 1
const PHASE1_INTERVAL_MS = 15 * 60 * 1000;  // phase 1: check every 15 min
const PHASE2_INTERVAL_MS = 60 * 60 * 1000;  // phase 2: check every 60 min
const STAGGER_MS         = 1500;             // delay between users to avoid API bursts

export async function runPlacementCheckForUser(
  storage: IStorage,
  userId: string,
  sendingFrom: string
): Promise<void> {
  try {
    const allInboxes = await storage.getSeedInboxes(true);
    const connected  = allInboxes.filter(i => i.isConnected && i.provider === "gmail");
    if (connected.length === 0) return;

    const results: PlacementResult[] = await Promise.all(
      connected.map(inbox =>
        checkGmailPlacement(
          {
            id:                inbox.id,
            label:             inbox.label,
            email:             inbox.email,
            provider:          inbox.provider,
            oauthAccessToken:  inbox.oauthAccessToken,
            oauthRefreshToken: inbox.oauthRefreshToken,
          },
          sendingFrom
        )
      )
    );

    await storage.saveLastPlacementResults(userId, results);
    console.log(`[PlacementScheduler] checked ${connected.length} inbox(es) for user ${userId}`);
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
      const windowStart     = new Date(user.placementAutoCheckUntil.getTime() - 24 * 60 * 60 * 1000);
      const windowAgeMs     = now.getTime() - windowStart.getTime();
      const lastCheck       = user.lastPlacementCheckedAt?.getTime() ?? 0;
      const timeSinceCheck  = now.getTime() - lastCheck;
      const requiredInterval = windowAgeMs < PHASE1_WINDOW_MS ? PHASE1_INTERVAL_MS : PHASE2_INTERVAL_MS;

      if (timeSinceCheck < requiredInterval) continue;

      await runPlacementCheckForUser(storage, user.userId, user.sendingFromAddress);
      await new Promise(r => setTimeout(r, STAGGER_MS));
    }
  }

  tick().catch(err => console.error("[PlacementScheduler] initial tick error:", err));
  setInterval(
    () => tick().catch(err => console.error("[PlacementScheduler] tick error:", err)),
    TICK_INTERVAL_MS
  );
  console.log("[PlacementScheduler] started (tick every 5 min)");
}
