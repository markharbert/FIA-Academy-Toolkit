import { google } from "googleapis";

const POSTMASTER_SCOPES = [
  "https://www.googleapis.com/auth/postmaster.readonly",
  "email",
];

export function getPostmasterOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appBaseUrl = process.env.APP_BASE_URL || "https://toolkit.fearlessmarketinglab.com";
  const redirectUri = `${appBaseUrl}/api/sender-reputation/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getPostmasterAuthUrl(userId: string): string {
  const oAuth2Client = getPostmasterOAuthClient();
  return oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: POSTMASTER_SCOPES,
    prompt: "consent",
    state: userId,
  });
}

export async function exchangePostmasterCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiry: Date | null;
  email: string;
}> {
  const oAuth2Client = getPostmasterOAuthClient();
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: oAuth2Client });
  const { data: userInfo } = await oauth2.userinfo.get();

  return {
    accessToken: tokens.access_token || "",
    refreshToken: tokens.refresh_token || null,
    expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    email: userInfo.email || "",
  };
}

export type DailyTrafficStat = {
  date: string;
  domainReputation: string | null;
  spamRate: number | null;
  spfSuccessRatio: number | null;
  dkimSuccessRatio: number | null;
  dmarcSuccessRatio: number | null;
  outboundEncryptionRatio: number | null;
  deliveryErrors: Array<{ errorType: string; errorClass: string; errorRatio: number }>;
};

export type PostmasterDomainData = {
  domainName: string;
  latestReputation: string | null;
  latestSpamRate: number | null;
  latestSpfRatio: number | null;
  latestDkimRatio: number | null;
  latestDmarcRatio: number | null;
  latestEncryptionRatio: number | null;
  trafficStats: DailyTrafficStat[];
};

export async function fetchPostmasterData(
  accessToken: string,
  refreshToken: string | null,
): Promise<PostmasterDomainData[]> {
  const oAuth2Client = getPostmasterOAuthClient();
  oAuth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken || undefined,
  });

  const postmaster = google.gmailpostmastertools({ version: "v1", auth: oAuth2Client });

  const { data: domainsData } = await postmaster.domains.list();
  const domains = domainsData.domains || [];
  if (domains.length === 0) return [];

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  const results: PostmasterDomainData[] = [];

  for (const domain of domains) {
    const domainName = domain.name?.replace("domains/", "") || "";
    if (!domainName) continue;

    try {
      const { data: statsData } = await postmaster.domains.trafficStats.list({
        parent: domain.name!,
        "startDate.year": startDate.getFullYear(),
        "startDate.month": startDate.getMonth() + 1,
        "startDate.day": startDate.getDate(),
        "endDate.year": endDate.getFullYear(),
        "endDate.month": endDate.getMonth() + 1,
        "endDate.day": endDate.getDate(),
      } as any);

      const stats = (statsData as any).trafficStats || [];

      const dailyStats: DailyTrafficStat[] = stats.map((s: any) => {
        const d = s.date;
        const dateStr = d
          ? `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`
          : "";

        let spamRate: number | null = null;
        const range = s.userReportedSpamRatioRange || s.spamRateRange;
        if (range) {
          spamRate = ((range.lowPercentile ?? 0) + (range.highPercentile ?? 0)) / 2;
        }

        return {
          date: dateStr,
          domainReputation: s.domainReputation || null,
          spamRate,
          spfSuccessRatio: s.spfSuccessRatio ?? null,
          dkimSuccessRatio: s.dkimSuccessRatio ?? null,
          dmarcSuccessRatio: s.dmarcSuccessRatio ?? null,
          outboundEncryptionRatio: s.outboundEncryptionRatio ?? null,
          deliveryErrors: (s.deliveryErrors || []).map((e: any) => ({
            errorType: e.errorType || "",
            errorClass: e.errorClass || "",
            errorRatio: e.errorRatio || 0,
          })),
        };
      }).filter((s: DailyTrafficStat) => s.date);

      const sorted = [...dailyStats].sort((a, b) => b.date.localeCompare(a.date));

      results.push({
        domainName,
        latestReputation: sorted.find(s => s.domainReputation)?.domainReputation ?? null,
        latestSpamRate: sorted.find(s => s.spamRate !== null)?.spamRate ?? null,
        latestSpfRatio: sorted.find(s => s.spfSuccessRatio !== null)?.spfSuccessRatio ?? null,
        latestDkimRatio: sorted.find(s => s.dkimSuccessRatio !== null)?.dkimSuccessRatio ?? null,
        latestDmarcRatio: sorted.find(s => s.dmarcSuccessRatio !== null)?.dmarcSuccessRatio ?? null,
        latestEncryptionRatio: sorted.find(s => s.outboundEncryptionRatio !== null)?.outboundEncryptionRatio ?? null,
        trafficStats: dailyStats,
      });
    } catch (err: any) {
      console.error(`[Postmaster] Failed to fetch stats for ${domainName}:`, err?.message);
      results.push({
        domainName,
        latestReputation: null,
        latestSpamRate: null,
        latestSpfRatio: null,
        latestDkimRatio: null,
        latestDmarcRatio: null,
        latestEncryptionRatio: null,
        trafficStats: [],
      });
    }
  }

  return results;
}
