import crypto from "crypto";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { sendAccessRestoredEmail, isEmailConfigured } from "./email";

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
  firstName: string | null;
  lastName: string | null;
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

  const firstName: string | null =
    data.first_name || data.contact?.first_name || null;

  const lastName: string | null =
    data.last_name || data.contact?.last_name || null;

  return { eventType, contactEmail, contactId, courseId, firstName, lastName };
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

  // Only explicit course enrollment events qualify as grants.
  // contact.identified / contact.created do not prove course enrollment and
  // may arrive without a courseId, which would bypass the courseMatches check.
  const isGrantEvent = eventType === "courses/enrollment.created";

  const isRevokeEvent = [
    "courses/enrollment.suspended",
    "courses/enrollment.deleted",
    "subscription.cancelled",
    "subscription.churned",
  ].includes(eventType);

  if (isGrantEvent && courseMatches) {
    if (user) {
      const wasDisabled = user.isDisabled === true;
      await storage.updateUser(user.id, {
        cfEnrolled: true,
        cfContactId: contactId || user.cfContactId,
        cfEnrolledAt: new Date(),
        cfRevokedAt: null,
        cfRevokedGraceUntil: null,
        cfGraceExpirySentAt: null, // reset so a new warning fires on any future revocation
        // Re-enabling the account ensures previously revoked (and thus disabled)
        // members can log in again after their membership is reinstated in CF.
        isDisabled: false,
      });
      // Notify the member that their access has been fully restored so they
      // know they can log in again without waiting for the next hourly sweep.
      if (wasDisabled && isEmailConfigured()) {
        const loginUrl = generateCfSsoUrl(contactEmail);
        sendAccessRestoredEmail({
          email: contactEmail,
          firstName: event.firstName,
          loginUrl,
        }).catch(err =>
          console.error(`[CF Webhook] Failed to send access-restored email to ${contactEmail}:`, err)
        );
        console.log(`[CF Webhook] Queued access-restored email for previously disabled member: ${contactEmail}`);
      }
      return { action: "granted", email: contactEmail };
    }
    // No local account yet — auto-provision one so the member appears in the
    // Users tab immediately, even before they click the login link for the first time.
    const displayName = [firstName, lastName].filter(Boolean).join(" ") || contactEmail.split("@")[0];
    const newUser = await storage.createUser({
      email: contactEmail,
      displayName,
      firstName: firstName || "",
      lastName: lastName || "",
    });
    await storage.updateUser(newUser.id, {
      cfEnrolled: true,
      cfContactId: contactId,
      cfEnrolledAt: new Date(),
    });
    console.log(`[CF Webhook] Auto-provisioned account for new enrollee: ${contactEmail}`);
    return { action: "created", email: contactEmail };
  }

  if (isRevokeEvent) {
    if (user) {
      await storage.updateUser(user.id, {
        cfEnrolled: false,
        cfRevokedAt: new Date(),
          cfRevokedGraceUntil: null,
          cfGraceExpirySentAt: null,
          isDisabled: true,
      });
        console.log(`[CF Webhook] Revoked access immediately for: ${contactEmail}`);
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

// Paginate through course enrollments searching for a matching email address.
// Returns the enrollment record and contact info when found, or null if not found.
async function findEnrollmentByEmail(
  baseUrl: string,
  headers: Record<string, string>,
  courseId: string,
  email: string
): Promise<{ enrollment: any; contact: any } | null> {
  const normalizedEmail = email.toLowerCase();
  let nextUrl: string | null =
    `${baseUrl}/courses/${courseId}/enrollments?per=20`;
  let page = 0;

  while (nextUrl) {
    page++;
    console.log(`[CF API] Paginating enrollments page ${page}:`, nextUrl);
    const r: Response = await fetch(nextUrl, { headers });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`CF API enrollments page failed: ${r.status} ${body.slice(0, 100)}`);
    }

    const enrollments: any[] = await r.json();
    const match = enrollments.find(
      (e: any) =>
        e.contact?.email_address?.toLowerCase() === normalizedEmail
    );
    if (match) {
      return { enrollment: match, contact: match.contact };
    }

    // Follow the Link: rel="next" header for the next page
    const linkHeader: string = r.headers.get("link") || "";
    const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = nextMatch ? nextMatch[1] : null;
  }

  return null;
}

// Check active enrollment status from an enrollment record
function isEnrollmentActive(enrollment: any): boolean {
  return !enrollment.suspended && !enrollment.suspended_at;
}

