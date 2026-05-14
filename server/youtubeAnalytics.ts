import { google } from "googleapis";

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
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

export type YouTubeChannel = {
  id: string;
  title: string;
  handle: string;
  thumbnail: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
  publishedAt: string;
  uploadsPlaylistId: string;
};

export type YouTubeVideo = {
  id: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string;
};

export async function fetchYouTubeChannel(
  accessToken: string,
  refreshToken: string | null
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
      ch.snippet?.thumbnails?.default?.url ||
      "",
    subscriberCount: parseInt(ch.statistics?.subscriberCount || "0"),
    videoCount: parseInt(ch.statistics?.videoCount || "0"),
    viewCount: parseInt(ch.statistics?.viewCount || "0"),
    publishedAt: ch.snippet?.publishedAt || "",
    uploadsPlaylistId: ch.contentDetails?.relatedPlaylists?.uploads || "",
  };
}

export async function fetchYouTubeVideos(
  accessToken: string,
  refreshToken: string | null,
  uploadsPlaylistId: string,
  maxVideos = 24
): Promise<YouTubeVideo[]> {
  const auth = makeAuthClient(accessToken, refreshToken);
  const yt = google.youtube({ version: "v3", auth });

  const { data: playlistData } = await yt.playlistItems.list({
    part: ["contentDetails"],
    playlistId: uploadsPlaylistId,
    maxResults: Math.min(maxVideos, 50),
  });

  const videoIds = (playlistData.items || [])
    .map((i) => i.contentDetails?.videoId!)
    .filter(Boolean);
  if (!videoIds.length) return [];

  const { data: videoData } = await yt.videos.list({
    part: ["snippet", "statistics", "contentDetails"],
    id: videoIds,
  });

  return (videoData.items || []).map((v) => ({
    id: v.id!,
    title: v.snippet?.title || "",
    thumbnail:
      v.snippet?.thumbnails?.medium?.url ||
      v.snippet?.thumbnails?.default?.url ||
      "",
    publishedAt: v.snippet?.publishedAt || "",
    viewCount: parseInt(v.statistics?.viewCount || "0"),
    likeCount: parseInt(v.statistics?.likeCount || "0"),
    commentCount: parseInt(v.statistics?.commentCount || "0"),
    duration: v.contentDetails?.duration || "",
  }));
}
