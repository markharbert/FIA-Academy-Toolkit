import assert from "node:assert/strict";
import test from "node:test";
import { allocateLargestRemainder, zonedMidnight } from "./cfRegularRevenueMath";

const TIME_ZONE = "America/New_York";

test("New York month boundaries honor daylight-saving offsets", () => {
  assert.equal(zonedMidnight(2026, 2, 1, TIME_ZONE).toISOString(), "2026-03-01T05:00:00.000Z");
  assert.equal(zonedMidnight(2026, 3, 1, TIME_ZONE).toISOString(), "2026-04-01T04:00:00.000Z");
  assert.equal(zonedMidnight(2026, 10, 1, TIME_ZONE).toISOString(), "2026-11-01T04:00:00.000Z");
  assert.equal(zonedMidnight(2026, 11, 1, TIME_ZONE).toISOString(), "2026-12-01T05:00:00.000Z");
});

test("largest-remainder allocation awards cents by fractional remainder", () => {
  assert.deepEqual(allocateLargestRemainder([3.334, 3.333, 3.333], 10), [3.34, 3.33, 3.33]);
  assert.deepEqual(allocateLargestRemainder([0.005, 0.005, 0.005], 0.02), [0.01, 0.01, 0]);
});

test("largest-remainder allocation reconciles multi-offer totals exactly", () => {
  const allocated = allocateLargestRemainder([12.345, 23.456, 34.199], 70);
  assert.equal(Number(allocated.reduce((sum, value) => sum + value, 0).toFixed(2)), 70);
});