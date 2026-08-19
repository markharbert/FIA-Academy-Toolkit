import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, serial, timestamp, jsonb, boolean, real, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Auth provider types for OAuth
export const authProviders = ["local", "google", "facebook", "apple"] as const;
export type AuthProvider = typeof authProviders[number];

// User role types
export const userRoles = ["user", "admin", "super_admin"] as const;
export type UserRole = typeof userRoles[number];

// Theme preference types
export const themePreferences = ["light", "dark", "system"] as const;
export type ThemePreference = typeof themePreferences[number];

// Users table for authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email"), // Nullable for OAuth users without email
  passwordHash: text("password_hash"), // Nullable for OAuth users
  displayName: text("display_name"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  emailVerifiedAt: timestamp("email_verified_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  emailConsentAt: timestamp("email_consent_at"),
  emailConsentIp: text("email_consent_ip"),
  isAdmin: boolean("is_admin").default(false),
  role: text("role").default("user").$type<UserRole>(),
  isDisabled: boolean("is_disabled").default(false),
  disabledAt: timestamp("disabled_at"),
  disabledReason: text("disabled_reason"),
  lastLoginAt: timestamp("last_login_at"),
  themePreference: text("theme_preference").default("system").$type<ThemePreference>(),
  timezone: text("timezone").default("America/New_York").notNull(),
  cfEnrolled: boolean("cf_enrolled").default(false),
  cfContactId: text("cf_contact_id"),
  cfEnrolledAt: timestamp("cf_enrolled_at"),
  cfRevokedAt: timestamp("cf_revoked_at"),
  cfRevokedGraceUntil: timestamp("cf_revoked_grace_until"),
  cfGraceExpirySentAt: timestamp("cf_grace_expiry_sent_at"),
  icalToken: text("ical_token"),
  dashboardLayout: jsonb("dashboard_layout"),
  swipePromoLinks: jsonb("swipe_promo_links").$type<string[]>().default(sql`'[]'::jsonb`),
  fiaAffiliateLink: text("fia_affiliate_link"),
});

// User identities table for OAuth providers (supports multiple providers per user)
export const userIdentities = pgTable("user_identities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().$type<AuthProvider>(),
  providerUserId: text("provider_user_id").notNull(),
  emailFromProvider: text("email_from_provider"),
  emailVerifiedByProvider: boolean("email_verified_by_provider").default(false),
  nameFromProvider: text("name_from_provider"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  requestIp: text("request_ip"),
  userAgent: text("user_agent"),
});

export const magicLinkTokens = pgTable("magic_link_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;
export type InsertMagicLinkToken = typeof magicLinkTokens.$inferInsert;

// Admin audit log table for tracking admin actions
export const adminAuditLog = pgTable("admin_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  targetUserId: varchar("target_user_id").references(() => users.id),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
});

// Session folders table for organizing practice sessions
export const sessionFolders = pgTable("session_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertSessionFolderSchema = createInsertSchema(sessionFolders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSessionFolder = z.infer<typeof insertSessionFolderSchema>;
export type SessionFolder = typeof sessionFolders.$inferSelect;

// User action types for lifetime activity logging
export const userActionTypes = [
  "session_created",
  "session_deleted", 
  "sessions_bulk_deleted",
  "session_title_updated",
  "session_moved_to_folder",
  "transcript_regenerated",
  "login_success",
  "logout",
  "account_updated",
  "video_uploaded",
  "upload_failed",
  "processing_started",
  "processing_completed",
  "processing_failed",
  "file_validation_failed",
  "folder_created",
  "folder_renamed",
  "folder_deleted",
  "project_created",
  "project_updated",
  "project_deleted",
  "task_created",
  "task_updated",
  "task_completed",
  "task_deleted",
  "dmo_logged",
  "topic_searched",
  "script_generated",
  "script_deleted",
  "teleprompter_script_created",
  "teleprompter_script_updated",
  "teleprompter_script_deleted",
  "teleprompter_recording_uploaded",
  "password_changed",
  "password_reset_requested",
] as const;
export type UserActionType = typeof userActionTypes[number];

// User action log table for tracking lifetime user activity
export const userActionLog = pgTable("user_action_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  actionType: text("action_type").notNull().$type<UserActionType>(),
  actionLabel: text("action_label").notNull(),
  entityType: text("entity_type"), // e.g. "session", "account", "auth"
  entityId: text("entity_id"), // e.g. sessionId
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  passwordHash: true,
  displayName: true,
  firstName: true,
  lastName: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Account update schema for profile changes
export const updateAccountSchema = z.object({
  displayName: z.string().max(40, "Display name must be 40 characters or less").optional().nullable(),
  firstName: z.string().max(40, "First name must be 40 characters or less").optional().nullable(),
  lastName: z.string().max(40, "Last name must be 40 characters or less").optional().nullable(),
  themePreference: z.enum(["light", "dark", "system"]).optional(),
  timezone: z.string().min(1).max(64).optional(),
});

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

// Goal types for video sessions
export const goalTypes = ["sales", "lead", "education", "recruit"] as const;
export type GoalType = typeof goalTypes[number];

export const goalTypeLabels: Record<GoalType, string> = {
  sales: "Make Sales",
  lead: "Generate Leads",
  education: "Educate & Provide Value",
  recruit: "Recruit & Attract Team Members",
};

// JSON structure for AI scoring results
export const scoreResultSchema = z.object({
  totalScore: z.number().min(0).max(100),
  partScores: z.object({
    hook: z.number().min(0).max(20),
    setHook: z.number().min(0).max(20),
    firstCTA: z.number().min(0).max(20),
    content: z.number().min(0).max(20),
    finalCTA: z.number().min(0).max(20),
  }),
  summary: z.object({
    strengths: z.array(z.string()),
    topImprovements: z.array(z.string()),
    overallSummary: z.string().optional(),
    actionChecklist: z.array(z.string()).optional(),
  }),
  parts: z.object({
    hook: z.object({
      whatWorked: z.array(z.string()),
      whatMissing: z.array(z.string()),
      suggestions: z.array(z.string()),
      exampleLines: z.array(z.string()),
    }),
    setHook: z.object({
      whatWorked: z.array(z.string()),
      whatMissing: z.array(z.string()),
      suggestions: z.array(z.string()),
      exampleLines: z.array(z.string()),
    }),
    firstCTA: z.object({
      whatWorked: z.array(z.string()),
      whatMissing: z.array(z.string()),
      suggestions: z.array(z.string()),
      exampleLines: z.array(z.string()),
    }),
    content: z.object({
      whatWorked: z.array(z.string()),
      whatMissing: z.array(z.string()),
      suggestions: z.array(z.string()),
      exampleLines: z.array(z.string()),
    }),
    finalCTA: z.object({
      whatWorked: z.array(z.string()),
      whatMissing: z.array(z.string()),
      suggestions: z.array(z.string()),
      exampleLines: z.array(z.string()),
    }),
  }),
  delivery: z.object({
    wordsPerMinute: z.number(),
    fillerWords: z.object({
      count: z.number(),
      examples: z.array(z.string()),
    }),
    clarityNotes: z.array(z.string()),
  }),
});

export type ScoreResult = z.infer<typeof scoreResultSchema>;

// Title source types for sessions
export const titleSources = ["ai", "user", "youtube"] as const;
export type TitleSource = typeof titleSources[number];

// Processing status types for video processing pipeline
export const processingStatuses = [
  "queued",
  "uploading",
  "transcoding",
  "transcribing",
  "scoring",
  "ready",
  "failed",
] as const;
export type ProcessingStatus = typeof processingStatuses[number];

// Processing step labels for UI display
export const processingStepLabels: Record<ProcessingStatus, string> = {
  queued: "Queued",
  uploading: "Uploading video",
  transcoding: "Converting video",
  transcribing: "Transcribing audio",
  scoring: "Analyzing and scoring",
  ready: "Complete",
  failed: "Failed",
};

// Processing step numbers (1-based)
export const processingStepNumbers: Record<ProcessingStatus, number> = {
  queued: 1,
  uploading: 1,
  transcoding: 2,
  transcribing: 3,
  scoring: 4,
  ready: 5,
  failed: 0,
};

// HLS Preview status types for progressive streaming
export const hlsStatuses = ["queued", "generating", "playable", "complete", "failed"] as const;
export type HlsStatus = typeof hlsStatuses[number];

// Transcript status types for audio processing
export const transcriptStatuses = ["not_started", "extracting_audio", "transcribing", "complete", "failed"] as const;
export type TranscriptStatus = typeof transcriptStatuses[number];

// Score status types for progressive scoring
export const scoreStatuses = ["not_started", "partial", "final", "failed"] as const;
export type ScoreStatus = typeof scoreStatuses[number];

// Source type for video sessions
export const sourceTypes = ["upload", "youtube"] as const;
export type SourceType = typeof sourceTypes[number];

// FFprobe output structure for video validation
export interface FFProbeResult {
  format: {
    filename: string;
    format_name: string;
    format_long_name: string;
    duration: string;
    size: string;
    bit_rate: string;
  };
  streams: Array<{
    codec_type: "video" | "audio" | "data" | "subtitle";
    codec_name?: string;
    width?: number;
    height?: number;
    duration?: string;
    bit_rate?: string;
    sample_rate?: string;
    channels?: number;
  }>;
}

// Processing metrics table for timing instrumentation
export const processingMetrics = pgTable("processing_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  stepName: text("step_name").notNull(),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at"),
  durationMs: integer("duration_ms"),
  success: boolean("success"),
  errorSummary: text("error_summary"),
  metadata: jsonb("metadata"),
});

