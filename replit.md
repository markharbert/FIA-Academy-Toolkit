# Fearless Video Coach

## Overview

Fearless Video Coach is a web application for practicing video marketing skills. Users record short videos in-browser, receive automatic transcription, and get AI-powered scoring and improvement suggestions based on a 5-part video formula: Hook, Set the Hook, First CTA, Content, and Final CTA.

The app is designed for private practice—no public sharing or social features. Videos are stored for 30 days before automatic cleanup.

## Branding

- **App Name**: Fearless Video Coach
- **Logo**: Mark Harbert logo displayed in header and auth pages
- **Logo Location**: `attached_assets/Mark_Harbert_Logo_(2)_1766503621615.png`

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
  - **Timeout**: 3 hours of inactivity (configured in `server/routes.ts`)
  - **Rolling Sessions**: Each request resets the 3-hour timer, keeping active users logged in
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

2. **Video Lifecycle**: Videos auto-delete after 30 days via scheduled cleanup job (`server/cleanup.ts`). Sessions track `videoPath`, `videoDeletedAt`, and `expiresAt`.

3. **Goal-Based Scoring**: Users select a goal type (sales, lead, education, recruit) that tailors AI feedback to their specific use case.

4. **Monorepo Structure**: Client code in `client/`, server in `server/`, shared types in `shared/`. Build outputs to `dist/`.

5. **Session Naming**: Users can name their practice sessions with custom titles, or let AI auto-generate titles from transcripts.

6. **Device Selection**: Camera and microphone device selection with localStorage persistence and real-time audio level visualization.

7. **Retranscribe**: Users can redo transcription up to 3 times per session if AI transcription is inaccurate.

8. **Audio-First Processing Pipeline**: Optimized for speed using audio-first architecture:
   - Extract audio immediately from uploaded video (mono, 16kHz, 64kbps MP3)
   - Transcribe and score the audio track without waiting for video preview
   - Results (transcript + score) delivered in ~1-2 minutes
   - Video preview generates in background (non-blocking)
   - Frontend polls until preview is available
   - Instrumented with ProcessingMetrics table for timing analysis

9. **PDF Reports**: Users can download branded PDF reports of their session scores, including overall score, part-by-part breakdown, strengths, improvements, and transcript.

10. **Theme Preferences**: Users can choose Light/Dark/System theme with dropdown toggle, persisted to database in `users.themePreference`.

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

### Keap Integration (Email List Sync)
- **Purpose**: Automatically add new signups to Keap email list
- **OAuth Flow**: Admin connects Keap once via OAuth 2.0 with CSRF protection via state parameter
- **Token Storage**: Access/refresh tokens in `system_settings` table
- **Auto-Refresh**: Tokens automatically refresh before expiration (5 min buffer)
- **Rate Limiting**: Implements retry with backoff for 429 errors
- **Tag Management**: Admin can fetch tags from Keap and set a default tag for new signups
- **Debugging**: Comprehensive logging with traceIds for debugging OAuth and API issues

