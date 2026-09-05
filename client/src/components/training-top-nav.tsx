import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BookMarked, CalendarDays, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { CourseIcon } from "@/lib/course-icons";
import { trainingCoursePath, trainingLessonPath } from "@shared/training-url";
import { cn } from "@/lib/utils";

type PublishedCourse = {
  id: string;
  title: string;
  slug: string;
  icon?: string | null;
  firstLesson?: {
    id: string;
    title: string;
    slug: string | null;
    module: { title: string; slug: string | null };
  } | null;
};

function isActivePath(location: string, path: string) {
  return location === path || location.startsWith(`${path}/`);
}

export function TrainingTopNav() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();

  const { data: trainingCourses = [] } = useQuery<PublishedCourse[]>({
    queryKey: ["/api/training/courses"],
    queryFn: async () => {
      const response = await fetch("/api/training/courses", { credentials: "include" });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!user?.isAdmin && !user?.isCollaborator,
    staleTime: 60_000,
  });

  if (!user) return null;

  const dashboardActive = location === "/dashboard";
  const vaultActive = isActivePath(location, "/training/library");
  const scheduleActive = location === "/training/schedule";
  const courseActive = (course: PublishedCourse) =>
    location === `/training/${course.slug}` ||
    location.startsWith(`/training/${course.slug}/`) ||
    location === `/training/${course.id}` ||
    location.startsWith(`/training/${course.id}/`);

  const itemClass = (active: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 text-sm font-medium transition-colors",
      active
        ? "bg-violet-500/20 text-violet-100 shadow-sm ring-1 ring-inset ring-violet-300/20"
        : "text-white/65 hover:bg-white/8 hover:text-white",
    );

  return (
    <nav
      aria-label="Training navigation"
      className="flex w-full min-w-0 items-center justify-center gap-2 sm:w-auto"
      data-testid="training-top-nav"
    >
      <div
        className="flex min-w-0 items-center justify-center gap-1 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="list"
      >
        <button
          type="button"
          role="listitem"
          className={itemClass(dashboardActive)}
          onClick={() => setLocation("/dashboard")}
          aria-current={dashboardActive ? "page" : undefined}
          data-testid="nav-top-dashboard"
        >
          <LayoutDashboard className={dashboardActive ? "text-sky-200" : "text-sky-300"} />
          <span>Dashboard</span>
        </button>

        {user.isAdmin && !user.isCollaborator && (
          <>
            {trainingCourses.map((course) => {
              const active = courseActive(course);
              return (
                <button
                  key={course.id}
                  type="button"
                  role="listitem"
                  className={itemClass(active)}
                  onClick={() =>
                    setLocation(
                      course.firstLesson
                        ? trainingLessonPath(course, course.firstLesson.module, course.firstLesson)
                        : trainingCoursePath(course),
                    )
                  }
                  aria-current={active ? "page" : undefined}
                  data-testid={`top-nav-course-${course.slug}`}
                >
                  <CourseIcon icon={course.icon} className={active ? "text-violet-200" : "text-violet-300"} />
                  <span className="max-w-36 truncate">
                    {course.slug === "core-framework" ? "Core" : course.title}
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              role="listitem"
              className={itemClass(vaultActive)}
              onClick={() => setLocation("/training/library")}
              aria-current={vaultActive ? "page" : undefined}
              data-testid="nav-training-library"
            >
              <BookMarked className="h-4 w-4 text-violet-300" />
              <span>Vault</span>
            </button>

            <button
              type="button"
              role="listitem"
              className={itemClass(scheduleActive)}
              onClick={() => setLocation("/training/schedule")}
              aria-current={scheduleActive ? "page" : undefined}
              data-testid="nav-training-schedule"
            >
              <CalendarDays className="h-4 w-4 text-fuchsia-300" />
              <span>Schedule</span>
            </button>
          </>
        )}
      </div>
    </nav>
  );
}