export type ProcessingMetric = typeof processingMetrics.$inferSelect;
export type InsertProcessingMetric = typeof processingMetrics.$inferInsert;

// Sessions table for video practice sessions
export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  folderId: varchar("folder_id").references(() => sessionFolders.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`),
  goalType: text("goal_type").notNull().$type<GoalType>(),
  durationSeconds: integer("duration_seconds"),
  videoPath: text("video_path"),
  videoMimeType: text("video_mime_type"),
  videoSizeBytes: integer("video_size_bytes"),
  thumbnailPath: text("thumbnail_path"),
  expiresAt: timestamp("expires_at"),
  videoDeletedAt: timestamp("video_deleted_at"),
  transcriptText: text("transcript_text"),
  transcriptEditedText: text("transcript_edited_text"),
  scoreJson: jsonb("score_json").$type<ScoreResult>(),
  scoreUpdatedAt: timestamp("score_updated_at"),
  title: text("title"),
  titleSource: text("title_source").$type<TitleSource>(),
  titleGeneratedAt: timestamp("title_generated_at"),
  retranscribeCount: integer("retranscribe_count").default(0),
  lastRetranscribeAt: timestamp("last_retranscribe_at"),
  processingStatus: text("processing_status").default("queued").$type<ProcessingStatus>(),
  processingProgress: integer("processing_progress").default(0),
  processingMessage: text("processing_message"),
  processingError: text("processing_error"),
  processingStartedAt: timestamp("processing_started_at"),
  processingUpdatedAt: timestamp("processing_updated_at"),
  processingCompletedAt: timestamp("processing_completed_at"),
  sourceType: text("source_type").default("upload").$type<SourceType>(),
  youtubeUrl: text("youtube_url"),
  youtubeVideoId: text("youtube_video_id"),
  youtubeTitle: text("youtube_title"),
  originalUploadFilename: text("original_upload_filename"),
  originalUploadMimeType: text("original_upload_mime_type"),
  originalUploadSizeBytes: integer("original_upload_size_bytes"),
  originalUploadExtension: text("original_upload_extension"),
  originalProbeJson: jsonb("original_probe_json").$type<FFProbeResult>(),
  originalUploadPath: text("original_upload_path"),
  cloudStoragePath: text("cloud_storage_path"),
  previewVideoPath: text("preview_video_path"),
  previewCloudStoragePath: text("preview_cloud_storage_path"),
  previewGeneratedAt: timestamp("preview_generated_at"),
  previewVideoMimeType: text("preview_video_mime_type"),
  previewVideoSizeBytes: integer("preview_video_size_bytes"),
  previewVideoDurationSeconds: integer("preview_video_duration_seconds"),
  previewVideoStatus: text("preview_video_status").default("queued").$type<"queued" | "generating" | "ready" | "failed">(),
  previewVideoError: text("preview_video_error"),
  previewPosterPath: text("preview_poster_path"),
  previewPosterMimeType: text("preview_poster_mime_type"),
  previewPosterGeneratedAt: timestamp("preview_poster_generated_at"),
  timelineFrames: text("timeline_frames").array(),
  timelineFramesGeneratedAt: timestamp("timeline_frames_generated_at"),
  originalDeletedAt: timestamp("original_deleted_at"),
  finalVideoPath: text("final_video_path"),
  finalVideoResolution: text("final_video_resolution"),
  hlsStatus: text("hls_status").default("queued").$type<HlsStatus>(),
  hlsPlaylistPath: text("hls_playlist_path"),
  hlsDir: text("hls_dir"),
  hlsReadyAt: timestamp("hls_ready_at"),
  hlsCompleteAt: timestamp("hls_complete_at"),
  hlsError: text("hls_error"),
  transcriptStatus: text("transcript_status").default("not_started").$type<TranscriptStatus>(),
  audioPath: text("audio_path"),
  audioExtractedAt: timestamp("audio_extracted_at"),
  scoreStatus: text("score_status").default("not_started").$type<ScoreStatus>(),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  createdAt: true,
});

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// Auth schemas for API validation
export const signupSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  emailConsent: z.boolean().refine((val) => val === true, {
    message: "You must agree to receive emails to create an account",
  }),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

// User identity types
export type UserIdentity = typeof userIdentities.$inferSelect;
export type InsertUserIdentity = typeof userIdentities.$inferInsert;

// Password reset token types
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

// Forgot password schema
export const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

// Reset password schema
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// Admin audit log types
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;
export type InsertAdminAuditLog = typeof adminAuditLog.$inferInsert;

// User action log types
export type UserActionLog = typeof userActionLog.$inferSelect;
export type InsertUserActionLog = typeof userActionLog.$inferInsert;

// Admin user update schema
export const adminUpdateUserSchema = z.object({
  role: z.enum(["user", "admin"]).optional(),
  isDisabled: z.boolean().optional(),
  disabledReason: z.string().optional().nullable(),
  displayName: z.string().max(40).optional().nullable(),
  firstName: z.string().max(40).optional().nullable(),
  lastName: z.string().max(40).optional().nullable(),
});

export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;

// ==========================================
// Topic Pulse Finder Module
// ==========================================

// Intent types for video topics
export const topicIntents = ["review", "comparison", "how-to", "problem-fix", "beginner-guide", "top-list", "buyer"] as const;
export type TopicIntent = typeof topicIntents[number];

// Video type preferences — must stay in sync with topicIntents
export const videoTypes = ["review", "comparison", "how-to", "problem-fix", "beginner-guide", "top-list", "buyer"] as const;
export type VideoType = typeof videoTypes[number];

// Audience levels
export const audienceLevels = ["beginner", "intermediate", "advanced"] as const;
export type AudienceLevel = typeof audienceLevels[number];

// Tone preferences
export const tonePreferences = ["friendly", "direct", "coach"] as const;
export type TonePreference = typeof tonePreferences[number];

// Topic run status
export const topicRunStatuses = ["pending", "processing", "complete", "failed"] as const;
export type TopicRunStatus = typeof topicRunStatuses[number];

// Trend direction
export const trendDirections = ["rising", "steady", "falling", "unknown"] as const;
export type TrendDirection = typeof trendDirections[number];

// Video length targets
export const videoLengthTargets = ["3-5", "6-10", "10-15"] as const;
export type VideoLengthTarget = typeof videoLengthTargets[number];

// API key providers for user-specific keys
export const apiKeyProviders = ["keywords_everywhere"] as const;
export type ApiKeyProvider = typeof apiKeyProviders[number];

// User API keys table for storing user-specific external API keys
export const userApiKeys = pgTable("user_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().$type<ApiKeyProvider>(),
  encryptedKey: text("encrypted_key").notNull(),
  keyLastFour: text("key_last_four"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertUserApiKeySchema = createInsertSchema(userApiKeys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserApiKey = z.infer<typeof insertUserApiKeySchema>;
export type UserApiKey = typeof userApiKeys.$inferSelect;

// Topic runs table for tracking topic generation requests
export const topicRuns = pgTable("topic_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  seedQuery: text("seed_query").notNull(),
  settingsJson: jsonb("settings_json").$type<{
    affiliateProduct?: string;
    audienceLevel?: AudienceLevel;
    tonePreference?: TonePreference;
    videoType?: VideoType;
    region?: string;
    recencyDays?: number;
  }>(),
  status: text("status").default("pending").$type<TopicRunStatus>(),
  runtimeMs: integer("runtime_ms"),
  topicCount: integer("topic_count").default(0),
  errorMessage: text("error_message"),
});

export const insertTopicRunSchema = createInsertSchema(topicRuns).omit({
  id: true,
  createdAt: true,
  runtimeMs: true,
  topicCount: true,
  errorMessage: true,
});

export type InsertTopicRun = z.infer<typeof insertTopicRunSchema>;
export type TopicRun = typeof topicRuns.$inferSelect;

// Demand signals JSON structure
export const demandSignalsSchema = z.object({
  autocompletePresent: z.boolean(),
  trendDirection: z.enum(trendDirections),
  freshnessScore: z.number().min(0).max(100),
  competitionScore: z.number().min(0).max(100),
  avgChannelSize: z.number().optional(),
  topVideoViews: z.array(z.number()).optional(),
  recentVideoCount: z.number().optional(),
});

export type DemandSignals = z.infer<typeof demandSignalsSchema>;

// Trend data point for 12-month historical data
export const trendDataPointSchema = z.object({
  month: z.string(),
  year: z.number(),
  value: z.number(),
});
export type TrendDataPoint = z.infer<typeof trendDataPointSchema>;

// Topics table for generated topic ideas
export const topics = pgTable("topics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull().references(() => topicRuns.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  topicTitle: text("topic_title").notNull(),
  keywordQuery: text("keyword_query").notNull(),
  intents: text("intents").array().$type<TopicIntent[]>(),
  opportunityScore: integer("opportunity_score").default(0),
  monthlySearchVolume: integer("monthly_search_volume"),
  cpc: real("cpc"),
  competition: real("competition"),
  trendData: jsonb("trend_data").$type<TrendDataPoint[]>(),
  demandSignalsJson: jsonb("demand_signals_json").$type<DemandSignals>(),
  whyText: text("why_text"),
  suggestedAngles: jsonb("suggested_angles").$type<string[]>(),
  suggestedHooks: jsonb("suggested_hooks").$type<string[]>(),
  suggestedTitles: jsonb("suggested_titles").$type<string[]>(),

  commonQuestions: jsonb("common_questions").$type<string[]>(),
  intentAnalysis: text("intent_analysis"),
  pinterestVolume: integer("pinterest_volume"),
  pinterestCpc: real("pinterest_cpc"),
  pinterestCompetition: real("pinterest_competition"),
  pinterestTrendData: jsonb("pinterest_trend_data").$type<TrendDataPoint[]>(),
  youtubeVolume: integer("youtube_volume"),
  youtubeCpc: real("youtube_cpc"),
  youtubeCompetition: real("youtube_competition"),
  youtubeTrendData: jsonb("youtube_trend_data").$type<TrendDataPoint[]>(),
  tiktokVolume: integer("tiktok_volume"),
  tiktokCpc: real("tiktok_cpc"),
  tiktokCompetition: real("tiktok_competition"),
  tiktokTrendData: jsonb("tiktok_trend_data").$type<TrendDataPoint[]>(),
});

export const insertTopicSchema = createInsertSchema(topics).omit({
  id: true,
  createdAt: true,
});

export type InsertTopic = z.infer<typeof insertTopicSchema>;
export type Topic = typeof topics.$inferSelect;

// Saved topics table for user's bookmarked topics
export const savedTopics = pgTable("saved_topics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  topicId: varchar("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertSavedTopicSchema = createInsertSchema(savedTopics).omit({
  id: true,
  createdAt: true,
});

export type InsertSavedTopic = z.infer<typeof insertSavedTopicSchema>;
export type SavedTopic = typeof savedTopics.$inferSelect;

// Script structure for the 5-part formula
export const scriptSectionSchema = z.object({
  hook: z.object({
    text: z.string(),
    duration: z.string(),
    onScreenText: z.array(z.string()).optional(),
  }),
  setHook: z.object({
    text: z.string(),
    duration: z.string(),
    onScreenText: z.array(z.string()).optional(),
  }),
  firstCTA: z.object({
    text: z.string(),
    duration: z.string(),
  }),
  content: z.object({
    text: z.string(),
    sections: z.array(z.object({
      title: z.string(),
      content: z.string(),
      timestamp: z.string().optional(),
      brollIdeas: z.array(z.string()).optional(),
      onScreenText: z.array(z.string()).optional(),
    })),
  }),
  finalCTA: z.object({
    text: z.string(),
    duration: z.string(),
    nextVideoSuggestion: z.string().optional(),
  }),
});

export const scriptJsonSchema = z.object({
  fullScript: scriptSectionSchema,
  expandedScript: z.string().optional(),
  shortsScript: z.string().optional(),
  pinnedComment: z.string().optional(),
  description: z.object({
    summary: z.string(),
    affiliateDisclosure: z.string(),
    linkSection: z.string(),
    tags: z.array(z.string()),
  }).optional(),
});

export type ScriptJson = z.infer<typeof scriptJsonSchema>;

// Scripts table for generated video scripts
export const scripts = pgTable("scripts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  topicId: varchar("topic_id").references(() => topics.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  title: text("title").notNull(),
  inputsJson: jsonb("inputs_json").$type<{
    videoLengthTarget: VideoLengthTarget;
    affiliateOffer: string;
    affiliateLinkLabel: string;
    primaryPromise: string;
    personalAngle?: string;
    tonePreference?: TonePreference;
  }>(),
  scriptJson: jsonb("script_json").$type<ScriptJson>(),
  notes: text("notes"),
  teleprompterScriptId: varchar("teleprompter_script_id"),
});

export const insertScriptSchema = createInsertSchema(scripts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertScript = z.infer<typeof insertScriptSchema>;
export type Script = typeof scripts.$inferSelect;

// Standalone teleprompter scripts — plain text scripts uploaded by the user
export const teleprompterScripts = pgTable("teleprompter_scripts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  bulletPoints: text("bullet_points"),
  takeCount: integer("take_count").default(0).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTeleprompterScriptSchema = createInsertSchema(teleprompterScripts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const upsertTeleprompterScriptSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Title must be 120 characters or less"),
  content: z.string().min(1, "Script content is required").max(100000, "Script is too long (max 100,000 characters)"),
  bulletPoints: z.string().max(50000).nullish(),
});

export type InsertTeleprompterScript = z.infer<typeof insertTeleprompterScriptSchema>;
export type TeleprompterScript = typeof teleprompterScripts.$inferSelect;

// Teleprompter Recordings (30-day cloud takes)
export const teleprompterRecordings = pgTable("teleprompter_recordings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  scriptId: varchar("script_id").references(() => teleprompterScripts.id, { onDelete: "set null" }),
  title: text("title").notNull().default(""),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull().default("video/webm"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  durationSeconds: integer("duration_seconds"),
  format: text("format").notNull().default("landscape"),
  expiresAt: timestamp("expires_at").notNull(),
  processingStatus: text("processing_status").default("complete").$type<"processing" | "complete" | "failed">(),
  transcriptText: text("transcript_text"),
  scoreGoalType: text("score_goal_type").$type<GoalType>(),
  scoreJson: jsonb("score_json").$type<ScoreResult>(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type TeleprompterRecording = typeof teleprompterRecordings.$inferSelect;
export type InsertTeleprompterRecording = typeof teleprompterRecordings.$inferInsert;

// Link placeholders for affiliate links
export const linkPlaceholders = pgTable("link_placeholders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  url: text("url"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertLinkPlaceholderSchema = createInsertSchema(linkPlaceholders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLinkPlaceholder = z.infer<typeof insertLinkPlaceholderSchema>;
export type LinkPlaceholder = typeof linkPlaceholders.$inferSelect;

// Topic search input schema for API validation
export const topicSearchInputSchema = z.object({
  seedQuery: z.string().min(2, "Please enter at least 2 characters"),
  affiliateProduct: z.string().optional(),
  audienceLevel: z.enum(audienceLevels).optional(),
  tonePreference: z.enum(tonePreferences).optional(),
  videoType: z.enum(videoTypes).optional(),
  region: z.string().optional(),
  recencyDays: z.number().min(7).max(90).optional(),
});

export type TopicSearchInput = z.infer<typeof topicSearchInputSchema>;

// Script generation input schema for API validation
export const scriptGenerationInputSchema = z.object({
  topicId: z.string(),
  videoLengthTarget: z.enum(videoLengthTargets),
  affiliateOffer: z.string().optional(),
  affiliateLinkLabel: z.string().optional(),
  primaryPromise: z.string().optional(),
  personalAngle: z.string().optional(),
  tonePreference: z.enum(tonePreferences).optional(),
});

export type ScriptGenerationInput = z.infer<typeof scriptGenerationInputSchema>;

// Video Trends monthly credits for users
export const videoTrendsCredits = pgTable("video_trends_credits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  creditsUsed: integer("credits_used").default(0).notNull(),
  totalCreditsUsed: integer("total_credits_used").default(0).notNull(),
  monthlyLimit: integer("monthly_limit").default(1000).notNull(),
  windowStartedAt: timestamp("window_started_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertVideoTrendsCreditsSchema = createInsertSchema(videoTrendsCredits).omit({
  id: true,
  updatedAt: true,
});

export type InsertVideoTrendsCredits = z.infer<typeof insertVideoTrendsCreditsSchema>;
export type VideoTrendsCredits = typeof videoTrendsCredits.$inferSelect;

// Saved offers for Call To Action tab
// App-wide settings key-value store
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const savedOffers = pgTable("saved_offers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  linkUrl: text("link_url"),
  linkLabel: text("link_label"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertSavedOfferSchema = createInsertSchema(savedOffers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSavedOffer = z.infer<typeof insertSavedOfferSchema>;
export type SavedOffer = typeof savedOffers.$inferSelect;

// ─── Inbox Analyzer ──────────────────────────────────────────────────────────

export type SpamFlag = {
  label: string;
  severity: "low" | "medium" | "high";
  category?: "trigger_word" | "subject_trigger" | "structural" | "pattern";
  matches?: string[];
};
export type CopyFeedbackSection = { name: string; score: number; feedback: string };
export type CopyFeedback = { sections: CopyFeedbackSection[]; topSuggestions: string[] };

export type SubjectAnalysis = {
  charCount: number;
  wordCount: number;
  hasEmoji: boolean;
  hasNumber: boolean;
  hasQuestion: boolean;
  hasPersonalizationToken: boolean;
  isIdealLength: boolean;
};

export type TechnicalHealth = {
  hasHtmlVersion: boolean;
  hasPlainTextVersion: boolean;
  estimatedSizeKb: number;
  missingAltCount: number;
  trackingPixelCount: number;
  uniqueExternalDomains: number;
  hasPreheader: boolean;
};

export type SenderTrust = {
  displayNameDomainMatch: boolean | null;
  replyToMatchesFrom: boolean | null;
  blacklisted: boolean;
  blacklistHits: string[];
  domainBlacklisted: boolean;
  domainBlacklistHits: string[];
  trackingDomainsChecked: string[];
  trackingDomainsBlacklisted: string[];
  trackingDomainMismatch: boolean;
  trackingDomainRoots: string[];
};

export type HiddenBlockResult = {
  text: string;
  methods: string[];
  position: number;
  hasLinks: boolean;
  hasImages: boolean;
  classification: 'PREHEADER' | 'AMBIGUOUS' | 'SPAM_SIGNAL';
};

export type HiddenTextClassification = 'NONE' | 'PREHEADER' | 'AMBIGUOUS' | 'SPAM_SIGNAL' | 'MIXED';

export type ContentQuality = {
  wordCount: number;
  linkCount?: number;
  hasPs: boolean;
  hasPersonalization: boolean;
  htmlToTextRatio: number;
  hasUrlShortener: boolean;
  hasHiddenText: boolean;
  hiddenTextClassification: HiddenTextClassification;
  hiddenBlocks: HiddenBlockResult[];
  hiddenTextSamples: string[];
  linkToTextRatio: number;
  isImageHeavy: boolean;
  subjectCharCount: number;
};

export type CanSpamCompliance = {
  hasPhysicalAddress: boolean;
  hasUnsubscribeLink: boolean;
  hasHonestSubject: boolean;
  score: number; // 0–100 for display
};

export const emailInboxAddresses = pgTable("email_inbox_addresses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  token: varchar("token", { length: 20 }).notNull().unique(),
  sendingFromAddress: text("sending_from_address"),
  lastPlacementResults: jsonb("last_placement_results"),
  lastPlacementCheckedAt: timestamp("last_placement_checked_at"),
  placementAutoCheckUntil: timestamp("placement_auto_check_until"),
  // Pinned context for the current monitoring window — identifies the specific email being tracked
  placementCheckMessageId: text("placement_check_message_id"),
  placementCheckReceivedAt: timestamp("placement_check_received_at"),
  placementCheckSubject: text("placement_check_subject"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const seedInboxes = pgTable("seed_inboxes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: text("provider").notNull(), // "gmail" | "outlook" | "other"
  label: text("label").notNull(),
  email: text("email").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  // Legacy OAuth tokens (personal Gmail only; keep for backward compat)
  oauthAccessToken: text("oauth_access_token"),
  oauthRefreshToken: text("oauth_refresh_token"),
  oauthTokenExpiry: timestamp("oauth_token_expiry"),
  isConnected: boolean("is_connected").default(false).notNull(),
  oauthNeedsReconnect: boolean("oauth_needs_reconnect").default(false).notNull(),
  // IMAP + App Password auth (personal Gmail — permanent, no re-auth needed)
  imapPassword: text("imap_password"),  // AES-256-GCM encrypted App Password
  authMethod: text("auth_method"),      // 'imap' | 'oauth' | 'dual' | null
});

export const insertSeedInboxSchema = createInsertSchema(seedInboxes).omit({ id: true, createdAt: true, oauthAccessToken: true, oauthRefreshToken: true, oauthTokenExpiry: true, isConnected: true, oauthNeedsReconnect: true, imapPassword: true, authMethod: true });
export type InsertSeedInbox = z.infer<typeof insertSeedInboxSchema>;
export type SeedInbox = typeof seedInboxes.$inferSelect;

export const emailAnalyses = pgTable("email_analyses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receivedAt: timestamp("received_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  fromAddress: text("from_address").notNull(),
  fromName: text("from_name"),
  replyTo: text("reply_to"),
  messageId: text("message_id"),
  subject: text("subject").notNull(),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  rawHeaders: text("raw_headers"),
  spfResult: varchar("spf_result", { length: 20 }),
  dkimResult: varchar("dkim_result", { length: 20 }),
  dmarcResult: varchar("dmarc_result", { length: 20 }),
  spfRecordExists: boolean("spf_record_exists"),
  dkimRecordExists: boolean("dkim_record_exists"),
  dmarcRecordExists: boolean("dmarc_record_exists"),
  spamScore: integer("spam_score"),
  spamFlags: jsonb("spam_flags").$type<SpamFlag[]>(),
  copyScore: integer("copy_score"),
  copyFeedback: jsonb("copy_feedback").$type<CopyFeedback>(),
  sendingDomain: text("sending_domain"),
  sendingIp: text("sending_ip"),
  overallScore: integer("overall_score"),
  subjectAnalysis: jsonb("subject_analysis").$type<SubjectAnalysis>(),
  technicalHealth: jsonb("technical_health").$type<TechnicalHealth>(),
  senderTrust: jsonb("sender_trust").$type<SenderTrust>(),
  contentQuality: jsonb("content_quality").$type<ContentQuality>(),
  canSpamCompliance: jsonb("can_spam_compliance").$type<CanSpamCompliance>(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  placementResults: jsonb("placement_results"),
  placementConfirmedAt: timestamp("placement_confirmed_at"),
});

export const insertEmailAnalysisSchema = createInsertSchema(emailAnalyses).omit({
  id: true,
  receivedAt: true,
});

export type InsertEmailAnalysis = z.infer<typeof insertEmailAnalysisSchema>;
export type EmailAnalysis = typeof emailAnalyses.$inferSelect;
export type EmailInboxAddress = typeof emailInboxAddresses.$inferSelect;

// ─── DMO Tracker ─────────────────────────────────────────────────────────────

export const dmoEntries = pgTable("dmo_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  // The 5 core DMO activities. Times stored in *seconds* (precise to the second).
  visionMeditation: boolean("vision_meditation").default(false).notNull(),
  visionSeconds: integer("vision_seconds").default(0).notNull(),
  personalDevelopment: boolean("personal_development").default(false).notNull(),
  personalSeconds: integer("personal_seconds").default(0).notNull(),
  expandSkills: boolean("expand_skills").default(false).notNull(),
  expandSeconds: integer("expand_seconds").default(0).notNull(),
  execution: boolean("execution").default(false).notNull(),
  executionSeconds: integer("execution_seconds").default(0).notNull(),
  connecting: boolean("connecting").default(false).notNull(),
  connectingSeconds: integer("connecting_seconds").default(0).notNull(),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  // Covers every per-user query: getDmoHistory (filter user, order date),
  // getDmoStreak (filter user, select distinct dates), getDmoToday (filter user + date).
  userDateIdx: index("idx_dmo_entries_user_date").on(t.userId, t.date),
}));

export const insertDmoEntrySchema = createInsertSchema(dmoEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDmoEntry = z.infer<typeof insertDmoEntrySchema>;
export type DmoEntry = typeof dmoEntries.$inferSelect;

export const dmoEntryDataSchema = createInsertSchema(dmoEntries).omit({
  id: true,
  userId: true,
  date: true,
  createdAt: true,
  updatedAt: true,
});

export type DmoEntryData = z.infer<typeof dmoEntryDataSchema>;

// ── DMO Settings (per-user goal targets) ─────────────────────────────────────

export const dmoSettings = pgTable("dmo_settings", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  visionTarget: integer("vision_target").default(30).notNull(),
  personalTarget: integer("personal_target").default(30).notNull(),
  expandTarget: integer("expand_target").default(60).notNull(),
  executionTarget: integer("execution_target").default(60).notNull(),
  connectingTarget: integer("connecting_target").default(60).notNull(),
  // Streak aggregate cache — updated on each DMO entry save so reads are O(1)
  streakCurrent: integer("streak_current"),
  streakBest: integer("streak_best"),
  streakTotalDays: integer("streak_total_days"),
  streakLastActiveDate: varchar("streak_last_active_date", { length: 10 }),
  streakUpdatedAt: timestamp("streak_updated_at"),
});

export type DmoSettings = typeof dmoSettings.$inferSelect;

// ── Sender Reputation (Google Postmaster Tools) ───────────────────────────────

export const postmasterConnections = pgTable("postmaster_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  oauthAccessToken: text("oauth_access_token"),
  oauthRefreshToken: text("oauth_refresh_token"),
  oauthTokenExpiry: timestamp("oauth_token_expiry"),
  connectedEmail: text("connected_email"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type PostmasterConnection = typeof postmasterConnections.$inferSelect;

export const postmasterDomains = pgTable("postmaster_domains", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  domainName: text("domain_name").notNull(),
  latestReputation: text("latest_reputation"),
  latestSpamRate: real("latest_spam_rate"),
  latestSpfRatio: real("latest_spf_ratio"),
  latestDkimRatio: real("latest_dkim_ratio"),
  latestDmarcRatio: real("latest_dmarc_ratio"),
  latestEncryptionRatio: real("latest_encryption_ratio"),
  trafficStats: jsonb("traffic_stats").$type<any[]>(),
  lastFetchedAt: timestamp("last_fetched_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type PostmasterDomain = typeof postmasterDomains.$inferSelect;

// ── Inbox Intel (Competitor Email Intelligence) ───────────────────────────────

export const competitorTrackers = pgTable("competitor_trackers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  website: text("website"),
  notes: text("notes"),
  screenshotPath: text("screenshot_path"),
  screenshotUpdatedAt: timestamp("screenshot_updated_at"),
  screenshotStatus: text("screenshot_status"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertCompetitorTrackerSchema = createInsertSchema(competitorTrackers).omit({
  id: true,
  userId: true,
  screenshotPath: true,
  screenshotUpdatedAt: true,
  screenshotStatus: true,
  createdAt: true,
}).extend({
  name: z.string().trim().min(1, "Competitor name is required").max(100, "Name must be 100 characters or less"),
  website: z.string().trim().max(200).optional().or(z.literal("")).nullish(),
  notes: z.string().trim().max(500).optional().or(z.literal("")).nullish(),
});

export type CompetitorTracker = typeof competitorTrackers.$inferSelect;
export type InsertCompetitorTracker = z.infer<typeof insertCompetitorTrackerSchema>;

export const competitorSeedAddresses = pgTable("competitor_seed_addresses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  trackerId: varchar("tracker_id").notNull().references(() => competitorTrackers.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  label: text("label"),
  receivedCount: integer("received_count").default(0).notNull(),
  lastReceivedAt: timestamp("last_received_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const seedAddressLabelSchema = z.object({
  label: z.string().trim().max(60, "Label must be 60 characters or less").optional().or(z.literal("")),
});

export type CompetitorSeedAddress = typeof competitorSeedAddresses.$inferSelect;

export const capturedCompetitorEmails = pgTable("captured_competitor_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  trackerId: varchar("tracker_id").notNull().references(() => competitorTrackers.id, { onDelete: "cascade" }),
  seedAddressId: varchar("seed_address_id").references(() => competitorSeedAddresses.id, { onDelete: "set null" }),

  // Headers / sender
  subject: text("subject").notNull(),
  preheader: text("preheader"),
  fromName: text("from_name"),
  fromEmail: text("from_email"),
  fromDomain: text("from_domain"),
  replyToEmail: text("reply_to_email"),
  messageId: text("message_id"),

  // Body (htmlBody/plainBody set to NULL after pruning)
  plainBody: text("plain_body"),
  htmlBody: text("html_body"),
  htmlBodySize: integer("html_body_size"),
  bodyAvailable: boolean("body_available").default(true).notNull(),

  // Metrics (kept forever)
  wordCount: integer("word_count"),
  linkCount: integer("link_count"),
  imageCount: integer("image_count"),
  subjectLength: integer("subject_length"),
  subjectHasEmoji: boolean("subject_has_emoji"),
  subjectIsAllCaps: boolean("subject_is_all_caps"),
  preheaderLength: integer("preheader_length"),

  // Authentication / ESP (kept forever)
  spfResult: text("spf_result"),
  dkimResult: text("dkim_result"),
  dmarcResult: text("dmarc_result"),
  detectedEsp: text("detected_esp"),
  listUnsubscribePresent: boolean("list_unsubscribe_present"),
  listUnsubscribePostPresent: boolean("list_unsubscribe_post_present"),

  // Pinning
  isPinned: boolean("is_pinned").default(false).notNull(),
  pinnedAt: timestamp("pinned_at"),

  // Timing
  receivedAt: timestamp("received_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  sentAt: timestamp("sent_at"),
});

export type CapturedCompetitorEmail = typeof capturedCompetitorEmails.$inferSelect;

export const capturedCompetitorEmailLinks = pgTable("captured_competitor_email_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  emailId: varchar("email_id").notNull().references(() => capturedCompetitorEmails.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  domain: text("domain"),
  anchorText: text("anchor_text"),
  position: integer("position"),
  hasUtm: boolean("has_utm").default(false).notNull(),
});

export type CapturedCompetitorEmailLink = typeof capturedCompetitorEmailLinks.$inferSelect;

// Aggregated tracker view returned by the trackers list endpoint
export type CompetitorTrackerWithStats = CompetitorTracker & {
  seedCount: number;
  emailCount: number;
  pinnedCount: number;
  lastReceivedAt: Date | null;
};

// Screenshot capture status for the tracker hub tile
export type ScreenshotStatus = "ready" | "capturing" | "failed" | "none";

// ── Inbox Intel — Phase 2 analytics & feed ──────────────────────────────────

export interface CadenceCell {
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  hourOfDay: number; // 0 … 23
  count: number;
}

export interface VolumeBucket {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface TopValue {
  value: string;
  count: number;
}

export interface TrackerAnalytics {
  totalEmails: number;
  firstReceivedAt: Date | null;
  lastReceivedAt: Date | null;
  averageEmailsPerWeek: number;
  busiestDayOfWeek: number | null;
  busiestHour: number | null;
  cadenceHeatmap: CadenceCell[];
  volumeByDay: VolumeBucket[];
  subject: {
    avgLength: number;
    pctEmoji: number;
    pctAllCaps: number;
    avgWords: number;
    topOpeningWords: TopValue[];
    longest: string | null;
    shortest: string | null;
  };
  esp: {
    primary: string | null;
    confidencePct: number;
    distribution: TopValue[];
    changeCount: number;
  };
  authentication: {
    spfPassPct: number;
    dkimPassPct: number;
    dmarcPassPct: number;
    listUnsubscribePct: number;
    oneClickUnsubscribePct: number;
    weakAuthCount: number;
  };
  content: {
    avgWords: number;
    avgLinks: number;
    avgImages: number;
    pctWithUtm: number;
    topLinkDomains: TopValue[];
  };
}

export interface FeedItem {
  id: string;
  trackerId: string;
  trackerName: string;
  subject: string;
  fromName: string | null;
  fromEmail: string | null;
  fromDomain: string | null;
  detectedEsp: string | null;
  receivedAt: Date;
  isPinned: boolean;
  bodyAvailable: boolean;
  wordCount: number | null;
  linkCount: number | null;
  subjectHasEmoji: boolean | null;
}

export interface FeedResponse {
  items: FeedItem[];
  total: number;
  trackers: { id: string; name: string }[];
  esps: string[];
}

// ── Inbox Intel — Phase 3 funnel detection ─────────────────────────────────

export type FunnelClassification = "automated" | "broadcast" | "unknown";
export type FunnelConfidence = "high" | "medium" | "low";

export interface FunnelEmail {
  id: string;
  seedAddressId: string | null;
  subject: string;
  fromName: string | null;
  receivedAt: Date;
  offsetMs: number | null; // ms since seed signup; null when seed deleted
  classification: FunnelClassification;
  confidence: FunnelConfidence;
}

export interface FunnelSeedTimeline {
  seedAddressId: string;
  seedLabel: string | null;
  seedAddress: string;
  signupAt: Date;
  emails: FunnelEmail[];
}

export interface WelcomeSeriesStep {
  emailId: string;
  step: number;
  subject: string;
  fromName: string | null;
  offsetMs: number; // representative offset (median across seeds when matched)
  receivedAt: Date; // representative timestamp
}

export interface FunnelAnalysis {
  seedCount: number;
  emailCount: number;
  hasEnoughData: boolean;
  welcomeSeries: {
    detected: boolean;
    confidence: FunnelConfidence;
    steps: WelcomeSeriesStep[];
    totalDurationMs: number;
    medianGapMs: number;
  };
  automatedCount: number;
  broadcastCount: number;
  unknownCount: number;
  timelines: FunnelSeedTimeline[];
  verdict: string;
  hint: string | null;
}

// ── Inbox Intel — Phase 4 cross-competitor insights & compare ──────────────

export interface LeaderboardEntry {
  trackerId: string;
  trackerName: string;
  count7d: number;
  prior7d: number;
  pctChange: number | null; // null when prior7d was 0 (no baseline)
}

export type AnomalyType = "spike" | "gap" | "esp_change" | "auth_regression";
export type AnomalySeverity = "info" | "warn" | "alert";

export interface AnomalyEvent {
  id: string;
  trackerId: string;
  trackerName: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  message: string;
  occurredAt: Date;
}

export interface InsightsResponse {
  generatedAt: Date;
  totalTrackers: number;
  totalEmails7d: number;
  totalEmails30d: number;
  activeTrackerCount: number; // trackers that received ≥1 email in last 7d
  leaderboard: LeaderboardEntry[]; // top 5 by count7d
  anomalies: AnomalyEvent[];
}

export interface CompareTrackerSummary {
  id: string;
  name: string;
  website: string | null;
  screenshotPath: string | null;
  emailCount: number;
  emails7d: number;
  emails30d: number;
  weekOverWeekPct: number | null;
  avgEmailsPerWeek: number;
  primaryEsp: string | null;
  espConfidencePct: number;
  busiestDayOfWeek: number | null;
  busiestHour: number | null;
  avgSubjectLength: number;
  pctEmoji: number;
  spfPassPct: number;
  dkimPassPct: number;
  dmarcPassPct: number;
  welcomeSeriesDetected: boolean;
  welcomeSeriesSteps: number;
  welcomeSeriesDurationMs: number;
  lastReceivedAt: Date | null;
}

export interface CompareResponse {
  trackers: CompareTrackerSummary[];
}

// ── Projects (Asana-lite project manager) ────────────────────────────────────

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").default("").notNull(),
  color: text("color").default("#6366f1").notNull(), // hex
  status: text("status").default("active").notNull(), // 'active' | 'archived'
  dueDate: timestamp("due_date"),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  // getProjectsForUser filters by userId and orders by sortOrder.
  userSortIdx: index("idx_projects_user_sort").on(t.userId, t.sortOrder),
  // status filter used by getDashboardProjectsSummary and active project queries.
  userStatusIdx: index("idx_projects_user_status").on(t.userId, t.status),
}));

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().max(1000).optional().default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  status: z.enum(["active", "archived"]).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

export const projectLinkSchema = z.object({
  label: z.string().trim().min(1).max(80),
  url: z.string().trim().url().max(500).refine(
    (u) => {
      try { const p = new URL(u).protocol; return p === "http:" || p === "https:"; }
      catch { return false; }
    },
    { message: "URL must start with http:// or https://" },
  ),
});
export type ProjectLink = z.infer<typeof projectLinkSchema>;

export const projectTasks = pgTable("project_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  parentTaskId: varchar("parent_task_id"), // nullable; one level deep
  columnId: varchar("column_id"), // nullable; references project_columns(id)
  title: text("title").notNull(),
  notes: text("notes").default("").notNull(), // HTML from tiptap
  status: text("status").default("todo").notNull(), // 'todo' | 'in_progress' | 'done'
  priority: text("priority").default("none").notNull(), // 'none' | 'low' | 'medium' | 'high'
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`).notNull(),
  links: jsonb("links").$type<ProjectLink[]>().default([]).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  // getProjectTasks filters by projectId; sortOrder used for board ordering.
  projectSortIdx: index("idx_project_tasks_project_sort").on(t.projectId, t.sortOrder),
  // getOpenTasksForUser and overdue query filter by userId + status.
  userStatusIdx: index("idx_project_tasks_user_status").on(t.userId, t.status),
  // getAllOpenTasks and urgent-task queries filter by userId, status, and dueDate.
  userDueIdx: index("idx_project_tasks_user_due").on(t.userId, t.dueDate),
}));

