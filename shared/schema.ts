import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table for authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  passwordHash: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

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
  expiresAt: timestamp("expires_at"),
  videoDeletedAt: timestamp("video_deleted_at"),
  transcriptText: text("transcript_text"),
  transcriptEditedText: text("transcript_edited_text"),
  scoreJson: jsonb("score_json").$type<ScoreResult>(),
  scoreUpdatedAt: timestamp("score_updated_at"),
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
});

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
