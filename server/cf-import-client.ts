/**
 * ClickFunnels v2 API client for course structure import.
 * Handles cursor pagination (after=<last_id>), concurrency, and retry with backoff.
 */

import { CF_WORKSPACE_DOMAIN, CF_API_TOKEN, CF_COURSE_ID } from "./clickfunnels";

const baseUrl = () => `https://${CF_WORKSPACE_DOMAIN}/api/v2`;
const authHeaders = () => ({
  Authorization: `Bearer ${CF_API_TOKEN}`,
  Accept: "application/json",
});

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CfCourse {
  id: string;
  name: string;
}

export interface CfDownload {
  id: string;
  public_id: string | null;
  workspace_id: string;
  asset_id: string | null;
  name: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface CfSection {
  id: string;
  title: string;
  parent_id: string | null;
  sort_order: number;
  published_at: string | null;
}

export interface CfLesson {
  id: string;
  title: string;
  sort_order: number;
  published_at: string | null;
  body: string | null;
  current_path: string | null;
  videoUrl?: string;
}

export interface CfTreeNode {
  type: "module" | "lesson";
  cfId: string;
  title: string;
  published: boolean;
  sortOrder: number;
  videoUrl?: string;
  children: CfTreeNode[];
}

export interface CfCourseStructure {
  cfCourseId: string;
  cfCourseTitle: string;
  roots: CfTreeNode[];
  totalSections: number;
  totalLessons: number;
  videosFound: number;
  videosUnavailable: number;
}

// ─── Core fetch with retry on 429 / 5xx ─────────────────────────────────────

async function cfGet(path: string): Promise<any> {
  if (!CF_WORKSPACE_DOMAIN || !CF_API_TOKEN) {
    throw new Error("CF_WORKSPACE_DOMAIN or CF_API_TOKEN is not configured");
  }
  const url = path.startsWith("http") ? path : `${baseUrl()}${path}`;

  let lastErr: Error = new Error("CF API request failed");
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
    const res = await fetch(url, { headers: authHeaders() });
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`CF API ${res.status} from ${path}`);
      continue;
    }
    if (!res.ok) throw new Error(`CF API ${res.status}: ${path}`);
    return res.json();
  }
  throw lastErr;
}

/**
 * Extract a canonical Vimeo player URL from HTML or serialized page data.
 * The import intentionally accepts only explicit vimeo.com URLs, never a bare
 * numeric ID, so unrelated page data cannot be mistaken for a video.
 */
