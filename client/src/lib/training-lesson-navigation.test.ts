import { describe, expect, it } from "vitest";
import { findCurrentLessonIndex } from "./training-lesson-navigation";

const modules = [
  { id: "first", slug: "intro", lessons: [{ id: "a", slug: "welcome" }, { id: "b", slug: "replay" }] },
  { id: "second", slug: "advanced", lessons: [{ id: "c", slug: "welcome" }, { id: "d", slug: "replay" }] },
];
const lessons = modules.flatMap((module) => module.lessons);

describe("current lesson resolution", () => {
  it("uses the loaded lesson ID instead of a duplicate slug", () => {
    expect(findCurrentLessonIndex(lessons, modules, "c", "welcome", "intro")).toBe(2);
  });
  it("limits slug lookup to the requested module until the lesson loads", () => {
    expect(findCurrentLessonIndex(lessons, modules, undefined, "welcome", "advanced")).toBe(2);
    expect(findCurrentLessonIndex(lessons, modules, undefined, "replay", "intro")).toBe(1);
  });
  it("does not select an unrelated lesson when no module or ID matches", () => {
    expect(findCurrentLessonIndex(lessons, modules, undefined, "welcome", undefined)).toBe(-1);
    expect(findCurrentLessonIndex(lessons, modules, "missing", "welcome", "intro")).toBe(-1);
  });
});