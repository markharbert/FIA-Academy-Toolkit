import type { SwipeItem } from "@shared/schema";

export type SwipeListCounts = {
  all: number;
  upload: number;
  snippet: number;
  palette: number;
  shared: number;
  favorites: number;
};

/**
 * Canonical response for GET /api/v1/swipe.
 *
 * Keep the list at the top-level `items` property. The legacy response
 * wrapped this object in another `items` property and is available only when
 * explicitly requested with `?format=legacy`.
 */
export type SwipeListResponse = {
  items: SwipeItem[];
  total: number;
  counts: SwipeListCounts;
};

export type LegacySwipeListResponse = {
  items: SwipeListResponse;
};

export function formatSwipeListResponse(
  result: SwipeListResponse,
  format: "canonical" | "legacy" = "canonical",
): SwipeListResponse | LegacySwipeListResponse {
  return format === "legacy" ? { items: result } : result;
}