export const insertProjectTaskSchema = createInsertSchema(projectTasks).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
}).extend({
  title: z.string().trim().min(1, "Title is required").max(280),
  notes: z.string().max(20000).optional().default(""),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  priority: z.enum(["none", "low", "medium", "high", "urgent"]).optional(),
  parentTaskId: z.string().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  links: z.array(projectLinkSchema).max(20).optional(),
  sortOrder: z.number().int().optional(),
});

export const updateProjectTaskSchema = insertProjectTaskSchema.partial().extend({
  projectId: z.string().optional(), // do not allow changing
  columnId: z.string().nullable().optional(),
}).omit({ projectId: true });

export type InsertProjectTask = z.infer<typeof insertProjectTaskSchema>;
export type UpdateProjectTask = z.infer<typeof updateProjectTaskSchema>;
export type ProjectTask = typeof projectTasks.$inferSelect;

export const taskComments = pgTable("task_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => projectTasks.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  // getTaskComments fetches by taskId ordered by createdAt.
  taskCreatedIdx: index("idx_task_comments_task_created").on(t.taskId, t.createdAt),
}));

export const insertTaskCommentSchema = createInsertSchema(taskComments).omit({
  id: true,
  userId: true,
  taskId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  body: z.string().trim().min(1, "Comment cannot be empty").max(5000),
});

