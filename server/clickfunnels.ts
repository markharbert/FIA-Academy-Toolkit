import crypto from "crypto";
import jwt from "jsonwebtoken";
import { storage } from "./storage";

const CF_WORKSPACE_DOMAIN = process.env.CF_WORKSPACE_DOMAIN || "";
const CF_COURSE_ID = process.env.CF_COURSE_ID || "";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";
const CF_WEBHOOK_SECRET = process.env.CF_WEBHOOK_SECRET || "";

// Verify the HMAC signature ClickFunnels sends on every webhook
export function verifyCfWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined
): boolean {
  if (!CF_WEBHOOK_SECRET || !signatureHeader) return false;
  const expected = crypto
    .createHmac("sha256", CF_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// Generate a signed JWT magic link so a user can jump from our app into CF
export function generateCfSsoUrl(email: string, redirectTo?: string): string {
  const secret = CF_WEBHOOK_SECRET;
  const domain = CF_WORKSPACE_DOMAIN;
  if (!secret || !domain) {
    throw new Error("CF_WORKSPACE_DOMAIN and CF_WEBHOOK_SECRET must be set");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: `${email}:${domain}`,
    nbf: now,
    exp: now + 3600,
    iat: now,
    redirect_to: redirectTo || `https://${domain}/courses`,
  };

  const token = jwt.sign(payload, secret, {
    algorithm: "HS256",
    noTimestamp: true,
  });

  return (
    `https://${domain}/sso` +
    `?identifier=${encodeURIComponent(email)}` +
    `&strategy=email` +
    `&token=${token}`
  );
}

// Parse enrollment event from the CF webhook payload
export interface CfWebhookEvent {
  eventType: string;
  contactEmail: string | null;
  contactId: string | null;
  courseId: string | null;
}

export function parseCfWebhookEvent(body: any): CfWebhookEvent {
  const eventType: string = body.event_type || body.type || "";
  const data = body.data || body.subject || body || {};

  // Contact email – may be at top level or nested
  const contactEmail: string | null =
    data.email_address ||
    data.email ||
    data.contact?.email_address ||
    data.contact?.email ||
    null;

  const contactId: string | null =
    String(data.contact_id || data.id || data.contact?.id || "") || null;

  // Course ID – present in enrollment events
  const courseId: string | null =
    String(
      data.course_id ||
        data.curriculum_id ||
        data.product_id ||
        data.enrollment?.course_id ||
        ""
    ) || null;

  return { eventType, contactEmail, contactId, courseId };
}

// Grant or revoke CF access for a user identified by email
export async function handleCfEnrollmentEvent(
  event: CfWebhookEvent
): Promise<{ action: string; email: string | null }> {
  const { eventType, contactEmail, contactId, courseId } = event;

  // Only act when the event is about the configured course (or no course filter set)
  const courseMatches =
    !CF_COURSE_ID ||
    !courseId ||
    courseId === CF_COURSE_ID;

  if (!contactEmail) {
    return { action: "ignored_no_email", email: null };
  }

  const user = await storage.getUserByEmail(contactEmail);

  const isGrantEvent = [
    "courses/enrollment.created",
    "contact.identified",
    "contact.created",
  ].includes(eventType);

  const isRevokeEvent = [
    "courses/enrollment.suspended",
    "courses/enrollment.revoked",
    "courses/enrollment.deleted",
    "subscription.cancelled",
    "subscription.churned",
  ].includes(eventType);

  if (isGrantEvent && courseMatches) {
    if (user) {
      await storage.updateUser(user.id, {
        cfEnrolled: true,
        cfContactId: contactId || user.cfContactId,
        cfEnrolledAt: new Date(),
        cfRevokedAt: null,
      });
      return { action: "granted", email: contactEmail };
    }
    // User not in our system yet – we can't grant access but log it
    return { action: "no_local_user", email: contactEmail };
  }

  if (isRevokeEvent) {
    if (user) {
      await storage.updateUser(user.id, {
        cfEnrolled: false,
        cfRevokedAt: new Date(),
      });
      return { action: "revoked", email: contactEmail };
    }
    return { action: "no_local_user", email: contactEmail };
  }

  return { action: "ignored", email: contactEmail };
}

export { CF_WORKSPACE_DOMAIN, CF_COURSE_ID, CF_API_TOKEN };
