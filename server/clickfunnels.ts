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
    Accept: "application/json",
  };
  const enc = encodeURIComponent(email);

  // --- Strategy 1: Direct enrollment lookup by email on the course enrollments endpoint ---
  // CF 2.0 /courses/{id}/enrollments is a confirmed-existing route (returns 401 without auth).
  // Try filtering by email directly to skip needing a contact ID.
  if (CF_COURSE_ID) {
    const enrollmentEmailUrls = [
      `${baseUrl}/courses/${CF_COURSE_ID}/enrollments?filter[contact][email_address]=${enc}`,
      `${baseUrl}/courses/${CF_COURSE_ID}/enrollments?filter[email_address]=${enc}`,
      `${baseUrl}/courses/${CF_COURSE_ID}/enrollments?filter[email]=${enc}`,
    ];

    for (const url of enrollmentEmailUrls) {
      console.log("[CF API] Trying enrollment-by-email:", url);
      const r = await fetch(url, { headers });
      console.log("[CF API] Status:", r.status);

      if (r.ok) {
        const data = await r.json();
        const enrollments: any[] =
          data.course_enrollments ?? data.enrollments ?? data.data ?? [];
        console.log(`[CF API] Enrollment-by-email got ${enrollments.length} results`);

        if (enrollments.length > 0) {
          const active = enrollments.some(
            (e: any) => !e.suspended_at && !e.revoked_at && e.status !== "inactive"
          );
          const contact = enrollments[0]?.contact ?? enrollments[0]?.student ?? {};
          const firstName: string | undefined = contact.first_name || undefined;
          const lastName: string | undefined = contact.last_name || undefined;
          const contactId: string | undefined = contact.id ? String(contact.id) : undefined;
          console.log(`[CF API] Strategy 1 result — email: ${email}, enrolled: ${active}`);
          return { enrolled: active, firstName, lastName, contactId };
        }

        // Empty list means not enrolled in this course
        console.log(`[CF API] Strategy 1: no enrollment found for ${email}`);
        return { enrolled: false };
      }

      if (r.status !== 404) {
        // Non-404 failure (401, 500, etc.) — break out and let caller handle
        const body = await r.text();
        console.error("[CF API] Enrollment-by-email error:", r.status, body.slice(0, 200));
        throw new Error(`CF API enrollment lookup failed: ${r.status}`);
      }
      // 404 = this filter format not supported, try next
    }
  }

  // --- Strategy 2: Look up contact by email, then check enrollment ---
  // The /contacts route does not exist at this workspace URL, so we try /users instead
  // (CF 2.0 /users returns 401 without auth, meaning the route exists).
  const contactLookupUrls = [
    `${baseUrl}/users?filter[email_address]=${enc}`,
    `${baseUrl}/users?filter[email]=${enc}`,
    // Legacy fallback — included in case a future workspace exposes contacts here
    `${baseUrl}/contacts?filter[email_address]=${enc}`,
  ];

  let contactId: string | undefined;
  let firstName: string | undefined;
  let lastName: string | undefined;
  let foundContact = false;

  for (const url of contactLookupUrls) {
    console.log("[CF API] Trying contact lookup:", url);
    const r = await fetch(url, { headers });
    console.log("[CF API] Status:", r.status);

    if (r.ok) {
      const data = await r.json();
      const items: any[] = data.users ?? data.contacts ?? data.data ?? [];
      if (items.length > 0) {
        const c = items[0];
        contactId = String(c.id);
        firstName = c.first_name || undefined;
        lastName = c.last_name || undefined;
        foundContact = true;
        console.log(`[CF API] Found contact id=${contactId} via ${url}`);
      } else {
        console.log(`[CF API] No contact found for ${email} via ${url}`);
        return { enrolled: false };
      }
      break;
    }

    if (r.status !== 404) {
      const body = await r.text();
      console.error("[CF API] Contact lookup error:", r.status, body.slice(0, 200));
      throw new Error(`CF API contact lookup failed: ${r.status}`);
    }
  }

  if (!foundContact || !contactId) {
    console.error("[CF API] All contact lookup strategies failed for", email);
    throw new Error("CF API contact lookup failed: no supported route found");
  }

  // If no course filter, any known contact is considered enrolled
  if (!CF_COURSE_ID) {
    return { enrolled: true, firstName, lastName, contactId };
  }

  // Step 2: Check enrollment by contact ID
  const enrollRes = await fetch(
    `${baseUrl}/courses/${CF_COURSE_ID}/enrollments?filter[contact_id]=${contactId}`,
    { headers }
  );

  if (!enrollRes.ok) {
    const body = await enrollRes.text();
    console.error("[CF API] Enrollment lookup failed:", enrollRes.status, body.slice(0, 200));
    throw new Error(`CF API enrollment lookup failed: ${enrollRes.status}`);
  }

  const enrollData = await enrollRes.json();
  const enrollments: any[] =
    enrollData.course_enrollments ?? enrollData.enrollments ?? enrollData.data ?? [];

  const isEnrolled =
    enrollments.length > 0 &&
    enrollments.some(
      (e: any) => !e.suspended_at && !e.revoked_at && e.status !== "inactive"
    );

  console.log(
    `[CF API] Strategy 2 result — ${email} → contact ${contactId}, enrollments: ${enrollments.length}, active: ${isEnrolled}`
  );

  return { enrolled: isEnrolled, firstName, lastName, contactId };
}

export { CF_WORKSPACE_DOMAIN, CF_COURSE_ID, CF_API_TOKEN };
