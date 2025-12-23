import { 
  users, sessions, systemSettings, passwordResetTokens, userIdentities, adminAuditLog,
  type User, type InsertUser, 
  type Session, type InsertSession,
  type ScoreResult, type SystemSettings,
  type PasswordResetToken, type InsertPasswordResetToken,
  type UserIdentity, type InsertUserIdentity, type AuthProvider,
  type AdminAuditLog, type InsertAdminAuditLog
} from "@shared/schema";
import { db } from "./db";
import { eq, and, lt, isNull, desc, gt, sql, or, ilike, count, asc } from "drizzle-orm";

// Email normalization helper - centralizes email handling to prevent duplicates
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
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
  }): Promise<{ users: User[]; total: number }>;
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
  }>;
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
  }): Promise<{ users: User[]; total: number }> {
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
    
    // Get users with sorting
    let orderBy;
    switch (sort) {
      case "oldest":
        orderBy = asc(users.createdAt);
        break;
      case "last_login":
        orderBy = desc(users.lastLoginAt);
        break;
      case "newest":
      default:
        orderBy = desc(users.createdAt);
    }
    
    const offset = (page - 1) * pageSize;
    const userResults = await db.select().from(users)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset(offset);
    
    return { users: userResults, total: Number(totalCount) };
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

  // Admin: Account Merge
  async mergeUsers(primaryUserId: string, duplicateUserId: string): Promise<{
    success: boolean;
    message: string;
    reassignedSessions?: number;
    reassignedIdentities?: number;
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
      // Reassign sessions from duplicate to primary
      const sessionResult = await db.update(sessions)
        .set({ userId: primaryUserId })
        .where(eq(sessions.userId, duplicateUserId))
        .returning({ id: sessions.id });
      
      // Reassign user identities from duplicate to primary
      const identityResult = await db.update(userIdentities)
        .set({ userId: primaryUserId })
        .where(eq(userIdentities.userId, duplicateUserId))
        .returning({ id: userIdentities.id });
      
      // Update audit logs to point to primary user
      await db.update(adminAuditLog)
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
        await this.updateUser(primaryUserId, updates);
      }
      
      // Soft-delete the duplicate user
      await this.updateUser(duplicateUserId, {
        isDisabled: true,
        disabledAt: new Date(),
        disabledReason: `Merged into user ${primaryUserId}`,
      });
      
      return {
        success: true,
        message: `Successfully merged user ${duplicateUserId} into ${primaryUserId}`,
        reassignedSessions: sessionResult.length,
        reassignedIdentities: identityResult.length,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Merge failed: ${err.message}`,
      };
    }
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
