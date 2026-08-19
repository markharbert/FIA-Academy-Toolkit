import assert from "node:assert/strict";
import test from "node:test";
import { formatSwipeListResponse, type SwipeListResponse } from "./swipe-api";

const canonicalResponse = {
  items: [{
    id: "palette-1",
    title: "Homepage palette",
    type: "palette",
    content: JSON.stringify({ version: 1, colors: ["#112233", "#445566", "#778899", "#AABBCC", "#DDEEFF", "#000000"] }),
  }],
  total: 1,
  counts: {
    all: 1,
    upload: 0,
    snippet: 0,
    palette: 1,
    shared: 0,
    favorites: 0,
  },
} as unknown as SwipeListResponse;

test("Swipe File list response keeps items and counts at the top level", () => {
  const response = formatSwipeListResponse(canonicalResponse);

  assert.deepEqual(response, canonicalResponse);
  assert.ok(Array.isArray(response.items));
  assert.equal(response.items[0]?.type, "palette");
  assert.equal(response.counts.palette, 1);
  assert.equal("items" in response.items, false);
});

test("Swipe File list keeps a deliberate legacy response for migration", () => {
  const response = formatSwipeListResponse(canonicalResponse, "legacy");

  assert.deepEqual(response, { items: canonicalResponse });
  assert.equal(response.items.items[0]?.type, "palette");
  assert.equal(response.items.counts.palette, 1);
});
