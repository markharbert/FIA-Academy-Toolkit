import { 
  users, sessions, passwordResetTokens, magicLinkTokens, userIdentities, adminAuditLog, userActionLog, processingMetrics, sessionFolders,
  topicRuns, topics, savedTopics, scripts, linkPlaceholders, userApiKeys, videoTrendsCredits, savedOffers, appSettings, publicApiKeys, webhooks, cfWebhookActivity, cfReconciliationRuns, cfIdentityIssues,
  type PublicApiKey, type Webhook,
  type CfWebhookActivity, type InsertCfWebhookActivity,
  type CfReconciliationRun, type InsertCfReconciliationRun, type CfIdentityIssue,
  dmoEntries, dmoSettings, emailInboxAddresses, emailAnalyses, seedInboxes, postmasterConnections, postmasterDomains,
  workspaceInvites, type WorkspaceInvite, type WorkspaceInviteWithMember,
  competitorTrackers, competitorSeedAddresses, capturedCompetitorEmails, capturedCompetitorEmailLinks,
  teleprompterScripts, type TeleprompterScript, type InsertTeleprompterScript,
  teleprompterRecordings, type TeleprompterRecording, type InsertTeleprompterRecording,
  type CompetitorTracker, type InsertCompetitorTracker, type CompetitorTrackerWithStats,
  type CompetitorSeedAddress, type CapturedCompetitorEmail, type CapturedCompetitorEmailLink,
  type TrackerAnalytics, type FeedResponse, type ScreenshotStatus,
  youtubeConnections, type YoutubeConnection,
  gscConnections, type GscConnection,
  cannedResponses, type CannedResponse,
  youtubeCommentCache, type YoutubeCommentCache,
  youtubeAnalyticsCache,
  gscAnalyticsCache,
  pendingAttachmentUploads, type PendingAttachmentUpload,
  type User, type InsertUser, 
  type Session, type InsertSession,
  type ScoreResult,
  type PasswordResetToken, type InsertPasswordResetToken,
  type MagicLinkToken,
  type UserIdentity, type InsertUserIdentity, type AuthProvider,
  type AdminAuditLog, type InsertAdminAuditLog,
  type UserActionLog, type InsertUserActionLog, type UserActionType,
  type ProcessingMetric, type InsertProcessingMetric,
  type SessionFolder, type InsertSessionFolder,
  type TopicRun, type InsertTopicRun,
  type Topic, type InsertTopic,
  type SavedTopic, type InsertSavedTopic,
  type Script, type InsertScript,
  type LinkPlaceholder, type InsertLinkPlaceholder,
  type UserApiKey, type InsertUserApiKey, type ApiKeyProvider,
  type SavedOffer, type InsertSavedOffer,
  type DmoEntry, type InsertDmoEntry, type DmoEntryData, type DmoSettings,
  type EmailAnalysis, type EmailInboxAddress, type SeedInbox, type InsertSeedInbox,
  type PostmasterConnection, type PostmasterDomain,
  projects, projectTasks, taskComments, taskActivity, taskAttachments,
  projectColumns,
  projectTemplates, projectTemplateTasks,
  type Project, type InsertProject, type ProjectWithCounts,
  type ProjectTask, type InsertProjectTask, type UpdateProjectTask,
  type TaskComment, type TaskActivity, type TaskAttachment,
  type ProjectColumn, type InsertProjectColumn,
  type ProjectTemplate, type InsertProjectTemplate, type ProjectTemplateWithCounts,
  type ProjectTemplateTask, type InsertProjectTemplateTask, type UpdateProjectTemplateTask,
  feedbackPosts, feedbackVotes, feedbackComments,
  type FeedbackPost, type InsertFeedbackPost, type FeedbackPostWithMeta, type FeedbackCommentWithUser,
  funnels, type Funnel, type FunnelSummary, type InsertFunnel,
  funnelBrainFiles, type FunnelBrainFile,
  funnelTemplates, type FunnelTemplate,
  announcements, dismissedAnnouncements, type Announcement, type InsertAnnouncement,
  affiliateLinks, type AffiliateLink, type InsertAffiliateLink,
  swipeItems, type SwipeItem, type InsertSwipeItem, type PromoLink,
  courses, courseModules, courseLessons, courseResources, courseProgress,
  type Course, type InsertCourse, type CourseModule, type InsertCourseModule,
  type CourseLesson, type InsertCourseLesson, type CourseResource, type InsertCourseResource,
  type CourseProgress,
  trainingReplays, trainingReplayResources, trainingReplayProgress, trainingReplayComments,
  type TrainingReplay, type InsertTrainingReplay,
  type TrainingReplayResource, type InsertTrainingReplayResource,
  type TrainingReplayProgress, type TrainingReplayComment,
} from "@shared/schema";
import type { SwipeListResponse } from "./swipe-api";
import { safeTimezone, todayKeyInTz, addDaysToKey } from "@shared/datetime";
import { collectCourseModuleSubtreeIds } from "@shared/course-structure";
import { slugify } from "@shared/slug";
import crypto from "crypto";
import { db, pool } from "./db";
import { eq, and, lt, lte, gte, isNull, desc, gt, sql, or, ilike, count, asc, inArray } from "drizzle-orm";

// Email normalization helper - centralizes email handling to prevent duplicates
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

export type CfReconciliationEnrollment = {
  contactId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  active: boolean;
};

export type CfReconciliationChanges = {
  accountsCreated: number;
  accountsReactivated: number;
  accountsRevoked: number;
  unchanged: number;
  identityIssues: number;
};

type CourseNavigationModule = Pick<
  CourseModule,
  "id" | "courseId" | "parentModuleId" | "title" | "slug" | "status" | "sortOrder"
>;

export type TrainingReplayImportRow = {
  externalId: string;
  title: string;
  videoUrl: string | null;
};

export type TrainingReplayImportResult = {
  created: number;
  updated: number;
  videosImported: number;
  videosSkipped: number;
  videosUnavailable: number;
};

type CourseNavigationLesson = Pick<
  CourseLesson,
  "id" | "courseId" | "moduleId" | "title" | "slug" | "status" | "sortOrder"
> & {
  completed: boolean;
  lastAccessedAt: Date | null;
};

type CourseLessonWithCourse = {
  lesson: CourseLesson;
  course: Course;
};

// API key encryption helpers using SESSION_SECRET
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET required for API key encryption');
  return crypto.scryptSync(secret, 'salt', 32);
}

