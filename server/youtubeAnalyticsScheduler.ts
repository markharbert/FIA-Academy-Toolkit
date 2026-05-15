import { storage } from "./storage";
import {
  fetchYouTubeVideos,
  fetchChannelAnalytics,
  fetchTrafficSources,
  fetchDeviceBreakdown,
  fetchTopCountries,
  fetchDemographics,
  fetchTopSearchTerms,
  fetchSubscriberStatus,
  fetchVideoAnalytics,
} from "./youtubeAnalytics";

const DAY_RANGES = [7, 28, 90];

async function refreshUserAnalytics(userId: string, oauthAccessToken: string, oauthRefreshToken: string | null, uploadsPlaylistId: string | null): Promise<void> {
  try {
    if (uploadsPlaylistId) {
      const videos = await fetchYouTubeVideos(oauthAccessToken, oauthRefreshToken, uploadsPlaylistId);
      await storage.setYoutubeAnalyticsCache(userId, "videos", videos);
    }
  } catch (err: any) {
    console.error(`[YouTubeScheduler] videos failed for user ${userId}:`, err?.message);
  }

  for (const days of DAY_RANGES) {
    try {
      const result = await fetchChannelAnalytics(oauthAccessToken, oauthRefreshToken, days);
      const payload = result ?? { timeSeries: [], totals: null, error: "analytics_unavailable" };
      await storage.setYoutubeAnalyticsCache(userId, `channel-analytics-${days}`, payload);
    } catch (err: any) {
      console.error(`[YouTubeScheduler] channel-analytics-${days} failed for user ${userId}:`, err?.message);
    }

    try {
      const [traffic, devices, countries, demographics, searchTerms, subscriberStatus] = await Promise.all([
        fetchTrafficSources(oauthAccessToken, oauthRefreshToken, days),
        fetchDeviceBreakdown(oauthAccessToken, oauthRefreshToken, days),
        fetchTopCountries(oauthAccessToken, oauthRefreshToken, days),
        fetchDemographics(oauthAccessToken, oauthRefreshToken, days),
        fetchTopSearchTerms(oauthAccessToken, oauthRefreshToken, days),
        fetchSubscriberStatus(oauthAccessToken, oauthRefreshToken, days),
      ]);
      await storage.setYoutubeAnalyticsCache(userId, `breakdowns-${days}`, { traffic, devices, countries, demographics, searchTerms, subscriberStatus });
    } catch (err: any) {
      console.error(`[YouTubeScheduler] breakdowns-${days} failed for user ${userId}:`, err?.message);
    }

    try {
      const result = await fetchVideoAnalytics(oauthAccessToken, oauthRefreshToken, days);
      await storage.setYoutubeAnalyticsCache(userId, `video-analytics-${days}`, result);
    } catch (err: any) {
      console.error(`[YouTubeScheduler] video-analytics-${days} failed for user ${userId}:`, err?.message);
    }
  }
}

async function tick(): Promise<void> {
  const nowUtc = new Date();
  const hourUtc = nowUtc.getUTCHours();
  const minUtc = nowUtc.getUTCMinutes();

  if (hourUtc !== 0 || minUtc >= 5) return;

  console.log("[YouTubeScheduler] midnight refresh starting...");

  try {
    const connectedUsers = await storage.getAllConnectedYoutubeUsers();
    console.log(`[YouTubeScheduler] refreshing analytics for ${connectedUsers.length} connected user(s)`);

    for (const user of connectedUsers) {
      await refreshUserAnalytics(user.userId, user.oauthAccessToken, user.oauthRefreshToken, user.uploadsPlaylistId);
      console.log(`[YouTubeScheduler] refreshed user ${user.userId}`);
    }

    console.log("[YouTubeScheduler] midnight refresh complete");
  } catch (err: any) {
    console.error("[YouTubeScheduler] tick error:", err?.message);
  }
}

export function startYouTubeAnalyticsScheduler(): void {
  console.log("[YouTubeScheduler] starting (checks every 5 minutes for midnight window)");
  setTimeout(() => {
    tick();
    setInterval(tick, 5 * 60 * 1000);
  }, 30_000);
}

export { refreshUserAnalytics };
