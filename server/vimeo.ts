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

export interface VimeoVideoPage {
  videos: VimeoVideo[];
  hasMore: boolean;
}

export interface VimeoTextTrack {
  id: string;
  language: string;
  name: string;
  type: string;
  link: string | null;
}

export interface VimeoTranscriptCue {
  startSeconds: number;
  text: string;
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

export function extractVimeoVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)vimeo\.com$/i.test(parsed.hostname)) return null;
    return parsed.pathname.match(/(?:^|\/)(?:video\/)?(\d+)(?:\/|$)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

function parseTimestamp(value: string): number | null {
  const parts = value.trim().replace(",", ".").split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function captionTextToTranscript(captionText: string): { text: string; cues: VimeoTranscriptCue[] } {
  const normalized = captionText.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const blocks = normalized.split(/\n{2,}/);
  const cues: VimeoTranscriptCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length || /^WEBVTT/i.test(lines[0]) || /^NOTE\b/i.test(lines[0])) continue;
    const timestampLine = lines.find((line) => /-->\s*/.test(line));
    const timestamp = timestampLine?.match(/(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{3})?)\s*-->/)?.[1];
    const startSeconds = timestamp ? parseTimestamp(timestamp) : null;
    const textLines = lines.filter((line) =>
      !/^\d+$/.test(line) &&
      !/^(?:\d+\s*)?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{3})?\s*-->\s*/.test(line),
    );
    const text = textLines
      .join(" ")
      .replace(/<\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{3})?>/g, "")
      .replace(/<\/?[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
    if (text && startSeconds !== null && text !== cues.at(-1)?.text) cues.push({ startSeconds, text });
  }

  const paragraphs: string[] = [];
  for (let index = 0; index < cues.length; index += 8) {
    paragraphs.push(cues.slice(index, index + 8).map((cue) => cue.text).join(" ").replace(/\s+([,.!?;:])/g, "$1").trim());
  }
  return { text: paragraphs.filter(Boolean).join("\n\n"), cues };
}

export async function listVimeoTextTracks(videoId: string): Promise<VimeoTextTrack[]> {
  if (!VIMEO_ACCESS_TOKEN) throw new Error("Vimeo access is not configured");
  const payload = await vimeoGet(`/videos/${encodeURIComponent(videoId)}/texttracks`);
  return (Array.isArray(payload?.data) ? payload.data : [])
    .map((track: any) => ({
      id: resourceId(track?.uri) ?? String(track?.id ?? ""),
      language: typeof track?.language === "string" ? track.language : "",
      name: typeof track?.name === "string" ? track.name : "",
      type: typeof track?.type === "string" ? track.type : "",
      link: typeof track?.link === "string" ? track.link : null,
    }))
    .filter((track: VimeoTextTrack) => track.id && track.link);
}

export async function fetchVimeoTranscript(videoId: string, trackId: string): Promise<{
  text: string;
  language: string;
  name: string;
  cues: VimeoTranscriptCue[];
}> {
  const tracks = await listVimeoTextTracks(videoId);
  const track = tracks.find((candidate) => candidate.id === trackId);
  if (!track?.link) throw new Error("That Vimeo transcript is no longer available");
  const response = await fetch(track.link, {
    headers: vimeoHeaders(),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Vimeo transcript download failed (${response.status})`);
  const raw = await response.text();
  const { text, cues } = captionTextToTranscript(raw);
  if (!text) throw new Error("Vimeo returned an empty transcript");
  return { text, language: track.language, name: track.name, cues };
}

export interface VimeoFolder {
  id: string;
  name: string;
  parentId?: string;
  parentName?: string;
  path: string[];
}

/** List the authenticated account's Vimeo folders, including ancestor paths. */
export async function listVimeoProjects(): Promise<VimeoFolder[]> {
  if (!VIMEO_ACCESS_TOKEN) throw new Error("Vimeo access is not configured");
  const projects: VimeoFolder[] = [];
  let nextUrl: string | null =
    "https://api.vimeo.com/me/folders?per_page=100&page=1&fields=uri,name,metadata.connections.ancestor_path";

  for (let page = 0; nextUrl && page < 25; page++) {
    const payload = await vimeoGet(nextUrl);
    for (const project of Array.isArray(payload?.data) ? payload.data : []) {
      const id = resourceId(project?.uri);
      if (id && typeof project?.name === "string" && project.name.trim()) {
        const ancestors = Array.isArray(project?.metadata?.connections?.ancestor_path)
          ? project.metadata.connections.ancestor_path.filter(
            (ancestor: any) => typeof ancestor?.name === "string" && typeof ancestor?.uri === "string",
          )
          : [];
        const directParent = ancestors[0];
        projects.push({
          id,
          name: project.name,
          parentId: resourceId(directParent?.uri) ?? undefined,
          parentName: directParent?.name,
          path: [...ancestors].reverse().map((ancestor: any) => ancestor.name),
        });
      }
    }
    nextUrl = typeof payload?.paging?.next === "string" ? payload.paging.next : null;
  }
  return projects;
}

/** Return one fast, bounded page of videos from the account or a Vimeo folder. */
export async function listVimeoVideos(
  folderId?: string,
  page = 1,
  perPage = 50,
): Promise<VimeoVideoPage> {
  if (!VIMEO_ACCESS_TOKEN) throw new Error("Vimeo access is not configured");
  const path = folderId
    ? `/me/folders/${encodeURIComponent(folderId)}/videos?per_page=${perPage}&page=${page}`
    : `/me/videos?per_page=${perPage}&page=${page}`;
  const videos: VimeoVideo[] = [];
  const payload = await vimeoGet(path);
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
  return { videos, hasMore: typeof payload?.paging?.next === "string" };
}