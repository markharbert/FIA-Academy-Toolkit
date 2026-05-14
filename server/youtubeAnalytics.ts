import { google } from "googleapis";

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "email",
];

function getRedirectUri(): string {
  const base = process.env.APP_BASE_URL || "https://toolkit.fearlessmarketinglab.com";
  return `${base}/api/analytics/youtube/callback`;
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

function durationToSeconds(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] || "0") * 3600) + (parseInt(m[2] || "0") * 60) + parseInt(m[3] || "0");
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseRow(row: unknown[], headers: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  headers.forEach((h, i) => { result[h] = row[i]; });
  return result;
}

const TRAFFIC_LABELS: Record<string, string> = {
  YT_SEARCH: "YouTube Search",
  SUGGESTED_VIDEO: "Suggested Videos",
  EXT_URL: "External / Website",
  DIRECT_OR_UNKNOWN: "Direct / Unknown",
  PLAYLIST: "Playlists",
  YT_CHANNEL: "Channel Page",
  YT_OTHER_PAGE: "Other YouTube Page",
  NOTIFICATION: "Notifications",
  SUBSCRIBER: "Subscriptions Feed",
  YT_ADVERTISING: "YouTube Advertising",
  END_SCREEN: "End Screen",
  CAMPAIGN_CARD: "Campaign Card",
  VIDEO_REMIXES: "Video Remixes",
  SHORTS: "YouTube Shorts Feed",
  NO_LINK_OTHER: "No Link / Other",
};

const DEVICE_LABELS: Record<string, string> = {
  MOBILE: "Mobile",
  DESKTOP: "Desktop",
  TABLET: "Tablet",
  TV: "TV",
  GAME_CONSOLE: "Game Console",
};

const AGE_LABELS: Record<string, string> = {
  "age13-17": "13–17",
  "age18-24": "18–24",
  "age25-34": "25–34",
  "age35-44": "35–44",
  "age45-54": "45–54",
  "age55-64": "55–64",
  "age65-": "65+",
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type YouTubeChannel = {
  id: string; title: string; handle: string; thumbnail: string;
  subscriberCount: number; videoCount: number; viewCount: number;
  publishedAt: string; uploadsPlaylistId: string;
};

export type YouTubeVideo = {
  id: string; title: string; thumbnail: string; publishedAt: string;
  viewCount: number; likeCount: number; commentCount: number;
  duration: string; tags: string[]; isShort: boolean;
};

export type AnalyticsDay = {
  date: string; views: number; watchMinutes: number;
  subscribersGained: number; subscribersLost: number;
  impressions: number; ctr: number; shares: number;
};

export type ChannelAnalyticsTotals = {
  views: number; watchHours: number; avgViewDuration: number;
  subscribersGained: number; subscribersLost: number;
  impressions: number; ctr: number; shares: number;
};

export type TrafficSource = {
  source: string; label: string; views: number; watchMinutes: number;
};

export type DeviceBreakdown = {
  device: string; label: string; views: number; pct: number;
};

export type CountryViews = {
  country: string; views: number; watchMinutes: number;
};

export type SearchTerm = {
  term: string; views: number;
};

export type AgeGroup = {
  age: string; label: string; pct: number;
};

export type DemographicsData = {
  ageGroups: AgeGroup[];
  genderMalePct: number;
  genderFemalePct: number;
};

export type SubscriberStatusData = {
  subscribedViews: number; subscribedWatchMinutes: number;
  nonSubscribedViews: number; nonSubscribedWatchMinutes: number;
};

export type VideoAnalyticsSummary = {
  videoId: string; views: number; watchMinutes: number;
  avgViewDuration: number; avgViewPercentage: number;
  likes: number; comments: number; shares: number;
};

// ── OAuth ─────────────────────────────────────────────────────────────────────

export function getYouTubeAuthUrl(userId: string): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: YOUTUBE_SCOPES,
    prompt: "consent",
    state: userId,
  });
}

