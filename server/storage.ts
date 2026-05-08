import { 
  users, sessions, passwordResetTokens, userIdentities, adminAuditLog, userActionLog, processingMetrics, sessionFolders,
  topicRuns, topics, savedTopics, scripts, linkPlaceholders, userApiKeys, videoTrendsCredits, savedOffers, appSettings, publicApiKeys, webhooks,
  type PublicApiKey, type Webhook,
  dmoEntries, emailInboxAddresses, emailAnalyses, seedInboxes, postmasterConnections, postmasterDomains,
  competitorTrackers, competitorSeedAddresses, capturedCompetitorEmails, capturedCompetitorEmailLinks,
  teleprompterScripts, type TeleprompterScript, type InsertTeleprompterScript,
  type CompetitorTracker, type InsertCompetitorTracker, type CompetitorTrackerWithStats,
  type CompetitorSeedAddress, type CapturedCompetitorEmail, type CapturedCompetitorEmailLink,
  type TrackerAnalytics, type FeedResponse, type ScreenshotStatus,
  type User, type InsertUser, 
  type Session, type InsertSession,
  type ScoreResult,
  type PasswordResetToken, type InsertPasswordResetToken,
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
  type DmoEntry, type InsertDmoEntry, type DmoEntryData,
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
} from "@shared/schema";
import { safeTimezone, todayKeyInTz, addDaysToKey } from "@shared/datetime";
import crypto from "crypto";
import { db, pool } from "./db";
import { eq, and, lt, lte, gte, isNull, desc, gt, sql, or, ilike, count, asc, inArray } from "drizzle-orm";

