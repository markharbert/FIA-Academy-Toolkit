import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import {
  ChevronLeft, ChevronRight, CheckCircle2, Circle, ExternalLink, Link,
  BookOpen, GraduationCap,
} from "lucide-react";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
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
    <div className="flex h-full">
      {/* Course sidebar */}
      <aside className="w-64 shrink-0 border-r flex flex-col overflow-y-auto bg-muted/20">
        {/* Course title */}
        <div className="px-4 py-3 border-b">
          <button
            className="flex items-center gap-2 w-full text-left group"
            onClick={() => setLocation(`/training/${courseId}`)}
          >
            <GraduationCap className="h-4 w-4 text-violet-400 shrink-0" />
            <span className="text-sm font-medium leading-snug line-clamp-2 group-hover:underline">
              {courseData?.course.title ?? "Course"}
            </span>
          </button>
          {totalCount > 0 && (
            <div className="mt-2 space-y-1">
              <Progress value={progressPct} className="h-1.5" />
              <p className="text-xs text-muted-foreground">
                {completedCount} / {totalCount} lessons complete
              </p>
            </div>
          )}
        </div>

        {/* Module/lesson tree */}
        <nav className="flex-1 py-2">
          {courseData?.modules.map((module) => (
            <div key={module.id} className="mb-1">
              <div className="px-4 py-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
                  {module.title}
                </p>
              </div>
              {module.lessons.map((l) => {
                const isActive = l.id === lessonId;
                return (
                  <button
                    key={l.id}
                    onClick={() =>
                      setLocation(`/training/${courseId}/lessons/${l.id}`)
                    }
                    className={cn(
                      "flex items-center gap-2.5 w-full px-4 py-2 text-left text-sm transition-colors",
                      isActive
                        ? "bg-amber-500/15 text-amber-200 font-medium"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    )}
                  >
                    {l.completed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Circle
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          isActive ? "text-amber-400" : "text-white/30"
                        )}
                      />
                    )}
                    <span className="truncate">{l.title}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-8 space-y-4 max-w-3xl mx-auto">
            <div className="h-8 w-64 bg-muted rounded animate-pulse" />
            <div className="aspect-video bg-muted rounded-xl animate-pulse" />
            <div className="h-40 bg-muted rounded animate-pulse" />
          </div>
        ) : !lesson ? (
          <div className="p-8 text-muted-foreground">Lesson not found.</div>
        ) : (
          <div className="p-8 max-w-3xl mx-auto">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
              <button
                className="hover:text-foreground transition-colors"
                onClick={() => setLocation(`/training/${courseId}`)}
              >
                {courseData?.course.title}
              </button>
              {currentModule && (
                <>
                  <span>/</span>
                  <span>{currentModule.title}</span>
                </>
              )}
              <span>/</span>
              <span className="text-foreground font-medium">{lesson.title}</span>
            </div>

            {/* Title + mark complete */}
            <div className="flex items-start gap-3 mb-6">
              <h1 className="text-2xl font-semibold flex-1">{lesson.title}</h1>
              <Button
                size="sm"
                variant={isCompleted ? "secondary" : "outline"}
                className={cn(
                  "shrink-0 mt-1",
                  isCompleted && "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                )}
                onClick={() =>
                  progressMutation.mutate({ id: lessonId, completed: !isCompleted })
                }
                disabled={progressMutation.isPending}
              >
                {isCompleted ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Completed
                  </>
                ) : (
                  <>
                    <Circle className="h-3.5 w-3.5 mr-1.5" /> Mark Complete
                  </>
                )}
              </Button>
            </div>

            {/* Video */}
            {embedUrl && (
              <div className="aspect-video rounded-xl overflow-hidden bg-black mb-6 shadow-lg">
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
                className="prose prose-sm dark:prose-invert max-w-none mb-8"
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
              <div className="mb-8">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  Resources
                </h3>
                <div className="space-y-2">
                  {lesson.resources.map((r) => (
                    <a
                      key={r.id}
                      href={safeHref(r.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-muted/50 transition-colors group"
                    >
                      {r.kind === "pdf" ? (
                        <svg className="h-5 w-5 text-red-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z" />
                        </svg>
                      ) : (
                        <Link className="h-5 w-5 text-blue-400 shrink-0" />
                      )}
                      <span className="flex-1 text-sm font-medium">{r.name}</span>
                      <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Prev / Next navigation */}
            <div className="flex items-center justify-between pt-6 border-t gap-3">
              {prevLesson ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    setLocation(`/training/${courseId}/lessons/${prevLesson.id}`)
                  }
                  className="flex-1 justify-start"
                >
                  <ChevronLeft className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">{prevLesson.title}</span>
                </Button>
              ) : (
                <div className="flex-1" />
              )}

              {nextLesson && (
                <Button
                  onClick={() => {
                    // Auto-mark current as complete when going next
                    if (!isCompleted) {
                      progressMutation.mutate({ id: lessonId, completed: true });
                    }
                    setLocation(`/training/${courseId}/lessons/${nextLesson.id}`);
                  }}
                  className="flex-1 justify-end"
                >
                  <span className="truncate">{nextLesson.title}</span>
                  <ChevronRight className="h-4 w-4 ml-2 shrink-0" />
                </Button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
