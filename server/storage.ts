import { 
  users, sessions, passwordResetTokens, userIdentities, adminAuditLog, userActionLog, processingMetrics, sessionFolders,
  topicRuns, topics, savedTopics, scripts, linkPlaceholders, userApiKeys, videoTrendsCredits, savedOffers, appSettings,
  dmoEntries, emailInboxAddresses, emailAnalyses, seedInboxes,
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
} from "@shared/schema";
import crypto from "crypto";
import { db, pool } from "./db";
import { eq, and, lt, isNull, desc, gt, sql, or, ilike, count, asc, inArray } from "drizzle-orm";

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
  
  // Legacy cleanup (not used)
  markVideoDeleted(id: string): Promise<void>;
  
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

  // DMO Tracker
  getDmoEntry(userId: string, date: string): Promise<DmoEntry | undefined>;
  upsertDmoEntry(userId: string, date: string, data: DmoEntryData): Promise<DmoEntry>;
  getDmoEntries(userId: string, limit?: number): Promise<DmoEntry[]>;
  getDmoStreak(userId: string): Promise<{ current: number; best: number; totalDays: number }>;
  getDmoSummary(userId: string, period: string): Promise<{ summary: string; tips: string[]; moodScore: number | null; performanceScore: number | null; generatedAt: Date } | null>;
  upsertDmoSummary(userId: string, period: string, periodType: string, summary: string, tips: string[], moodScore: number | null, performanceScore: number | null): Promise<void>;

  // Inbox Analyzer
  getOrCreateInboxAddress(userId: string): Promise<EmailInboxAddress>;
  getInboxAddressByToken(token: string): Promise<EmailInboxAddress | undefined>;
  updateInboxSendingFrom(userId: string, sendingFromAddress: string): Promise<void>;
  saveLastPlacementResults(userId: string, results: unknown[]): Promise<void>;
  setPlacementAutoCheckWindow(userId: string, until: Date | null, emailContext?: { receivedAt: Date; subject: string }): Promise<void>;
  getUsersWithActivePlacementMonitoring(now: Date): Promise<Array<{ userId: string; sendingFromAddress: string; lastPlacementCheckedAt: Date | null; placementAutoCheckUntil: Date; lastPlacementResults: unknown[] | null; placementCheckReceivedAt: Date | null; placementCheckSubject: string | null }>>;
  createEmailAnalysis(data: {
    userId: string; fromAddress: string; fromName?: string; replyTo?: string; subject: string;
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
  disconnectSeedInbox(id: string): Promise<void>;
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

  // Legacy cleanup (not used)
  async markVideoDeleted(id: string): Promise<void> {
    await db.update(sessions)
      .set({ videoDeletedAt: new Date(), videoPath: null })
      .where(eq(sessions.id, id));
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
    sort?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ users: (User & { totalVideos: number })[]; total: number }> {
    const { search, role, status, provider, consent, sort = "newest", page = 1, pageSize = 25 } = options;
    
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
    // Update all existing users to the new limit
    await db.update(videoTrendsCredits).set({ monthlyLimit: limit, updatedAt: now });
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

    // Calculate current streak
    let current = 0;
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    let checkDate = dates[0] === today || dates[0] === yesterday ? dates[0] : null;

    if (checkDate) {
      const dateSet = new Set(dates);
      let d = new Date(checkDate);
      while (dateSet.has(d.toISOString().split("T")[0])) {
        current++;
        d = new Date(d.getTime() - 86400000);
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

  // ── Inbox Analyzer ───────────────────────────────────────────────────────

  async getOrCreateInboxAddress(userId: string): Promise<EmailInboxAddress> {
    const [existing] = await db.select().from(emailInboxAddresses).where(eq(emailInboxAddresses.userId, userId));
    if (existing) return existing;
    const { generateToken } = await import("./inboxAnalyzer");
    const token = generateToken();
    const [created] = await db.insert(emailInboxAddresses).values({ userId, token }).returning();
    return created;
  }

  async getInboxAddressByToken(token: string): Promise<EmailInboxAddress | undefined> {
    const [row] = await db.select().from(emailInboxAddresses).where(eq(emailInboxAddresses.token, token));
    return row || undefined;
  }

  async createEmailAnalysis(data: {
    userId: string; fromAddress: string; fromName?: string; replyTo?: string; subject: string;
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

  async setPlacementAutoCheckWindow(userId: string, until: Date | null, emailContext?: { receivedAt: Date; subject: string }): Promise<void> {
    // When opening a new window (until != null), stamp lastPlacementCheckedAt so the
    // 15-min scheduler throttle enforces a minimum delay before the first real check.
    // This lets Gmail's spam filters finish running (takes ~1-5 min) before we read
    // the folder. When closing the window (until == null) we leave the timestamp alone.
    const extra = until !== null ? { lastPlacementCheckedAt: new Date() } : {};
    const contextFields = emailContext
      ? { placementCheckReceivedAt: emailContext.receivedAt, placementCheckSubject: emailContext.subject }
      : {};
    await db.update(emailInboxAddresses)
      .set({ placementAutoCheckUntil: until, ...extra, ...contextFields })
      .where(eq(emailInboxAddresses.userId, userId));
  }

  async getUsersWithActivePlacementMonitoring(now: Date): Promise<Array<{ userId: string; sendingFromAddress: string; lastPlacementCheckedAt: Date | null; placementAutoCheckUntil: Date; lastPlacementResults: unknown[] | null; placementCheckReceivedAt: Date | null; placementCheckSubject: string | null }>> {
    const rows = await db.select({
      userId: emailInboxAddresses.userId,
      sendingFromAddress: emailInboxAddresses.sendingFromAddress,
      lastPlacementCheckedAt: emailInboxAddresses.lastPlacementCheckedAt,
      placementAutoCheckUntil: emailInboxAddresses.placementAutoCheckUntil,
      lastPlacementResults: emailInboxAddresses.lastPlacementResults,
      placementCheckReceivedAt: emailInboxAddresses.placementCheckReceivedAt,
      placementCheckSubject: emailInboxAddresses.placementCheckSubject,
    })
    .from(emailInboxAddresses)
    .where(
      sql`${emailInboxAddresses.placementAutoCheckUntil} > ${now}
        AND ${emailInboxAddresses.sendingFromAddress} IS NOT NULL
        AND ${emailInboxAddresses.sendingFromAddress} != ''`
    );
    return rows.filter(r => r.placementAutoCheckUntil != null) as Array<{ userId: string; sendingFromAddress: string; lastPlacementCheckedAt: Date | null; placementAutoCheckUntil: Date; lastPlacementResults: unknown[] | null; placementCheckReceivedAt: Date | null; placementCheckSubject: string | null }>;
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
    }).where(eq(seedInboxes.id, id));
  }

  async disconnectSeedInbox(id: string): Promise<void> {
    await db.update(seedInboxes).set({
      oauthAccessToken: null,
      oauthRefreshToken: null,
      oauthTokenExpiry: null,
      isConnected: false,
    }).where(eq(seedInboxes.id, id));
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
