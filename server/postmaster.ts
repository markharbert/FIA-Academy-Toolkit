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

export type IpReputation = {
  reputation: string;
  numIps: number | null;
  ipCount: number | null;
  sampleIps: string[];
};

export type DeliveryError = {
  errorType: string;
  errorClass: string;
  errorRatio: number;
};

export type DailyTrafficStat = {
  date: string;
  domainReputation: string | null;
  spamRate: number | null;
  spamRateLow: number | null;
  spamRateHigh: number | null;
  spfSuccessRatio: number | null;
  dkimSuccessRatio: number | null;
  dmarcSuccessRatio: number | null;
  outboundEncryptionRatio: number | null;
  inboundEncryptionRatio: number | null;
  ipReputations: IpReputation[];
  deliveryErrors: DeliveryError[];
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

function parseStat(s: any, logSample = false): DailyTrafficStat | null {
  if (logSample) {
    console.log("[Postmaster] sample record:", JSON.stringify(s).slice(0, 500));
  }

  let dateStr: string;
  const d = s.date;

  if (typeof d === "string" && d.length >= 8) {
    // Already a string like "2024-05-01"
    dateStr = d.slice(0, 10);
  } else if (d && typeof d === "object" && (d.year || d.Year)) {
    // Object like { year, month, day } or { Year, Month, Day }
    const year = d.year ?? d.Year;
    const month = d.month ?? d.Month;
    const day = d.day ?? d.Day;
    if (!year || !month || !day) return null;
    dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  } else if (s.name) {
    // Date is encoded in the resource name as YYYYMMDD: domains/x.com/trafficStats/20260126
    const nameStr = s.name as string;
    const withDash = nameStr.match(/(\d{4}-\d{2}-\d{2})$/);
    const noDash = nameStr.match(/(\d{4})(\d{2})(\d{2})$/);
    if (withDash) {
      dateStr = withDash[1];
    } else if (noDash) {
      dateStr = `${noDash[1]}-${noDash[2]}-${noDash[3]}`;
    } else {
      console.log("[Postmaster] unrecognised record shape, name:", s.name, "date:", JSON.stringify(d));
      return null;
    }
  } else {
    console.log("[Postmaster] unrecognised date field:", JSON.stringify(d));
    return null;
  }

  const range = s.userReportedSpamRatioRange || s.spamRateRange;
  const spamRateLow: number | null = range?.lowPercentile ?? null;
  const spamRateHigh: number | null = range?.highPercentile ?? null;
  const spamRate: number | null =
    spamRateLow != null && spamRateHigh != null
      ? (spamRateLow + spamRateHigh) / 2
      : (spamRateLow ?? spamRateHigh ?? null);

  const ipReputations: IpReputation[] = (s.ipReputations || []).map((ip: any) => ({
    reputation: ip.reputation || "REPUTATION_CATEGORY_UNSPECIFIED",
    numIps: ip.numIps ?? null,
    ipCount: ip.ipCount ?? null,
    sampleIps: Array.isArray(ip.sampleIps) ? ip.sampleIps : [],
  }));

  const deliveryErrors: DeliveryError[] = (s.deliveryErrors || []).map((e: any) => ({
    errorType: e.errorType || "",
    errorClass: e.errorClass || "",
    errorRatio: typeof e.errorRatio === "number" ? e.errorRatio : 0,
  }));

  return {
    date: dateStr,
    domainReputation: s.domainReputation || null,
    spamRate,
    spamRateLow,
    spamRateHigh,
    spfSuccessRatio: s.spfSuccessRatio ?? null,
    dkimSuccessRatio: s.dkimSuccessRatio ?? null,
    dmarcSuccessRatio: s.dmarcSuccessRatio ?? null,
    outboundEncryptionRatio: s.outboundEncryptionRatio ?? null,
    inboundEncryptionRatio: s.inboundEncryptionRatio ?? null,
    ipReputations,
    deliveryErrors,
  };
}

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
  console.log(`[Postmaster] Found ${domains.length} domains:`, domains.map(d => d.name));
  if (domains.length === 0) return [];

  const results: PostmasterDomainData[] = [];

  for (const domain of domains) {
    const domainName = domain.name?.replace("domains/", "") || "";
    if (!domainName) continue;

    const allStats: DailyTrafficStat[] = [];

    try {
      // Fetch with pagination — no explicit date range, let Google return what it has
      let pageToken: string | undefined;
      let pagesFetched = 0;

      do {
        const params: Record<string, any> = {
          parent: domain.name!,
          pageSize: 30,
        };
        if (pageToken) params.pageToken = pageToken;

        const { data: statsData } = await (postmaster.domains.trafficStats as any).list(params);
        const page = statsData.trafficStats || [];
        console.log(`[Postmaster] ${domainName} page ${pagesFetched + 1}: ${page.length} records, nextPageToken: ${statsData.nextPageToken ? "yes" : "no"}`);

        for (let i = 0; i < page.length; i++) {
          const parsed = parseStat(page[i], pagesFetched === 0 && i === 0);
          if (parsed) allStats.push(parsed);
        }

        pageToken = statsData.nextPageToken || undefined;
        pagesFetched++;
      } while (pageToken && pagesFetched < 6); // max 6 pages = ~180 days

      console.log(`[Postmaster] ${domainName} total: ${allStats.length} daily records`);

      const sorted = [...allStats].sort((a, b) => b.date.localeCompare(a.date));

      results.push({
        domainName,
        latestReputation: sorted.find(s => s.domainReputation && s.domainReputation !== "REPUTATION_CATEGORY_UNSPECIFIED")?.domainReputation ?? null,
        latestSpamRate: sorted.find(s => s.spamRate !== null)?.spamRate ?? null,
        latestSpfRatio: sorted.find(s => s.spfSuccessRatio !== null)?.spfSuccessRatio ?? null,
        latestDkimRatio: sorted.find(s => s.dkimSuccessRatio !== null)?.dkimSuccessRatio ?? null,
        latestDmarcRatio: sorted.find(s => s.dmarcSuccessRatio !== null)?.dmarcSuccessRatio ?? null,
        latestEncryptionRatio: sorted.find(s => s.outboundEncryptionRatio !== null)?.outboundEncryptionRatio ?? null,
        trafficStats: allStats,
      });
    } catch (err: any) {
      const status = err?.response?.status;
      const message = err?.response?.data?.error?.message || err?.message;
      const details = JSON.stringify(err?.response?.data?.error?.details ?? []);
      console.error(`[Postmaster] ${domainName} stats error (HTTP ${status}): ${message} — details: ${details}`);
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
