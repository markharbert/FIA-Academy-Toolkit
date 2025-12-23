# Video Confidence Coach

## Overview

Video Confidence Coach is a web application for practicing video marketing skills. Users record short videos in-browser, receive automatic transcription, and get AI-powered scoring and improvement suggestions based on a 5-part video formula: Hook, Set the Hook, First CTA, Content, and Final CTA.

The app is designed for private practice—no public sharing or social features. Videos are stored for 7 days before automatic cleanup.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with hot module replacement
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Pattern**: RESTful JSON API under `/api/*` routes
- **Session Management**: Express sessions with PostgreSQL session store (connect-pg-simple)
- **Authentication**: Custom session-based auth with bcrypt password hashing
- **File Uploads**: Multer for video file handling (stored in `uploads/` directory)

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` (shared between frontend and backend)
- **Migrations**: Drizzle Kit (`db:push` for schema sync)
- **File Storage**: Local filesystem (`uploads/` directory) structured for future S3 migration

### AI Integration
- **Transcription**: Google Gemini API (gemini-2.5-flash) via Replit AI Integrations
- **Scoring**: OpenAI API via Replit AI Integrations
- **Pattern**: Video uploaded → Gemini transcribes audio → OpenAI scores transcript against 5-part formula

### Key Design Decisions

1. **Shared Schema**: Database schemas and Zod validators in `shared/schema.ts` ensure type safety across frontend and backend.

2. **Video Lifecycle**: Videos auto-delete after 7 days via scheduled cleanup job (`server/cleanup.ts`). Sessions track `videoPath` and `videoDeletedAt`.

3. **Goal-Based Scoring**: Users select a goal type (sales, lead, education, recruit) that tailors AI feedback to their specific use case.

4. **Monorepo Structure**: Client code in `client/`, server in `server/`, shared types in `shared/`. Build outputs to `dist/`.

## External Dependencies

### AI Services (via Replit AI Integrations)
- **Gemini API**: Video transcription using `gemini-2.5-flash` model
  - Environment: `AI_INTEGRATIONS_GEMINI_API_KEY`, `AI_INTEGRATIONS_GEMINI_BASE_URL`
- **OpenAI API**: Transcript scoring and feedback generation
  - Environment: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`

### Database
- **PostgreSQL**: Primary data store
  - Environment: `DATABASE_URL`
  - Used for: Users, sessions, session store

### Key npm Dependencies
- `drizzle-orm` / `drizzle-kit`: Database ORM and migrations
- `@google/genai`: Gemini client for transcription
- `openai`: OpenAI client for scoring
- `multer`: File upload handling
- `bcrypt`: Password hashing
- `express-session` / `connect-pg-simple`: Session management
- `@tanstack/react-query`: Frontend data fetching
- `@radix-ui/*`: Accessible UI primitives
- `wouter`: Client-side routing