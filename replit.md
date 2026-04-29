# Academy Toolkit

## Overview
Academy Toolkit is a web application designed for private practice in video marketing. It allows users to record short in-browser videos, receive automatic transcriptions, and get AI-powered scoring and improvement suggestions based on a 5-part video formula: Hook, Set the Hook, First CTA, Content, and Final CTA. The application prioritizes private practice with no public sharing features. Videos persist indefinitely unless explicitly deleted by users or admins.

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
- **Inbox Analyzer**: Tool at `/email-tools/inbox-analyzer`. Each user gets a unique seed address (`{token}@email.fearlessmarketinglab.com`) stored in `email_inbox_addresses` table. Emails received via SendGrid Inbound Parse webhook at `POST /api/inbox-analyzer/inbound`. Full analysis pipeline across 6 scored categories: (1) Authentication — SPF/DKIM/DMARC pass/fail + DNS record presence [30pts], (2) Sender Trust — IP blacklist check (Spamhaus/Barracuda/SpamCop via DNS), display name/domain match, Reply-To alignment [15pts], (3) Spam Signals — keyword scan, caps, punctuation, unsubscribe, link density [15pts], (4) Subject Line — char count, emoji, numbers, question, personalization token, ideal length [analyzed, not scored separately], (5) Technical Health — HTML/text versions, preheader, size, missing ALT, tracking pixels, external domains [10pts], (6) Content Quality — word count, physical address (CAN-SPAM), P.S. section, personalization [10pts], (7) AI Copy Scoring — 5-dimension OpenAI analysis [20pts]. Results stored in `email_analyses` table (includes new jsonb columns: subject_analysis, technical_health, sender_trust, content_quality, reply_to). Three-tab UI with wide (max-w-7xl) layout: Emails tab shows expandable rows with 2-column detail panel (email content left, full report right). Auto-polls every 4s while emails are processing.
- **Video Tools Hub**: Landing page at `/video-tools` that serves as a central hub for all video-related tools. Displays large cards for each tool (Video Score, Video Trends, Scripts) with gradients, descriptions, and navigation. Designed to be extended with additional tools over time. Sidebar shows single "Video Tools" entry that highlights when on any video tool sub-page.
- **Video Trends**: YouTube topic research and script generation based on Mark's 5-part formula, using YouTube autocomplete and OpenAI.
- **ClickFunnels Integration**: Webhook endpoint grants/revokes app access based on CF enrollment events (courses/enrollment.created, courses/enrollment.suspended, courses/enrollment.deleted, subscription.cancelled, subscription.churned). Users get a one-click SSO button in the sidebar to jump into ClickFunnels without a second login (signed JWT). Admins can manually grant/revoke CF access per user. Admin tab includes a webhook tester to simulate CF events.
- **CF One-Click Login (Inbound SSO)**: Members in the CF members area can click a button to auto-login to the Toolkit. CF button URL: `https://toolkit.fearlessmarketinglab.com/api/auth/cf-login?email={{contact.email}}` — CF fills in the member's email via merge field. The endpoint verifies the email belongs to a CF-enrolled, non-disabled user, creates a session, and redirects to the dashboard. Error cases (no account, not enrolled, disabled) redirect back to `/login` with a descriptive query param. Login page renders user-friendly messages for each CF error code.
- **App Settings**: `app_settings` table stores global configuration (key-value). Currently used for `monthly_credits_limit` (Keywords Everywhere credits per user per 30-day window). Admins can update this from the Keywords Everywhere tab — applies immediately to all users.
- **DMO Tracker**: Daily Method of Operation Tracker. Members log 5 daily activities (Vision & Meditation, Personal Development, Expand Skills, Execution, Connecting with People) with optional minutes tracking. Features daily streak counter, best streak record, 30-day color-coded activity bar chart, streak milestone badges (7 tiers from 3-day to 90-day), and a notes field. Built on `dmo_entries` table (one row per user per day, unique constraint on user_id+date). Designed to be extended with additional activities. Routes: `/api/dmo/today`, `/api/dmo/entry` (POST), `/api/dmo/history`, `/api/dmo/streak`. Point system: each activity worth 5 pts (earned in equal time thresholds, formula: `min(5, floor(minutesDone / (target/5)))`), 25 pts maximum per day. Cards display 5 dot indicators filling as time accumulates; full gradient only activates at 5/5 pts. Header ring shows total pts/25 with "Perfect Day!" celebration at 25 pts.
- **Authenticated Redirect**: Logged-in users visiting unknown routes are automatically redirected to dashboard instead of seeing 404.
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