export async function checkCfEnrollmentByEmail(
  email: string,
  knownContactId?: string
): Promise<CfContactInfo> {
  if (!CF_API_TOKEN || !CF_WORKSPACE_DOMAIN) {
    throw new Error("CF_API_TOKEN and CF_WORKSPACE_DOMAIN must be configured");
  }

  const baseUrl = `https://${CF_WORKSPACE_DOMAIN}/api/v2`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${CF_API_TOKEN}`,
    Accept: "application/json",
  };

  // --- Fast path: we already know the CF contact ID (stored from a previous webhook) ---
  if (knownContactId && CF_COURSE_ID) {
    console.log(`[CF API] Fast path — checking enrollment for contact ${knownContactId}`);
    const r = await fetch(
      `${baseUrl}/courses/${CF_COURSE_ID}/enrollments?filter[contact_id]=${knownContactId}`,
      { headers }
    );
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`CF API enrollment check failed: ${r.status} ${body.slice(0, 100)}`);
    }
    const data: any[] = await r.json();
    if (data.length === 0) {
      console.log(`[CF API] No enrollment for contact ${knownContactId}`);
      return { enrolled: false, contactId: knownContactId };
    }
    const enrollment = data[0];
    const contact = enrollment.contact ?? {};
    const active = isEnrollmentActive(enrollment);
    console.log(`[CF API] Fast path result — contact ${knownContactId}, active: ${active}`);
    return {
      enrolled: active,
      firstName: contact.first_name || undefined,
      lastName: contact.last_name || undefined,
      contactId: knownContactId,
    };
  }

  // --- Slow path: no contact ID — paginate enrollments and match by email ---
  if (!CF_COURSE_ID) {
    // No course configured — can't verify enrollment
    throw new Error("CF_COURSE_ID must be configured to verify enrollment");
  }

  console.log(`[CF API] Slow path — scanning enrollments for ${email}`);
  const found = await findEnrollmentByEmail(baseUrl, headers, CF_COURSE_ID, email);

  if (!found) {
    console.log(`[CF API] No enrollment found for ${email} after full scan`);
    return { enrolled: false };
  }

  const { enrollment, contact } = found;
  const active = isEnrollmentActive(enrollment);
  const contactId = contact?.id ? String(contact.id) : undefined;

  console.log(
    `[CF API] Slow path result — ${email} → contact ${contactId}, active: ${active}`
  );

  return {
    enrolled: active,
    firstName: contact?.first_name || undefined,
    lastName: contact?.last_name || undefined,
    contactId,
  };
}

// ── CF API: Write a token into a contact's custom field ─────────────────────
// The custom field slug must already exist in CF (e.g. "atk_token").
// CF REST API: PUT /contacts/:id  with { contact: { custom_attributes: { slug: value } } }
export async function writeCfContactToken(
  contactId: string,
  token: string
): Promise<void> {
  if (!CF_API_TOKEN || !CF_WORKSPACE_DOMAIN) {
    throw new Error("CF_API_TOKEN and CF_WORKSPACE_DOMAIN must be configured");
  }
  const url = `https://${CF_WORKSPACE_DOMAIN}/api/v2/contacts/${contactId}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      contact: {
        custom_attributes: {
          atk_token: token,
        },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`CF write token failed: ${res.status} ${body.slice(0, 200)}`);
  }
}

// ── CF API: Get all enrolled contacts with a known CF contact ID ─────────────
export async function getEnrolledContactIds(): Promise<Array<{ userId: string; email: string; contactId: string }>> {
  return storage.getEnrolledUsersWithContactId();
}

// ── CF API: Fetch every enrollment in the course (all pages) ─────────────────
export interface CfEnrollmentRecord {
  contactId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  active: boolean;
}

export async function getAllCfEnrollments(): Promise<CfEnrollmentRecord[]> {
  if (!CF_API_TOKEN || !CF_WORKSPACE_DOMAIN || !CF_COURSE_ID) {
    throw new Error("CF_API_TOKEN, CF_WORKSPACE_DOMAIN, and CF_COURSE_ID must be configured");
  }

  const baseUrl = `https://${CF_WORKSPACE_DOMAIN}/api/v2`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${CF_API_TOKEN}`,
    Accept: "application/json",
  };

  const results: CfEnrollmentRecord[] = [];
  let nextUrl: string | null = `${baseUrl}/courses/${CF_COURSE_ID}/enrollments?per=20`;
  let page = 0;

  while (nextUrl) {
    page++;
    console.log(`[CF Import] Fetching enrollments page ${page}:`, nextUrl);
    const r = await fetch(nextUrl, { headers });
    if (!r.ok) {
      const body = await r.text();
      throw new Error(`CF API enrollments page ${page} failed: ${r.status} ${body.slice(0, 120)}`);
    }

    const enrollments: any[] = await r.json();
    for (const e of enrollments) {
      const contact = e.contact ?? {};
      const contactId = contact.id ? String(contact.id) : null;
      const email = contact.email_address?.toLowerCase()?.trim() || null;
      if (!contactId || !email) continue;
      results.push({
        contactId,
        email,
        firstName: contact.first_name || undefined,
        lastName: contact.last_name || undefined,
        active: isEnrollmentActive(e),
      });
    }

    const linkHeader: string = r.headers.get("link") || "";
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = nextMatch ? nextMatch[1] : null;
  }

  console.log(`[CF Import] Total enrollments fetched: ${results.length} across ${page} pages`);
  return results;
}

// Numeric workspace ID — required for the downloads endpoint. If not set, the
// picker will attempt to discover it from the course record (may not work for
// all account types).
const CF_WORKSPACE_ID = process.env.CF_WORKSPACE_ID || "";

export { CF_WORKSPACE_DOMAIN, CF_COURSE_ID, CF_API_TOKEN, CF_WORKSPACE_ID };
