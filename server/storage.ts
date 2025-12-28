import { 
  users, sessions, systemSettings, passwordResetTokens, userIdentities, adminAuditLog, userActionLog, processingMetrics, sessionFolders,
  topicRuns, topics, savedTopics, scripts, linkPlaceholders, userApiKeys, videoTrendsCredits,
  type User, type InsertUser, 
  type Session, type InsertSession,
  type ScoreResult, type SystemSettings,
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
  type UserApiKey, type InsertUserApiKey, type ApiKeyProvider
} from "@shared/schema";
import crypto from "crypto";
import { db } from "./db";
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
  
  // Cleanup
  getExpiredSessions(): Promise<Session[]>;
  markVideoDeleted(id: string): Promise<void>;
  
  // System Settings (Keap)
  getSystemSettings(): Promise<SystemSettings | undefined>;
  upsertSystemSettings(settings: Partial<SystemSettings>): Promise<SystemSettings>;
  
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
    keapStatus?: string;
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
  getTopicRunsByUser(userId: string, limit?: number): Promise<TopicRun[]>;
  updateTopicRun(id: string, updates: Partial<TopicRun>): Promise<TopicRun | undefined>;
  deleteTopicRun(id: string, userId: string): Promise<boolean>;
  deleteAllTopicRuns(userId: string): Promise<number>;
  
  // Topic Pulse Finder: Topics
  createTopic(topic: InsertTopic): Promise<Topic>;
  createTopics(topics: InsertTopic[]): Promise<Topic[]>;
  getTopic(id: string): Promise<Topic | undefined>;
  getTopicsByRun(runId: string): Promise<Topic[]>;
  
  // Topic Pulse Finder: Saved Topics
  saveTopicForUser(savedTopic: InsertSavedTopic): Promise<SavedTopic>;
  getSavedTopicsByUser(userId: string): Promise<(SavedTopic & { topic: Topic })[]>;
  deleteSavedTopic(id: string, userId: string): Promise<boolean>;
  isSavedTopic(topicId: string, userId: string): Promise<boolean>;
  
  // Topic Pulse Finder: Scripts
  createScript(script: InsertScript): Promise<Script>;
  getScript(id: string): Promise<Script | undefined>;
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
  getVideoTrendsCredits(userId: string): Promise<{ creditsUsed: number; monthlyLimit: number; windowStartedAt: Date; remaining: number; resetsAt: Date }>;
  useVideoTrendsCredits(userId: string, amount: number): Promise<{ success: boolean; remaining: number; error?: string }>;
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

  // Cleanup
  async getExpiredSessions(): Promise<Session[]> {
    const now = new Date();
    return db.select().from(sessions)
      .where(and(
        lt(sessions.expiresAt, now),
        isNull(sessions.videoDeletedAt)
      ));
  }

  async markVideoDeleted(id: string): Promise<void> {
    await db.update(sessions)
      .set({ videoDeletedAt: new Date(), videoPath: null })
      .where(eq(sessions.id, id));
  }

  // System Settings
  async getSystemSettings(): Promise<SystemSettings | undefined> {
    const [settings] = await db.select().from(systemSettings).where(eq(systemSettings.id, "keap_integration"));
    return settings || undefined;
  }

  async upsertSystemSettings(updates: Partial<SystemSettings>): Promise<SystemSettings> {
    const existing = await this.getSystemSettings();
    
    if (existing) {
      const [settings] = await db.update(systemSettings)
        .set(updates)
        .where(eq(systemSettings.id, "keap_integration"))
        .returning();
      return settings;
    } else {
      const [settings] = await db.insert(systemSettings)
        .values({ id: "keap_integration", ...updates })
        .returning();
      return settings;
    }
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
    keapStatus?: string;
    sort?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ users: (User & { totalVideos: number })[]; total: number }> {
    const { search, role, status, provider, consent, keapStatus, sort = "newest", page = 1, pageSize = 25 } = options;
    
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
    
    if (keapStatus && keapStatus !== "all") {
      conditions.push(eq(users.keapSyncStatus, keapStatus as "synced" | "pending" | "failed"));
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
        if (!primary.keapContactId && duplicate.keapContactId) updates.keapContactId = duplicate.keapContactId;
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
  
  async getTopicRunsByUser(userId: string, limit = 20): Promise<TopicRun[]> {
    return db.select().from(topicRuns)
      .where(eq(topicRuns.userId, userId))
      .orderBy(desc(topicRuns.createdAt))
      .limit(limit);
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
  
  async getScript(id: string): Promise<Script | undefined> {
    const [result] = await db.select().from(scripts).where(eq(scripts.id, id));
    return result || undefined;
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
      return {
        creditsUsed: 0,
        totalCreditsUsed: 0,
        monthlyLimit: this.MONTHLY_CREDITS_LIMIT,
        windowStartedAt,
        remaining: this.MONTHLY_CREDITS_LIMIT,
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
      await db.insert(videoTrendsCredits).values({
        userId,
        creditsUsed: amount,
        totalCreditsUsed: amount,
        monthlyLimit: this.MONTHLY_CREDITS_LIMIT,
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
