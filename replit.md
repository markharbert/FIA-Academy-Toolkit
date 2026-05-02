# Academy Toolkit

## Overview
Academy Toolkit is a web application designed for private practice video marketing. It enables users to upload videos, receive automatic transcriptions, and get AI-powered scoring and improvement suggestions based on a 5-part video formula: Hook, Set the Hook, First CTA, Content, and Final CTA. The application prioritizes private practice with no public sharing features, and videos persist indefinitely unless explicitly deleted. The platform also includes comprehensive email marketing tools, a daily method of operation tracker, and a personalized dashboard to provide a holistic suite for marketing professionals.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
- **Frontend**: React 18, TypeScript, Vite, Wouter, TanStack React Query, shadcn/ui (Radix UI), Tailwind CSS, React Hook Form with Zod.
- **Backend**: Node.js, Express, TypeScript (ESM), RESTful JSON API.
- **Data Storage**: PostgreSQL with Drizzle ORM, Drizzle Kit for migrations.
- **File Storage**: Local filesystem (Multer) with architecture designed for future S3 migration.

### Key Features and Design Decisions
- **AI-Powered Video Analysis**: Utilizes AI for transcription and scoring against a 5-part video formula, with feedback tailored to user-selected goals (sales, lead, education, recruit).
- **Monorepo Structure**: Organized into `client/`, `server/`, and `shared/` directories for type-safe development.
- **User Authentication & Session Management**: Custom session-based authentication with bcrypt password hashing and Express sessions.
- **Video Processing Pipeline**: Audio-first processing for rapid transcription, with parallel generation of HLS streams and video previews. Users can retranscribe up to 3 times.
- **Reporting**: Downloadable branded PDF reports of session scores.
- **User Experience**: Theming (Light/Dark/System), folder organization with drag-and-drop, device selection persistence, and intuitive UI components.
- **Email Tools Hub**: A central hub for email marketing tools, including:
    - **Sender Reputation**: Integrates with Google Postmaster Tools for domain reputation, spam rate, and authentication metrics.
    - **Inbox Analyzer**: Provides detailed analysis of emails (authentication, sender trust, spammy language, technical health, content quality, CAN-SPAM compliance) using a unique seed address per user.
    - **Inbox Placement Monitoring**: Tracks email placement across various seed inboxes (primary, promotions, spam, etc.) using Google OAuth.
- **DMO Tracker**: A Daily Method of Operation tracker for users to log activities, track streaks, earn points, and receive milestone badges.
- **Dashboard**: A live command center displaying real-time statistics and activities from all integrated tools.
- **ClickFunnels Integration**: Grants/revokes app access based on ClickFunnels enrollment events, provides SSO capabilities, and enforces membership checks during authentication.
- **Help Documentation**: In-app documentation hub with illustrated guides for all features.
- **Inbox Intel**: Competitor email intelligence tool. Members create up to 20 competitor trackers, each with up to 5 unique private seed addresses on `watch.fearlessmarketinglab.com`. Use the seed addresses to subscribe to competitors' email lists; incoming emails are automatically captured, parsed (sender, subject, links, images, ESP fingerprint, authentication), and stored. Latest 100 full-HTML captures kept per tracker (oldest auto-pruned), all metrics retained forever, up to 25 pinned emails per tracker preserved indefinitely. Pure rule-based analysis — no AI generation. Requires SendGrid Inbound Parse subdomain `watch.fearlessmarketinglab.com` configured to POST to `/api/inbox-intel/inbound`.
    - **Organic seed addresses**: seed local-parts are generated to look like real personal mailboxes (e.g. `sarah.thompson83`, `mike.r.davis`, `jenniferlee47`, `kate_brooks`, `dmiller2024`) — combinations of common first/last names with mixed separators and optional numeric suffixes. This avoids ESP rejection of robotic-looking signups. The full local-part is the lookup token; uniqueness is enforced via DB collision-retry. Legacy `track-{nanoid}` addresses still resolve via a permissive inbound parser.
    - **Per-competitor analytics tab** (Phase 2): cadence heatmap (7 days × 24 hours), 90-day send-volume chart, subject line stats (avg length, % emoji, % all-caps, top opening words, longest/shortest), ESP fingerprint with confidence and change count, authentication audit (SPF/DKIM/DMARC pass rates, list-unsubscribe coverage, weak-auth count), and content patterns (avg words/links/images, % UTM-tagged, top destination domains). All computed forever from retained metric columns even after full-HTML bodies are pruned.
    - **ESP detection** combines high-confidence header signals with ~25 HTML body fingerprints (tracking-link domains, open-pixel hosts, footer patterns) covering Mailchimp, Klaviyo, HubSpot, ActiveCampaign, ConvertKit, Constant Contact, Campaign Monitor, ClickFunnels, Keap, MailerLite, Drip, AWeber, GetResponse, beehiiv, Substack, Flodesk, Omnisend, Brevo, SendGrid, Postmark, Mailgun, Salesforce Marketing Cloud, Pardot, and Oracle Eloqua.
    - **Unified feed** (`/email-tools/inbox-intel/feed`): cross-competitor chronological stream with day-grouped sections, search (subject/sender), date preset (today / 7d / 30d / 90d / all), competitor multi-select, ESP filter, and pinned-only toggle.
    - **Website screenshots** on competitor tiles: when a tracker has a website, the server captures a 1280×720 JPEG via Microlink (`api.microlink.io`, no key required) and stores it in object storage at `/objects/inbox-intel/screenshots/{trackerId}-{ts}.jpeg`. Capture runs asynchronously after tracker create and on website change; tile shows "Capturing preview…" until ready and polls every 6s. Tracker detail page has a "Refresh preview" button. SSRF-safe URL normalization rejects localhost / private IPs.

## External Dependencies

### AI Services
- **Google Gemini API**: For video transcription.
- **OpenAI API**: For transcript scoring and feedback generation.

### Database
- **PostgreSQL**: Primary database for all application data.

### Email Services
- **SMTP**: For sending password reset emails and system notifications.
- **SendGrid**: For receiving inbound parsed emails for the Inbox Analyzer.

### OAuth Providers
- **Google OAuth**: For user authentication, Google Postmaster Tools integration, and Inbox Placement Monitoring (Gmail access).

### Third-Party APIs
- **ClickFunnels API**: For membership enforcement and SSO.