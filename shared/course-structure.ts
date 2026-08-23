export type CourseModuleShape = {
  id: string;
  parentModuleId: string | null;
  sortOrder: number;
};

export type CourseModuleTree<T extends CourseModuleShape> = T & {
  children: CourseModuleTree<T>[];
};

function bySortOrder<T extends CourseModuleShape>(left: T, right: T): number {
  return left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);
}

/**
 * Convert a flat module list into a safely traversable hierarchy. Modules whose
 * parent is missing or cyclic are surfaced at the top level instead of being
 * hidden from the course outline.
 */
export function buildCourseModuleTree<T extends CourseModuleShape>(
  modules: readonly T[],
): CourseModuleTree<T>[] {
  const sourceById = new Map(modules.map((module) => [module.id, module]));
  const treeById = new Map<string, CourseModuleTree<T>>(
    modules.map((module) => [module.id, { ...module, children: [] }]),
  );
  const roots: CourseModuleTree<T>[] = [];

  for (const module of modules) {
    const node = treeById.get(module.id)!;
    const parent = module.parentModuleId ? treeById.get(module.parentModuleId) : undefined;
    let ancestorId = module.parentModuleId;
    const seen = new Set<string>();
    let createsCycle = false;

    while (ancestorId && !seen.has(ancestorId)) {
      if (ancestorId === module.id) {
        createsCycle = true;
        break;
      }
      seen.add(ancestorId);
      ancestorId = sourceById.get(ancestorId)?.parentModuleId ?? null;
    }

    if (parent && !createsCycle) parent.children.push(node);
    else roots.push(node);
  }

  const sortTree = (nodes: CourseModuleTree<T>[]) => {
    nodes.sort(bySortOrder);
    nodes.forEach((node) => sortTree(node.children));
  };
  sortTree(roots);
  return roots;
}

/** Flatten a module hierarchy in the same order a learner sees it. */
export function flattenCourseModuleTree<T extends CourseModuleShape>(
  roots: readonly CourseModuleTree<T>[],
): CourseModuleTree<T>[] {
  const result: CourseModuleTree<T>[] = [];
  const visited = new Set<string>();

  const visit = (node: CourseModuleTree<T>) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);
    result.push(node);
    node.children.forEach(visit);
  };

  roots.forEach(visit);
  return result;
}

/** Return a module and every nested descendant, deepest modules last. */
export function collectCourseModuleSubtreeIds<T extends CourseModuleShape>(
  rootId: string,
  modules: readonly T[],
): string[] {
  const childrenByParent = new Map<string, string[]>();
  const knownIds = new Set(modules.map((module) => module.id));
  if (!knownIds.has(rootId)) return [];

  for (const module of modules) {
    if (!module.parentModuleId) continue;
    const children = childrenByParent.get(module.parentModuleId) ?? [];
    children.push(module.id);
    childrenByParent.set(module.parentModuleId, children);
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    (childrenByParent.get(id) ?? []).forEach(visit);
    ids.push(id);
  };
  visit(rootId);
  return ids;
}

/** True only when a proposed ordering contains every expected ID exactly once. */
export function hasExactIds(actualIds: readonly string[], candidateIds: unknown[]): boolean {
  return candidateIds.length === actualIds.length
    && new Set(candidateIds).size === candidateIds.length
    && candidateIds.every((id) => typeof id === "string" && actualIds.includes(id));
}