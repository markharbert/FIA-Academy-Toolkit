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

    // Build a query that targets ONLY the specific email being monitored.
    //
    // If we have the email's received-at timestamp, use a tight 3-day window
    // (1 day before → 2 days after) instead of newer_than:14d.  This prevents
    // older emails from the same sender — e.g. an old message already in the
    // spam folder — from poisoning the result.
    //
    // We also append the subject (first 50 chars, sanitised) so the match is
    // as specific as possible.
    //
    // KEY FIX: Gmail retains the original category label (e.g. "category:primary") on
    // emails even after they are moved to Spam.  Two-layer defence:
    //   1. Spam is checked FIRST — if the message is in spam, that result wins.
    //   2. Every category search explicitly adds "-in:spam" so it can never match a
    //      message that is currently sitting in the spam folder.

    // Strategy 1 (best): use the globally-unique Message-ID.
    //   rfc822msgid: matches exactly one message in the world — no ambiguity possible,
    //   not affected by same sender/subject, not affected by date.
    //
    // Strategy 2 (good): tight date window + subject when Message-ID is unavailable.
    //   1 day before → 2 days after the known received-at, plus subject for precision.
    //
    // Strategy 3 (fallback): sender + newer_than:5d when we have no pinned context.
    //   Reduced from 14d to limit cross-contamination from older emails.
    let base_q: string;
    if (context?.messageId) {
      const safeMessageId = context.messageId.replace(/['"\\<> ]/g, "");
      base_q = `rfc822msgid:${safeMessageId}`;
    } else if (context?.receivedAt) {
      const received = context.receivedAt;
      const dayBefore    = new Date(received.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAfter = new Date(received.getTime() + 2 * 24 * 60 * 60 * 1000);
      base_q = `from:${safeSender} after:${gmailDateStr(dayBefore)} before:${gmailDateStr(twoDaysAfter)}`;
      if (context.subject) {
        const safeSubject = context.subject.replace(/['"\\]/g, "").substring(0, 50).trim();
        if (safeSubject) base_q += ` subject:"${safeSubject}"`;
      }
    } else {
      base_q = `from:${safeSender} newer_than:5d`;
    }

    const [spamRes, primaryRes, promotionsRes, socialRes, updatesRes, forumsRes] = await Promise.all([
      gmail.users.messages.list({ userId: "me", q: `${base_q} in:spam`,                         maxResults: 1 }),
      gmail.users.messages.list({ userId: "me", q: `${base_q} category:primary -in:spam`,       maxResults: 1 }),
      gmail.users.messages.list({ userId: "me", q: `${base_q} category:promotions -in:spam`,    maxResults: 1 }),
      gmail.users.messages.list({ userId: "me", q: `${base_q} category:social -in:spam`,        maxResults: 1 }),
      gmail.users.messages.list({ userId: "me", q: `${base_q} category:updates -in:spam`,       maxResults: 1 }),
      gmail.users.messages.list({ userId: "me", q: `${base_q} category:forums -in:spam`,        maxResults: 1 }),
    ]);

    const spamCount     = (spamRes.data.messages     || []).length;
    const primaryCount  = (primaryRes.data.messages  || []).length;
    const promoCount    = (promotionsRes.data.messages || []).length;
    const socialCount   = (socialRes.data.messages   || []).length;
    const updatesCount  = (updatesRes.data.messages  || []).length;
    const forumsCount   = (forumsRes.data.messages   || []).length;

    console.log(
      `[GmailPlacement] ${inbox.email} | query: "${base_q}" | ` +
      `spam:${spamCount} primary:${primaryCount} promos:${promoCount} ` +
      `social:${socialCount} updates:${updatesCount} forums:${forumsCount}`
    );

    // Spam checked first — overrides any category label.
    if (spamCount  > 0) return { ...base, status: "spam" };
    if (primaryCount  > 0) return { ...base, status: "primary" };
    if (promoCount > 0) return { ...base, status: "promotions" };
    if (socialCount > 0) return { ...base, status: "social" };
    if (updatesCount > 0) return { ...base, status: "updates" };
    if (forumsCount > 0) return { ...base, status: "forums" };
    return { ...base, status: "not_found" };
  } catch (err: any) {
    console.error("[GmailPlacement] Error checking inbox", inbox.email, err?.message);
    return { ...base, status: "error" };
  }
}
