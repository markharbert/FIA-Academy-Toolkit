import { google } from "googleapis";

const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

export function getGmailOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appBaseUrl = process.env.APP_BASE_URL || "https://toolkit.fearlessmarketinglab.com";
  const redirectUri = `${appBaseUrl}/api/inbox-analyzer/seed-inboxes/callback/gmail`;

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getGmailAuthUrl(inboxId: string): string {
  const oAuth2Client = getGmailOAuthClient();
  return oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: GMAIL_SCOPES,
    prompt: "consent",
    state: inboxId,
  });
}

export async function exchangeGmailCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiry: Date | null;
  email: string;
}> {
  const oAuth2Client = getGmailOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);

  oAuth2Client.setCredentials(tokens);

  const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress || "";

  return {
    accessToken: tokens.access_token || "",
    refreshToken: tokens.refresh_token || null,
    expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    email,
  };
}

export type PlacementStatus =
  | "primary"
  | "promotions"
  | "social"
  | "updates"
  | "forums"
  | "spam"
  | "not_found"
  | "error"
  | "not_connected";

export type PlacementResult = {
  inboxId: string;
  label: string;
  email: string;
  provider: string;
  status: PlacementStatus;
  checkedAt: string;
};

// Format a Date as YYYY/MM/DD for Gmail's after:/before: operators (uses UTC day)
function gmailDateStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

