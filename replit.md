# Academy Toolkit

## Overview
Academy Toolkit is a web application designed for private practice video marketing professionals. It provides tools to upload videos, receive AI-powered transcriptions, and get scoring and improvement suggestions based on a 5-part video formula. The platform also offers comprehensive email marketing tools, a daily method of operation tracker, and a personalized dashboard. Key capabilities include AI-powered video analysis, email sender reputation monitoring, inbox analysis, and competitor email intelligence, all aimed at enhancing marketing effectiveness for private practices.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Core Technologies
- **Frontend**: React 18, TypeScript, Vite, Wouter, TanStack React Query, shadcn/ui (Radix UI), Tailwind CSS, React Hook Form with Zod.
- **Backend**: Node.js, Express, TypeScript (ESM), RESTful JSON API.
- **Data Storage**: PostgreSQL with Drizzle ORM.
- **File Storage**: Local filesystem with architecture designed for future S3 migration.

### Design Decisions and Features
- **Monorepo Structure**: Organized into `client/`, `server/`, and `shared/` for type-safe development.
- **User Authentication**: Custom session-based authentication with bcrypt hashing.
- **AI-Powered Video Analysis**: Utilizes AI for transcription and scoring against a 5-part video formula, with feedback tailored to user goals (sales, lead, education, recruit). Users can retranscribe up to 3 times.
- **Video Processing**: Audio-first processing for rapid transcription, with parallel generation of HLS streams and video previews.
- **Reporting**: Downloadable branded PDF reports of session scores.
- **Email Tools Hub**: Central hub for email marketing, including Sender Reputation (integrates with Google Postmaster Tools) and Inbox Analyzer (detailed email analysis using unique seed addresses and Google OAuth for inbox placement monitoring).
- **DMO Tracker**: Tracks daily activities, streaks, points, and milestone badges.
- **Dashboard**: A live command center with a calmer, more uniform palette, displaying a personalized greeting, quick actions, a 3-KPI ribbon, a projects hero with "Up Next" tasks, and email health metrics.
- **Teleprompter**: A standalone, members-only tool for scrolling pre-written scripts with customizable display settings and server-side persistence.
- **ClickFunnels Integration**: Manages app access based on ClickFunnels enrollment, provides SSO, and enforces membership checks.
- **Admin Panel**: Provides detailed user management, including ClickFunnels membership status, account actions, and integration health monitoring. It also features a comprehensive action history timeline.
- **Account Page**: Members-only page for profile management, membership status display, per-user time zone setting, and a log of recent user activities.
- **Time Zone**: Each user has a `timezone` setting (IANA) that drives server-side and client-side calculations for "today / this week" in various features like DMO streaks and project tasks.
- **Help Documentation**: In-app hub with illustrated guides for all features, including detailed DMO Tracker functionality and AI weekly/monthly summaries.
- **Projects**: A lightweight Asana-style project manager with List and Board (Kanban) views. It supports custom columns, task management with subtasks, comments, activity tracking, and project templates for reusability. Projects also include Calendar view and an "All tasks" list across projects.
- **Inbox Intel**: A competitor email intelligence tool that captures, parses, and stores incoming emails from unique seed addresses, providing detailed analytics on sending cadence, send volume, subject line stats, ESP fingerprinting, authentication audits, and content patterns.
- **Email Notifications**: Full SendGrid email notification system with user-controlled preferences. 12 notification types across Projects/Tasks, DMO, Video Coaching, and Email Health categories. Preferences stored per-user in `notification_preferences` table. Hourly scheduler (`server/notificationScheduler.ts`) handles all scheduled sends with deduplication via `notification_log`. UI card on Account page with master on/off toggle and per-type switches. Sender: `notifications@fearlesspromo.com` via `SENDGRID_API_TOKEN`.

## External Dependencies

### AI Services
- **Google Gemini API**: For video transcription.
- **OpenAI API**: For transcript scoring and feedback generation.

### Database
- **PostgreSQL**: Primary database for all application data.

### Email Services
- **SMTP**: For sending password reset emails and system notifications.
- **SendGrid**: For receiving inbound parsed emails for the Inbox Analyzer, and for sending outbound notification emails (via `SENDGRID_API_TOKEN`).

### OAuth Providers
- **Google OAuth**: For user authentication, Google Postmaster Tools integration, and Inbox Placement Monitoring (Gmail access).

### Third-Party APIs
- **ClickFunnels API**: For membership enforcement and SSO.
- **Microlink (`api.microlink.io`)**: For capturing website screenshots for Inbox Intel.