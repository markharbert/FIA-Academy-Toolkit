import assert from "node:assert/strict";
import test from "node:test";
import {
  matchVimeoVideoForLesson,
  normalizeVideoTitle,
  type VimeoVideo,
} from "./vimeo";

const videos: VimeoVideo[] = [
  { id: "1", name: "Welcome & Orientation", url: "https://vimeo.com/123456789" },
  { id: "2", name: "Offer Design", url: "https://vimeo.com/223456789" },
];

test("normalizes punctuation and ampersands for title matching", () => {
  assert.equal(normalizeVideoTitle(" Welcome & Orientation! "), "welcome and orientation");
});

test("matches a unique Vimeo video by normalized lesson title", () => {
  assert.equal(
    matchVimeoVideoForLesson("Welcome and Orientation", videos)?.url,
    "https://vimeo.com/123456789",
  );
});

test("does not guess when multiple Vimeo videos share a title", () => {
  const duplicate = [
    ...videos,
    { id: "3", name: "Offer Design", url: "https://vimeo.com/323456789" },
  ];
  assert.equal(matchVimeoVideoForLesson("Offer Design", duplicate), null);
});