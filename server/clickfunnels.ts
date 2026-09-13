import crypto from "crypto";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { sendAccessRestoredEmail, isEmailConfigured } from "./email";
import { db } from "./db";
import { sql } from "drizzle-orm";

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

export interface CfRecurringRevenueSnapshot {
  syncedAt: Date;
  currency: string;
  current: {
    mrr: number;
    trialingCount: number;
    trialingMrr: number;
    atRiskCount: number;
    atRiskMrr: number;
    activeSubscriptions: number;
    activeSubscribers: number;
  };
  month: {
    label: string;
    collected: number;
    expected: number;
    projected: number;
  };
  history: Array<{ month: string; label: string; mrr: number; cashCollected: number }>;
  performance: {
    periodLabel: string;
    effectiveChurnRate: number;
    grossMrrChurnRate: number;
    netMrrRetention: number;
    newMrr: number;
    churnedMrr: number;
  };
  offers: Array<{
    name: string;
    activeSubscriptions: number;
    mrr: number;
    newMrr: number;
    churnedMrr: number;
    effectiveChurnRate: number | null;
    cancellationRate: number | null;
    confidence: string;
  }>;
  details: {
    trialing: CfRecurringRevenueContact[];
    atRisk: CfRecurringRevenueContact[];
  };
  methodology: string;
}

export interface CfRecurringRevenueContact {
  id: string;
  name: string;
  email: string | null;
  offers: string[];
  mrr: number;
  billingStatus: string;
  relevantDate: string | null;
  contactUrl: string | null;
}

const CF_REPORT_PAGE_LIMIT = 100;
const AT_RISK_BILLING_STATUSES = new Set([
  "past_due",
  "past-due",
  "unpaid",
  "failed",
  "payment_failed",
  "payment-failed",
  "requires_action",
  "requires-action",
]);

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function asDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function firstDate(...values: unknown[]): Date | null {
  return values
    .map(asDate)
    .filter((value): value is Date => value !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0] || null;
}

function recurringItemValues(order: any): Array<{ name: string; amount: number; mrr: number; currency: string }> {
  return (Array.isArray(order.line_items) ? order.line_items : []).flatMap((item: any) => {
    const price = item.products_price || {};
    const amount = Number(price.amount);
    const intervalCount = Math.max(1, Number(price.interval_count) || 1);
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const interval = String(price.interval || "").toLowerCase();
    if (!Number.isFinite(amount) || amount < 0 || !interval) return [];
    const fullCharge = amount * quantity;
    let mrr = fullCharge;
    if (interval.startsWith("year")) mrr = fullCharge / (12 * intervalCount);
    else if (interval.startsWith("month")) mrr = fullCharge / intervalCount;
    else if (interval.startsWith("week")) mrr = fullCharge * 52 / (12 * intervalCount);
    else if (interval.startsWith("day")) mrr = fullCharge * 365.25 / (12 * intervalCount);
    else return [];
    return [{
      name: String(item.original_product?.name || item.products_variant?.name || "Unnamed offer"),
      amount: fullCharge,
      mrr,
      currency: String(price.currency || order.currency || "usd").toUpperCase(),
    }];
  });
}

async function fetchCfPages(url: string, headers: Record<string, string>, label: string): Promise<any[]> {
  const rows: any[] = [];
  const visited = new Set<string>();
  let nextUrl: string | null = url;
  let page = 0;
  while (nextUrl) {
    if (page >= CF_REPORT_PAGE_LIMIT) throw new Error(`${label} exceeded ${CF_REPORT_PAGE_LIMIT} pages`);
    if (visited.has(nextUrl)) throw new Error(`${label} returned a repeated next URL`);
    visited.add(nextUrl);
    page++;
    const response: Response = await fetch(nextUrl, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`${label} failed: ${response.status}`);
    const body = await response.json();
    rows.push(...(Array.isArray(body) ? body : body.data || []));
    const link: string = response.headers.get("link") || "";
    const nextMatch: RegExpMatchArray | null = link.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = nextMatch?.[1] || null;
  }
  return rows;
}

