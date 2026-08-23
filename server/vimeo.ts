/**
 * Minimal server-side Vimeo API client used by the ClickFunnels importer.
 * The access token is read from Replit Secrets and is never sent to the client.
 */

const VIMEO_ACCESS_TOKEN = process.env.VIMEO_ACCESS_TOKEN || "";

export interface VimeoVideo {
  id: string;
  name: string;
  url: string;
}

function vimeoHeaders() {
  return {
    Authorization: `Bearer ${VIMEO_ACCESS_TOKEN}`,
    Accept: "application/vnd.vimeo.*+json;version=3.4",
  };
}

function extractVimeoLink(video: any): string | null {
  const candidates = [video?.player_embed_url, video?.link];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    try {
      const parsed = new URL(candidate);
      if (!/(^|\.)vimeo\.com$/i.test(parsed.hostname)) continue;
      if (!parsed.pathname.match(/(?:^|\/)(?:video\/)?[1-9]\d{4,11}(?:\/|$)/)) continue;
      return candidate;
    } catch {
      // Ignore malformed links returned by Vimeo.
    }
  }
  return null;
}

/** List the authenticated account's videos, following Vimeo's paging.next links. */
export async function listVimeoVideos(): Promise<VimeoVideo[]> {
  if (!VIMEO_ACCESS_TOKEN) return [];

  const videos: VimeoVideo[] = [];
  let nextUrl: string | null = "https://api.vimeo.com/me/videos?per_page=100&page=1";

  for (let page = 0; nextUrl && page < 25; page++) {
    const response = await fetch(nextUrl, {
      headers: vimeoHeaders(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Vimeo API ${response.status} while listing videos`);
    }

    const payload = await response.json() as any;
    for (const video of Array.isArray(payload?.data) ? payload.data : []) {
      const url = extractVimeoLink(video);
      if (url && typeof video?.name === "string" && video.name.trim()) {
        videos.push({ id: String(video.uri ?? video.id ?? url), name: video.name, url });
      }
    }
    nextUrl = typeof payload?.paging?.next === "string" ? payload.paging.next : null;
  }

  return videos;
}

export function normalizeVideoTitle(title: string): string {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Match only a unique exact normalized title. A fuzzy match could silently
 * attach the wrong lesson when a library contains multiple similar videos.
 */
export function matchVimeoVideoForLesson(
  lessonTitle: string,
  videos: VimeoVideo[],
): VimeoVideo | null {
  const normalizedTitle = normalizeVideoTitle(lessonTitle);
  if (!normalizedTitle) return null;
  const matches = videos.filter((video) => normalizeVideoTitle(video.name) === normalizedTitle);
  const uniqueMatches = new Map(matches.map((video) => [video.url, video]));
  return uniqueMatches.size === 1 ? [...uniqueMatches.values()][0] : null;
}