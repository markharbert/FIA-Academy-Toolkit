import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import Player from "@vimeo/player";
import {
  ChevronLeft, ChevronRight, ChevronDown, CheckCircle2, Circle, ExternalLink, Link,
  BookOpen, Clock, SkipBack, SkipForward, FileText,
} from "lucide-react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";
import { buildCourseModuleTree, flattenCourseModuleTree, type CourseModuleTree } from "@shared/course-structure";
import { CourseIcon } from "@/lib/course-icons";

/** Restrict resource/video URLs to http(s) only — prevents javascript: hrefs. */
function safeHref(url: string | null | undefined): string {
  if (!url) return "#";
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? url : "#";
  } catch {
    return "#";
  }
}

// ─── Palette ──────────────────────────────────────────────────────────────────
const SIDEBAR_BG  = "linear-gradient(180deg, #1b274b 0%, #151f3d 100%)";
const SIDEBAR_BDR = "rgba(255,255,255,0.12)";

type Resource = {
  id: string;
  name: string;
  url: string;
  subtitle: string | null;
  kind: string;
};

type LessonDetail = {
  id: string;
  courseId: string;
  moduleId: string;
  title: string;
  videoUrl: string | null;
  transcriptText: string | null;
  transcriptCues: LessonTranscriptCue[] | null;
  transcriptChapters: LessonChapter[] | null;
  content: string | null;
  status: string;
  durationMinutes: number | null;
  resources: Resource[];
};

type LessonChapter = {
  startSeconds: number;
  title: string;
};

type LessonTranscriptCue = {
  startSeconds: number;
  text: string;
};

type CourseLesson = {
  id: string;
  title: string;
  status: string;
  sortOrder: number;
  completed: boolean;
  lastAccessedAt: string | null;
};

type CourseModule = {
  id: string;
  parentModuleId: string | null;
  title: string;
  sortOrder: number;
  lessons: CourseLesson[];
};

type CourseStructure = {
  course: {
    id: string;
    title: string;
    status: string;
    icon?: string | null;
  };
  modules: CourseModule[];
};

async function apiFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || res.statusText);
  }
  return res.json();
}

