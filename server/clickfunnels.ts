import crypto from "crypto";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { sendAccessRestoredEmail, isEmailConfigured } from "./email";

// Strip any accidental protocol prefix and trailing slash.
const normalizeCfDomain = (value: string) => value
  .trim()
  .replace(/^https?:\/\//, "")
  .replace(/\/$/, "");
const CF_WORKSPACE_DOMAIN = normalizeCfDomain(process.env.CF_WORKSPACE_DOMAIN || "");
const CF_SSO_DOMAIN = normalizeCfDomain(
  process.env.CF_SSO_DOMAIN || process.env.CF_WORKSPACE_DOMAIN || "",
);
const CF_COURSE_ID = process.env.CF_COURSE_ID || "";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";
const CF_WEBHOOK_SECRET = process.env.CF_WEBHOOK_SECRET || "";
// Secrets copied from the ClickFunnels settings UI can include an invisible
// trailing newline. HMAC signing is byte-exact, so normalize surrounding
// whitespace before creating Customer Center SSO tokens.
const CF_SSO_JWT_SECRET = (process.env.CF_SSO_JWT_SECRET || "").trim();

export interface CfCommercialSnapshot {
  syncedAt: Date;
  orderCount: number;
  revenue: number;
  offers: Array<{ name: string; orders: number; revenue: number }>;
  attribution: Array<{ source: string; campaign: string; orders: number; revenue: number }>;
  orders: Array<{ id: string; contactId: string | null; offer: string; createdAt: string | null; amount: number; source: string | null; campaign: string | null }>;
}

const FIA_PRODUCT_RE = /fearless\s+influencer\s+academy/i;

// Read-only commercial reporting. This intentionally stays narrow: it never
// creates, updates, or cancels orders, subscriptions, products, or contacts.
export async function getCfCommercialSnapshot(memberContactIds?: Set<string>): Promise<CfCommercialSnapshot> {
  if (!CF_API_TOKEN || !CF_WORKSPACE_DOMAIN || !CF_WORKSPACE_ID) {
    throw new Error("CF_API_TOKEN, CF_WORKSPACE_DOMAIN, and CF_WORKSPACE_ID must be configured");
  }
  const headers = { Authorization: `Bearer ${CF_API_TOKEN}`, Accept: "application/json" };
  let nextUrl: string | null = `https://${CF_WORKSPACE_DOMAIN}/api/v2/workspaces/${CF_WORKSPACE_ID}/orders?sort_order=desc`;
  const orders: any[] = [];
  let pages = 0;
  while (nextUrl && pages < 100) {
    pages++;
    const response = await fetch(nextUrl, { headers });
    if (!response.ok) throw new Error(`ClickFunnels order sync failed: ${response.status}`);
    const body = await response.json();
    orders.push(...(Array.isArray(body) ? body : body.data || []));
    const link = response.headers.get("link") || "";
    nextUrl = link.match(/<([^>]+)>;\s*rel="next"/)?.[1] || null;
  }
  const recentCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const offerMap = new Map<string, { orders: number; revenue: number }>();
  const attributionMap = new Map<string, { source: string; campaign: string; orders: number; revenue: number }>();
  const orderDetails: Array<{ id: string; contactId: string | null; offer: string; createdAt: string | null; amount: number; source: string | null; campaign: string | null }> = [];
  let revenue = 0;
  for (const order of orders) {
    if (!order.created_at || new Date(order.created_at).getTime() < recentCutoff) continue;
    const contactId = order.contact_id ? String(order.contact_id) : order.contact?.id ? String(order.contact.id) : null;
    if (!contactId || (memberContactIds && !memberContactIds.has(contactId))) continue;
    const fiaItems = (order.line_items || []).filter((item: any) => FIA_PRODUCT_RE.test(String(item.original_product?.name || item.products_variant?.name || "")));
    for (const item of fiaItems) {
      const offer = String(item.original_product?.name || item.products_variant?.name);
      const amount = (Number(item.products_price?.amount || 0) || 0) * (Number(item.quantity || 1) || 1);
      revenue += amount;
      const offerEntry = offerMap.get(offer) || { orders: 0, revenue: 0 };
      offerEntry.orders++; offerEntry.revenue += amount; offerMap.set(offer, offerEntry);
      const visit = order.last_visit_with_utm || order.contact?.last_visit_with_utm || order.utm || {};
      const source = String(visit.utm_source || order.utm_source || "");
      const campaign = String(visit.utm_campaign || order.utm_campaign || "");
      orderDetails.push({ id: `${order.id || order.public_id}:${item.id || item.public_id}`, contactId, offer, createdAt: order.created_at || null, amount, source: source || null, campaign: campaign || null });
      if (source || campaign) {
        const key = `${source}|${campaign}`;
        const entry = attributionMap.get(key) || { source: source || "Direct / unknown", campaign: campaign || "No campaign", orders: 0, revenue: 0 };
        entry.orders++; entry.revenue += amount; attributionMap.set(key, entry);
      }
    }
  }
  return {
    syncedAt: new Date(),
    orderCount: orderDetails.length,
    revenue,
    offers: Array.from(offerMap, ([name, value]) => ({ name, ...value })).sort((a, b) => b.revenue - a.revenue),
    attribution: Array.from(attributionMap.values()).sort((a, b) => b.orders - a.orders),
    orders: orderDetails,
  };
}

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
  const secret = CF_SSO_JWT_SECRET;
  const domain = CF_SSO_DOMAIN;
  if (!secret || !domain) {
    throw new Error("CF_SSO_DOMAIN and CF_SSO_JWT_SECRET must be set");
  }

  const defaultRedirect = `https://${domain}/courses`;
  let safeRedirect = defaultRedirect;
  if (redirectTo) {
    const requestedRedirect = new URL(redirectTo);
    if (requestedRedirect.protocol !== "https:" || requestedRedirect.hostname !== domain) {
      throw new Error("ClickFunnels SSO redirect must use the configured workspace domain");
    }
    safeRedirect = requestedRedirect.toString();
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: `${email}:${domain}`,
    nbf: now,
    exp: now + 3600,
    iat: now,
    redirect_to: safeRedirect,
  };

  const token = jwt.sign(payload, secret, {
    algorithm: "HS256",
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
  eventId: string | null;
  occurredAt: Date;
  contactEmail: string | null;
  contactId: string | null;
  courseId: string | null;
  firstName: string | null;
  lastName: string | null;
}

export function parseCfWebhookEvent(body: any): CfWebhookEvent {
  const eventType: string = body.event_type || body.type || "";
  const data = body.data || body.subject || body || {};
  const rawEventId = body.event_id || body.webhook_event_id || body.event?.id || body.id;
  const eventId = rawEventId ? String(rawEventId) : null;
  const rawOccurredAt = body.occurred_at || body.event_at || body.timestamp || body.created_at || body.event?.occurred_at;
  const parsedOccurredAt = rawOccurredAt ? new Date(rawOccurredAt) : null;
  const occurredAt = parsedOccurredAt && !Number.isNaN(parsedOccurredAt.getTime())
    ? parsedOccurredAt
    : new Date();

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

  return { eventType, eventId, occurredAt, contactEmail, contactId, courseId, firstName, lastName };
}

// Grant or revoke CF access for a user identified by email
export async function handleCfEnrollmentEvent(
  event: CfWebhookEvent
): Promise<{ action: string; email: string | null }> {
  const { eventType, contactEmail, contactId, courseId, firstName, lastName } = event;

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
  const isSubscriptionEvent = ["subscription.cancelled", "subscription.churned"].includes(eventType);
  const isCourseEvent = [
    "courses/enrollment.created",
    "courses/enrollment.suspended",
    "courses/enrollment.deleted",
  ].includes(eventType);

  // Enrollment events must name the configured course. A missing course ID is
  // not enough evidence to grant or revoke access.
  if (isCourseEvent && (!CF_COURSE_ID || courseId !== CF_COURSE_ID)) {
    return { action: "ignored_unscoped_course_event", email: contactEmail };
  }

  const user = contactId
    ? await storage.getUserByCfContactId(contactId)
    : contactEmail
      ? await storage.getUserByEmail(contactEmail)
      : undefined;

  if (user?.cfMembershipEventAt && user.cfMembershipEventAt > event.occurredAt) {
    return { action: "ignored_stale_event", email: user.email || contactEmail };
  }

  if (isGrantEvent) {
    if (!contactEmail) return { action: "ignored_no_email", email: null };
    if (user) {
      const wasDisabled = user.isDisabled === true;
      const updatedUser = await storage.updateUserForCfMembershipEvent(user.id, {
        cfEnrolled: true,
        cfContactId: contactId || user.cfContactId,
        cfEnrolledAt: new Date(),
        cfRevokedAt: null,
        cfRevokedGraceUntil: null,
        cfGraceExpirySentAt: null, // reset so a new warning fires on any future revocation
        cfMembershipEventAt: event.occurredAt,
        cfMembershipEventId: event.eventId,
        // Re-enabling the account ensures previously revoked (and thus disabled)
        // members can log in again after their membership is reinstated in CF.
        isDisabled: false,
      }, event.occurredAt);
      if (!updatedUser) return { action: "ignored_stale_event", email: user.email || contactEmail };
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
      cfMembershipEventAt: event.occurredAt,
      cfMembershipEventId: event.eventId,
    });
    console.log(`[CF Webhook] Auto-provisioned account for new enrollee: ${contactEmail}`);
    return { action: "created", email: contactEmail };
  }

  if (isRevokeEvent) {
    // Subscription events are broader than course events. Confirm the current
    // enrollment against the configured course before allowing one to revoke
    // Toolkit access, so an unrelated cancellation cannot disable a member.
    if (isSubscriptionEvent) {
      if (!user) return { action: "no_local_user", email: contactEmail };
      if (!user.email && !contactEmail) return { action: "ignored_no_email", email: null };
      const verification = await checkCfEnrollmentByEmail(
        user.email || contactEmail!,
        contactId || user.cfContactId || undefined,
      );
      if (verification.enrolled) {
        return { action: "ignored_subscription_still_enrolled", email: user.email || contactEmail };
      }
    }
    if (user) {
      const updatedUser = await storage.updateUserForCfMembershipEvent(user.id, {
        cfEnrolled: false,
        cfRevokedAt: new Date(),
          cfRevokedGraceUntil: null,
          cfGraceExpirySentAt: null,
           cfMembershipEventAt: event.occurredAt,
           cfMembershipEventId: event.eventId,
          isDisabled: true,
       }, event.occurredAt);
        if (!updatedUser) return { action: "ignored_stale_event", email: user.email || contactEmail };
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

export { CF_WORKSPACE_DOMAIN, CF_SSO_DOMAIN, CF_COURSE_ID, CF_API_TOKEN, CF_WORKSPACE_ID };