// Email normalization helper - centralizes email handling to prevent duplicates
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

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
  createUser(user: InsertUser & { emailConsentAt?: Date; emailConsentIp?: string }): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  
  // Sessions
  getSession(id: string): Promise<Session | undefined>;
  getSessionsByUser(userId: string): Promise<Session[]>;
  createSession(session: InsertSession): Promise<Session>;
  updateSession(id: string, updates: Partial<Session>): Promise<Session | undefined>;
  deleteSession(id: string): Promise<void>;

  // Password Reset Tokens
  createPasswordResetToken(token: InsertPasswordResetToken): Promise<PasswordResetToken>;
  getPasswordResetTokenByHash(tokenHash: string): Promise<PasswordResetToken | undefined>;
  markPasswordResetTokenUsed(id: string): Promise<void>;
  countRecentPasswordResetRequests(userId: string, since: Date): Promise<number>;
  countRecentPasswordResetRequestsByIp(ip: string, since: Date): Promise<number>;
  
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
  getCfEnrolledUsers(): Promise<{ enrolledCount: number; revokedCount: number }>;
  getCfUsers(filter?: string): Promise<Array<Pick<User, 'id' | 'email' | 'displayName' | 'firstName' | 'lastName' | 'cfEnrolled' | 'cfEnrolledAt' | 'cfRevokedAt' | 'cfContactId'>>>;

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
  createTeleprompterScript(userId: string, data: { title: string; content: string }): Promise<TeleprompterScript>;
  updateTeleprompterScript(id: string, userId: string, data: { title?: string; content?: string }): Promise<TeleprompterScript | undefined>;
  deleteTeleprompterScript(id: string, userId: string): Promise<boolean>;

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
  getDmoEntries(userId: string, limit?: number): Promise<DmoEntry[]>;
  getDmoStreak(userId: string): Promise<{ current: number; best: number; totalDays: number }>;
  getDmoSummary(userId: string, period: string): Promise<{ summary: string; tips: string[]; moodScore: number | null; performanceScore: number | null; generatedAt: Date } | null>;
  upsertDmoSummary(userId: string, period: string, periodType: string, summary: string, tips: string[], moodScore: number | null, performanceScore: number | null): Promise<void>;

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
  getAllOpenTasksForUser(userId: string): Promise<Array<ProjectTask & { projectName: string; projectColor: string }>>;
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
  saveEmailPlacementResults(messageId: string, userId: string, results: unknown[]): Promise<void>;
  createEmailAnalysis(data: {
    userId: string; fromAddress: string; fromName?: string; replyTo?: string; messageId?: string; subject: string;
    bodyText?: string; bodyHtml?: string; rawHeaders?: string;
    spfResult?: string; dkimResult?: string;
  }): Promise<EmailAnalysis>;
  updateEmailAnalysis(id: string, data: Partial<EmailAnalysis>): Promise<void>;
  getEmailAnalyses(userId: string, limit?: number): Promise<EmailAnalysis[]>;
  getEmailAnalysis(id: string, userId: string): Promise<EmailAnalysis | undefined>;
  deleteEmailAnalysis(id: string, userId: string): Promise<void>;
  // Seed Inboxes (admin-managed)
  getSeedInboxes(activeOnly?: boolean): Promise<SeedInbox[]>;
  getSeedInboxById(id: string): Promise<SeedInbox | null>;
  addSeedInbox(data: InsertSeedInbox): Promise<SeedInbox>;
  deleteSeedInbox(id: string): Promise<void>;
  toggleSeedInbox(id: string, isActive: boolean): Promise<void>;
  storeSeedInboxOAuthTokens(id: string, accessToken: string, refreshToken: string | null, expiry: Date | null, email: string): Promise<void>;
  storeImapPassword(id: string, encryptedPassword: string): Promise<void>;
  markSeedInboxNeedsReconnect(id: string): Promise<void>;
  disconnectSeedInbox(id: string): Promise<void>;
  // Sender Reputation (Postmaster)
  getPostmasterConnection(userId: string): Promise<PostmasterConnection | null>;
  upsertPostmasterConnection(userId: string, data: { oauthAccessToken: string; oauthRefreshToken: string | null; oauthTokenExpiry: Date | null; connectedEmail: string }): Promise<PostmasterConnection>;
  updatePostmasterLastSynced(userId: string): Promise<void>;
  deletePostmasterConnection(userId: string): Promise<void>;
  getPostmasterDomains(userId: string): Promise<PostmasterDomain[]>;
  upsertPostmasterDomain(userId: string, domainName: string, data: { latestReputation: string | null; latestSpamRate: number | null; latestSpfRatio: number | null; latestDkimRatio: number | null; latestDmarcRatio: number | null; latestEncryptionRatio: number | null; trafficStats: any[] }): Promise<void>;
  deletePostmasterDomains(userId: string): Promise<void>;

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

  // Sessions
  async getSession(id: string): Promise<Session | undefined> {
    const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
    return session || undefined;
  }

  async getSessionsByUser(userId: string): Promise<Session[]> {
    return db.select().from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.createdAt));
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
    sort?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ users: (User & { totalVideos: number })[]; total: number }> {
    const { search, role, status, provider, consent, membership, sort = "newest", page = 1, pageSize = 25 } = options;
    
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
  async getCfEnrolledUsers(): Promise<{ enrolledCount: number; revokedCount: number }> {
    const [enrolledRow] = await db.select({ count: count() }).from(users).where(eq(users.cfEnrolled, true));
    const [revokedRow] = await db.select({ count: count() }).from(users).where(
      and(eq(users.cfEnrolled, false), sql`${users.cfRevokedAt} IS NOT NULL`)
    );
    return {
      enrolledCount: Number(enrolledRow?.count || 0),
      revokedCount: Number(revokedRow?.count || 0),
    };
  }

  async getCfUsers(filter?: string): Promise<Array<Pick<User, 'id' | 'email' | 'displayName' | 'firstName' | 'lastName' | 'cfEnrolled' | 'cfEnrolledAt' | 'cfRevokedAt' | 'cfContactId'>>> {
    let query = db.select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      cfEnrolled: users.cfEnrolled,
      cfEnrolledAt: users.cfEnrolledAt,
      cfRevokedAt: users.cfRevokedAt,
      cfContactId: users.cfContactId,
    }).from(users).$dynamic();

    if (filter === 'enrolled') {
      query = query.where(eq(users.cfEnrolled, true));
    } else if (filter === 'revoked') {
      query = query.where(and(eq(users.cfEnrolled, false), sql`${users.cfRevokedAt} IS NOT NULL`));
    } else if (filter === 'never') {
      query = query.where(sql`${users.cfEnrolledAt} IS NULL`);
    }

    return query.orderBy(desc(users.cfEnrolledAt));
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

  async createTeleprompterScript(userId: string, data: { title: string; content: string }): Promise<TeleprompterScript> {
    const [result] = await db.insert(teleprompterScripts)
      .values({ userId, title: data.title, content: data.content })
      .returning();
    return result;
  }

  async updateTeleprompterScript(id: string, userId: string, data: { title?: string; content?: string }): Promise<TeleprompterScript | undefined> {
    const updates: Partial<TeleprompterScript> = { updatedAt: new Date() };
    if (data.title !== undefined) updates.title = data.title;
    if (data.content !== undefined) updates.content = data.content;
    const [result] = await db.update(teleprompterScripts)
      .set(updates)
      .where(and(eq(teleprompterScripts.id, id), eq(teleprompterScripts.userId, userId)))
      .returning();
    return result || undefined;
  }

  async deleteTeleprompterScript(id: string, userId: string): Promise<boolean> {
    const [result] = await db.delete(teleprompterScripts)
      .where(and(eq(teleprompterScripts.id, id), eq(teleprompterScripts.userId, userId)))
      .returning();
    return !!result;
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
    if (existing) {
      const [updated] = await db.update(dmoEntries)
        .set({ ...data, updatedAt: now })
        .where(and(eq(dmoEntries.userId, userId), eq(dmoEntries.date, date)))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(dmoEntries)
        .values({ userId, date, ...data, createdAt: now, updatedAt: now })
        .returning();
      return created;
    }
  }

  async getDmoEntries(userId: string, limit: number = 60): Promise<DmoEntry[]> {
    return db.select().from(dmoEntries)
      .where(eq(dmoEntries.userId, userId))
      .orderBy(desc(dmoEntries.date))
      .limit(limit);
  }

  async getDmoStreak(userId: string): Promise<{ current: number; best: number; totalDays: number }> {
    const entries = await db.select({ date: dmoEntries.date })
      .from(dmoEntries)
      .where(and(
        eq(dmoEntries.userId, userId),
        sql`(${dmoEntries.visionMeditation} OR ${dmoEntries.personalDevelopment} OR ${dmoEntries.expandSkills} OR ${dmoEntries.execution} OR ${dmoEntries.connecting})`
      ))
      .orderBy(desc(dmoEntries.date));

    if (entries.length === 0) return { current: 0, best: 0, totalDays: 0 };

    const dates = entries.map(e => e.date).sort().reverse();
    const totalDays = dates.length;

    // Resolve "today" / "yesterday" in the user's timezone so the streak doesn't
    // flip a day at UTC midnight for users far from UTC.
    const user = await this.getUser(userId);
    const tz = safeTimezone(user?.timezone);
    const today = todayKeyInTz(tz);
    const yesterday = addDaysToKey(today, -1);

    // Calculate current streak
    let current = 0;
    let checkDate = dates[0] === today || dates[0] === yesterday ? dates[0] : null;

    if (checkDate) {
      const dateSet = new Set(dates);
      let cursor = checkDate;
      while (dateSet.has(cursor)) {
        current++;
        cursor = addDaysToKey(cursor, -1);
      }
    }

    // Calculate best streak
    let best = 0;
    let streak = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1]);
      const curr = new Date(dates[i]);
      const diff = (prev.getTime() - curr.getTime()) / 86400000;
      if (Math.round(diff) === 1) {
        streak++;
        best = Math.max(best, streak);
      } else {
        streak = 1;
      }
    }
    best = Math.max(best, current, 1);

    return { current, best, totalDays };
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

  async getAllOpenTasksForUser(userId: string): Promise<Array<ProjectTask & { projectName: string; projectColor: string }>> {
    const result = await db.execute(sql`
      SELECT t.*, p.name AS project_name, p.color AS project_color
      FROM project_tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE t.user_id = ${userId}
        AND t.status <> 'done'
        AND p.status = 'active'
        AND t.parent_task_id IS NULL
      ORDER BY (t.due_date IS NULL) ASC, t.due_date ASC, t.created_at ASC
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

  async saveEmailPlacementResults(messageId: string, userId: string, results: unknown[]): Promise<void> {
    await db.update(emailAnalyses)
      .set({ placementResults: results, placementConfirmedAt: new Date() })
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
        COALESCE(
          NULLIF(eia.sending_from_address, ''),
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

  async storeSeedInboxOAuthTokens(id: string, accessToken: string, refreshToken: string | null, expiry: Date | null, _verifiedEmail: string): Promise<void> {
    // Do NOT overwrite the email field — it was manually set by the admin as the inbox identifier.
    // The OAuth tokens are simply stored as credentials to access that inbox.
    await db.update(seedInboxes).set({
      oauthAccessToken: accessToken,
      oauthRefreshToken: refreshToken,
      oauthTokenExpiry: expiry,
      isConnected: true,
      oauthNeedsReconnect: false,
      authMethod: "oauth",
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
    // Only applies to OAuth inboxes — IMAP inboxes never need reconnect
    const [row] = await db.select({ authMethod: seedInboxes.authMethod }).from(seedInboxes).where(eq(seedInboxes.id, id));
    if (row?.authMethod === "imap") return;
    await db.update(seedInboxes)
      .set({ oauthNeedsReconnect: true })
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
}

export const storage = new DatabaseStorage();

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