export const updateTaskCommentSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty").max(5000),
});

export type InsertTaskComment = z.infer<typeof insertTaskCommentSchema>;
export type TaskComment = typeof taskComments.$inferSelect;

export const taskActivity = pgTable("task_activity", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => projectTasks.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  meta: jsonb("meta").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  // getTaskActivity fetches by taskId ordered by createdAt DESC.
  taskCreatedIdx: index("idx_task_activity_task_created").on(t.taskId, t.createdAt),
}));

export type TaskActivity = typeof taskActivity.$inferSelect;

export interface ProjectWithCounts extends Project {
  totalTasks: number;
  openTasks: number;
  doneTasks: number;
  dueThisWeek: number;
  lastActivityAt: Date | null;
}

// ── Project Board Columns ─────────────────────────────────────────────────────

export const projectColumns = pgTable("project_columns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color"),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  // getProjectColumns filters by projectId and orders by sortOrder.
  projectSortIdx: index("idx_project_columns_project_sort").on(t.projectId, t.sortOrder),
}));

export const insertProjectColumnSchema = createInsertSchema(projectColumns).omit({
  id: true,
  userId: true,
  projectId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().trim().min(1, "Name is required").max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export type InsertProjectColumn = z.infer<typeof insertProjectColumnSchema>;
export type ProjectColumn = typeof projectColumns.$inferSelect;

// ── Project Templates ────────────────────────────────────────────────────────

export const projectTemplates = pgTable("project_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").default("").notNull(),
  color: text("color").default("#6366f1").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertProjectTemplateSchema = createInsertSchema(projectTemplates).omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().max(1000).optional().default(""),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sortOrder: z.number().int().optional(),
});

