/**
 * ClickFunnels v2 API client for course structure import.
 * Handles cursor pagination (after=<last_id>), concurrency, and retry with backoff.
 */

import { JSDOM } from "jsdom";
import puppeteer from "puppeteer-core";
import {
  CF_WORKSPACE_DOMAIN,
  CF_API_TOKEN,
  CF_COURSE_ID,
  CF_SSO_DOMAIN,
  CF_WORKSPACE_ID,
  generateCfSsoUrl,
} from "./clickfunnels";
import { CHROMIUM_LAUNCH_ARGS, getChromiumPath } from "./puppeteerCapture";
import { extractVimeoVideoId, getVimeoVideoMetadata } from "./vimeo";

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
  current_path: string | null;
}

function sectionRoutePath(section: CfSection, allSections: CfSection[]): string | null {
  const byId = new Map(allSections.map((item) => [item.id, item]));
  const chain: string[] = [];
  const visited = new Set<string>();
  let current: CfSection | undefined = section;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    // ClickFunnels' root course section is structural and is not part of learner URLs.
    if (current.parent_id && current.current_path) {
      chain.unshift(...current.current_path.split("/").filter(Boolean));
    }
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return chain.length ? `/${chain.join("/")}` : null;
}

export interface CfLesson {
  id: string;
  title: string;
  sort_order: number;
  published_at: string | null;
  body: string | null;
  current_path: string | null;
  videoUrl?: string;
  content?: string | null;
  description?: string | null;
  thumbnailUrl?: string | null;
  resources?: CfRecoveredResource[];
  recoveryStatus?: CfContentRecoveryStatus;
  sourceUrl?: string | null;
}

export type CfContentRecoveryStatus = "recovered" | "partial" | "unavailable";

export interface CfRecoveredResource {
  name: string;
  url: string;
  kind: "link" | "pdf";
}

