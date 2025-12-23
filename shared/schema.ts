import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Auth provider types for OAuth
export const authProviders = ["local", "google", "facebook", "apple"] as const;
export type AuthProvider = typeof authProviders[number];

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
  emailConsentAt: timestamp("email_consent_at"),
  emailConsentIp: text("email_consent_ip"),
  isAdmin: boolean("is_admin").default(false),
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
});

export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

// Goal types for video sessions
export const goalTypes = ["sales", "lead", "education", "recruit"] as const;
export type GoalType = typeof goalTypes[number];

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
export const titleSources = ["ai", "user"] as const;
export type TitleSource = typeof titleSources[number];

// Sessions table for video practice sessions
export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
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