export type InsertProjectTemplate = z.infer<typeof insertProjectTemplateSchema>;
export type ProjectTemplate = typeof projectTemplates.$inferSelect;

export const projectTemplateTasks = pgTable("project_template_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  templateId: varchar("template_id").notNull().references(() => projectTemplates.id, { onDelete: "cascade" }),
  parentTaskId: varchar("parent_task_id"), // nullable; one level deep
  title: text("title").notNull(),
  notes: text("notes").default("").notNull(),
  priority: text("priority").default("none").notNull(),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`).notNull(),
  links: jsonb("links").$type<ProjectLink[]>().default([]).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertProjectTemplateTaskSchema = createInsertSchema(projectTemplateTasks).omit({
  id: true,
  userId: true,
  templateId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  title: z.string().trim().min(1, "Title is required").max(280),
  notes: z.string().max(20000).optional().default(""),
  priority: z.enum(["none", "low", "medium", "high", "urgent"]).optional(),
  parentTaskId: z.string().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  links: z.array(projectLinkSchema).max(20).optional(),
  sortOrder: z.number().int().optional(),
});

export const updateProjectTemplateTaskSchema = insertProjectTemplateTaskSchema.partial();

export type InsertProjectTemplateTask = z.infer<typeof insertProjectTemplateTaskSchema>;
export type UpdateProjectTemplateTask = z.infer<typeof updateProjectTemplateTaskSchema>;
export type ProjectTemplateTask = typeof projectTemplateTasks.$inferSelect;

export interface ProjectTemplateWithCounts extends ProjectTemplate {
  totalTasks: number;
}

// ── Task Attachments ────────────────────────────────────────────────────────

export const taskAttachments = pgTable("task_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").notNull().references(() => projectTasks.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  // getTaskAttachments fetches all attachments for a task; also used in bulk
  // deletion cleanup (load all attachments per task before deleting objects).
  taskIdx: index("idx_task_attachments_task").on(t.taskId),
}));

export type TaskAttachment = typeof taskAttachments.$inferSelect;

// ── Notification Preferences ────────────────────────────────────────────────

export interface NotificationPreferences {
  taskDueReminders: { enabled: boolean; leadTimeDays: number };
  overdueAlerts: { enabled: boolean };
  projectDueReminders: { enabled: boolean };
  weeklyProjectDigest: { enabled: boolean; dayOfWeek: number; hour: number };
  dmoStreakAtRisk: { enabled: boolean; hour: number };
  dmoMilestone: { enabled: boolean };
  dmoBroken: { enabled: boolean };
  weeklyDmoSummary: { enabled: boolean; dayOfWeek: number; hour: number };
  videoScoringComplete: { enabled: boolean };
  videoPracticeReminder: { enabled: boolean };
  reputationDropAlert: { enabled: boolean };
  weeklyInboxReport: { enabled: boolean; dayOfWeek: number; hour: number };
  inboxReportReady: { enabled: boolean };
  featureRequestReceived: { enabled: boolean };
  bugReportReceived: { enabled: boolean };
  featureRequestComment: { enabled: boolean };
  bugReportComment: { enabled: boolean };
  feedbackStatusChanged: { enabled: boolean };
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  taskDueReminders: { enabled: true, leadTimeDays: 1 },
  overdueAlerts: { enabled: true },
  projectDueReminders: { enabled: true },
  weeklyProjectDigest: { enabled: false, dayOfWeek: 1, hour: 8 },
  dmoStreakAtRisk: { enabled: true, hour: 19 },
  dmoMilestone: { enabled: true },
  dmoBroken: { enabled: false },
  weeklyDmoSummary: { enabled: false, dayOfWeek: 0, hour: 18 },
  videoScoringComplete: { enabled: true },
  videoPracticeReminder: { enabled: false },
  reputationDropAlert: { enabled: true },
  weeklyInboxReport: { enabled: false, dayOfWeek: 1, hour: 8 },
  inboxReportReady: { enabled: true },
  featureRequestReceived: { enabled: true },
  bugReportReceived: { enabled: true },
  featureRequestComment: { enabled: true },
  bugReportComment: { enabled: true },
  feedbackStatusChanged: { enabled: true },
};

// ─── Public API Keys (read-only external/mobile API access) ───────────────────
export const publicApiKeys = pgTable("public_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  label: text("label"),
  lastUsedAt: timestamp("last_used_at"),
  cfLastCheckedAt: timestamp("cf_last_checked_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type PublicApiKey = typeof publicApiKeys.$inferSelect;

// ─── Outbound Webhooks ────────────────────────────────────────────────────────
export const webhooks = pgTable("webhooks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  label: text("label"),
  events: text("events").array().notNull().default(sql`ARRAY['*']::text[]`),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type Webhook = typeof webhooks.$inferSelect;
export type InsertWebhook = typeof webhooks.$inferInsert;

// ─── Feedback (Bug Reports & Feature Requests) ────────────────────────────────
export const feedbackPosts = pgTable("feedback_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull(), // "bug" | "feature"
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 30 }).notNull().default("open"),
  // feature: open | under_review | planned | in_progress | completed | closed
  // bug:     open | under_review | resolved | closed
  adminResponse: text("admin_response"),
  screenshotPath: text("screenshot_path"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertFeedbackPostSchema = createInsertSchema(feedbackPosts).omit({ id: true, createdAt: true, updatedAt: true, adminResponse: true });
export type InsertFeedbackPost = z.infer<typeof insertFeedbackPostSchema>;
export type FeedbackPost = typeof feedbackPosts.$inferSelect;

export const feedbackVotes = pgTable("feedback_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => feedbackPosts.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  uniqueVote: unique().on(t.postId, t.userId),
}));

export type FeedbackVote = typeof feedbackVotes.$inferSelect;

export const feedbackComments = pgTable("feedback_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => feedbackPosts.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  isAdminNote: boolean("is_admin_note").default(false).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type FeedbackComment = typeof feedbackComments.$inferSelect;

export type FeedbackPostWithMeta = FeedbackPost & {
  voteCount: number;
  hasVoted: boolean;
  commentCount: number;
  userName: string;
  userEmail: string;
};

export type FeedbackCommentWithUser = FeedbackComment & {
  userName: string;
  userEmail: string;
};

// ── Workspace Collaborators ───────────────────────────────────────────────────

export const workspaceInvites = pgTable("workspace_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  inviteEmail: text("invite_email").notNull(),
  inviteToken: text("invite_token").notNull().unique(),
  status: text("status").notNull().default("pending"), // pending | accepted | revoked
  memberId: varchar("member_id").references(() => users.id, { onDelete: "set null" }),
  inviteFirstName: text("invite_first_name"),
  inviteLastName: text("invite_last_name"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  acceptedAt: timestamp("accepted_at"),
});

export type WorkspaceInvite = typeof workspaceInvites.$inferSelect;
export type InsertWorkspaceInvite = typeof workspaceInvites.$inferInsert;

// ── Analytics ─────────────────────────────────────────────────────────────────

export const youtubeConnections = pgTable("youtube_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  oauthAccessToken: text("oauth_access_token"),
  oauthRefreshToken: text("oauth_refresh_token"),
  oauthTokenExpiry: timestamp("oauth_token_expiry"),
  connectedEmail: text("connected_email"),
  channelId: text("channel_id"),
  channelTitle: text("channel_title"),
  channelHandle: text("channel_handle"),
  channelThumbnail: text("channel_thumbnail"),
  uploadsPlaylistId: text("uploads_playlist_id"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type YoutubeConnection = typeof youtubeConnections.$inferSelect;

export const gscConnections = pgTable("gsc_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  oauthAccessToken: text("oauth_access_token"),
  oauthRefreshToken: text("oauth_refresh_token"),
  oauthTokenExpiry: timestamp("oauth_token_expiry"),
  connectedEmail: text("connected_email"),
  selectedSiteUrl: text("selected_site_url"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type GscConnection = typeof gscConnections.$inferSelect;

export const cannedResponses = pgTable("canned_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export const insertCannedResponseSchema = createInsertSchema(cannedResponses).omit({ id: true, createdAt: true });
export type InsertCannedResponse = z.infer<typeof insertCannedResponseSchema>;
export type CannedResponse = typeof cannedResponses.$inferSelect;

export const youtubeCommentCache = pgTable("youtube_comment_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  videoId: varchar("video_id").notNull(),
  videoTitle: text("video_title").notNull().default(""),
  videoThumbnail: text("video_thumbnail").notNull().default(""),
  videoPublishedAt: timestamp("video_published_at"),
  threads: jsonb("threads").$type<any[]>().notNull().default(sql`'[]'::jsonb`),
  totalResults: integer("total_results").notNull().default(0),
  cachedAt: timestamp("cached_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});
export type YoutubeCommentCache = typeof youtubeCommentCache.$inferSelect;

export const youtubeAnalyticsCache = pgTable("youtube_analytics_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cacheKey: varchar("cache_key", { length: 100 }).notNull(),
  dataJson: jsonb("data_json").notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [unique("youtube_analytics_cache_user_key").on(t.userId, t.cacheKey)]);
export type YoutubeAnalyticsCache = typeof youtubeAnalyticsCache.$inferSelect;

export const gscAnalyticsCache = pgTable("gsc_analytics_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  cacheKey: varchar("cache_key", { length: 150 }).notNull(),
  dataJson: jsonb("data_json").notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => [unique("gsc_analytics_cache_user_key").on(t.userId, t.cacheKey)]);
export type GscAnalyticsCache = typeof gscAnalyticsCache.$inferSelect;

// Tracks object paths issued by the attachment presigned-URL flow that have not
// yet been confirmed.  Persisted in DB so orphaned objects are cleaned up even
// after a process restart.  userId+taskId are stored at issuance time so the
// confirm endpoint can reject any path that was not issued for the exact
// caller/task, preventing object-path substitution attacks.
export const pendingAttachmentUploads = pgTable("pending_attachment_uploads", {
  objectPath: text("object_path").primaryKey(),
  issuedAt: timestamp("issued_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  userId: text("user_id").notNull(),
  taskId: text("task_id").notNull(),
});
export type PendingAttachmentUpload = typeof pendingAttachmentUploads.$inferSelect;

export interface WorkspaceInviteWithMember {
  id: string;
  ownerId: string;
  inviteEmail: string;
  inviteToken: string;
  status: string;
  memberId: string | null;
  createdAt: Date;
  acceptedAt: Date | null;
  memberDisplayName: string | null;
  memberEmail: string | null;
}

// ==========================================
// Funnel Planner
// ==========================================

export const funnels = pgTable("funnels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default("Untitled Funnel"),
  description: text("description"),
  canvasData: jsonb("canvas_data").notNull().default(sql`'{"nodes":[],"edges":[]}'::jsonb`),
  thumbnailData: text("thumbnail_data"),
  shareToken: varchar("share_token", { length: 64 }).unique(),
  sharePasswordHash: text("share_password_hash"),
  brainTargeting: text("brain_targeting"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertFunnelSchema = createInsertSchema(funnels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFunnel = z.infer<typeof insertFunnelSchema>;
export type Funnel = typeof funnels.$inferSelect;

/** Lightweight projection returned by the funnel grid list endpoint.
 *  Excludes canvasData (large JSONB) and sharePasswordHash (sensitive).
 *  Includes a server-computed nodeCount so the client never needs canvasData for display. */
export type FunnelSummary = Omit<Funnel, 'canvasData' | 'sharePasswordHash'> & { nodeCount: number };

export const funnelBrainFiles = pgTable("funnel_brain_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  funnelId: varchar("funnel_id").notNull().references(() => funnels.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull().default("text/plain"),
  fileSize: integer("file_size").notNull().default(0),
  extractedText: text("extracted_text").notNull().default(""),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type FunnelBrainFile = typeof funnelBrainFiles.$inferSelect;

export const funnelTemplates = pgTable("funnel_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  canvasData: jsonb("canvas_data").notNull().default(sql`'{"nodes":[],"edges":[]}'::jsonb`),
  createdBy: varchar("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type FunnelTemplate = typeof funnelTemplates.$inferSelect;

// ─── Announcements ─────────────────────────────────────────────────────────────
export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  callout: text("callout").notNull(),
  body: text("body"),
  ctaLabel: text("cta_label"),
  ctaUrl: text("cta_url"),
  bgColor: text("bg_color").notNull().default("violet"),
  icon: text("icon"),
  iconColor: text("icon_color").default("auto"),
  isActive: boolean("is_active").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertAnnouncementSchema = createInsertSchema(announcements).omit({ id: true, createdAt: true });
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Announcement = typeof announcements.$inferSelect;

export const dismissedAnnouncements = pgTable("dismissed_announcements", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  announcementId: integer("announcement_id").notNull().references(() => announcements.id, { onDelete: "cascade" }),
  dismissedAt: timestamp("dismissed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// ─── Affiliate Links ───────────────────────────────────────────────────────────
export const affiliateLinks = pgTable("affiliate_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: text("url").notNull(),
  description: text("description"),
  category: text("category"),
  emoji: text("emoji").default("🔗").notNull(),
  screenshotUrl: text("screenshot_url"),
  clickCount: integer("click_count").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (t) => ({
  // getAffiliateLinks filters by userId and orders by sortOrder.
  userSortIdx: index("idx_affiliate_links_user_sort").on(t.userId, t.sortOrder),
  // getAffiliateLinks also filters isActive for available-link queries.
  userActiveIdx: index("idx_affiliate_links_user_active").on(t.userId, t.isActive),
}));

export const insertAffiliateLinkSchema = createInsertSchema(affiliateLinks).omit({
  id: true,
  clickCount: true,
  createdAt: true,
  updatedAt: true,
});

// ---- Swipe File ----

export type PromoLink = {
  title: string;
  url: string;
  description?: string;
};

export const swipeItems = pgTable("swipe_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  type: varchar("type", { length: 20 }).notNull().default("upload"), // 'upload' | 'snippet'
  content: text("content"),
  imagePath: text("image_path"),
  sourceUrl: text("source_url"),
  notes: text("notes"),
  promoLinks: jsonb("promo_links").$type<PromoLink[]>().default(sql`'[]'::jsonb`),
  strips: jsonb("strips").$type<string[]>(), // ordered GCS paths for full-page multi-strip captures
  shareToken: varchar("share_token", { length: 64 }).unique(),
  viewCount: integer("view_count").notNull().default(0),
  isFavorite: boolean("is_favorite").notNull().default(false),
  createdAt: timestamp("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => ({
  // getSwipeItems filters by userId and orders by createdAt DESC.
  userCreatedIdx: index("idx_swipe_items_user_created").on(t.userId, t.createdAt),
}));

export type SwipeItem = typeof swipeItems.$inferSelect;
export type InsertSwipeItem = typeof swipeItems.$inferInsert;

export const insertSwipeItemSchema = createInsertSchema(swipeItems).omit({
  id: true,
  viewCount: true,
  shareToken: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAffiliateLink = z.infer<typeof insertAffiliateLinkSchema>;
export type AffiliateLink = typeof affiliateLinks.$inferSelect;
