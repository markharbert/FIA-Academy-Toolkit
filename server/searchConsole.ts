import { google } from "googleapis";

const GSC_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "email",
];

function getRedirectUri(): string {
  const base = process.env.APP_BASE_URL || "https://toolkit.fearlessmarketinglab.com";
  return `${base}/api/analytics/gsc/callback`;
}

function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth not configured");
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
}

function makeAuthClient(accessToken: string, refreshToken: string | null) {
  const client = getOAuthClient();
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken ?? undefined,
  });
  return client;
}

export function getGscAuthUrl(userId: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: GSC_SCOPES,
    prompt: "consent",
    state: userId,
  });
}

export async function exchangeGscCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiry: Date | null;
  email: string;
}> {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data: userInfo } = await oauth2.userinfo.get();
  return {
    accessToken: tokens.access_token || "",
    refreshToken: tokens.refresh_token || null,
    expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    email: userInfo.email || "",
  };
}

export async function fetchGscSites(
  accessToken: string,
  refreshToken: string | null
): Promise<string[]> {
  const auth = makeAuthClient(accessToken, refreshToken);
  const sc = google.searchconsole({ version: "v1", auth });
  const { data } = await sc.sites.list();
  return (data.siteEntry || [])
    .filter((s) => s.siteUrl)
    .map((s) => s.siteUrl!);
}

export type GscRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscTimelineRow = {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscDeviceRow = {
  device: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscCountryRow = {
  country: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscAppearanceRow = {
  appearance: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscSitemap = {
  path: string;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  isPending: boolean;
  warnings: number;
  errors: number;
  submitted: number;
  indexed: number;
};

export type GscData = {
  overview: {
    totalClicks: number;
    totalImpressions: number;
    avgCtr: number;
    avgPosition: number;
  };
  topQueries: GscRow[];
  topPages: GscRow[];
  timeline: GscTimelineRow[];
  devices: GscDeviceRow[];
  countries: GscCountryRow[];
  searchAppearances: GscAppearanceRow[];
  sitemaps: GscSitemap[];
};

export async function fetchGscData(
  accessToken: string,
  refreshToken: string | null,
  siteUrl: string,
  days = 28
): Promise<GscData> {
  const auth = makeAuthClient(accessToken, refreshToken);
  const sc = google.searchconsole({ version: "v1", auth });

  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 2); // GSC has ~2 day data lag
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days + 1);
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const dateRange = {
    startDate: fmt(startDate),
    endDate: fmt(endDate),
  };

  const [queriesRes, pagesRes, timelineRes, devicesRes, countriesRes, appearancesRes] =
    await Promise.all([
      sc.searchanalytics.query({
        siteUrl,
        requestBody: { ...dateRange, dimensions: ["query"], rowLimit: 50 },
      }),
      sc.searchanalytics.query({
        siteUrl,
        requestBody: { ...dateRange, dimensions: ["page"], rowLimit: 50 },
      }),
      sc.searchanalytics.query({
        siteUrl,
        requestBody: { ...dateRange, dimensions: ["date"], rowLimit: days },
      }),
      sc.searchanalytics.query({
        siteUrl,
        requestBody: { ...dateRange, dimensions: ["device"], rowLimit: 10 },
      }),
      sc.searchanalytics.query({
        siteUrl,
        requestBody: { ...dateRange, dimensions: ["country"], rowLimit: 20 },
      }),
      sc.searchanalytics.query({
        siteUrl,
        requestBody: { ...dateRange, dimensions: ["searchAppearance"], rowLimit: 25 },
      }),
    ]);

  // Sitemaps — wrapped separately; may fail for domain properties or missing permissions
  let sitemaps: GscSitemap[] = [];
  try {
    const { data: sitemapsData } = await sc.sitemaps.list({ siteUrl });
    sitemaps = (sitemapsData.sitemap || []).map((s) => {
      const contents = s.contents || [];
      const submitted = contents.reduce(
        (sum, c) => sum + parseInt(String(c.submitted || "0"), 10),
        0
      );
      const indexed = contents.reduce(
        (sum, c) => sum + parseInt(String(c.indexed || "0"), 10),
        0
      );
      return {
        path: s.path || "",
        lastSubmitted: s.lastSubmitted || null,
        lastDownloaded: s.lastDownloaded || null,
        isPending: Boolean(s.isPending),
        warnings: parseInt(String(s.warnings || "0"), 10),
        errors: parseInt(String(s.errors || "0"), 10),
        submitted,
        indexed,
      };
    });
  } catch {
    // Sitemaps not accessible for this property
  }

  const timeRows = timelineRes.data.rows || [];
  const totalClicks = timeRows.reduce((s, r) => s + (r.clicks || 0), 0);
  const totalImpressions = timeRows.reduce((s, r) => s + (r.impressions || 0), 0);
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const avgPosition =
    timeRows.length > 0
      ? timeRows.reduce((s, r) => s + (r.position || 0), 0) / timeRows.length
      : 0;

  const mapRow = (r: any): GscRow => ({
    key: r.keys?.[0] || "",
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    ctr: r.ctr || 0,
    position: r.position || 0,
  });

  return {
    overview: { totalClicks, totalImpressions, avgCtr, avgPosition },
    topQueries: (queriesRes.data.rows || []).map(mapRow),
    topPages: (pagesRes.data.rows || []).map(mapRow),
    timeline: timeRows.map((r) => ({
      date: r.keys?.[0] || "",
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: r.ctr || 0,
      position: r.position || 0,
    })),
    devices: (devicesRes.data.rows || []).map((r) => ({
      device: r.keys?.[0] || "",
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: r.ctr || 0,
      position: r.position || 0,
    })),
    countries: (countriesRes.data.rows || []).map((r) => ({
      country: r.keys?.[0] || "",
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: r.ctr || 0,
      position: r.position || 0,
    })),
    searchAppearances: (appearancesRes.data.rows || []).map((r) => ({
      appearance: r.keys?.[0] || "",
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      ctr: r.ctr || 0,
      position: r.position || 0,
    })),
    sitemaps,
  };
}
