import { 
  users, sessions, systemSettings,
  type User, type InsertUser, 
  type Session, type InsertSession,
  type ScoreResult, type SystemSettings
} from "@shared/schema";
import { db } from "./db";
import { eq, and, lt, isNull, desc } from "drizzle-orm";

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
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser & { emailConsentAt?: Date; emailConsentIp?: string }): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users)
      .set(updates)
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
    const [session] = await db.insert(sessions).values(insertSession).returning();
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
}

export const storage = new DatabaseStorage();
