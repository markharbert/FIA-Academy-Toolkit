# Academy Toolkit

## Overview
Academy Toolkit is a web application designed for private practice in video marketing. It allows users to upload videos, receive automatic transcriptions, and get AI-powered scoring and improvement suggestions based on a 5-part video formula: Hook, Set the Hook, First CTA, Content, and Final CTA. The application prioritizes private practice with no public sharing features. Videos persist indefinitely unless explicitly deleted by users or admins.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Build**: Vite
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **UI**: shadcn/ui (built on Radix UI)
- **Styling**: Tailwind CSS (with theming)
- **Forms**: React Hook Form with Zod

### Backend
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM)
- **API**: RESTful JSON API (`/api/*`)
- **Session Management**: Express sessions with PostgreSQL store (24-hour rolling inactivity timeout)
- **Authentication**: Custom session-based auth, bcrypt password hashing
- **File Uploads**: Multer (local `uploads/` directory, structured for future S3 migration)

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema**: `shared/schema.ts` (type-safe for frontend/backend)
- **Migrations**: Drizzle Kit
- **File Storage**: Local filesystem (`uploads/`)

### AI Integration
- **Transcription**: Google Gemini API (`gemini-2.5-flash`)
- **Scoring**: OpenAI API
- **Pipeline**: Video upload → Gemini transcribes audio → OpenAI scores transcript against 5-part formula.

