import assert from "node:assert/strict";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  buildCourseModuleTree,
  collectCourseModuleSubtreeIds,
  flattenCourseModuleTree,
  hasExactIds,
} from "@shared/course-structure";
import { courseProgress } from "@shared/schema";

const modules = [
  { id: "root-b", parentModuleId: null, sortOrder: 2 },
  { id: "child-b", parentModuleId: "root-a", sortOrder: 1 },
  { id: "root-a", parentModuleId: null, sortOrder: 1 },
  { id: "grandchild", parentModuleId: "child-b", sortOrder: 0 },
  { id: "child-a", parentModuleId: "root-a", sortOrder: 0 },
];

test("course module tree preserves parent/child hierarchy and course order", () => {
  const tree = buildCourseModuleTree(modules);

  assert.deepEqual(tree.map((module) => module.id), ["root-a", "root-b"]);
  assert.deepEqual(tree[0]?.children.map((module) => module.id), ["child-a", "child-b"]);
  assert.deepEqual(
    flattenCourseModuleTree(tree).map((module) => module.id),
    ["root-a", "child-a", "child-b", "grandchild", "root-b"],
  );
});

test("orphaned or cyclic modules remain visible instead of being lost", () => {
  const tree = buildCourseModuleTree([
    { id: "orphan", parentModuleId: "missing", sortOrder: 1 },
    { id: "cycle-a", parentModuleId: "cycle-b", sortOrder: 2 },
    { id: "cycle-b", parentModuleId: "cycle-a", sortOrder: 3 },
  ]);

  assert.equal(flattenCourseModuleTree(tree).length, 3);
  assert.deepEqual(new Set(flattenCourseModuleTree(tree).map((module) => module.id)), new Set(["orphan", "cycle-a", "cycle-b"]));
});

test("module deletion collects every descendant before its parent", () => {
  assert.deepEqual(
    collectCourseModuleSubtreeIds("root-a", modules),
    ["grandchild", "child-b", "child-a", "root-a"],
  );
  assert.deepEqual(collectCourseModuleSubtreeIds("missing", modules), []);
});

test("reorder payloads must include each expected item exactly once", () => {
  assert.equal(hasExactIds(["a", "b", "c"], ["c", "a", "b"]), true);
  assert.equal(hasExactIds(["a", "b", "c"], ["a", "b"]), false);
  assert.equal(hasExactIds(["a", "b", "c"], ["a", "b", "b"]), false);
  assert.equal(hasExactIds(["a", "b", "c"], ["a", "b", "other"]), false);
});

test("course progress has one row per user and lesson", () => {
  const config = getTableConfig(courseProgress);
  const constraint = config.uniqueConstraints.find(
    (item) => item.name === "course_progress_user_lesson_unique",
  );

  assert.ok(constraint);
  assert.deepEqual(constraint.columns.map((column) => column.name), ["user_id", "lesson_id"]);
});