function isOrderActiveAt(order: any, instant: Date): boolean {
  const startedAt = firstDate(order.activated_at, order.created_at);
  const endedAt = firstDate(order.churned_at, order.canceled_at);
  const trialEndsAt = asDate(order.trial_end_at);
  return (
    !!startedAt &&
    startedAt <= instant &&
    (!endedAt || endedAt > instant) &&
    (!trialEndsAt || trialEndsAt <= instant)
  );
}

// Read-only subscription reporting built from ClickFunnels orders and invoices.
async function buildCfRecurringRevenueSnapshot(): Promise<CfRecurringRevenueSnapshot> {
  if (!CF_API_TOKEN || !CF_WORKSPACE_DOMAIN || !CF_WORKSPACE_ID) {
    throw new Error("CF_API_TOKEN, CF_WORKSPACE_DOMAIN, and CF_WORKSPACE_ID must be configured");
  }
  const headers = { Authorization: `Bearer ${CF_API_TOKEN}`, Accept: "application/json" };
  const apiBase = `https://${CF_WORKSPACE_DOMAIN}/api/v2`;
  const allOrders = await fetchCfPages(
    `${apiBase}/workspaces/${CF_WORKSPACE_ID}/orders?sort_order=desc&per=100`,
    headers,
    "ClickFunnels order sync",
  );
  const subscriptionOrders = allOrders.filter((order) =>
    order.order_type === "subscription-order" && recurringItemValues(order).length > 0
  );

  const invoices: any[] = [];
  let invoiceCursor = 0;
  const workerCount = Math.min(8, subscriptionOrders.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (invoiceCursor < subscriptionOrders.length) {
      const order = subscriptionOrders[invoiceCursor++];
      const orderInvoices = await fetchCfPages(
        `${apiBase}/orders/${order.id}/invoices?per=100`,
        headers,
        `ClickFunnels invoices for order ${order.id}`,
      );
      invoices.push(...orderInvoices);
    }
  }));

  const currencyCounts = new Map<string, number>();
  for (const order of subscriptionOrders) {
    for (const item of recurringItemValues(order)) {
      currencyCounts.set(item.currency, (currencyCounts.get(item.currency) || 0) + 1);
    }
  }
  const currency = [...currencyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "USD";
  const orders = subscriptionOrders.filter((order) =>
    recurringItemValues(order).some((item) => item.currency === currency)
  );

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = new Date(nextMonthStart.getTime() - 1);
  const periodLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(now);
  const getValues = (order: any) => recurringItemValues(order).filter((item) => item.currency === currency);
  const orderMrr = (order: any) => getValues(order).reduce((sum, item) => sum + item.mrr, 0);
  const orderCharge = (order: any) => getValues(order).reduce((sum, item) => sum + item.amount, 0);
  const activeOrders = orders.filter((order) => {
    const endedAt = firstDate(order.churned_at, order.canceled_at);
    return order.service_status === "active" && (!endedAt || endedAt > now);
  });
  const payingOrders = activeOrders.filter((order) => !order.in_trial);
  const trialingOrders = activeOrders.filter((order) => !!order.in_trial);
  const atRiskOrders = payingOrders.filter((order) =>
    AT_RISK_BILLING_STATUSES.has(String(order.billing_status || "").toLowerCase())
  );

  const paidInvoices = invoices.filter((invoice) =>
    String(invoice.currency || "usd").toUpperCase() === currency &&
    String(invoice.status || "").toLowerCase() === "paid" &&
    asDate(invoice.paid_at)
  );
  const collected = paidInvoices.reduce((sum, invoice) => {
    const paidAt = asDate(invoice.paid_at)!;
    return paidAt >= monthStart && paidAt < nextMonthStart
      ? sum + (Number(invoice.total_amount) || 0)
      : sum;
  }, 0);
  const expected = payingOrders.reduce((sum, order) => {
    const chargeAt = firstDate(order.next_charge_at, order.renewal_at);
    return chargeAt && chargeAt > now && chargeAt < nextMonthStart
      ? sum + orderCharge(order)
      : sum;
  }, 0);

  const history = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
    const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    const end = new Date(next.getTime() - 1);
    const mrr = orders
      .filter((order) => isOrderActiveAt(order, end))
      .reduce((sum, order) => sum + orderMrr(order), 0);
    const cashCollected = paidInvoices.reduce((sum, invoice) => {
      const paidAt = asDate(invoice.paid_at)!;
      return paidAt >= date && paidAt < next ? sum + (Number(invoice.total_amount) || 0) : sum;
    }, 0);
    return {
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" }).format(date),
      mrr: roundMoney(mrr),
      cashCollected: roundMoney(cashCollected),
    };
  });

  const activeAtMonthStart = orders.filter((order) => isOrderActiveAt(order, monthStart));
  const startingMrr = activeAtMonthStart.reduce((sum, order) => sum + orderMrr(order), 0);
  const endedThisMonth = activeAtMonthStart.filter((order) => {
    const endedAt = firstDate(order.churned_at, order.canceled_at);
    return endedAt && endedAt >= monthStart && endedAt < nextMonthStart;
  });
  const newThisMonth = orders.filter((order) => {
    const revenueStart = asDate(order.trial_end_at) || firstDate(order.activated_at, order.created_at);
    return !order.in_trial && revenueStart && revenueStart >= monthStart && revenueStart < nextMonthStart;
  });
  const churnedMrr = endedThisMonth.reduce((sum, order) => sum + orderMrr(order), 0);
  const newMrr = newThisMonth.reduce((sum, order) => sum + orderMrr(order), 0);

  const offerNames = new Set(orders.flatMap((order) => getValues(order).map((item) => item.name)));
  const offers = [...offerNames].map((name) => {
    const containsOffer = (order: any) => getValues(order).some((item) => item.name === name);
    const mrrForOffer = (order: any) =>
      getValues(order).filter((item) => item.name === name).reduce((sum, item) => sum + item.mrr, 0);
    const starting = activeAtMonthStart.filter(containsOffer);
    const active = activeOrders.filter(containsOffer);
    const ended = endedThisMonth.filter(containsOffer);
    const added = newThisMonth.filter(containsOffer);
    const cancellations = ended.filter((order) => !!order.canceled_at);
    return {
      name,
      activeSubscriptions: active.length,
      mrr: roundMoney(active.filter((order) => !order.in_trial).reduce((sum, order) => sum + mrrForOffer(order), 0)),
      newMrr: roundMoney(added.reduce((sum, order) => sum + mrrForOffer(order), 0)),
      churnedMrr: roundMoney(ended.reduce((sum, order) => sum + mrrForOffer(order), 0)),
      effectiveChurnRate: starting.length ? roundMoney(ended.length / starting.length * 100) : null,
      cancellationRate: starting.length ? roundMoney(cancellations.length / starting.length * 100) : null,
      confidence: "Order + invoice",
    };
  }).sort((a, b) => b.mrr - a.mrr || b.activeSubscriptions - a.activeSubscriptions);

  const contactDetails = (
    sourceOrders: any[],
    relevantDateFor: (order: any) => Date | null,
  ): CfRecurringRevenueContact[] => {
    const contacts = new Map<string, CfRecurringRevenueContact>();
    for (const order of sourceOrders) {
      const contact = order.contact || {};
      const contactId = String(order.contact_id || contact.id || order.id);
      const existing = contacts.get(contactId);
      const itemNames = getValues(order).map((item) => item.name);
      const firstName = String(contact.first_name || "").trim();
      const lastName = String(contact.last_name || "").trim();
      const displayName = [firstName, lastName].filter(Boolean).join(" ")
        || String(contact.email_address || "").trim()
        || "Unnamed contact";
      const publicId = String(contact.public_id || "").trim();
      const relevantDate = relevantDateFor(order);
      if (existing) {
        existing.mrr = roundMoney(existing.mrr + orderMrr(order));
        existing.offers = [...new Set([...existing.offers, ...itemNames])];
        if (!existing.relevantDate && relevantDate) existing.relevantDate = relevantDate.toISOString();
        continue;
      }
      contacts.set(contactId, {
        id: contactId,
        name: displayName,
        email: contact.email_address ? String(contact.email_address) : null,
        offers: [...new Set(itemNames)],
        mrr: roundMoney(orderMrr(order)),
        billingStatus: String(order.billing_status || "unknown").replace(/[-_]/g, " "),
        relevantDate: relevantDate?.toISOString() || null,
        contactUrl: publicId ? `https://${CF_WORKSPACE_DOMAIN}/contacts/${encodeURIComponent(publicId)}` : null,
      });
    }
    return [...contacts.values()].sort((a, b) => a.name.localeCompare(b.name));
  };
  const trialingDetails = contactDetails(trialingOrders, (order) => asDate(order.trial_end_at));
  const atRiskDetails = contactDetails(atRiskOrders, (order) =>
    firstDate(order.paid_until, order.renewal_at, order.next_charge_at)
  );

  return {
    syncedAt: now,
    currency,
    current: {
      mrr: roundMoney(payingOrders.reduce((sum, order) => sum + orderMrr(order), 0)),
      trialingCount: trialingDetails.length,
      trialingMrr: roundMoney(trialingOrders.reduce((sum, order) => sum + orderMrr(order), 0)),
      atRiskCount: atRiskDetails.length,
      atRiskMrr: roundMoney(atRiskOrders.reduce((sum, order) => sum + orderMrr(order), 0)),
      activeSubscriptions: activeOrders.length,
      activeSubscribers: new Set(activeOrders.map((order) => String(order.contact_id || order.contact?.id || "")).filter(Boolean)).size,
    },
    month: {
      label: periodLabel,
      collected: roundMoney(collected),
      expected: roundMoney(expected),
      projected: roundMoney(collected + expected),
    },
    history,
    performance: {
      periodLabel,
      effectiveChurnRate: activeAtMonthStart.length ? roundMoney(endedThisMonth.length / activeAtMonthStart.length * 100) : 0,
      grossMrrChurnRate: startingMrr ? roundMoney(churnedMrr / startingMrr * 100) : 0,
      netMrrRetention: startingMrr ? roundMoney(Math.max(0, startingMrr - churnedMrr) / startingMrr * 100) : 100,
      newMrr: roundMoney(newMrr),
      churnedMrr: roundMoney(churnedMrr),
    },
    offers,
    details: {
      trialing: trialingDetails,
      atRisk: atRiskDetails,
    },
    methodology: `MRR normalizes current recurring order prices to a monthly run-rate, so historical MRR is an estimate when a subscription changed price. Cash uses invoices currently marked paid; refunded and partially refunded invoices are excluded. Churn compares subscriptions active at the start of the month. Reporting is limited to ${currency}; no one-time orders are included.`,
  };
}