export interface CfTreeNode {
  type: "module" | "lesson";
  cfId: string;
  title: string;
  isStructuralRoot?: boolean;
  published: boolean;
  sortOrder: number;
  videoUrl?: string;
  content?: string | null;
  thumbnailUrl?: string | null;
  resources?: CfRecoveredResource[];
  recoveryStatus?: CfContentRecoveryStatus;
  sourceUrl?: string | null;
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
  contentRecovered: number;
  contentPartial: number;
  contentUnavailable: number;
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

export function extractVideoUrl(content: unknown): string | null {
  if (typeof content !== "string" || !content) return null;
  const normalized = content
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&")
    .replace(/&#x2F;/gi, "/");
  const vimeo = extractVimeoUrl(normalized);
  if (vimeo) return vimeo;
  const candidates = [
    /(?:https?:)?\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?[^"'<>\s]*v=|embed\/|shorts\/)|youtu\.be\/)[A-Za-z0-9_-]{6,}(?:\?[^"'<>\s\\]*)?/i,
    /(?:https?:)?\/\/(?:fast\.)?wistia\.(?:net|com)\/(?:embed\/iframe\/|medias\/)[A-Za-z0-9_-]+(?:\?[^"'<>\s\\]*)?/i,
    /https?:\/\/[^"'<>\s\\]+\.(?:mp4|m3u8)(?:\?[^"'<>\s\\]*)?/i,
  ];
  for (const pattern of candidates) {
    const match = normalized.match(pattern);
    if (match) return match[0].startsWith("//") ? `https:${match[0]}` : match[0];
  }
  return null;
}

function safeHttpUrl(value: string | null | undefined, baseUrl?: string): string | null {
  if (!value) return null;
  try {
    const parsed = baseUrl ? new URL(value, baseUrl) : new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function isLikelyDownload(url: URL, anchor: HTMLAnchorElement): boolean {
  return anchor.hasAttribute("download")
    || /\.(?:pdf|docx?|xlsx?|pptx?|zip|csv|txt)(?:$|\?)/i.test(url.toString())
    || /download|worksheet|workbook|guide|resource|template/i.test(cleanText(anchor.textContent));
}

function resourceName(anchor: HTMLAnchorElement, url: URL): string {
  const label = cleanText(anchor.textContent);
  if (label && label.length <= 160) return label;
  return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "") || url.hostname;
}

function sanitizeRecoveredElement(element: Element, baseUrl?: string) {
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    if (name.startsWith("on") || ["id", "class", "style", "srcset", "data-src"].includes(name)) {
      element.removeAttribute(attribute.name);
    }
  }
  for (const name of ["href", "src"]) {
    if (!element.hasAttribute(name)) continue;
    const safe = safeHttpUrl(element.getAttribute(name), baseUrl);
    if (safe) element.setAttribute(name, safe);
    else element.removeAttribute(name);
  }
  if (element.tagName === "A" && element.hasAttribute("href")) {
    element.setAttribute("target", "_blank");
    element.setAttribute("rel", "noopener noreferrer");
  }
}

export function extractCfLessonContent(
  source: unknown,
  sourceUrl?: string,
): {
  content: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  resources: CfRecoveredResource[];
  status: CfContentRecoveryStatus;
} {
  if (typeof source !== "string" || !source.trim()) {
    return { content: null, videoUrl: null, description: null, thumbnailUrl: null, resources: [], status: "unavailable" };
  }
  const document = new JSDOM(source).window.document;
  const rawDescription = cleanText(
    document.querySelector('meta[name="description"], meta[property="og:description"]')?.getAttribute("content")
      || "",
  ).slice(0, 2_000);
  const metadataDescription = rawDescription
    && !/fearless marketing lab is your go-to hub/i.test(rawDescription)
    ? rawDescription
    : null;
  const explicitRoot = document.querySelector(
    "[data-lesson-content], .course-lesson-content, .lesson-content, article, main",
  );
  const mediaElement = document.querySelector(
    "iframe[src*='vimeo'], iframe[src*='youtube'], iframe[src*='wistia'], video",
  );
  // ClickFunnels course lessons are commonly rendered inside page-builder
  // containers rather than semantic <main>/<article> elements. Anchor the
  // extraction to the container holding the lesson media so global course
  // navigation and the lesson sidebar are not imported as replay content.
  const mediaRoot = mediaElement?.closest(".containerInnerV2, .containerInner");
  const root = explicitRoot ?? mediaRoot ?? document.body;
  const visibleDescription = [...root.querySelectorAll("p, li")]
    .map((element) => cleanText(element.textContent))
    .find((text) =>
      text.length >= 30
      && !/click here to|download|fearless marketing lab is your go-to hub/i.test(text),
    )
    ?.slice(0, 2_000) ?? null;
  const description = metadataDescription ?? visibleDescription;
  root.querySelectorAll("script,style,noscript,nav,header,footer,form").forEach((node) => node.remove());

  const videoUrl = extractVideoUrl(source);
  const thumbnailUrl = [...root.querySelectorAll("img")]
    .map((image) => safeHttpUrl(image.getAttribute("src") || image.getAttribute("data-src"), sourceUrl))
    .find((url): url is string => !!url) ?? null;
  const resources: CfRecoveredResource[] = [];
  const seen = new Set<string>();
  root.querySelectorAll("a[href]").forEach((node) => {
    const anchor = node as HTMLAnchorElement;
    const href = safeHttpUrl(anchor.getAttribute("href"), sourceUrl);
    if (!href || href === videoUrl || seen.has(href)) return;
    const url = new URL(href);
    if (sourceUrl) {
      const sourceLocation = new URL(sourceUrl);
      if (url.origin === sourceLocation.origin && url.pathname === sourceLocation.pathname) return;
    }
    seen.add(href);
    resources.push({
      name: resourceName(anchor, url),
      url: href,
      kind: isLikelyDownload(url, anchor) ? "pdf" : "link",
    });
    // Resource links belong in the replay's resource list, not duplicated in
    // the lesson body. Remove the entire anchor so both its URL and visible
    // link text stay out of imported replay content.
    anchor.remove();
  });

  const allowed = new Set([
    "P", "BR", "B", "I", "EM", "STRONG", "UL", "OL", "LI", "A",
    "H1", "H2", "H3", "H4", "BLOCKQUOTE", "CODE", "PRE", "HR", "IMG", "SPAN",
  ]);
  root.querySelectorAll("*").forEach((element) => {
    if (!allowed.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }
    sanitizeRecoveredElement(element, sourceUrl);
  });
  const meaningfulText = cleanText(root.textContent);
  const content = meaningfulText.length >= 20 ? root.innerHTML.trim() : null;
  const pieces = Number(!!content) + Number(!!videoUrl) + Number(!!thumbnailUrl) + Number(resources.length > 0);
  return {
    content,
    videoUrl,
    description,
    thumbnailUrl,
    resources: resources.slice(0, 50),
    status: pieces >= 2 ? "recovered" : pieces === 1 ? "partial" : "unavailable",
  };
}

function lessonPageUrl(
  coursePath: string | null,
  sectionPath: string | null,
  currentPath: string,
): URL | null {
  if (!CF_SSO_DOMAIN || !currentPath) return null;
  try {
    const origin = new URL(`https://${CF_SSO_DOMAIN}`);
    const segments = [coursePath, sectionPath, currentPath]
      .filter((path): path is string => !!path)
      .flatMap((path) => path.split("/").filter(Boolean));
    const url = new URL(`/${segments.join("/")}`, origin);
    return url.origin === origin.origin ? url : null;
  } catch {
    return null;
  }
}

/**
 * Fetches a lesson page only from the configured ClickFunnels domain. Redirects
 * are followed manually and never allowed to leave that domain.
 */
async function fetchCfLessonPage(
  coursePath: string | null,
  sectionPath: string | null,
  currentPath: string,
  session?: CfRecoverySession,
): Promise<{ html: string; url: string } | null> {
  const initialUrl = lessonPageUrl(coursePath, sectionPath, currentPath);
  return initialUrl ? fetchCfLessonPageUrl(initialUrl, session) : null;
}

async function fetchCfLessonPageUrl(
  initialUrl: URL,
  session?: CfRecoverySession,
): Promise<{ html: string; url: string } | null> {
  if (!CF_SSO_DOMAIN) return null;
  let origin: URL;
  try {
    origin = new URL(`https://${CF_SSO_DOMAIN}`);
  } catch {
    return null;
  }
  if (initialUrl.origin !== origin.origin) return null;
  let url: URL = initialUrl;

  try {
    for (let redirect = 0; redirect < 3; redirect++) {
      const response: Response = await fetch(url.toString(), {
        headers: session
          ? authenticatedLessonPageHeaders(session)
          : { ...authHeaders(), Accept: "text/html,application/xhtml+xml" },
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
      return { html: await response.text(), url: url.toString() };
    }
  } catch {
    // A protected or unavailable lesson should never stop the rest of an import.
  }
  return null;
}

function isUnavailableLessonHtml(html: string): boolean {
  const document = new JSDOM(html).window.document;
  const title = cleanText(document.title).toLowerCase();
  const body = cleanText(document.body?.textContent).toLowerCase();
  return title.includes("page not found")
    || body.includes("course theme - page not found")
    || body.includes("you don't have access to this course");
}

type CfRecoverySession = {
  cookie: string;
  userAgent: string;
  referer: string;
};

export function authenticatedLessonPageHeaders(session: CfRecoverySession): Record<string, string> {
  return {
    Cookie: session.cookie,
    "User-Agent": session.userAgent,
    Referer: session.referer,
    Accept: "text/html,application/xhtml+xml",
  };
}

async function createAuthenticatedRecoverySession(
  email: string,
  targetPath: string | null,
): Promise<CfRecoverySession | null> {
  if (!email || !targetPath || !CF_SSO_DOMAIN) return null;
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const targetUrl = new URL(targetPath, `https://${CF_SSO_DOMAIN}`);
    if (targetUrl.hostname !== CF_SSO_DOMAIN) {
      throw new Error("ClickFunnels recovery target is outside the configured workspace");
    }
    const targetUrlString = targetUrl.toString();
    const ssoUrl = generateCfSsoUrl(email, targetUrlString);
    browser = await puppeteer.launch({
      executablePath: getChromiumPath(),
      args: CHROMIUM_LAUNCH_ARGS,
      headless: true,
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(ssoUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const finalUrl = new URL(page.url());
    if (finalUrl.hostname !== CF_SSO_DOMAIN) {
      throw new Error("ClickFunnels SSO redirected outside the configured workspace");
    }
    if (finalUrl.pathname.startsWith("/contacts/sign_in")) {
      throw new Error("the current admin email is not signed in to the ClickFunnels customer center");
    }
    const cookies = await page.cookies();
    const sessionCookie = cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");
    if (!sessionCookie) throw new Error("ClickFunnels did not create an authenticated session");
    return {
      cookie: sessionCookie,
      userAgent: await page.evaluate(() => navigator.userAgent),
      referer: targetUrlString,
    };
  } catch (error) {
    console.warn("[CF Import] Authenticated browser recovery unavailable:", error instanceof Error ? error.message : error);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}

async function recoverTreeLesson(
  node: CfTreeNode,
  session?: CfRecoverySession,
): Promise<void> {
  const startedAt = Date.now();
  let apiDurationMs = 0;
  let pageDurationMs = 0;
  let vimeoDurationMs = 0;
  let apiBody: string | null = null;
  const apiStartedAt = Date.now();
  try {
    const raw = await cfGet(`/courses/lessons/${encodeURIComponent(node.cfId)}`);
    const lesson = raw?.data ?? raw;
    apiBody = typeof lesson?.body === "string" ? lesson.body : null;
  } catch {
    // Protected page recovery can still succeed when the single-lesson API is unavailable.
  } finally {
    apiDurationMs = Date.now() - apiStartedAt;
  }

  let recovered = extractCfLessonContent(apiBody);
  if (node.sourceUrl && session) {
    const pageStartedAt = Date.now();
    try {
      const sourceUrl = new URL(node.sourceUrl);
      const page = await fetchCfLessonPageUrl(sourceUrl, session);
      if (page && !isUnavailableLessonHtml(page.html)) {
        const pageRecovered = extractCfLessonContent(page.html, page.url);
        if (pageRecovered.status !== "unavailable") recovered = pageRecovered;
      }
    } catch {
      // Invalid or unavailable source URLs fall back to API lesson content.
    } finally {
      pageDurationMs = Date.now() - pageStartedAt;
    }
  }

  node.videoUrl = recovered.videoUrl ?? undefined;
  node.content = recovered.content;
  node.description = recovered.description;
  node.thumbnailUrl = recovered.thumbnailUrl;
  node.resources = recovered.resources;
  node.recoveryStatus = recovered.status;

  const vimeoId = node.videoUrl ? extractVimeoVideoId(node.videoUrl) : null;
  if (vimeoId && (!node.description || !node.thumbnailUrl)) {
    const vimeoStartedAt = Date.now();
    try {
      const metadata = await getVimeoVideoMetadata(vimeoId);
      node.description ||= metadata.description;
      node.thumbnailUrl ||= metadata.thumbnailUrl;
    } catch {
      // Imported content remains valid when optional Vimeo metadata is unavailable.
    } finally {
      vimeoDurationMs = Date.now() - vimeoStartedAt;
    }
  }
  console.log(
    `[CF Import] lesson ${node.cfId} recovery ${Date.now() - startedAt}ms`
    + ` (api ${apiDurationMs}ms, page ${pageDurationMs}ms, vimeo ${vimeoDurationMs}ms)`,
  );
}

/**
 * Recovers only lessons already selected in the import preview. This avoids
 * re-fetching every section and lesson list for the full course at execution.
 */
export async function recoverSelectedCfLessonTree(
  tree: CfTreeNode[],
  recoveryEmail?: string,
  onProgress: (completed: number, total: number) => void = () => undefined,
): Promise<CfTreeNode[]> {
  const lessons: CfTreeNode[] = [];
  const collect = (nodes: CfTreeNode[]) => {
    for (const node of nodes) {
      if (node.type === "lesson") lessons.push(node);
      else collect(node.children);
    }
  };
  collect(tree);
  if (!lessons.length) return tree;

  const recoveryTarget = lessons.find((lesson) => lesson.sourceUrl)?.sourceUrl ?? null;
  const session = recoveryEmail && recoveryTarget
    ? await createAuthenticatedRecoverySession(recoveryEmail, recoveryTarget)
    : null;
  let completed = 0;
  const queue = [...lessons];
  const workerCount = Math.min(session ? 12 : 8, lessons.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const lesson = queue.shift();
      if (!lesson) break;
      await recoverTreeLesson(lesson, session ?? undefined);
      completed += 1;
      onProgress(completed, lessons.length);
    }
  });
  await Promise.all(workers);
  return tree;
}

async function recoverLessonContent(
  coursePath: string | null,
  sectionPath: string | null,
  lesson: CfLesson,
  session?: CfRecoverySession,
): Promise<void> {
  let recovered = extractCfLessonContent(lesson.body);
  if (lesson.current_path && session) {
    const page = await fetchCfLessonPage(
      coursePath,
      sectionPath,
      lesson.current_path,
      session,
    );
    if (page) {
      if (!isUnavailableLessonHtml(page.html)) {
        const pageRecovered = extractCfLessonContent(page.html, page.url);
        if (pageRecovered.status !== "unavailable") recovered = pageRecovered;
      }
      lesson.sourceUrl = page.url;
    }
  }
  lesson.videoUrl = recovered.videoUrl ?? undefined;
  lesson.content = recovered.content;
  lesson.description = recovered.description;
  lesson.thumbnailUrl = recovered.thumbnailUrl;
  const vimeoId = lesson.videoUrl ? extractVimeoVideoId(lesson.videoUrl) : null;
  if (vimeoId && (!lesson.description || !lesson.thumbnailUrl)) {
    try {
      const metadata = await getVimeoVideoMetadata(vimeoId);
      lesson.description ||= metadata.description;
      lesson.thumbnailUrl ||= metadata.thumbnailUrl;
    } catch {
      // Page recovery remains useful even when Vimeo metadata is unavailable.
    }
  }
  lesson.resources = recovered.resources;
  lesson.recoveryStatus = recovered.status;
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

/**
 * Lists downloadable assets available in the configured ClickFunnels workspace.
 *
 * Workspace ID resolution order:
 *   1. CF_WORKSPACE_ID environment variable (preferred — set this as a secret)
 *   2. workspace_id field on the course record (not present for all account types)
 */
export async function listCfDownloads(): Promise<CfDownload[]> {
  if (!CF_WORKSPACE_DOMAIN || !CF_API_TOKEN) {
    throw new Error("ClickFunnels is not configured (CF_WORKSPACE_DOMAIN / CF_API_TOKEN missing)");
  }

  // 1. Prefer explicitly configured workspace ID
  let workspaceId: string = CF_WORKSPACE_ID;

  // 2. Fall back: try to read it from the course record
  if (!workspaceId && CF_COURSE_ID) {
    try {
      const rawCourse = await cfGet(`/courses/${encodeURIComponent(CF_COURSE_ID)}`);
      const course = Array.isArray(rawCourse) ? rawCourse[0] : (rawCourse?.data ?? rawCourse);
      const discovered = course?.workspace_id ?? course?.workspace?.id;
      if (discovered) workspaceId = String(discovered);
    } catch {
      // Swallow — fall through to the helpful error below
    }
  }

  if (!workspaceId) {
    throw new Error(
      "Could not determine the ClickFunnels workspace ID. " +
      "Add CF_WORKSPACE_ID as a Replit Secret (find it in your ClickFunnels workspace settings).",
    );
  }

  const rawDownloads = await paginateAll<any>(`/workspaces/${encodeURIComponent(workspaceId)}/downloads`);
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
  recoveryEmail?: string,
  selectedLessonIds?: ReadonlySet<string>,
): Promise<CfCourseStructure> {
  let coursePath: string | null = null;
  try {
    const rawCourse = await cfGet(`/courses/${encodeURIComponent(cfCourseId)}`);
    const course = rawCourse?.data ?? rawCourse;
    coursePath = typeof course?.current_path === "string" ? course.current_path : null;
  } catch {
    // Structure import still works when course metadata is unavailable.
  }
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
    current_path: typeof s.current_path === "string" ? s.current_path : null,
  }));

  onProgress(`Fetching lesson lists for ${sections.length} sections...`);

  // 2. Fetch lesson lists independently from content recovery. Keeping these
  // API calls separate prevents one section with hundreds of lessons from
  // serializing all browser work behind a single worker.
  const lessonMap = new Map<string, CfLesson[]>();
  let fetchedSections = 0;
  let videosChecked = 0;
  let videosFound = 0;
  let contentRecovered = 0;
  let contentPartial = 0;
  let contentUnavailable = 0;

  const sectionQueue = [...sections];
  const listWorkers = Array.from({ length: Math.min(8, sections.length || 1) }, async () => {
    while (true) {
      const section = sectionQueue.shift();
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
      lessonMap.set(section.id, lessons);
      fetchedSections++;
      onProgress(`Fetched lesson lists for ${fetchedSections} of ${sections.length} sections...`);
    }
  });
  await Promise.all(listWorkers);

  const allLessons = sections.flatMap((section) =>
    (lessonMap.get(section.id) ?? []).map((lesson) => ({ section, lesson })),
  );
  const recoveryQueue = selectedLessonIds
    ? allLessons.filter(({ lesson }) => selectedLessonIds.has(lesson.id))
    : allLessons;
  const totalLessons = allLessons.length;
  const recoveryTotal = recoveryQueue.length;
  if (recoveryTotal > 0) {
    onProgress(`Opening an authenticated recovery session for ${recoveryTotal} selected lessons...`);
  }
  const recoverySession = recoveryEmail && recoveryTotal > 0
    ? await createAuthenticatedRecoverySession(recoveryEmail, coursePath)
    : null;
  if (recoveryTotal > 0 && !recoverySession) {
    onProgress("Authenticated recovery unavailable; using API content only...");
  }

  const recoveryWorkerCount = recoverySession
    ? Math.min(24, recoveryTotal || 1)
    : Math.min(12, recoveryTotal || 1);
  const recoveryWorkers = Array.from({ length: recoveryWorkerCount }, async () => {
    while (true) {
      const item = recoveryQueue.shift();
      if (!item) break;
      await recoverLessonContent(
        coursePath,
        sectionRoutePath(item.section, sections),
        item.lesson,
        recoverySession ?? undefined,
      );
      if (item.lesson.videoUrl) videosFound++;
      if (item.lesson.recoveryStatus === "recovered") contentRecovered++;
      else if (item.lesson.recoveryStatus === "partial") contentPartial++;
      else contentUnavailable++;
      videosChecked++;
      onProgress(`Recovering selected lesson content (${videosChecked} of ${recoveryTotal})...`);
    }
  });
  await Promise.all(recoveryWorkers);

  onProgress(`Building tree (${sections.length} sections, ${totalLessons} lessons)...`);

  const roots = buildCfTree(sections, lessonMap, coursePath);

  return {
    cfCourseId,
    cfCourseTitle: "",  // filled in by the route from the course list
    roots,
    totalSections: sections.length,
    totalLessons,
    videosFound,
    videosUnavailable: totalLessons - videosFound,
    contentRecovered,
    contentPartial,
    contentUnavailable,
  };
}

// ─── Tree assembly ────────────────────────────────────────────────────────────

function buildCfTree(
  sections: CfSection[],
  lessonMap: Map<string, CfLesson[]>,
  coursePath: string | null,
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
        content: l.content,
        description: l.description,
        thumbnailUrl: l.thumbnailUrl,
        resources: l.resources,
        recoveryStatus: l.recoveryStatus,
        sourceUrl: l.sourceUrl ?? (
          l.current_path
            ? lessonPageUrl(coursePath, sectionRoutePath(section, sections), l.current_path)?.toString() ?? null
            : null
        ),
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
      isStructuralRoot: !section.parent_id || !sectionIds.has(section.parent_id),
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
