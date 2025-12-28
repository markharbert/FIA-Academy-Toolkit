import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, boolean, real } from "drizzle-orm/pg-core";
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
  keapContactId: text("keap_contact_id"),
  keapLastSyncAt: timestamp("keap_last_sync_at"),
  keapSyncStatus: text("keap_sync_status").$type<"synced" | "pending" | "failed">(),
  keapSyncError: text("keap_sync_error"),
  emailConsentAt: timestamp("email_consent_at"),
  emailConsentIp: text("email_consent_ip"),
  isAdmin: boolean("is_admin").default(false),
  role: text("role").default("user").$type<UserRole>(),
  isDisabled: boolean("is_disabled").default(false),
  disabledAt: timestamp("disabled_at"),
  disabledReason: text("disabled_reason"),
  lastLoginAt: timestamp("last_login_at"),
  themePreference: text("theme_preference").default("system").$type<ThemePreference>(),
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

// System settings table for Keap OAuth tokens
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`'keap_integration'`),
  keapAccessToken: text("keap_access_token"),
  keapRefreshToken: text("keap_refresh_token"),
  keapTokenExpiresAt: timestamp("keap_token_expires_at"),
  keapConnectedAt: timestamp("keap_connected_at"),
  keapLastRefreshAt: timestamp("keap_last_refresh_at"),
  keapLastError: text("keap_last_error"),
  keapDefaultTagId: integer("keap_default_tag_id"),
  keapDefaultTagName: text("keap_default_tag_name"),
  keapLastTagSyncAt: timestamp("keap_last_tag_sync_at"),
  keapTagsCacheJson: text("keap_tags_cache_json"),
  keapTagsCachedAt: timestamp("keap_tags_cached_at"),
  keapTagsCacheExpiresAt: timestamp("keap_tags_cache_expires_at"),
  keapLastTagFetchError: text("keap_last_tag_fetch_error"),
});

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
  "keap_sync_attempted",
  "keap_sync_succeeded",
  "keap_sync_failed",
  "video_uploaded",
  "upload_failed",
  "processing_started",
  "processing_completed",
  "processing_failed",
  "file_validation_failed",
  "folder_created",
  "folder_renamed",
  "folder_deleted",
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
  email: z.string().email("Please enter a valid email address").optional(),
  themePreference: z.enum(["light", "dark", "system"]).optional(),
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

// System settings types
export type SystemSettings = typeof systemSettings.$inferSelect;

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

// Video type preferences
export const videoTypes = ["review", "top-list", "vs", "tutorial", "problem-fix", "beginner-guide"] as const;
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
  suggestedThumbnailText: jsonb("suggested_thumbnail_text").$type<string[]>(),
  commonQuestions: jsonb("common_questions").$type<string[]>(),
  intentAnalysis: text("intent_analysis"),
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
});

export const insertScriptSchema = createInsertSchema(scripts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertScript = z.infer<typeof insertScriptSchema>;
export type Script = typeof scripts.$inferSelect;

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
  affiliateOffer: z.string().min(1, "Please enter the affiliate offer name"),
  affiliateLinkLabel: z.string().min(1, "Please enter a link label"),
  primaryPromise: z.string().min(10, "Please describe the main promise of your video"),
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
