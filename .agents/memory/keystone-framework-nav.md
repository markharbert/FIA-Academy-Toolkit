---
name: Keystone Framework navigation restructure
description: How the app's sidebar and routing are organised around the Keystone Framework (3 levels, 9 stages).
---

# Keystone Framework Navigation

## The rule
The sidebar is now organised as: **Dashboard → Keystone Framework → Workspace → Help & Support → Admin**. Tools no longer appear as direct sidebar items — they live inside their stage landing pages.

**Why:** User explicitly requested the Framework as the organising spine of the whole app so tools have a logical home and nothing feels fragmented.

## Stage → URL mapping
| Stage | Title | URL |
|-------|-------|-----|
| 1 | Personal Philosophy | /framework/stage-1 |
| 2 | Irresistible Offer | /framework/stage-2 |
| 3 | Sales Funnels & Email | /framework/stage-3 |
| 4 | Social Networking | /framework/stage-4 |
| 5 | Organic Content | /framework/stage-5 |
| 6 | Paid Marketing | /framework/stage-6 |
| 7 | Profitable Presentations | /framework/stage-7 |
| 8 | Digital Product Creation | /framework/stage-8 |
| 9 | High Ticket Coaching | /framework/stage-9 |

## Level colour coding
- Level 1 Genesis: **emerald** (text-emerald-400, bg-emerald-500/20)
- Level 2 Momentum: **amber** (text-amber-400, bg-amber-500/20)
- Level 3 Apex: **violet** (text-violet-400, bg-violet-500/20)

## Workspace items
Projects (/projects) and Analytics (/analytics) moved to a "Workspace" SidebarGroup. DMO Tracker, Funnel Planner, Video Studio, Email Tools are **no longer direct sidebar items** — they are accessed through their stage pages.

## Sidebar implementation
- `client/src/components/app-sidebar.tsx` — completely rewritten; uses LEVELS array with Collapsible per level; manual expand toggle OR auto-open when a stage is active
- Each level has `levelExpandedStates` + `levelSetters` array pattern so the open state can be toggled even when not on that level

## How to add a new stage tool
1. Add it as a card/section on the relevant stage page (`client/src/pages/framework/stage-N.tsx`)
2. The tool's own URL (/some-tool) still works for bookmarks — no redirect needed
3. Do NOT add it back to the sidebar as a direct item

## DB tables added
- `framework_avatars` — Avatar Builder (Stage 2), full CRUD via /api/framework/avatars
- `framework_email_setup` — Email Setup Checklist (Stage 3), upsert via /api/framework/email-setup
Both created manually via raw SQL (drizzle-kit push is interactive and can't be piped non-interactively on this project).
