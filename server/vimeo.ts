/**
 * Minimal server-side Vimeo API client used by the ClickFunnels importer.
 * The access token is read from Replit Secrets and is never sent to the client.
 */

const VIMEO_ACCESS_TOKEN = process.env.VIMEO_ACCESS_TOKEN || "";

export interface VimeoVideo {
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
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

async function vimeoGet(path: string): Promise<any> {
  if (!VIMEO_ACCESS_TOKEN) return [];
  const response = await fetch(
    path.startsWith("http") ? path : `https://api.vimeo.com${path}`,
    {
      headers: vimeoHeaders(),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error(`Vimeo API ${response.status}`);
  return response.json();
}

function resourceId(uri: unknown): string | null {
  if (typeof uri !== "string") return null;
  const match = uri.match(/\/(\d+)(?:\/)?$/);
  return match?.[1] ?? null;
}

/** List the authenticated account's Vimeo folders (Projects). */
export async function listVimeoProjects(): Promise<Array<{ id: string; name: string }>> {
  if (!VIMEO_ACCESS_TOKEN) throw new Error("Vimeo access is not configured");
  const projects: Array<{ id: string; name: string }> = [];
  let nextUrl: string | null = "https://api.vimeo.com/me/projects?per_page=100&page=1";

  for (let page = 0; nextUrl && page < 25; page++) {
    const payload = await vimeoGet(nextUrl);
    for (const project of Array.isArray(payload?.data) ? payload.data : []) {
      const id = resourceId(project?.uri);
      if (id && typeof project?.name === "string" && project.name.trim()) {
        projects.push({ id, name: project.name });
      }
    }
    nextUrl = typeof payload?.paging?.next === "string" ? payload.paging.next : null;
  }
  return projects;
}

/** List videos from the account or one Vimeo folder, following pagination. */
export async function listVimeoVideos(projectId?: string): Promise<VimeoVideo[]> {
  if (!VIMEO_ACCESS_TOKEN) throw new Error("Vimeo access is not configured");
  const path = projectId
    ? `/me/projects/${encodeURIComponent(projectId)}/videos?per_page=100&page=1`
    : `/me/videos?per_page=100&page=1`;
  const videos: VimeoVideo[] = [];
  let nextUrl: string | null = path;

  for (let page = 0; nextUrl && page < 25; page++) {
    const payload = await vimeoGet(nextUrl);
    for (const video of Array.isArray(payload?.data) ? payload.data : []) {
      const url = extractVimeoLink(video);
      if (url && typeof video?.name === "string" && video.name.trim()) {
        const pictures = Array.isArray(video?.pictures?.sizes) ? video.pictures.sizes : [];
        videos.push({
          id: String(video.uri ?? video.id ?? url),
          name: video.name,
          url,
          thumbnailUrl: pictures.at(-1)?.link,
        });
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