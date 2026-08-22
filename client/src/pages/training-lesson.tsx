import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  ChevronLeft, ChevronRight, CheckCircle2, Circle, ExternalLink, Link,
  BookOpen, GraduationCap, Clock, SkipBack, SkipForward,
} from "lucide-react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

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
const SIDEBAR_BG  = "linear-gradient(180deg, hsl(230 75% 14%) 0%, hsl(230 75% 10%) 100%)";
const SIDEBAR_BDR = "hsl(230 60% 16%)";

type Resource = {
  id: string;
  name: string;
  url: string;
  kind: string;
};

type LessonDetail = {
  id: string;
  courseId: string;
  moduleId: string;
  title: string;
  videoUrl: string | null;
  content: string | null;
  status: string;
  durationMinutes: number | null;
  resources: Resource[];
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
  title: string;
  lessons: CourseLesson[];
};

type CourseStructure = {
  course: {
    id: string;
    title: string;
    status: string;
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
    const vimeoId = videoUrl.replace(/.*vimeo\.com\//, "").split("?")[0];
    return `https://player.vimeo.com/video/${vimeoId}`;
  }
  return null;
}

export default function TrainingLessonPage() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Load course structure (for sidebar nav + prev/next)
  const { data: courseData } = useQuery<CourseStructure>({
    queryKey: ["/api/training/courses", courseId],
    queryFn: () => apiFetch(`/api/training/courses/${courseId}`),
    enabled: !!courseId,
  });

  // Load lesson content
  const { data: lesson, isLoading } = useQuery<LessonDetail>({
    queryKey: ["/api/training/lessons", lessonId],
    queryFn: () => apiFetch(`/api/training/lessons/${lessonId}`),
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

  // Flatten lessons for prev/next nav
  const allLessons: CourseLesson[] = courseData?.modules.flatMap((m) => m.lessons) ?? [];
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

  // Find current module for breadcrumb
  const currentModule = courseData?.modules.find((m) =>
    m.lessons.some((l) => l.id === lessonId)
  );

  return (
    <div className="flex h-full text-sm" style={{ fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>

      {/* ── Course nav sidebar ─────────────────────────────────────────────── */}
      <aside
        className="w-60 shrink-0 flex flex-col overflow-y-auto"
        style={{ background: SIDEBAR_BG, borderRight: `1px solid ${SIDEBAR_BDR}` }}
      >
        {/* Course title + progress */}
        <div className="px-3 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${SIDEBAR_BDR}` }}>
          <button
            className="flex items-start gap-2 w-full text-left group"
            onClick={() => setLocation(`/training/${courseId}`)}
          >
            <GraduationCap className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <span className="text-[12px] font-semibold text-amber-100 leading-snug line-clamp-2 group-hover:text-white transition-colors">
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
          {courseData?.modules.map((module) => (
            <div key={module.id} className="mb-1">
              {/* Module label */}
              <div className="px-2 py-1.5">
                <p
                  className="text-[9px] font-bold uppercase tracking-widest truncate"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >
                  {module.title}
                </p>
              </div>

              {/* Lessons */}
              {module.lessons.map((l) => {
                const isActive = l.id === lessonId;
                return (
                  <button
                    key={l.id}
                    onClick={() => setLocation(`/training/${courseId}/lessons/${l.id}`)}
                    className={cn(
                      "flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left transition-colors",
                      isActive
                        ? "bg-amber-500/20 text-amber-100"
                        : "hover:bg-white/5"
                    )}
                    style={!isActive ? { color: "rgba(255,255,255,0.5)" } : undefined}
                  >
                    {l.completed ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                    ) : (
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full border shrink-0 flex-none",
                          isActive ? "border-amber-400 bg-amber-400/30" : "border-white/20"
                        )}
                      />
                    )}
                    <span className="truncate text-[11px] leading-snug">{l.title}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Lesson content ─────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-y-auto" style={{ background: "#f8fafc" }}>

        {/* Top bar — breadcrumb + lesson count */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-8 py-3"
          style={{ background: "#fff", borderBottom: "1px solid #e5e7eb" }}
        >
          <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "#9ca3af" }}>
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
            <span style={{ color: "#4b5563", fontWeight: 500 }}>{lesson?.title}</span>
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
          <div className="mx-auto max-w-[780px] px-8 py-10">

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
              <div
                className="aspect-video rounded-xl overflow-hidden mb-8 shadow-sm"
                style={{ background: "#0f172a" }}
              >
                <iframe
                  src={embedUrl}
                  className="w-full h-full"
                  allowFullScreen
                  title={lesson.title}
                />
              </div>
            )}

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
                      className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors group"
                      style={{ background: "#fff", border: "1px solid #e5e7eb", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e5e7eb")}
                    >
                      <div
                        className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "#f3f4f6" }}
                      >
                        {r.kind === "pdf" ? (
                          <svg className="h-4 w-4" style={{ color: "#ef4444" }} viewBox="0 0 24 24" fill="currentColor">
                            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z" />
                          </svg>
                        ) : (
                          <Link className="h-4 w-4" style={{ color: "#6b7280" }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: "#111827" }}>{r.name}</p>
                        <p className="text-[11px]" style={{ color: "#9ca3af" }}>
                          {r.kind === "pdf" ? "PDF document" : "External link"}
                        </p>
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
