import crypto from "crypto";
import { storage } from "./storage";
import { writeCfContactToken, CF_API_TOKEN, CF_WORKSPACE_DOMAIN } from "./clickfunnels";

const REFRESH_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes
const TOKEN_TTL_MS = 5 * 60 * 1000;        // 5 minutes
let schedulerStarted = false;

export async function refreshAllTokens(): Promise<{ pushed: number; failed: number }> {
  if (!CF_API_TOKEN || !CF_WORKSPACE_DOMAIN) return { pushed: 0, failed: 0 };

  let members: Array<{ userId: string; email: string; contactId: string }>;
  try {
    members = await storage.getEnrolledUsersWithContactId();
  } catch (err: any) {
    console.error("[CF Token Scheduler] failed to fetch enrolled members:", err?.message);
    return { pushed: 0, failed: 0 };
  }

  if (members.length === 0) return { pushed: 0, failed: 0 };
  console.log(`[CF Token Scheduler] refreshing tokens for ${members.length} member(s)`);

  let pushed = 0, failed = 0;
  for (const member of members) {
    try {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

      await storage.createCfMagicToken({
        tokenHash,
        userId: member.userId,
        email: member.email,
        expiresAt,
        ipAddress: null,
      });

      await writeCfContactToken(member.contactId, rawToken);
      pushed++;
    } catch (err: any) {
      console.error(`[CF Token Scheduler] failed for ${member.email} (contact ${member.contactId}):`, err?.message);
      failed++;
    }
  }
  return { pushed, failed };
}

export function startCfTokenScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  if (!CF_API_TOKEN || !CF_WORKSPACE_DOMAIN) {
    console.log("[CF Token Scheduler] CF not configured — skipping.");
    return;
  }

  console.log("[CF Token Scheduler] starting (refresh every 4 min)");
  // Run immediately on startup, then on interval
  refreshAllTokens().catch(() => {});
  setInterval(() => refreshAllTokens().catch(() => {}), REFRESH_INTERVAL_MS);
}
