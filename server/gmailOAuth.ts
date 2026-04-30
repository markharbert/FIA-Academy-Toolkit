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

export async function checkGmailPlacement(
  inbox: { id: string; label: string; email: string; provider: string; oauthAccessToken: string | null; oauthRefreshToken: string | null },
  senderAddress: string
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
    const base_q = `from:${safeSender} newer_than:14d`;

    const [primaryRes, promotionsRes, socialRes, updatesRes, forumsRes, spamRes] = await Promise.all([
      gmail.users.messages.list({ userId: "me", q: `${base_q} category:primary`, maxResults: 1 }),
      gmail.users.messages.list({ userId: "me", q: `${base_q} category:promotions`, maxResults: 1 }),
      gmail.users.messages.list({ userId: "me", q: `${base_q} category:social`, maxResults: 1 }),
      gmail.users.messages.list({ userId: "me", q: `${base_q} category:updates`, maxResults: 1 }),
      gmail.users.messages.list({ userId: "me", q: `${base_q} category:forums`, maxResults: 1 }),
      gmail.users.messages.list({ userId: "me", q: `${base_q} in:spam`, maxResults: 1 }),
    ]);

    if ((primaryRes.data.messages || []).length > 0) return { ...base, status: "primary" };
    if ((promotionsRes.data.messages || []).length > 0) return { ...base, status: "promotions" };
    if ((socialRes.data.messages || []).length > 0) return { ...base, status: "social" };
    if ((updatesRes.data.messages || []).length > 0) return { ...base, status: "updates" };
    if ((forumsRes.data.messages || []).length > 0) return { ...base, status: "forums" };
    if ((spamRes.data.messages || []).length > 0) return { ...base, status: "spam" };
    return { ...base, status: "not_found" };
  } catch (err: any) {
    console.error("[GmailPlacement] Error checking inbox", inbox.email, err?.message);
    return { ...base, status: "error" };
  }
}
