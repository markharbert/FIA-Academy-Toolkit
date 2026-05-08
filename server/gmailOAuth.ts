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

// Run all six folder searches for a given base query.
// Returns counts and a derived status, or null if all counts are zero.
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
  return null; // nothing found with this query
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
      subject: inbox.email, // domain-wide delegation: impersonate this Workspace user
    });

    const gmail = google.gmail({ version: "v1", auth });
    const safeSender = senderAddress.replace(/['"\\]/g, "");

    let result: { status: PlacementStatus; queryUsed: string } | null = null;

    if (!result && context?.messageId) {
      const safeMessageId = context.messageId.replace(/['"\\<> ]/g, "");
      result = await queryFolders(gmail, `rfc822msgid:${safeMessageId}`, inbox.email);
      if (!result) console.log(`[GmailPlacement/SA] ${inbox.email} | rfc822msgid found nothing — trying date fallback`);
    }

    if (!result && context?.receivedAt) {
      const received     = new Date(context.receivedAt);
      const dayBefore    = new Date(received.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAfter = new Date(received.getTime() + 2 * 24 * 60 * 60 * 1000);
      let q2 = `from:${safeSender} after:${gmailDateStr(dayBefore)} before:${gmailDateStr(twoDaysAfter)}`;
      if (context.subject) {
        const safeSubject = context.subject.replace(/['"\\]/g, "").substring(0, 50).trim();
        if (safeSubject) q2 += ` subject:"${safeSubject}"`;
      }
      result = await queryFolders(gmail, q2, inbox.email);
      if (!result) console.log(`[GmailPlacement/SA] ${inbox.email} | date+subject query found nothing — trying sender fallback`);
    }

    // Strategy 3: broad sender search — ONLY run if the email is old enough for Gmail
    // to have indexed it. Running too early causes false results: strategies 1 and 2 find
    // nothing (email not yet indexed), and this query matches OLDER emails from the same
    // sender (including ones sitting in spam), producing incorrect spam readings.
    const MIN_AGE_FOR_BROAD_SEARCH_MS = 25 * 60 * 1000; // 25 minutes
    const emailAgeMs = context?.receivedAt
      ? Date.now() - new Date(context.receivedAt).getTime()
      : Infinity;

    if (!result) {
      if (emailAgeMs < MIN_AGE_FOR_BROAD_SEARCH_MS) {
        console.log(
          `[GmailPlacement/SA] ${inbox.email} | email only ${Math.round(emailAgeMs / 60000)}min old — ` +
          `skipping broad search to avoid false positives; will retry later`
        );
        // Return not_found so the scheduler retries once Gmail has indexed the email
      } else {
        // Anchor the date to receivedAt (don't use newer_than:5d — that matches emails
        // from before the current test, including old spam from the same sender)
        let q3 = `from:${safeSender}`;
        if (context?.receivedAt) {
          const dayBefore = new Date(new Date(context.receivedAt).getTime() - 24 * 60 * 60 * 1000);
          q3 += ` after:${gmailDateStr(dayBefore)}`;
        } else {
          q3 += ` newer_than:5d`;
        }
        result = await queryFolders(gmail, q3, inbox.email);
      }
    }

    if (result) {
      console.log(`[GmailPlacement/SA] ${inbox.email} | resolved → ${result.status}`);
      return { ...base, status: result.status };
    }

    return { ...base, status: "not_found" };
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

    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    const safeSender = senderAddress.replace(/['"\\]/g, "");

    // Three-strategy cascade — tries the most specific first, falls back on zero results.
    //
    // KEY INSIGHT: some email senders (e.g. ClickFunnels) use internal Docker hostnames
    // as the Message-ID domain (e.g. @cf2-admin…ptvzn.mail).  Gmail's rfc822msgid: search
    // sometimes fails to find these even though the email is in the inbox.  When that
    // happens we fall through to Strategy 2 or 3 rather than returning not_found prematurely.
    //
    // Strategy 1 — rfc822msgid: (exact single-message match, best precision):
    //   Only used when we have a stored Message-ID.  If it returns zero across all folders,
    //   cascade to Strategy 2 instead of giving up.
    //
    // Strategy 2 — tight date window + from + subject (good precision):
    //   1 day before → 2 days after received-at timestamp, filtered by sender and subject.
    //   Only used when we have the received-at timestamp.
    //   If it also returns zero, cascade to Strategy 3.
    //
    // Strategy 3 — sender + newer_than:5d (last resort, lowest precision):
    //   Widest net; can match recent emails from the same sender regardless of subject.
    //
    // Spam-first rule: spam is always checked FIRST so it overrides category labels.
    // Every non-spam query uses -in:spam to avoid false category matches.

    let result: { status: PlacementStatus; queryUsed: string } | null = null;

    // Strategy 1: rfc822msgid:
    if (!result && context?.messageId) {
      const safeMessageId = context.messageId.replace(/['"\\<> ]/g, "");
      result = await queryFolders(gmail, `rfc822msgid:${safeMessageId}`, inbox.email);
      if (!result) {
        console.log(`[GmailPlacement] ${inbox.email} | rfc822msgid found nothing — trying date fallback`);
      }
    }

    // Strategy 2: tight date window + from + subject
    if (!result && context?.receivedAt) {
      const received     = new Date(context.receivedAt);
      const dayBefore    = new Date(received.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAfter = new Date(received.getTime() + 2 * 24 * 60 * 60 * 1000);
      let q2 = `from:${safeSender} after:${gmailDateStr(dayBefore)} before:${gmailDateStr(twoDaysAfter)}`;
      if (context.subject) {
        const safeSubject = context.subject.replace(/['"\\]/g, "").substring(0, 50).trim();
        if (safeSubject) q2 += ` subject:"${safeSubject}"`;
      }
      result = await queryFolders(gmail, q2, inbox.email);
      if (!result) {
        console.log(`[GmailPlacement] ${inbox.email} | date+subject query found nothing — trying sender fallback`);
      }
    }

    // Strategy 3: broad sender search — ONLY run if the email is old enough for Gmail
    // to have indexed it. Running too early causes false results: strategies 1 and 2 find
    // nothing (email not yet indexed), and this query matches OLDER emails from the same
    // sender (including ones sitting in spam), producing incorrect spam readings.
    const MIN_AGE_FOR_BROAD_SEARCH_MS = 25 * 60 * 1000; // 25 minutes
    const emailAgeMs = context?.receivedAt
      ? Date.now() - new Date(context.receivedAt).getTime()
      : Infinity;

    if (!result) {
      if (emailAgeMs < MIN_AGE_FOR_BROAD_SEARCH_MS) {
        console.log(
          `[GmailPlacement] ${inbox.email} | email only ${Math.round(emailAgeMs / 60000)}min old — ` +
          `skipping broad search to avoid false positives; will retry later`
        );
        // Return not_found so the scheduler retries once Gmail has indexed the email
      } else {
        // Anchor the date to receivedAt (don't use newer_than:5d — that matches emails
        // from before the current test, including old spam from the same sender)
        let q3 = `from:${safeSender}`;
        if (context?.receivedAt) {
          const dayBefore = new Date(new Date(context.receivedAt).getTime() - 24 * 60 * 60 * 1000);
          q3 += ` after:${gmailDateStr(dayBefore)}`;
        } else {
          q3 += ` newer_than:5d`;
        }
        result = await queryFolders(gmail, q3, inbox.email);
      }
    }

    if (result) {
      console.log(`[GmailPlacement] ${inbox.email} | resolved → ${result.status}`);
      return { ...base, status: result.status };
    }

    return { ...base, status: "not_found" };
  } catch (err: any) {
    const msg: string = err?.message ?? String(err);
    console.error("[GmailPlacement] Error checking inbox", inbox.email, msg);
    // Surface token-expiry errors distinctly so the scheduler can mark the inbox
    if (msg.includes("invalid_grant") || msg.includes("Token has been expired")) {
      const e = new Error(msg) as any;
      e.code = "OAUTH_INVALID_GRANT";
      e.inboxId = inbox.id;
      throw e;
    }
    return { ...base, status: "error" };
  }
}
