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
- **Video Trends**: YouTube topic research and script generation based on Mark's 5-part formula, using YouTube autocomplete and OpenAI.
- **Accountability Tracker**: Weekly check-in system for members. Form with 10 fields (videos, platforms, views, leads, email list, revenue, hours, win, struggle, goal). Dashboard with 5 trend charts, personal records, running totals, 4-week rolling averages, and weekly insights. 21 milestone badges earned automatically (videos, leads, revenue, streaks). History table with sortable columns and detail drill-down. Coaching brief export (print/PDF). Admin tab shows aggregate weekly stats, streak leaders, at-risk members (no check-in 2+ weeks), and top struggle keywords.
- **ClickFunnels Integration**: Webhook endpoint grants/revokes app access based on CF enrollment events (courses/enrollment.created, courses/enrollment.suspended, courses/enrollment.deleted, subscription.cancelled, subscription.churned). Users get a one-click SSO button in the sidebar to jump into ClickFunnels without a second login (signed JWT). Admins can manually grant/revoke CF access per user. Admin tab includes a webhook tester to simulate CF events.
- **App Settings**: `app_settings` table stores global configuration (key-value). Currently used for `monthly_credits_limit` (Keywords Everywhere credits per user per 30-day window). Admins can update this from the Keywords Everywhere tab — applies immediately to all users.
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