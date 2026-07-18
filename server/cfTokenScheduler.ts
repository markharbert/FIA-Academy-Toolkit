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
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    // Step 1: Save token record to DB (non-fatal — still push to CF even if DB write fails)
    let dbOk = false;
    try {
      await storage.createCfMagicToken({
        tokenHash,
        userId: member.userId,
        email: member.email,
        expiresAt,
        ipAddress: null,
      });
      dbOk = true;
    } catch (err: any) {
      console.error(
        `[CF Token Scheduler] DB write failed for ${member.email}: ${err?.message ?? err}`
      );
    }

    // Step 2: Push token to CF contact record (only attempt if DB write succeeded,
    // so the token can actually be validated when the member clicks the link)
    if (!dbOk) {
      failed++;
      continue;
    }

    try {
      await writeCfContactToken(member.contactId, rawToken);
      pushed++;
    } catch (err: any) {
      console.error(
        `[CF Token Scheduler] CF write failed for ${member.email} (contact ${member.contactId}): ${err?.message ?? err}`
      );
      failed++;
    }
  }

  console.log(`[CF Token Scheduler] done — pushed=${pushed} failed=${failed}`);
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
  refreshAllTokens().catch(() => {});
  setInterval(() => refreshAllTokens().catch(() => {}), REFRESH_INTERVAL_MS);
}