export async function exchangeYouTubeCode(code: string): Promise<{
  accessToken: string; refreshToken: string | null;
  expiry: Date | null; email: string;
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

// ── YouTube Data API v3 ───────────────────────────────────────────────────────

export async function fetchYouTubeChannel(
  accessToken: string, refreshToken: string | null
): Promise<YouTubeChannel> {
  const auth = makeAuthClient(accessToken, refreshToken);
  const yt = google.youtube({ version: "v3", auth });
  const { data } = await yt.channels.list({
    part: ["snippet", "statistics", "contentDetails"],
    mine: true,
  });
  if (!data.items?.length) throw new Error("No YouTube channel found for this account");
  const ch = data.items[0];
  return {
    id: ch.id!,
    title: ch.snippet?.title || "",
    handle: ch.snippet?.customUrl || "",
    thumbnail:
      ch.snippet?.thumbnails?.high?.url ||
      ch.snippet?.thumbnails?.medium?.url ||
      ch.snippet?.thumbnails?.default?.url || "",
    subscriberCount: parseInt(ch.statistics?.subscriberCount || "0"),
    videoCount: parseInt(ch.statistics?.videoCount || "0"),
    viewCount: parseInt(ch.statistics?.viewCount || "0"),
    publishedAt: ch.snippet?.publishedAt || "",
    uploadsPlaylistId: ch.contentDetails?.relatedPlaylists?.uploads || "",
  };
}

export async function fetchYouTubeVideos(
  accessToken: string, refreshToken: string | null,
  uploadsPlaylistId: string, maxVideos = 2000
): Promise<YouTubeVideo[]> {
  const auth = makeAuthClient(accessToken, refreshToken);
  const yt = google.youtube({ version: "v3", auth });

  const videoIds: string[] = [];
  let pageToken: string | undefined;
  do {
    const { data: playlistData } = await yt.playlistItems.list({
      part: ["contentDetails"],
      playlistId: uploadsPlaylistId,
      maxResults: 50,
      pageToken,
    });
    videoIds.push(...(playlistData.items || []).map((i) => i.contentDetails?.videoId!).filter(Boolean));
    pageToken = playlistData.nextPageToken ?? undefined;
  } while (pageToken && videoIds.length < maxVideos);

  const ids = videoIds.slice(0, maxVideos);
  if (!ids.length) return [];

  const allVideos: YouTubeVideo[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { data: videoData } = await yt.videos.list({
      part: ["snippet", "statistics", "contentDetails"],
      id: chunk,
    });
    allVideos.push(...(videoData.items || []).map((v) => {
      const dur = v.contentDetails?.duration || "";
      return {
        id: v.id!,
        title: v.snippet?.title || "",
        thumbnail: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || "",
        publishedAt: v.snippet?.publishedAt || "",
        viewCount: parseInt(v.statistics?.viewCount || "0"),
        likeCount: parseInt(v.statistics?.likeCount || "0"),
        commentCount: parseInt(v.statistics?.commentCount || "0"),
        duration: dur,
        tags: v.snippet?.tags || [],
        isShort: durationToSeconds(dur) <= 60,
      };
    }));
  }
  return allVideos;
}

// ── YouTube Analytics API v2 ──────────────────────────────────────────────────

export async function fetchChannelAnalytics(
  accessToken: string, refreshToken: string | null, days: number
): Promise<{ timeSeries: AnalyticsDay[]; totals: ChannelAnalyticsTotals } | null> {
  try {
    const auth = makeAuthClient(accessToken, refreshToken);
    const yta = google.youtubeAnalytics({ version: "v2", auth });
    const startDate = daysAgoStr(days);
    const endDate = todayStr();

    const [tsRes, totRes] = await Promise.all([
      yta.reports.query({
        ids: "channel==MINE", startDate, endDate,
        metrics: "views,estimatedMinutesWatched,subscribersGained,subscribersLost,impressions,impressionClickThroughRate,shares",
        dimensions: "day", sort: "day",
      }),
      yta.reports.query({
        ids: "channel==MINE", startDate, endDate,
        metrics: "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,impressions,impressionClickThroughRate,shares",
      }),
    ]);

    const tsHeaders = (tsRes.data.columnHeaders || []).map((h) => h.name!);
    const timeSeries: AnalyticsDay[] = (tsRes.data.rows || []).map((row) => {
      const r = parseRow(row as unknown[], tsHeaders);
      return {
        date: String(r["day"] || ""),
        views: Number(r["views"] || 0),
        watchMinutes: Number(r["estimatedMinutesWatched"] || 0),
        subscribersGained: Number(r["subscribersGained"] || 0),
        subscribersLost: Number(r["subscribersLost"] || 0),
        impressions: Number(r["impressions"] || 0),
        ctr: Number(r["impressionClickThroughRate"] || 0) * 100,
        shares: Number(r["shares"] || 0),
      };
    });

    const totHeaders = (totRes.data.columnHeaders || []).map((h) => h.name!);
    const totRow = totRes.data.rows?.[0] ? parseRow(totRes.data.rows[0] as unknown[], totHeaders) : {};

    const totals: ChannelAnalyticsTotals = {
      views: Number(totRow["views"] || 0),
      watchHours: Math.round(Number(totRow["estimatedMinutesWatched"] || 0) / 60),
      avgViewDuration: Number(totRow["averageViewDuration"] || 0),
      subscribersGained: Number(totRow["subscribersGained"] || 0),
      subscribersLost: Number(totRow["subscribersLost"] || 0),
      impressions: Number(totRow["impressions"] || 0),
      ctr: Number(totRow["impressionClickThroughRate"] || 0) * 100,
      shares: Number(totRow["shares"] || 0),
    };

    return { timeSeries, totals };
  } catch (err: unknown) {
    console.error("[YouTube Analytics] fetchChannelAnalytics error:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function fetchTrafficSources(
  accessToken: string, refreshToken: string | null, days: number
): Promise<TrafficSource[]> {
  try {
    const auth = makeAuthClient(accessToken, refreshToken);
    const yta = google.youtubeAnalytics({ version: "v2", auth });
    const { data } = await yta.reports.query({
      ids: "channel==MINE", startDate: daysAgoStr(days), endDate: todayStr(),
      metrics: "views,estimatedMinutesWatched",
      dimensions: "insightTrafficSourceType", sort: "-views",
    });
    const headers = (data.columnHeaders || []).map((h) => h.name!);
    return (data.rows || []).map((row) => {
      const r = parseRow(row as unknown[], headers);
      const source = String(r["insightTrafficSourceType"] || "");
      return {
        source, label: TRAFFIC_LABELS[source] || source,
        views: Number(r["views"] || 0),
        watchMinutes: Number(r["estimatedMinutesWatched"] || 0),
      };
    });
  } catch (err: unknown) {
    console.error("[YouTube Analytics] fetchTrafficSources error:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchDeviceBreakdown(
  accessToken: string, refreshToken: string | null, days: number
): Promise<DeviceBreakdown[]> {
  try {
    const auth = makeAuthClient(accessToken, refreshToken);
    const yta = google.youtubeAnalytics({ version: "v2", auth });
    const { data } = await yta.reports.query({
      ids: "channel==MINE", startDate: daysAgoStr(days), endDate: todayStr(),
      metrics: "views", dimensions: "deviceType", sort: "-views",
    });
    const headers = (data.columnHeaders || []).map((h) => h.name!);
    const rows = (data.rows || []).map((row) => {
      const r = parseRow(row as unknown[], headers);
      const device = String(r["deviceType"] || "");
      return { device, label: DEVICE_LABELS[device] || device, views: Number(r["views"] || 0), pct: 0 };
    });
    const total = rows.reduce((s, r) => s + r.views, 0);
    return rows.map((r) => ({ ...r, pct: total > 0 ? Math.round((r.views / total) * 100) : 0 }));
  } catch (err: unknown) {
    console.error("[YouTube Analytics] fetchDeviceBreakdown error:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchTopCountries(
  accessToken: string, refreshToken: string | null, days: number
): Promise<CountryViews[]> {
  try {
    const auth = makeAuthClient(accessToken, refreshToken);
    const yta = google.youtubeAnalytics({ version: "v2", auth });
    const { data } = await yta.reports.query({
      ids: "channel==MINE", startDate: daysAgoStr(days), endDate: todayStr(),
      metrics: "views,estimatedMinutesWatched",
      dimensions: "country", sort: "-views", maxResults: 10,
    });
    const headers = (data.columnHeaders || []).map((h) => h.name!);
    return (data.rows || []).map((row) => {
      const r = parseRow(row as unknown[], headers);
      return {
        country: String(r["country"] || ""),
        views: Number(r["views"] || 0),
        watchMinutes: Number(r["estimatedMinutesWatched"] || 0),
      };
    });
  } catch (err: unknown) {
    console.error("[YouTube Analytics] fetchTopCountries error:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchTopSearchTerms(
  accessToken: string, refreshToken: string | null, days: number
): Promise<SearchTerm[]> {
  try {
    const auth = makeAuthClient(accessToken, refreshToken);
    const yta = google.youtubeAnalytics({ version: "v2", auth });
    const { data } = await yta.reports.query({
      ids: "channel==MINE", startDate: daysAgoStr(days), endDate: todayStr(),
      metrics: "views",
      dimensions: "insightTrafficSourceDetail",
      filters: "insightTrafficSourceType==YT_SEARCH",
      sort: "-views", maxResults: 25,
    });
    const headers = (data.columnHeaders || []).map((h) => h.name!);
    return (data.rows || []).map((row) => {
      const r = parseRow(row as unknown[], headers);
      return { term: String(r["insightTrafficSourceDetail"] || ""), views: Number(r["views"] || 0) };
    });
  } catch (err: unknown) {
    console.error("[YouTube Analytics] fetchTopSearchTerms error:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchDemographics(
  accessToken: string, refreshToken: string | null, days: number
): Promise<DemographicsData> {
  const empty: DemographicsData = { ageGroups: [], genderMalePct: 0, genderFemalePct: 0 };
  try {
    const auth = makeAuthClient(accessToken, refreshToken);
    const yta = google.youtubeAnalytics({ version: "v2", auth });
    const startDate = daysAgoStr(days);
    const endDate = todayStr();

    const [ageRes, genderRes] = await Promise.all([
      yta.reports.query({
        ids: "channel==MINE", startDate, endDate,
        metrics: "viewerPercentage", dimensions: "ageGroup", sort: "ageGroup",
      }),
      yta.reports.query({
        ids: "channel==MINE", startDate, endDate,
        metrics: "viewerPercentage", dimensions: "gender",
      }),
    ]);

    const ageHeaders = (ageRes.data.columnHeaders || []).map((h) => h.name!);
    const ageGroups: AgeGroup[] = (ageRes.data.rows || []).map((row) => {
      const r = parseRow(row as unknown[], ageHeaders);
      const age = String(r["ageGroup"] || "");
      return { age, label: AGE_LABELS[age] || age, pct: Math.round(Number(r["viewerPercentage"] || 0) * 10) / 10 };
    });

    const genderHeaders = (genderRes.data.columnHeaders || []).map((h) => h.name!);
    let malePct = 0, femalePct = 0;
    for (const row of (genderRes.data.rows || [])) {
      const r = parseRow(row as unknown[], genderHeaders);
      const g = String(r["gender"] || "").toLowerCase();
      const pct = Number(r["viewerPercentage"] || 0);
      if (g === "male") malePct = Math.round(pct * 10) / 10;
      if (g === "female") femalePct = Math.round(pct * 10) / 10;
    }

    return { ageGroups, genderMalePct: malePct, genderFemalePct: femalePct };
  } catch (err: unknown) {
    console.error("[YouTube Analytics] fetchDemographics error:", err instanceof Error ? err.message : err);
    return empty;
  }
}

export async function fetchSubscriberStatus(
  accessToken: string, refreshToken: string | null, days: number
): Promise<SubscriberStatusData> {
  const empty: SubscriberStatusData = { subscribedViews: 0, subscribedWatchMinutes: 0, nonSubscribedViews: 0, nonSubscribedWatchMinutes: 0 };
  try {
    const auth = makeAuthClient(accessToken, refreshToken);
    const yta = google.youtubeAnalytics({ version: "v2", auth });
    const { data } = await yta.reports.query({
      ids: "channel==MINE", startDate: daysAgoStr(days), endDate: todayStr(),
      metrics: "views,estimatedMinutesWatched",
      dimensions: "subscribedStatus",
    });
    const headers = (data.columnHeaders || []).map((h) => h.name!);
    const result = { ...empty };
    for (const row of (data.rows || [])) {
      const r = parseRow(row as unknown[], headers);
      const status = String(r["subscribedStatus"] || "").toUpperCase();
      const views = Number(r["views"] || 0);
      const mins = Number(r["estimatedMinutesWatched"] || 0);
      if (status === "SUBSCRIBED") {
        result.subscribedViews = views;
        result.subscribedWatchMinutes = mins;
      } else {
        result.nonSubscribedViews = views;
        result.nonSubscribedWatchMinutes = mins;
      }
    }
    return result;
  } catch (err: unknown) {
    console.error("[YouTube Analytics] fetchSubscriberStatus error:", err instanceof Error ? err.message : err);
    return empty;
  }
}

export async function fetchVideoAnalytics(
  accessToken: string, refreshToken: string | null, days: number
): Promise<VideoAnalyticsSummary[]> {
  try {
    const auth = makeAuthClient(accessToken, refreshToken);
    const yta = google.youtubeAnalytics({ version: "v2", auth });
    const { data } = await yta.reports.query({
      ids: "channel==MINE", startDate: daysAgoStr(days), endDate: todayStr(),
      metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares",
      dimensions: "video", sort: "-views", maxResults: 50,
    });
    const headers = (data.columnHeaders || []).map((h) => h.name!);
    return (data.rows || []).map((row) => {
      const r = parseRow(row as unknown[], headers);
      return {
        videoId: String(r["video"] || ""),
        views: Number(r["views"] || 0),
        watchMinutes: Number(r["estimatedMinutesWatched"] || 0),
        avgViewDuration: Number(r["averageViewDuration"] || 0),
        avgViewPercentage: Number(r["averageViewPercentage"] || 0),
        likes: Number(r["likes"] || 0),
        comments: Number(r["comments"] || 0),
        shares: Number(r["shares"] || 0),
      };
    });
  } catch (err: unknown) {
    console.error("[YouTube Analytics] fetchVideoAnalytics error:", err instanceof Error ? err.message : err);
    return [];
  }
}

// ── Comment types ─────────────────────────────────────────────────────────────

export type CommentReply = {
  id: string;
  authorName: string;
  authorAvatar: string;
  authorChannelId: string;
  text: string;
  likeCount: number;
  publishedAt: string;
};

export type CommentThread = {
  threadId: string;
  commentId: string;
  authorName: string;
  authorAvatar: string;
  authorChannelId: string;
  text: string;
  likeCount: number;
  publishedAt: string;
  totalReplyCount: number;
  replies: CommentReply[];
};

// ── fetchVideoComments ────────────────────────────────────────────────────────

export async function fetchVideoComments(
  accessToken: string,
  refreshToken: string | null,
  videoId: string,
  pageToken?: string
): Promise<{ threads: CommentThread[]; nextPageToken?: string; totalResults?: number }> {
  try {
    const auth = makeAuthClient(accessToken, refreshToken);
    const yt = google.youtube({ version: "v3", auth });
    const { data } = await yt.commentThreads.list({
      part: ["snippet", "replies"],
      videoId,
      maxResults: 25,
      order: "relevance",
      ...(pageToken ? { pageToken } : {}),
    } as any);

    const threads: CommentThread[] = (data.items || []).map((item: any) => {
      const tc = item.snippet?.topLevelComment;
      const tcs = tc?.snippet || {};
      return {
        threadId: item.id || "",
        commentId: tc?.id || "",
        authorName: tcs.authorDisplayName || "Unknown",
        authorAvatar: tcs.authorProfileImageUrl || "",
        authorChannelId: tcs.authorChannelId?.value || "",
        text: tcs.textDisplay || tcs.textOriginal || "",
        likeCount: tcs.likeCount || 0,
        publishedAt: tcs.publishedAt || "",
        totalReplyCount: item.snippet?.totalReplyCount || 0,
        replies: (item.replies?.comments || []).map((r: any) => {
          const rs = r.snippet || {};
          return {
            id: r.id || "",
            authorName: rs.authorDisplayName || "Unknown",
            authorAvatar: rs.authorProfileImageUrl || "",
            authorChannelId: rs.authorChannelId?.value || "",
            text: rs.textDisplay || rs.textOriginal || "",
            likeCount: rs.likeCount || 0,
            publishedAt: rs.publishedAt || "",
          };
        }),
      };
    });

    return {
      threads,
      nextPageToken: data.nextPageToken ?? undefined,
      totalResults: (data.pageInfo as any)?.totalResults ?? undefined,
    };
  } catch (err: unknown) {
    console.error("[YouTube] fetchVideoComments error:", err instanceof Error ? err.message : err);
    return { threads: [], nextPageToken: undefined };
  }
}

// ── postCommentReply ─────────────────────────────────────────────────────────

export async function postCommentReply(
  accessToken: string,
  refreshToken: string | null,
  parentCommentId: string,
  text: string
): Promise<{ id: string; text: string }> {
  const auth = makeAuthClient(accessToken, refreshToken);
  const yt = google.youtube({ version: "v3", auth });
  const { data } = await (yt.comments as any).insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        parentId: parentCommentId,
        textOriginal: text,
      },
    },
  });
  return { id: data.id || "", text: data.snippet?.textOriginal || text };
}
