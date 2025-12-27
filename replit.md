# Fearless Video Coach

## Overview
Fearless Video Coach is a web application designed for private practice in video marketing. It allows users to record short in-browser videos, receive automatic transcriptions, and get AI-powered scoring and improvement suggestions based on a 5-part video formula: Hook, Set the Hook, First CTA, Content, and Final CTA. The application prioritizes private practice, with no public sharing features, and includes a 30-day video retention policy with automatic cleanup.

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
- **Session Management**: Express sessions with PostgreSQL store (3-hour rolling inactivity timeout)
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
- **Video Lifecycle**: Videos auto-delete after 30 days.
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
- **Video Pulse Finder**: YouTube topic research and script generation based on Mark's 5-part formula, using YouTube autocomplete and OpenAI.

## External Dependencies

### AI Services (via Replit AI Integrations)
- **Gemini API**: For video transcription.
- **OpenAI API**: For transcript scoring and feedback generation.

### Database
- **PostgreSQL**: Primary data store for users, sessions, and session store.

### Keap Integration
- **Purpose**: Sync new signups to Keap email list.
- **Mechanism**: OAuth 2.0, token storage, auto-refresh, rate limiting, and tag management for new signups.

### Email Configuration
- **Purpose**: Password reset emails.
- **Settings**: SMTP host, port, user, password, from address, and app base URL.

### OAuth Login
- **Providers**: Google, Facebook, Apple.
- **Mechanism**: Standard OAuth flows for user authentication and account linking.