function getEmbedUrl(videoUrl: string): string | null {
  if (!videoUrl) return null;
  if (videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be")) {
    const videoId = videoUrl.includes("youtu.be/")
      ? videoUrl.split("youtu.be/")[1]?.split("?")[0]
      : new URLSearchParams(videoUrl.split("?")[1] || "").get("v");
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  }
  if (videoUrl.includes("vimeo.com")) {
    try {
      const url = new URL(videoUrl);
      const vimeoId = url.pathname.match(/(?:^|\/)(?:video\/)?(\d+)(?:\/|$)/)?.[1];
      if (!vimeoId) return null;
      const params = new URLSearchParams(url.search);
      params.set("api", "1");
      return `https://player.vimeo.com/video/${vimeoId}?${params.toString()}`;
    } catch {
      return null;
    }
  }
  return null;
}

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = (total % 60).toString().padStart(2, "0");
  return hours
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${remaining}`
    : `${minutes}:${remaining}`;
}

export default function TrainingLessonPage() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptTab, setTranscriptTab] = useState<"chapters" | "transcript">("chapters");
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const vimeoPlayerRef = useRef<HTMLIFrameElement>(null);
  const vimeoPlayerApiRef = useRef<Player | null>(null);
  const transcriptScrollContainerRef = useRef<HTMLDivElement>(null);
  const activeTranscriptWordRef = useRef<HTMLSpanElement>(null);
  const lastScrolledWordRef = useRef<number | null>(null);

  // Load course structure (for sidebar nav + prev/next)
  const { data: courseData, isError: isCourseError } = useQuery<CourseStructure>({
    queryKey: ["/api/training/courses", courseId],
    queryFn: () => apiFetch(`/api/training/courses/${courseId}`),
    enabled: !!courseId,
  });

  // Load lesson content
  const { data: lesson, isLoading, isError: isLessonError } = useQuery<LessonDetail>({
    queryKey: ["/api/training/lessons", lessonId],
    queryFn: () => apiFetch(`/api/training/lessons/${lessonId}?courseId=${encodeURIComponent(courseId)}`),
    enabled: !!lessonId,
  });

  // Mark progress
  const progressMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      apiFetch(`/api/training/lessons/${id}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/training/courses", courseId] });
    },
  });

  const moduleTree = courseData ? buildCourseModuleTree(courseData.modules) : [];

  // Flatten lessons in the nested outline order for prev/next navigation.
  const allLessons: CourseLesson[] = flattenCourseModuleTree(moduleTree).flatMap((module) => module.lessons);
  const currentIndex = allLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;
  const currentLesson = allLessons[currentIndex];
  const isCompleted = currentLesson?.completed ?? false;

  // Progress stats
  const completedCount = allLessons.filter((l) => l.completed).length;
  const totalCount = allLessons.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const embedUrl = lesson?.videoUrl ? getEmbedUrl(lesson.videoUrl) : null;
  const isVimeoLesson = !!lesson?.videoUrl?.includes("vimeo.com");
  const chapters = lesson?.transcriptChapters ?? [];
  const transcriptCues = lesson?.transcriptCues ?? [];
  const transcriptText = lesson?.transcriptText ?? "";
  const transcriptTokens = transcriptText.split(/(\s+)/);
  let transcriptWordCount = 0;
  const transcriptTokenWordIndexes = transcriptTokens.map((token) => {
    if (!token || /^\s+$/.test(token)) return -1;
    return transcriptWordCount++;
  });
  const activeCueIndex = transcriptCues.findIndex((cue, index) => {
    const nextCue = transcriptCues[index + 1];
    const cueEnd = nextCue?.startSeconds ?? cue.startSeconds + 8;
    return videoCurrentTime >= cue.startSeconds && videoCurrentTime < cueEnd;
  });
  const activeCue = activeCueIndex >= 0 ? transcriptCues[activeCueIndex] : null;
  const activeCueNextStart = activeCueIndex >= 0
    ? (transcriptCues[activeCueIndex + 1]?.startSeconds ?? activeCue!.startSeconds + 8)
    : 0;
  const activeCueWords = activeCue?.text.trim().split(/\s+/).filter(Boolean) ?? [];
  const activeWordInCue = activeCue
    ? Math.min(
        activeCueWords.length - 1,
        Math.floor(
          Math.min(0.999, Math.max(0, (videoCurrentTime - activeCue.startSeconds) / Math.max(0.1, activeCueNextStart - activeCue.startSeconds))) *
            activeCueWords.length,
        ),
      )
    : -1;
  const activeWordIndex = activeCue
    ? transcriptCues
        .slice(0, activeCueIndex)
        .reduce((count, cue) => count + cue.text.trim().split(/\s+/).filter(Boolean).length, 0) + activeWordInCue
    : -1;

  useEffect(() => {
    if (!transcriptOpen || transcriptTab !== "transcript" || activeWordIndex < 0) return;
    if (lastScrolledWordRef.current === activeWordIndex) return;
    lastScrolledWordRef.current = activeWordIndex;
    const container = transcriptScrollContainerRef.current;
    const word = activeTranscriptWordRef.current;
    if (!container || !word) return;

    const containerRect = container.getBoundingClientRect();
    const wordRect = word.getBoundingClientRect();
    const wordOutsideViewport = wordRect.top < containerRect.top || wordRect.bottom > containerRect.bottom;
    if (wordOutsideViewport) {
      const centeredOffset = wordRect.top - containerRect.top - (container.clientHeight - wordRect.height) / 2;
      container.scrollBy({ top: centeredOffset, behavior: "smooth" });
    }
  }, [activeWordIndex, transcriptOpen, transcriptTab]);

  useEffect(() => {
    setTranscriptOpen(false);
    setTranscriptTab("chapters");
    setVideoCurrentTime(0);
    lastScrolledWordRef.current = null;
  }, [lessonId]);

  useEffect(() => {
    const iframe = vimeoPlayerRef.current;
    if (!iframe || !isVimeoLesson || !embedUrl) return;

    const player = new Player(iframe);
    const handleTimeUpdate = ({ seconds }: { seconds: number }) => setVideoCurrentTime(seconds);
    vimeoPlayerApiRef.current = player;
    player.on("timeupdate", handleTimeUpdate);

    return () => {
      player.off("timeupdate", handleTimeUpdate);
      if (vimeoPlayerApiRef.current === player) vimeoPlayerApiRef.current = null;
    };
  }, [embedUrl, isVimeoLesson]);

  const seekToChapter = (startSeconds: number) => {
    if (!isVimeoLesson) return;
    void vimeoPlayerApiRef.current?.setCurrentTime(startSeconds);
    vimeoPlayerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Find current module for breadcrumb
  const currentModule = courseData?.modules.find((m) =>
    m.lessons.some((l) => l.id === lessonId)
  );

  const renderModuleNavigation = (module: CourseModuleTree<CourseModule>, depth = 0) => (
    <div key={module.id} className="mb-1" style={depth ? { marginLeft: `${depth * 10}px` } : undefined}>
      <div className="px-2 py-1.5">
        <p
          className="text-[10px] font-bold uppercase tracking-widest truncate"
          style={{ color: "#ffffff" }}
        >
          {module.title}
        </p>
      </div>

      {module.lessons.map((lesson) => {
        const isActive = lesson.id === lessonId;
        return (
          <button
            key={lesson.id}
            onClick={() => setLocation(`/training/${courseId}/lessons/${lesson.id}`)}
            className={cn(
              "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left transition-colors",
              isActive ? "bg-amber-500/20 text-amber-100" : "hover:bg-white/5",
            )}
            style={!isActive ? { color: "#ffffff" } : undefined}
          >
            {lesson.completed ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
            ) : (
              <span className={cn(
                "h-2.5 w-2.5 rounded-full border shrink-0 flex-none",
                isActive ? "border-amber-400 bg-amber-400/30" : "border-white/20",
              )} />
            )}
            <span className="truncate text-[12px] leading-snug">{lesson.title}</span>
          </button>
        );
      })}
      {module.children.map((child) => renderModuleNavigation(child, depth + 1))}
    </div>
  );

  if (isCourseError || isLessonError) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 p-6 text-sm text-slate-500">
        This lesson is not available.
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[calc(100vh-3rem)] text-sm"
      style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
    >

      {/* ── Course nav sidebar ─────────────────────────────────────────────── */}
      <aside
        className="hidden w-60 shrink-0 flex-col overflow-y-auto lg:flex"
        style={{ background: SIDEBAR_BG, borderRight: `1px solid ${SIDEBAR_BDR}` }}
      >
        {/* Course title + progress */}
        <div className="px-3 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${SIDEBAR_BDR}` }}>
          <button
            className="flex items-start gap-2 w-full text-left group"
            onClick={() => setLocation(`/training/${courseId}`)}
          >
            <CourseIcon
              icon={courseData?.course.icon}
              className="h-4 w-4 text-amber-400 shrink-0 mt-0.5"
            />
            <span className="text-[13px] font-semibold text-amber-100 leading-snug line-clamp-2 group-hover:text-white transition-colors">
              {courseData?.course.title ?? "Course"}
            </span>
          </button>

          {totalCount > 0 && (
            <div className="mt-2.5 space-y-1 pl-6">
              {/* Custom progress bar */}
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                {completedCount} / {totalCount} complete
              </p>
            </div>
          )}
        </div>

        {/* Module / lesson tree */}
        <nav className="flex-1 py-2 px-2 space-y-0.5 overflow-y-auto">
          {moduleTree.map((module) => renderModuleNavigation(module))}
        </nav>
      </aside>

      {/* ── Lesson content ─────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-y-auto" style={{ background: "#f8fafc" }}>

        {/* Top bar — breadcrumb + lesson count */}
        <div
          className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8"
          style={{ background: "#fff", borderBottom: "1px solid #e5e7eb" }}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[12px]" style={{ color: "#9ca3af" }}>
            <button
              className="font-medium hover:underline"
              style={{ color: "#d97706" }}
              onClick={() => setLocation(`/training/${courseId}`)}
            >
              {courseData?.course.title}
            </button>
            {currentModule && (
              <>
                <span style={{ color: "#d1d5db" }}>/</span>
                <span>{currentModule.title}</span>
              </>
            )}
            <span style={{ color: "#d1d5db" }}>/</span>
                <span className="max-w-[min(45vw,28rem)] truncate" style={{ color: "#4b5563", fontWeight: 500 }}>{lesson?.title}</span>
          </div>

          {totalCount > 0 && (
            <div className="flex items-center gap-2 text-[11px]" style={{ color: "#9ca3af" }}>
              <span>{completedCount} / {totalCount} lessons</span>
              <div
                className="w-20 h-1.5 rounded-full overflow-hidden"
                style={{ background: "#f3f4f6" }}
              >
                <div
                  className="h-full rounded-full bg-amber-400 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {isLoading ? (
          /* Skeleton */
          <div className="mx-auto max-w-[780px] px-8 py-10 space-y-5">
            <div className="h-5 w-40 rounded-md bg-gray-200 animate-pulse" />
            <div className="h-9 w-72 rounded-md bg-gray-200 animate-pulse" />
            <div className="aspect-video rounded-xl bg-gray-200 animate-pulse" />
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-4 rounded bg-gray-200 animate-pulse" style={{ width: `${85 - i * 10}%` }} />
              ))}
            </div>
          </div>
        ) : !lesson ? (
          <div className="p-8 text-gray-500 text-sm">Lesson not found.</div>
        ) : (
          <div className="mx-auto max-w-[780px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">

            {/* Meta tag */}
            {currentModule && (
              <div
                className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider mb-4"
                style={{ color: "#d97706" }}
              >
                <span>{currentModule.title}</span>
                {lesson.durationMinutes && (
                  <>
                    <span style={{ color: "#d1d5db" }}>·</span>
                    <span className="flex items-center gap-1 font-normal normal-case tracking-normal" style={{ color: "#9ca3af" }}>
                      <Clock className="h-3 w-3" />
                      {lesson.durationMinutes} min
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Title */}
            <h1
              className="font-bold tracking-tight leading-tight mb-6"
              style={{ fontSize: "28px", color: "#111827" }}
            >
              {lesson.title}
            </h1>

            {/* Video */}
            {embedUrl && (
              <div className="mb-8 lg:relative lg:left-1/2 lg:w-[max(100%,min(1400px,calc(100vw-21rem)))] lg:-translate-x-1/2">
                <div
                  className="aspect-video overflow-hidden rounded-xl shadow-sm"
                  style={{ background: "#0f172a" }}
                >
                  <iframe
                    ref={isVimeoLesson ? vimeoPlayerRef : undefined}
                    src={embedUrl}
                    className="h-full w-full"
                    allowFullScreen
                    title={lesson.title}
                  />
                </div>
              </div>
            )}
            {lesson.transcriptText && (
              <div className="mx-auto mb-8 mt-8 max-w-[680px] overflow-hidden rounded-xl" style={{ border: "1px solid #dbeafe", background: "#f5f9ff" }}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  onClick={() => setTranscriptOpen((open) => !open)}
                  aria-expanded={transcriptOpen}
                >
                  <span className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "#1e3a8a" }}>
                    <FileText className="h-4 w-4" />
                    View Chapters / Transcript
                  </span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform", transcriptOpen && "rotate-180")} style={{ color: "#1e3a8a" }} />
                </button>
                {transcriptOpen && (
                  <div className="border-t" style={{ borderColor: "#dbeafe", background: "#ffffff" }}>
                    <div className="flex gap-1 border-b px-4 pt-3" style={{ borderColor: "#e5eefc" }} role="tablist" aria-label="Lesson transcript">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={transcriptTab === "chapters"}
                        onClick={() => setTranscriptTab("chapters")}
                        className="rounded-t-md px-3 py-2 text-[12px] font-semibold transition-colors"
                        style={transcriptTab === "chapters"
                          ? { background: "#eff6ff", color: "#1e3a8a", border: "1px solid #dbeafe", borderBottomColor: "#eff6ff" }
                          : { color: "#6b7280" }}
                      >
                        Chapters
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={transcriptTab === "transcript"}
                        onClick={() => setTranscriptTab("transcript")}
                        className="rounded-t-md px-3 py-2 text-[12px] font-semibold transition-colors"
                        style={transcriptTab === "transcript"
                          ? { background: "#eff6ff", color: "#1e3a8a", border: "1px solid #dbeafe", borderBottomColor: "#eff6ff" }
                          : { color: "#6b7280" }}
                      >
                        Transcript
                      </button>
                    </div>
                    <div ref={transcriptScrollContainerRef} className="max-h-[360px] overflow-y-auto">
                    {transcriptTab === "chapters" ? (
                      <div className="p-3">
                        {chapters.length > 0 ? (
                          <div className="space-y-1">
                            {chapters.map((chapter) => (
                              <button
                                key={`${chapter.startSeconds}-${chapter.title}`}
                                type="button"
                                onClick={() => seekToChapter(chapter.startSeconds)}
                                disabled={!isVimeoLesson}
                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors enabled:hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <span className="w-10 shrink-0 font-mono text-[12px] font-semibold" style={{ color: "#2563eb" }}>
                                  {formatTimestamp(chapter.startSeconds)}
                                </span>
                                <span className="text-[13px] font-medium" style={{ color: "#374151" }}>{chapter.title}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="px-2 py-3 text-[13px]" style={{ color: "#6b7280" }}>
                            Chapters have not been created for this lesson yet.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="px-5 py-4 text-[14px] leading-7 whitespace-pre-wrap" style={{ color: "#374151" }}>
                        {transcriptCues.length > 0
                          ? transcriptTokens.map((token, index) => {
                              const wordIndex = transcriptTokenWordIndexes[index];
                              const isWord = wordIndex >= 0;
                              return (
                                <span
                                  key={index}
                                  ref={isWord && wordIndex === activeWordIndex ? activeTranscriptWordRef : undefined}
                                  className={isWord && wordIndex === activeWordIndex
                                    ? "rounded-sm bg-yellow-300 px-0.5 text-gray-900 shadow-sm"
                                    : undefined}
                                >
                                  {token}
                                </span>
                              );
                            })
                          : lesson.transcriptText}
                      </div>
                    )}
                    </div>
                  </div>
                )}
              </div>
            )}
            {!lesson.transcriptText && embedUrl && <div className="mb-8" />}

            {/* Lesson content — sanitized before render to prevent stored XSS */}
            {lesson.content && (
              <div
                className="prose prose-gray max-w-none mb-10"
                style={{ fontSize: "15px", lineHeight: "1.75" }}
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(lesson.content, {
                    ALLOWED_TAGS: ["p","br","b","i","em","strong","ul","ol","li","a","h1","h2","h3","h4","blockquote","code","pre","hr","img","span"],
                    ALLOWED_ATTR: ["href","target","rel","src","alt","class","style"],
                    ALLOW_DATA_ATTR: false,
                    FORCE_BODY: true,
                  }),
                }}
              />
            )}

            {/* Resources */}
            {lesson.resources.length > 0 && (
              <div className="mb-10">
                <h3
                  className="text-[11px] font-bold uppercase tracking-wider mb-3"
                  style={{ color: "#9ca3af" }}
                >
                  Lesson Resources
                </h3>
                <div className="space-y-2">
                  {lesson.resources.map((r) => (
                    <a
                      key={r.id}
                      href={safeHref(r.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-xl px-4 py-4 transition-colors group"
                      style={{ background: "#f5f9ff", border: "1px solid #dbeafe", boxShadow: "0 1px 2px rgba(30,64,175,0.05)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "#f5f9ff")}
                    >
                      <div
                        className="h-11 w-11 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "#f3f4f6" }}
                      >
                        {r.kind === "pdf" ? (
                          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-red-600 text-[9px] font-extrabold tracking-tight text-white shadow-sm">
                            PDF
                          </div>
                        ) : (
                          <Link className="h-5 w-5" style={{ color: "#6b7280" }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: "#111827" }}>{r.name}</p>
                        {r.subtitle && (
                          <p className="text-[11px] truncate" style={{ color: "#9ca3af" }}>{r.subtitle}</p>
                        )}
                      </div>
                      <ExternalLink className="h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#9ca3af" }} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Mark complete button */}
            <div className="flex justify-center mb-6">
              <button
                onClick={() => progressMutation.mutate({ id: lessonId, completed: !isCompleted })}
                disabled={progressMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold transition-colors"
                style={
                  isCompleted
                    ? { background: "#d1fae5", color: "#065f46", border: "1px solid #a7f3d0" }
                    : { background: "#fff", color: "#374151", border: "1px solid #d1d5db" }
                }
              >
                {isCompleted ? (
                  <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Completed</>
                ) : (
                  <><Circle className="h-4 w-4 text-gray-400" /> Mark as Complete</>
                )}
              </button>
            </div>

            {/* Prev / Next navigation */}
            <div
              className="flex items-center justify-between pt-6 gap-3"
              style={{ borderTop: "1px solid #f3f4f6" }}
            >
              {prevLesson ? (
                <button
                  onClick={() => setLocation(`/training/${courseId}/lessons/${prevLesson.id}`)}
                  className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors flex-1 justify-start"
                  style={{ background: "#fff", border: "1px solid #e5e7eb", color: "#4b5563", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.color = "#111827"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.color = "#4b5563"; }}
                >
                  <SkipBack className="h-4 w-4 shrink-0" />
                  <span className="truncate">{prevLesson.title}</span>
                </button>
              ) : (
                <div className="flex-1" />
              )}

              {nextLesson && (
                <button
                  onClick={() => {
                    // Auto-mark current as complete when going next
                    if (!isCompleted) {
                      progressMutation.mutate({ id: lessonId, completed: true });
                    }
                    setLocation(`/training/${courseId}/lessons/${nextLesson.id}`);
                  }}
                  className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-bold text-white transition-colors flex-1 justify-end"
                  style={{ background: "#da0010", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#b8000e")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#da0010")}
                >
                  <span className="truncate">{nextLesson.title}</span>
                  <SkipForward className="h-4 w-4 shrink-0" />
                </button>
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
