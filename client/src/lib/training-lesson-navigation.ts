type LessonIdentity = { id: string; slug: string | null };
type ModuleIdentity = { id: string; slug: string | null; lessons: LessonIdentity[] };

export function findCurrentLessonIndex<T extends LessonIdentity>(
  lessons: T[],
  modules: ModuleIdentity[],
  loadedLessonId: string | undefined,
  lessonIdentifier: string,
  moduleIdentifier: string | undefined,
): number {
  if (loadedLessonId) return lessons.findIndex((candidate) => candidate.id === loadedLessonId);
  if (!moduleIdentifier) return lessons.findIndex((candidate) => candidate.id === lessonIdentifier);
  const module = modules.find((candidate) =>
    candidate.id === moduleIdentifier || candidate.slug === moduleIdentifier,
  );
  if (!module) return -1;
  const match = module.lessons.find((candidate) =>
    candidate.id === lessonIdentifier || candidate.slug === lessonIdentifier,
  );
  return match ? lessons.findIndex((candidate) => candidate.id === match.id) : -1;
}