#### Keap Environment Variables
- `KEAP_CLIENT_ID`: OAuth client ID from Keap developer portal
- `KEAP_CLIENT_SECRET`: OAuth client secret
- `KEAP_REDIRECT_URI`: Callback URL (e.g., https://yourapp.com/api/admin/keap/callback)
- `KEAP_TAG_ID`: (Optional, deprecated) Fallback tag ID - prefer using admin UI tag selection
- `KEAP_AUTHORIZE_URL_BASE`: (Optional) Defaults to https://accounts.infusionsoft.com/app/oauth/authorize
- `KEAP_TOKEN_URL`: (Optional) Defaults to https://api.infusionsoft.com/token

#### Tag Management
- Admin can fetch available tags from Keap in the admin panel
- Select a default tag to apply to all new signups
- Tags are stored in `system_settings`: `keapDefaultTagId`, `keapDefaultTagName`
- Per-user tag application available via admin user details drawer

### Email Configuration (Password Reset)
- `SMTP_HOST`: SMTP server hostname (e.g., smtp.gmail.com)
- `SMTP_PORT`: SMTP port (default: 587)
- `SMTP_USER`: SMTP username/email
- `SMTP_PASS`: SMTP password or app-specific password
- `SMTP_FROM`: From email address for outgoing emails
- `APP_BASE_URL`: Base URL for reset links (e.g., https://yourapp.replit.app)

### OAuth Login (Google, Facebook, Apple)
#### Google OAuth
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
- `GOOGLE_REDIRECT_URI`: (Optional) Callback URL, defaults to `{APP_BASE_URL}/api/auth/oauth/google/callback`

#### Facebook OAuth
- `FACEBOOK_APP_ID`: Facebook App ID
- `FACEBOOK_APP_SECRET`: Facebook App secret
- `FACEBOOK_REDIRECT_URI`: (Optional) Callback URL, defaults to `{APP_BASE_URL}/api/auth/oauth/facebook/callback`

#### Apple OAuth
- `APPLE_CLIENT_ID`: Apple Services ID (e.g., com.example.webapp)
- `APPLE_TEAM_ID`: Apple Developer Team ID
- `APPLE_KEY_ID`: Key ID for the private key
- `APPLE_PRIVATE_KEY`: Private key content (with \n for newlines)
- `APPLE_REDIRECT_URI`: (Optional) Callback URL, defaults to `{APP_BASE_URL}/api/auth/oauth/apple/callback`
- Note: Apple uses POST for callback, email is only provided on first authorization

#### Admin Page
- Located at `/admin` (accessible to admin users only)
- **Overview Tab**: Dashboard with stats cards (Total Users, Sessions Last 7 Days, New Users Last 30 Days) and activity feed showing session creation events with View button to open session detail drawer
- **Users Tab**: User management with search, filters, and user details drawer
- **Keap Integration Tab**: Connect/disconnect Keap, manage tags, and set default tag for new signups

#### Admin API Endpoints
- `GET /api/admin/overview/stats` - Dashboard statistics (totalUsers, sessionsLast7Days, newUsersLast30Days)
- `GET /api/admin/overview/activity` - Activity feed with cursor pagination (limit, cursor query params)
- `GET /api/admin/sessions/:sessionId` - Full session detail with video, scores, transcript, recommendations
- `GET /api/admin/sessions/:sessionId/video` - Stream video file for admin viewing (with range support)
- `GET /api/admin/users` - User list with search, filter, sort, pagination
- `GET /api/admin/users/:id` - User details with sessions and identities
- `GET /api/admin/keap/status` - Keap connection status
- `GET /api/admin/keap/tags` - Fetch cached tags (72-hour TTL)
- `POST /api/admin/keap/tags/refresh` - Force refresh tags from Keap API

#### Signup to Keap Sync
- On successful signup with email consent, user is added to Keap as contact
- Contact includes email, first name, last name if provided
- Tag is applied if KEAP_TAG_ID is configured
- Failures are logged but don't block signup

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

## Database Schema

### Users Table
- `id`: UUID primary key
- `email`: Unique email address
- `passwordHash`: Bcrypt hashed password
- `createdAt`: Account creation timestamp
- `keapContactId`: (Optional) Keap contact ID after sync
- `emailConsentAt`: (Optional) Email consent timestamp
- `emailConsentIp`: (Optional) IP address at consent time
- `isAdmin`: Boolean flag for admin access

### Sessions Table
- `id`: UUID primary key
- `userId`: Foreign key to users table
- `createdAt`: Session creation timestamp
- `goalType`: Video goal type (sales, lead, education, recruit)
- `durationSeconds`: Video duration in seconds
- `videoPath`: Path to video file
- `thumbnailPath`: Path to thumbnail image
- `expiresAt`: Video expiration timestamp (30 days from creation)
- `videoDeletedAt`: When video was deleted (null if still available)
- `transcriptText`: AI-generated transcript
- `transcriptEditedText`: User-edited transcript
- `scoreJson`: JSON object with scoring results
- `title`: Session title (user-provided or AI-generated)
- `titleSource`: How title was created ('ai' or 'user')
- `retranscribeCount`: Number of retranscription attempts
- `lastRetranscribeAt`: Timestamp of last retranscription

### System Settings Table
- `id`: Primary key (always 'keap_integration')
- `keapAccessToken`: OAuth access token
- `keapRefreshToken`: OAuth refresh token
- `keapTokenExpiresAt`: Token expiration timestamp
- `keapConnectedAt`: Connection timestamp

## Duplicate Account Prevention

The system prevents duplicate accounts through:
- **Case-insensitive unique index**: `LOWER(TRIM(email))` on users table
- **Email normalization**: All emails are trimmed and lowercased before storage
- **OAuth identity linking**: OAuth providers link to existing users by normalized email

### Admin Duplicate Detection & Merge
- `GET /api/admin/users/duplicates` - Finds any duplicate email accounts
- `POST /api/admin/users/merge` - Merges duplicates with confirmation and audit logging
- Merge is transactional and handles identity conflicts (skips if both users have same provider)

## Making a User Admin

To make a user an admin (required for Keap integration setup):
```sql
UPDATE users SET is_admin = true WHERE email = 'your-email@example.com';
```