import crypto from "crypto";
import jwt from "jsonwebtoken";
import { storage } from "./storage";

// Strip any accidental protocol prefix and trailing slash
const CF_WORKSPACE_DOMAIN = (process.env.CF_WORKSPACE_DOMAIN || "")
  .replace(/^https?:\/\//, "")
  .replace(/\/$/, "");
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

// ── CF API: Verify enrollment for a given email ─────────────────────────────
// Called during one-click login to auto-provision accounts for existing
// CF members who haven't signed up to the Toolkit yet.

export interface CfContactInfo {
  enrolled: boolean;
  firstName?: string;
  lastName?: string;
  contactId?: string;
}

export async function checkCfEnrollmentByEmail(email: string): Promise<CfContactInfo> {
  if (!CF_API_TOKEN || !CF_WORKSPACE_DOMAIN) {
    throw new Error("CF_API_TOKEN and CF_WORKSPACE_DOMAIN must be configured");
  }

  const baseUrl = `https://${CF_WORKSPACE_DOMAIN}/api/v2`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${CF_API_TOKEN}`,
    "Content-Type": "application/json",
  };

  // Step 1: Find the contact by email address
  const contactUrl = `${baseUrl}/contacts?filter[email_address]=${encodeURIComponent(email)}`;
  console.log("[CF API] Contacting:", contactUrl);
  const contactRes = await fetch(contactUrl, { headers });

  if (!contactRes.ok) {
    const body = await contactRes.text();
    console.error("[CF API] Contact lookup failed:", contactRes.status, body);
    console.error("[CF API] URL was:", contactUrl);
    console.error("[CF API] Domain used:", CF_WORKSPACE_DOMAIN);
    throw new Error(`CF API contact lookup failed: ${contactRes.status}`);
  }

  const contactData = await contactRes.json();
  // CF 2.0 wraps results in a top-level key that can vary
  const contacts: any[] =
    contactData.contacts ?? contactData.data ?? [];

  if (contacts.length === 0) {
    console.log(`[CF API] No contact found for email: ${email}`);
    return { enrolled: false };
  }

  const contact = contacts[0];
  const contactId = String(contact.id);
  const firstName: string | undefined = contact.first_name || undefined;
  const lastName: string | undefined = contact.last_name || undefined;

  // If no course filter is configured, any known contact is considered enrolled
  if (!CF_COURSE_ID) {
    return { enrolled: true, firstName, lastName, contactId };
  }

  // Step 2: Check for an active enrollment in the configured course
  const enrollRes = await fetch(
    `${baseUrl}/courses/${CF_COURSE_ID}/enrollments?filter[contact_id]=${contactId}`,
    { headers }
  );

  if (!enrollRes.ok) {
    const body = await enrollRes.text();
    console.error("[CF API] Enrollment lookup failed:", enrollRes.status, body);
    throw new Error(`CF API enrollment lookup failed: ${enrollRes.status}`);
  }

  const enrollData = await enrollRes.json();
  const enrollments: any[] =
    enrollData.course_enrollments ?? enrollData.enrollments ?? enrollData.data ?? [];

  // An enrollment counts as active when it isn't suspended or revoked
  const isEnrolled =
    enrollments.length > 0 &&
    enrollments.some(
      (e: any) => !e.suspended_at && !e.revoked_at && e.status !== "inactive"
    );

  console.log(
    `[CF API] ${email} → contact ${contactId}, enrollments: ${enrollments.length}, active: ${isEnrolled}`
  );

  return { enrolled: isEnrolled, firstName, lastName, contactId };
}

export { CF_WORKSPACE_DOMAIN, CF_COURSE_ID, CF_API_TOKEN };
