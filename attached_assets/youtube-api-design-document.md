# YouTube API Services — Implementation & Integration Design Document

**Application Name:** Academy Toolkit  
**Prepared for:** Google YouTube API Quota Increase Application  
**Application Type:** Private SaaS web application (member-access only)  
**Primary Audience:** Video marketing professionals serving private practices

---

## 1. Application Overview

Academy Toolkit is a private, members-only web application built for video marketing professionals in the private practice space (therapists, coaches, chiropractors, and similar health/wellness practitioners). The platform provides an integrated suite of tools to help these practitioners grow their practices through video and email marketing.

The YouTube integration is a core component of the platform. It gives members a centralized analytics dashboard, a comment management tool, and (for administrators) a content optimization utility — all pulling from their own YouTube channel using their own OAuth credentials. No data is shared across users.

The application is not publicly accessible. Members gain access through a ClickFunnels enrollment gate. Each member authenticates their own YouTube account via Google OAuth and accesses only their own channel's data.

---

## 2. Why We Need YouTube API Access

Members of Academy Toolkit are video marketing practitioners who produce YouTube content as their primary client acquisition channel. However, YouTube Studio's analytics interface is not optimized for their specific needs:

- They need **actionable marketing metrics** (CTR, traffic sources, impressions) in a single view alongside email health data.
- They need to **manage comments efficiently** across dozens of videos without clicking through each one individually in Studio.
- They need to **identify underperforming content** quickly and update metadata in bulk to improve discoverability.

The YouTube API allows us to surface this data in context with the rest of their marketing workflow inside a single platform — eliminating the need to switch between YouTube Studio, Google Analytics, and other tools.

---

## 3. OAuth Scopes Requested and Justification

| Scope | Purpose |
|---|---|
| `https://www.googleapis.com/auth/youtube.readonly` | Fetch the user's channel information, video list, video metadata, and comment threads. This is the primary read scope used across all analytics and comment management features. |
| `https://www.googleapis.com/auth/yt-analytics.readonly` | Fetch performance reports from the YouTube Analytics API — including views, watch time, impressions, click-through rate, traffic sources, demographics, and device/geography breakdowns. |
| `https://www.googleapis.com/auth/youtube.force-ssl` | Required for write operations: posting replies to comments and (for admin users only) updating video metadata via `videos.update`. |
| `email` | Used to associate the authenticated YouTube account with the correct application user account and to display the connected account email in the UI. |

---

## 4. API Endpoints Used

### 4.1 YouTube Data API v3

#### `channels.list` (mine: true)
- **Purpose:** Fetch the authenticated user's channel profile, including channel name, handle, profile thumbnail, total subscriber count, total view count, and total video count.
- **When called:** On initial connection and when the user visits the YouTube Analytics page to display the channel header card.
- **Quota cost:** 1 unit per call.

#### `playlistItems.list`
- **Purpose:** Retrieve the full list of videos in the channel's uploads playlist. This is used to build the video index for the Videos tab and to scope analytics queries to specific video IDs.
- **When called:** When the user loads the Videos tab or any feature that requires a list of all channel videos.
- **Quota cost:** 1 unit per page (50 results per page).

#### `videos.list`
- **Purpose:** Fetch detailed metadata and statistics for specific videos — including title, description, tags, category ID, publish date, view count, like count, and comment count.
- **When called:** (a) When loading the Videos tab to display per-video performance metrics; (b) Before a bulk edit session to pre-populate the editing form with current metadata.
- **Quota cost:** 1 unit per call (up to 50 video IDs per call).

#### `videos.update`
- **Purpose:** Update video metadata — title, description, tags, and/or category — for one or more videos.
- **When called:** Only when an administrator explicitly submits changes through the Bulk Edit tool after a preview and confirmation step. Regular members do not have access to this feature.
- **Quota cost:** 50 units per video updated. **This is the highest-cost operation in the application.** A single bulk edit run across a typical channel library can consume a significant portion — or the entirety — of the default 10,000-unit daily quota. For example:
  - 100 videos updated = 5,000 units (50% of the default daily quota)
  - 200 videos updated = 10,000 units (100% of the default daily quota — fully exhausted in a single operation)
  - 300 videos updated = 15,000 units (exceeds the default daily quota, causing the operation to fail partway through)
  - 500 videos updated = 25,000 units
  
  Members on our platform commonly have video libraries ranging from 100 to 500+ videos built up over years of content production. A single find-and-replace operation — for example, updating a call-to-action phrase or a product link that appears in hundreds of video descriptions — will touch every video in the library at once. This is the primary driver behind our quota increase request.

#### `commentThreads.list`
- **Purpose:** Retrieve top-level comments (comment threads) across all channel videos for the Comments management interface.
- **When called:** When the user opens the Comments tab, which displays comments from all videos in a unified, searchable list.
- **Quota cost:** 1 unit per page.

#### `comments.insert`
- **Purpose:** Post a reply to an existing comment thread on behalf of the authenticated channel.
- **When called:** When the user types and submits a reply to a comment in the Comments tab, either a custom response or a saved "canned response."
- **Quota cost:** 50 units per reply posted.

