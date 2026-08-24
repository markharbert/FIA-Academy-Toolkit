import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { buildCourseModuleTree, flattenCourseModuleTree } from "@shared/course-structure";
import { trainingLessonPath } from "@shared/training-url";

type CourseLesson = { id: string; title: string; slug: string | null; status: string };
type CourseModule = { id: string; parentModuleId: string | null; title: string; slug: string | null; sortOrder: number; lessons: CourseLesson[] };
type CourseStructure = {
  course: { id: string; title: string; slug: string; status: string };
  modules: CourseModule[];
};

/**
 * Landing page for a course — immediately resolves and redirects to the first
 * published lesson. This gives the sidebar a stable URL to navigate to without
 * needing to know the first lesson ID in advance.
 */
export default function TrainingCoursePage() {
  const { courseSlug } = useParams<{ courseSlug: string }>();
  const [, setLocation] = useLocation();

  const { data, isLoading, isError } = useQuery<CourseStructure>({
    queryKey: ["/api/training/courses", courseSlug],
    queryFn: async () => {
      const res = await fetch(`/api/training/courses/${courseSlug}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    retry: false,
  });

  useEffect(() => {
    if (!data) return;
    // Navigate to the first available published lesson
    for (const module of flattenCourseModuleTree(buildCourseModuleTree(data.modules))) {
      for (const lesson of module.lessons) {
        setLocation(trainingLessonPath(data.course, module, lesson), { replace: true });
        return;
      }
    }
  }, [data, setLocation]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-violet-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background">
        <p className="text-sm text-muted-foreground">Course not found.</p>
      </div>
    );
  }

  const hasLessons = data && flattenCourseModuleTree(buildCourseModuleTree(data.modules)).some((module) => module.lessons.length > 0);
  if (data && !hasLessons) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background">
        <p className="text-sm text-muted-foreground">
          This course has no published lessons yet.
        </p>
      </div>
    );
  }

  // Redirect in progress
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Loader2 className="h-7 w-7 animate-spin text-violet-400" />
    </div>
  );
}
