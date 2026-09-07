---
name: CF Course Import
description: How the ClickFunnels → Academy course import tool works, its key design choices, and known constraints.
---

## What was built

A 4-step import UI at `/admin/clickfunnels` (CourseImportCard) backed by 3 server routes and a dedicated CF API client (`server/cf-import-client.ts`).

## Key design decisions

**Pagination**: CF import endpoints use `after=<last_item_id>` cursor pagination (not Link-header pagination used by the enrollment endpoint). Pages stop when a response returns < 20 items.

**Structure fetch is SSE**: `GET /api/admin/cf/import/courses/:cfCourseId/structure` streams progress events as sections and lessons are fetched. Client reads via `fetch` + `ReadableStream` (not `EventSource`, which can't send cookies). Events: `{ type: "progress"|"done"|"error", message?, structure? }`.

**Concurrency cap**: Lesson fetches run at max 3 concurrent requests (`queue.shift()` worker pattern) to avoid CF rate limits.

**Idempotency**: Every imported module gets `external_id = "cf-section-{cfId}"` and every lesson gets `external_id = "cf-lesson-{cfId}"`. Re-importing is safe — existing records are found by externalId and updated only if the title changed.

**externalId columns**: Added via startup migration (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS external_id TEXT`) to `courses`, `course_modules`, and `course_lessons`. Not tracked in Drizzle schema push (handled by pool.query migration instead).

**Filtered tree logic**: Client computes the filtered tree with `filterTree(roots, selectedIds)`:
- Node in selectedIds → include
- Node NOT in selectedIds but has selected descendants → include as structural container (forced ancestor)
- Client sends the filtered tree to the execute route (no re-fetch needed)

**Promotion**: If a single root module is selected, admins can "promote" it — its children become top-level modules. Applied both in the preview (client-side) and in the execute route (server-side).

**Bonus wrapping**: Loose root-level lessons (not inside any module) are auto-wrapped in a "Bonus" module during import execution.

**Why filteredTree is client-to-server**: Avoids a second CF API round-trip on import. The client serializes and POSTs the pre-filtered tree (~100KB max for 200+ lessons).

## File locations

- `server/cf-import-client.ts` — CF API client (pagination, concurrency, tree building)
- `client/src/components/cf-course-import.tsx` — full 4-step UI card
- Routes added to `server/routes.ts` after the `test-webhook` route (~line 1830)
- Storage methods: `getCourseModuleByExternalId`, `getCourseLessonByExternalId` added to `DatabaseStorage`

## Known constraints

- The workspace ID is cached in process memory. A process restart will re-fetch it.
- CF API field names assumed: `id`, `title`, `parent_id`, `sort_order`, `published_at` for sections; `id`, `title`, `sort_order`, `published_at` for lessons; `id`, `name`/`title` for courses. If CF changes its shape, the normalisation in `cf-import-client.ts` will need updating.
- The execute route is synchronous — for very large courses it could hit a 30s timeout in some proxy configurations. If this becomes an issue, consider SSE for the execute step too.
- ClickFunnels documents a single-lesson endpoint with a `body` field, but it has no dedicated course-video resource. Vimeo extraction therefore checks that documented content first, then only same-domain lesson-page HTML. A protected legacy video element that appears in neither cannot be imported automatically; surface it as unavailable rather than guessing a URL.

## Content recovery rule

Recover recognizable lesson HTML into draft content, common video URLs, thumbnails, and resources, but only fill fields that are still empty on re-import.

**Why:** ClickFunnels API bearer authentication can read course structure while protected learner URLs need Customer Center SSO. Learner URLs use the SSO domain and the complete nested section chain, excluding the structural root section; combining only the course and lesson slugs returns a branded 404 shell.

**How to apply:** Render protected pages through SSO as the admin starting the scan, reject sign-in/404 pages, derive the full ancestor route, classify recovery honestly, and preserve existing admin-entered fields and resources.

## Import performance rule

Load the course outline from the ClickFunnels API without crawling lesson pages; recover protected page content only for lessons selected at import time.

**Why:** The course has hundreds of server-generated lesson pages, each taking several seconds. Crawling every page before showing the selection screen made a 2–3 second outline load take minutes.

**How to apply:** Keep structure discovery and page recovery as separate phases, reuse one short-lived SSO cookie, and fetch selected pages concurrently without loading page assets.
