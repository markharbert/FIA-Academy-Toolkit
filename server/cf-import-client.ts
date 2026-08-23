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
}

export interface CfTreeNode {
  type: "module" | "lesson";
  cfId: string;
  title: string;
  published: boolean;
  sortOrder: number;
  children: CfTreeNode[];
}

export interface CfCourseStructure {
  cfCourseId: string;
  cfCourseTitle: string;
  roots: CfTreeNode[];
  totalSections: number;
  totalLessons: number;
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

  const queue = [...sections];
  const workers = Array.from({ length: 3 }, async () => {
    while (true) {
      const section = queue.shift();
      if (!section) break;
      const raw = await paginateAll<any>(`/courses/sections/${section.id}/lessons`);
      lessonMap.set(section.id, raw.map(l => ({
        id: String(l.id),
        title: l.title ?? `Lesson ${l.id}`,
        sort_order: l.sort_order ?? 0,
        published_at: l.published_at ?? null,
      })));
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