let recurringRevenueCache: { snapshot: CfRecurringRevenueSnapshot; expiresAt: number } | null = null;
let recurringRevenueInFlight: Promise<CfRecurringRevenueSnapshot> | null = null;
const RECURRING_REVENUE_CACHE_MS = 15 * 60 * 1000;
let recurringRevenueSchedulerStarted = false;
let recurringRevenuePersistentLoad: Promise<void> | null = null;

function loadPersistentRecurringRevenueCache(): Promise<void> {
  if (recurringRevenuePersistentLoad) return recurringRevenuePersistentLoad;
  recurringRevenuePersistentLoad = (async () => {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS cf_recurring_revenue_cache (
          cache_key TEXT PRIMARY KEY,
          snapshot JSONB NOT NULL,
          refreshed_at TIMESTAMPTZ NOT NULL
        )
      `);
      const result = await db.execute(sql`
        SELECT snapshot, refreshed_at
        FROM cf_recurring_revenue_cache
        WHERE cache_key = 'workspace'
        LIMIT 1
      `);
      const row = (result as any).rows?.[0];
      const snapshot = row?.snapshot as CfRecurringRevenueSnapshot | undefined;
      if (
        snapshot?.current &&
        Array.isArray(snapshot.history) &&
        Array.isArray(snapshot.details?.trialing) &&
        Array.isArray(snapshot.details?.atRisk)
      ) {
        recurringRevenueCache = {
          snapshot: { ...snapshot, syncedAt: new Date(snapshot.syncedAt) },
          // Treat persisted data as immediately available but stale so startup
          // refreshes it without making an admin wait.
          expiresAt: 0,
        };
        console.log("[CF Recurring Revenue] restored cached snapshot from PostgreSQL");
      }
    } catch (error: any) {
      console.error("[CF Recurring Revenue] could not restore persistent cache:", error?.message || error);
    }
  })();
  return recurringRevenuePersistentLoad;
}

async function persistRecurringRevenueCache(snapshot: CfRecurringRevenueSnapshot): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO cf_recurring_revenue_cache (cache_key, snapshot, refreshed_at)
      VALUES ('workspace', ${JSON.stringify(snapshot)}::jsonb, NOW())
      ON CONFLICT (cache_key) DO UPDATE SET
        snapshot = EXCLUDED.snapshot,
        refreshed_at = EXCLUDED.refreshed_at
    `);
  } catch (error: any) {
    console.error("[CF Recurring Revenue] could not persist cache:", error?.message || error);
  }
}