export function encryptApiKey(plainKey: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(plainKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptApiKey(encryptedData: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByCfContactId(contactId: string): Promise<User | undefined>;
  createUser(user: InsertUser & { emailConsentAt?: Date; emailConsentIp?: string }): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  updateUserForCfMembershipEvent(id: string, updates: Partial<User>, occurredAt: Date): Promise<User | undefined>;
  
  // Sessions
  getSession(id: string): Promise<Session | undefined>;
  getSessionsByUser(userId: string, limit?: number): Promise<Session[]>;
  getStaleUploadingSessions(olderThanMs: number): Promise<Session[]>;
  createSession(session: InsertSession): Promise<Session>;
  updateSession(id: string, updates: Partial<Session>): Promise<Session | undefined>;
  deleteSession(id: string): Promise<void>;

  // Pending attachment upload orphan tracking (DB-backed)
  registerPendingAttachmentUpload(objectPath: string, userId: string, taskId: string): Promise<void>;
  getPendingAttachmentUpload(objectPath: string): Promise<PendingAttachmentUpload | undefined>;
  removePendingAttachmentUpload(objectPath: string): Promise<void>;
  getExpiredPendingAttachmentUploads(olderThanMs: number): Promise<PendingAttachmentUpload[]>;

  // Password Reset Tokens
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetTokenByHash(tokenHash: string): Promise<PasswordResetToken | undefined>;
  markPasswordResetTokenUsed(id: string): Promise<void>;
  countRecentPasswordResetRequests(userId: string, since: Date): Promise<number>;
  countRecentPasswordResetRequestsByIp(ip: string, since: Date): Promise<number>;

  // Magic Link Tokens
  createMagicLinkToken(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  getMagicLinkTokenByHash(tokenHash: string): Promise<MagicLinkToken | undefined>;
  markMagicLinkTokenUsed(id: string): Promise<void>;
  countRecentMagicLinkRequests(userId: string, since: Date): Promise<number>;

  // User Identities (OAuth)
  getUserIdentityByProvider(provider: AuthProvider, providerUserId: string): Promise<UserIdentity | undefined>;
  getUserIdentitiesByUser(userId: string): Promise<UserIdentity[]>;
  createUserIdentity(identity: InsertUserIdentity): Promise<UserIdentity>;
  deleteUserIdentity(userId: string, provider: AuthProvider): Promise<boolean>;
  
  // Admin: User Management
  getAllUsers(options: {
    search?: string;
    role?: string;
    status?: string;
    provider?: string;
    consent?: string;
    membership?: string;
    sort?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ users: (User & { totalVideos: number })[]; total: number }>;
  getAdminCount(): Promise<number>;
  getUserWithDetails(id: string): Promise<{
    user: User;
    identities: UserIdentity[];
    sessions: Session[];
    sessionCount: number;
  } | undefined>;

  // ClickFunnels
  getCfEnrolledUsers(): Promise<{
    enrolledCount: number;
    revokedCount: number;
    neverEnrolledCount: number;
  }>;
  getCfUsers(filter?: string): Promise<Array<Pick<User, 'id' | 'email' | 'displayName' | 'firstName' | 'lastName' | 'createdAt' | 'lastLoginAt' | 'isAdmin' | 'isDisabled' | 'role' | 'cfEnrolled' | 'cfEnrolledAt' | 'cfRevokedAt' | 'cfContactId' | 'cfRevokedGraceUntil'>>>;
  getMemberEngagementAnalytics(days: number): Promise<{
    totalMembers: number;
    activeMembers: number;
    returningMembers: number;
    neverLoggedIn: number;
    features: Array<{ key: string; label: string; members: number; events: number; lastUsedAt: Date | null }>;
    weeklyActivity: Array<{ week: string; members: number }>;
  }>;
  getUserFeatureUsage(userId: string, days: number): Promise<Array<{ key: string; label: string; events: number; lastUsedAt: Date | null }>>;
  getMemberHealth(): Promise<Array<{
    id: string; email: string | null; displayName: string | null; cfContactId: string | null; cfEnrolled: boolean | null; cfEnrolledAt: Date | null;
    lastLoginAt: Date | null; lastActivityAt: Date | null; courseCompleted: number; courseStarted: number;
    dmoDays30: number; meaningfulActions30: number; segment: "not_started" | "active" | "engaged" | "at_risk";
    reasons: string[];
  }>>;
  applyCfReconciliation(enrollments: CfReconciliationEnrollment[]): Promise<CfReconciliationChanges>;

  getEnrolledUsersWithContactId(): Promise<Array<{ userId: string; email: string; contactId: string }>>;
  getCfButtonSettings(): Promise<{ text: string; bg: string; color: string; radius: string; width: string; fontSize: string; padding: string }>;
  setCfButtonSettings(settings: { text: string; bg: string; color: string; radius: string; width: string; fontSize: string; padding: string }): Promise<void>;
  createCfWebhookActivity(data: InsertCfWebhookActivity): Promise<CfWebhookActivity>;
  getCfWebhookActivity(options: {
    limit: number;
    offset: number;
    eventType?: string;
    status?: string;
  }): Promise<{
    events: CfWebhookActivity[];
    total: number;
    lastReceivedAt: Date | null;
    lastEnrollmentAt: Date | null;
    lastRevocationAt: Date | null;
    processedCount: number;
    failedCount: number;
  }>;
  createCfReconciliationRun(data?: Partial<InsertCfReconciliationRun>): Promise<CfReconciliationRun>;
  updateCfReconciliationRun(id: string, data: Partial<InsertCfReconciliationRun>): Promise<CfReconciliationRun | undefined>;
  getLatestCfReconciliationRun(): Promise<CfReconciliationRun | undefined>;
  getLatestSuccessfulCfReconciliationRun(): Promise<CfReconciliationRun | undefined>;
  getOpenCfIdentityIssues(limit?: number): Promise<CfIdentityIssue[]>;
  claimCfWebhookEvent(data: InsertCfWebhookActivity): Promise<{ claimed: boolean; deliveryCount: number }>;
  completeCfWebhookEvent(eventId: string, data: Pick<InsertCfWebhookActivity, "status" | "action" | "httpStatus" | "error" | "durationMs">): Promise<void>;

  // Admin: Audit Log
  createAuditLog(log: InsertAdminAuditLog): Promise<AdminAuditLog>;
  
  // Admin: Stats
  getAdminStats(): Promise<{
    totalUsers: number;
    newUsersLast7Days: number;
    totalSessions: number;
    sessionsLast7Days: number;
  }>;
  
  // Admin: Overview Stats (new format)
  getOverviewStats(): Promise<{
    totalUsers: number;
    sessionsLast7Days: number;
    newUsersLast30Days: number;
  }>;
  
  // Admin: Activity Feed
  getActivityFeed(options: {
    limit: number;
    cursor?: { createdAt: Date; id: string };
  }): Promise<{
    items: Array<{
      id: string;
      type: "session_created";
      sessionId: string;
      sessionTitle: string | null;
      sessionCreatedAt: Date;
      scoreTotal: number | null;
      user: {
        id: string;
        displayName: string | null;
        email: string | null;
      };
    }>;
    nextCursor: { createdAt: Date; id: string } | null;
  }>;

  getAdminActivityFeed(options: {
    page: number;
    pageSize: number;
    actionType?: string;
    sinceMs?: number;
  }): Promise<{
    items: Array<{
      id: string;
      actionType: string;
      actionLabel: string;
      entityType: string | null;
      entityId: string | null;
      createdAt: Date;
      ip: string | null;
      userAgent: string | null;
      user: {
        id: string;
        displayName: string | null;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
      };
    }>;
    total: number;
  }>;
  
  // Admin: Duplicate Detection
  findDuplicateEmails(): Promise<Array<{
    normalizedEmail: string;
    count: number;
    users: Array<{ id: string; email: string; createdAt: Date; isAdmin: boolean }>;
  }>>;
  
  // Admin: Account Merge
  mergeUsers(primaryUserId: string, duplicateUserId: string): Promise<{
    success: boolean;
    message: string;
    reassignedSessions?: number;
    reassignedIdentities?: number;
    skippedIdentities?: number;
  }>;
  
  // Admin: Session Detail (for viewing any user's session)
  getSessionDetailForAdmin(sessionId: string): Promise<{
    session: Session;
    user: {
      id: string;
      displayName: string | null;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
    };
  } | undefined>;
  
  // User Action Log
  createUserActionLog(log: InsertUserActionLog): Promise<UserActionLog>;
  getUserActionLogs(options: {
    userId: string;
    limit: number;
    cursor?: { createdAt: Date; id: string };
  }): Promise<{
    items: UserActionLog[];
    nextCursor: { createdAt: Date; id: string } | null;
  }>;
  deleteOldUserActionLogs(olderThanDays: number): Promise<number>;
  
  // Processing Metrics
  createProcessingMetric(metric: InsertProcessingMetric): Promise<ProcessingMetric>;
  getProcessingMetrics(sessionId: string): Promise<ProcessingMetric[]>;
  
  // Session Folders
  getFoldersByUser(userId: string): Promise<(SessionFolder & { sessionCount: number })[]>;
  createFolder(folder: InsertSessionFolder): Promise<SessionFolder>;
  updateFolder(id: string, userId: string, updates: { name?: string }): Promise<SessionFolder | undefined>;
  deleteFolder(id: string, userId: string): Promise<boolean>;
  
  // Bulk Session Operations
  moveSessions(sessionIds: string[], userId: string, folderId: string | null): Promise<number>;
  deleteSessions(sessionIds: string[], userId: string): Promise<{ deletedCount: number; deletedPaths: string[] }>;
  getSessionsByFolder(userId: string, folderId: string | null): Promise<Session[]>;
  
  // Topic Pulse Finder: Topic Runs
  createTopicRun(run: InsertTopicRun): Promise<TopicRun>;
  getTopicRun(id: string): Promise<TopicRun | undefined>;
  getTopicRunsByUser(userId: string, limit?: number, offset?: number): Promise<TopicRun[]>;
  countTopicRunsByUser(userId: string): Promise<number>;
  updateTopicRun(id: string, updates: Partial<TopicRun>): Promise<TopicRun | undefined>;
  deleteTopicRun(id: string, userId: string): Promise<boolean>;
  deleteAllTopicRuns(userId: string): Promise<number>;
  
  // Topic Pulse Finder: Topics
  createTopic(topic: InsertTopic): Promise<Topic>;
  createTopics(topics: InsertTopic[]): Promise<Topic[]>;
  getTopic(id: string): Promise<Topic | undefined>;
  getTopicsByRun(runId: string): Promise<Topic[]>;
  updateTopicPlatformData(id: string, data: {
    pinterestVolume?: number | null;
    pinterestCpc?: number | null;
    pinterestCompetition?: number | null;
    pinterestTrendData?: any;
    youtubeVolume?: number | null;
    youtubeCpc?: number | null;
    youtubeCompetition?: number | null;
    youtubeTrendData?: any;
    tiktokVolume?: number | null;
    tiktokCpc?: number | null;
    tiktokCompetition?: number | null;
    tiktokTrendData?: any;
  }): Promise<Topic | undefined>;
  
  // Topic Pulse Finder: Saved Topics
  saveTopicForUser(savedTopic: InsertSavedTopic): Promise<SavedTopic>;
  getSavedTopicsByUser(userId: string): Promise<(SavedTopic & { topic: Topic })[]>;
  deleteSavedTopic(id: string, userId: string): Promise<boolean>;
  isSavedTopic(topicId: string, userId: string): Promise<boolean>;
  
  // Topic Pulse Finder: Scripts
  createScript(script: InsertScript): Promise<Script>;
  getScript(id: string): Promise<(Script & { topic?: Topic }) | undefined>;
  getScriptsByUser(userId: string): Promise<(Script & { topic?: Topic })[]>;
  updateScript(id: string, userId: string, updates: Partial<Script>): Promise<Script | undefined>;
  deleteScript(id: string, userId: string): Promise<boolean>;

  // Standalone teleprompter scripts
  getTeleprompterScriptsByUser(userId: string): Promise<TeleprompterScript[]>;
  getTeleprompterScript(id: string, userId: string): Promise<TeleprompterScript | undefined>;
  createTeleprompterScript(userId: string, data: { title: string; content: string; bulletPoints?: string | null }): Promise<TeleprompterScript>;
  updateTeleprompterScript(id: string, userId: string, data: { title?: string; content?: string; bulletPoints?: string | null }): Promise<TeleprompterScript | undefined>;
  incrementTeleprompterScriptTakeCount(id: string, userId: string): Promise<number>;
  deleteTeleprompterScript(id: string, userId: string): Promise<boolean>;

  // Teleprompter Recordings
  getTeleprompterRecordingsByUser(userId: string): Promise<TeleprompterRecording[]>;
  getTeleprompterRecording(id: string, userId: string): Promise<TeleprompterRecording | undefined>;
  updateTeleprompterRecording(id: string, userId: string, data: Partial<InsertTeleprompterRecording>): Promise<TeleprompterRecording | undefined>;
  createTeleprompterRecording(data: InsertTeleprompterRecording): Promise<TeleprompterRecording>;
  deleteTeleprompterRecording(id: string, userId: string): Promise<boolean>;
  deleteExpiredTeleprompterRecordings(): Promise<TeleprompterRecording[]>;
  getTodayScoreUsage(userId: string): Promise<number>;
  incrementScoreUsage(userId: string): Promise<number>;

  // Topic Pulse Finder: Link Placeholders
  createLinkPlaceholder(link: InsertLinkPlaceholder): Promise<LinkPlaceholder>;
  getLinkPlaceholdersByUser(userId: string): Promise<LinkPlaceholder[]>;
  updateLinkPlaceholder(id: string, userId: string, updates: { label?: string; url?: string }): Promise<LinkPlaceholder | undefined>;
  deleteLinkPlaceholder(id: string, userId: string): Promise<boolean>;
  
  // User API Keys (encrypted)
  getUserApiKey(userId: string, provider: ApiKeyProvider): Promise<UserApiKey | undefined>;
  setUserApiKey(userId: string, provider: ApiKeyProvider, plainKey: string): Promise<UserApiKey>;
  deleteUserApiKey(userId: string, provider: ApiKeyProvider): Promise<boolean>;
  getDecryptedUserApiKey(userId: string, provider: ApiKeyProvider): Promise<string | null>;
  
  // Video Trends Credits
  getVideoTrendsCredits(userId: string): Promise<{ creditsUsed: number; totalCreditsUsed: number; monthlyLimit: number; windowStartedAt: Date; remaining: number; resetsAt: Date }>;
  useVideoTrendsCredits(userId: string, amount: number): Promise<{ success: boolean; remaining: number; error?: string }>;
  reserveVideoTrendsCredits(userId: string, amount: number): Promise<{ success: boolean; reserved: number; remaining: number; error?: string }>;
  refundVideoTrendsCredits(userId: string, amount: number): Promise<void>;
  getAggregateVideoTrendsCredits(): Promise<{ totalCreditsUsedAllTime: number; totalCreditsUsedThisMonth: number; activeUsers: number; topUsers: Array<{ userId: string; email: string | null; displayName: string | null; creditsThisMonth: number; creditsTotal: number }> }>;
  
  // Saved Offers (Call To Action)
  getSavedOffersByUser(userId: string): Promise<SavedOffer[]>;
  createSavedOffer(offer: InsertSavedOffer): Promise<SavedOffer>;
  updateSavedOffer(id: string, userId: string, updates: Partial<SavedOffer>): Promise<SavedOffer | undefined>;
  deleteSavedOffer(id: string, userId: string): Promise<boolean>;
  setDefaultOffer(id: string, userId: string): Promise<SavedOffer | undefined>;

  // App Settings
  getMonthlyCreditsLimit(): Promise<number>;
  setMonthlyCreditsLimit(limit: number): Promise<void>;
  getApiAccessEnabled(): Promise<boolean>;
  setApiAccessEnabled(enabled: boolean): Promise<void>;
  getEmailSenderSettings(): Promise<{ fromName: string; fromEmail: string }>;
  setEmailSenderSettings(fromName: string, fromEmail: string): Promise<void>;

  // Public API Keys
  getUserPublicApiKey(userId: string): Promise<PublicApiKey | undefined>;
  generateUserPublicApiKey(userId: string, label?: string): Promise<{ rawKey: string; record: PublicApiKey }>;
  revokeUserPublicApiKey(userId: string): Promise<void>;
  getUserByPublicApiKeyHash(keyHash: string): Promise<User | undefined>;
  touchPublicApiKey(keyHash: string, cfChecked?: boolean): Promise<void>;

  // Webhooks
  getWebhooksForUser(userId: string): Promise<Webhook[]>;
  createWebhook(userId: string, data: { url: string; label?: string; events?: string[] }): Promise<{ webhook: Webhook; secret: string }>;
  updateWebhook(id: string, userId: string, data: { active?: boolean; label?: string; events?: string[] }): Promise<Webhook | undefined>;
  deleteWebhook(id: string, userId: string): Promise<void>;

  // DMO Tracker
  getDmoEntry(userId: string, date: string): Promise<DmoEntry | undefined>;
  upsertDmoEntry(userId: string, date: string, data: DmoEntryData): Promise<DmoEntry>;
  updateDmoNotes(userId: string, date: string, notes: string): Promise<DmoEntry | null>;
  getDmoEntries(userId: string, limit?: number): Promise<DmoEntry[]>;
  getDmoStreak(userId: string): Promise<{ current: number; best: number; totalDays: number }>;
  getDmoSummary(userId: string, period: string): Promise<{ summary: string; tips: string[]; moodScore: number | null; performanceScore: number | null; generatedAt: Date } | null>;
  upsertDmoSummary(userId: string, period: string, periodType: string, summary: string, tips: string[], moodScore: number | null, performanceScore: number | null): Promise<void>;
  getDmoSettings(userId: string): Promise<DmoSettings>;
  upsertDmoSettings(userId: string, data: Partial<Omit<DmoSettings, 'userId'>>): Promise<DmoSettings>;

  // Projects
  getProjectsForUser(userId: string): Promise<ProjectWithCounts[]>;
  getProject(id: string, userId: string): Promise<Project | undefined>;
  createProject(userId: string, data: InsertProject): Promise<Project>;
  updateProject(id: string, userId: string, data: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string, userId: string): Promise<void>;
  getTasksForProject(projectId: string, userId: string): Promise<ProjectTask[]>;
  getTask(id: string, userId: string): Promise<ProjectTask | undefined>;
  createTask(userId: string, projectId: string, data: InsertProjectTask): Promise<ProjectTask>;
  updateTask(id: string, userId: string, data: UpdateProjectTask): Promise<ProjectTask | undefined>;
  reorderTasks(projectId: string, userId: string, updates: { id: string; columnId: string; sortOrder: number }[]): Promise<void>;
  deleteTask(id: string, userId: string): Promise<void>;
  getDashboardProjectsSummary(userId: string): Promise<{
    projects: ProjectWithCounts[];
    totalActive: number;
    totalOpenTasks: number;
    totalDueThisWeek: number;
    totalOverdue: number;
  }>;
  getUrgentTasksForUser(userId: string, hoursAhead?: number): Promise<Array<ProjectTask & { projectName: string; projectColor: string }>>;
  getAllOpenTasksForUser(userId: string, limit?: number): Promise<Array<ProjectTask & { projectName: string; projectColor: string }>>;
  getAllTasksWithDueDatesForUser(userId: string): Promise<Array<ProjectTask & { projectName: string }>>;
  getUserByIcalToken(token: string): Promise<User | null>;
  rotateIcalToken(userId: string): Promise<string>;
  getTaskComments(taskId: string, userId: string): Promise<Array<TaskComment & { authorName: string | null; authorEmail: string | null }>>;
  addTaskComment(taskId: string, userId: string, body: string): Promise<TaskComment>;
  updateTaskComment(taskId: string, commentId: string, userId: string, body: string): Promise<TaskComment | undefined>;
  deleteTaskComment(taskId: string, commentId: string, userId: string): Promise<boolean>;
  getTaskActivity(taskId: string, userId: string): Promise<Array<TaskActivity & { authorName: string | null; authorEmail: string | null }>>;

  // Task Attachments
  getTaskAttachments(taskId: string, userId: string): Promise<TaskAttachment[]>;
  getTaskAttachment(id: string, userId: string): Promise<TaskAttachment | undefined>;
  createTaskAttachment(taskId: string, userId: string, data: { objectPath: string; filename: string; mimeType: string; size: number }): Promise<TaskAttachment>;
  deleteTaskAttachment(id: string, userId: string): Promise<TaskAttachment | undefined>;

  // Project Board Columns
  getColumnsForProject(projectId: string, userId: string): Promise<ProjectColumn[]>;
  createColumn(userId: string, projectId: string, data: InsertProjectColumn): Promise<ProjectColumn>;
  updateColumn(id: string, userId: string, data: Partial<InsertProjectColumn>): Promise<ProjectColumn | undefined>;
  deleteColumn(id: string, userId: string): Promise<void>;
  seedColumnsForProject(projectId: string, userId: string): Promise<ProjectColumn[]>;

  // Project Templates
  getTemplatesForUser(userId: string): Promise<ProjectTemplateWithCounts[]>;
  getTemplate(id: string, userId: string): Promise<ProjectTemplate | undefined>;
  createTemplate(userId: string, data: InsertProjectTemplate): Promise<ProjectTemplate>;
  updateTemplate(id: string, userId: string, data: Partial<InsertProjectTemplate>): Promise<ProjectTemplate | undefined>;
  deleteTemplate(id: string, userId: string): Promise<void>;
  duplicateTemplate(id: string, userId: string): Promise<ProjectTemplate | undefined>;
  getTemplateTasks(templateId: string, userId: string): Promise<ProjectTemplateTask[]>;
  createTemplateTask(userId: string, templateId: string, data: InsertProjectTemplateTask): Promise<ProjectTemplateTask>;
  updateTemplateTask(id: string, userId: string, data: UpdateProjectTemplateTask): Promise<ProjectTemplateTask | undefined>;
  deleteTemplateTask(id: string, userId: string): Promise<void>;
  instantiateProjectFromTemplate(userId: string, templateId: string, project: Project): Promise<void>;
  snapshotProjectAsTemplate(userId: string, projectId: string, name: string): Promise<ProjectTemplate>;

  // Inbox Analyzer
  resetAllEmailAddresses(): Promise<{ analyzerAddressesDeleted: number; intelSeedsDeleted: number }>;
  getOrCreateInboxAddress(userId: string): Promise<EmailInboxAddress>;
  getInboxAddressByToken(token: string): Promise<EmailInboxAddress | undefined>;
  updateInboxSendingFrom(userId: string, sendingFromAddress: string): Promise<void>;
  saveLastPlacementResults(userId: string, results: unknown[]): Promise<void>;
  setPlacementAutoCheckWindow(userId: string, until: Date | null, emailContext?: { receivedAt: Date; subject: string; messageId?: string }): Promise<void>;
  getUsersWithActivePlacementMonitoring(now: Date): Promise<Array<{ userId: string; sendingFromAddress: string; effectiveSenderAddress: string; lastPlacementCheckedAt: Date | null; placementAutoCheckUntil: Date; lastPlacementResults: unknown[] | null; placementCheckReceivedAt: Date | null; placementCheckSubject: string | null; placementCheckMessageId: string | null }>>;
  saveEmailPlacementResults(messageId: string, userId: string, results: unknown[], confirmed?: boolean): Promise<void>;
  createEmailAnalysis(data: {
    userId: string; fromAddress: string; fromName?: string; replyTo?: string; messageId?: string; subject: string;
    bodyText?: string; bodyHtml?: string; rawHeaders?: string;
    spfResult?: string; dkimResult?: string;
  }): Promise<EmailAnalysis>;
  updateEmailAnalysis(id: string, data: Partial<EmailAnalysis>): Promise<void>;
  getEmailAnalyses(userId: string, limit?: number): Promise<EmailAnalysis[]>;
  getEmailAnalysis(id: string, userId: string): Promise<EmailAnalysis | undefined>;
  getEmailAnalysisByMessageId(messageId: string, userId: string): Promise<EmailAnalysis | undefined>;
  deleteEmailAnalysis(id: string, userId: string): Promise<void>;
  // Seed Inboxes (admin-managed)
  getSeedInboxes(activeOnly?: boolean): Promise<SeedInbox[]>;
  getSeedInboxById(id: string): Promise<SeedInbox | null>;
  addSeedInbox(data: InsertSeedInbox): Promise<SeedInbox>;
  deleteSeedInbox(id: string): Promise<void>;
  toggleSeedInbox(id: string, isActive: boolean): Promise<void>;
  renameSeedInbox(id: string, label: string): Promise<void>;
  storeSeedInboxOAuthTokens(id: string, accessToken: string, refreshToken: string | null, expiry: Date | null, email: string): Promise<void>;
  storeImapPassword(id: string, encryptedPassword: string): Promise<void>;
  markSeedInboxNeedsReconnect(id: string): Promise<void>;
  updateSeedInboxOAuthToken(id: string, accessToken: string, expiry: Date | null): Promise<void>;
  disconnectSeedInbox(id: string): Promise<void>;
  // Sender Reputation (Postmaster)
  getPostmasterConnection(userId: string): Promise<PostmasterConnection | null>;
  upsertPostmasterConnection(userId: string, data: { oauthAccessToken: string; oauthRefreshToken: string | null; oauthTokenExpiry: Date | null; connectedEmail: string }): Promise<PostmasterConnection>;
  updatePostmasterLastSynced(userId: string): Promise<void>;
  deletePostmasterConnection(userId: string): Promise<void>;
  getPostmasterDomains(userId: string): Promise<PostmasterDomain[]>;
  upsertPostmasterDomain(userId: string, domainName: string, data: { latestReputation: string | null; latestSpamRate: number | null; latestSpfRatio: number | null; latestDkimRatio: number | null; latestDmarcRatio: number | null; latestEncryptionRatio: number | null; trafficStats: any[] }): Promise<void>;
  deletePostmasterDomains(userId: string): Promise<void>;

  // Analytics — YouTube
  getYouTubeConnection(userId: string): Promise<YoutubeConnection | null>;
  upsertYouTubeConnection(userId: string, data: { oauthAccessToken: string; oauthRefreshToken: string | null; oauthTokenExpiry: Date | null; connectedEmail: string; channelId?: string; channelTitle?: string; channelHandle?: string; channelThumbnail?: string; uploadsPlaylistId?: string }): Promise<YoutubeConnection>;
  updateYouTubeChannel(userId: string, data: { channelId: string; channelTitle: string; channelHandle: string; channelThumbnail: string; uploadsPlaylistId: string }): Promise<void>;
  deleteYouTubeConnection(userId: string): Promise<void>;
  // YouTube Canned Responses
  getCannedResponses(userId: string): Promise<CannedResponse[]>;
  createCannedResponse(userId: string, data: { title: string; body: string }): Promise<CannedResponse>;
  updateCannedResponse(id: string, userId: string, data: { title?: string; body?: string }): Promise<CannedResponse | null>;
  deleteCannedResponse(id: string, userId: string): Promise<void>;
  // YouTube Comment Cache
  getYoutubeCommentCache(userId: string, videoId: string): Promise<YoutubeCommentCache | null>;
  upsertYoutubeCommentCache(userId: string, data: { videoId: string; videoTitle: string; videoThumbnail: string; videoPublishedAt?: Date | null; threads: any[]; totalResults: number }): Promise<void>;
  appendReplyToCommentCache(userId: string, videoId: string, commentId: string, reply: any): Promise<void>;
  clearYoutubeCommentCache(userId: string): Promise<void>;
  // YouTube Analytics Cache
  getYoutubeAnalyticsCache(userId: string, cacheKey: string): Promise<{ data: any; updatedAt: Date } | null>;
  setYoutubeAnalyticsCache(userId: string, cacheKey: string, data: any): Promise<void>;
  clearYoutubeAnalyticsCache(userId: string): Promise<void>;
  getAllConnectedYoutubeUsers(): Promise<Array<{ userId: string; oauthAccessToken: string; oauthRefreshToken: string | null; uploadsPlaylistId: string | null }>>;
  // Analytics — Google Search Console
  getGscConnection(userId: string): Promise<GscConnection | null>;
  upsertGscConnection(userId: string, data: { oauthAccessToken: string; oauthRefreshToken: string | null; oauthTokenExpiry: Date | null; connectedEmail: string }): Promise<GscConnection>;
  setGscSelectedSite(userId: string, siteUrl: string): Promise<void>;
  deleteGscConnection(userId: string): Promise<void>;
  updateGscAccessToken(userId: string, accessToken: string, expiry: Date | null): Promise<void>;
  // GSC Analytics Cache
  getGscAnalyticsCache(userId: string, cacheKey: string): Promise<{ data: any; updatedAt: Date } | null>;
  setGscAnalyticsCache(userId: string, cacheKey: string, data: any): Promise<void>;
  clearGscAnalyticsCache(userId: string): Promise<void>;

  // Notifications
  getNotificationPrefs(userId: string): Promise<{ allEnabled: boolean; preferences: import("@shared/schema").NotificationPreferences }>;
  upsertNotificationPrefs(userId: string, allEnabled: boolean, preferences: import("@shared/schema").NotificationPreferences): Promise<void>;
  hasNotificationBeenSent(userId: string, type: string, refId: string, since: Date): Promise<boolean>;
  logNotification(userId: string, type: string, refId: string | null): Promise<void>;
  getAllUsersForNotifications(): Promise<Array<{ id: string; email: string | null; displayName: string | null; firstName: string | null; timezone: string }>>;
  getAdminUsersForNotifications(): Promise<Array<{ id: string; email: string | null; displayName: string | null; firstName: string | null }>>;
  getDmoEntriesForWeek(userId: string, tz: string): Promise<import("@shared/schema").DmoEntry[]>;

  // Email template overrides
  getEmailTemplateOverride(key: string): Promise<{ subjectOverride: string | null; htmlOverride: string | null } | null>;
  getAllEmailTemplateOverrides(): Promise<Array<{ templateKey: string; subjectOverride: string | null; updatedAt: Date }>>;
  upsertEmailTemplateOverride(key: string, subjectOverride: string | null, htmlOverride: string | null): Promise<void>;
  deleteEmailTemplateOverride(key: string): Promise<void>;

  // Email resource links
  getActiveEmailResources(): Promise<Array<{ id: string; description: string; url: string; anchorText: string; sortOrder: number }>>;
  getAllEmailResources(): Promise<Array<{ id: string; description: string; url: string; anchorText: string; sortOrder: number; isActive: boolean }>>;
  createEmailResource(data: { description: string; url: string; anchorText: string; sortOrder: number }): Promise<{ id: string }>;
  updateEmailResource(id: string, data: Partial<{ description: string; url: string; anchorText: string; sortOrder: number; isActive: boolean }>): Promise<void>;
  deleteEmailResource(id: string): Promise<void>;

  // Funnel Planner
  getFunnelsByUser(userId: string): Promise<FunnelSummary[]>;
  getFunnelById(id: string): Promise<Funnel | undefined>;
  getFunnel(id: string, userId: string): Promise<Funnel | undefined>;
  getFunnelByShareToken(token: string): Promise<Funnel | undefined>;
  createFunnel(userId: string, data: { name: string; description?: string; canvasData?: any }): Promise<Funnel>;
  updateFunnel(id: string, userId: string, data: Partial<{ name: string; description: string; canvasData: any; thumbnailData: string }>): Promise<Funnel | undefined>;
  setFunnelShareToken(id: string, userId: string, token: string, passwordHash: string | null): Promise<Funnel | undefined>;
  clearFunnelShareToken(id: string, userId: string): Promise<Funnel | undefined>;
  duplicateFunnel(id: string, userId: string): Promise<Funnel | undefined>;
  deleteFunnel(id: string, userId: string): Promise<void>;
  updateFunnelBrainTargeting(id: string, userId: string, targeting: string): Promise<void>;
  getFunnelBrainFiles(funnelId: string, userId: string): Promise<FunnelBrainFile[]>;
  addFunnelBrainFile(funnelId: string, userId: string, data: { filename: string; mimeType: string; fileSize: number; extractedText: string }): Promise<FunnelBrainFile>;
  deleteFunnelBrainFile(fileId: string, userId: string): Promise<void>;
  countFunnelBrainFiles(funnelId: string): Promise<number>;
  getFunnelTemplates(): Promise<import("@shared/schema").FunnelTemplate[]>;
  createFunnelTemplate(data: { name: string; description: string; canvasData: any; createdBy: string }): Promise<import("@shared/schema").FunnelTemplate>;
  updateFunnelTemplate(id: string, data: { name?: string; description?: string }): Promise<FunnelTemplate>;
  deleteFunnelTemplate(id: string): Promise<void>;

  // Announcements
  getActiveAnnouncements(userId: string): Promise<Announcement[]>;
  getAllAnnouncements(): Promise<Announcement[]>;
  createAnnouncement(data: InsertAnnouncement): Promise<Announcement>;
  updateAnnouncement(id: number, data: Partial<InsertAnnouncement>): Promise<Announcement | null>;
  deleteAnnouncement(id: number): Promise<void>;
  activateAnnouncement(id: number): Promise<void>;
  deactivateAnnouncement(id: number): Promise<void>;
  reorderAnnouncements(orderedIds: number[]): Promise<void>;
  dismissAnnouncement(userId: string, announcementId: number): Promise<void>;
  resetAnnouncementDismissals(id: number): Promise<void>;

  // Inbox Intel (Competitor Email Intelligence)
  getCompetitorTrackers(userId: string): Promise<CompetitorTrackerWithStats[]>;
  getCompetitorTracker(id: string, userId: string): Promise<CompetitorTracker | undefined>;
  createCompetitorTracker(userId: string, data: InsertCompetitorTracker): Promise<CompetitorTracker>;
  updateCompetitorTracker(id: string, userId: string, data: Partial<InsertCompetitorTracker>): Promise<CompetitorTracker | undefined>;
  setCompetitorTrackerScreenshot(id: string, screenshotPath: string | null, status?: ScreenshotStatus): Promise<void>;
  setCompetitorTrackerScreenshotStatus(id: string, status: ScreenshotStatus): Promise<void>;
  deleteCompetitorTracker(id: string, userId: string): Promise<void>;
  countCompetitorTrackers(userId: string): Promise<number>;
  getCompetitorSeedAddresses(trackerId: string, userId: string): Promise<CompetitorSeedAddress[]>;
  getCompetitorSeedByToken(token: string): Promise<CompetitorSeedAddress | undefined>;
  createCompetitorSeedAddress(userId: string, trackerId: string, token: string, label?: string): Promise<CompetitorSeedAddress>;
  deleteCompetitorSeedAddress(id: string, userId: string): Promise<void>;
  countCompetitorSeedsForTracker(trackerId: string): Promise<number>;
  incrementSeedReceived(id: string): Promise<void>;
  createCapturedEmail(data: Omit<CapturedCompetitorEmail, "id" | "receivedAt" | "isPinned" | "pinnedAt" | "bodyAvailable"> & { bodyAvailable?: boolean }): Promise<CapturedCompetitorEmail>;
  addCapturedEmailLinks(emailId: string, links: Array<{ url: string; domain?: string; anchorText?: string; position: number; hasUtm: boolean }>): Promise<void>;
  getCapturedEmails(trackerId: string, userId: string, limit?: number): Promise<CapturedCompetitorEmail[]>;
  getCapturedEmail(id: string, userId: string): Promise<CapturedCompetitorEmail | undefined>;
  getCapturedEmailLinks(emailId: string): Promise<CapturedCompetitorEmailLink[]>;
  setCapturedEmailPin(id: string, userId: string, pinned: boolean): Promise<CapturedCompetitorEmail | undefined>;
  countPinnedEmailsForTracker(trackerId: string): Promise<number>;
  pruneOldCapturedBodies(trackerId: string, keepLatest: number): Promise<number>;
  getTrackerAnalytics(trackerId: string, userId: string): Promise<TrackerAnalytics>;
  getEmailsForCsvExport(
    userId: string,
    filters: {
      trackerIds?: string[];
      esp?: string;
      search?: string;
      pinnedOnly?: boolean;
      from?: Date;
      to?: Date;
      limit?: number;
    },
  ): Promise<Array<{ trackerName: string; email: CapturedCompetitorEmail }>>;
  getCapturedEmailsFeed(
    userId: string,
    filters: {
      trackerIds?: string[];
      esp?: string;
      search?: string;
      pinnedOnly?: boolean;
      from?: Date;
      to?: Date;
      limit?: number;
    },
  ): Promise<FeedResponse>;

  // Feedback
  getFeedbackPosts(userId: string, isAdmin: boolean, type?: string, status?: string): Promise<import("@shared/schema").FeedbackPostWithMeta[]>;
  getFeedbackPost(id: string, userId: string, isAdmin: boolean): Promise<(import("@shared/schema").FeedbackPostWithMeta & { comments: import("@shared/schema").FeedbackCommentWithUser[] }) | undefined>;
  createFeedbackPost(data: import("@shared/schema").InsertFeedbackPost & { userId: string; screenshotPath?: string | null }): Promise<import("@shared/schema").FeedbackPost>;
  toggleFeedbackVote(postId: string, userId: string): Promise<{ voted: boolean }>;
  addFeedbackComment(postId: string, userId: string, body: string, isAdminNote: boolean): Promise<import("@shared/schema").FeedbackCommentWithUser>;
  updateFeedbackPost(id: string, updates: { status?: string; adminResponse?: string }): Promise<import("@shared/schema").FeedbackPost | undefined>;
  deleteFeedbackPost(id: string): Promise<void>;

  // Admin activity stats
  getUserActivityStats(userId: string): Promise<{ projectCount: number; taskCount: number; tasksDoneCount: number; dmoLast30Days: number }>;

  // Workspace Collaborators
  getWorkspaceInvites(ownerId: string): Promise<WorkspaceInviteWithMember[]>;
  createWorkspaceInvite(ownerId: string, inviteEmail: string, token: string, firstName?: string, lastName?: string): Promise<WorkspaceInvite>;
  getWorkspaceInviteByToken(token: string): Promise<WorkspaceInvite | undefined>;
  getActiveInviteForMember(memberId: string, ownerId: string): Promise<WorkspaceInvite | undefined>;
  acceptWorkspaceInvite(token: string, memberId: string): Promise<WorkspaceInvite | undefined>;
  revokeWorkspaceInvite(id: string, ownerId: string): Promise<void>;
  refreshWorkspaceInviteToken(id: string, ownerId: string, newToken: string): Promise<WorkspaceInvite | undefined>;
  countActiveWorkspaceInvites(ownerId: string): Promise<number>;
  getCollaboratorOwner(userId: string): Promise<string | undefined>;

  // Affiliate Links
  getAffiliateLinks(userId: string, opts?: { q?: string; category?: string; activeOnly?: boolean }): Promise<AffiliateLink[]>;
  getAffiliateLinksPage(userId: string, opts: { q?: string; category?: string; page?: number; limit?: number }): Promise<{ links: AffiliateLink[]; total: number; totalAll: number; totalClicks: number }>;
  getAffiliateLink(id: string, userId: string): Promise<AffiliateLink | undefined>;
  createAffiliateLink(userId: string, data: InsertAffiliateLink): Promise<AffiliateLink>;
  updateAffiliateLink(id: string, userId: string, updates: Partial<InsertAffiliateLink>): Promise<AffiliateLink | undefined>;
  deleteAffiliateLink(id: string, userId: string): Promise<void>;
  incrementAffiliateLinkClick(id: string, userId: string): Promise<void>;
  getAffiliateLinkCategories(userId: string): Promise<string[]>;

  // Swipe File
  getSwipeItems(
    userId: string,
    opts?: { search?: string; type?: string; favorite?: boolean; limit?: number; offset?: number },
  ): Promise<{
    items: SwipeItem[];
    total: number;
    counts: { all: number; upload: number; snippet: number; palette: number; shared: number; favorites: number };
  }>;
  getSwipeItem(id: string, userId: string): Promise<SwipeItem | undefined>;
  getSwipeItemByToken(token: string): Promise<SwipeItem | undefined>;
  createSwipeItem(userId: string, data: Partial<InsertSwipeItem>): Promise<SwipeItem>;
  updateSwipeItem(id: string, userId: string, updates: Partial<InsertSwipeItem>): Promise<SwipeItem | undefined>;
  deleteSwipeItem(id: string, userId: string): Promise<void>;
  setSwipeItemShareToken(id: string, userId: string, token: string | null): Promise<SwipeItem | undefined>;
  incrementSwipeItemViewCount(token: string): Promise<void>;

  // Courses (admin)
  getCourses(): Promise<Course[]>;
  getCourse(id: string): Promise<Course | undefined>;
  getCourseBySlug(slug: string): Promise<Course | undefined>;
  createCourse(course: InsertCourse): Promise<Course>;
  updateCourse(id: string, updates: Partial<Course>): Promise<Course | undefined>;
  deleteCourse(id: string): Promise<boolean>;
  getCourseModules(courseId: string): Promise<CourseModule[]>;
  getCourseModule(id: string): Promise<CourseModule | undefined>;
  getCourseModuleBySlug(courseId: string, slug: string): Promise<CourseModule | undefined>;
  getCourseModuleByExternalId(courseId: string, externalId: string): Promise<CourseModule | undefined>;
  createCourseModule(module: InsertCourseModule): Promise<CourseModule>;
  updateCourseModule(id: string, updates: Partial<CourseModule>): Promise<CourseModule | undefined>;
  deleteCourseModule(id: string): Promise<boolean>;
  reorderCourseModules(courseId: string, orderedIds: string[]): Promise<void>;
  getCourseLessons(moduleId: string): Promise<CourseLesson[]>;
  getCourseLesson(id: string): Promise<CourseLesson | undefined>;
  getCourseLessonWithCourse(id: string): Promise<CourseLessonWithCourse | undefined>;
  getCourseLessonByPath(courseIdentifier: string, moduleSlug: string, lessonSlug: string): Promise<CourseLessonWithCourse | undefined>;
  getCourseLessonBySlug(courseId: string, moduleId: string, slug: string): Promise<CourseLesson | undefined>;
  getCourseLessonByExternalId(courseId: string, externalId: string): Promise<CourseLesson | undefined>;
  createCourseLesson(lesson: InsertCourseLesson): Promise<CourseLesson>;
  updateCourseLesson(id: string, updates: Partial<CourseLesson>): Promise<CourseLesson | undefined>;
  deleteCourseLesson(id: string): Promise<boolean>;
  reorderCourseLessons(moduleId: string, orderedIds: string[]): Promise<void>;
  getLessonResources(lessonId: string): Promise<CourseResource[]>;
  createCourseResource(resource: InsertCourseResource): Promise<CourseResource>;
  updateCourseResource(id: string, updates: Partial<CourseResource>): Promise<CourseResource | undefined>;
  deleteCourseResource(id: string): Promise<boolean>;

  // Courses (member)
  getPublishedCourses(): Promise<Course[]>;
  getPublishedCoursesWithProgress(userId: string): Promise<Array<Course & {
    progress: { completed: number; total: number };
    firstLesson: {
      id: string;
      title: string;
      slug: string | null;
      moduleId: string;
      module: { title: string; slug: string | null };
    } | null;
  }>>;
  getCourseWithStructure(courseId: string, userId: string): Promise<{
    course: Course;
    modules: (CourseNavigationModule & { lessons: CourseNavigationLesson[] })[];
  } | undefined>;
  upsertCourseProgress(userId: string, courseId: string, lessonId: string, completed: boolean): Promise<CourseProgress>;
  getUserCourseProgress(userId: string, courseId: string): Promise<CourseProgress[]>;

  // Training Library replays (standalone from courses)
  getTrainingReplays(): Promise<TrainingReplay[]>;
  getTrainingReplay(id: string): Promise<TrainingReplay | undefined>;
  getTrainingReplayBySlug(slug: string): Promise<TrainingReplay | undefined>;
  createTrainingReplay(replay: InsertTrainingReplay): Promise<TrainingReplay>;
  updateTrainingReplay(id: string, updates: Partial<TrainingReplay>): Promise<TrainingReplay | undefined>;
  deleteTrainingReplay(id: string): Promise<boolean>;
  reorderTrainingReplays(orderedIds: string[]): Promise<void>;
  importTrainingReplays(rows: TrainingReplayImportRow[]): Promise<TrainingReplayImportResult>;
  getTrainingReplayResources(replayId: string): Promise<TrainingReplayResource[]>;
  createTrainingReplayResource(resource: InsertTrainingReplayResource): Promise<TrainingReplayResource>;
  updateTrainingReplayResource(id: string, updates: Partial<TrainingReplayResource>): Promise<TrainingReplayResource | undefined>;
  deleteTrainingReplayResource(id: string): Promise<boolean>;
  getPublishedTrainingReplays(): Promise<TrainingReplay[]>;
  getPublishedTrainingReplayBySlug(slug: string): Promise<TrainingReplay | undefined>;
  searchPublishedTrainingReplays(filters: { q?: string; category?: string; tag?: string }): Promise<TrainingReplay[]>;
  getUserTrainingReplayProgress(userId: string): Promise<TrainingReplayProgress[]>;
  getTrainingReplayProgress(userId: string, replayId: string): Promise<TrainingReplayProgress | undefined>;
  upsertTrainingReplayProgress(userId: string, replayId: string, completed: boolean): Promise<TrainingReplayProgress>;
  getTrainingReplayComments(replayId: string): Promise<Array<TrainingReplayComment & {
    authorName: string;
  }>>;
  createTrainingReplayComment(replayId: string, userId: string, body: string): Promise<TrainingReplayComment>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    // Use case-insensitive lookup to prevent duplicate accounts
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return undefined;
    
    const [user] = await db.select().from(users)
      .where(sql`LOWER(TRIM(${users.email})) = ${normalizedEmail}`);
    return user || undefined;
  }

  async getUserByCfContactId(contactId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.cfContactId, contactId)).limit(1);
    return user;
  }

  async createUser(insertUser: InsertUser & { emailConsentAt?: Date; emailConsentIp?: string }): Promise<User> {
    // Normalize email before insert to ensure consistency
    const normalizedData = {
      ...insertUser,
      email: normalizeEmail(insertUser.email),
    };
    
    const [user] = await db.insert(users).values(normalizedData).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    // Normalize email if being updated
    const normalizedUpdates = {
      ...updates,
      ...(updates.email !== undefined ? { email: normalizeEmail(updates.email) } : {}),
    };
    
    const [user] = await db.update(users)
      .set(normalizedUpdates)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async updateUserForCfMembershipEvent(id: string, updates: Partial<User>, occurredAt: Date): Promise<User | undefined> {
    const [user] = await db.update(users).set(updates).where(and(
      eq(users.id, id),
      or(isNull(users.cfMembershipEventAt), lte(users.cfMembershipEventAt, occurredAt)),
    )).returning();
    return user;
  }

  // Sessions
  async getSession(id: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    return session || undefined;
  }

  async getSessionsByUser(userId: string, limit?: number): Promise<Session[]> {
    const query = db.select().from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt));
    return typeof limit === "number" ? query.limit(limit) : query;
  }

  async getStaleUploadingSessions(olderThanMs: number): Promise<Session[]> {
    const cutoff = new Date(Date.now() - olderThanMs);
    // Filter on processingUpdatedAt (the time when status was last changed to
    // "uploading") rather than createdAt.  A session could have been created long
    // ago but only recently entered "uploading" state, so createdAt is the wrong
    // anchor for determining how long the upload has been pending.
    return db.select().from(sessions).where(
      and(
        eq(sessions.processingStatus as any, "uploading"),
        lt(sessions.processingUpdatedAt as any, cutoff),
      )
    );
  }

  async registerPendingAttachmentUpload(objectPath: string, userId: string, taskId: string): Promise<void> {
    await db.insert(pendingAttachmentUploads)
      .values({ objectPath, userId, taskId })
      .onConflictDoUpdate({
        target: pendingAttachmentUploads.objectPath,
        set: { issuedAt: new Date(), userId, taskId },
      });
  }

  async getPendingAttachmentUpload(objectPath: string): Promise<PendingAttachmentUpload | undefined> {
    const [row] = await db.select().from(pendingAttachmentUploads)
      .where(eq(pendingAttachmentUploads.objectPath, objectPath));
    return row;
  }

  async removePendingAttachmentUpload(objectPath: string): Promise<void> {
    await db.delete(pendingAttachmentUploads)
      .where(eq(pendingAttachmentUploads.objectPath, objectPath));
  }

  async getExpiredPendingAttachmentUploads(olderThanMs: number): Promise<PendingAttachmentUpload[]> {
    const cutoff = new Date(Date.now() - olderThanMs);
    return db.select().from(pendingAttachmentUploads)
      .where(lt(pendingAttachmentUploads.issuedAt, cutoff));
  }

  async createSession(insertSession: InsertSession): Promise<Session> {
    const [session] = await db.insert(sessions).values(insertSession as any).returning();
    return session;
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<Session | undefined> {
    const [session] = await db.update(sessions)
      .set(updates)
      .where(eq(sessions.id, id))
      .returning();
    return session || undefined;
  }

  async deleteSession(id: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, id));
  }

  // Password Reset Tokens
  async createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken> {
    const [resetToken] = await db.insert(passwordResetTokens).values(token as any).returning();
    return resetToken;
  }

  async getPasswordResetTokenByHash(tokenHash: string): Promise<PasswordResetToken | undefined> {
    const [token] = await db.select().from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash));
    return token || undefined;
  }

  async markPasswordResetTokenUsed(id: string): Promise<void> {
    await db.update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, id));
  }

  async countRecentPasswordResetRequests(userId: string, since: Date): Promise<number> {
    const tokens = await db.select().from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.userId, userId),
        gt(passwordResetTokens.createdAt, since)
      ));
    return tokens.length;
  }

  async countRecentPasswordResetRequestsByIp(ip: string, since: Date): Promise<number> {
    const tokens = await db.select().from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.requestIp, ip),
        gt(passwordResetTokens.createdAt, since)
      ));
    return tokens.length;
  }

  async createMagicLinkToken(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
    await db.insert(magicLinkTokens).values(data);
  }

  async getMagicLinkTokenByHash(tokenHash: string): Promise<MagicLinkToken | undefined> {
    const [token] = await db.select().from(magicLinkTokens)
      .where(eq(magicLinkTokens.tokenHash, tokenHash));
    return token || undefined;
  }

  async markMagicLinkTokenUsed(id: string): Promise<void> {
    await db.update(magicLinkTokens)
      .set({ usedAt: new Date() })
      .where(eq(magicLinkTokens.id, id));
  }

  async countRecentMagicLinkRequests(userId: string, since: Date): Promise<number> {
    const rows = await db.select().from(magicLinkTokens)
      .where(and(
        eq(magicLinkTokens.userId, userId),
        gt(magicLinkTokens.createdAt, since)
      ));
    return rows.length;
  }

  // User Identities (OAuth)
  async getUserIdentityByProvider(provider: AuthProvider, providerUserId: string): Promise<UserIdentity | undefined> {
    const [identity] = await db.select().from(userIdentities)
      .where(and(
        eq(userIdentities.provider, provider),
        eq(userIdentities.providerUserId, providerUserId)
      ));
    return identity || undefined;
  }

  async getUserIdentitiesByUser(userId: string): Promise<UserIdentity[]> {
    return db.select().from(userIdentities)
      .where(eq(userIdentities.userId, userId));
  }

  async createUserIdentity(identity: InsertUserIdentity): Promise<UserIdentity> {
    const [newIdentity] = await db.insert(userIdentities).values(identity as any).returning();
    return newIdentity;
  }

  async deleteUserIdentity(userId: string, provider: AuthProvider): Promise<boolean> {
    const result = await db.delete(userIdentities)
      .where(and(
        eq(userIdentities.userId, userId),
        eq(userIdentities.provider, provider)
      ))
      .returning();
    return result.length > 0;
  }

  // Admin: User Management
  async getAllUsers(options: {
    search?: string;
    role?: string;
    status?: string;
    provider?: string;
    consent?: string;
    membership?: string;
    login?: string;
    sort?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ users: (User & { totalVideos: number })[]; total: number }> {
    const { search, role, status, provider, consent, membership, login, sort = "newest", page = 1, pageSize = 25 } = options;
    
    const conditions: any[] = [];
    
    if (search) {
      conditions.push(
        or(
          ilike(users.email, `%${search}%`),
          ilike(users.displayName, `%${search}%`),
          ilike(users.firstName, `%${search}%`),
          ilike(users.lastName, `%${search}%`)
        )
      );
    }
    
    if (role === "admin") {
      conditions.push(eq(users.isAdmin, true));
    } else if (role === "user") {
      conditions.push(eq(users.isAdmin, false));
    }
    
    if (status === "active") {
      conditions.push(eq(users.isDisabled, false));
    } else if (status === "disabled") {
      conditions.push(eq(users.isDisabled, true));
    }
    
    if (consent === "yes") {
      conditions.push(sql`${users.emailConsentAt} IS NOT NULL`);
    } else if (consent === "no") {
      conditions.push(isNull(users.emailConsentAt));
    }

    if (membership === "enrolled") {
      conditions.push(eq(users.cfEnrolled, true));
    } else if (membership === "revoked") {
      conditions.push(and(eq(users.cfEnrolled, false), sql`${users.cfRevokedAt} IS NOT NULL`)!);
    } else if (membership === "never") {
      conditions.push(and(eq(users.cfEnrolled, false), isNull(users.cfRevokedAt))!);
    }

    if (login === "logged_in") {
      conditions.push(sql`${users.lastLoginAt} IS NOT NULL`);
    } else if (login === "never") {
      conditions.push(isNull(users.lastLoginAt));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    // Get total count
    const [{ count: totalCount }] = await db.select({ count: count() }).from(users).where(whereClause);
    
    // Get users with sorting and totalVideos count via LEFT JOIN
    let orderByColumn;
    let orderDirection: "asc" | "desc" = "desc";
    switch (sort) {
      case "oldest":
        orderByColumn = users.createdAt;
        orderDirection = "asc";
        break;
      case "last_login":
        orderByColumn = users.lastLoginAt;
        orderDirection = "desc";
        break;
      case "never_first":
        orderByColumn = users.lastLoginAt;
        orderDirection = "asc";
        break;
      case "newest":
      default:
        orderByColumn = users.createdAt;
        orderDirection = "desc";
    }
    
    const offset = (page - 1) * pageSize;
    
    // Use aggregation query with LEFT JOIN to count sessions
    const userResults = await db
      .select({
        user: users,
        totalVideos: sql<number>`COALESCE(COUNT(${sessions.id}), 0)::int`,
      })
      .from(users)
      .leftJoin(sessions, eq(sessions.userId, users.id))
      .where(whereClause)
      .groupBy(users.id)
      .orderBy(orderDirection === "asc" ? asc(orderByColumn) : desc(orderByColumn))
      .limit(pageSize)
      .offset(offset);
    
    // Flatten the result to include totalVideos directly on user
    const usersWithCounts = userResults.map(r => ({
      ...r.user,
      totalVideos: r.totalVideos,
    }));
    
    return { users: usersWithCounts, total: Number(totalCount) };
  }

  async getAdminCount(): Promise<number> {
    const [{ count: adminCount }] = await db.select({ count: count() })
      .from(users)
      .where(and(eq(users.isAdmin, true), eq(users.isDisabled, false)));
    return Number(adminCount);
  }

  async getUserWithDetails(id: string): Promise<{
    user: User;
    identities: UserIdentity[];
    sessions: Session[];
    sessionCount: number;
  } | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;
    
    const identities = await this.getUserIdentitiesByUser(id);
    
    // Get last 10 sessions
    const userSessions = await db.select().from(sessions)
      .where(eq(sessions.userId, id))
      .orderBy(desc(sessions.createdAt))
      .limit(10);
    
    // Get total session count
    const [{ count: sessionCount }] = await db.select({ count: count() })
      .from(sessions)
      .where(eq(sessions.userId, id));
    
    return {
      user,
      identities,
      sessions: userSessions,
      sessionCount: Number(sessionCount),
    };
  }

  // ClickFunnels
  async getCfEnrolledUsers(): Promise<{
    enrolledCount: number;
    revokedCount: number;
    neverEnrolledCount: number;
  }> {
    const memberAccount = sql`COALESCE(${users.isAdmin}, false) = false`;
    const [[enrolledRow], [revokedRow], [neverEnrolledRow]] = await Promise.all([
      db.select({ count: count() }).from(users).where(and(memberAccount, eq(users.cfEnrolled, true))),
      db.select({ count: count() }).from(users).where(and(
        memberAccount,
        eq(users.cfEnrolled, false),
        sql`${users.cfRevokedAt} IS NOT NULL`,
      )),
      db.select({ count: count() }).from(users).where(and(
        memberAccount,
        sql`${users.cfEnrolledAt} IS NULL`,
        sql`${users.cfRevokedAt} IS NULL`,
      )),
    ]);
    return {
      enrolledCount: Number(enrolledRow?.count || 0),
      revokedCount: Number(revokedRow?.count || 0),
      neverEnrolledCount: Number(neverEnrolledRow?.count || 0),
    };
  }

  async getCfUsers(filter?: string): Promise<Array<Pick<User, 'id' | 'email' | 'displayName' | 'firstName' | 'lastName' | 'createdAt' | 'lastLoginAt' | 'isAdmin' | 'isDisabled' | 'role' | 'cfEnrolled' | 'cfEnrolledAt' | 'cfRevokedAt' | 'cfContactId' | 'cfRevokedGraceUntil'>>> {
    const memberAccount = sql`COALESCE(${users.isAdmin}, false) = false`;
    let condition = memberAccount;
    if (filter === 'enrolled') {
      condition = and(condition, eq(users.cfEnrolled, true))!;
    } else if (filter === 'revoked') {
      condition = and(
        condition,
        eq(users.cfEnrolled, false),
        sql`${users.cfRevokedAt} IS NOT NULL`,
      )!;
    } else if (filter === 'never') {
      condition = and(
        condition,
        sql`${users.cfEnrolledAt} IS NULL`,
        sql`${users.cfRevokedAt} IS NULL`,
      )!;
    }

    return db.select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      isAdmin: users.isAdmin,
      isDisabled: users.isDisabled,
      role: users.role,
      cfEnrolled: users.cfEnrolled,
      cfEnrolledAt: users.cfEnrolledAt,
      cfRevokedAt: users.cfRevokedAt,
      cfContactId: users.cfContactId,
      cfRevokedGraceUntil: users.cfRevokedGraceUntil,
    }).from(users).where(condition).orderBy(desc(users.cfEnrolledAt), desc(users.createdAt));
  }

  async applyCfReconciliation(
    enrollments: CfReconciliationEnrollment[],
  ): Promise<CfReconciliationChanges> {
    return db.transaction(async (tx) => {
      const localUsers = await tx.select().from(users);
      const activeByEmail = new Map<string, CfReconciliationEnrollment>();
      const activeByContactId = new Map<string, CfReconciliationEnrollment>();
      const inactiveByEmail = new Map<string, CfReconciliationEnrollment>();
      const inactiveByContactId = new Map<string, CfReconciliationEnrollment>();
      const issues: Array<{ issueKey: string; kind: string; contactId?: string; email?: string; userId?: string; details: Record<string, unknown> }> = [];

      const localByEmail = new Map<string, User[]>();
      const localByContactId = new Map<string, User[]>();
      for (const user of localUsers) {
        const email = normalizeEmail(user.email);
        if (email) localByEmail.set(email, [...(localByEmail.get(email) || []), user]);
        if (user.cfContactId) localByContactId.set(user.cfContactId, [...(localByContactId.get(user.cfContactId) || []), user]);
      }

      for (const enrollment of enrollments) {
        const email = normalizeEmail(enrollment.email);
        if (!email || !enrollment.contactId) {
          issues.push({
            issueKey: `invalid-record:${enrollment.contactId || email || "unknown"}`,
            kind: "invalid_enrollment_record",
            contactId: enrollment.contactId,
            email: email || undefined,
            details: { reason: "ClickFunnels enrollment record is missing a contact ID or email." },
          });
          continue;
        }
        if (enrollment.active) {
          if (activeByContactId.has(enrollment.contactId) || activeByEmail.has(email)) {
            issues.push({
              issueKey: `duplicate-enrollment:${enrollment.contactId}:${email}`,
              kind: "duplicate_clickfunnels_enrollment",
              contactId: enrollment.contactId,
              email,
              details: { reason: "More than one active ClickFunnels enrollment mapped to the same identity." },
            });
            continue;
          }
          activeByEmail.set(email, enrollment);
          activeByContactId.set(enrollment.contactId, enrollment);
        } else {
          inactiveByEmail.set(email, enrollment);
          inactiveByContactId.set(enrollment.contactId, enrollment);
        }
      }

      const now = new Date();
      const changes: CfReconciliationChanges = {
        accountsCreated: 0,
        accountsReactivated: 0,
        accountsRevoked: 0,
        unchanged: 0,
        identityIssues: 0,
      };

      // Active ClickFunnels enrollments are the only records that can create a
      // Toolkit account. This ensures dormant historical enrollments do not add
      // people to the local directory unnecessarily.
      for (const enrollment of activeByEmail.values()) {
        const email = normalizeEmail(enrollment.email)!;
        const contactMatches = localByContactId.get(enrollment.contactId) || [];
        const emailMatches = localByEmail.get(email) || [];
        if (contactMatches.length > 1 || emailMatches.length > 1) {
          issues.push({
            issueKey: `ambiguous-local:${enrollment.contactId}:${email}`,
            kind: "ambiguous_local_identity",
            contactId: enrollment.contactId,
            email,
            details: { contactMatchCount: contactMatches.length, emailMatchCount: emailMatches.length },
          });
          continue;
        }
        const byContact = contactMatches[0];
        const byEmail = emailMatches[0];
        if (byContact && byEmail && byContact.id !== byEmail.id) {
          issues.push({
            issueKey: `identity-conflict:${enrollment.contactId}:${email}`,
            kind: "contact_email_conflict",
            contactId: enrollment.contactId,
            email,
            userId: byContact.id,
            details: { contactUserId: byContact.id, emailUserId: byEmail.id },
          });
          continue;
        }
        const existing = byContact || byEmail;
        if (!existing) {
          const firstName = enrollment.firstName || "";
          const lastName = enrollment.lastName || "";
          await tx.insert(users).values({
            email,
            displayName: [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0],
            firstName,
            lastName,
            cfEnrolled: true,
            cfContactId: enrollment.contactId,
            cfEnrolledAt: now,
            cfRevokedAt: null,
            cfRevokedGraceUntil: null,
            cfGraceExpirySentAt: null,
            isDisabled: false,
          });
          changes.accountsCreated++;
          continue;
        }

        // Administrators are never changed by a membership sync. Their account
        // access is intentionally independent of ClickFunnels membership.
        if (existing.isAdmin) {
          changes.unchanged++;
          continue;
        }

        const needsAccessRestore = !existing.cfEnrolled || existing.isDisabled || !!existing.cfRevokedAt;
        const emailChanged = normalizeEmail(existing.email) !== email;
        const needsUpdate = needsAccessRestore || existing.cfContactId !== enrollment.contactId || emailChanged;
        if (!needsUpdate) {
          changes.unchanged++;
          continue;
        }

        await tx.update(users).set({
          cfEnrolled: true,
          cfContactId: enrollment.contactId,
          email: emailChanged ? email : existing.email,
          cfEnrolledAt: existing.cfEnrolledAt ?? now,
          cfRevokedAt: null,
          cfRevokedGraceUntil: null,
          cfGraceExpirySentAt: null,
          isDisabled: false,
        }).where(eq(users.id, existing.id));
        if (needsAccessRestore) changes.accountsReactivated++;
      }

      // Revoke a local member only after a complete scan confirms no active
      // enrollment. An inactive CF enrollment also establishes past membership
      // for an existing local profile, even when that person never logged in.
      for (const localUser of localUsers) {
        if (localUser.isAdmin) continue;
        const contactMatches = localUser.cfContactId ? localByContactId.get(localUser.cfContactId) || [] : [];
        const email = normalizeEmail(localUser.email);
        const emailMatches = email ? localByEmail.get(email) || [] : [];
        if (contactMatches.length > 1 || emailMatches.length > 1) continue;
        const activeEnrollment =
          (localUser.cfContactId ? activeByContactId.get(localUser.cfContactId) : undefined) ||
          (email ? activeByEmail.get(email) : undefined);
        if (activeEnrollment) continue;

        const inactiveEnrollment =
          (localUser.cfContactId ? inactiveByContactId.get(localUser.cfContactId) : undefined) ||
          (email ? inactiveByEmail.get(email) : undefined);
        if (localUser.cfEnrolled !== true && !inactiveEnrollment) continue;

        const needsRevocation =
          localUser.cfEnrolled !== false ||
          !localUser.cfRevokedAt ||
          !localUser.isDisabled ||
          (inactiveEnrollment && localUser.cfContactId !== inactiveEnrollment.contactId);
        if (!needsRevocation) {
          changes.unchanged++;
          continue;
        }

        await tx.update(users).set({
          cfEnrolled: false,
          cfContactId: inactiveEnrollment?.contactId ?? localUser.cfContactId,
          cfRevokedAt: localUser.cfRevokedAt ?? now,
          cfRevokedGraceUntil: null,
          cfGraceExpirySentAt: null,
          isDisabled: true,
        }).where(eq(users.id, localUser.id));
        changes.accountsRevoked++;
      }

      await tx.update(cfIdentityIssues).set({ resolvedAt: now }).where(isNull(cfIdentityIssues.resolvedAt));
      for (const issue of issues) {
        await tx.insert(cfIdentityIssues).values({
          ...issue,
          lastDetectedAt: now,
          resolvedAt: null,
        }).onConflictDoUpdate({
          target: cfIdentityIssues.issueKey,
          set: {
            kind: issue.kind,
            contactId: issue.contactId ?? null,
            email: issue.email ?? null,
            userId: issue.userId ?? null,
            details: issue.details,
            lastDetectedAt: now,
            resolvedAt: null,
          },
        });
      }
      changes.identityIssues = issues.length;
      return changes;
    });
  }

  async createCfWebhookActivity(data: InsertCfWebhookActivity): Promise<CfWebhookActivity> {
    await db.delete(cfWebhookActivity).where(
      lt(cfWebhookActivity.createdAt, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
    );
    const [row] = await db.insert(cfWebhookActivity).values(data).returning();
    return row;
  }

  async claimCfWebhookEvent(data: InsertCfWebhookActivity): Promise<{ claimed: boolean; deliveryCount: number }> {
    if (!data.eventId) return { claimed: true, deliveryCount: 1 };
    await db.delete(cfWebhookActivity).where(
      lt(cfWebhookActivity.createdAt, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
    );
    const now = new Date();
    const [inserted] = await db.insert(cfWebhookActivity).values({
      ...data,
      status: "processing",
      action: "processing",
      lastReceivedAt: now,
      deliveryCount: 1,
    }).onConflictDoNothing({ target: cfWebhookActivity.eventId }).returning();
    if (inserted) return { claimed: true, deliveryCount: 1 };
    const [existing] = await db.select({
      deliveryCount: cfWebhookActivity.deliveryCount,
    }).from(cfWebhookActivity).where(eq(cfWebhookActivity.eventId, data.eventId)).limit(1);
    const deliveryCount = (existing?.deliveryCount || 0) + 1;
    await db.update(cfWebhookActivity).set({
      deliveryCount,
      lastReceivedAt: now,
    }).where(eq(cfWebhookActivity.eventId, data.eventId));
    return { claimed: false, deliveryCount };
  }

  async completeCfWebhookEvent(eventId: string, data: Pick<InsertCfWebhookActivity, "status" | "action" | "httpStatus" | "error" | "durationMs">): Promise<void> {
    await db.update(cfWebhookActivity).set(data).where(eq(cfWebhookActivity.eventId, eventId));
  }

  async getCfWebhookActivity(options: {
    limit: number;
    offset: number;
    eventType?: string;
    status?: string;
  }) {
    const conditions = [];
    if (options.eventType && options.eventType !== "all") {
      conditions.push(eq(cfWebhookActivity.eventType, options.eventType));
    }
    if (options.status && options.status !== "all") {
      conditions.push(eq(cfWebhookActivity.status, options.status));
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const [events, totalRows, [lastReceived], [lastEnrollment], [lastRevocation], [processed], [failed]] = await Promise.all([
      db.select().from(cfWebhookActivity).where(where).orderBy(desc(cfWebhookActivity.createdAt)).limit(options.limit).offset(options.offset),
      db.select({ count: count() }).from(cfWebhookActivity).where(where),
      db.select({ createdAt: cfWebhookActivity.createdAt }).from(cfWebhookActivity).orderBy(desc(cfWebhookActivity.createdAt)).limit(1),
      db.select({ createdAt: cfWebhookActivity.createdAt }).from(cfWebhookActivity)
        .where(eq(cfWebhookActivity.eventType, "courses/enrollment.created")).orderBy(desc(cfWebhookActivity.createdAt)).limit(1),
      db.select({ createdAt: cfWebhookActivity.createdAt }).from(cfWebhookActivity)
        .where(sql`${cfWebhookActivity.eventType} IN ('courses/enrollment.suspended', 'courses/enrollment.deleted', 'subscription.cancelled', 'subscription.churned')`)
        .orderBy(desc(cfWebhookActivity.createdAt)).limit(1),
      db.select({ count: count() }).from(cfWebhookActivity).where(eq(cfWebhookActivity.status, "processed")),
      db.select({ count: count() }).from(cfWebhookActivity).where(inArray(cfWebhookActivity.status, ["failed", "rejected"])),
    ]);
    return {
      events,
      total: Number(totalRows[0]?.count ?? 0),
      lastReceivedAt: lastReceived?.createdAt ?? null,
      lastEnrollmentAt: lastEnrollment?.createdAt ?? null,
      lastRevocationAt: lastRevocation?.createdAt ?? null,
      processedCount: Number(processed?.count ?? 0),
      failedCount: Number(failed?.count ?? 0),
    };
  }

  async createCfReconciliationRun(data: Partial<InsertCfReconciliationRun> = {}): Promise<CfReconciliationRun> {
    const [row] = await db.insert(cfReconciliationRuns).values(data).returning();
    return row;
  }

  async updateCfReconciliationRun(id: string, data: Partial<InsertCfReconciliationRun>): Promise<CfReconciliationRun | undefined> {
    const [row] = await db.update(cfReconciliationRuns).set(data).where(eq(cfReconciliationRuns.id, id)).returning();
    return row;
  }

  async getLatestCfReconciliationRun(): Promise<CfReconciliationRun | undefined> {
    const [row] = await db.select().from(cfReconciliationRuns).orderBy(desc(cfReconciliationRuns.startedAt)).limit(1);
    return row;
  }

  async getLatestSuccessfulCfReconciliationRun(): Promise<CfReconciliationRun | undefined> {
    const [row] = await db.select()
      .from(cfReconciliationRuns)
      .where(eq(cfReconciliationRuns.status, "completed"))
      .orderBy(desc(cfReconciliationRuns.completedAt), desc(cfReconciliationRuns.startedAt))
      .limit(1);
    return row;
  }

  async getOpenCfIdentityIssues(limit = 20): Promise<CfIdentityIssue[]> {
    return db.select().from(cfIdentityIssues)
      .where(isNull(cfIdentityIssues.resolvedAt))
      .orderBy(desc(cfIdentityIssues.lastDetectedAt))
      .limit(limit);
  }

  async getEnrolledUsersWithContactId(): Promise<Array<{ userId: string; email: string; contactId: string }>> {
    const rows = await db.select({
      userId: users.id,
      email: users.email,
      contactId: users.cfContactId,
    }).from(users).where(
      and(eq(users.cfEnrolled, true), sql`${users.cfContactId} IS NOT NULL`, eq(users.isDisabled, false))
    );
    return rows.filter((r): r is { userId: string; email: string; contactId: string } => !!r.contactId);
  }

  async getCfButtonSettings(): Promise<{ text: string; bg: string; color: string; radius: string; width: string; fontSize: string; padding: string }> {
    const defaults = { text: "Access Academy Toolkit", bg: "#4f46e5", color: "#ffffff", radius: "rounded", width: "auto", fontSize: "15", padding: "normal" };
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "cf_button_settings"));
    if (!row) return defaults;
    try { return { ...defaults, ...JSON.parse(row.value) }; } catch { return defaults; }
  }

  async setCfButtonSettings(settings: { text: string; bg: string; color: string; radius: string; width: string; fontSize: string; padding: string }): Promise<void> {
    const now = new Date();
    const value = JSON.stringify(settings);
    await db.insert(appSettings)
      .values({ key: "cf_button_settings", value, updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } });
  }

  // Admin: Audit Log
  async createAuditLog(log: InsertAdminAuditLog): Promise<AdminAuditLog> {
    const [auditLog] = await db.insert(adminAuditLog).values(log as any).returning();
    return auditLog;
  }

  // Admin: Stats
  async getAdminStats(): Promise<{
    totalUsers: number;
    newUsersLast7Days: number;
    totalSessions: number;
    sessionsLast7Days: number;
  }> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const [{ count: totalUsers }] = await db.select({ count: count() }).from(users);
    const [{ count: newUsersLast7Days }] = await db.select({ count: count() })
      .from(users)
      .where(gt(users.createdAt, sevenDaysAgo));
    const [{ count: totalSessions }] = await db.select({ count: count() }).from(sessions);
    const [{ count: sessionsLast7Days }] = await db.select({ count: count() })
      .from(sessions)
      .where(gt(sessions.createdAt, sevenDaysAgo));
    
    return {
      totalUsers: Number(totalUsers),
      newUsersLast7Days: Number(newUsersLast7Days),
      totalSessions: Number(totalSessions),
      sessionsLast7Days: Number(sessionsLast7Days),
    };
  }

  // Admin: Overview Stats (new format with 30-day new users)
  async getOverviewStats(): Promise<{
    totalUsers: number;
    sessionsLast7Days: number;
    newUsersLast30Days: number;
  }> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const [{ count: totalUsers }] = await db.select({ count: count() }).from(users);
    const [{ count: sessionsLast7Days }] = await db.select({ count: count() })
      .from(sessions)
      .where(gt(sessions.createdAt, sevenDaysAgo));
    const [{ count: newUsersLast30Days }] = await db.select({ count: count() })
      .from(users)
      .where(gt(users.createdAt, thirtyDaysAgo));
    
    return {
      totalUsers: Number(totalUsers),
      sessionsLast7Days: Number(sessionsLast7Days),
      newUsersLast30Days: Number(newUsersLast30Days),
    };
  }

  // Admin: Activity Feed (session creation events with cursor pagination)
  async getActivityFeed(options: {
    limit: number;
    cursor?: { createdAt: Date; id: string };
  }): Promise<{
    items: Array<{
      id: string;
      type: "session_created";
      sessionId: string;
      sessionTitle: string | null;
      sessionCreatedAt: Date;
      scoreTotal: number | null;
      user: {
        id: string;
        displayName: string | null;
        email: string | null;
      };
    }>;
    nextCursor: { createdAt: Date; id: string } | null;
  }> {
    const limit = Math.min(options.limit, 50);
    
    // Build query with cursor-based pagination
    let query = db.select({
      sessionId: sessions.id,
      sessionTitle: sessions.title,
      sessionCreatedAt: sessions.createdAt,
      scoreJson: sessions.scoreJson,
      userId: users.id,
      displayName: users.displayName,
      email: users.email,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .orderBy(desc(sessions.createdAt), desc(sessions.id))
    .limit(limit + 1); // Fetch one extra to check for more
    
    if (options.cursor) {
      // Cursor pagination: get items older than cursor
      query = query.where(
        or(
          lt(sessions.createdAt, options.cursor.createdAt),
          and(
            eq(sessions.createdAt, options.cursor.createdAt),
            lt(sessions.id, options.cursor.id)
          )
        )
      ) as any;
    }
    
    const results = await query;
    
    // Check if there are more items
    const hasMore = results.length > limit;
    const items = hasMore ? results.slice(0, limit) : results;
    
    // Extract score total from scoreJson
    const feedItems = items.map(row => ({
      id: row.sessionId,
      type: "session_created" as const,
      sessionId: row.sessionId,
      sessionTitle: row.sessionTitle,
      sessionCreatedAt: row.sessionCreatedAt,
      scoreTotal: row.scoreJson ? (row.scoreJson as any).totalScore || null : null,
      user: {
        id: row.userId,
        displayName: row.displayName,
        email: row.email,
      },
    }));
    
    // Build next cursor from last item
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem ? {
      createdAt: lastItem.sessionCreatedAt,
      id: lastItem.sessionId,
    } : null;
    
    return { items: feedItems, nextCursor };
  }

  // Admin: Duplicate Detection
  async findDuplicateEmails(): Promise<Array<{
    normalizedEmail: string;
    count: number;
    users: Array<{ id: string; email: string; createdAt: Date; isAdmin: boolean }>;
  }>> {
    // Find emails that appear more than once (case-insensitive)
    const duplicates = await db.execute(sql`
      SELECT LOWER(TRIM(email)) as normalized_email, COUNT(*) as cnt
      FROM users
      WHERE email IS NOT NULL
      GROUP BY LOWER(TRIM(email))
      HAVING COUNT(*) > 1
    `);
    
    const result = [];
    for (const row of duplicates.rows as any[]) {
      const normalizedEmail = row.normalized_email;
      const usersWithEmail = await db.select({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
        isAdmin: users.isAdmin,
      }).from(users)
        .where(sql`LOWER(TRIM(${users.email})) = ${normalizedEmail}`)
        .orderBy(asc(users.createdAt));
      
      result.push({
        normalizedEmail,
        count: Number(row.cnt),
        users: usersWithEmail.map(u => ({
          id: u.id,
          email: u.email || '',
          createdAt: u.createdAt,
          isAdmin: u.isAdmin || false,
        })),
      });
    }
    
    return result;
  }

  // Admin: Account Merge (transactional with conflict handling)
  async mergeUsers(primaryUserId: string, duplicateUserId: string): Promise<{
    success: boolean;
    message: string;
    reassignedSessions?: number;
    reassignedIdentities?: number;
    skippedIdentities?: number;
  }> {
    if (primaryUserId === duplicateUserId) {
      return { success: false, message: "Cannot merge a user with itself" };
    }
    
    const primary = await this.getUser(primaryUserId);
    const duplicate = await this.getUser(duplicateUserId);
    
    if (!primary) {
      return { success: false, message: "Primary user not found" };
    }
    if (!duplicate) {
      return { success: false, message: "Duplicate user not found" };
    }
    
    try {
      // Use a transaction to ensure atomicity
      const result = await db.transaction(async (tx) => {
        // Get identities for both users to check for conflicts
        const primaryIdentities = await tx.select().from(userIdentities)
          .where(eq(userIdentities.userId, primaryUserId));
        const duplicateIdentities = await tx.select().from(userIdentities)
          .where(eq(userIdentities.userId, duplicateUserId));
        
        const primaryProviders = new Set(primaryIdentities.map(i => i.provider));
        
        // Handle identity reassignment with conflict detection
        let reassignedIdentityCount = 0;
        let skippedIdentityCount = 0;
        
        for (const identity of duplicateIdentities) {
          if (primaryProviders.has(identity.provider)) {
            // Conflict: primary already has this provider - delete duplicate's identity
            await tx.delete(userIdentities)
              .where(eq(userIdentities.id, identity.id));
            skippedIdentityCount++;
          } else {
            // No conflict: reassign to primary
            await tx.update(userIdentities)
              .set({ userId: primaryUserId })
              .where(eq(userIdentities.id, identity.id));
            reassignedIdentityCount++;
          }
        }
        
        // Reassign sessions from duplicate to primary
        const sessionResult = await tx.update(sessions)
          .set({ userId: primaryUserId })
          .where(eq(sessions.userId, duplicateUserId))
          .returning({ id: sessions.id });
        
        // Update audit logs to point to primary user
        await tx.update(adminAuditLog)
          .set({ targetUserId: primaryUserId })
          .where(eq(adminAuditLog.targetUserId, duplicateUserId));
        
        // Copy any fields from duplicate that primary is missing
        const updates: Partial<User> = {};
        if (!primary.firstName && duplicate.firstName) updates.firstName = duplicate.firstName;
        if (!primary.lastName && duplicate.lastName) updates.lastName = duplicate.lastName;
        if (!primary.displayName && duplicate.displayName) updates.displayName = duplicate.displayName;
        if (!primary.emailConsentAt && duplicate.emailConsentAt) {
          updates.emailConsentAt = duplicate.emailConsentAt;
          updates.emailConsentIp = duplicate.emailConsentIp;
        }
        
        if (Object.keys(updates).length > 0) {
          await tx.update(users)
            .set(updates)
            .where(eq(users.id, primaryUserId));
        }
        
        // Soft-delete the duplicate user
        await tx.update(users)
          .set({
            isDisabled: true,
            disabledAt: new Date(),
            disabledReason: `Merged into user ${primaryUserId}`,
          })
          .where(eq(users.id, duplicateUserId));
        
        return {
          reassignedSessions: sessionResult.length,
          reassignedIdentities: reassignedIdentityCount,
          skippedIdentities: skippedIdentityCount,
        };
      });
      
      return {
        success: true,
        message: `Successfully merged user ${duplicateUserId} into ${primaryUserId}`,
        ...result,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Merge failed: ${err.message}`,
      };
    }
  }

  // Admin: Get session detail with user info for admin viewing
  async getSessionDetailForAdmin(sessionId: string): Promise<{
    session: Session;
    user: {
      id: string;
      displayName: string | null;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
    };
  } | undefined> {
    const result = await db.select({
      session: sessions,
      user: {
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId));
    
    if (result.length === 0) return undefined;
    
    return {
      session: result[0].session,
      user: result[0].user,
    };
  }

  async getAdminActivityFeed(options: {
    page: number;
    pageSize: number;
    actionType?: string;
    sinceMs?: number;
  }): Promise<{
    items: Array<{
      id: string;
      actionType: string;
      actionLabel: string;
      entityType: string | null;
      entityId: string | null;
      createdAt: Date;
      ip: string | null;
      userAgent: string | null;
      user: {
        id: string;
        displayName: string | null;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
      };
    }>;
    total: number;
  }> {
    const page = Math.max(1, options.page);
    const pageSize = Math.min(Math.max(1, options.pageSize), 100);
    const offset = (page - 1) * pageSize;

    const conditions: any[] = [];
    if (options.actionType) {
      conditions.push(eq(userActionLog.actionType, options.actionType as UserActionType));
    }
    if (options.sinceMs && options.sinceMs > 0) {
      const cutoff = new Date(Date.now() - options.sinceMs);
      conditions.push(gte(userActionLog.createdAt, cutoff));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ count: total }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userActionLog)
      .where(whereClause as any);

    const rows = await db
      .select({
        id: userActionLog.id,
        actionType: userActionLog.actionType,
        actionLabel: userActionLog.actionLabel,
        entityType: userActionLog.entityType,
        entityId: userActionLog.entityId,
        createdAt: userActionLog.createdAt,
        ip: userActionLog.ip,
        userAgent: userActionLog.userAgent,
        userId: users.id,
        displayName: users.displayName,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(userActionLog)
      .innerJoin(users, eq(userActionLog.userId, users.id))
      .where(whereClause as any)
      .orderBy(desc(userActionLog.createdAt), desc(userActionLog.id))
      .limit(pageSize)
      .offset(offset);

    const items = rows.map((r) => ({
      id: r.id,
      actionType: r.actionType as string,
      actionLabel: r.actionLabel,
      entityType: r.entityType,
      entityId: r.entityId,
      createdAt: r.createdAt,
      ip: r.ip,
      userAgent: r.userAgent,
      user: {
        id: r.userId,
        displayName: r.displayName,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
      },
    }));

    return { items, total: Number(total) || 0 };
  }

  // User Action Log
  async createUserActionLog(log: InsertUserActionLog): Promise<UserActionLog> {
    const [actionLog] = await db.insert(userActionLog).values(log as any).returning();
    return actionLog;
  }

  async getUserActionLogs(options: {
    userId: string;
    limit: number;
    cursor?: { createdAt: Date; id: string };
  }): Promise<{
    items: UserActionLog[];
    nextCursor: { createdAt: Date; id: string } | null;
  }> {
    const { userId, limit, cursor } = options;
    const fetchLimit = Math.min(limit, 100) + 1; // Fetch one extra to determine if there's more
    
    let conditions = [eq(userActionLog.userId, userId)];
    
    if (cursor) {
      // Use cursor-based pagination (older items)
      conditions.push(
        or(
          lt(userActionLog.createdAt, cursor.createdAt),
          and(
            eq(userActionLog.createdAt, cursor.createdAt),
            lt(userActionLog.id, cursor.id)
          )
        ) as any
      );
    }
    
    const results = await db.select()
      .from(userActionLog)
      .where(and(...conditions))
      .orderBy(desc(userActionLog.createdAt), desc(userActionLog.id))
      .limit(fetchLimit);
    
    const hasMore = results.length > Math.min(limit, 100);
    const items = results.slice(0, Math.min(limit, 100));
    
    let nextCursor: { createdAt: Date; id: string } | null = null;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      nextCursor = {
        createdAt: lastItem.createdAt,
        id: lastItem.id,
      };
    }
    
    return { items, nextCursor };
  }

  async deleteOldUserActionLogs(olderThanDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await db.delete(userActionLog).where(lt(userActionLog.createdAt, cutoff));
    return (result as any).rowCount ?? 0;
  }
  
  // Processing Metrics
  async createProcessingMetric(metric: InsertProcessingMetric): Promise<ProcessingMetric> {
    const [result] = await db.insert(processingMetrics).values(metric as any).returning();
    return result;
  }
  
  async getProcessingMetrics(sessionId: string): Promise<ProcessingMetric[]> {
    return await db.select()
      .from(processingMetrics)
      .where(eq(processingMetrics.sessionId, sessionId))
      .orderBy(asc(processingMetrics.startedAt));
  }
  
  // Session Folders
  async getFoldersByUser(userId: string): Promise<(SessionFolder & { sessionCount: number })[]> {
    const folders = await db.select()
      .from(sessionFolders)
      .where(eq(sessionFolders.userId, userId))
      .orderBy(asc(sessionFolders.sortOrder), asc(sessionFolders.createdAt));
    
    const foldersWithCount = await Promise.all(folders.map(async (folder) => {
      const [result] = await db.select({ count: count() })
        .from(sessions)
        .where(and(eq(sessions.userId, userId), eq(sessions.folderId, folder.id)));
      return { ...folder, sessionCount: result?.count || 0 };
    }));
    
    return foldersWithCount;
  }
  
  async createFolder(folder: InsertSessionFolder): Promise<SessionFolder> {
    const [result] = await db.insert(sessionFolders).values(folder).returning();
    return result;
  }
  
  async updateFolder(id: string, userId: string, updates: { name?: string }): Promise<SessionFolder | undefined> {
    const [result] = await db.update(sessionFolders)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(sessionFolders.id, id), eq(sessionFolders.userId, userId)))
      .returning();
    return result || undefined;
  }
  
  async deleteFolder(id: string, userId: string): Promise<boolean> {
    await db.update(sessions)
      .set({ folderId: null, updatedAt: new Date() })
      .where(and(eq(sessions.folderId, id), eq(sessions.userId, userId)));
    
    const [result] = await db.delete(sessionFolders)
      .where(and(eq(sessionFolders.id, id), eq(sessionFolders.userId, userId)))
      .returning();
    return !!result;
  }
  
  // Bulk Session Operations
  async moveSessions(sessionIds: string[], userId: string, folderId: string | null): Promise<number> {
    if (sessionIds.length === 0) return 0;
    
    const result = await db.update(sessions)
      .set({ folderId, updatedAt: new Date() })
      .where(and(
        eq(sessions.userId, userId),
        inArray(sessions.id, sessionIds)
      ))
      .returning({ id: sessions.id });
    
    return result.length;
  }
  
  async deleteSessions(sessionIds: string[], userId: string): Promise<{ deletedCount: number; deletedPaths: string[] }> {
    if (sessionIds.length === 0) return { deletedCount: 0, deletedPaths: [] };
    
    const sessionsToDelete = await db.select({
      id: sessions.id,
      videoPath: sessions.videoPath,
      thumbnailPath: sessions.thumbnailPath,
      previewVideoPath: sessions.previewVideoPath,
      originalUploadPath: sessions.originalUploadPath,
    })
      .from(sessions)
      .where(and(
        eq(sessions.userId, userId),
        inArray(sessions.id, sessionIds)
      ));
    
    const paths: string[] = [];
    for (const s of sessionsToDelete) {
      if (s.videoPath) paths.push(s.videoPath);
      if (s.thumbnailPath) paths.push(s.thumbnailPath);
      if (s.previewVideoPath && s.previewVideoPath !== 'failed') paths.push(s.previewVideoPath);
      if (s.originalUploadPath) paths.push(s.originalUploadPath);
    }
    
    const deleted = await db.delete(sessions)
      .where(and(
        eq(sessions.userId, userId),
        inArray(sessions.id, sessionIds)
      ))
      .returning({ id: sessions.id });
    
    return { deletedCount: deleted.length, deletedPaths: paths };
  }
  
  async getSessionsByFolder(userId: string, folderId: string | null): Promise<Session[]> {
    if (folderId === null) {
      return await db.select()
        .from(sessions)
        .where(and(eq(sessions.userId, userId), isNull(sessions.folderId)))
        .orderBy(desc(sessions.createdAt));
    }
    
    return await db.select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.folderId, folderId)))
      .orderBy(desc(sessions.createdAt));
  }
  
  // Topic Pulse Finder: Topic Runs
  async createTopicRun(run: InsertTopicRun): Promise<TopicRun> {
    const [result] = await db.insert(topicRuns).values(run as any).returning();
    return result;
  }
  
  async getTopicRun(id: string): Promise<TopicRun | undefined> {
    const [result] = await db.select().from(topicRuns).where(eq(topicRuns.id, id));
    return result || undefined;
  }
  
  async getTopicRunsByUser(userId: string, limit = 20, offset = 0): Promise<TopicRun[]> {
    return db.select().from(topicRuns)
      .where(eq(topicRuns.userId, userId))
      .orderBy(desc(topicRuns.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async countTopicRunsByUser(userId: string): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(topicRuns)
      .where(eq(topicRuns.userId, userId));
    return row?.count ?? 0;
  }
  
  async updateTopicRun(id: string, updates: Partial<TopicRun>): Promise<TopicRun | undefined> {
    const [result] = await db.update(topicRuns)
      .set(updates)
      .where(eq(topicRuns.id, id))
      .returning();
    return result || undefined;
  }
  
  async deleteTopicRun(id: string, userId: string): Promise<boolean> {
    const run = await this.getTopicRun(id);
    if (!run || run.userId !== userId) return false;
    
    // Only delete topics that are NOT saved - saved topics should remain
    const topicsInRun = await db.select({ id: topics.id }).from(topics).where(eq(topics.runId, id));
    for (const topic of topicsInRun) {
      const isSaved = await this.isSavedTopic(topic.id, userId);
      if (!isSaved) {
        await db.delete(topics).where(eq(topics.id, topic.id));
      }
    }
    
    const [result] = await db.delete(topicRuns)
      .where(and(eq(topicRuns.id, id), eq(topicRuns.userId, userId)))
      .returning();
    return !!result;
  }
  
  async deleteAllTopicRuns(userId: string): Promise<number> {
    const runs = await this.getTopicRunsByUser(userId, 1000);
    for (const run of runs) {
      // Only delete topics that are NOT saved - saved topics should remain
      const topicsInRun = await db.select({ id: topics.id }).from(topics).where(eq(topics.runId, run.id));
      for (const topic of topicsInRun) {
        const isSaved = await this.isSavedTopic(topic.id, userId);
        if (!isSaved) {
          await db.delete(topics).where(eq(topics.id, topic.id));
        }
      }
    }
    const result = await db.delete(topicRuns)
      .where(eq(topicRuns.userId, userId))
      .returning();
    return result.length;
  }
  
  // Topic Pulse Finder: Topics
  async createTopic(topic: InsertTopic): Promise<Topic> {
    const [result] = await db.insert(topics).values(topic as any).returning();
    return result;
  }
  
  async createTopics(topicsData: InsertTopic[]): Promise<Topic[]> {
    if (topicsData.length === 0) return [];
    return db.insert(topics).values(topicsData as any).returning();
  }
  
  async getTopic(id: string): Promise<Topic | undefined> {
    const [result] = await db.select().from(topics).where(eq(topics.id, id));
    return result || undefined;
  }
  
  async getTopicsByRun(runId: string): Promise<Topic[]> {
    return db.select().from(topics)
      .where(eq(topics.runId, runId))
      .orderBy(desc(topics.opportunityScore));
  }

  async updateTopicPlatformData(id: string, data: {
    pinterestVolume?: number | null;
    pinterestCpc?: number | null;
    pinterestCompetition?: number | null;
    pinterestTrendData?: any;
    youtubeVolume?: number | null;
    youtubeCpc?: number | null;
    youtubeCompetition?: number | null;
    youtubeTrendData?: any;
    tiktokVolume?: number | null;
    tiktokCpc?: number | null;
    tiktokCompetition?: number | null;
    tiktokTrendData?: any;
  }): Promise<Topic | undefined> {
    const [result] = await db.update(topics)
      .set({
        pinterestVolume: data.pinterestVolume,
        pinterestCpc: data.pinterestCpc,
        pinterestCompetition: data.pinterestCompetition,
        pinterestTrendData: data.pinterestTrendData,
        youtubeVolume: data.youtubeVolume,
        youtubeCpc: data.youtubeCpc,
        youtubeCompetition: data.youtubeCompetition,
        youtubeTrendData: data.youtubeTrendData,
        tiktokVolume: data.tiktokVolume,
        tiktokCpc: data.tiktokCpc,
        tiktokCompetition: data.tiktokCompetition,
        tiktokTrendData: data.tiktokTrendData,
      })
      .where(eq(topics.id, id))
      .returning();
    return result;
  }
  
  // Topic Pulse Finder: Saved Topics
  async saveTopicForUser(savedTopic: InsertSavedTopic): Promise<SavedTopic> {
    const [result] = await db.insert(savedTopics).values(savedTopic).returning();
    return result;
  }
  
  async getSavedTopicsByUser(userId: string): Promise<(SavedTopic & { topic: Topic })[]> {
    const results = await db.select()
      .from(savedTopics)
      .innerJoin(topics, eq(savedTopics.topicId, topics.id))
      .where(eq(savedTopics.userId, userId))
      .orderBy(desc(savedTopics.createdAt));
    
    return results.map(r => ({
      ...r.saved_topics,
      topic: r.topics
    }));
  }
  
  async deleteSavedTopic(id: string, userId: string): Promise<boolean> {
    const [result] = await db.delete(savedTopics)
      .where(and(eq(savedTopics.id, id), eq(savedTopics.userId, userId)))
      .returning();
    return !!result;
  }
  
  async isSavedTopic(topicId: string, userId: string): Promise<boolean> {
    const [result] = await db.select({ id: savedTopics.id })
      .from(savedTopics)
      .where(and(eq(savedTopics.topicId, topicId), eq(savedTopics.userId, userId)))
      .limit(1);
    return !!result;
  }

  async markSavedTopicComplete(id: string, userId: string): Promise<SavedTopic | undefined> {
    const [result] = await db.update(savedTopics)
      .set({ completedAt: new Date() })
      .where(and(eq(savedTopics.id, id), eq(savedTopics.userId, userId)))
      .returning();
    return result || undefined;
  }

  async resetSavedTopicComplete(id: string, userId: string): Promise<SavedTopic | undefined> {
    const [result] = await db.update(savedTopics)
      .set({ completedAt: null })
      .where(and(eq(savedTopics.id, id), eq(savedTopics.userId, userId)))
      .returning();
    return result || undefined;
  }
  
  // Topic Pulse Finder: Scripts
  async createScript(script: InsertScript): Promise<Script> {
    const [result] = await db.insert(scripts).values(script).returning();
    return result;
  }
  
  async getScript(id: string): Promise<(Script & { topic?: Topic }) | undefined> {
    const results = await db.select()
      .from(scripts)
      .leftJoin(topics, eq(scripts.topicId, topics.id))
      .where(eq(scripts.id, id));
    if (!results.length) return undefined;
    return {
      ...results[0].scripts,
      topic: results[0].topics || undefined
    };
  }
  
  async getScriptsByUser(userId: string): Promise<(Script & { topic?: Topic })[]> {
    const results = await db.select()
      .from(scripts)
      .leftJoin(topics, eq(scripts.topicId, topics.id))
      .where(eq(scripts.userId, userId))
      .orderBy(desc(scripts.createdAt));
    
    return results.map(r => ({
      ...r.scripts,
      topic: r.topics || undefined
    }));
  }
  
  async updateScript(id: string, userId: string, updates: Partial<Script>): Promise<Script | undefined> {
    const [result] = await db.update(scripts)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(scripts.id, id), eq(scripts.userId, userId)))
      .returning();
    return result || undefined;
  }
  
  async deleteScript(id: string, userId: string): Promise<boolean> {
    const [result] = await db.delete(scripts)
      .where(and(eq(scripts.id, id), eq(scripts.userId, userId)))
      .returning();
    return !!result;
  }

  // Standalone teleprompter scripts
  async getTeleprompterScriptsByUser(userId: string): Promise<TeleprompterScript[]> {
    return db.select().from(teleprompterScripts)
      .where(eq(teleprompterScripts.userId, userId))
      .orderBy(desc(teleprompterScripts.updatedAt));
  }

  async getTeleprompterScript(id: string, userId: string): Promise<TeleprompterScript | undefined> {
    const [result] = await db.select().from(teleprompterScripts)
      .where(and(eq(teleprompterScripts.id, id), eq(teleprompterScripts.userId, userId)));
    return result || undefined;
  }

  async createTeleprompterScript(userId: string, data: { title: string; content: string; bulletPoints?: string | null }): Promise<TeleprompterScript> {
    const [result] = await db.insert(teleprompterScripts)
      .values({ userId, title: data.title, content: data.content, bulletPoints: data.bulletPoints ?? null })
      .returning();
    return result;
  }

  async updateTeleprompterScript(id: string, userId: string, data: { title?: string; content?: string; bulletPoints?: string | null }): Promise<TeleprompterScript | undefined> {
    const updates: Partial<TeleprompterScript> = { updatedAt: new Date() };
    if (data.title !== undefined) updates.title = data.title;
    if (data.content !== undefined) updates.content = data.content;
    if (data.bulletPoints !== undefined) updates.bulletPoints = data.bulletPoints;
    const [result] = await db.update(teleprompterScripts)
      .set(updates)
      .where(and(eq(teleprompterScripts.id, id), eq(teleprompterScripts.userId, userId)))
      .returning();
    return result || undefined;
  }

  async incrementTeleprompterScriptTakeCount(id: string, userId: string): Promise<number> {
    const [result] = await db.update(teleprompterScripts)
      .set({ takeCount: sql`take_count + 1` })
      .where(and(eq(teleprompterScripts.id, id), eq(teleprompterScripts.userId, userId)))
      .returning({ takeCount: teleprompterScripts.takeCount });
    return result?.takeCount ?? 1;
  }

  async deleteTeleprompterScript(id: string, userId: string): Promise<boolean> {
    const [result] = await db.delete(teleprompterScripts)
      .where(and(eq(teleprompterScripts.id, id), eq(teleprompterScripts.userId, userId)))
      .returning();
    return !!result;
  }

  // Teleprompter Recordings
  async getTeleprompterRecordingsByUser(userId: string): Promise<TeleprompterRecording[]> {
    return db.select().from(teleprompterRecordings)
      .where(eq(teleprompterRecordings.userId, userId))
      .orderBy(desc(teleprompterRecordings.createdAt));
  }

  async getTeleprompterRecording(id: string, userId: string): Promise<TeleprompterRecording | undefined> {
    const [result] = await db.select().from(teleprompterRecordings)
      .where(and(eq(teleprompterRecordings.id, id), eq(teleprompterRecordings.userId, userId)));
    return result;
  }

  async createTeleprompterRecording(data: InsertTeleprompterRecording): Promise<TeleprompterRecording> {
    const [result] = await db.insert(teleprompterRecordings).values(data).returning();
    return result;
  }

  async updateTeleprompterRecording(id: string, userId: string, data: Partial<InsertTeleprompterRecording>): Promise<TeleprompterRecording | undefined> {
    const [result] = await db.update(teleprompterRecordings)
      .set(data)
      .where(and(eq(teleprompterRecordings.id, id), eq(teleprompterRecordings.userId, userId)))
      .returning();
    return result;
  }

  async deleteTeleprompterRecording(id: string, userId: string): Promise<boolean> {
    const [result] = await db.delete(teleprompterRecordings)
      .where(and(eq(teleprompterRecordings.id, id), eq(teleprompterRecordings.userId, userId)))
      .returning();
    return !!result;
  }

  async getTodayScoreUsage(userId: string): Promise<number> {
    const result = await db.execute(sql`
      SELECT count FROM teleprompter_score_usage
      WHERE user_id = ${userId} AND date = CURRENT_DATE
    `);
    return Number((result.rows[0] as any)?.count ?? 0);
  }

  async incrementScoreUsage(userId: string): Promise<number> {
    const result = await db.execute(sql`
      INSERT INTO teleprompter_score_usage (user_id, date, count)
      VALUES (${userId}, CURRENT_DATE, 1)
      ON CONFLICT (user_id, date) DO UPDATE SET count = teleprompter_score_usage.count + 1
      RETURNING count
    `);
    return Number((result.rows[0] as any)?.count ?? 1);
  }

  async deleteExpiredTeleprompterRecordings(): Promise<TeleprompterRecording[]> {
    return db.delete(teleprompterRecordings)
      .where(lt(teleprompterRecordings.expiresAt, new Date()))
      .returning();
  }

  // Topic Pulse Finder: Link Placeholders
  async createLinkPlaceholder(link: InsertLinkPlaceholder): Promise<LinkPlaceholder> {
    const [result] = await db.insert(linkPlaceholders).values(link).returning();
    return result;
  }
  
  async getLinkPlaceholdersByUser(userId: string): Promise<LinkPlaceholder[]> {
    return db.select().from(linkPlaceholders)
      .where(eq(linkPlaceholders.userId, userId))
      .orderBy(desc(linkPlaceholders.createdAt));
  }
  
  async updateLinkPlaceholder(id: string, userId: string, updates: { label?: string; url?: string }): Promise<LinkPlaceholder | undefined> {
    const [result] = await db.update(linkPlaceholders)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(linkPlaceholders.id, id), eq(linkPlaceholders.userId, userId)))
      .returning();
    return result || undefined;
  }
  
  async deleteLinkPlaceholder(id: string, userId: string): Promise<boolean> {
    const [result] = await db.delete(linkPlaceholders)
      .where(and(eq(linkPlaceholders.id, id), eq(linkPlaceholders.userId, userId)))
      .returning();
    return !!result;
  }
  
  // User API Keys (encrypted)
  async getUserApiKey(userId: string, provider: ApiKeyProvider): Promise<UserApiKey | undefined> {
    const [result] = await db.select().from(userApiKeys)
      .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));
    return result || undefined;
  }
  
  async setUserApiKey(userId: string, provider: ApiKeyProvider, plainKey: string): Promise<UserApiKey> {
    const encryptedKey = encryptApiKey(plainKey);
    const keyLastFour = plainKey.slice(-4);
    
    const existing = await this.getUserApiKey(userId, provider);
    if (existing) {
      const [result] = await db.update(userApiKeys)
        .set({ encryptedKey, keyLastFour, updatedAt: new Date() })
        .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)))
        .returning();
      return result;
    }
    
    const [result] = await db.insert(userApiKeys).values({
      userId,
      provider,
      encryptedKey,
      keyLastFour,
    }).returning();
    return result;
  }
  
  async deleteUserApiKey(userId: string, provider: ApiKeyProvider): Promise<boolean> {
    const [result] = await db.delete(userApiKeys)
      .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)))
      .returning();
    return !!result;
  }
  
  async getDecryptedUserApiKey(userId: string, provider: ApiKeyProvider): Promise<string | null> {
    const apiKey = await this.getUserApiKey(userId, provider);
    if (!apiKey || !apiKey.encryptedKey) return null;
    
    try {
      const parts = apiKey.encryptedKey.split(':');
      if (parts.length !== 3) {
        console.error('Malformed encrypted API key format');
        return null;
      }
      return decryptApiKey(apiKey.encryptedKey);
    } catch (e) {
      console.error('Failed to decrypt API key:', e);
      return null;
    }
  }
  
  // Video Trends Credits
  private readonly MONTHLY_CREDITS_LIMIT = 1000;
  private readonly CREDITS_WINDOW_DAYS = 30;
  
  async getVideoTrendsCredits(userId: string): Promise<{ creditsUsed: number; totalCreditsUsed: number; monthlyLimit: number; windowStartedAt: Date; remaining: number; resetsAt: Date }> {
    const [record] = await db.select().from(videoTrendsCredits).where(eq(videoTrendsCredits.userId, userId));
    
    const now = new Date();
    
    if (!record) {
      const windowStartedAt = now;
      const resetsAt = new Date(windowStartedAt.getTime() + this.CREDITS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const limit = await this.getMonthlyCreditsLimit();
      return {
        creditsUsed: 0,
        totalCreditsUsed: 0,
        monthlyLimit: limit,
        windowStartedAt,
        remaining: limit,
        resetsAt,
      };
    }
    
    const windowEnd = new Date(record.windowStartedAt.getTime() + this.CREDITS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    
    if (now >= windowEnd) {
      await db.update(videoTrendsCredits)
        .set({ creditsUsed: 0, windowStartedAt: now, updatedAt: now })
        .where(eq(videoTrendsCredits.userId, userId));
      const resetsAt = new Date(now.getTime() + this.CREDITS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      return {
        creditsUsed: 0,
        totalCreditsUsed: record.totalCreditsUsed || 0,
        monthlyLimit: record.monthlyLimit,
        windowStartedAt: now,
        remaining: record.monthlyLimit,
        resetsAt,
      };
    }
    
    return {
      creditsUsed: record.creditsUsed,
      totalCreditsUsed: record.totalCreditsUsed || 0,
      monthlyLimit: record.monthlyLimit,
      windowStartedAt: record.windowStartedAt,
      remaining: Math.max(0, record.monthlyLimit - record.creditsUsed),
      resetsAt: windowEnd,
    };
  }
  
  async useVideoTrendsCredits(userId: string, amount: number): Promise<{ success: boolean; remaining: number; error?: string }> {
    const credits = await this.getVideoTrendsCredits(userId);
    
    if (credits.remaining < amount) {
      return { success: false, remaining: credits.remaining, error: "Insufficient credits" };
    }
    
    const now = new Date();
    const newCreditsUsed = credits.creditsUsed + amount;
    
    const [existing] = await db.select().from(videoTrendsCredits).where(eq(videoTrendsCredits.userId, userId));
    
    if (!existing) {
      const limit = await this.getMonthlyCreditsLimit();
      await db.insert(videoTrendsCredits).values({
        userId,
        creditsUsed: amount,
        totalCreditsUsed: amount,
        monthlyLimit: limit,
        windowStartedAt: now,
      });
    } else {
      await db.update(videoTrendsCredits)
        .set({ 
          creditsUsed: newCreditsUsed, 
          totalCreditsUsed: (existing.totalCreditsUsed || 0) + amount,
          updatedAt: now 
        })
        .where(eq(videoTrendsCredits.userId, userId));
    }
    
    return { success: true, remaining: credits.monthlyLimit - newCreditsUsed };
  }

  async reserveVideoTrendsCredits(userId: string, amount: number): Promise<{ success: boolean; reserved: number; remaining: number; error?: string }> {
    if (amount <= 0) {
      return { success: true, reserved: 0, remaining: 0 };
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const limit = await this.getMonthlyCreditsLimit();
      const windowDays = this.CREDITS_WINDOW_DAYS;
      // Upsert the record so future steps always find a row.
      await client.query(
        `INSERT INTO video_trends_credits (user_id, credits_used, total_credits_used, monthly_limit, window_started_at, updated_at)
         VALUES ($1, 0, 0, $2, NOW(), NOW())
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, limit]
      );
      // Reset credits_used if the billing window has expired so the reservation
      // works correctly regardless of whether the caller pre-fetched credit state.
      await client.query(
        `UPDATE video_trends_credits
         SET credits_used = 0,
             window_started_at = NOW(),
             updated_at = NOW()
         WHERE user_id = $1
           AND window_started_at < NOW() - ($2 || ' days')::interval`,
        [userId, windowDays]
      );
      // Atomically increment credits_used only when sufficient budget remains.
      const result = await client.query(
        `UPDATE video_trends_credits
         SET credits_used = credits_used + $2,
             total_credits_used = total_credits_used + $2,
             updated_at = NOW()
         WHERE user_id = $1
           AND monthly_limit - credits_used >= $2
         RETURNING credits_used, monthly_limit`,
        [userId, amount]
      );
      await client.query("COMMIT");
      if (result.rowCount && result.rowCount > 0) {
        const row = result.rows[0];
        return { success: true, reserved: amount, remaining: row.monthly_limit - row.credits_used };
      }
      return { success: false, reserved: 0, remaining: 0, error: "Insufficient credits" };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async refundVideoTrendsCredits(userId: string, amount: number): Promise<void> {
    if (amount <= 0) return;
    const now = new Date();
    await db.update(videoTrendsCredits)
      .set({
        creditsUsed: sql`GREATEST(0, credits_used - ${amount})`,
        totalCreditsUsed: sql`GREATEST(0, total_credits_used - ${amount})`,
        updatedAt: now,
      })
      .where(eq(videoTrendsCredits.userId, userId));
  }

  async getAggregateVideoTrendsCredits(): Promise<{ totalCreditsUsedAllTime: number; totalCreditsUsedThisMonth: number; activeUsers: number; topUsers: Array<{ userId: string; email: string | null; displayName: string | null; creditsThisMonth: number; creditsTotal: number }> }> {
    const now = new Date();
    const windowDays = this.CREDITS_WINDOW_DAYS;
    
    // Get all credits records with user info
    const records = await db
      .select({
        userId: videoTrendsCredits.userId,
        creditsUsed: videoTrendsCredits.creditsUsed,
        totalCreditsUsed: videoTrendsCredits.totalCreditsUsed,
        windowStartedAt: videoTrendsCredits.windowStartedAt,
        email: users.email,
        displayName: users.displayName,
      })
      .from(videoTrendsCredits)
      .leftJoin(users, eq(videoTrendsCredits.userId, users.id));
    
    let totalCreditsUsedAllTime = 0;
    let totalCreditsUsedThisMonth = 0;
    let activeUsers = 0;
    
    const usersWithCredits: Array<{ userId: string; email: string | null; displayName: string | null; creditsThisMonth: number; creditsTotal: number }> = [];
    
    for (const record of records) {
      const totalUsed = record.totalCreditsUsed || 0;
      totalCreditsUsedAllTime += totalUsed;
      
      // Check if within current window
      const windowEnd = new Date(record.windowStartedAt.getTime() + windowDays * 24 * 60 * 60 * 1000);
      const isCurrentWindow = now < windowEnd;
      const monthlyUsed = isCurrentWindow ? record.creditsUsed : 0;
      
      totalCreditsUsedThisMonth += monthlyUsed;
      
      if (monthlyUsed > 0) {
        activeUsers++;
      }
      
      usersWithCredits.push({
        userId: record.userId,
        email: record.email,
        displayName: record.displayName,
        creditsThisMonth: monthlyUsed,
        creditsTotal: totalUsed,
      });
    }
    
    // Sort by total credits and get top 10
    const topUsers = usersWithCredits
      .sort((a, b) => b.creditsTotal - a.creditsTotal)
      .slice(0, 10);
    
    return {
      totalCreditsUsedAllTime,
      totalCreditsUsedThisMonth,
      activeUsers,
      topUsers,
    };
  }
  
  // Saved Offers (Call To Action)
  async getSavedOffersByUser(userId: string): Promise<SavedOffer[]> {
    return db.select().from(savedOffers)
      .where(eq(savedOffers.userId, userId))
      .orderBy(desc(savedOffers.isDefault), desc(savedOffers.createdAt));
  }
  
  async createSavedOffer(offer: InsertSavedOffer): Promise<SavedOffer> {
    const [created] = await db.insert(savedOffers).values(offer).returning();
    return created;
  }
  
  async updateSavedOffer(id: string, userId: string, updates: Partial<SavedOffer>): Promise<SavedOffer | undefined> {
    const [updated] = await db.update(savedOffers)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(savedOffers.id, id), eq(savedOffers.userId, userId)))
      .returning();
    return updated || undefined;
  }
  
  async deleteSavedOffer(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(savedOffers)
      .where(and(eq(savedOffers.id, id), eq(savedOffers.userId, userId)))
      .returning();
    return result.length > 0;
  }
  
  async setDefaultOffer(id: string, userId: string): Promise<SavedOffer | undefined> {
    // First clear all defaults for this user
    await db.update(savedOffers)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(savedOffers.userId, userId));
    
    // Then set the new default
    const [updated] = await db.update(savedOffers)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(and(eq(savedOffers.id, id), eq(savedOffers.userId, userId)))
      .returning();
    return updated || undefined;
  }

  // App Settings
  async getMonthlyCreditsLimit(): Promise<number> {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "monthly_credits_limit"));
    if (row) {
      const parsed = parseInt(row.value, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return this.MONTHLY_CREDITS_LIMIT;
  }

  async setMonthlyCreditsLimit(limit: number): Promise<void> {
    const now = new Date();
    await db.insert(appSettings)
      .values({ key: "monthly_credits_limit", value: String(limit), updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: String(limit), updatedAt: now } });
    await db.update(videoTrendsCredits).set({ monthlyLimit: limit, updatedAt: now });
  }

  async getApiAccessEnabled(): Promise<boolean> {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "api_access_enabled"));
    return row?.value === "true";
  }

  async setApiAccessEnabled(enabled: boolean): Promise<void> {
    const now = new Date();
    await db.insert(appSettings)
      .values({ key: "api_access_enabled", value: enabled ? "true" : "false", updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: enabled ? "true" : "false", updatedAt: now } });
  }

  async getEmailSenderSettings(): Promise<{ fromName: string; fromEmail: string }> {
    const rows = await db.select().from(appSettings)
      .where(sql`${appSettings.key} IN ('email_from_name', 'email_from_email')`);
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    return {
      fromName:  map["email_from_name"]  || "Fearless Marketing Lab",
      fromEmail: map["email_from_email"] || "notifications@fearlesspromo.com",
    };
  }

  async setEmailSenderSettings(fromName: string, fromEmail: string): Promise<void> {
    const now = new Date();
    await Promise.all([
      db.insert(appSettings)
        .values({ key: "email_from_name", value: fromName, updatedAt: now })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: fromName, updatedAt: now } }),
      db.insert(appSettings)
        .values({ key: "email_from_email", value: fromEmail, updatedAt: now })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: fromEmail, updatedAt: now } }),
    ]);
  }

  // Public API Keys
  async getUserPublicApiKey(userId: string): Promise<PublicApiKey | undefined> {
    const [row] = await db.select().from(publicApiKeys).where(eq(publicApiKeys.userId, userId));
    return row || undefined;
  }

  async generateUserPublicApiKey(userId: string, label?: string): Promise<{ rawKey: string; record: PublicApiKey }> {
    const { createHash, randomBytes } = await import("crypto");
    const rawKey = "ftk_" + randomBytes(32).toString("hex");
    const keyHash = createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 12);
    // Revoke any existing key first
    await db.delete(publicApiKeys).where(eq(publicApiKeys.userId, userId));
    const [record] = await db.insert(publicApiKeys)
      .values({ userId, keyHash, keyPrefix, label: label || null })
      .returning();
    return { rawKey, record };
  }

  async revokeUserPublicApiKey(userId: string): Promise<void> {
    await db.delete(publicApiKeys).where(eq(publicApiKeys.userId, userId));
  }

  async getUserByPublicApiKeyHash(keyHash: string): Promise<User | undefined> {
    const [row] = await db
      .select({ user: users })
      .from(publicApiKeys)
      .innerJoin(users, eq(users.id, publicApiKeys.userId))
      .where(eq(publicApiKeys.keyHash, keyHash));
    return row?.user || undefined;
  }

  async touchPublicApiKey(keyHash: string, cfChecked = false): Promise<void> {
    const now = new Date();
    const updates: Partial<typeof publicApiKeys.$inferSelect> = { lastUsedAt: now };
    if (cfChecked) updates.cfLastCheckedAt = now;
    await db.update(publicApiKeys).set(updates).where(eq(publicApiKeys.keyHash, keyHash));
  }

  // Webhooks
  async getWebhooksForUser(userId: string): Promise<Webhook[]> {
    return db.select().from(webhooks).where(eq(webhooks.userId, userId)).orderBy(desc(webhooks.createdAt));
  }

  async createWebhook(userId: string, data: { url: string; label?: string; events?: string[] }): Promise<{ webhook: Webhook; secret: string }> {
    const secret = crypto.randomBytes(24).toString("hex");
    const events = data.events && data.events.length > 0 ? data.events : ["*"];
    const [webhook] = await db.insert(webhooks).values({
      userId,
      url: data.url,
      secret,
      label: data.label || null,
      events,
      active: true,
    }).returning();
    return { webhook, secret };
  }

  async updateWebhook(id: string, userId: string, data: { active?: boolean; label?: string; events?: string[] }): Promise<Webhook | undefined> {
    const updates: Partial<typeof webhooks.$inferSelect> = {};
    if (data.active !== undefined) updates.active = data.active;
    if (data.label !== undefined) updates.label = data.label;
    if (data.events !== undefined) updates.events = data.events;
    const [row] = await db.update(webhooks).set(updates)
      .where(and(eq(webhooks.id, id), eq(webhooks.userId, userId))).returning();
    return row || undefined;
  }

  async deleteWebhook(id: string, userId: string): Promise<void> {
    await db.delete(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)));
  }

  // DMO Tracker
  async getDmoEntry(userId: string, date: string): Promise<DmoEntry | undefined> {
    const [row] = await db.select().from(dmoEntries)
      .where(and(eq(dmoEntries.userId, userId), eq(dmoEntries.date, date)));
    return row || undefined;
  }

  async upsertDmoEntry(userId: string, date: string, data: DmoEntryData): Promise<DmoEntry> {
    const now = new Date();
    const existing = await this.getDmoEntry(userId, date);
    let entry: DmoEntry;
    if (existing) {
      const [updated] = await db.update(dmoEntries)
        .set({ ...data, updatedAt: now })
        .where(and(eq(dmoEntries.userId, userId), eq(dmoEntries.date, date)))
        .returning();
      entry = updated;
    } else {
      const [created] = await db.insert(dmoEntries)
        .values({ userId, date, ...data, createdAt: now, updatedAt: now })
        .returning();
      entry = created;
    }
    // Recompute and persist the streak aggregate so the caller's immediate
    // getDmoStreak read sees a fresh value.  Must be awaited here.
    await this.recomputeAndStoreDmoStreak(userId);
    return entry;
  }

  /**
   * Recomputes the streak aggregate for a user and stores it in dmo_settings.
   * Called after every DMO entry save so getDmoStreak() can serve cached values.
   */
  async recomputeAndStoreDmoStreak(userId: string): Promise<void> {
    // Record the timestamp before querying so the staleness guard in
    // _storeDmoStreakCache correctly orders concurrent recomputes.
    const computedAt = new Date();

    const user = await this.getUser(userId);
    const tz = safeTimezone(user?.timezone);
    const today = todayKeyInTz(tz);
    const yesterday = addDaysToKey(today, -1);

    // totalDays: fast indexed COUNT
    const [{ total }] = await db
      .select({ total: count() })
      .from(dmoEntries)
      .where(and(
        eq(dmoEntries.userId, userId),
        sql`(${dmoEntries.visionMeditation} OR ${dmoEntries.personalDevelopment} OR ${dmoEntries.expandSkills} OR ${dmoEntries.execution} OR ${dmoEntries.connecting})`
      ));
    const totalDays = Number(total);

    if (totalDays === 0) {
      await this._storeDmoStreakCache(userId, { current: 0, best: 0, totalDays: 0, lastActiveDate: null }, computedAt);
      return;
    }

    // Fetch all qualifying dates (ordered desc) to compute current + best streak.
    // This is still O(history) but only happens on writes, not on every page read.
    const rows = await db
      .select({ date: dmoEntries.date })
      .from(dmoEntries)
      .where(and(
        eq(dmoEntries.userId, userId),
        sql`(${dmoEntries.visionMeditation} OR ${dmoEntries.personalDevelopment} OR ${dmoEntries.expandSkills} OR ${dmoEntries.execution} OR ${dmoEntries.connecting})`
      ))
      .orderBy(desc(dmoEntries.date));

    const dates = rows.map(r => r.date); // already sorted desc

    // Current streak: walk back from today
    let current = 0;
    const startDate = dates[0] === today || dates[0] === yesterday ? dates[0] : null;
    if (startDate) {
      const dateSet = new Set(dates);
      let cursor = startDate;
      while (dateSet.has(cursor)) {
        current++;
        cursor = addDaysToKey(cursor, -1);
      }
    }

    // Best streak: single pass over sorted dates
    let best = 0;
    let run = 1;
    for (let i = 1; i < dates.length; i++) {
      const diff = (new Date(dates[i - 1]).getTime() - new Date(dates[i]).getTime()) / 86400000;
      if (Math.round(diff) === 1) {
        run++;
        if (run > best) best = run;
      } else {
        run = 1;
      }
    }
    best = Math.max(best, current, 1);

    await this._storeDmoStreakCache(userId, {
      current,
      best,
      totalDays,
      lastActiveDate: dates[0] ?? null,
    }, computedAt);
  }

  private async _storeDmoStreakCache(
    userId: string,
    streak: { current: number; best: number; totalDays: number; lastActiveDate: string | null },
    computedAt: Date
  ): Promise<void> {
    const defaults = { userId, visionTarget: 30, personalTarget: 30, expandTarget: 60, executionTarget: 60, connectingTarget: 60 };
    const cacheFields = {
      streakCurrent: streak.current,
      streakBest: streak.best,
      streakTotalDays: streak.totalDays,
      streakLastActiveDate: streak.lastActiveDate,
      streakUpdatedAt: computedAt,
    };
    // INSERT … ON CONFLICT: only overwrite an existing cache row when our snapshot
    // is newer than what is already stored, preventing a slow concurrent recompute
    // from clobbering a more-recent result.
    await db
      .insert(dmoSettings)
      .values({ ...defaults, ...cacheFields })
      .onConflictDoUpdate({
        target: dmoSettings.userId,
        set: {
          ...cacheFields,
          // The WHERE clause on onConflictDoUpdate is not yet supported by all
          // Drizzle versions, so we fall back to a raw SQL conditional expression
          // embedded in the SET clause using CASE to act as a no-op when stale.
          streakCurrent: sql`CASE WHEN dmo_settings.streak_updated_at IS NULL OR dmo_settings.streak_updated_at <= ${computedAt} THEN ${streak.current} ELSE dmo_settings.streak_current END`,
          streakBest: sql`CASE WHEN dmo_settings.streak_updated_at IS NULL OR dmo_settings.streak_updated_at <= ${computedAt} THEN ${streak.best} ELSE dmo_settings.streak_best END`,
          streakTotalDays: sql`CASE WHEN dmo_settings.streak_updated_at IS NULL OR dmo_settings.streak_updated_at <= ${computedAt} THEN ${streak.totalDays} ELSE dmo_settings.streak_total_days END`,
          streakLastActiveDate: sql`CASE WHEN dmo_settings.streak_updated_at IS NULL OR dmo_settings.streak_updated_at <= ${computedAt} THEN ${streak.lastActiveDate} ELSE dmo_settings.streak_last_active_date END`,
          streakUpdatedAt: sql`CASE WHEN dmo_settings.streak_updated_at IS NULL OR dmo_settings.streak_updated_at <= ${computedAt} THEN ${computedAt} ELSE dmo_settings.streak_updated_at END`,
        },
      });
  }

  async updateDmoNotes(userId: string, date: string, notes: string): Promise<DmoEntry | null> {
    const [updated] = await db.update(dmoEntries)
      .set({ notes: notes.trim(), updatedAt: new Date() })
      .where(and(eq(dmoEntries.userId, userId), eq(dmoEntries.date, date)))
      .returning();
    return updated ?? null;
  }

  async getDmoEntries(userId: string, limit: number = 60): Promise<DmoEntry[]> {
    return db.select().from(dmoEntries)
      .where(eq(dmoEntries.userId, userId))
      .orderBy(desc(dmoEntries.date))
      .limit(limit);
  }

  async getDmoStreak(userId: string): Promise<{ current: number; best: number; totalDays: number }> {
    // Read from the pre-computed aggregate stored in dmo_settings (O(1) PK lookup).
    // If the cache is not yet populated (first call for a legacy user), fall back
    // to a full recompute and persist the result for future reads.
    const rows = await db
      .select({
        streakCurrent: dmoSettings.streakCurrent,
        streakBest: dmoSettings.streakBest,
        streakTotalDays: dmoSettings.streakTotalDays,
        streakLastActiveDate: dmoSettings.streakLastActiveDate,
        streakUpdatedAt: dmoSettings.streakUpdatedAt,
      })
      .from(dmoSettings)
      .where(eq(dmoSettings.userId, userId));

    const cached = rows[0];

    // Cache hit: streakUpdatedAt is set, meaning the aggregate has been written at least once.
    if (cached?.streakUpdatedAt !== null && cached?.streakUpdatedAt !== undefined) {
      // The cache stores the streak relative to the date it was last saved.
      // If the most recent active date is today or yesterday (user's tz), the
      // cached current streak is still valid.  Otherwise the streak has lapsed
      // to 0 since the cache was written (a new day passed without a DMO).
      const user = await this.getUser(userId);
      const tz = safeTimezone(user?.timezone);
      const today = todayKeyInTz(tz);
      const yesterday = addDaysToKey(today, -1);
      const lastActive = cached.streakLastActiveDate;
      const currentStreak =
        lastActive === today || lastActive === yesterday
          ? (cached.streakCurrent ?? 0)
          : 0;

      return {
        current: currentStreak,
        best: cached.streakBest ?? 0,
        totalDays: cached.streakTotalDays ?? 0,
      };
    }

    // Cache miss (legacy user without a cache yet): compute and store, then return.
    await this.recomputeAndStoreDmoStreak(userId);
    // Re-read the freshly written values.
    const fresh = await db
      .select({
        streakCurrent: dmoSettings.streakCurrent,
        streakBest: dmoSettings.streakBest,
        streakTotalDays: dmoSettings.streakTotalDays,
        streakLastActiveDate: dmoSettings.streakLastActiveDate,
      })
      .from(dmoSettings)
      .where(eq(dmoSettings.userId, userId));
    const f = fresh[0];
    if (!f) return { current: 0, best: 0, totalDays: 0 };

    const user2 = await this.getUser(userId);
    const tz2 = safeTimezone(user2?.timezone);
    const today2 = todayKeyInTz(tz2);
    const yesterday2 = addDaysToKey(today2, -1);
    const lastActive2 = f.streakLastActiveDate;
    const currentStreak2 =
      lastActive2 === today2 || lastActive2 === yesterday2
        ? (f.streakCurrent ?? 0)
        : 0;

    return {
      current: currentStreak2,
      best: f.streakBest ?? 0,
      totalDays: f.streakTotalDays ?? 0,
    };
  }

  async getDmoSummary(userId: string, period: string) {
    const result = await pool.query(
      `SELECT summary, tips, mood_score, performance_score, generated_at
       FROM dmo_summaries WHERE user_id = $1 AND period = $2 LIMIT 1`,
      [userId, period]
    );
    if (!result.rows.length) return null;
    const row = result.rows[0] as { summary: string; tips: string[]; mood_score: string | null; performance_score: string | null; generated_at: Date };
    return {
      summary: row.summary,
      tips: row.tips || [],
      moodScore: row.mood_score ? parseFloat(row.mood_score) : null,
      performanceScore: row.performance_score ? parseFloat(row.performance_score) : null,
      generatedAt: row.generated_at,
    };
  }

  async upsertDmoSummary(userId: string, period: string, periodType: string, summary: string, tips: string[], moodScore: number | null, performanceScore: number | null) {
    await pool.query(
      `INSERT INTO dmo_summaries (user_id, period, period_type, summary, tips, mood_score, performance_score, generated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id, period) DO UPDATE SET
         summary = EXCLUDED.summary,
         tips = EXCLUDED.tips,
         mood_score = EXCLUDED.mood_score,
         performance_score = EXCLUDED.performance_score,
         generated_at = NOW()`,
      [userId, period, periodType, summary, tips, moodScore, performanceScore]
    );
  }

  async getDmoSettings(userId: string): Promise<DmoSettings> {
    const rows = await db.select().from(dmoSettings).where(eq(dmoSettings.userId, userId));
    if (rows.length > 0) return rows[0];
    return { userId, visionTarget: 30, personalTarget: 30, expandTarget: 60, executionTarget: 60, connectingTarget: 60 };
  }

  async upsertDmoSettings(userId: string, data: Partial<Omit<DmoSettings, 'userId'>>): Promise<DmoSettings> {
    // Strip undefined values so we never accidentally clear or null-out fields
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined && v !== null)
    ) as Partial<Omit<DmoSettings, 'userId'>>;

    const [row] = await db
      .insert(dmoSettings)
      .values({
        userId,
        visionTarget: 30,
        personalTarget: 30,
        expandTarget: 60,
        executionTarget: 60,
        connectingTarget: 60,
        ...cleanData,
      })
      .onConflictDoUpdate({
        target: dmoSettings.userId,
        set: cleanData,
      })
      .returning();
    return row;
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  async getProjectsForUser(userId: string): Promise<ProjectWithCounts[]> {
    const user = await this.getUser(userId);
    const tz = safeTimezone(user?.timezone);
    const rows = await db.execute(sql`
      SELECT
        p.*,
        COALESCE(t.total, 0)::int           AS total_tasks,
        COALESCE(t.open_count, 0)::int      AS open_tasks,
        COALESCE(t.done_count, 0)::int      AS done_tasks,
        COALESCE(t.due_week, 0)::int        AS due_this_week,
        COALESCE(t.last_activity, p.updated_at) AS last_activity_at
      FROM projects p
      LEFT JOIN (
        SELECT project_id,
          COUNT(*)                                                  AS total,
          COUNT(*) FILTER (WHERE status <> 'done')                  AS open_count,
          COUNT(*) FILTER (WHERE status = 'done')                   AS done_count,
          COUNT(*) FILTER (
            WHERE status <> 'done'
              AND due_date IS NOT NULL
              AND (due_date AT TIME ZONE ${tz})::date
                <= ((NOW() AT TIME ZONE ${tz})::date + INTERVAL '7 days')
          ) AS due_week,
          MAX(updated_at) AS last_activity
        FROM project_tasks
        WHERE user_id = ${userId}
        GROUP BY project_id
      ) t ON t.project_id = p.id
      WHERE p.user_id = ${userId}
      ORDER BY (p.status = 'archived') ASC, p.sort_order ASC, p.created_at DESC
    `);
    return rows.rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      description: r.description ?? "",
      color: r.color,
      status: r.status,
      dueDate: r.due_date ? new Date(r.due_date) : null,
      sortOrder: r.sort_order,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
      totalTasks: r.total_tasks,
      openTasks: r.open_tasks,
      doneTasks: r.done_tasks,
      dueThisWeek: r.due_this_week,
      lastActivityAt: r.last_activity_at ? new Date(r.last_activity_at) : null,
    }));
  }

  async getProject(id: string, userId: string): Promise<Project | undefined> {
    const [row] = await db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));
    return row || undefined;
  }

  async createProject(userId: string, data: InsertProject): Promise<Project> {
    const [created] = await db.insert(projects).values({
      userId,
      name: data.name,
      description: data.description ?? "",
      color: data.color ?? "#6366f1",
      status: data.status ?? "active",
      dueDate: data.dueDate ?? null,
      sortOrder: data.sortOrder ?? 0,
    }).returning();
    return created;
  }

  async updateProject(id: string, userId: string, data: Partial<InsertProject>): Promise<Project | undefined> {
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) update.name = data.name;
    if (data.description !== undefined) update.description = data.description;
    if (data.color !== undefined) update.color = data.color;
    if (data.status !== undefined) update.status = data.status;
    if (data.dueDate !== undefined) update.dueDate = data.dueDate;
    if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
    const [updated] = await db.update(projects)
      .set(update)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteProject(id: string, userId: string): Promise<void> {
    await db.delete(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  }

  async getTasksForProject(projectId: string, userId: string): Promise<ProjectTask[]> {
    return db.select().from(projectTasks)
      .where(and(eq(projectTasks.projectId, projectId), eq(projectTasks.userId, userId)))
      .orderBy(asc(projectTasks.sortOrder), asc(projectTasks.createdAt));
  }

  async getTask(id: string, userId: string): Promise<ProjectTask | undefined> {
    const [row] = await db.select().from(projectTasks)
      .where(and(eq(projectTasks.id, id), eq(projectTasks.userId, userId)));
    return row || undefined;
  }

  private async logTaskActivity(taskId: string, userId: string, type: string, meta: Record<string, unknown> = {}) {
    try {
      await db.insert(taskActivity).values({ taskId, userId, type, meta });
    } catch (err) {
      console.error("[projects] failed to log task activity:", err);
    }
  }

  async createTask(userId: string, projectId: string, data: InsertProjectTask): Promise<ProjectTask> {
    // If parentTaskId provided, validate it belongs to same project & user, and is itself top-level (one level deep)
    let parentTaskId: string | null = null;
    if (data.parentTaskId) {
      const parent = await this.getTask(data.parentTaskId, userId);
      if (!parent || parent.projectId !== projectId) {
        throw new Error("Invalid parent task");
      }
      if (parent.parentTaskId) {
        throw new Error("Subtasks cannot have subtasks");
      }
      parentTaskId = parent.id;
    }
    const [created] = await db.insert(projectTasks).values({
      userId,
      projectId,
      parentTaskId,
      columnId: data.columnId ?? null,
      title: data.title,
      notes: data.notes ?? "",
      status: data.status ?? "todo",
      priority: data.priority ?? "none",
      dueDate: data.dueDate ?? null,
      tags: data.tags ?? [],
      links: data.links ?? [],
      sortOrder: data.sortOrder ?? 0,
      completedAt: data.status === "done" ? new Date() : null,
    }).returning();
    await this.logTaskActivity(created.id, userId, "created", { title: created.title });
    if (parentTaskId) {
      await this.logTaskActivity(parentTaskId, userId, "subtask_added", { subtaskId: created.id, title: created.title });
    }
    return created;
  }

  async updateTask(id: string, userId: string, data: UpdateProjectTask): Promise<ProjectTask | undefined> {
    const existing = await this.getTask(id, userId);
    if (!existing) return undefined;

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (data.title !== undefined) update.title = data.title;
    if (data.notes !== undefined) update.notes = data.notes;
    if (data.priority !== undefined) update.priority = data.priority;
    if (data.dueDate !== undefined) update.dueDate = data.dueDate;
    if (data.tags !== undefined) update.tags = data.tags;
    if (data.links !== undefined) update.links = data.links;
    if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
    if (data.columnId !== undefined) update.columnId = data.columnId;
    if (data.status !== undefined) {
      update.status = data.status;
      if (data.status === "done" && existing.status !== "done") {
        update.completedAt = new Date();
      } else if (data.status !== "done") {
        update.completedAt = null;
      }
    }
    if (data.parentTaskId !== undefined) {
      // Allow nulling out, or moving under another top-level task in same project
      if (data.parentTaskId === null) {
        update.parentTaskId = null;
      } else {
        const parent = await this.getTask(data.parentTaskId, userId);
        if (!parent || parent.projectId !== existing.projectId) {
          throw new Error("Invalid parent task");
        }
        if (parent.parentTaskId) throw new Error("Subtasks cannot have subtasks");
        if (parent.id === existing.id) throw new Error("Task cannot be its own parent");
        // Disallow turning a task with children into a subtask
        const childCount = await db.select({ c: count() }).from(projectTasks)
          .where(and(eq(projectTasks.parentTaskId, existing.id), eq(projectTasks.userId, userId)));
        if ((childCount[0]?.c ?? 0) > 0) {
          throw new Error("Cannot nest a task that already has subtasks");
        }
        update.parentTaskId = parent.id;
      }
    }
    const [updated] = await db.update(projectTasks)
      .set(update)
      .where(and(eq(projectTasks.id, id), eq(projectTasks.userId, userId)))
      .returning();
    if (updated) {
      if (data.title !== undefined && data.title !== existing.title) {
        await this.logTaskActivity(id, userId, "title_changed", { from: existing.title, to: updated.title });
      }
      if (data.status !== undefined && data.status !== existing.status) {
        await this.logTaskActivity(id, userId, "status_changed", { from: existing.status, to: updated.status });
      }
      if (data.priority !== undefined && data.priority !== existing.priority) {
        await this.logTaskActivity(id, userId, "priority_changed", { from: existing.priority, to: updated.priority });
      }
      if (data.dueDate !== undefined) {
        const before = existing.dueDate ? new Date(existing.dueDate).getTime() : null;
        const after = updated.dueDate ? new Date(updated.dueDate).getTime() : null;
        if (before !== after) {
          await this.logTaskActivity(id, userId, "due_changed", {
            from: existing.dueDate,
            to: updated.dueDate,
          });
        }
      }
      if (data.notes !== undefined && (data.notes ?? "") !== (existing.notes ?? "")) {
        await this.logTaskActivity(id, userId, "notes_changed", {});
      }
      if (data.links !== undefined) {
        const beforeCount = (existing.links || []).length;
        const afterCount = (updated.links || []).length;
        if (beforeCount !== afterCount) {
          await this.logTaskActivity(id, userId, "links_changed", { from: beforeCount, to: afterCount });
        }
      }
    }
    return updated || undefined;
  }

  async reorderTasks(projectId: string, userId: string, updates: { id: string; columnId: string; sortOrder: number }[]): Promise<void> {
    await Promise.all(updates.map(({ id, columnId, sortOrder }) =>
      db.update(projectTasks)
        .set({ columnId, sortOrder, updatedAt: new Date() })
        .where(and(eq(projectTasks.id, id), eq(projectTasks.userId, userId), eq(projectTasks.projectId, projectId)))
    ));
  }

  async deleteTask(id: string, userId: string): Promise<void> {
    // Cascade: delete subtasks first
    await db.delete(projectTasks)
      .where(and(eq(projectTasks.parentTaskId, id), eq(projectTasks.userId, userId)));
    await db.delete(projectTasks)
      .where(and(eq(projectTasks.id, id), eq(projectTasks.userId, userId)));
  }

  async getTaskComments(taskId: string, userId: string) {
    const task = await this.getTask(taskId, userId);
    if (!task) return [];
    const rows = await db
      .select({
        id: taskComments.id,
        taskId: taskComments.taskId,
        userId: taskComments.userId,
        body: taskComments.body,
        createdAt: taskComments.createdAt,
        updatedAt: taskComments.updatedAt,
        authorName: users.displayName,
        authorEmail: users.email,
      })
      .from(taskComments)
      .leftJoin(users, eq(users.id, taskComments.userId))
      .where(eq(taskComments.taskId, taskId))
      .orderBy(asc(taskComments.createdAt));
    return rows;
  }

  async addTaskComment(taskId: string, userId: string, body: string): Promise<TaskComment> {
    const task = await this.getTask(taskId, userId);
    if (!task) throw new Error("Task not found");
    const [created] = await db.insert(taskComments).values({ taskId, userId, body }).returning();
    await this.logTaskActivity(taskId, userId, "comment_added", { commentId: created.id });
    return created;
  }

  async updateTaskComment(taskId: string, commentId: string, userId: string, body: string): Promise<TaskComment | undefined> {
    // Only the comment author can edit, and only when the comment actually belongs to taskId.
    const [updated] = await db.update(taskComments)
      .set({ body, updatedAt: new Date() })
      .where(and(
        eq(taskComments.id, commentId),
        eq(taskComments.taskId, taskId),
        eq(taskComments.userId, userId),
      ))
      .returning();
    if (updated) {
      await this.logTaskActivity(updated.taskId, userId, "comment_edited", { commentId: updated.id });
    }
    return updated;
  }

  async deleteTaskComment(taskId: string, commentId: string, userId: string): Promise<boolean> {
    // Only the comment author can delete, scoped to the parent task.
    const deleted = await db.delete(taskComments).where(and(
      eq(taskComments.id, commentId),
      eq(taskComments.taskId, taskId),
      eq(taskComments.userId, userId),
    )).returning({ id: taskComments.id });
    return deleted.length > 0;
  }

  async getTaskActivity(taskId: string, userId: string) {
    const task = await this.getTask(taskId, userId);
    if (!task) return [];
    const rows = await db
      .select({
        id: taskActivity.id,
        taskId: taskActivity.taskId,
        userId: taskActivity.userId,
        type: taskActivity.type,
        meta: taskActivity.meta,
        createdAt: taskActivity.createdAt,
        authorName: users.displayName,
        authorEmail: users.email,
      })
      .from(taskActivity)
      .leftJoin(users, eq(users.id, taskActivity.userId))
      .where(eq(taskActivity.taskId, taskId))
      .orderBy(desc(taskActivity.createdAt))
      .limit(200);
    return rows;
  }

  // ── Task Attachments ─────────────────────────────────────────────────────────

  async getTaskAttachments(taskId: string, userId: string): Promise<TaskAttachment[]> {
    const task = await this.getTask(taskId, userId);
    if (!task) return [];
    return db.select().from(taskAttachments)
      .where(eq(taskAttachments.taskId, taskId))
      .orderBy(asc(taskAttachments.createdAt));
  }

  async getTaskAttachment(id: string, userId: string): Promise<TaskAttachment | undefined> {
    const [att] = await db.select().from(taskAttachments)
      .where(and(eq(taskAttachments.id, id), eq(taskAttachments.userId, userId)));
    return att ?? undefined;
  }

  async createTaskAttachment(
    taskId: string,
    userId: string,
    data: { objectPath: string; filename: string; mimeType: string; size: number }
  ): Promise<TaskAttachment> {
    const [created] = await db.insert(taskAttachments).values({
      taskId, userId,
      objectPath: data.objectPath,
      filename: data.filename,
      mimeType: data.mimeType,
      size: data.size,
    }).returning();
    return created;
  }

  async deleteTaskAttachment(id: string, userId: string): Promise<TaskAttachment | undefined> {
    const [deleted] = await db.delete(taskAttachments)
      .where(and(eq(taskAttachments.id, id), eq(taskAttachments.userId, userId)))
      .returning();
    return deleted ?? undefined;
  }

  // ── Project Board Columns ────────────────────────────────────────────────────

  async getColumnsForProject(projectId: string, userId: string): Promise<ProjectColumn[]> {
    return db.select().from(projectColumns)
      .where(and(eq(projectColumns.projectId, projectId), eq(projectColumns.userId, userId)))
      .orderBy(asc(projectColumns.sortOrder), asc(projectColumns.createdAt));
  }

  async createColumn(userId: string, projectId: string, data: InsertProjectColumn): Promise<ProjectColumn> {
    const existing = await this.getColumnsForProject(projectId, userId);
    const sortOrder = data.sortOrder ?? existing.length;
    const [created] = await db.insert(projectColumns).values({
      userId, projectId, name: data.name, color: data.color ?? null, sortOrder,
    }).returning();
    return created;
  }

  async updateColumn(id: string, userId: string, data: Partial<InsertProjectColumn>): Promise<ProjectColumn | undefined> {
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) update.name = data.name;
    if (data.color !== undefined) update.color = data.color;
    if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
    const [updated] = await db.update(projectColumns)
      .set(update)
      .where(and(eq(projectColumns.id, id), eq(projectColumns.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteColumn(id: string, userId: string): Promise<void> {
    const [col] = await db.select().from(projectColumns)
      .where(and(eq(projectColumns.id, id), eq(projectColumns.userId, userId)));
    if (!col) return;
    const remaining = await db.select().from(projectColumns)
      .where(and(eq(projectColumns.projectId, col.projectId), eq(projectColumns.userId, userId)))
      .orderBy(asc(projectColumns.sortOrder));
    const others = remaining.filter(c => c.id !== id);
    if (others.length > 0) {
      await db.execute(sql`
        UPDATE project_tasks SET column_id = ${others[0].id}
        WHERE column_id = ${id} AND user_id = ${userId}
      `);
    } else {
      await db.execute(sql`
        UPDATE project_tasks SET column_id = NULL
        WHERE column_id = ${id} AND user_id = ${userId}
      `);
    }
    await db.delete(projectColumns)
      .where(and(eq(projectColumns.id, id), eq(projectColumns.userId, userId)));
  }

  async seedColumnsForProject(projectId: string, userId: string): Promise<ProjectColumn[]> {
    const existing = await this.getColumnsForProject(projectId, userId);
    if (existing.length > 0) return existing;

    const defaults = [
      { name: "To do",       sortOrder: 0 },
      { name: "In progress", sortOrder: 1 },
      { name: "Done",        sortOrder: 2 },
    ];
    const created: ProjectColumn[] = [];
    for (const d of defaults) {
      const [col] = await db.insert(projectColumns).values({
        userId, projectId, name: d.name, sortOrder: d.sortOrder,
      }).returning();
      created.push(col);
    }

    // Assign existing tasks to the matching column by status
    await db.execute(sql`
      UPDATE project_tasks SET column_id = ${created[0].id}
      WHERE project_id = ${projectId} AND user_id = ${userId}
        AND status = 'todo' AND column_id IS NULL
    `);
    await db.execute(sql`
      UPDATE project_tasks SET column_id = ${created[1].id}
      WHERE project_id = ${projectId} AND user_id = ${userId}
        AND status = 'in_progress' AND column_id IS NULL
    `);
    await db.execute(sql`
      UPDATE project_tasks SET column_id = ${created[2].id}
      WHERE project_id = ${projectId} AND user_id = ${userId}
        AND status = 'done' AND column_id IS NULL
    `);

    return created;
  }

  async getDashboardProjectsSummary(userId: string) {
    const all = await this.getProjectsForUser(userId);
    const active = all.filter(p => p.status === "active");
    const totalOpenTasks = active.reduce((s, p) => s + p.openTasks, 0);
    const totalDueThisWeek = active.reduce((s, p) => s + p.dueThisWeek, 0);

    const userForTz = await this.getUser(userId);
    const tz = safeTimezone(userForTz?.timezone);
    const overdueRows = await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM project_tasks
      WHERE user_id = ${userId}
        AND status <> 'done'
        AND due_date IS NOT NULL
        AND (due_date AT TIME ZONE ${tz})::date < (NOW() AT TIME ZONE ${tz})::date
    `);
    const totalOverdue = Number((overdueRows.rows[0] as any)?.c ?? 0);

    const top = [...active]
      .sort((a, b) => (b.openTasks - a.openTasks) || ((b.lastActivityAt?.getTime() ?? 0) - (a.lastActivityAt?.getTime() ?? 0)))
      .slice(0, 3);

    return {
      projects: top,
      totalActive: active.length,
      totalOpenTasks,
      totalDueThisWeek,
      totalOverdue,
    };
  }

  async getUrgentTasksForUser(userId: string, hoursAhead = 48): Promise<Array<ProjectTask & { projectName: string; projectColor: string }>> {
    const result = await db.execute(sql`
      SELECT t.*, p.name AS project_name, p.color AS project_color
      FROM project_tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.user_id = ${userId}
        AND t.status <> 'done'
        AND t.due_date IS NOT NULL
        AND p.status = 'active'
        AND t.parent_task_id IS NULL
        AND t.due_date <= NOW() + (${hoursAhead} || ' hours')::interval
      ORDER BY t.due_date ASC
      LIMIT 25
    `);
    return (result.rows as any[]).map(r => ({
      id: r.id,
      userId: r.user_id,
      projectId: r.project_id,
      columnId: r.column_id,
      parentTaskId: r.parent_task_id,
      title: r.title,
      notes: r.notes,
      status: r.status,
      priority: r.priority,
      dueDate: r.due_date ? new Date(r.due_date) : null,
      completedAt: r.completed_at ? new Date(r.completed_at) : null,
      tags: r.tags || [],
      links: r.links || [],
      sortOrder: r.sort_order,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
      projectName: r.project_name,
      projectColor: r.project_color,
    }));
  }

  async getAllOpenTasksForUser(userId: string, limit?: number): Promise<Array<ProjectTask & { projectName: string; projectColor: string }>> {
    const limitClause = typeof limit === "number" ? sql`LIMIT ${limit}` : sql``;
    const result = await db.execute(sql`
      SELECT t.*, p.name AS project_name, p.color AS project_color
      FROM project_tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.user_id = ${userId}
        AND t.status <> 'done'
        AND p.status = 'active'
        AND t.parent_task_id IS NULL
      ORDER BY (t.due_date IS NULL) ASC, t.due_date ASC, t.created_at ASC
      ${limitClause}
    `);
    return (result.rows as any[]).map(r => ({
      id: r.id,
      userId: r.user_id,
      projectId: r.project_id,
      columnId: r.column_id,
      parentTaskId: r.parent_task_id,
      title: r.title,
      notes: r.notes,
      status: r.status,
      priority: r.priority,
      dueDate: r.due_date ? new Date(r.due_date) : null,
      completedAt: r.completed_at ? new Date(r.completed_at) : null,
      tags: r.tags || [],
      links: r.links || [],
      sortOrder: r.sort_order,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
      projectName: r.project_name,
      projectColor: r.project_color,
    }));
  }

  async getAllTasksWithDueDatesForUser(userId: string): Promise<Array<ProjectTask & { projectName: string }>> {
    const result = await db.execute(sql`
      SELECT t.*, p.name AS project_name
      FROM project_tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.user_id = ${userId}
        AND t.status <> 'done'
        AND t.due_date IS NOT NULL
        AND p.status = 'active'
      ORDER BY t.due_date ASC, t.created_at ASC
    `);
    return (result.rows as any[]).map(r => ({
      id: r.id,
      userId: r.user_id,
      projectId: r.project_id,
      parentTaskId: r.parent_task_id,
      title: r.title,
      notes: r.notes,
      status: r.status,
      priority: r.priority,
      dueDate: r.due_date ? new Date(r.due_date) : null,
      completedAt: r.completed_at ? new Date(r.completed_at) : null,
      tags: r.tags || [],
      links: r.links || [],
      sortOrder: r.sort_order,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
      projectName: r.project_name,
    }));
  }

  async getUserByIcalToken(token: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.icalToken, token));
    return user || null;
  }

  async rotateIcalToken(userId: string): Promise<string> {
    const { randomBytes } = await import("crypto");
    const token = randomBytes(24).toString("hex");
    await db.update(users).set({ icalToken: token }).where(eq(users.id, userId));
    return token;
  }

  // ── Project Templates ────────────────────────────────────────────────────

  async getTemplatesForUser(userId: string): Promise<ProjectTemplateWithCounts[]> {
    const rows = await db.execute(sql`
      SELECT t.*, COALESCE(c.cnt, 0)::int AS total_tasks
      FROM project_templates t
      LEFT JOIN (
        SELECT template_id, COUNT(*) AS cnt
        FROM project_template_tasks
        WHERE user_id = ${userId}
        GROUP BY template_id
      ) c ON c.template_id = t.id
      WHERE t.user_id = ${userId}
      ORDER BY t.sort_order ASC, t.created_at DESC
    `);
    return rows.rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      description: r.description ?? "",
      color: r.color,
      sortOrder: r.sort_order,
      createdAt: new Date(r.created_at),
      updatedAt: new Date(r.updated_at),
      totalTasks: r.total_tasks,
    }));
  }

  async getTemplate(id: string, userId: string): Promise<ProjectTemplate | undefined> {
    const [row] = await db.select().from(projectTemplates)
      .where(and(eq(projectTemplates.id, id), eq(projectTemplates.userId, userId)));
    return row || undefined;
  }

  async createTemplate(userId: string, data: InsertProjectTemplate): Promise<ProjectTemplate> {
    const [created] = await db.insert(projectTemplates).values({
      userId,
      name: data.name,
      description: data.description ?? "",
      color: data.color ?? "#6366f1",
      sortOrder: data.sortOrder ?? 0,
    }).returning();
    return created;
  }

  async updateTemplate(id: string, userId: string, data: Partial<InsertProjectTemplate>): Promise<ProjectTemplate | undefined> {
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) update.name = data.name;
    if (data.description !== undefined) update.description = data.description;
    if (data.color !== undefined) update.color = data.color;
    if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
    const [updated] = await db.update(projectTemplates)
      .set(update)
      .where(and(eq(projectTemplates.id, id), eq(projectTemplates.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteTemplate(id: string, userId: string): Promise<void> {
    await db.delete(projectTemplates)
      .where(and(eq(projectTemplates.id, id), eq(projectTemplates.userId, userId)));
  }

  async duplicateTemplate(id: string, userId: string): Promise<ProjectTemplate | undefined> {
    const original = await this.getTemplate(id, userId);
    if (!original) return undefined;
    const [copy] = await db.insert(projectTemplates).values({
      userId,
      name: `${original.name} (copy)`,
      description: original.description,
      color: original.color,
      sortOrder: original.sortOrder,
    }).returning();
    const tasks = await this.getTemplateTasks(id, userId);
    const tops = tasks.filter(t => !t.parentTaskId);
    const subs = tasks.filter(t => t.parentTaskId);
    const idMap = new Map<string, string>();
    for (const t of tops) {
      const [created] = await db.insert(projectTemplateTasks).values({
        userId,
        templateId: copy.id,
        parentTaskId: null,
        title: t.title,
        notes: t.notes,
        priority: t.priority,
        tags: t.tags,
        links: t.links,
        sortOrder: t.sortOrder,
      }).returning();
      idMap.set(t.id, created.id);
    }
    for (const s of subs) {
      const newParent = idMap.get(s.parentTaskId!);
      if (!newParent) continue;
      await db.insert(projectTemplateTasks).values({
        userId,
        templateId: copy.id,
        parentTaskId: newParent,
        title: s.title,
        notes: s.notes,
        priority: s.priority,
        tags: s.tags,
        links: s.links,
        sortOrder: s.sortOrder,
      });
    }
    return copy;
  }

  async getTemplateTasks(templateId: string, userId: string): Promise<ProjectTemplateTask[]> {
    return db.select().from(projectTemplateTasks)
      .where(and(eq(projectTemplateTasks.templateId, templateId), eq(projectTemplateTasks.userId, userId)))
      .orderBy(asc(projectTemplateTasks.sortOrder), asc(projectTemplateTasks.createdAt));
  }

  private async getTemplateTask(id: string, userId: string): Promise<ProjectTemplateTask | undefined> {
    const [row] = await db.select().from(projectTemplateTasks)
      .where(and(eq(projectTemplateTasks.id, id), eq(projectTemplateTasks.userId, userId)));
    return row || undefined;
  }

  async createTemplateTask(userId: string, templateId: string, data: InsertProjectTemplateTask): Promise<ProjectTemplateTask> {
    let parentTaskId: string | null = null;
    if (data.parentTaskId) {
      const parent = await this.getTemplateTask(data.parentTaskId, userId);
      if (!parent || parent.templateId !== templateId) throw new Error("Invalid parent task");
      if (parent.parentTaskId) throw new Error("Subtasks cannot have subtasks");
      parentTaskId = parent.id;
    }
    const [created] = await db.insert(projectTemplateTasks).values({
      userId,
      templateId,
      parentTaskId,
      title: data.title,
      notes: data.notes ?? "",
      priority: data.priority ?? "none",
      tags: data.tags ?? [],
      links: data.links ?? [],
      sortOrder: data.sortOrder ?? 0,
    }).returning();
    return created;
  }

  async updateTemplateTask(id: string, userId: string, data: UpdateProjectTemplateTask): Promise<ProjectTemplateTask | undefined> {
    const existing = await this.getTemplateTask(id, userId);
    if (!existing) return undefined;
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (data.title !== undefined) update.title = data.title;
    if (data.notes !== undefined) update.notes = data.notes;
    if (data.priority !== undefined) update.priority = data.priority;
    if (data.tags !== undefined) update.tags = data.tags;
    if (data.links !== undefined) update.links = data.links;
    if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;
    if (data.parentTaskId !== undefined) {
      if (data.parentTaskId === null) {
        update.parentTaskId = null;
      } else {
        const parent = await this.getTemplateTask(data.parentTaskId, userId);
        if (!parent || parent.templateId !== existing.templateId) throw new Error("Invalid parent task");
        if (parent.parentTaskId) throw new Error("Subtasks cannot have subtasks");
        if (parent.id === existing.id) throw new Error("Task cannot be its own parent");
        const childCount = await db.select({ c: count() }).from(projectTemplateTasks)
          .where(and(eq(projectTemplateTasks.parentTaskId, existing.id), eq(projectTemplateTasks.userId, userId)));
        if ((childCount[0]?.c ?? 0) > 0) throw new Error("Cannot nest a task that already has subtasks");
        update.parentTaskId = parent.id;
      }
    }
    const [updated] = await db.update(projectTemplateTasks)
      .set(update)
      .where(and(eq(projectTemplateTasks.id, id), eq(projectTemplateTasks.userId, userId)))
      .returning();
    return updated || undefined;
  }

  async deleteTemplateTask(id: string, userId: string): Promise<void> {
    await db.delete(projectTemplateTasks)
      .where(and(eq(projectTemplateTasks.parentTaskId, id), eq(projectTemplateTasks.userId, userId)));
    await db.delete(projectTemplateTasks)
      .where(and(eq(projectTemplateTasks.id, id), eq(projectTemplateTasks.userId, userId)));
  }

  async instantiateProjectFromTemplate(userId: string, templateId: string, project: Project): Promise<void> {
    const tasks = await this.getTemplateTasks(templateId, userId);
    const tops = tasks.filter(t => !t.parentTaskId);
    const subs = tasks.filter(t => t.parentTaskId);
    const idMap = new Map<string, string>();
    for (const t of tops) {
      const [created] = await db.insert(projectTasks).values({
        userId,
        projectId: project.id,
        parentTaskId: null,
        title: t.title,
        notes: t.notes,
        status: "todo",
        priority: t.priority,
        dueDate: null,
        tags: t.tags,
        links: t.links,
        sortOrder: t.sortOrder,
      }).returning();
      idMap.set(t.id, created.id);
      await this.logTaskActivity(created.id, userId, "created", { title: created.title, fromTemplate: templateId });
    }
    for (const s of subs) {
      const newParent = idMap.get(s.parentTaskId!);
      if (!newParent) continue;
      const [created] = await db.insert(projectTasks).values({
        userId,
        projectId: project.id,
        parentTaskId: newParent,
        title: s.title,
        notes: s.notes,
        status: "todo",
        priority: s.priority,
        dueDate: null,
        tags: s.tags,
        links: s.links,
        sortOrder: s.sortOrder,
      }).returning();
      await this.logTaskActivity(created.id, userId, "created", { title: created.title, fromTemplate: templateId });
      await this.logTaskActivity(newParent, userId, "subtask_added", { subtaskId: created.id, title: created.title });
    }
  }

  async snapshotProjectAsTemplate(userId: string, projectId: string, name: string): Promise<ProjectTemplate> {
    const project = await this.getProject(projectId, userId);
    if (!project) throw new Error("Project not found");
    const [tpl] = await db.insert(projectTemplates).values({
      userId,
      name: name.trim() || `${project.name} template`,
      description: project.description,
      color: project.color,
      sortOrder: 0,
    }).returning();
    const tasks = await this.getTasksForProject(projectId, userId);
    const tops = tasks.filter(t => !t.parentTaskId);
    const subs = tasks.filter(t => t.parentTaskId);
    const idMap = new Map<string, string>();
    for (const t of tops) {
      const [created] = await db.insert(projectTemplateTasks).values({
        userId,
        templateId: tpl.id,
        parentTaskId: null,
        title: t.title,
        notes: t.notes,
        priority: t.priority,
        tags: t.tags,
        links: t.links,
        sortOrder: t.sortOrder,
      }).returning();
      idMap.set(t.id, created.id);
    }
    for (const s of subs) {
      const newParent = idMap.get(s.parentTaskId!);
      if (!newParent) continue;
      await db.insert(projectTemplateTasks).values({
        userId,
        templateId: tpl.id,
        parentTaskId: newParent,
        title: s.title,
        notes: s.notes,
        priority: s.priority,
        tags: s.tags,
        links: s.links,
        sortOrder: s.sortOrder,
      });
    }
    return tpl;
  }

  // ── Inbox Analyzer ───────────────────────────────────────────────────────

  async resetAllEmailAddresses(): Promise<{ analyzerAddressesDeleted: number; intelSeedsDeleted: number }> {
    const [a] = await db.select({ count: sql<number>`count(*)::int` }).from(emailInboxAddresses);
    const [b] = await db.select({ count: sql<number>`count(*)::int` }).from(competitorSeedAddresses);
    await db.delete(emailInboxAddresses);
    await db.delete(competitorSeedAddresses);
    return { analyzerAddressesDeleted: a.count, intelSeedsDeleted: b.count };
  }

  async getOrCreateInboxAddress(userId: string): Promise<EmailInboxAddress> {
    const [existing] = await db.select().from(emailInboxAddresses).where(eq(emailInboxAddresses.userId, userId));
    if (existing) return existing;
    const { generateNamedToken } = await import("./inboxAnalyzer");
    const user = await this.getUser(userId);
    const token = generateNamedToken(user?.firstName, user?.lastName);
    const [created] = await db.insert(emailInboxAddresses).values({ userId, token }).returning();
    return created;
  }

  async getInboxAddressByToken(token: string): Promise<EmailInboxAddress | undefined> {
    const [row] = await db.select().from(emailInboxAddresses).where(eq(emailInboxAddresses.token, token));
    return row || undefined;
  }

  async createEmailAnalysis(data: {
    userId: string; fromAddress: string; fromName?: string; replyTo?: string; messageId?: string; subject: string;
    bodyText?: string; bodyHtml?: string; rawHeaders?: string;
    spfResult?: string; dkimResult?: string;
  }): Promise<EmailAnalysis> {
    const [row] = await db.insert(emailAnalyses).values({
      ...data,
      status: "pending",
    }).returning();
    return row;
  }

  async updateEmailAnalysis(id: string, data: Partial<EmailAnalysis>): Promise<void> {
    await db.update(emailAnalyses).set(data).where(eq(emailAnalyses.id, id));
  }

  async getEmailAnalyses(userId: string, limit = 50): Promise<EmailAnalysis[]> {
    return db.select().from(emailAnalyses)
      .where(eq(emailAnalyses.userId, userId))
      .orderBy(desc(emailAnalyses.receivedAt))
      .limit(limit);
  }

  async getEmailAnalysis(id: string, userId: string): Promise<EmailAnalysis | undefined> {
    const [row] = await db.select().from(emailAnalyses)
      .where(and(eq(emailAnalyses.id, id), eq(emailAnalyses.userId, userId)));
    return row || undefined;
  }

  async getEmailAnalysisByMessageId(messageId: string, userId: string): Promise<EmailAnalysis | undefined> {
    const [row] = await db.select().from(emailAnalyses)
      .where(and(eq(emailAnalyses.messageId, messageId), eq(emailAnalyses.userId, userId)));
    return row || undefined;
  }

  async deleteEmailAnalysis(id: string, userId: string): Promise<void> {
    await db.delete(emailAnalyses)
      .where(and(eq(emailAnalyses.id, id), eq(emailAnalyses.userId, userId)));
  }

  async updateInboxSendingFrom(userId: string, sendingFromAddress: string): Promise<void> {
    await db.update(emailInboxAddresses)
      .set({ sendingFromAddress })
      .where(eq(emailInboxAddresses.userId, userId));
  }

  async saveLastPlacementResults(userId: string, results: unknown[]): Promise<void> {
    await db.update(emailInboxAddresses)
      .set({ lastPlacementResults: results, lastPlacementCheckedAt: new Date() })
      .where(eq(emailInboxAddresses.userId, userId));
  }

  async setPlacementAutoCheckWindow(userId: string, until: Date | null, emailContext?: { receivedAt: Date; subject: string; messageId?: string }): Promise<void> {
    // When opening a new window (until != null):
    //   - Stamp lastPlacementCheckedAt as 10 minutes ago so the 15-min scheduler
    //     throttle fires the first real check ~5 minutes after the email arrives
    //     (enough time for Gmail's spam filters to finish processing).
    //   - Confirmation check then runs 15 minutes after that first check.
    //   - Clear lastPlacementResults so the UI shows "pending" for the new email
    //     rather than stale results from a previous email's monitoring run.
    // When closing the window (until == null) we leave both timestamps alone.
    const extra = until !== null
      ? { lastPlacementCheckedAt: new Date(Date.now() - 10 * 60 * 1000), lastPlacementResults: null }
      : {};
    const contextFields = emailContext
      ? {
          placementCheckReceivedAt: emailContext.receivedAt,
          placementCheckSubject: emailContext.subject,
          placementCheckMessageId: emailContext.messageId ?? null,
        }
      : {};
    await db.update(emailInboxAddresses)
      .set({ placementAutoCheckUntil: until, ...extra, ...contextFields })
      .where(eq(emailInboxAddresses.userId, userId));
  }

  async saveEmailPlacementResults(messageId: string, userId: string, results: unknown[], confirmed = true): Promise<void> {
    const updates: Record<string, unknown> = { placementResults: results };
    if (confirmed) updates.placementConfirmedAt = new Date();
    await db.update(emailAnalyses)
      .set(updates as any)
      .where(
        sql`${emailAnalyses.messageId} = ${messageId} AND ${emailAnalyses.userId} = ${userId}`
      );
  }

  async getUsersWithActivePlacementMonitoring(now: Date): Promise<Array<{ userId: string; sendingFromAddress: string; effectiveSenderAddress: string; lastPlacementCheckedAt: Date | null; placementAutoCheckUntil: Date; lastPlacementResults: unknown[] | null; placementCheckReceivedAt: Date | null; placementCheckSubject: string | null; placementCheckMessageId: string | null }>> {
    // LEFT JOIN email_analyses so we can fall back to the actual from_address of the
    // pinned email when the user hasn't set their sendingFromAddress yet.
    const rows = await db.execute(sql`
      SELECT
        eia.user_id                    AS "userId",
        eia.sending_from_address       AS "sendingFromAddress",
        -- Security: effectiveSenderAddress MUST be derived only from the server-trusted
        -- fromAddress on the pinned email analysis record (owned by the same user).
        -- Do NOT use sending_from_address here — it is user-controlled and would allow
        -- any member to probe shared seed inboxes with an arbitrary sender (oracle attack).
        COALESCE(
          ea.from_address,
          ''
        )                              AS "effectiveSenderAddress",
        eia.last_placement_checked_at  AS "lastPlacementCheckedAt",
        eia.placement_auto_check_until AS "placementAutoCheckUntil",
        eia.last_placement_results     AS "lastPlacementResults",
        eia.placement_check_received_at AS "placementCheckReceivedAt",
        eia.placement_check_subject    AS "placementCheckSubject",
        eia.placement_check_message_id AS "placementCheckMessageId"
      FROM email_inbox_addresses eia
      LEFT JOIN email_analyses ea
        ON ea.message_id = eia.placement_check_message_id
       AND ea.user_id    = eia.user_id
      WHERE eia.placement_auto_check_until > ${now}
    `);
    return (rows.rows as Array<{ userId: string; sendingFromAddress: string | null; effectiveSenderAddress: string; lastPlacementCheckedAt: Date | null; placementAutoCheckUntil: Date; lastPlacementResults: unknown[] | null; placementCheckReceivedAt: Date | null; placementCheckSubject: string | null; placementCheckMessageId: string | null }>)
      .filter(r => r.placementAutoCheckUntil != null)
      .map(r => ({ ...r, sendingFromAddress: r.sendingFromAddress ?? "" })) as Array<{ userId: string; sendingFromAddress: string; effectiveSenderAddress: string; lastPlacementCheckedAt: Date | null; placementAutoCheckUntil: Date; lastPlacementResults: unknown[] | null; placementCheckReceivedAt: Date | null; placementCheckSubject: string | null; placementCheckMessageId: string | null }>;
  }

  async getSeedInboxes(activeOnly = false): Promise<SeedInbox[]> {
    const rows = await db.select().from(seedInboxes).orderBy(asc(seedInboxes.createdAt));
    return activeOnly ? rows.filter(r => r.isActive) : rows;
  }

  async addSeedInbox(data: InsertSeedInbox): Promise<SeedInbox> {
    const [row] = await db.insert(seedInboxes).values(data).returning();
    return row;
  }

  async deleteSeedInbox(id: string): Promise<void> {
    await db.delete(seedInboxes).where(eq(seedInboxes.id, id));
  }

  async toggleSeedInbox(id: string, isActive: boolean): Promise<void> {
    await db.update(seedInboxes).set({ isActive }).where(eq(seedInboxes.id, id));
  }

  async getSeedInboxById(id: string): Promise<SeedInbox | null> {
    const [row] = await db.select().from(seedInboxes).where(eq(seedInboxes.id, id));
    return row || null;
  }

  async renameSeedInbox(id: string, label: string): Promise<void> {
    await db.update(seedInboxes).set({ label }).where(eq(seedInboxes.id, id));
  }

  async storeSeedInboxOAuthTokens(id: string, accessToken: string, refreshToken: string | null, expiry: Date | null, _verifiedEmail: string): Promise<void> {
    // Do NOT overwrite the email field — it was manually set by the admin as the inbox identifier.
    // If the inbox already has an IMAP App Password, keep both active ("dual" mode) so both
    // methods run in parallel and OAuth's result takes precedence.
    const [existing] = await db.select({ imapPassword: seedInboxes.imapPassword }).from(seedInboxes).where(eq(seedInboxes.id, id));
    const newAuthMethod = existing?.imapPassword ? "dual" : "oauth";
    await db.update(seedInboxes).set({
      oauthAccessToken: accessToken,
      oauthRefreshToken: refreshToken,
      oauthTokenExpiry: expiry,
      isConnected: true,
      oauthNeedsReconnect: false,
      authMethod: newAuthMethod,
    }).where(eq(seedInboxes.id, id));
  }

  async storeImapPassword(id: string, encryptedPassword: string): Promise<void> {
    await db.update(seedInboxes).set({
      imapPassword: encryptedPassword,
      isConnected: true,
      authMethod: "imap",
      // Clear any stale OAuth state
      oauthNeedsReconnect: false,
    }).where(eq(seedInboxes.id, id));
  }

  async markSeedInboxNeedsReconnect(id: string): Promise<void> {
    // IMAP-only inboxes never need reconnect.
    // Dual inboxes demote back to IMAP-only when OAuth expires — inbox keeps working via IMAP.
    const [row] = await db.select({ authMethod: seedInboxes.authMethod }).from(seedInboxes).where(eq(seedInboxes.id, id));
    if (row?.authMethod === "imap") return;
    if (row?.authMethod === "dual") {
      await db.update(seedInboxes)
        .set({ authMethod: "imap", oauthNeedsReconnect: false })
        .where(eq(seedInboxes.id, id));
      return;
    }
    await db.update(seedInboxes)
      .set({ oauthNeedsReconnect: true })
      .where(eq(seedInboxes.id, id));
  }

  async updateSeedInboxOAuthToken(id: string, accessToken: string, expiry: Date | null): Promise<void> {
    await db.update(seedInboxes)
      .set({ oauthAccessToken: accessToken, oauthTokenExpiry: expiry })
      .where(eq(seedInboxes.id, id));
  }

  async disconnectSeedInbox(id: string): Promise<void> {
    await db.update(seedInboxes).set({
      oauthAccessToken: null,
      oauthRefreshToken: null,
      oauthTokenExpiry: null,
      imapPassword: null,
      authMethod: null,
      isConnected: false,
      oauthNeedsReconnect: false,
    }).where(eq(seedInboxes.id, id));
  }

  // ── Postmaster ──────────────────────────────────────────────────────────────
  async getPostmasterConnection(userId: string): Promise<PostmasterConnection | null> {
    const [row] = await db.select().from(postmasterConnections).where(eq(postmasterConnections.userId, userId));
    return row ?? null;
  }

  async upsertPostmasterConnection(userId: string, data: { oauthAccessToken: string; oauthRefreshToken: string | null; oauthTokenExpiry: Date | null; connectedEmail: string }): Promise<PostmasterConnection> {
    const [row] = await db
      .insert(postmasterConnections)
      .values({ userId, ...data })
      .onConflictDoUpdate({
        target: postmasterConnections.userId,
        set: { oauthAccessToken: data.oauthAccessToken, oauthRefreshToken: data.oauthRefreshToken, oauthTokenExpiry: data.oauthTokenExpiry, connectedEmail: data.connectedEmail },
      })
      .returning();
    return row;
  }

  async updatePostmasterLastSynced(userId: string): Promise<void> {
    await db.update(postmasterConnections).set({ lastSyncedAt: new Date() }).where(eq(postmasterConnections.userId, userId));
  }

  async deletePostmasterConnection(userId: string): Promise<void> {
    await db.delete(postmasterConnections).where(eq(postmasterConnections.userId, userId));
  }

  async getPostmasterDomains(userId: string): Promise<PostmasterDomain[]> {
    return db.select().from(postmasterDomains).where(eq(postmasterDomains.userId, userId)).orderBy(asc(postmasterDomains.domainName));
  }

  async upsertPostmasterDomain(userId: string, domainName: string, data: { latestReputation: string | null; latestSpamRate: number | null; latestSpfRatio: number | null; latestDkimRatio: number | null; latestDmarcRatio: number | null; latestEncryptionRatio: number | null; trafficStats: any[] }): Promise<void> {
    await db
      .insert(postmasterDomains)
      .values({ userId, domainName, ...data, lastFetchedAt: new Date() })
      .onConflictDoUpdate({
        target: [postmasterDomains.userId, postmasterDomains.domainName],
        set: { ...data, lastFetchedAt: new Date() },
      });
  }

  async deletePostmasterDomains(userId: string): Promise<void> {
    await db.delete(postmasterDomains).where(eq(postmasterDomains.userId, userId));
  }

  // ── Analytics ─────────────────────────────────────────────────────────────────

  async getYouTubeConnection(userId: string): Promise<YoutubeConnection | null> {
    const [row] = await db.select().from(youtubeConnections).where(eq(youtubeConnections.userId, userId));
    return row ?? null;
  }

  async upsertYouTubeConnection(userId: string, data: { oauthAccessToken: string; oauthRefreshToken: string | null; oauthTokenExpiry: Date | null; connectedEmail: string; channelId?: string; channelTitle?: string; channelHandle?: string; channelThumbnail?: string; uploadsPlaylistId?: string }): Promise<YoutubeConnection> {
    const [row] = await db
      .insert(youtubeConnections)
      .values({ userId, ...data })
      .onConflictDoUpdate({
        target: youtubeConnections.userId,
        set: { oauthAccessToken: data.oauthAccessToken, oauthRefreshToken: data.oauthRefreshToken, oauthTokenExpiry: data.oauthTokenExpiry, connectedEmail: data.connectedEmail, channelId: data.channelId, channelTitle: data.channelTitle, channelHandle: data.channelHandle, channelThumbnail: data.channelThumbnail, uploadsPlaylistId: data.uploadsPlaylistId },
      })
      .returning();
    return row;
  }

  async updateYouTubeChannel(userId: string, data: { channelId: string; channelTitle: string; channelHandle: string; channelThumbnail: string; uploadsPlaylistId: string }): Promise<void> {
    await db.update(youtubeConnections).set(data).where(eq(youtubeConnections.userId, userId));
  }

  async deleteYouTubeConnection(userId: string): Promise<void> {
    await db.delete(youtubeConnections).where(eq(youtubeConnections.userId, userId));
  }

  async getYoutubeAnalyticsCache(userId: string, cacheKey: string): Promise<{ data: any; updatedAt: Date } | null> {
    const [row] = await db
      .select()
      .from(youtubeAnalyticsCache)
      .where(and(eq(youtubeAnalyticsCache.userId, userId), eq(youtubeAnalyticsCache.cacheKey, cacheKey)));
    if (!row) return null;
    return { data: row.dataJson, updatedAt: row.updatedAt };
  }

  async setYoutubeAnalyticsCache(userId: string, cacheKey: string, data: any): Promise<void> {
    await db
      .insert(youtubeAnalyticsCache)
      .values({ userId, cacheKey, dataJson: data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [youtubeAnalyticsCache.userId, youtubeAnalyticsCache.cacheKey],
        set: { dataJson: data, updatedAt: new Date() },
      });
  }

  async clearYoutubeAnalyticsCache(userId: string): Promise<void> {
    await db.delete(youtubeAnalyticsCache).where(eq(youtubeAnalyticsCache.userId, userId));
  }

  async getAllConnectedYoutubeUsers(): Promise<Array<{ userId: string; oauthAccessToken: string; oauthRefreshToken: string | null; uploadsPlaylistId: string | null }>> {
    const rows = await db
      .select({
        userId: youtubeConnections.userId,
        oauthAccessToken: youtubeConnections.oauthAccessToken,
        oauthRefreshToken: youtubeConnections.oauthRefreshToken,
        uploadsPlaylistId: youtubeConnections.uploadsPlaylistId,
      })
      .from(youtubeConnections)
      .where(sql`${youtubeConnections.oauthAccessToken} IS NOT NULL AND ${youtubeConnections.oauthAccessToken} != ''`);
    return rows;
  }

  async getCannedResponses(userId: string): Promise<CannedResponse[]> {
    return db.select().from(cannedResponses).where(eq(cannedResponses.userId, userId)).orderBy(cannedResponses.createdAt);
  }

  async createCannedResponse(userId: string, data: { title: string; body: string }): Promise<CannedResponse> {
    const [row] = await db.insert(cannedResponses).values({ userId, ...data }).returning();
    return row;
  }

  async updateCannedResponse(id: string, userId: string, data: { title?: string; body?: string }): Promise<CannedResponse | null> {
    const [row] = await db.update(cannedResponses).set(data).where(and(eq(cannedResponses.id, id), eq(cannedResponses.userId, userId))).returning();
    return row ?? null;
  }

  async deleteCannedResponse(id: string, userId: string): Promise<void> {
    await db.delete(cannedResponses).where(and(eq(cannedResponses.id, id), eq(cannedResponses.userId, userId)));
  }

  async getYoutubeCommentCache(userId: string, videoId: string): Promise<YoutubeCommentCache | null> {
    const [row] = await db
      .select()
      .from(youtubeCommentCache)
      .where(and(eq(youtubeCommentCache.userId, userId), eq(youtubeCommentCache.videoId, videoId)));
    return row ?? null;
  }

  async upsertYoutubeCommentCache(userId: string, data: { videoId: string; videoTitle: string; videoThumbnail: string; videoPublishedAt?: Date | null; threads: any[]; totalResults: number }): Promise<void> {
    await db
      .insert(youtubeCommentCache)
      .values({ userId, ...data, cachedAt: new Date() })
      .onConflictDoUpdate({
        target: [youtubeCommentCache.userId, youtubeCommentCache.videoId],
        set: {
          videoTitle: data.videoTitle,
          videoThumbnail: data.videoThumbnail,
          videoPublishedAt: data.videoPublishedAt ?? null,
          threads: data.threads,
          totalResults: data.totalResults,
          cachedAt: new Date(),
        },
      });
  }

  async appendReplyToCommentCache(userId: string, videoId: string, commentId: string, reply: any): Promise<void> {
    const row = await this.getYoutubeCommentCache(userId, videoId);
    if (!row) return;
    const threads = (row.threads as any[]).map((t: any) => {
      if (t.commentId === commentId) {
        return { ...t, replies: [...(t.replies || []), reply], totalReplyCount: (t.totalReplyCount || 0) + 1 };
      }
      return t;
    });
    await db
      .update(youtubeCommentCache)
      .set({ threads })
      .where(and(eq(youtubeCommentCache.userId, userId), eq(youtubeCommentCache.videoId, videoId)));
  }

  async clearYoutubeCommentCache(userId: string): Promise<void> {
    await db.delete(youtubeCommentCache).where(eq(youtubeCommentCache.userId, userId));
  }

  async getGscConnection(userId: string): Promise<GscConnection | null> {
    const [row] = await db.select().from(gscConnections).where(eq(gscConnections.userId, userId));
    return row ?? null;
  }

  async upsertGscConnection(userId: string, data: { oauthAccessToken: string; oauthRefreshToken: string | null; oauthTokenExpiry: Date | null; connectedEmail: string }): Promise<GscConnection> {
    const [row] = await db
      .insert(gscConnections)
      .values({ userId, ...data })
      .onConflictDoUpdate({
        target: gscConnections.userId,
        set: { oauthAccessToken: data.oauthAccessToken, oauthRefreshToken: data.oauthRefreshToken, oauthTokenExpiry: data.oauthTokenExpiry, connectedEmail: data.connectedEmail },
      })
      .returning();
    return row;
  }

  async setGscSelectedSite(userId: string, siteUrl: string): Promise<void> {
    await db.update(gscConnections).set({ selectedSiteUrl: siteUrl }).where(eq(gscConnections.userId, userId));
  }

  async deleteGscConnection(userId: string): Promise<void> {
    await db.delete(gscConnections).where(eq(gscConnections.userId, userId));
  }

  async updateGscAccessToken(userId: string, accessToken: string, expiry: Date | null): Promise<void> {
    await db
      .update(gscConnections)
      .set({ oauthAccessToken: accessToken, oauthTokenExpiry: expiry })
      .where(eq(gscConnections.userId, userId));
  }

  async getGscAnalyticsCache(userId: string, cacheKey: string): Promise<{ data: any; updatedAt: Date } | null> {
    const [row] = await db
      .select()
      .from(gscAnalyticsCache)
      .where(and(eq(gscAnalyticsCache.userId, userId), eq(gscAnalyticsCache.cacheKey, cacheKey)));
    if (!row) return null;
    return { data: row.dataJson, updatedAt: row.updatedAt };
  }

  async setGscAnalyticsCache(userId: string, cacheKey: string, data: any): Promise<void> {
    await db
      .insert(gscAnalyticsCache)
      .values({ userId, cacheKey, dataJson: data, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [gscAnalyticsCache.userId, gscAnalyticsCache.cacheKey],
        set: { dataJson: data, updatedAt: new Date() },
      });
  }

  async clearGscAnalyticsCache(userId: string): Promise<void> {
    await db.delete(gscAnalyticsCache).where(eq(gscAnalyticsCache.userId, userId));
  }

  // ── Inbox Intel (Competitor Email Intelligence) ─────────────────────────────

  async getCompetitorTrackers(userId: string): Promise<CompetitorTrackerWithStats[]> {
    const rows = await db.execute(sql`
      SELECT
        t.id, t.user_id AS "userId", t.name, t.website, t.notes,
        t.screenshot_path AS "screenshotPath", t.screenshot_updated_at AS "screenshotUpdatedAt",
        t.screenshot_status AS "screenshotStatus",
        t.created_at AS "createdAt",
        COALESCE((SELECT COUNT(*)::int FROM ${competitorSeedAddresses} s WHERE s.tracker_id = t.id), 0) AS "seedCount",
        COALESCE((SELECT COUNT(*)::int FROM ${capturedCompetitorEmails} e WHERE e.tracker_id = t.id), 0) AS "emailCount",
        COALESCE((SELECT COUNT(*)::int FROM ${capturedCompetitorEmails} e WHERE e.tracker_id = t.id AND e.is_pinned = true), 0) AS "pinnedCount",
        (SELECT MAX(e.received_at) FROM ${capturedCompetitorEmails} e WHERE e.tracker_id = t.id) AS "lastReceivedAt"
      FROM ${competitorTrackers} t
      WHERE t.user_id = ${userId}
      ORDER BY t.created_at DESC
    `);
    return (rows.rows as any[]).map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      website: r.website,
      notes: r.notes,
      screenshotPath: r.screenshotPath || null,
      screenshotUpdatedAt: r.screenshotUpdatedAt ? (r.screenshotUpdatedAt instanceof Date ? r.screenshotUpdatedAt : new Date(r.screenshotUpdatedAt)) : null,
      screenshotStatus: (r.screenshotStatus as ScreenshotStatus | null) || null,
      createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
      seedCount: Number(r.seedCount) || 0,
      emailCount: Number(r.emailCount) || 0,
      pinnedCount: Number(r.pinnedCount) || 0,
      lastReceivedAt: r.lastReceivedAt ? (r.lastReceivedAt instanceof Date ? r.lastReceivedAt : new Date(r.lastReceivedAt)) : null,
    }));
  }

  async setCompetitorTrackerScreenshot(id: string, screenshotPath: string | null, status?: ScreenshotStatus): Promise<void> {
    const resolvedStatus: ScreenshotStatus = status ?? (screenshotPath ? "ready" : "none");
    await db
      .update(competitorTrackers)
      .set({
        screenshotPath,
        screenshotUpdatedAt: screenshotPath ? new Date() : null,
        screenshotStatus: resolvedStatus,
      })
      .where(eq(competitorTrackers.id, id));
  }

  async setCompetitorTrackerScreenshotStatus(id: string, status: ScreenshotStatus): Promise<void> {
    await db
      .update(competitorTrackers)
      .set({ screenshotStatus: status })
      .where(eq(competitorTrackers.id, id));
  }

  async getCompetitorTracker(id: string, userId: string): Promise<CompetitorTracker | undefined> {
    const [row] = await db
      .select()
      .from(competitorTrackers)
      .where(and(eq(competitorTrackers.id, id), eq(competitorTrackers.userId, userId)));
    return row || undefined;
  }

  async createCompetitorTracker(userId: string, data: InsertCompetitorTracker): Promise<CompetitorTracker> {
    const [row] = await db
      .insert(competitorTrackers)
      .values({
        userId,
        name: data.name,
        website: data.website || null,
        notes: data.notes || null,
      })
      .returning();
    return row;
  }

  async updateCompetitorTracker(
    id: string,
    userId: string,
    data: Partial<InsertCompetitorTracker>,
  ): Promise<CompetitorTracker | undefined> {
    const updates: any = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.website !== undefined) updates.website = data.website || null;
    if (data.notes !== undefined) updates.notes = data.notes || null;
    if (Object.keys(updates).length === 0) {
      return this.getCompetitorTracker(id, userId);
    }
    const [row] = await db
      .update(competitorTrackers)
      .set(updates)
      .where(and(eq(competitorTrackers.id, id), eq(competitorTrackers.userId, userId)))
      .returning();
    return row || undefined;
  }

  async deleteCompetitorTracker(id: string, userId: string): Promise<void> {
    await db
      .delete(competitorTrackers)
      .where(and(eq(competitorTrackers.id, id), eq(competitorTrackers.userId, userId)));
  }

  async countCompetitorTrackers(userId: string): Promise<number> {
    const [{ value }] = await db
      .select({ value: count() })
      .from(competitorTrackers)
      .where(eq(competitorTrackers.userId, userId));
    return Number(value) || 0;
  }

  async getCompetitorSeedAddresses(trackerId: string, userId: string): Promise<CompetitorSeedAddress[]> {
    return db
      .select()
      .from(competitorSeedAddresses)
      .where(and(eq(competitorSeedAddresses.trackerId, trackerId), eq(competitorSeedAddresses.userId, userId)))
      .orderBy(asc(competitorSeedAddresses.createdAt));
  }

  async getCompetitorSeedByToken(token: string): Promise<CompetitorSeedAddress | undefined> {
    const [row] = await db
      .select()
      .from(competitorSeedAddresses)
      .where(eq(competitorSeedAddresses.token, token));
    return row || undefined;
  }

  async createCompetitorSeedAddress(
    userId: string,
    trackerId: string,
    token: string,
    label?: string,
  ): Promise<CompetitorSeedAddress> {
    const [row] = await db
      .insert(competitorSeedAddresses)
      .values({ userId, trackerId, token, label: label || null })
      .returning();
    return row;
  }

  async deleteCompetitorSeedAddress(id: string, userId: string): Promise<void> {
    await db
      .delete(competitorSeedAddresses)
      .where(and(eq(competitorSeedAddresses.id, id), eq(competitorSeedAddresses.userId, userId)));
  }

  async countCompetitorSeedsForTracker(trackerId: string): Promise<number> {
    const [{ value }] = await db
      .select({ value: count() })
      .from(competitorSeedAddresses)
      .where(eq(competitorSeedAddresses.trackerId, trackerId));
    return Number(value) || 0;
  }

  async incrementSeedReceived(id: string): Promise<void> {
    await db
      .update(competitorSeedAddresses)
      .set({
        receivedCount: sql`${competitorSeedAddresses.receivedCount} + 1`,
        lastReceivedAt: new Date(),
      })
      .where(eq(competitorSeedAddresses.id, id));
  }

  async createCapturedEmail(data: any): Promise<CapturedCompetitorEmail> {
    const [row] = await db.insert(capturedCompetitorEmails).values(data).returning();
    return row;
  }

  async addCapturedEmailLinks(
    emailId: string,
    links: Array<{ url: string; domain?: string; anchorText?: string; position: number; hasUtm: boolean }>,
  ): Promise<void> {
    if (links.length === 0) return;
    await db.insert(capturedCompetitorEmailLinks).values(
      links.map((l) => ({
        emailId,
        url: l.url,
        domain: l.domain || null,
        anchorText: l.anchorText || null,
        position: l.position,
        hasUtm: l.hasUtm,
      })),
    );
  }

  async getCapturedEmails(trackerId: string, userId: string, limit = 200): Promise<CapturedCompetitorEmail[]> {
    return db
      .select()
      .from(capturedCompetitorEmails)
      .where(and(eq(capturedCompetitorEmails.trackerId, trackerId), eq(capturedCompetitorEmails.userId, userId)))
      .orderBy(desc(capturedCompetitorEmails.receivedAt))
      .limit(limit);
  }

  async getCapturedEmail(id: string, userId: string): Promise<CapturedCompetitorEmail | undefined> {
    const [row] = await db
      .select()
      .from(capturedCompetitorEmails)
      .where(and(eq(capturedCompetitorEmails.id, id), eq(capturedCompetitorEmails.userId, userId)));
    return row || undefined;
  }

  async getCapturedEmailLinks(emailId: string): Promise<CapturedCompetitorEmailLink[]> {
    return db
      .select()
      .from(capturedCompetitorEmailLinks)
      .where(eq(capturedCompetitorEmailLinks.emailId, emailId))
      .orderBy(asc(capturedCompetitorEmailLinks.position));
  }

  async setCapturedEmailPin(
    id: string,
    userId: string,
    pinned: boolean,
  ): Promise<CapturedCompetitorEmail | undefined> {
    const [row] = await db
      .update(capturedCompetitorEmails)
      .set({ isPinned: pinned, pinnedAt: pinned ? new Date() : null })
      .where(and(eq(capturedCompetitorEmails.id, id), eq(capturedCompetitorEmails.userId, userId)))
      .returning();
    return row || undefined;
  }

  async countPinnedEmailsForTracker(trackerId: string): Promise<number> {
    const [{ value }] = await db
      .select({ value: count() })
      .from(capturedCompetitorEmails)
      .where(and(eq(capturedCompetitorEmails.trackerId, trackerId), eq(capturedCompetitorEmails.isPinned, true)));
    return Number(value) || 0;
  }

  async getTrackerAnalytics(trackerId: string, userId: string): Promise<TrackerAnalytics> {
    const { computeTrackerAnalytics } = await import("./inboxIntel");
    // Verify ownership: getCompetitorTracker scopes by userId
    const tracker = await this.getCompetitorTracker(trackerId, userId);
    if (!tracker) {
      return computeTrackerAnalytics([], [], 0);
    }
    // All metric columns retained forever — pull just what we need
    const emails = await db
      .select({
        receivedAt: capturedCompetitorEmails.receivedAt,
        subject: capturedCompetitorEmails.subject,
        subjectLength: capturedCompetitorEmails.subjectLength,
        subjectHasEmoji: capturedCompetitorEmails.subjectHasEmoji,
        subjectIsAllCaps: capturedCompetitorEmails.subjectIsAllCaps,
        wordCount: capturedCompetitorEmails.wordCount,
        linkCount: capturedCompetitorEmails.linkCount,
        imageCount: capturedCompetitorEmails.imageCount,
        spfResult: capturedCompetitorEmails.spfResult,
        dkimResult: capturedCompetitorEmails.dkimResult,
        dmarcResult: capturedCompetitorEmails.dmarcResult,
        listUnsubscribePresent: capturedCompetitorEmails.listUnsubscribePresent,
        listUnsubscribePostPresent: capturedCompetitorEmails.listUnsubscribePostPresent,
        detectedEsp: capturedCompetitorEmails.detectedEsp,
      })
      .from(capturedCompetitorEmails)
      .where(and(eq(capturedCompetitorEmails.trackerId, trackerId), eq(capturedCompetitorEmails.userId, userId)));

    // Top link domains across all this tracker's emails
    const domainRows = await db.execute(sql`
      SELECT l.domain AS domain, COUNT(*)::int AS count
      FROM ${capturedCompetitorEmailLinks} l
      JOIN ${capturedCompetitorEmails} e ON l.email_id = e.id
      WHERE e.tracker_id = ${trackerId}
        AND e.user_id = ${userId}
        AND l.domain IS NOT NULL
        AND l.domain <> ''
      GROUP BY l.domain
      ORDER BY count DESC
      LIMIT 5
    `);
    const topLinkDomains = (domainRows.rows as any[]).map((r) => ({
      value: String(r.domain),
      count: Number(r.count) || 0,
    }));

    // Distinct emails that contain at least one UTM-tagged link
    const utmRows = await db.execute(sql`
      SELECT COUNT(DISTINCT e.id)::int AS count
      FROM ${capturedCompetitorEmails} e
      JOIN ${capturedCompetitorEmailLinks} l ON l.email_id = e.id
      WHERE e.tracker_id = ${trackerId}
        AND e.user_id = ${userId}
        AND l.has_utm = true
    `);
    const emailsWithUtmCount = Number((utmRows.rows[0] as any)?.count) || 0;

    return computeTrackerAnalytics(emails as any, topLinkDomains, emailsWithUtmCount);
  }

  async getCapturedEmailsFeed(
    userId: string,
    filters: {
      trackerIds?: string[];
      esp?: string;
      search?: string;
      pinnedOnly?: boolean;
      from?: Date;
      to?: Date;
      limit?: number;
    },
  ): Promise<FeedResponse> {
    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);

    // Tracker list for the filter dropdown (scoped to user)
    const trackerRows = await db
      .select({ id: competitorTrackers.id, name: competitorTrackers.name })
      .from(competitorTrackers)
      .where(eq(competitorTrackers.userId, userId))
      .orderBy(asc(competitorTrackers.name));
    const trackers = trackerRows.map((t) => ({ id: t.id, name: t.name }));
    const ownedTrackerIds = new Set(trackers.map((t) => t.id));

    // Distinct ESPs the user has seen (for filter dropdown)
    const espRows = await db.execute(sql`
      SELECT DISTINCT detected_esp
      FROM ${capturedCompetitorEmails}
      WHERE user_id = ${userId} AND detected_esp IS NOT NULL AND detected_esp <> ''
      ORDER BY detected_esp ASC
    `);
    const esps = (espRows.rows as any[]).map((r) => String(r.detected_esp));

    if (trackers.length === 0) {
      return { items: [], total: 0, trackers, esps };
    }

    // Build WHERE clauses
    const conds: any[] = [eq(capturedCompetitorEmails.userId, userId)];
    if (filters.trackerIds && filters.trackerIds.length > 0) {
      const valid = filters.trackerIds.filter((id) => ownedTrackerIds.has(id));
      if (valid.length === 0) {
        return { items: [], total: 0, trackers, esps };
      }
      conds.push(inArray(capturedCompetitorEmails.trackerId, valid));
    }
    if (filters.esp) {
      conds.push(eq(capturedCompetitorEmails.detectedEsp, filters.esp));
    }
    if (filters.pinnedOnly) {
      conds.push(eq(capturedCompetitorEmails.isPinned, true));
    }
    if (filters.from) {
      conds.push(gte(capturedCompetitorEmails.receivedAt, filters.from));
    }
    if (filters.to) {
      conds.push(lte(capturedCompetitorEmails.receivedAt, filters.to));
    }
    if (filters.search && filters.search.trim().length > 0) {
      const q = `%${filters.search.trim().toLowerCase()}%`;
      conds.push(
        sql`(LOWER(${capturedCompetitorEmails.subject}) LIKE ${q}
           OR LOWER(COALESCE(${capturedCompetitorEmails.fromName}, '')) LIKE ${q}
           OR LOWER(COALESCE(${capturedCompetitorEmails.fromEmail}, '')) LIKE ${q})`,
      );
    }

    const where = and(...conds);

    const [{ value: totalCount } = { value: 0 }] = await db
      .select({ value: count() })
      .from(capturedCompetitorEmails)
      .where(where);

    const rows = await db
      .select({
        id: capturedCompetitorEmails.id,
        trackerId: capturedCompetitorEmails.trackerId,
        trackerName: competitorTrackers.name,
        subject: capturedCompetitorEmails.subject,
        fromName: capturedCompetitorEmails.fromName,
        fromEmail: capturedCompetitorEmails.fromEmail,
        fromDomain: capturedCompetitorEmails.fromDomain,
        detectedEsp: capturedCompetitorEmails.detectedEsp,
        receivedAt: capturedCompetitorEmails.receivedAt,
        isPinned: capturedCompetitorEmails.isPinned,
        bodyAvailable: capturedCompetitorEmails.bodyAvailable,
        wordCount: capturedCompetitorEmails.wordCount,
        linkCount: capturedCompetitorEmails.linkCount,
        subjectHasEmoji: capturedCompetitorEmails.subjectHasEmoji,
      })
      .from(capturedCompetitorEmails)
      .innerJoin(competitorTrackers, eq(capturedCompetitorEmails.trackerId, competitorTrackers.id))
      .where(where)
      .orderBy(desc(capturedCompetitorEmails.receivedAt))
      .limit(limit);

    return {
      items: rows.map((r) => ({
        id: r.id,
        trackerId: r.trackerId,
        trackerName: r.trackerName,
        subject: r.subject,
        fromName: r.fromName,
        fromEmail: r.fromEmail,
        fromDomain: r.fromDomain,
        detectedEsp: r.detectedEsp,
        receivedAt: r.receivedAt,
        isPinned: r.isPinned,
        bodyAvailable: r.bodyAvailable,
        wordCount: r.wordCount,
        linkCount: r.linkCount,
        subjectHasEmoji: r.subjectHasEmoji,
      })),
      total: Number(totalCount) || 0,
      trackers,
      esps,
    };
  }

  async getEmailsForCsvExport(
    userId: string,
    filters: {
      trackerIds?: string[];
      esp?: string;
      search?: string;
      pinnedOnly?: boolean;
      from?: Date;
      to?: Date;
      limit?: number;
    },
  ): Promise<Array<{ trackerName: string; email: CapturedCompetitorEmail }>> {
    const limit = Math.min(Math.max(filters.limit ?? 5000, 1), 5000);

    const ownedIds = (
      await db
        .select({ id: competitorTrackers.id })
        .from(competitorTrackers)
        .where(eq(competitorTrackers.userId, userId))
    ).map((r) => r.id);
    const ownedSet = new Set(ownedIds);
    if (ownedIds.length === 0) return [];

    const conds: any[] = [eq(capturedCompetitorEmails.userId, userId)];
    if (filters.trackerIds && filters.trackerIds.length > 0) {
      const valid = filters.trackerIds.filter((id) => ownedSet.has(id));
      if (valid.length === 0) return [];
      conds.push(inArray(capturedCompetitorEmails.trackerId, valid));
    }
    if (filters.esp) conds.push(eq(capturedCompetitorEmails.detectedEsp, filters.esp));
    if (filters.pinnedOnly) conds.push(eq(capturedCompetitorEmails.isPinned, true));
    if (filters.from) conds.push(gte(capturedCompetitorEmails.receivedAt, filters.from));
    if (filters.to) conds.push(lte(capturedCompetitorEmails.receivedAt, filters.to));
    if (filters.search && filters.search.trim().length > 0) {
      const q = `%${filters.search.trim().toLowerCase()}%`;
      conds.push(
        sql`(LOWER(${capturedCompetitorEmails.subject}) LIKE ${q}
           OR LOWER(COALESCE(${capturedCompetitorEmails.fromName}, '')) LIKE ${q}
           OR LOWER(COALESCE(${capturedCompetitorEmails.fromEmail}, '')) LIKE ${q})`,
      );
    }

    // Defense-in-depth: also constrain the joined tracker to the same userId so
    // a row whose userId somehow slipped past (or whose trackerId points to
    // someone else's tracker) is filtered at the SQL layer too.
    conds.push(eq(competitorTrackers.userId, userId));

    const rows = await db
      .select({
        trackerName: competitorTrackers.name,
        email: capturedCompetitorEmails,
      })
      .from(capturedCompetitorEmails)
      .innerJoin(competitorTrackers, eq(capturedCompetitorEmails.trackerId, competitorTrackers.id))
      .where(and(...conds))
      .orderBy(desc(capturedCompetitorEmails.receivedAt))
      .limit(limit);

    return rows.map((r) => ({ trackerName: r.trackerName, email: r.email }));
  }

  // Null-out HTML/plain bodies for non-pinned emails beyond the latest N.
  // Keeps the row (so metrics live forever) but reclaims storage.
  async pruneOldCapturedBodies(trackerId: string, keepLatest: number): Promise<number> {
    const result = await db.execute(sql`
      UPDATE ${capturedCompetitorEmails}
      SET html_body = NULL,
          plain_body = NULL,
          body_available = false
      WHERE id IN (
        SELECT id FROM ${capturedCompetitorEmails}
        WHERE tracker_id = ${trackerId}
          AND is_pinned = false
          AND body_available = true
        ORDER BY received_at DESC
        OFFSET ${keepLatest}
      )
    `);
    return (result as any).rowCount || 0;
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  async getNotificationPrefs(userId: string): Promise<{ allEnabled: boolean; preferences: import("@shared/schema").NotificationPreferences }> {
    const result = await pool.query(
      `SELECT all_enabled, preferences FROM notification_preferences WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (!result.rows.length) {
      const { DEFAULT_NOTIFICATION_PREFERENCES } = await import("@shared/schema");
      return { allEnabled: true, preferences: DEFAULT_NOTIFICATION_PREFERENCES };
    }
    const { DEFAULT_NOTIFICATION_PREFERENCES } = await import("@shared/schema");
    return {
      allEnabled: result.rows[0].all_enabled,
      preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES, ...result.rows[0].preferences },
    };
  }

  async upsertNotificationPrefs(userId: string, allEnabled: boolean, preferences: import("@shared/schema").NotificationPreferences): Promise<void> {
    await pool.query(
      `INSERT INTO notification_preferences (user_id, all_enabled, preferences, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET all_enabled = EXCLUDED.all_enabled, preferences = EXCLUDED.preferences, updated_at = NOW()`,
      [userId, allEnabled, JSON.stringify(preferences)]
    );
  }

  async hasNotificationBeenSent(userId: string, type: string, refId: string, since: Date): Promise<boolean> {
    const result = await pool.query(
      `SELECT 1 FROM notification_log WHERE user_id = $1 AND type = $2 AND ref_id = $3 AND sent_at >= $4 LIMIT 1`,
      [userId, type, refId, since]
    );
    return result.rows.length > 0;
  }

  async logNotification(userId: string, type: string, refId: string | null): Promise<void> {
    await pool.query(
      `INSERT INTO notification_log (id, user_id, type, ref_id, sent_at) VALUES (gen_random_uuid(), $1, $2, $3, NOW())`,
      [userId, type, refId]
    );
  }

  async getAllUsersForNotifications(): Promise<Array<{ id: string; email: string | null; displayName: string | null; firstName: string | null; timezone: string }>> {
    const result = await pool.query(
      `SELECT id, email, display_name, first_name, timezone FROM users WHERE is_disabled = false OR is_disabled IS NULL ORDER BY created_at ASC`
    );
    return result.rows.map((r: any) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      firstName: r.first_name,
      timezone: r.timezone || "America/New_York",
    }));
  }

  async getAdminUsersForNotifications(): Promise<Array<{ id: string; email: string | null; displayName: string | null; firstName: string | null }>> {
    const result = await pool.query(
      `SELECT id, email, display_name, first_name FROM users WHERE is_admin = true AND (is_disabled = false OR is_disabled IS NULL)`
    );
    return result.rows.map((r: any) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      firstName: r.first_name,
    }));
  }

  async getEmailTemplateOverride(key: string): Promise<{ subjectOverride: string | null; htmlOverride: string | null } | null> {
    const result = await pool.query(
      'SELECT subject_override, html_override FROM email_template_overrides WHERE template_key = $1',
      [key]
    );
    if (!result.rows[0]) return null;
    return { subjectOverride: result.rows[0].subject_override, htmlOverride: result.rows[0].html_override };
  }

  async getAllEmailTemplateOverrides(): Promise<Array<{ templateKey: string; subjectOverride: string | null; updatedAt: Date }>> {
    const result = await pool.query(
      'SELECT template_key, subject_override, updated_at FROM email_template_overrides ORDER BY template_key'
    );
    return result.rows.map((r: any) => ({ templateKey: r.template_key, subjectOverride: r.subject_override, updatedAt: new Date(r.updated_at) }));
  }

  async upsertEmailTemplateOverride(key: string, subjectOverride: string | null, htmlOverride: string | null): Promise<void> {
    await pool.query(
      `INSERT INTO email_template_overrides (template_key, subject_override, html_override, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (template_key) DO UPDATE
       SET subject_override = EXCLUDED.subject_override, html_override = EXCLUDED.html_override, updated_at = NOW()`,
      [key, subjectOverride, htmlOverride]
    );
  }

  async deleteEmailTemplateOverride(key: string): Promise<void> {
    await pool.query('DELETE FROM email_template_overrides WHERE template_key = $1', [key]);
  }

  async getActiveEmailResources(): Promise<Array<{ id: string; description: string; url: string; anchorText: string; sortOrder: number }>> {
    const result = await pool.query(
      'SELECT id, description, url, anchor_text, sort_order FROM email_resource_links WHERE is_active = TRUE ORDER BY sort_order ASC, created_at ASC'
    );
    return result.rows.map((r: any) => ({ id: r.id, description: r.description, url: r.url, anchorText: r.anchor_text, sortOrder: r.sort_order }));
  }

  async getAllEmailResources(): Promise<Array<{ id: string; description: string; url: string; anchorText: string; sortOrder: number; isActive: boolean }>> {
    const result = await pool.query(
      'SELECT id, description, url, anchor_text, sort_order, is_active FROM email_resource_links ORDER BY sort_order ASC, created_at ASC'
    );
    return result.rows.map((r: any) => ({ id: r.id, description: r.description, url: r.url, anchorText: r.anchor_text, sortOrder: r.sort_order, isActive: r.is_active }));
  }

  async createEmailResource(data: { description: string; url: string; anchorText: string; sortOrder: number }): Promise<{ id: string }> {
    const result = await pool.query(
      'INSERT INTO email_resource_links (description, url, anchor_text, sort_order) VALUES ($1, $2, $3, $4) RETURNING id',
      [data.description, data.url, data.anchorText, data.sortOrder]
    );
    return { id: result.rows[0].id };
  }

  async updateEmailResource(id: string, data: Partial<{ description: string; url: string; anchorText: string; sortOrder: number; isActive: boolean }>): Promise<void> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (data.description !== undefined) { setClauses.push(`description = $${idx++}`); values.push(data.description); }
    if (data.url !== undefined) { setClauses.push(`url = $${idx++}`); values.push(data.url); }
    if (data.anchorText !== undefined) { setClauses.push(`anchor_text = $${idx++}`); values.push(data.anchorText); }
    if (data.sortOrder !== undefined) { setClauses.push(`sort_order = $${idx++}`); values.push(data.sortOrder); }
    if (data.isActive !== undefined) { setClauses.push(`is_active = $${idx++}`); values.push(data.isActive); }
    if (setClauses.length === 0) return;
    values.push(id);
    await pool.query(`UPDATE email_resource_links SET ${setClauses.join(", ")} WHERE id = $${idx}`, values);
  }

  async deleteEmailResource(id: string): Promise<void> {
    await pool.query('DELETE FROM email_resource_links WHERE id = $1', [id]);
  }

  async getDmoEntriesForWeek(userId: string, tz: string): Promise<import("@shared/schema").DmoEntry[]> {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
    const startOfWeek = new Date(now);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startKey = startOfWeek.toISOString().slice(0, 10);
    const endKey = now.toISOString().slice(0, 10);
    return db.select().from(dmoEntries)
      .where(and(
        eq(dmoEntries.userId, userId),
        sql`${dmoEntries.date} >= ${startKey}`,
        sql`${dmoEntries.date} <= ${endKey}`
      ))
      .orderBy(desc(dmoEntries.date));
  }

  // ─── Feedback ────────────────────────────────────────────────────────────────
  async getFeedbackPosts(userId: string, isAdmin: boolean, type?: string, status?: string): Promise<FeedbackPostWithMeta[]> {
    const rows = await db.execute(sql`
      SELECT
        fp.*,
        u.display_name AS user_name,
        u.email AS user_email,
        COALESCE(v.vote_count, 0)::int AS vote_count,
        COALESCE(c.comment_count, 0)::int AS comment_count,
        CASE WHEN mv.user_id IS NOT NULL THEN TRUE ELSE FALSE END AS has_voted
      FROM feedback_posts fp
      JOIN users u ON u.id = fp.user_id
      LEFT JOIN (
        SELECT post_id, COUNT(*)::int AS vote_count FROM feedback_votes GROUP BY post_id
      ) v ON v.post_id = fp.id
      LEFT JOIN (
        SELECT post_id, COUNT(*)::int AS comment_count FROM feedback_comments WHERE is_admin_note = FALSE GROUP BY post_id
      ) c ON c.post_id = fp.id
      LEFT JOIN feedback_votes mv ON mv.post_id = fp.id AND mv.user_id = ${userId}
      WHERE (
        fp.type = 'feature'
        OR (fp.type = 'bug' AND (fp.user_id = ${userId} OR ${isAdmin}))
      )
      ${type ? sql`AND fp.type = ${type}` : sql``}
      ${status ? sql`AND fp.status = ${status}` : sql``}
      ORDER BY
        CASE WHEN fp.type = 'feature' THEN COALESCE(v.vote_count, 0) ELSE 0 END DESC,
        fp.created_at DESC
    `);
    return (rows.rows as any[]).map(r => ({
      id: r.id,
      userId: r.user_id,
      type: r.type,
      title: r.title,
      description: r.description,
      status: r.status,
      adminResponse: r.admin_response ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      voteCount: Number(r.vote_count),
      hasVoted: Boolean(r.has_voted),
      commentCount: Number(r.comment_count),
      userName: r.user_name ?? r.user_email ?? "Member",
      userEmail: r.user_email ?? "",
    }));
  }

  async getFeedbackPost(id: string, userId: string, isAdmin: boolean): Promise<(FeedbackPostWithMeta & { comments: FeedbackCommentWithUser[] }) | undefined> {
    const rows = await db.execute(sql`
      SELECT
        fp.*,
        u.display_name AS user_name,
        u.email AS user_email,
        COALESCE(v.vote_count, 0)::int AS vote_count,
        COALESCE(c.comment_count, 0)::int AS comment_count,
        CASE WHEN mv.user_id IS NOT NULL THEN TRUE ELSE FALSE END AS has_voted
      FROM feedback_posts fp
      JOIN users u ON u.id = fp.user_id
      LEFT JOIN (
        SELECT post_id, COUNT(*)::int AS vote_count FROM feedback_votes GROUP BY post_id
      ) v ON v.post_id = fp.id
      LEFT JOIN (
        SELECT post_id, COUNT(*)::int AS comment_count FROM feedback_comments WHERE is_admin_note = FALSE GROUP BY post_id
      ) c ON c.post_id = fp.id
      LEFT JOIN feedback_votes mv ON mv.post_id = fp.id AND mv.user_id = ${userId}
      WHERE fp.id = ${id}
        AND (
          fp.type = 'feature'
          OR (fp.type = 'bug' AND (fp.user_id = ${userId} OR ${isAdmin}))
        )
    `);
    if (!rows.rows.length) return undefined;
    const r = rows.rows[0] as any;
    const post: FeedbackPostWithMeta = {
      id: r.id,
      userId: r.user_id,
      type: r.type,
      title: r.title,
      description: r.description,
      status: r.status,
      adminResponse: r.admin_response ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      voteCount: Number(r.vote_count),
      hasVoted: Boolean(r.has_voted),
      commentCount: Number(r.comment_count),
      userName: r.user_name ?? r.user_email ?? "Member",
      userEmail: r.user_email ?? "",
    };

    const commentRows = await db.execute(sql`
      SELECT fc.*, u.display_name AS user_name, u.email AS user_email
      FROM feedback_comments fc
      JOIN users u ON u.id = fc.user_id
      WHERE fc.post_id = ${id}
        AND (fc.is_admin_note = FALSE OR ${isAdmin})
      ORDER BY fc.created_at ASC
    `);
    const comments: FeedbackCommentWithUser[] = (commentRows.rows as any[]).map(c => ({
      id: c.id,
      postId: c.post_id,
      userId: c.user_id,
      body: c.body,
      isAdminNote: Boolean(c.is_admin_note),
      createdAt: c.created_at,
      userName: c.user_name ?? c.user_email ?? "Member",
      userEmail: c.user_email ?? "",
    }));

    return { ...post, comments };
  }

  async createFeedbackPost(data: InsertFeedbackPost & { userId: string; screenshotPath?: string | null }): Promise<FeedbackPost> {
    const [post] = await db.insert(feedbackPosts).values({
      userId: data.userId,
      type: data.type,
      title: data.title,
      description: data.description,
      status: "open",
      screenshotPath: data.screenshotPath ?? null,
    }).returning();
    return post;
  }

  async toggleFeedbackVote(postId: string, userId: string): Promise<{ voted: boolean }> {
    const existing = await db.select().from(feedbackVotes)
      .where(and(eq(feedbackVotes.postId, postId), eq(feedbackVotes.userId, userId)));
    if (existing.length > 0) {
      await db.delete(feedbackVotes).where(and(eq(feedbackVotes.postId, postId), eq(feedbackVotes.userId, userId)));
      return { voted: false };
    } else {
      await db.insert(feedbackVotes).values({ postId, userId });
      return { voted: true };
    }
  }

  async addFeedbackComment(postId: string, userId: string, body: string, isAdminNote: boolean): Promise<FeedbackCommentWithUser> {
    const [comment] = await db.insert(feedbackComments).values({ postId, userId, body, isAdminNote }).returning();
    const user = await this.getUser(userId);
    return {
      ...comment,
      userName: user?.displayName ?? user?.email ?? "Member",
      userEmail: user?.email ?? "",
    };
  }

  async updateFeedbackPost(id: string, updates: { status?: string; adminResponse?: string }): Promise<FeedbackPost | undefined> {
    const [post] = await db.update(feedbackPosts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(feedbackPosts.id, id))
      .returning();
    return post;
  }

  async deleteFeedbackPost(id: string): Promise<void> {
    await db.delete(feedbackPosts).where(eq(feedbackPosts.id, id));
  }

  // ── Workspace Collaborators ───────────────────────────────────────────────

  async getWorkspaceInvites(ownerId: string): Promise<WorkspaceInviteWithMember[]> {
    const rows = await db.select({
      id: workspaceInvites.id,
      ownerId: workspaceInvites.ownerId,
      inviteEmail: workspaceInvites.inviteEmail,
      inviteToken: workspaceInvites.inviteToken,
      status: workspaceInvites.status,
      memberId: workspaceInvites.memberId,
      createdAt: workspaceInvites.createdAt,
      acceptedAt: workspaceInvites.acceptedAt,
      memberDisplayName: users.displayName,
      memberEmail: users.email,
    })
    .from(workspaceInvites)
    .leftJoin(users, eq(workspaceInvites.memberId, users.id))
    .where(eq(workspaceInvites.ownerId, ownerId))
    .orderBy(desc(workspaceInvites.createdAt));
    return rows;
  }

  async getUserActivityStats(userId: string): Promise<{ projectCount: number; taskCount: number; tasksDoneCount: number; dmoLast30Days: number }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString().slice(0, 10); // YYYY-MM-DD

    const [projectResult, taskResult, tasksDoneResult, dmoResult] = await Promise.all([
      db.select({ c: count() }).from(projects).where(eq(projects.userId, userId)),
      db.select({ c: count() }).from(projectTasks).where(and(eq(projectTasks.userId, userId), isNull(projectTasks.parentTaskId))),
      db.select({ c: count() }).from(projectTasks).where(and(eq(projectTasks.userId, userId), isNull(projectTasks.parentTaskId), eq(projectTasks.status, "done"))),
      db.select({ c: count() }).from(dmoEntries).where(and(eq(dmoEntries.userId, userId), gte(dmoEntries.date, cutoffDate))),
    ]);

    return {
      projectCount: Number(projectResult[0]?.c ?? 0),
      taskCount: Number(taskResult[0]?.c ?? 0),
      tasksDoneCount: Number(tasksDoneResult[0]?.c ?? 0),
      dmoLast30Days: Number(dmoResult[0]?.c ?? 0),
    };
  }

  async getMemberEngagementAnalytics(days: number): Promise<{
    totalMembers: number;
    activeMembers: number;
    returningMembers: number;
    neverLoggedIn: number;
    features: Array<{ key: string; label: string; members: number; events: number; lastUsedAt: Date | null }>;
    weeklyActivity: Array<{ week: string; members: number }>;
  }> {
    const safeDays = Math.min(Math.max(days, 1), 3650);
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    const memberCondition = sql`COALESCE(${users.isAdmin}, false) = false`;
    const featureKey = sql<string>`CASE
      WHEN ${userActionLog.actionType} IN ('session_created', 'session_deleted', 'session_title_updated', 'session_moved_to_folder', 'transcript_regenerated', 'video_uploaded', 'processing_completed') THEN 'video_scoring'
      WHEN ${userActionLog.actionType} IN ('project_created', 'project_updated', 'project_deleted', 'task_created', 'task_updated', 'task_completed', 'task_deleted') THEN 'projects'
      WHEN ${userActionLog.actionType} = 'dmo_logged' THEN 'dmo'
      WHEN ${userActionLog.actionType} IN ('topic_searched', 'script_generated', 'script_deleted') THEN 'scripts'
      WHEN ${userActionLog.actionType} IN ('teleprompter_script_created', 'teleprompter_script_updated', 'teleprompter_script_deleted', 'teleprompter_recording_uploaded') THEN 'teleprompter'
      WHEN ${userActionLog.actionType} = 'feature_viewed' THEN COALESCE(${userActionLog.metadataJson}->>'feature', 'other')
      ELSE 'other'
    END`;
    const featureLabel = sql<string>`CASE (${featureKey})
      WHEN 'video_scoring' THEN 'Video Scoring'
      WHEN 'projects' THEN 'Projects & Tasks'
      WHEN 'dmo' THEN 'DMO Tracker'
      WHEN 'scripts' THEN 'Scripts & Topics'
      WHEN 'teleprompter' THEN 'Teleprompter'
      WHEN 'inbox_analyzer' THEN 'Inbox Analyzer'
      WHEN 'funnel_planner' THEN 'Funnel Planner'
      WHEN 'swipe_file' THEN 'Swipe File'
      WHEN 'link_vault' THEN 'Link Vault'
      WHEN 'training' THEN 'Training'
      WHEN 'analytics' THEN 'Analytics'
      ELSE 'Other Toolkit activity'
    END`;
    const activityCondition = and(memberCondition, gte(userActionLog.createdAt, since));

    const [totals, featureRows, returningRows, weeklyRows] = await Promise.all([
      db.select({
        totalMembers: sql<number>`count(*)::int`,
        neverLoggedIn: sql<number>`count(*) filter (where ${users.lastLoginAt} is null)::int`,
      }).from(users).where(memberCondition),
      db.select({
        key: featureKey,
        label: featureLabel,
        members: sql<number>`count(distinct ${userActionLog.userId})::int`,
        events: sql<number>`count(*)::int`,
        lastUsedAt: sql<Date | null>`max(${userActionLog.createdAt})`,
      }).from(userActionLog).innerJoin(users, eq(userActionLog.userId, users.id))
        .where(activityCondition).groupBy(featureKey, featureLabel).orderBy(desc(sql`count(distinct ${userActionLog.userId})`)),
      db.execute(sql`SELECT count(*)::int AS count FROM (
        SELECT ${userActionLog.userId}
        FROM ${userActionLog}
        INNER JOIN ${users} ON ${userActionLog.userId} = ${users.id}
        WHERE ${memberCondition} AND ${userActionLog.createdAt} >= ${since}
        GROUP BY ${userActionLog.userId}
        HAVING count(DISTINCT date(${userActionLog.createdAt})) >= 2
      ) returning_members`),
      db.execute(sql`SELECT to_char(date_trunc('week', ${userActionLog.createdAt}), 'Mon DD') AS week,
        count(DISTINCT ${userActionLog.userId})::int AS members
        FROM ${userActionLog}
        INNER JOIN ${users} ON ${userActionLog.userId} = ${users.id}
        WHERE ${memberCondition} AND ${userActionLog.createdAt} >= ${since}
        GROUP BY date_trunc('week', ${userActionLog.createdAt})
        ORDER BY date_trunc('week', ${userActionLog.createdAt}) ASC`),
    ]);
    const activeRows = await db.select({ count: sql<number>`count(distinct ${userActionLog.userId})::int` })
      .from(userActionLog).innerJoin(users, eq(userActionLog.userId, users.id)).where(activityCondition);

    return {
      totalMembers: Number(totals[0]?.totalMembers ?? 0),
      neverLoggedIn: Number(totals[0]?.neverLoggedIn ?? 0),
      activeMembers: Number(activeRows[0]?.count ?? 0),
      returningMembers: Number((returningRows as any).rows?.[0]?.count ?? 0),
      features: featureRows.filter((row) => row.key !== "other").map((row) => ({
        key: row.key,
        label: row.label,
        members: Number(row.members),
        events: Number(row.events),
        lastUsedAt: row.lastUsedAt,
      })),
      weeklyActivity: ((weeklyRows as any).rows ?? []).map((row: any) => ({
        week: String(row.week),
        members: Number(row.members),
      })),
    };
  }

  async getUserFeatureUsage(userId: string, days: number): Promise<Array<{ key: string; label: string; events: number; lastUsedAt: Date | null }>> {
    const safeDays = Math.min(Math.max(days, 1), 3650);
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    const featureKey = sql<string>`CASE
      WHEN ${userActionLog.actionType} IN ('session_created', 'session_deleted', 'session_title_updated', 'session_moved_to_folder', 'transcript_regenerated', 'video_uploaded', 'processing_completed') THEN 'video_scoring'
      WHEN ${userActionLog.actionType} IN ('project_created', 'project_updated', 'project_deleted', 'task_created', 'task_updated', 'task_completed', 'task_deleted') THEN 'projects'
      WHEN ${userActionLog.actionType} = 'dmo_logged' THEN 'dmo'
      WHEN ${userActionLog.actionType} IN ('topic_searched', 'script_generated', 'script_deleted') THEN 'scripts'
      WHEN ${userActionLog.actionType} IN ('teleprompter_script_created', 'teleprompter_script_updated', 'teleprompter_script_deleted', 'teleprompter_recording_uploaded') THEN 'teleprompter'
      WHEN ${userActionLog.actionType} = 'feature_viewed' THEN COALESCE(${userActionLog.metadataJson}->>'feature', 'other')
      ELSE 'other'
    END`;
    const featureLabel = sql<string>`CASE (${featureKey})
      WHEN 'video_scoring' THEN 'Video Scoring' WHEN 'projects' THEN 'Projects & Tasks' WHEN 'dmo' THEN 'DMO Tracker'
      WHEN 'scripts' THEN 'Scripts & Topics' WHEN 'teleprompter' THEN 'Teleprompter' WHEN 'inbox_analyzer' THEN 'Inbox Analyzer'
      WHEN 'funnel_planner' THEN 'Funnel Planner' WHEN 'swipe_file' THEN 'Swipe File' WHEN 'link_vault' THEN 'Link Vault'
      WHEN 'training' THEN 'Training' WHEN 'analytics' THEN 'Analytics' ELSE 'Other Toolkit activity' END`;
    const rows = await db.select({
      key: featureKey,
      label: featureLabel,
      events: sql<number>`count(*)::int`,
      lastUsedAt: sql<Date | null>`max(${userActionLog.createdAt})`,
    }).from(userActionLog).where(and(eq(userActionLog.userId, userId), gte(userActionLog.createdAt, since)))
      .groupBy(featureKey, featureLabel).orderBy(desc(sql`max(${userActionLog.createdAt})`));
    return rows.filter((row) => row.key !== "other").map((row) => ({
      key: row.key, label: row.label, events: Number(row.events), lastUsedAt: row.lastUsedAt,
    }));
  }

  async getMemberHealth(): Promise<Array<{
    id: string; email: string | null; displayName: string | null; cfContactId: string | null; cfEnrolled: boolean | null; cfEnrolledAt: Date | null;
    lastLoginAt: Date | null; lastActivityAt: Date | null; courseCompleted: number; courseStarted: number;
    dmoDays30: number; meaningfulActions30: number; segment: "not_started" | "active" | "engaged" | "at_risk";
    reasons: string[];
  }>> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await db.select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      cfContactId: users.cfContactId,
      cfEnrolled: users.cfEnrolled,
      cfEnrolledAt: users.cfEnrolledAt,
      lastLoginAt: users.lastLoginAt,
      lastActivityAt: sql<Date | null>`greatest(max(${userActionLog.createdAt}), max(${courseProgress.lastAccessedAt}), max(${dmoEntries.updatedAt}))`,
      courseCompleted: sql<number>`count(distinct ${courseProgress.id}) filter (where ${courseProgress.completedAt} is not null)::int`,
      courseStarted: sql<number>`count(distinct ${courseProgress.id})::int`,
      dmoDays30: sql<number>`count(distinct ${dmoEntries.id}) filter (where ${dmoEntries.date} >= ${thirtyDaysAgo.toISOString().slice(0, 10)})::int`,
      meaningfulActions30: sql<number>`count(distinct ${userActionLog.id}) filter (where ${userActionLog.createdAt} >= ${thirtyDaysAgo} and ${userActionLog.actionType} not in ('login_success', 'logout', 'account_updated', 'feature_viewed'))::int`,
    }).from(users)
      .leftJoin(courseProgress, eq(courseProgress.userId, users.id))
      .leftJoin(dmoEntries, eq(dmoEntries.userId, users.id))
      .leftJoin(userActionLog, eq(userActionLog.userId, users.id))
      .where(sql`COALESCE(${users.isAdmin}, false) = false`)
      .groupBy(users.id)
      .orderBy(desc(users.cfEnrolledAt), desc(users.createdAt));

    return rows.map((row) => {
      const lastActivityAt = row.lastActivityAt;
      const recent = !!lastActivityAt && lastActivityAt >= thirtyDaysAgo;
      const signals = (Number(row.courseStarted) > 0 ? 1 : 0)
        + (Number(row.dmoDays30) > 0 ? 1 : 0)
        + (Number(row.meaningfulActions30) > 0 ? 1 : 0);
      const segment = !row.lastLoginAt
        ? "not_started"
        : !recent
          ? "at_risk"
          : signals >= 2
            ? "engaged"
            : "active";
      const reasons = [
        !row.lastLoginAt ? "Has access but has not signed in" : `Last login ${row.lastLoginAt.toLocaleDateString()}`,
        Number(row.courseStarted) ? `${row.courseCompleted}/${row.courseStarted} recorded lessons completed` : "No training lesson progress recorded",
        Number(row.dmoDays30) ? `${row.dmoDays30} DMO day${Number(row.dmoDays30) === 1 ? "" : "s"} in the last 30 days` : "No DMO activity in the last 30 days",
        Number(row.meaningfulActions30) ? `${row.meaningfulActions30} meaningful Toolkit action${Number(row.meaningfulActions30) === 1 ? "" : "s"} in the last 30 days` : "No meaningful Toolkit action in the last 30 days",
      ];
      return {
        ...row,
        courseCompleted: Number(row.courseCompleted),
        courseStarted: Number(row.courseStarted),
        dmoDays30: Number(row.dmoDays30),
        meaningfulActions30: Number(row.meaningfulActions30),
        segment,
        reasons,
      };
    });
  }

  async createWorkspaceInvite(ownerId: string, inviteEmail: string, token: string, firstName?: string, lastName?: string): Promise<WorkspaceInvite> {
    const [invite] = await db.insert(workspaceInvites).values({
      ownerId,
      inviteEmail: inviteEmail.toLowerCase().trim(),
      inviteToken: token,
      status: "pending",
      inviteFirstName: firstName?.trim() || null,
      inviteLastName: lastName?.trim() || null,
    }).returning();
    return invite;
  }

  async getWorkspaceInviteByToken(token: string): Promise<WorkspaceInvite | undefined> {
    const [invite] = await db.select().from(workspaceInvites).where(eq(workspaceInvites.inviteToken, token));
    return invite ?? undefined;
  }

  async getActiveInviteForMember(memberId: string, ownerId: string): Promise<WorkspaceInvite | undefined> {
    const [invite] = await db.select().from(workspaceInvites).where(
      and(
        eq(workspaceInvites.memberId, memberId),
        eq(workspaceInvites.ownerId, ownerId),
        eq(workspaceInvites.status, "accepted"),
      )
    );
    return invite ?? undefined;
  }

  async acceptWorkspaceInvite(token: string, memberId: string): Promise<WorkspaceInvite | undefined> {
    const [updated] = await db.update(workspaceInvites)
      .set({ status: "accepted", memberId, acceptedAt: new Date() })
      .where(and(eq(workspaceInvites.inviteToken, token), eq(workspaceInvites.status, "pending")))
      .returning();
    return updated ?? undefined;
  }

  async revokeWorkspaceInvite(id: string, ownerId: string): Promise<void> {
    await db.update(workspaceInvites)
      .set({ status: "revoked", memberId: null, acceptedAt: null })
      .where(and(eq(workspaceInvites.id, id), eq(workspaceInvites.ownerId, ownerId)));
  }

  async refreshWorkspaceInviteToken(id: string, ownerId: string, newToken: string): Promise<WorkspaceInvite | undefined> {
    const [updated] = await db.update(workspaceInvites)
      .set({ inviteToken: newToken })
      .where(and(eq(workspaceInvites.id, id), eq(workspaceInvites.ownerId, ownerId), eq(workspaceInvites.status, "pending")))
      .returning();
    return updated ?? undefined;
  }

  async countActiveWorkspaceInvites(ownerId: string): Promise<number> {
    const [row] = await db.select({ cnt: count() }).from(workspaceInvites).where(
      and(
        eq(workspaceInvites.ownerId, ownerId),
        or(eq(workspaceInvites.status, "pending"), eq(workspaceInvites.status, "accepted")),
      )
    );
    return row?.cnt ?? 0;
  }

  async getCollaboratorOwner(userId: string): Promise<string | undefined> {
    const [row] = await db.select({ ownerId: workspaceInvites.ownerId })
      .from(workspaceInvites)
      .where(and(eq(workspaceInvites.memberId, userId), eq(workspaceInvites.status, "accepted")));
    return row?.ownerId ?? undefined;
  }

  // ─── Funnel Planner ───────────────────────────────────────────────────────

  async getFunnelsByUser(userId: string): Promise<FunnelSummary[]> {
    // Excludes canvasData (large JSONB) — client only needs metadata for the grid.
    // nodeCount is computed in DB so the client never needs to parse canvasData.
    return db.select({
      id: funnels.id,
      userId: funnels.userId,
      name: funnels.name,
      description: funnels.description,
      thumbnailData: funnels.thumbnailData,
      shareToken: funnels.shareToken,
      brainTargeting: funnels.brainTargeting,
      createdAt: funnels.createdAt,
      updatedAt: funnels.updatedAt,
      nodeCount: sql<number>`COALESCE(jsonb_array_length(${funnels.canvasData}->'nodes'), 0)`,
    }).from(funnels).where(eq(funnels.userId, userId)).orderBy(desc(funnels.updatedAt));
  }

  async getFunnelById(id: string): Promise<Funnel | undefined> {
    const [row] = await db.select().from(funnels).where(eq(funnels.id, id));
    return row;
  }

  async getFunnel(id: string, userId: string): Promise<Funnel | undefined> {
    const [row] = await db.select().from(funnels).where(and(eq(funnels.id, id), eq(funnels.userId, userId)));
    return row;
  }

  async createFunnel(userId: string, data: { name: string; description?: string; canvasData?: any }): Promise<Funnel> {
    const [row] = await db.insert(funnels).values({
      userId,
      name: data.name,
      description: data.description ?? null,
      canvasData: data.canvasData ?? { nodes: [], edges: [] },
    }).returning();
    return row;
  }

  async updateFunnel(id: string, userId: string, data: Partial<{ name: string; description: string; canvasData: any; thumbnailData: string }>): Promise<Funnel | undefined> {
    const [row] = await db.update(funnels)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(funnels.id, id), eq(funnels.userId, userId)))
      .returning();
    return row;
  }

  async duplicateFunnel(id: string, userId: string): Promise<Funnel | undefined> {
    const original = await this.getFunnel(id, userId);
    if (!original) return undefined;
    const [row] = await db.insert(funnels).values({
      userId,
      name: `${original.name} (Copy)`,
      description: original.description,
      canvasData: original.canvasData,
    }).returning();
    return row;
  }

  async getFunnelByShareToken(token: string): Promise<Funnel | undefined> {
    const [row] = await db.select().from(funnels).where(eq(funnels.shareToken, token));
    return row;
  }

  async setFunnelShareToken(id: string, userId: string, token: string, passwordHash: string | null): Promise<Funnel | undefined> {
    const [row] = await db.update(funnels)
      .set({ shareToken: token, sharePasswordHash: passwordHash, updatedAt: new Date() })
      .where(and(eq(funnels.id, id), eq(funnels.userId, userId)))
      .returning();
    return row;
  }

  async clearFunnelShareToken(id: string, userId: string): Promise<Funnel | undefined> {
    const [row] = await db.update(funnels)
      .set({ shareToken: null, sharePasswordHash: null, updatedAt: new Date() })
      .where(and(eq(funnels.id, id), eq(funnels.userId, userId)))
      .returning();
    return row;
  }

  async deleteFunnel(id: string, userId: string): Promise<void> {
    await db.delete(funnels).where(and(eq(funnels.id, id), eq(funnels.userId, userId)));
  }

  async updateFunnelBrainTargeting(id: string, userId: string, targeting: string): Promise<void> {
    await db.update(funnels)
      .set({ brainTargeting: targeting, updatedAt: new Date() })
      .where(and(eq(funnels.id, id), eq(funnels.userId, userId)));
  }

  async getFunnelBrainFiles(funnelId: string, userId: string): Promise<FunnelBrainFile[]> {
    return db.select().from(funnelBrainFiles)
      .where(and(eq(funnelBrainFiles.funnelId, funnelId), eq(funnelBrainFiles.userId, userId)))
      .orderBy(asc(funnelBrainFiles.createdAt));
  }

  async addFunnelBrainFile(funnelId: string, userId: string, data: { filename: string; mimeType: string; fileSize: number; extractedText: string }): Promise<FunnelBrainFile> {
    const [row] = await db.insert(funnelBrainFiles).values({
      funnelId,
      userId,
      filename: data.filename,
      mimeType: data.mimeType,
      fileSize: data.fileSize,
      extractedText: data.extractedText,
    }).returning();
    return row;
  }

  async deleteFunnelBrainFile(fileId: string, userId: string): Promise<void> {
    await db.delete(funnelBrainFiles).where(and(eq(funnelBrainFiles.id, fileId), eq(funnelBrainFiles.userId, userId)));
  }

  async countFunnelBrainFiles(funnelId: string): Promise<number> {
    const [row] = await db.select({ cnt: count() }).from(funnelBrainFiles).where(eq(funnelBrainFiles.funnelId, funnelId));
    return row?.cnt ?? 0;
  }

  async getFunnelTemplates(): Promise<FunnelTemplate[]> {
    return db.select().from(funnelTemplates).orderBy(asc(funnelTemplates.createdAt));
  }

  async createFunnelTemplate(data: { name: string; description: string; canvasData: any; createdBy: string }): Promise<FunnelTemplate> {
    const [row] = await db.insert(funnelTemplates).values({
      name: data.name,
      description: data.description,
      canvasData: data.canvasData,
      createdBy: data.createdBy,
    }).returning();
    return row;
  }

  async updateFunnelTemplate(id: string, data: { name?: string; description?: string }): Promise<FunnelTemplate> {
    const [row] = await db.update(funnelTemplates)
      .set({ ...(data.name !== undefined && { name: data.name }), ...(data.description !== undefined && { description: data.description }) })
      .where(eq(funnelTemplates.id, id))
      .returning();
    return row;
  }

  async deleteFunnelTemplate(id: string): Promise<void> {
    await db.delete(funnelTemplates).where(eq(funnelTemplates.id, id));
  }

  // ── Announcements ────────────────────────────────────────────────────────────
  async getActiveAnnouncements(userId: string): Promise<Announcement[]> {
    const [active, dismissed] = await Promise.all([
      db.select().from(announcements)
        .where(eq(announcements.isActive, true))
        .orderBy(asc(announcements.sortOrder), asc(announcements.createdAt)),
      db.select({ announcementId: dismissedAnnouncements.announcementId })
        .from(dismissedAnnouncements)
        .where(eq(dismissedAnnouncements.userId, userId)),
    ]);
    const dismissedIds = new Set(dismissed.map(d => d.announcementId));
    return active.filter(a => !dismissedIds.has(a.id));
  }

  async getAllAnnouncements(): Promise<Announcement[]> {
    return db.select().from(announcements)
      .orderBy(asc(announcements.sortOrder), asc(announcements.createdAt));
  }

  async createAnnouncement(data: InsertAnnouncement): Promise<Announcement> {
    const [maxRow] = await db.select({ max: sql<number>`COALESCE(MAX(sort_order), -1)` }).from(announcements);
    const nextOrder = (maxRow?.max ?? -1) + 1;
    const [row] = await db.insert(announcements).values({ ...data, sortOrder: nextOrder }).returning();
    return row;
  }

  async updateAnnouncement(id: number, data: Partial<InsertAnnouncement>): Promise<Announcement | null> {
    const [row] = await db.update(announcements).set(data).where(eq(announcements.id, id)).returning();
    return row ?? null;
  }

  async deleteAnnouncement(id: number): Promise<void> {
    await db.delete(announcements).where(eq(announcements.id, id));
  }

  async activateAnnouncement(id: number): Promise<void> {
    await db.update(announcements).set({ isActive: true }).where(eq(announcements.id, id));
  }

  async deactivateAnnouncement(id: number): Promise<void> {
    await db.update(announcements).set({ isActive: false }).where(eq(announcements.id, id));
  }

  async reorderAnnouncements(orderedIds: number[]): Promise<void> {
    await Promise.all(
      orderedIds.map((id, idx) =>
        db.update(announcements).set({ sortOrder: idx }).where(eq(announcements.id, id))
      )
    );
  }

  async dismissAnnouncement(userId: string, announcementId: number): Promise<void> {
    await db.insert(dismissedAnnouncements)
      .values({ userId, announcementId })
      .onConflictDoNothing();
  }

  async resetAnnouncementDismissals(id: number): Promise<void> {
    await db.delete(dismissedAnnouncements)
      .where(eq(dismissedAnnouncements.announcementId, id));
  }

  // ─── Affiliate Links ──────────────────────────────────────────────────────────
  async getAffiliateLinks(userId: string, opts?: { q?: string; category?: string; activeOnly?: boolean }): Promise<AffiliateLink[]> {
    const conditions: any[] = [eq(affiliateLinks.userId, userId)];
    if (opts?.activeOnly) conditions.push(eq(affiliateLinks.isActive, true));
    if (opts?.category) conditions.push(eq(affiliateLinks.category, opts.category));
    if (opts?.q) {
      const q = `%${opts.q.trim()}%`;
      conditions.push(or(
        ilike(affiliateLinks.title, q),
        ilike(affiliateLinks.url, q),
        ilike(affiliateLinks.description, q),
        ilike(affiliateLinks.category, q),
      )!);
    }
    return db.select().from(affiliateLinks)
      .where(and(...conditions))
      .orderBy(asc(affiliateLinks.sortOrder), asc(affiliateLinks.createdAt));
  }

  async getAffiliateLinksPage(
    userId: string,
    opts: { q?: string; category?: string; page?: number; limit?: number },
  ): Promise<{ links: AffiliateLink[]; total: number; totalAll: number; totalClicks: number }> {
    const page  = Math.max(1, opts.page  ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const offset = (page - 1) * limit;

    const baseCondition = eq(affiliateLinks.userId, userId);
    const filterConditions: any[] = [baseCondition];
    if (opts.category) filterConditions.push(eq(affiliateLinks.category, opts.category));
    if (opts.q) {
      const q = `%${opts.q.trim()}%`;
      filterConditions.push(or(
        ilike(affiliateLinks.title, q),
        ilike(affiliateLinks.url, q),
        ilike(affiliateLinks.description, q),
        ilike(affiliateLinks.category, q),
      )!);
    }

    const [links, [countRow], [statsRow]] = await Promise.all([
      db.select().from(affiliateLinks)
        .where(and(...filterConditions))
        .orderBy(asc(affiliateLinks.sortOrder), asc(affiliateLinks.createdAt))
        .limit(limit).offset(offset),
      db.select({ total: count() }).from(affiliateLinks)
        .where(and(...filterConditions)),
      db.select({
        totalAll: count(),
        totalClicks: sql<number>`COALESCE(SUM(${affiliateLinks.clickCount}), 0)`,
      }).from(affiliateLinks).where(baseCondition),
    ]);

    return {
      links,
      total:       countRow?.total  ?? 0,
      totalAll:    statsRow?.totalAll    ?? 0,
      totalClicks: Number(statsRow?.totalClicks ?? 0),
    };
  }

  async getAffiliateLink(id: string, userId: string): Promise<AffiliateLink | undefined> {
    const [link] = await db.select().from(affiliateLinks)
      .where(and(eq(affiliateLinks.id, id), eq(affiliateLinks.userId, userId)));
    return link || undefined;
  }

  async createAffiliateLink(userId: string, data: InsertAffiliateLink): Promise<AffiliateLink> {
    const [link] = await db.insert(affiliateLinks)
      .values({ ...data, userId })
      .returning();
    return link;
  }

  async updateAffiliateLink(id: string, userId: string, updates: Partial<InsertAffiliateLink>): Promise<AffiliateLink | undefined> {
    const [link] = await db.update(affiliateLinks)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(affiliateLinks.id, id), eq(affiliateLinks.userId, userId)))
      .returning();
    return link || undefined;
  }

  async deleteAffiliateLink(id: string, userId: string): Promise<void> {
    await db.delete(affiliateLinks)
      .where(and(eq(affiliateLinks.id, id), eq(affiliateLinks.userId, userId)));
  }

  async incrementAffiliateLinkClick(id: string, userId: string): Promise<void> {
    await db.update(affiliateLinks)
      .set({ clickCount: sql`${affiliateLinks.clickCount} + 1`, updatedAt: new Date() })
      .where(and(eq(affiliateLinks.id, id), eq(affiliateLinks.userId, userId)));
  }

  async getAffiliateLinkCategories(userId: string): Promise<string[]> {
    const rows = await db.selectDistinct({ category: affiliateLinks.category })
      .from(affiliateLinks)
      .where(eq(affiliateLinks.userId, userId))
      .orderBy(asc(affiliateLinks.category));
    return rows.map(r => r.category).filter((c): c is string => !!c);
  }

  // ---- Swipe File ----

  async getSwipeItems(
    userId: string,
    opts?: { search?: string; type?: string; favorite?: boolean; limit?: number; offset?: number },
  ): Promise<SwipeListResponse> {
    // Build filtered WHERE clause
    const filterConditions: any[] = [eq(swipeItems.userId, userId)];
    if (opts?.favorite) {
      filterConditions.push(eq(swipeItems.isFavorite, true));
    }
    if (opts?.type && opts.type !== "all") {
      filterConditions.push(eq(swipeItems.type, opts.type));
    }
    if (opts?.search?.trim()) {
      const q = `%${opts.search.trim()}%`;
      filterConditions.push(
        or(
          ilike(swipeItems.title, q),
          ilike(swipeItems.sourceUrl, q),
          ilike(swipeItems.notes, q),
          ilike(swipeItems.content, q),
        )!,
      );
    }
    const where = and(...filterConditions);
    const lim = Math.min(opts?.limit ?? 60, 200);
    const off = opts?.offset ?? 0;

    // Run item page + filtered count + type breakdown + shared/favorites counts in parallel
    const [items, [{ total }], breakdown, [{ shared }], [{ favorites }]] = await Promise.all([
      db.select().from(swipeItems)
        .where(where)
        .orderBy(desc(swipeItems.createdAt))
        .limit(lim)
        .offset(off),
      db.select({ total: count() }).from(swipeItems).where(where),
      db.select({ type: swipeItems.type, n: count() })
        .from(swipeItems)
        .where(eq(swipeItems.userId, userId))
        .groupBy(swipeItems.type),
      // count(col) ignores NULLs — gives share_token IS NOT NULL count
      db.select({ shared: sql<number>`cast(count(${swipeItems.shareToken}) as int)` })
        .from(swipeItems)
        .where(eq(swipeItems.userId, userId)),
      db.select({ favorites: count() })
        .from(swipeItems)
        .where(and(eq(swipeItems.userId, userId), eq(swipeItems.isFavorite, true))),
    ]);

    const uploadCount = Number(breakdown.find(r => r.type === "upload")?.n ?? 0);
    const snippetCount = Number(breakdown.find(r => r.type === "snippet")?.n ?? 0);
    const paletteCount = Number(breakdown.find(r => r.type === "palette")?.n ?? 0);

    return {
      items,
      total: Number(total),
      counts: {
        all: uploadCount + snippetCount + paletteCount,
        upload: uploadCount,
        snippet: snippetCount,
        palette: paletteCount,
        shared: Number(shared),
        favorites: Number(favorites),
      },
    };
  }

  async toggleSwipeFavorite(id: string, userId: string): Promise<SwipeItem | undefined> {
    const [current] = await db.select({ isFavorite: swipeItems.isFavorite })
      .from(swipeItems)
      .where(and(eq(swipeItems.id, id), eq(swipeItems.userId, userId)));
    if (!current) return undefined;
    const [updated] = await db.update(swipeItems)
      .set({ isFavorite: !current.isFavorite, updatedAt: new Date() })
      .where(and(eq(swipeItems.id, id), eq(swipeItems.userId, userId)))
      .returning();
    return updated;
  }

  async getSwipeItem(id: string, userId: string): Promise<SwipeItem | undefined> {
    const [item] = await db.select().from(swipeItems)
      .where(and(eq(swipeItems.id, id), eq(swipeItems.userId, userId)));
    return item;
  }

  async getSwipeItemByToken(token: string): Promise<SwipeItem | undefined> {
    const [item] = await db.select().from(swipeItems)
      .where(eq(swipeItems.shareToken, token));
    return item;
  }

  async createSwipeItem(userId: string, data: Partial<InsertSwipeItem>): Promise<SwipeItem> {
    const [item] = await db.insert(swipeItems)
      .values({ ...data, userId } as InsertSwipeItem)
      .returning();
    return item;
  }

  async updateSwipeItem(id: string, userId: string, updates: Partial<InsertSwipeItem>): Promise<SwipeItem | undefined> {
    const [item] = await db.update(swipeItems)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(swipeItems.id, id), eq(swipeItems.userId, userId)))
      .returning();
    return item;
  }

  async deleteSwipeItem(id: string, userId: string): Promise<void> {
    await db.delete(swipeItems)
      .where(and(eq(swipeItems.id, id), eq(swipeItems.userId, userId)));
  }

  async setSwipeItemShareToken(id: string, userId: string, token: string | null): Promise<SwipeItem | undefined> {
    const [item] = await db.update(swipeItems)
      .set({ shareToken: token, updatedAt: new Date() })
      .where(and(eq(swipeItems.id, id), eq(swipeItems.userId, userId)))
      .returning();
    return item;
  }

  async incrementSwipeItemViewCount(token: string): Promise<void> {
    await db.update(swipeItems)
      .set({ viewCount: sql`${swipeItems.viewCount} + 1` })
      .where(eq(swipeItems.shareToken, token));
  }

  // ── Courses (admin) ────────────────────────────────────────────────────────

  async getCourses(): Promise<Course[]> {
    return db.select().from(courses).orderBy(courses.sortOrder, courses.createdAt);
  }

  async getCourse(id: string): Promise<Course | undefined> {
    const [row] = await db.select().from(courses).where(eq(courses.id, id));
    return row || undefined;
  }

  async getCourseBySlug(slug: string): Promise<Course | undefined> {
    const [row] = await db.select().from(courses).where(eq(courses.slug, slug));
    return row || undefined;
  }

  async createCourse(course: InsertCourse): Promise<Course> {
    const [row] = await db.insert(courses).values(course).returning();
    return row;
  }

  async updateCourse(id: string, updates: Partial<Course>): Promise<Course | undefined> {
    const [row] = await db.update(courses).set({ ...updates, updatedAt: new Date() }).where(eq(courses.id, id)).returning();
    return row || undefined;
  }

  async deleteCourse(id: string): Promise<boolean> {
    const [row] = await db.delete(courses).where(eq(courses.id, id)).returning();
    return !!row;
  }

  async getCourseModules(courseId: string): Promise<CourseModule[]> {
    return db.select().from(courseModules).where(eq(courseModules.courseId, courseId)).orderBy(courseModules.sortOrder);
  }

  async getCourseModule(id: string): Promise<CourseModule | undefined> {
    const [row] = await db.select().from(courseModules).where(eq(courseModules.id, id));
    return row || undefined;
  }

  async getCourseModuleBySlug(courseId: string, slug: string): Promise<CourseModule | undefined> {
    const [row] = await db.select().from(courseModules).where(
      and(eq(courseModules.courseId, courseId), eq(courseModules.slug, slug)),
    );
    return row || undefined;
  }

  async getCourseModuleByExternalId(courseId: string, externalId: string): Promise<CourseModule | undefined> {
    const [row] = await db.select().from(courseModules).where(
      and(eq(courseModules.courseId, courseId), eq(courseModules.externalId, externalId))
    );
    return row || undefined;
  }

  async createCourseModule(module: InsertCourseModule): Promise<CourseModule> {
    const [row] = await db.insert(courseModules).values(module).returning();
    return row;
  }

  async updateCourseModule(id: string, updates: Partial<CourseModule>): Promise<CourseModule | undefined> {
    const [row] = await db.update(courseModules).set({ ...updates, updatedAt: new Date() }).where(eq(courseModules.id, id)).returning();
    return row || undefined;
  }

  async deleteCourseModule(id: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [root] = await tx.select({ id: courseModules.id, courseId: courseModules.courseId })
        .from(courseModules)
        .where(eq(courseModules.id, id));
      if (!root) return false;

      const modules = await tx.select({
        id: courseModules.id,
        parentModuleId: courseModules.parentModuleId,
        sortOrder: courseModules.sortOrder,
      }).from(courseModules).where(eq(courseModules.courseId, root.courseId));
      const moduleIds = collectCourseModuleSubtreeIds(root.id, modules);

      for (const moduleId of moduleIds) {
        await tx.delete(courseModules).where(eq(courseModules.id, moduleId));
      }
      return true;
    });
  }

  async reorderCourseModules(courseId: string, orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.update(courseModules).set({ sortOrder: i }).where(and(eq(courseModules.id, orderedIds[i]), eq(courseModules.courseId, courseId)));
    }
  }

  async getCourseLessons(moduleId: string): Promise<CourseLesson[]> {
    return db.select().from(courseLessons).where(eq(courseLessons.moduleId, moduleId)).orderBy(courseLessons.sortOrder);
  }

  async getCourseLesson(id: string): Promise<CourseLesson | undefined> {
    const [row] = await db.select().from(courseLessons).where(eq(courseLessons.id, id));
    return row || undefined;
  }

  async getCourseLessonWithCourse(id: string): Promise<CourseLessonWithCourse | undefined> {
    const [row] = await db.select({
      lesson: courseLessons,
      course: courses,
    })
      .from(courseLessons)
      .innerJoin(courses, eq(courseLessons.courseId, courses.id))
      .where(eq(courseLessons.id, id))
      .limit(1);
    return row || undefined;
  }

  async getCourseLessonByPath(
    courseIdentifier: string,
    moduleSlug: string,
    lessonSlug: string,
  ): Promise<CourseLessonWithCourse | undefined> {
    const [row] = await db.select({
      lesson: courseLessons,
      course: courses,
    })
      .from(courseLessons)
      .innerJoin(courseModules, eq(courseLessons.moduleId, courseModules.id))
      .innerJoin(courses, eq(courseLessons.courseId, courses.id))
      .where(and(
        eq(courses.slug, courseIdentifier),
        eq(courseModules.courseId, courses.id),
        eq(courseModules.slug, moduleSlug),
        eq(courseLessons.slug, lessonSlug),
      ))
      .limit(1);
    return row || undefined;
  }

  async getCourseLessonBySlug(courseId: string, moduleId: string, slug: string): Promise<CourseLesson | undefined> {
    const [row] = await db.select().from(courseLessons).where(
      and(
        eq(courseLessons.courseId, courseId),
        eq(courseLessons.moduleId, moduleId),
        eq(courseLessons.slug, slug),
      ),
    );
    return row || undefined;
  }

  async getCourseLessonByExternalId(courseId: string, externalId: string): Promise<CourseLesson | undefined> {
    const [row] = await db.select().from(courseLessons).where(
      and(eq(courseLessons.courseId, courseId), eq(courseLessons.externalId, externalId))
    );
    return row || undefined;
  }

  async createCourseLesson(lesson: InsertCourseLesson): Promise<CourseLesson> {
    const [row] = await db.insert(courseLessons).values(lesson).returning();
    return row;
  }

  async updateCourseLesson(id: string, updates: Partial<CourseLesson>): Promise<CourseLesson | undefined> {
    const [row] = await db.update(courseLessons).set({ ...updates, updatedAt: new Date() }).where(eq(courseLessons.id, id)).returning();
    return row || undefined;
  }

  async deleteCourseLesson(id: string): Promise<boolean> {
    const [row] = await db.delete(courseLessons).where(eq(courseLessons.id, id)).returning();
    return !!row;
  }

  async reorderCourseLessons(moduleId: string, orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.update(courseLessons).set({ sortOrder: i }).where(and(eq(courseLessons.id, orderedIds[i]), eq(courseLessons.moduleId, moduleId)));
    }
  }

  async getLessonResources(lessonId: string): Promise<CourseResource[]> {
    return db.select().from(courseResources).where(eq(courseResources.lessonId, lessonId)).orderBy(courseResources.sortOrder);
  }

  async createCourseResource(resource: InsertCourseResource): Promise<CourseResource> {
    const [row] = await db.insert(courseResources).values(resource).returning();
    return row;
  }

  async updateCourseResource(id: string, updates: Partial<CourseResource>): Promise<CourseResource | undefined> {
    const [row] = await db.update(courseResources).set(updates).where(eq(courseResources.id, id)).returning();
    return row || undefined;
  }

  async deleteCourseResource(id: string): Promise<boolean> {
    const [row] = await db.delete(courseResources).where(eq(courseResources.id, id)).returning();
    return !!row;
  }

  // ── Courses (member) ───────────────────────────────────────────────────────

  async getPublishedCourses(): Promise<Course[]> {
    return db.select().from(courses).where(eq(courses.status, "published")).orderBy(courses.sortOrder);
  }

  async getPublishedCoursesWithProgress(userId: string): Promise<Array<Course & {
    progress: { completed: number; total: number };
    firstLesson: {
      id: string;
      title: string;
      slug: string | null;
      moduleId: string;
      module: { title: string; slug: string | null };
    } | null;
  }>> {
    const published = await this.getPublishedCourses();
    if (published.length === 0) return [];

    const courseIds = published.map((course) => course.id);
    const [lessons, progress] = await Promise.all([
      db.select({
        id: courseLessons.id,
        courseId: courseLessons.courseId,
        moduleId: courseLessons.moduleId,
        title: courseLessons.title,
        slug: courseLessons.slug,
        sortOrder: courseLessons.sortOrder,
        moduleTitle: courseModules.title,
        moduleSlug: courseModules.slug,
      })
        .from(courseLessons)
        .innerJoin(courseModules, eq(courseLessons.moduleId, courseModules.id))
        .where(and(
          inArray(courseLessons.courseId, courseIds),
          eq(courseLessons.status, "published"),
        ))
        .orderBy(courseModules.sortOrder, courseLessons.sortOrder),
      db.select({
        courseId: courseProgress.courseId,
        lessonId: courseProgress.lessonId,
        completedAt: courseProgress.completedAt,
      })
        .from(courseProgress)
        .where(and(
          eq(courseProgress.userId, userId),
          inArray(courseProgress.courseId, courseIds),
        )),
    ]);

    const lessonsByCourse = new Map<string, typeof lessons>();
    for (const lesson of lessons) {
      const courseLessonsForCourse = lessonsByCourse.get(lesson.courseId) ?? [];
      courseLessonsForCourse.push(lesson);
      lessonsByCourse.set(lesson.courseId, courseLessonsForCourse);
    }
    const progressByLesson = new Map(progress.map((item) => [item.lessonId, item]));

    return published.map((course) => {
      const courseLessonsForCourse = lessonsByCourse.get(course.id) ?? [];
      const completed = courseLessonsForCourse.filter(
        (lesson) => !!progressByLesson.get(lesson.id)?.completedAt,
      ).length;
      const firstLesson = courseLessonsForCourse[0] ?? null;
      return {
        ...course,
        progress: { completed, total: courseLessonsForCourse.length },
        firstLesson: firstLesson
          ? {
              id: firstLesson.id,
              title: firstLesson.title,
              slug: firstLesson.slug,
              moduleId: firstLesson.moduleId,
              module: {
                title: firstLesson.moduleTitle,
                slug: firstLesson.moduleSlug,
              },
            }
          : null,
      };
    });
  }

  async getCourseWithStructure(courseId: string, userId: string): Promise<{
    course: Course;
    modules: (CourseNavigationModule & { lessons: CourseNavigationLesson[] })[];
  } | undefined> {
    const [courseResult, modules, lessons, progress] = await Promise.all([
      db.select().from(courses).where(eq(courses.id, courseId)),
      db.select({
        id: courseModules.id,
        courseId: courseModules.courseId,
        parentModuleId: courseModules.parentModuleId,
        title: courseModules.title,
        slug: courseModules.slug,
        status: courseModules.status,
        sortOrder: courseModules.sortOrder,
      }).from(courseModules).where(eq(courseModules.courseId, courseId)).orderBy(courseModules.sortOrder),
      db.select({
        id: courseLessons.id,
        courseId: courseLessons.courseId,
        moduleId: courseLessons.moduleId,
        title: courseLessons.title,
        slug: courseLessons.slug,
        status: courseLessons.status,
        sortOrder: courseLessons.sortOrder,
      }).from(courseLessons).where(eq(courseLessons.courseId, courseId)).orderBy(courseLessons.sortOrder),
      db.select({
        lessonId: courseProgress.lessonId,
        completedAt: courseProgress.completedAt,
        lastAccessedAt: courseProgress.lastAccessedAt,
      }).from(courseProgress).where(and(eq(courseProgress.userId, userId), eq(courseProgress.courseId, courseId))),
    ]);
    const course = courseResult[0];
    if (!course) return undefined;

    const progressMap = new Map(progress.map(p => [p.lessonId, p]));

    const modulesWithLessons = modules.map(m => ({
      ...m,
      lessons: lessons
        .filter(l => l.moduleId === m.id)
        .map(l => ({
          ...l,
          completed: !!(progressMap.get(l.id)?.completedAt),
          lastAccessedAt: progressMap.get(l.id)?.lastAccessedAt ?? null,
        })),
    }));

    return { course, modules: modulesWithLessons };
  }

  async upsertCourseProgress(userId: string, courseId: string, lessonId: string, completed: boolean): Promise<CourseProgress> {
    const now = new Date();
    // Use INSERT ... ON CONFLICT DO UPDATE to handle concurrent requests safely.
    // The unique constraint (user_id, lesson_id) prevents duplicate rows.
    // completedAt is preserved once set (once completed, stays completed) unless
    // the caller explicitly passes completed=false to toggle it off.
    const [row] = await db
      .insert(courseProgress)
      .values({ userId, courseId, lessonId, completedAt: completed ? now : null, lastAccessedAt: now })
      .onConflictDoUpdate({
        target: [courseProgress.userId, courseProgress.lessonId],
        set: {
          completedAt: sql`CASE WHEN ${completed} THEN COALESCE(course_progress.completed_at, EXCLUDED.completed_at) ELSE NULL END`,
          lastAccessedAt: now,
        },
      })
      .returning();
    return row;
  }

  async getUserCourseProgress(userId: string, courseId: string): Promise<CourseProgress[]> {
    return db.select().from(courseProgress).where(and(eq(courseProgress.userId, userId), eq(courseProgress.courseId, courseId)));
  }

  // ── Training Library replays ───────────────────────────────────────────────

  async getTrainingReplays(): Promise<TrainingReplay[]> {
    return db.select().from(trainingReplays).orderBy(trainingReplays.sortOrder, trainingReplays.createdAt);
  }

  async getTrainingReplay(id: string): Promise<TrainingReplay | undefined> {
    const [row] = await db.select().from(trainingReplays).where(eq(trainingReplays.id, id));
    return row || undefined;
  }

  async getTrainingReplayBySlug(slug: string): Promise<TrainingReplay | undefined> {
    const [row] = await db.select().from(trainingReplays).where(eq(trainingReplays.slug, slug));
    return row || undefined;
  }

  async createTrainingReplay(replay: InsertTrainingReplay): Promise<TrainingReplay> {
    const [row] = await db.insert(trainingReplays).values(replay).returning();
    return row;
  }

  async updateTrainingReplay(id: string, updates: Partial<TrainingReplay>): Promise<TrainingReplay | undefined> {
    const [row] = await db.update(trainingReplays).set({ ...updates, updatedAt: new Date() }).where(eq(trainingReplays.id, id)).returning();
    return row || undefined;
  }

  async deleteTrainingReplay(id: string): Promise<boolean> {
    const [row] = await db.delete(trainingReplays).where(eq(trainingReplays.id, id)).returning();
    return !!row;
  }

  async reorderTrainingReplays(orderedIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx.update(trainingReplays).set({ sortOrder: i, updatedAt: new Date() }).where(eq(trainingReplays.id, orderedIds[i]));
      }
    });
  }

  async importTrainingReplays(rows: TrainingReplayImportRow[]): Promise<TrainingReplayImportResult> {
    if (rows.length === 0) {
      return { created: 0, updated: 0, videosImported: 0, videosSkipped: 0, videosUnavailable: 0 };
    }

    return db.transaction(async (tx) => {
      const externalIds = rows.map((row) => row.externalId);
      const existing = await tx
        .select()
        .from(trainingReplays)
        .where(inArray(trainingReplays.externalId, externalIds));
      const existingByExternalId = new Map(existing.map((replay) => [replay.externalId!, replay]));
      const allReplays = await tx
        .select({
          id: trainingReplays.id,
          slug: trainingReplays.slug,
          externalId: trainingReplays.externalId,
          sortOrder: trainingReplays.sortOrder,
        })
        .from(trainingReplays)
        .orderBy(trainingReplays.sortOrder, trainingReplays.createdAt);
      const importedIds = new Set(existing.map((replay) => replay.id));
      const insertionIndex = allReplays.findIndex((replay) => importedIds.has(replay.id));
      const baseIndex = insertionIndex >= 0
        ? insertionIndex
        : allReplays.length;
      const takenSlugs = new Set(
        allReplays
          .filter((replay) => !importedIds.has(replay.id))
          .map((replay) => replay.slug),
      );
      const imported: TrainingReplay[] = [];
      let created = 0;
      let updated = 0;
      let videosImported = 0;
      let videosSkipped = 0;
      let videosUnavailable = 0;

      for (const row of rows) {
        const current = existingByExternalId.get(row.externalId);
        let slug = current?.slug ?? slugify(row.title);
        if (!current || current.title !== row.title) {
          const baseSlug = slugify(row.title);
          slug = baseSlug;
          let suffix = 2;
          while (takenSlugs.has(slug)) slug = `${baseSlug}-${suffix++}`;
        }
        takenSlugs.add(slug);

        if (current) {
          const videoUrl = current.videoUrl || row.videoUrl || null;
          await tx.update(trainingReplays).set({
            title: row.title,
            slug,
            videoUrl,
            sortOrder: baseIndex + imported.length,
            updatedAt: new Date(),
          }).where(eq(trainingReplays.id, current.id));
          const updatedReplay = {
            ...current,
            title: row.title,
            slug,
            videoUrl,
            sortOrder: baseIndex + imported.length,
          };
          imported.push(updatedReplay);
          updated++;
          if (row.videoUrl && current.videoUrl) videosSkipped++;
          else if (row.videoUrl) videosImported++;
          else videosUnavailable++;
        } else {
          const [createdReplay] = await tx.insert(trainingReplays).values({
            title: row.title,
            slug,
            description: null,
            videoUrl: row.videoUrl || null,
            thumbnailUrl: null,
            content: null,
            durationMinutes: null,
            category: null,
            tags: [],
            status: "draft",
            sortOrder: baseIndex + imported.length,
            externalId: row.externalId,
          }).returning();
          imported.push(createdReplay);
          created++;
          if (row.videoUrl) videosImported++;
          else videosUnavailable++;
        }
      }

      // Re-number the whole catalog so imported rows are contiguous in source
      // order without changing the relative order of unrelated replays.
      const importedById = new Map(imported.map((replay) => [replay.id, replay]));
      const remaining = allReplays.filter((replay) => !importedIds.has(replay.id));
      const before = remaining.slice(0, baseIndex);
      const after = remaining.slice(baseIndex);
      const orderedIds = [
        ...before.map((replay) => replay.id),
        ...imported.map((replay) => replay.id),
        ...after.map((replay) => replay.id),
      ];
      for (let index = 0; index < orderedIds.length; index++) {
        const replayId = orderedIds[index];
        if (importedById.has(replayId)) continue;
        await tx.update(trainingReplays)
          .set({ sortOrder: index, updatedAt: new Date() })
          .where(eq(trainingReplays.id, replayId));
      }

      return { created, updated, videosImported, videosSkipped, videosUnavailable };
    });
  }

  async getTrainingReplayResources(replayId: string): Promise<TrainingReplayResource[]> {
    return db.select().from(trainingReplayResources).where(eq(trainingReplayResources.replayId, replayId)).orderBy(trainingReplayResources.sortOrder);
  }

  async createTrainingReplayResource(resource: InsertTrainingReplayResource): Promise<TrainingReplayResource> {
    const [row] = await db.insert(trainingReplayResources).values(resource).returning();
    return row;
  }

  async updateTrainingReplayResource(id: string, updates: Partial<TrainingReplayResource>): Promise<TrainingReplayResource | undefined> {
    const [row] = await db.update(trainingReplayResources).set(updates).where(eq(trainingReplayResources.id, id)).returning();
    return row || undefined;
  }

  async deleteTrainingReplayResource(id: string): Promise<boolean> {
    const [row] = await db.delete(trainingReplayResources).where(eq(trainingReplayResources.id, id)).returning();
    return !!row;
  }

  async getPublishedTrainingReplays(): Promise<TrainingReplay[]> {
    return db.select().from(trainingReplays)
      .where(eq(trainingReplays.status, "published"))
      .orderBy(trainingReplays.sortOrder, trainingReplays.createdAt);
  }

  async getPublishedTrainingReplayBySlug(slug: string): Promise<TrainingReplay | undefined> {
    const [row] = await db.select().from(trainingReplays)
      .where(and(eq(trainingReplays.slug, slug), eq(trainingReplays.status, "published")));
    return row || undefined;
  }

  async searchPublishedTrainingReplays(filters: { q?: string; category?: string; tag?: string }): Promise<TrainingReplay[]> {
    // The initial library is intentionally bounded (~100 replays), so searching
    // the published set in memory permits transcript and HTML-content matching
    // without an unbounded full-text database query.
    const q = filters.q?.toLowerCase();
    return (await this.getPublishedTrainingReplays()).filter((replay) => {
      if (filters.category && replay.category !== filters.category) return false;
      if (filters.tag && !(replay.tags || []).includes(filters.tag)) return false;
      if (!q) return true;
      const chapterText = Array.isArray(replay.transcriptChapters)
        ? replay.transcriptChapters.map((chapter) => chapter.title).join(" ")
        : "";
      const searchable = [
        replay.title, replay.description, replay.category, replay.tags?.join(" "),
        replay.content?.replace(/<[^>]*>/g, " "), chapterText, replay.transcriptText,
      ].filter(Boolean).join(" ").toLowerCase();
      return searchable.includes(q);
    });
  }

  async getUserTrainingReplayProgress(userId: string): Promise<TrainingReplayProgress[]> {
    return db.select().from(trainingReplayProgress).where(eq(trainingReplayProgress.userId, userId));
  }

  async getTrainingReplayProgress(userId: string, replayId: string): Promise<TrainingReplayProgress | undefined> {
    const [row] = await db.select().from(trainingReplayProgress).where(and(
      eq(trainingReplayProgress.userId, userId),
      eq(trainingReplayProgress.replayId, replayId),
    ));
    return row || undefined;
  }

  async upsertTrainingReplayProgress(
    userId: string,
    replayId: string,
    completed: boolean,
  ): Promise<TrainingReplayProgress> {
    const now = new Date();
    const [row] = await db
      .insert(trainingReplayProgress)
      .values({ userId, replayId, completedAt: completed ? now : null, lastAccessedAt: now })
      .onConflictDoUpdate({
        target: [trainingReplayProgress.userId, trainingReplayProgress.replayId],
        set: {
          completedAt: completed
            ? sql`COALESCE(training_replay_progress.completed_at, EXCLUDED.completed_at)`
            : null,
          lastAccessedAt: now,
        },
      })
      .returning();
    return row;
  }

  async getTrainingReplayComments(replayId: string): Promise<Array<TrainingReplayComment & { authorName: string }>> {
    const rows = await db
      .select({
        id: trainingReplayComments.id,
        replayId: trainingReplayComments.replayId,
        userId: trainingReplayComments.userId,
        body: trainingReplayComments.body,
        createdAt: trainingReplayComments.createdAt,
        updatedAt: trainingReplayComments.updatedAt,
        displayName: users.displayName,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(trainingReplayComments)
      .leftJoin(users, eq(users.id, trainingReplayComments.userId))
      .where(eq(trainingReplayComments.replayId, replayId))
      .orderBy(asc(trainingReplayComments.createdAt));

    return rows.map((row) => ({
      id: row.id,
      replayId: row.replayId,
      userId: row.userId,
      body: row.body,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      authorName: row.displayName
        || [row.firstName, row.lastName].filter(Boolean).join(" ")
        || "Academy member",
    }));
  }

  async createTrainingReplayComment(replayId: string, userId: string, body: string): Promise<TrainingReplayComment> {
    const [row] = await db.insert(trainingReplayComments).values({ replayId, userId, body }).returning();
    return row;
  }
}

export const storage = new DatabaseStorage();

// Run startup migrations — purely additive index creation.
// Each statement uses IF NOT EXISTS so it is safe to run on every boot.
export async function runMigrations(): Promise<void> {
  const migrations: { name: string; sql: string }[] = [
    // sessions: userId + createdAt — used by getSessionsByUser, getSessionsByFolder,
    // activity feed, and admin session lookups (all filter by userId and sort by createdAt).
    {
      name: "idx_sessions_user_created",
      sql: `CREATE INDEX IF NOT EXISTS idx_sessions_user_created
            ON sessions (user_id, created_at DESC)`,
    },
    // Course learner navigation and progress queries should remain index-backed
    // as imported courses grow from dozens to thousands of lessons.
    {
      name: "idx_course_modules_course_sort",
      sql: `CREATE INDEX IF NOT EXISTS idx_course_modules_course_sort
            ON course_modules (course_id, sort_order)`,
    },
    {
      name: "idx_course_modules_course_slug",
      sql: `CREATE INDEX IF NOT EXISTS idx_course_modules_course_slug
            ON course_modules (course_id, slug) WHERE slug IS NOT NULL`,
    },
    {
      name: "idx_course_lessons_course_sort",
      sql: `CREATE INDEX IF NOT EXISTS idx_course_lessons_course_sort
            ON course_lessons (course_id, sort_order)`,
    },
    {
      name: "idx_course_lessons_path",
      sql: `CREATE INDEX IF NOT EXISTS idx_course_lessons_path
            ON course_lessons (course_id, module_id, slug) WHERE slug IS NOT NULL`,
    },
    {
      name: "idx_course_resources_lesson_sort",
      sql: `CREATE INDEX IF NOT EXISTS idx_course_resources_lesson_sort
            ON course_resources (lesson_id, sort_order)`,
    },
    {
      name: "idx_course_progress_user_course",
      sql: `CREATE INDEX IF NOT EXISTS idx_course_progress_user_course
            ON course_progress (user_id, course_id)`,
    },
    // user_action_log: userId + createdAt — used by getUserActionLogs (cursor pagination)
    // and getAdminActivityFeed (filters by userId and sorts by createdAt).
    {
      name: "idx_user_action_log_user_created",
      sql: `CREATE INDEX IF NOT EXISTS idx_user_action_log_user_created
            ON user_action_log (user_id, created_at DESC)`,
    },
    // user_action_log: ip + createdAt — used by admin activity feed when filtering
    // by IP address with date ordering.
    {
      name: "idx_user_action_log_ip_created",
      sql: `CREATE INDEX IF NOT EXISTS idx_user_action_log_ip_created
            ON user_action_log (ip, created_at DESC)`,
    },
    // topic_runs: userId + createdAt — used by getTopicRunsByUser (order by createdAt).
    {
      name: "idx_topic_runs_user_created",
      sql: `CREATE INDEX IF NOT EXISTS idx_topic_runs_user_created
            ON topic_runs (user_id, created_at DESC)`,
    },
    // saved_topics: userId + createdAt — used by getSavedTopicsByUser.
    {
      name: "idx_saved_topics_user_created",
      sql: `CREATE INDEX IF NOT EXISTS idx_saved_topics_user_created
            ON saved_topics (user_id, created_at DESC)`,
    },
    // users.email functional index — getUserByEmail uses LOWER(TRIM(email)) so a
    // plain btree on the raw column is never used; this expression index is.
    {
      name: "idx_users_email_lower_trim",
      sql: `CREATE INDEX IF NOT EXISTS idx_users_email_lower_trim
            ON users (LOWER(TRIM(email)))`,
    },
    // dmo_entries: userId + date — every DMO query (getDmoHistory, getDmoToday,
    // getDmoStreak) filters by user_id and sorts/filters on date.
    {
      name: "idx_dmo_entries_user_date",
      sql: `CREATE INDEX IF NOT EXISTS idx_dmo_entries_user_date
            ON dmo_entries (user_id, date DESC)`,
    },
    // affiliate_links: userId + sortOrder — getAffiliateLinks always orders by
    // sort_order within a user's link vault.
    {
      name: "idx_affiliate_links_user_sort",
      sql: `CREATE INDEX IF NOT EXISTS idx_affiliate_links_user_sort
            ON affiliate_links (user_id, sort_order)`,
    },
    // affiliate_links: userId + isActive — promo-link and available-link filters
    // always combine user_id with is_active.
    {
      name: "idx_affiliate_links_user_active",
      sql: `CREATE INDEX IF NOT EXISTS idx_affiliate_links_user_active
            ON affiliate_links (user_id, is_active)`,
    },
    // swipe_items: userId + createdAt — getSwipeItems filters by user_id and
    // orders by created_at DESC.
    {
      name: "idx_swipe_items_user_created",
      sql: `CREATE INDEX IF NOT EXISTS idx_swipe_items_user_created
            ON swipe_items (user_id, created_at DESC)`,
    },
    // projects: userId + sortOrder — getProjectsForUser orders by sortOrder within user.
    {
      name: "idx_projects_user_sort",
      sql: `CREATE INDEX IF NOT EXISTS idx_projects_user_sort
            ON projects (user_id, sort_order)`,
    },
    // projects: userId + status — active project filter in getDashboardProjectsSummary.
    {
      name: "idx_projects_user_status",
      sql: `CREATE INDEX IF NOT EXISTS idx_projects_user_status
            ON projects (user_id, status)`,
    },
    // project_tasks: projectId + sortOrder — board and list queries order tasks within a project.
    {
      name: "idx_project_tasks_project_sort",
      sql: `CREATE INDEX IF NOT EXISTS idx_project_tasks_project_sort
            ON project_tasks (project_id, sort_order)`,
    },
    // project_tasks: userId + status — getAllOpenTasks and urgent-task queries filter here.
    {
      name: "idx_project_tasks_user_status",
      sql: `CREATE INDEX IF NOT EXISTS idx_project_tasks_user_status
            ON project_tasks (user_id, status)`,
    },
    // project_tasks: userId + dueDate — overdue and due-this-week queries filter here.
    {
      name: "idx_project_tasks_user_due",
      sql: `CREATE INDEX IF NOT EXISTS idx_project_tasks_user_due
            ON project_tasks (user_id, due_date)`,
    },
    // task_comments: taskId + createdAt — getTaskComments fetches comments per task ordered by date.
    {
      name: "idx_task_comments_task_created",
      sql: `CREATE INDEX IF NOT EXISTS idx_task_comments_task_created
            ON task_comments (task_id, created_at)`,
    },
    // task_activity: taskId + createdAt — getTaskActivity fetches activity per task ordered by date.
    {
      name: "idx_task_activity_task_created",
      sql: `CREATE INDEX IF NOT EXISTS idx_task_activity_task_created
            ON task_activity (task_id, created_at)`,
    },
    // project_columns: projectId + sortOrder — getProjectColumns orders columns within a project.
    {
      name: "idx_project_columns_project_sort",
      sql: `CREATE INDEX IF NOT EXISTS idx_project_columns_project_sort
            ON project_columns (project_id, sort_order)`,
    },
    // task_attachments: taskId — getTaskAttachments and bulk-delete cleanup fetch by taskId.
    {
      name: "idx_task_attachments_task",
      sql: `CREATE INDEX IF NOT EXISTS idx_task_attachments_task
            ON task_attachments (task_id)`,
    },
    // funnel_brain_files: composite (funnel_id, user_id, created_at) —
    // brain-file queries filter by both funnel and user then order by date.
    {
      name: "idx_funnel_brain_files_funnel_user_created",
      sql: `CREATE INDEX IF NOT EXISTS idx_funnel_brain_files_funnel_user_created
            ON funnel_brain_files (funnel_id, user_id, created_at DESC)`,
    },
  ];

  // Ensure gsc_analytics_cache table exists (created outside Drizzle push)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gsc_analytics_cache (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        cache_key VARCHAR(150) NOT NULL,
        data_json JSONB NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, cache_key)
      )
    `);
    console.log("[migration] gsc_analytics_cache table ensured");
  } catch (err: any) {
    console.error("[migration] gsc_analytics_cache table failed:", err?.message);
  }

  // CF course import: add external_id to courses, modules, and lessons for idempotent import
  try {
    await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS external_id TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_courses_external_id ON courses(external_id) WHERE external_id IS NOT NULL`);
    await pool.query(`ALTER TABLE course_modules ADD COLUMN IF NOT EXISTS external_id TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_course_modules_ext ON course_modules(course_id, external_id) WHERE external_id IS NOT NULL`);
    await pool.query(`ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS external_id TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_course_lessons_ext ON course_lessons(course_id, external_id) WHERE external_id IS NOT NULL`);
    await pool.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS icon TEXT`);
    console.log("[migration] course external_id columns ensured");
  } catch (err: any) {
    console.error("[migration] course external_id migration failed:", err?.message);
  }

  // The Training Library schema was introduced after the original database was
  // provisioned. Ensure both standalone replay tables exist before applying
  // import-specific columns and indexes below.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS training_replays (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL,
        slug VARCHAR(200) NOT NULL UNIQUE,
        description TEXT,
        video_url TEXT,
        thumbnail_url TEXT,
        content TEXT,
        transcript_text TEXT,
        transcript_language TEXT,
        transcript_source TEXT,
        transcript_updated_at TIMESTAMP,
        transcript_cues JSONB,
        transcript_chapters JSONB,
        transcript_chapters_generated_at TIMESTAMP,
        duration_minutes INTEGER,
        category TEXT,
        tags JSONB DEFAULT '[]'::jsonb,
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        sort_order INTEGER NOT NULL DEFAULT 0,
        external_id TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`ALTER TABLE training_replays ADD COLUMN IF NOT EXISTS transcript_chapters_generated_at TIMESTAMP`);
    await pool.query(`
      UPDATE training_replays
      SET transcript_chapters_generated_at = updated_at
      WHERE transcript_chapters_generated_at IS NULL
        AND jsonb_typeof(transcript_chapters) = 'array'
        AND jsonb_array_length(transcript_chapters) > 0
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS training_replay_resources (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        replay_id VARCHAR NOT NULL REFERENCES training_replays(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        subtitle TEXT,
        kind VARCHAR(20) NOT NULL DEFAULT 'link',
        sort_order INTEGER NOT NULL DEFAULT 0
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS training_replay_progress (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        replay_id VARCHAR NOT NULL REFERENCES training_replays(id) ON DELETE CASCADE,
        completed_at TIMESTAMP,
        last_accessed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, replay_id)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_training_replays_status_order
      ON training_replays(status, sort_order)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_training_replay_resources_replay_order
      ON training_replay_resources(replay_id, sort_order)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_training_replay_progress_user_replay
      ON training_replay_progress(user_id, replay_id)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS training_replay_comments (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        replay_id VARCHAR NOT NULL REFERENCES training_replays(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_training_replay_comments_replay_created
      ON training_replay_comments(replay_id, created_at)
    `);
    console.log("[migration] training library tables ensured");
  } catch (err: any) {
    console.error("[migration] training library table migration failed:", err?.message);
  }

  // Training-library replay imports use the source lesson ID as an idempotency
  // key. Keep the lookup indexed as the archive grows.
  try {
    await pool.query(`ALTER TABLE training_replays ADD COLUMN IF NOT EXISTS external_id TEXT`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS training_replays_external_id_unique ON training_replays(external_id) WHERE external_id IS NOT NULL`);
    console.log("[migration] training replay external_id uniqueness ensured");
  } catch (err: any) {
    console.error("[migration] training replay external_id migration failed:", err?.message);
  }

  for (const migration of migrations) {
    try {
      await pool.query(migration.sql);
      console.log(`[migration] index ensured: ${migration.name}`);
    } catch (err: any) {
      // Non-fatal: log and continue so a single failure doesn't block startup.
      console.error(`[migration] failed to create index ${migration.name}:`, err?.message);
    }
  }
}

// Bootstrap super admins from environment variable
export async function bootstrapSuperAdmins(): Promise<void> {
  const superAdminEmails = process.env.SUPER_ADMIN_EMAILS;
  if (!superAdminEmails) {
    return;
  }

  const emails = superAdminEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  
  for (const email of emails) {
    try {
      const user = await storage.getUserByEmail(email);
      if (user) {
        if (!user.isAdmin || user.role !== 'super_admin') {
          await storage.updateUser(user.id, { isAdmin: true, role: 'super_admin' });
          console.log(`[Bootstrap] Promoted ${email} to super_admin`);
        } else {
          console.log(`[Bootstrap] ${email} is already super_admin`);
        }
      } else {
        console.log(`[Bootstrap] User ${email} not found, skipping`);
      }
    } catch (err: any) {
      console.error(`[Bootstrap] Failed to promote ${email}:`, err.message);
    }
  }
}