// Strip characters that break Gmail search query parsing.
// Keeps the subject readable while preventing operator injection.
// IMPORTANT: truncate at a word boundary, never mid-word — a truncated word
// (e.g. "busines" from "business") inside a quoted phrase search causes
// Gmail to return zero results even when the email is present.
function sanitizeSubject(subject: string): string {
  const MAX = 70;
  let s = subject
    .replace(/['"\\[\]{}()|<>^~*?]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > MAX) {
    s = s.substring(0, MAX);
    const lastSpace = s.lastIndexOf(" ");
    // Back up to last complete word if one exists past the halfway point
    if (lastSpace > MAX / 2) s = s.substring(0, lastSpace);
  }
  return s.trim();
}

// Run all six folder searches for a given base query.
// Returns a derived status, or null if all counts are zero (email not found with this query).
// Spam-first rule: spam is checked before category labels so it always wins if present.
// Every non-spam query uses -in:spam to prevent false category matches.
async function queryFolders(
  gmail: ReturnType<typeof google.gmail>,
  base_q: string,
  inboxEmail: string
): Promise<{ status: PlacementStatus; queryUsed: string } | null> {
  const [spamRes, primaryRes, promotionsRes, socialRes, updatesRes, forumsRes] = await Promise.all([
    gmail.users.messages.list({ userId: "me", q: `${base_q} in:spam`,                      maxResults: 1 }),
    gmail.users.messages.list({ userId: "me", q: `${base_q} category:primary -in:spam`,    maxResults: 1 }),
    gmail.users.messages.list({ userId: "me", q: `${base_q} category:promotions -in:spam`, maxResults: 1 }),
    gmail.users.messages.list({ userId: "me", q: `${base_q} category:social -in:spam`,     maxResults: 1 }),
    gmail.users.messages.list({ userId: "me", q: `${base_q} category:updates -in:spam`,    maxResults: 1 }),
    gmail.users.messages.list({ userId: "me", q: `${base_q} category:forums -in:spam`,     maxResults: 1 }),
  ]);

  const spamCount    = (spamRes.data.messages      || []).length;
  const primaryCount = (primaryRes.data.messages   || []).length;
  const promoCount   = (promotionsRes.data.messages || []).length;
  const socialCount  = (socialRes.data.messages    || []).length;
  const updatesCount = (updatesRes.data.messages   || []).length;
  const forumsCount  = (forumsRes.data.messages    || []).length;

  console.log(
    `[GmailPlacement] ${inboxEmail} | query: "${base_q}" | ` +
    `spam:${spamCount} primary:${primaryCount} promos:${promoCount} ` +
    `social:${socialCount} updates:${updatesCount} forums:${forumsCount}`
  );

  if (spamCount    > 0) return { status: "spam",       queryUsed: base_q };
  if (primaryCount > 0) return { status: "primary",    queryUsed: base_q };
  if (promoCount   > 0) return { status: "promotions", queryUsed: base_q };
  if (socialCount  > 0) return { status: "social",     queryUsed: base_q };
  if (updatesCount > 0) return { status: "updates",    queryUsed: base_q };
  if (forumsCount  > 0) return { status: "forums",     queryUsed: base_q };
  return null;
}

export function isServiceAccountConfigured(): boolean {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
}

// Returns true only for Google Workspace (non-consumer) email addresses.
// Domain-wide delegation (DWD) cannot impersonate personal @gmail.com /
// @googlemail.com accounts — Google returns unauthorized_client for those.
export function isServiceAccountEligible(email: string): boolean {
  const lower = email.toLowerCase();
  return !lower.endsWith("@gmail.com") && !lower.endsWith("@googlemail.com");
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH STRATEGY CASCADE  (identical logic for both OAuth and Service Account)
//
// The broadcast email problem: platforms like ClickFunnels assign a UNIQUE
// Message-ID to every recipient. The ID captured at the seed parse address is
// never the same as the ID that lands in the Gmail seed inbox. So rfc822msgid:
// searches reliably fail for broadcasts. The subject line, by contrast, is
// IDENTICAL for every recipient — making it the most reliable anchor.
//
// Rule: NEVER search by sender alone without a subject or tight date window.
//       That was the original bug — it matched old emails from the same sender
//       (including ones already sitting in spam) and returned wrong results.
//
// S1 — rfc822msgid (exact ID match)
//   Works for transactional emails (one-to-one delivery, same ID everywhere).
//   Silently fails for broadcasts. If it returns nothing, cascade immediately.
//
// S2 — subject + sender + tight date window (same-day ± 1 buffer day)
//   PRIMARY strategy for broadcast emails. Subject is identical for all
//   recipients; combined with sender and a narrow date it uniquely identifies
//   the right email even without a matching Message-ID.
//   Subject REQUIRED — if absent, skip to S2B.
//
// S2B — subject + sender + wider date window (day−1 → day+3)
//   Catches edge cases: email sent just before midnight, Gmail delivery lag,
//   or UTC/timezone offset shifting the effective calendar day.
//   Subject REQUIRED — if absent, skip to S3.
//
// S3 — subject + sender (no date), gated at 25 min
//   True last resort. Runs only after Gmail has had time to index the email.
//   Subject is ALWAYS kept in this query — without it we risk matching any
//   recent email from the same sender. If no subject is available, falls back
//   to a date-anchored sender-only search (day−1 → day+3) which is at least
//   bounded in time. No-subject AND no-receivedAt → not_found (too dangerous).
// ─────────────────────────────────────────────────────────────────────────────

const MIN_AGE_FOR_BROAD_SEARCH_MS = 25 * 60 * 1000; // 25 min — Gmail indexing buffer

async function runPlacementCascade(
  gmail: ReturnType<typeof google.gmail>,
  safeSender: string,
  inboxEmail: string,
  tag: string,
  context?: { receivedAt?: Date | null; subject?: string | null; messageId?: string | null }
): Promise<PlacementStatus> {
  let result: { status: PlacementStatus; queryUsed: string } | null = null;

  const safeSubject = context?.subject ? sanitizeSubject(context.subject) : null;
  const emailAgeMs  = context?.receivedAt
    ? Date.now() - new Date(context.receivedAt).getTime()
    : Infinity;

  // S1: rfc822msgid — exact single-message match
  if (!result && context?.messageId) {
    const safeMessageId = context.messageId.replace(/['"\\<> ]/g, "");
    result = await queryFolders(gmail, `rfc822msgid:${safeMessageId}`, inboxEmail);
    if (!result) console.log(`${tag} rfc822msgid found nothing — trying subject+date`);
  }

  // S2: subject + sender + tight date window (day-of receivedAt → day+2)
  // Subject is REQUIRED here — without it this query is too broad.
  if (!result && context?.receivedAt && safeSubject) {
    const received    = new Date(context.receivedAt);
    const dayOf       = new Date(Date.UTC(received.getUTCFullYear(), received.getUTCMonth(), received.getUTCDate()));
    const twoDaysLater = new Date(dayOf.getTime() + 2 * 24 * 60 * 60 * 1000);
    const q2 = `from:${safeSender} subject:"${safeSubject}" after:${gmailDateStr(dayOf)} before:${gmailDateStr(twoDaysLater)}`;
    result = await queryFolders(gmail, q2, inboxEmail);
    if (!result) console.log(`${tag} tight subject+date found nothing — widening window`);
  }

  // S2B: subject + sender + wider date window (day−1 → day+3)
  // Handles midnight-send edge cases, timezone offsets, Gmail delivery lag.
  // Subject REQUIRED.
  if (!result && context?.receivedAt && safeSubject) {
    const received      = new Date(context.receivedAt);
    const dayBefore     = new Date(received.getTime() - 1 * 24 * 60 * 60 * 1000);
    const threeDaysAfter = new Date(received.getTime() + 3 * 24 * 60 * 60 * 1000);
    const q2b = `from:${safeSender} subject:"${safeSubject}" after:${gmailDateStr(dayBefore)} before:${gmailDateStr(threeDaysAfter)}`;
    result = await queryFolders(gmail, q2b, inboxEmail);
    if (!result) console.log(`${tag} wider subject+date found nothing — trying open subject search`);
  }

  // S3: last resort — gated at 25 min to avoid matching emails not yet indexed
  if (!result) {
    if (emailAgeMs < MIN_AGE_FOR_BROAD_SEARCH_MS) {
      console.log(
        `${tag} email only ${Math.round(emailAgeMs / 60000)}min old — ` +
        `deferring broad search; scheduler will retry after Gmail indexes it`
      );
      // Return not_found — scheduler retries in 15 min
    } else if (safeSubject) {
      // With subject: safe to search without date — subject is specific enough
      result = await queryFolders(gmail, `from:${safeSender} subject:"${safeSubject}" newer_than:7d`, inboxEmail);
    } else if (context?.receivedAt) {
      // No subject available: use a date-bounded sender search — at least it's not open-ended
      const received      = new Date(context.receivedAt);
      const dayBefore     = new Date(received.getTime() - 1 * 24 * 60 * 60 * 1000);
      const threeDaysAfter = new Date(received.getTime() + 3 * 24 * 60 * 60 * 1000);
      console.log(`${tag} no subject available — date-anchored sender fallback`);
      result = await queryFolders(gmail, `from:${safeSender} after:${gmailDateStr(dayBefore)} before:${gmailDateStr(threeDaysAfter)}`, inboxEmail);
    }
    // No subject AND no receivedAt → return not_found (safer than an open-ended sender search)
  }

  if (result) {
    console.log(`${tag} resolved → ${result.status} (query: "${result.queryUsed}")`);
    return result.status;
  }

  return "not_found";
}

// Service-account version — uses domain-wide delegation, never expires.
// The inbox email must be in the Workspace domain granted to the service account.
export async function checkGmailPlacementServiceAccount(
  inbox: { id: string; label: string; email: string; provider: string },
  senderAddress: string,
  context?: { receivedAt?: Date | null; subject?: string | null; messageId?: string | null }
): Promise<PlacementResult> {
  const base: Omit<PlacementResult, "status"> = {
    inboxId: inbox.id,
    label: inbox.label,
    email: inbox.email,
    provider: inbox.provider,
    checkedAt: new Date().toISOString(),
  };

  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) return { ...base, status: "not_connected" };

  try {
    const key = JSON.parse(keyJson);
    const auth = new google.auth.JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      subject: inbox.email,
    });

    const gmail      = google.gmail({ version: "v1", auth });
    const safeSender = senderAddress.replace(/['"\\]/g, "");
    const tag        = `[GmailPlacement/SA] ${inbox.email} |`;

    const status = await runPlacementCascade(gmail, safeSender, inbox.email, tag, context);
    return { ...base, status };
  } catch (err: any) {
    const msg: string = err?.message ?? String(err);
    console.error("[GmailPlacement/SA] Error checking inbox", inbox.email, msg);
    return { ...base, status: "error" };
  }
}

export async function checkGmailPlacement(
  inbox: { id: string; label: string; email: string; provider: string; oauthAccessToken: string | null; oauthRefreshToken: string | null },
  senderAddress: string,
  context?: { receivedAt?: Date | null; subject?: string | null; messageId?: string | null }
): Promise<PlacementResult> {
  const base: Omit<PlacementResult, "status"> = {
    inboxId: inbox.id,
    label: inbox.label,
    email: inbox.email,
    provider: inbox.provider,
    checkedAt: new Date().toISOString(),
  };

  if (!inbox.oauthAccessToken) {
    return { ...base, status: "not_connected" };
  }

  try {
    const oAuth2Client = getGmailOAuthClient();
    oAuth2Client.setCredentials({
      access_token: inbox.oauthAccessToken,
      refresh_token: inbox.oauthRefreshToken || undefined,
    });

    const gmail      = google.gmail({ version: "v1", auth: oAuth2Client });
    const safeSender = senderAddress.replace(/['"\\]/g, "");
    const tag        = `[GmailPlacement] ${inbox.email} |`;

    const status = await runPlacementCascade(gmail, safeSender, inbox.email, tag, context);
    return { ...base, status };
  } catch (err: any) {
    const msg: string = err?.message ?? String(err);
    console.error("[GmailPlacement] Error checking inbox", inbox.email, msg);
    if (msg.includes("invalid_grant") || msg.includes("Token has been expired")) {
      const e = new Error(msg) as any;
      e.code = "OAUTH_INVALID_GRANT";
      e.inboxId = inbox.id;
      throw e;
    }
    return { ...base, status: "error" };
  }
}