### Key Design Decisions
- **Shared Schema**: Ensures type safety across frontend and backend.
- **Video Lifecycle**: Videos persist indefinitely (no auto-deletion based on time).
- **Goal-Based Scoring**: AI feedback is tailored to user-selected goal types (sales, lead, education, recruit).
- **Monorepo Structure**: `client/`, `server/`, `shared/` directories.
- **Session Naming**: User-defined or AI-generated titles.
- **Device Selection**: Camera/mic selection with persistence and audio level visualization.
- **Retranscribe**: Users can retranscribe up to 3 times per session.
- **Audio-First Processing**: Extracts and transcribes audio immediately for faster results; video preview generated in background.
- **PDF Reports**: Downloadable branded reports of session scores.
- **Theme Preferences**: Light/Dark/System theme selection persisted per user.
- **Folder Organization**: Allows users to organize sessions into folders with drag-and-drop, bulk operations.
- **HLS Progressive Streaming**: Uses HLS for fast video playback with parallel generation.
- **Parallel Processing Pipeline**: HLS, Transcription, and Scoring run concurrently with independent status tracking.
- **Video Poster Generation**: Generates and serves a poster thumbnail for improved perceived performance.
- **Preview Video Persistence**: Detailed tracking of preview video status and metadata.
- **Email Tools Hub**: Landing page at `/email-tools` — mirrors Video Tools hub structure. Houses email marketing tools with expandable card grid. Currently contains Inbox Analyzer.
- **Inbox Analyzer**: Tool at `/email-tools/inbox-analyzer`. Each user gets a unique seed address (`{token}@email.fearlessmarketinglab.com`) stored in `email_inbox_addresses` table. Emails received via SendGrid Inbound Parse webhook at `POST /api/inbox-analyzer/inbound`. Full analysis pipeline across 5 scored categories: (1) Authentication — SPF/DKIM/DMARC pass/fail + DNS record presence [30pts], (2) Sender Trust — IP blacklist check (Spamhaus/Barracuda/SpamCop via DNS), display name/domain match, Reply-To alignment [15pts], (3) Spammy Language — comprehensive scan of 100+ trigger phrases across high/medium/low severity, structural checks (caps, fake Re:/Fwd:, punctuation, link density), no unsubscribe detection [35pts], (4) Technical Health — HTML/text versions, preheader, size, missing ALT, tracking pixels, external domains [10pts], (5) Content Quality — word count, physical address (CAN-SPAM), P.S. section, personalization [10pts]. SpamFlag type includes category (trigger_word/subject_trigger/structural/pattern) and matches fields for rich UI display. Results stored in `email_analyses` table. Three-tab UI with wide (max-w-7xl) layout: Emails tab shows expandable rows with 2-column detail panel (email content left, full report right). Auto-polls every 4s while emails are processing. Old `copyScore`, `copyFeedback`, and `subjectAnalysis` columns retained in DB for backward compatibility with old emails.
- **Inbox Placement Monitoring**: Admin Settings tab manages placement seed inboxes (`seed_inboxes` table). Each Gmail inbox is connected via Google OAuth (googleapis package, `gmail.readonly` scope). OAuth flow: `GET /api/inbox-analyzer/seed-inboxes/connect/gmail?inboxId=<id>` → Google → `GET /api/inbox-analyzer/seed-inboxes/callback/gmail`. Tokens stored in `seed_inboxes.oauth_access_token/refresh_token/token_expiry`. **Auto-scheduling**: When an email arrives via inbound webhook, a 24-hour monitoring window is opened (`email_inbox_addresses.placementAutoCheckUntil = now+24h`). No immediate check is fired — `lastPlacementCheckedAt` is set to `now` when the window opens, which enforces the 15-minute scheduler throttle before the first real check. This 15-min delay lets Gmail's spam filters finish running (takes ~1-5 min). `server/placementScheduler.ts` runs a background tick every 5 min and checks each user at most every 15 min. **Confirmation required**: monitoring stops only when ALL connected seed inboxes return the same definitive result (primary/promotions/social/updates/forums/spam) on TWO consecutive checks. A single definitive reading triggers a "awaiting confirmation" log and keeps monitoring active for one more 15-min cycle. If the second check matches, monitoring stops. If it changed (e.g. primary → spam), another cycle continues. The 24-hour window is the outer safety net. No manual check button — fully automatic. Required: add `https://toolkit.fearlessmarketinglab.com/api/inbox-analyzer/seed-inboxes/callback/gmail` as authorized redirect URI in Google Cloud Console.
- **Video Tools Hub**: Landing page at `/video-tools` that serves as a central hub for all video-related tools. Displays large cards for each tool (Video Score, Video Trends, Scripts) with gradients, descriptions, and navigation. Designed to be extended with additional tools over time. Sidebar shows single "Video Tools" entry that highlights when on any video tool sub-page.
- **Video Trends**: YouTube topic research and script generation based on Mark's 5-part formula, using YouTube autocomplete and OpenAI. The hub page shows two cards (Saved Topics, Scripts) — the former Settings card has been removed. API key management and system API status for Video Trends are now admin-only, accessible in the Admin Panel under the Keywords Everywhere tab. The `/video-trends/settings` route has been removed; the three API key endpoints (`GET/POST/DELETE /api/topic-pulse/api-keys/keywords-everywhere`) are now restricted to `requireAdmin`.
- **ClickFunnels Integration**: Webhook endpoint grants/revokes app access based on CF enrollment events (courses/enrollment.created, courses/enrollment.suspended, courses/enrollment.deleted, subscription.cancelled, subscription.churned). When a revocation event is received, the user's account is disabled (`isDisabled=true`) in addition to `cfEnrolled=false`, which immediately blocks both existing sessions and future logins. Users get a one-click SSO button in the sidebar to jump into ClickFunnels without a second login (signed JWT). Admins can manually grant/revoke CF access per user. Admin tab includes a webhook tester to simulate CF events.
- **CF Membership Enforcement**: When CF is configured (`CF_API_TOKEN` + `CF_COURSE_ID` env vars set), all authentication paths enforce active membership: (1) Signup performs a live CF enrollment check and rejects non-members before creating an account. (2) Password login rejects users whose `cfEnrolled` flag is `false` (revoked) or `null` (never granted). (3) Google OAuth login performs the same cfEnrolled check after authenticating. (4) SSO URL minting requires `cfEnrolled=true`. Admin accounts bypass all CF membership checks. When CF is not configured, enrollment checks are skipped to support development/staging environments.
- **CF One-Click Login (Inbound SSO) — DISABLED**: The `POST /api/auth/cf-login-ajax` route is permanently disabled (returns 501) because verifying a CF enrollment by email alone does not prove the HTTP caller controls that email address — it is vulnerable to account takeover. The GET redirect (`/api/auth/cf-login`) still works to land users on the /cf-login page, where they are shown a message to log in with email/password instead. Login page renders user-friendly messages for all CF error codes (cf_not_enrolled, cf_revoked, cf_api_error, account_disabled, missing_email, etc.).
- **App Settings**: `app_settings` table stores global configuration (key-value). Currently used for `monthly_credits_limit` (Keywords Everywhere credits per user per 30-day window). Admins can update this from the Keywords Everywhere tab — applies immediately to all users.
- **DMO Tracker**: Daily Method of Operation Tracker. Members log 5 daily activities (Vision & Meditation, Personal Development, Expand Skills, Execution, Connecting with People) with optional minutes tracking. Features daily streak counter, best streak record, 30-day color-coded activity bar chart, streak milestone badges (7 tiers from 3-day to 90-day), and a notes field. Built on `dmo_entries` table (one row per user per day, unique constraint on user_id+date). Designed to be extended with additional activities. Routes: `/api/dmo/today`, `/api/dmo/entry` (POST), `/api/dmo/history`, `/api/dmo/streak`. Point system: each activity worth 5 pts (earned in equal time thresholds, formula: `min(5, floor(minutesDone / (target/5)))`), 25 pts maximum per day. Cards display 5 dot indicators filling as time accumulates; full gradient only activates at 5/5 pts. Header ring shows total pts/25 with "Perfect Day!" celebration at 25 pts.
- **Authenticated Redirect**: Logged-in users visiting unknown routes are automatically redirected to dashboard instead of seeing 404.
- **Help Docs**: In-app documentation hub at `/help` and `/help/:slug`. Sidebar shows "Help & Support" section with "Help Docs" link. Article data lives in `client/src/lib/help-content.ts` (typed `HelpArticle`/`HelpCategory`). Illustrated step components live in `client/src/components/help-illustrations.tsx` — each step has a screenshot in `attached_assets/help/step{N}.jpg`. Hub page at `client/src/pages/help.tsx`, article viewer at `client/src/pages/help-article.tsx`. Currently contains: Video Scoring (10-step walkthrough: sidebar nav → Video Tools hub → sessions list → upload page → file selected → uploading → AI processing → overall score → formula breakdown → download report). Designed to be extended with new articles per tool.
- **Login Returns Full Profile**: Login and signup endpoints return the complete user object (including isAdmin) so admin features appear immediately without a page refresh.

## External Dependencies

### AI Services (via Replit AI Integrations)
- **Gemini API**: For video transcription.
- **OpenAI API**: For transcript scoring and feedback generation.

### Database
- **PostgreSQL**: Primary data store for users, sessions, and session store.

### Email Configuration
- **Purpose**: Password reset emails.
- **Settings**: SMTP host, port, user, password, from address, and app base URL.

### OAuth Login
- **Providers**: Google only.
- **Mechanism**: Standard OAuth flows for user authentication and account linking.