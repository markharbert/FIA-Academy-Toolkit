import { slugify } from "./slug";

type CourseReference = { slug?: string | null; title: string };
type ModuleReference = { slug?: string | null; title: string };
type LessonReference = { slug?: string | null; title: string };

function segment(item: { slug?: string | null; title: string }): string {
  return item.slug || slugify(item.title);
}

export function trainingCoursePath(course: CourseReference): string {
  return `/training/${encodeURIComponent(segment(course))}`;
}

export function trainingLessonPath(
  course: CourseReference,
  module: ModuleReference,
  lesson: LessonReference,
): string {
  return `${trainingCoursePath(course)}/${encodeURIComponent(segment(module))}/${encodeURIComponent(segment(lesson))}`;
}