---

### 4.2 YouTube Analytics API v2

#### `reports.query`
- **Purpose:** Fetch time-series and aggregated performance data for the channel and individual videos. All queries are scoped to the authenticated user's own channel (`channel==MINE`).
- **When called:** When the user visits the Overview, Videos, or Audience tabs of the YouTube Analytics page, and when they change the date range.
- **Quota cost:** 1 unit per query.

**Specific report queries used:**

| Report Type | Dimensions / Metrics | Used For |
|---|---|---|
| Channel time-series | `day` / `views, estimatedMinutesWatched, subscribersGained, subscribersLost, impressions, impressionsClickThroughRate, shares` | KPI cards and daily trend line charts on the Overview tab |
| Traffic sources | `insightTrafficSourceType` / `views` | Traffic source bar chart (Search, Suggested, External, etc.) |
| Audience demographics — age | `ageGroup, gender` / `viewerPercentage` | Age/gender breakdown on the Audience tab |
| Audience geography | `country` / `views` | Top countries and world map view on the Audience tab |
| Audience devices | `deviceType` / `views` | Device type percentage breakdown on the Audience tab |
| Search terms | `insightTrafficSourceDetail` (filter: `SEARCH`) / `views` | Top organic search keywords driving channel traffic |
| Per-video stats | `video` / `views, estimatedMinutesWatched, likes, comments` | Per-video performance metrics on the Videos tab |

---

## 5. How Data Is Displayed and Used

### 5.1 Overview Tab
Displays a KPI ribbon with seven cards: **Total Views, Watch Hours, Avg View Duration, Subscribers, Impressions, CTR, and Shares** for the selected date range (7, 28, or 90 days). Below the KPIs, an interactive line chart plots daily views and watch time over the period. A traffic source bar chart shows the relative share of views from YouTube Search, Suggested Videos, External sources, and direct/other.

### 5.2 Videos Tab
A searchable, sortable table listing all channel videos with their thumbnail, title, publish date, duration, and individual metrics (Views, Likes, Comments). Members can click any video to deep-link to it on YouTube.

### 5.3 Audience Tab
Shows an audience overview with: an age and gender distribution chart, a top-countries ranked list, a device-type percentage breakdown (Mobile, Desktop, Tablet, TV), and a world map illustrating geographic reach.

### 5.4 Comments Tab
A unified comment inbox pulling comments from across all channel videos. Each comment shows the commenter's name, avatar, comment text, and the video it belongs to. Members can type a reply directly inline or select from a library of pre-saved "canned responses" for common replies (e.g., "Thanks for watching! Check the link below for more."). Submitted replies are posted via `comments.insert`.

### 5.5 Bulk Edit Tab (Admin-Only)
A four-step workflow accessible only to platform administrators (not available to regular members):
1. **Configure** — Select which fields to find-and-replace (title, description, tags, category) and enter search/replacement values.
2. **Preview** — Review a list of all affected videos and exactly what the before/after changes will look like before committing.
3. **Apply** — The system sends one `videos.update` API call per affected video. Each call costs 50 quota units regardless of how many fields are changed.
4. **Done** — A results summary shows which videos were updated successfully and any errors.

**Quota impact of this feature is substantial.** Because the Bulk Edit tool is designed to make a consistent change across an entire channel library — such as updating a call-to-action in every video description, replacing a discontinued product link in all titles, or standardizing tags across hundreds of uploads — it is common for a single operation to touch 100–500 videos at once. At 50 units per `videos.update` call, a member with a 200-video library running a single bulk description update consumes the entire default 10,000-unit daily quota in one operation. A member with 300+ videos cannot complete the operation within the default quota at all — the API returns a `quotaExceeded` error partway through, leaving part of their library updated and part not. This creates an inconsistent state that is disruptive to their marketing operations and requires them to resume the operation the following day when the quota resets. This scenario is not an edge case — it is the primary use case the Bulk Edit tool was built for, and it is the central reason we are requesting a higher quota.

---

## 6. Data Storage and Privacy

- **No YouTube data is stored long-term.** Analytics query results are fetched fresh on each page load. Comments are fetched live from the API.
- **The only data persisted** is the user's OAuth access token and refresh token (encrypted at rest in our PostgreSQL database), the connected channel's ID and basic profile info (name, handle, thumbnail URL), and user-written canned responses (composed by the member, not sourced from the API).
- **Tokens are user-specific.** Each member authenticates their own YouTube account. No member can access another member's channel data.
- **Revocation.** Members can disconnect their YouTube account from within the application at any time, which deletes the stored tokens from the database immediately.
- **No data is shared with third parties.** YouTube data fetched through the API is displayed only to the authenticated member who owns that channel and is not resold, aggregated across users, or exposed publicly.

---

## 7. User Flow — Step by Step