export function extractVimeoUrl(content: unknown): string | null {
  if (typeof content !== "string" || !content) return null;

  const normalized = content
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&");
  const match = normalized.match(
    /(?:https?:)?\/\/(?:player\.)?vimeo\.com\/(?:video\/)?([1-9]\d{4,11})(\?[^"'<>\s\\]*)?/i,
  );
  if (!match) return null;

  const [, videoId, query = ""] = match;
  return `https://player.vimeo.com/video/${videoId}${query}`;
}

function lessonPageUrl(courseId: string, currentPath: string): URL | null {
  if (!CF_WORKSPACE_DOMAIN || !currentPath) return null;
  try {
    const origin = new URL(`https://${CF_WORKSPACE_DOMAIN}`);
    const path = currentPath.startsWith("/") ? currentPath : `/${currentPath}`;
    const url = new URL(
      `/courses/${encodeURIComponent(courseId.toLowerCase())}${path}`,
      origin,
    );
    return url.origin === origin.origin ? url : null;
  } catch {
    return null;
  }
}

/**
 * Fetches a lesson page only from the configured ClickFunnels domain. Redirects
 * are followed manually and never allowed to leave that domain.
 */
async function fetchCfLessonPage(courseId: string, currentPath: string): Promise<string | null> {
  if (!CF_WORKSPACE_DOMAIN) return null;
  let origin: URL;
  try {
    origin = new URL(`https://${CF_WORKSPACE_DOMAIN}`);
  } catch {
    return null;
  }
  const initialUrl = lessonPageUrl(courseId, currentPath);
  if (!initialUrl) return null;
  let url: URL = initialUrl;

  try {
    for (let redirect = 0; redirect < 3; redirect++) {
      const response: Response = await fetch(url.toString(), {
        headers: { ...authHeaders(), Accept: "text/html,application/xhtml+xml" },
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status >= 300 && response.status < 400) {
        const location: string | null = response.headers.get("location");
        if (!location) return null;
        const nextUrl: URL = new URL(location, url);
        if (nextUrl.origin !== origin.origin) return null;
        url = nextUrl;
        continue;
      }
      if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
        return null;
      }
      return await response.text();
    }
  } catch {
    // A protected or unavailable lesson should never stop the rest of an import.
  }
  return null;
}

/** The documented single-lesson endpoint can include body content omitted by list responses. */
async function fetchCfLessonBody(lessonId: string): Promise<string | null> {
  try {
    const raw = await cfGet(`/courses/lessons/${encodeURIComponent(lessonId)}`);
    const lesson = raw?.data ?? raw;
    return typeof lesson?.body === "string" ? lesson.body : null;
  } catch {
    // Some older CF lessons have no body or cannot be fetched individually.
    return null;
  }
}

async function findLessonVimeoUrl(
  courseId: string,
  lesson: CfLesson,
): Promise<string | null> {
  const fromBody = extractVimeoUrl(lesson.body);
  if (fromBody) return fromBody;

  const detailBody = await fetchCfLessonBody(lesson.id);
  const fromDetail = extractVimeoUrl(detailBody);
  if (fromDetail) return fromDetail;

  if (!lesson.current_path) return null;
  const page = await fetchCfLessonPage(courseId, lesson.current_path);
  return extractVimeoUrl(page);
}

// ─── Pagination — loops until a page returns < 20 items ──────────────────────
// CF uses `after=<last_item_id>` cursor pagination for these endpoints.

async function paginateAll<T extends { id: string | number }>(
  basePath: string,
  onPage?: (fetched: number) => void,
): Promise<T[]> {
  const all: T[] = [];
  let after: string | null = null;

  while (true) {
    const sep = basePath.includes("?") ? "&" : "?";
    const url = after ? `${basePath}${sep}after=${after}` : basePath;
    const raw = await cfGet(url);
    const page: T[] = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
    all.push(...page);
    onPage?.(all.length);
    if (page.length < 20) break;
    after = String(page[page.length - 1].id);
  }
  return all;
}

// ─── Course list ──────────────────────────────────────────────────────────────
// CF v2 doesn't expose a course-listing endpoint for this account type.
// We use the configured CF_COURSE_ID and try to fetch its details.

export async function listCfCourses(): Promise<CfCourse[]> {
  if (!CF_COURSE_ID) {
    throw new Error("CF_COURSE_ID is not configured");
  }

  // Try to fetch the course's own record for its title; fall back gracefully.
  let name = `Course ${CF_COURSE_ID}`;
  try {
    const raw = await cfGet(`/courses/${CF_COURSE_ID}`);
    const course = Array.isArray(raw) ? raw[0] : raw;
    if (course?.name || course?.title) {
      name = course.name ?? course.title;
    }
  } catch {
    // 404 or auth error — title unknown, proceed with ID as name
  }

  return [{ id: CF_COURSE_ID, name }];
}

/** Lists downloadable assets available in the configured ClickFunnels workspace. */
export async function listCfDownloads(): Promise<CfDownload[]> {
  if (!CF_COURSE_ID) throw new Error("CF_COURSE_ID is not configured");
  const rawCourse = await cfGet(`/courses/${encodeURIComponent(CF_COURSE_ID)}`);
  const course = Array.isArray(rawCourse) ? rawCourse[0] : (rawCourse?.data ?? rawCourse);
  const workspaceId = course?.workspace_id ?? course?.workspace?.id;
  if (!workspaceId) {
    throw new Error("The configured ClickFunnels course did not include a workspace ID");
  }

  const rawDownloads = await paginateAll<any>(`/workspaces/${encodeURIComponent(String(workspaceId))}/downloads`);
  return rawDownloads.map((download) => ({
    id: String(download.id),
    public_id: download.public_id ? String(download.public_id) : null,
    workspace_id: String(download.workspace_id ?? workspaceId),
    asset_id: download.asset_id ? String(download.asset_id) : null,
    name: String(download.name ?? `Download ${download.id}`),
    created_at: download.created_at ?? null,
    updated_at: download.updated_at ?? null,
  }));
}

// ─── Full course structure (sections + lessons) ───────────────────────────────

export async function getCfCourseStructure(
  cfCourseId: string,
  onProgress: (msg: string) => void,
): Promise<CfCourseStructure> {
  // 1. Fetch ALL sections with pagination
  onProgress("Fetching sections...");
  const rawSections = await paginateAll<any>(
    `/courses/${cfCourseId}/sections`,
    (fetched) => onProgress(`Fetched ${fetched} sections...`),
  );

  const sections: CfSection[] = rawSections.map(s => ({
    id: String(s.id),
    title: s.title ?? `Section ${s.id}`,
    parent_id: s.parent_id ? String(s.parent_id) : null,
    sort_order: s.sort_order ?? 0,
    published_at: s.published_at ?? null,
  }));

  onProgress(`Fetching lessons for ${sections.length} sections...`);

  // 2. Fetch lessons for each section — max 3 concurrent requests
  const lessonMap = new Map<string, CfLesson[]>();
  let fetchedSections = 0;
  let videosChecked = 0;
  let videosFound = 0;

  const queue = [...sections];
  const workers = Array.from({ length: 3 }, async () => {
    while (true) {
      const section = queue.shift();
      if (!section) break;
      const raw = await paginateAll<any>(`/courses/sections/${section.id}/lessons`);
      const lessons: CfLesson[] = raw.map(l => ({
        id: String(l.id),
        title: l.title ?? `Lesson ${l.id}`,
        sort_order: l.sort_order ?? 0,
        published_at: l.published_at ?? null,
        body: typeof l.body === "string" ? l.body : null,
        current_path: typeof l.current_path === "string" ? l.current_path : null,
      }));

      for (const lesson of lessons) {
        const videoUrl = await findLessonVimeoUrl(cfCourseId, lesson);
        if (videoUrl) {
          lesson.videoUrl = videoUrl;
          videosFound++;
        }
        videosChecked++;
        onProgress(`Checking lesson videos (${videosChecked})...`);
      }
      lessonMap.set(section.id, lessons);
      fetchedSections++;
      onProgress(`Fetched lessons for ${fetchedSections} of ${sections.length} sections...`);
    }
  });
  await Promise.all(workers);

  const totalLessons = Array.from(lessonMap.values()).reduce((n, ls) => n + ls.length, 0);
  onProgress(`Building tree (${sections.length} sections, ${totalLessons} lessons)...`);

  const roots = buildCfTree(sections, lessonMap);

  return {
    cfCourseId,
    cfCourseTitle: "",  // filled in by the route from the course list
    roots,
    totalSections: sections.length,
    totalLessons,
    videosFound,
    videosUnavailable: totalLessons - videosFound,
  };
}

// ─── Tree assembly ────────────────────────────────────────────────────────────

function buildCfTree(
  sections: CfSection[],
  lessonMap: Map<string, CfLesson[]>,
): CfTreeNode[] {
  const sectionIds = new Set(sections.map(s => s.id));

  function makeModuleNode(section: CfSection): CfTreeNode {
    const childModules = sections
      .filter(s => s.parent_id === section.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(makeModuleNode);

    const lessonNodes: CfTreeNode[] = (lessonMap.get(section.id) ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(l => ({
        type: "lesson" as const,
        cfId: l.id,
        title: l.title,
        published: l.published_at !== null,
        sortOrder: l.sort_order,
        videoUrl: l.videoUrl,
        children: [],
      }));

    // Mix sub-modules and lessons at the same level, ordered by sortOrder
    const children: CfTreeNode[] = [...childModules, ...lessonNodes].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );

    return {
      type: "module",
      cfId: section.id,
      title: section.title,
      published: section.published_at !== null,
      sortOrder: section.sort_order,
      children,
    };
  }

  return sections
    .filter(s => !s.parent_id || !sectionIds.has(s.parent_id))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(makeModuleNode);
}
