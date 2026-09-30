import crypto from "crypto";
import { db } from "./db";
import { webhooks } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { safeNormalizeWebsite } from "./inboxIntelScreenshots";

export type WebhookEvent =
  | "task.created"
  | "task.updated"
  | "task.deleted"
  | "project.created"
  | "project.updated"
  | "project.deleted"
  | "dmo.updated";

function sign(secret: string, body: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

export async function fireWebhooks(
  userId: string,
  event: WebhookEvent,
  data: unknown
): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.userId, userId), eq(webhooks.active, true)));

    const matching = rows.filter(
      (w) => w.events.includes("*") || w.events.includes(event)
    );

    if (!matching.length) return;

    const payload = JSON.stringify({ event, userId, timestamp: new Date().toISOString(), data });

    for (const wh of matching) {
      // Recheck on each delivery: a previously safe hostname may have changed.
      // Never follow a redirect to an unvalidated destination.
      const safeUrl = await safeNormalizeWebsite(wh.url);
      if (!safeUrl) {
        console.warn(`[webhook] blocked unsafe delivery target for webhook ${wh.id}`);
        continue;
      }
      const sig = sign(wh.secret, payload);
      fetch(safeUrl, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Event": event,
          "X-Webhook-Signature": sig,
        },
        body: payload,
        signal: AbortSignal.timeout(8000),
      }).catch((err) => {
        console.warn(`[webhook] delivery failed → ${wh.url}:`, err?.message ?? err);
      });
    }
  } catch (err) {
    console.warn("[webhook] fireWebhooks error (non-fatal):", err);
  }
}
