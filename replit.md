# Academy Toolkit

## Overview
Academy Toolkit is a web application designed for private practice video marketing professionals. It provides tools to upload videos, receive AI-powered transcriptions, and get scoring and improvement suggestions based on a 5-part video formula: Hook, Set the Hook, First CTA, Content, and Final CTA. The platform also offers comprehensive email marketing tools, a daily method of operation tracker, and a personalized dashboard. Key capabilities include AI-powered video analysis, email sender reputation monitoring, inbox analysis, and competitor email intelligence, all aimed at enhancing marketing effectiveness for private practices.

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
- **Email Tools Hub**: Central hub for email marketing, including:
    - **Sender Reputation**: Integrates with Google Postmaster Tools for domain reputation.
    - **Inbox Analyzer**: Provides detailed email analysis (authentication, sender trust, spammy language, technical health, content quality, CAN-SPAM compliance) using unique seed addresses.
    - **Inbox Placement Monitoring**: Tracks email placement across various seed inboxes using Google OAuth.
- **DMO Tracker**: Tracks daily activities, streaks, points, and milestone badges.
- **Dashboard**: A live command center displaying real-time statistics and activities from all integrated tools, hard-capped at 7 cards for clarity, focusing on KPIs, daily signals, and recent activity.
- **Teleprompter**: A standalone, members-only tool for scrolling pre-written scripts with customizable display settings and server-side persistence.
- **ClickFunnels Integration**: Manages app access based on ClickFunnels enrollment, provides SSO, and enforces membership checks.
- **Admin Panel**: Provides detailed user management, including ClickFunnels membership status, account actions, and integration health monitoring for ClickFunnels and Keywords Everywhere.
- **Account Page**: Members-only page for profile management, membership status display, and a log of recent user activities.
- **Help Documentation**: In-app hub with illustrated guides for all features.
- **Inbox Intel**: Competitor email intelligence tool allowing users to track competitors' email communications. It captures, parses, and stores incoming emails from unique seed addresses, providing detailed analytics on sending cadence, send volume, subject line stats, ESP fingerprinting, authentication audits, and content patterns. Features include a unified feed for cross-competitor analysis, website screenshot capture for competitor tiles, and rule-based funnel detection for welcome sequences. Upcoming features include cross-competitor insights and comparison tools, and CSV export functionality for email data.

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
- **Microlink (`api.microlink.io`)**: For capturing website screenshots for Inbox Intel.