1. Member logs into Academy Toolkit.
2. Member navigates to **YouTube Analytics** in the left sidebar.
3. If not yet connected, they see a connect prompt and click **"Connect YouTube Account."**
4. They are redirected to Google's OAuth consent screen, which displays the four scopes listed in Section 3.
5. After granting consent, they are redirected back to the application.
6. The application exchanges the authorization code for access and refresh tokens, stores them encrypted, and fetches the channel profile via `channels.list`.
7. The member lands on the **Overview tab** where KPI cards and charts render using Analytics API data for the last 28 days.
8. The member can switch tabs (Videos, Audience, Comments), change the date range, or search/reply to comments.
9. At any time the member can click **Disconnect** to revoke access and delete stored tokens.

---

## 8. Technical Implementation Summary

| Component | Technology |
|---|---|
| Backend | Node.js / Express / TypeScript |
| Frontend | React 18 / Vite / TanStack Query |
| Database | PostgreSQL (token storage only) |
| YouTube Data API client | Native HTTPS calls via `node-fetch` with OAuth 2.0 Bearer tokens |
| Token refresh | Automatic silent refresh using stored refresh token before expiry |
| Hosting | Replit cloud infrastructure |

The YouTube Data API and Analytics API are called exclusively from the server side. OAuth tokens are never exposed to the browser. All API calls are made on behalf of the authenticated user using their personal OAuth tokens.

---

## 9. Estimated Daily Quota Usage

### 9.1 Routine Usage (Analytics + Comments, No Bulk Edit)

| Feature | API Call | Units Per Call | Estimated Daily Calls | Est. Daily Units |
|---|---|---|---|---|
| Channel status check | `channels.list` | 1 | ~5 per user | 5 |
| Analytics overview | `reports.query` (×7 queries) | 1 each | ~10 sessions/day | 70 |
| Video list load | `playlistItems.list` + `videos.list` | 1–2 per page | ~10 sessions/day | 40 |
| Comment loading | `commentThreads.list` | 1 per page | ~5 sessions/day | 20 |
| Comment replies | `comments.insert` | 50 each | ~10 replies/day | 500 |
| **Routine daily total** | | | | **~635 units/day** |

Routine usage is well within the default 10,000-unit daily quota.

---

### 9.2 Bulk Edit Usage — The Primary Quota Driver

The Bulk Edit feature is specifically designed to apply a single metadata change across an entire video library at once. Because each `videos.update` call costs 50 units regardless of how many fields are changed, and because members on this platform routinely have 100–500+ videos, a single bulk edit session can consume the entire daily quota — or exceed it — in minutes.

**Before the bulk update runs**, the system also fetches current metadata for all videos to populate the preview screen. This requires one `playlistItems.list` call per 50 videos to get the ID list, then one `videos.list` call per 50 videos to get current titles/descriptions/tags:

| Library Size | `playlistItems.list` calls | `videos.list` calls | Metadata fetch total |
|---|---|---|---|
| 100 videos | 2 calls × 1 unit | 2 calls × 1 unit | 4 units |
| 200 videos | 4 calls × 1 unit | 4 calls × 1 unit | 8 units |
| 500 videos | 10 calls × 1 unit | 10 calls × 1 unit | 20 units |

**The update itself** is where quota is consumed at scale:

| Library Size | Videos Updated | Units Per Update | Total Units | % of Default 10k Quota |
|---|---|---|---|---|
| Small library | 50 videos | 50 units each | 2,500 units | 25% |
| Medium library | 100 videos | 50 units each | 5,000 units | 50% |
| Large library | 200 videos | 50 units each | **10,000 units** | **100% — quota fully exhausted** |
| Large library | 300 videos | 50 units each | **15,000 units** | **150% — operation fails mid-way** |
| Large library | 500 videos | 50 units each | **25,000 units** | **250% — would require 3 days to complete** |

### 9.3 Real-World Impact of Quota Exhaustion During Bulk Edit

When the daily quota is exhausted mid-operation, the YouTube API returns a `quotaExceeded` error and stops processing. Any videos that had not yet been updated at that point remain in their original state. The result is an **inconsistent library** — some videos reflect the new metadata, others do not — with no automated way to resume. The member must:

1. Manually identify which videos were updated and which were not.
2. Wait until midnight Pacific time for the quota to reset.
3. Manually re-run the operation for the remaining videos the next day.

For a marketing professional updating a call-to-action link after a product launch or replacing a discontinued offer across their entire library, this partial-update state is a significant operational problem. It is not a hypothetical scenario — it is the expected outcome for any member with more than 200 videos using the Bulk Edit feature under the current default quota.

---

### 9.4 Requested Quota and Justification

| Scenario | Units Required |
|---|---|
| Routine daily usage (all members) | ~635 units |
| Single bulk edit on 200-video library | 10,008 units |
| Single bulk edit on 500-video library | 25,020 units |
| **Recommended daily quota** | **50,000 units** |

A quota of 50,000 units per day would allow a member with a 500-video library to complete a full bulk metadata update in a single session, with sufficient headroom remaining for routine analytics and comment management usage by other members on the same day. This is the minimum quota level at which the Bulk Edit feature functions reliably for the members this platform is designed to serve.

---

*This document was prepared to support a YouTube Data API quota increase request and accurately reflects the current implementation of YouTube API Services within Academy Toolkit.*