async function refreshCfRecurringRevenueSnapshot(): Promise<CfRecurringRevenueSnapshot> {
  if (recurringRevenueInFlight) return recurringRevenueInFlight;

  recurringRevenueInFlight = buildCfRecurringRevenueSnapshot()
    .then((snapshot) => {
      recurringRevenueCache = { snapshot, expiresAt: Date.now() + RECURRING_REVENUE_CACHE_MS };
      void persistRecurringRevenueCache(snapshot);
      return snapshot;
    })
    .finally(() => {
      recurringRevenueInFlight = null;
    });
  return recurringRevenueInFlight;
}

export async function getCfRecurringRevenueSnapshot(): Promise<CfRecurringRevenueSnapshot> {
  await loadPersistentRecurringRevenueCache();
  if (recurringRevenueCache) {
    if (recurringRevenueCache.expiresAt <= Date.now()) {
      void refreshCfRecurringRevenueSnapshot().catch((error) => {
        console.error("[CF Recurring Revenue] Background refresh failed; serving cached snapshot:", error?.message || error);
      });
    }
    return recurringRevenueCache.snapshot;
  }
  return refreshCfRecurringRevenueSnapshot();
}

export function startCfRecurringRevenueScheduler(): void {
  if (recurringRevenueSchedulerStarted) return;
  recurringRevenueSchedulerStarted = true;
  console.log("[CF Recurring Revenue] background cache starting (refreshes every 15 minutes)");

  const refresh = () => {
    const startedAt = Date.now();
    void refreshCfRecurringRevenueSnapshot()
      .then((snapshot) => {
        console.log(`[CF Recurring Revenue] cache refreshed in ${Date.now() - startedAt}ms (${snapshot.current.activeSubscriptions} active subscriptions)`);
      })
      .catch((error) => {
        console.error("[CF Recurring Revenue] cache refresh failed:", error?.message || error);
      });
  };

  void loadPersistentRecurringRevenueCache().finally(refresh);
  setInterval(refresh, RECURRING_REVENUE_CACHE_MS).unref();
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

  const defaultRedirect = `https://${domain}/customer-center`;
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

  const dataIdIsContactId =
    eventType.startsWith("contact.") ||
    eventType.startsWith("contacts/");
  const contactId: string | null =
    String(
      data.contact_id ||
        data.contact?.id ||
        (dataIdIsContactId ? data.id : "") ||
        ""
    ) || null;

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
  const visitedUrls = new Set<string>();

  while (nextUrl) {
    if (page >= 100) {
      throw new Error("CF API enrollment pagination exceeded 100 pages");
    }
    if (visitedUrls.has(nextUrl)) {
      throw new Error("CF API enrollment pagination returned a repeated next URL");
    }
    visitedUrls.add(nextUrl);
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
    const enrollment = data.find((candidate: any) => {
      const returnedContactId = candidate?.contact_id ?? candidate?.contact?.id;
      return returnedContactId != null && String(returnedContactId) === knownContactId;
    });
    if (!enrollment) {
      console.warn(`[CF API] Enrollment response did not contain contact ${knownContactId}`);
      return { enrolled: false, contactId: knownContactId };
    }
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
  const visitedUrls = new Set<string>();

  while (nextUrl) {
    if (page >= 100) {
      throw new Error("CF API enrollment import exceeded 100 pages");
    }
    if (visitedUrls.has(nextUrl)) {
      throw new Error("CF API enrollment import returned a repeated next URL");
    }
    visitedUrls.add(nextUrl);
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
