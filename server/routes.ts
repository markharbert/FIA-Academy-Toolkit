import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { transcribeAudio, scoreTranscript, generateTitle, generateDmoSummary } from "./ai";
import { convertToMp4, generateThumbnail, extractAudio, probeVideo, SUPPORTED_VIDEO_EXTENSIONS, SUPPORTED_VIDEO_MIMETYPES } from "./ffmpeg";
import { signupSchema, loginSchema, goalTypes, type GoalType, forgotPasswordSchema, resetPasswordSchema, type AuthProvider, updateAccountSchema, dmoEntryDataSchema, type CompetitorSeedAddress, insertProjectSchema, insertProjectTaskSchema, updateProjectTaskSchema, insertTaskCommentSchema, updateTaskCommentSchema, insertProjectTemplateSchema, insertProjectTemplateTaskSchema, updateProjectTemplateTaskSchema, insertProjectColumnSchema } from "@shared/schema";
import { safeTimezone, todayKeyInTz } from "@shared/datetime";
import bcrypt from "bcrypt";
import crypto from "crypto";
import multer from "multer";
import rateLimit from "express-rate-limit";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { sendPasswordResetEmail } from "./email";
import path from "path";
import fs from "fs";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { logUserAction, ActionLabels } from "./userActionLog";
import { processSession, subscribeToSession } from "./processing";
import { generateSessionPdfBuffer } from "./pdf";
import { ObjectStorageService } from "./replit_integrations/object_storage";
import { isValidYouTubeUrl, extractYouTubeVideoId, downloadYouTubeAudio } from "./youtube";
import { getGmailAuthUrl, exchangeGmailCode, checkGmailPlacement, type PlacementResult } from "./gmailOAuth";
import { getPostmasterAuthUrl, exchangePostmasterCode, fetchPostmasterData } from "./postmaster";
import { startPlacementScheduler } from "./placementScheduler";
import OpenAI from "openai";
import {
  verifyCfWebhookSignature,
  generateCfSsoUrl,
  parseCfWebhookEvent,
  handleCfEnrollmentEvent,
  checkCfEnrollmentByEmail,
  CF_WORKSPACE_DOMAIN,
  CF_API_TOKEN,
  CF_COURSE_ID,
  type CfContactInfo,
} from "./clickfunnels";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const MAX_RETRANSCRIBES_PER_DAY = 3;

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Dedicated multer for the public inbound email webhook.
// Uses memory storage with a strict 1 MB cap so no data ever touches disk
// before the inbox token is validated.
const inboundUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024, files: 5 },
});

// Configure multer for video uploads with broad format support
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname).toLowerCase() || ".mp4";
      cb(null, uniqueSuffix + ext);
    },
  }),
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimeOk = SUPPORTED_VIDEO_MIMETYPES.includes(file.mimetype) || file.mimetype.startsWith("video/");
    const extOk = SUPPORTED_VIDEO_EXTENSIONS.includes(ext);
    
    if (mimeOk || extOk) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type. Please upload MP4, MOV, WebM, MKV, AVI, or other common video formats.`));
    }
  },
});

// Extend express-session types
declare module "express-session" {
  interface SessionData {
    userId: string;
    impersonatingAdminId: string;
    gmailOAuthNonce: string;
    gmailOAuthInboxId: string;
  }
}

// Auth middleware
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  try {
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Authentication required" });
    }
    // When an admin is impersonating, bypass disabled/CF checks so they can
    // freely navigate the impersonated user's account.
    const isImpersonating = !!req.session.impersonatingAdminId;

    if (!isImpersonating && user.isDisabled) {
      req.session.destroy(() => {});
      return res.status(403).json({ message: "Account is disabled" });
    }
    // When CF is configured, enforce active membership on every authenticated
    // request so revoked members are denied mid-session without waiting for
    // their session to naturally expire. Admins are always exempt.
    if (!isImpersonating && process.env.CF_API_TOKEN && process.env.CF_COURSE_ID && !user.isAdmin) {
      if (user.cfEnrolled !== true) {
        req.session.destroy(() => {});
        return res.status(403).json({
          message: "Active ClickFunnels membership required",
          error: "cf_not_enrolled",
        });
      }
    }
  } catch (err) {
    console.error("[requireAuth] DB error:", err);
    return res.status(500).json({ message: "Authentication check failed" });
  }
  next();
}

// Middleware that verifies the session exists and belongs to the caller
// BEFORE any file-writing middleware (e.g. multer) runs.  This prevents
// authenticated users from leaving orphaned files on disk by targeting
// sessions they do not own.
async function requireSessionOwnership(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await storage.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }
    if (session.userId !== req.session.userId) {
      return res.status(403).json({ message: "Access denied" });
    }
    res.locals.verifiedSession = session;
    next();
  } catch (err) {
    console.error("[requireSessionOwnership] DB error:", err);
    return res.status(500).json({ message: "Session authorization check failed" });
  }
}

// Admin middleware
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  
  const user = await storage.getUser(req.session.userId);
  if (!user?.isAdmin || user.isDisabled) {
    return res.status(403).json({ message: "Admin access required" });
  }
  
  // Attach admin user to request for audit logging
  (req as any).adminUser = user;
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup session middleware
  const PgSession = connectPgSimple(session);
  
  // Session timeout: 24 hours of inactivity
  // Rolling sessions extend the timeout on each request
  const SESSION_INACTIVITY_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  
  // Determine if we're in production (deployed)
  const isProduction = process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1";
  console.log("[Session] isProduction:", isProduction, "NODE_ENV:", process.env.NODE_ENV, "REPLIT_DEPLOYMENT:", process.env.REPLIT_DEPLOYMENT);
  
  // Trust proxy - required for secure cookies behind Replit's reverse proxy
  app.set("trust proxy", 1);
  
  app.use(
    session({
      store: new PgSession({
        pool: pool,
        tableName: "user_sessions",
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "video-confidence-coach-secret-key",
      resave: true, // Enable resave for rolling sessions
      saveUninitialized: true, // Required for OAuth state storage before callback
      rolling: true, // Reset expiration on each request (activity extends session)
      cookie: {
        secure: isProduction, // Use secure cookies in production (HTTPS)
        httpOnly: true,
        sameSite: "lax", // Allows cookies on same-site navigations (like OAuth redirects)
        maxAge: SESSION_INACTIVITY_TIMEOUT, // 3 hours of inactivity
      },
    })
  );

  // ===================
  // AUTH ROUTES
  // ===================

  app.post("/api/auth/signup", async (req: Request, res: Response) => {
    try {
      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const { email, password, emailConsent, firstName, lastName } = parsed.data;

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // If ClickFunnels is configured, verify the email is an active enrolled member
      // before creating an account. Self-registration is not permitted when CF enforcement
      // is active — access must be granted through the CF enrollment webhook.
      let cfSignupInfo: { enrolled: boolean; contactId?: string } | null = null;
      if (CF_API_TOKEN && CF_COURSE_ID) {
        try {
          const cfInfo = await checkCfEnrollmentByEmail(email);
          if (!cfInfo.enrolled) {
            console.warn(`[Signup] CF enrollment check failed for ${email} — not enrolled`);
            return res.status(403).json({
              message: "This toolkit is exclusively available to active members. Please ensure your ClickFunnels membership is active.",
              error: "cf_not_enrolled",
            });
          }
          cfSignupInfo = cfInfo;
        } catch (cfErr) {
          console.error("[Signup] CF enrollment check error:", cfErr);
          return res.status(503).json({
            message: "Unable to verify membership status. Please try again later.",
            error: "cf_check_failed",
          });
        }
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      
      const user = await storage.createUser({ 
        email, 
        passwordHash,
        emailConsentAt: emailConsent ? new Date() : undefined,
        emailConsentIp: emailConsent ? clientIp : undefined,
      });

      // If CF verification passed, persist enrollment status immediately so
      // the user passes requireAuth's cfEnrolled check on their first request.
      if (cfSignupInfo?.enrolled) {
        await storage.updateUser(user.id, {
          cfEnrolled: true,
          cfEnrolledAt: new Date(),
          cfRevokedAt: null,
          cfContactId: cfSignupInfo.contactId || null,
        });
      }

      req.session.userId = user.id;

      let gravatarUrl: string | null = null;
      if (user.email) {
        const normalizedEmail = user.email.trim().toLowerCase();
        const hash = crypto.createHash("md5").update(normalizedEmail).digest("hex");
        gravatarUrl = `https://www.gravatar.com/avatar/${hash}?s=64&d=mp`;
      }

      res.status(201).json({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          firstName: user.firstName,
          lastName: user.lastName,
          emailConsentAt: user.emailConsentAt,
          isAdmin: user.isAdmin,
          role: user.role || (user.isAdmin ? "admin" : "user"),
          isDisabled: user.isDisabled,
          gravatarUrl,
          timezone: user.timezone || "America/New_York",
          cfEnrolled: cfSignupInfo?.enrolled ?? user.cfEnrolled,
          cfEnrolledAt: cfSignupInfo?.enrolled ? new Date() : user.cfEnrolledAt,
          cfRevokedAt: cfSignupInfo?.enrolled ? null : user.cfRevokedAt,
        }
      });
    } catch (err) {
      console.error("Signup error:", err);
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const { email, password } = parsed.data;

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Check if user has a password (might be OAuth-only user)
      if (!user.passwordHash) {
        return res.status(401).json({ message: "This account uses social login. Please sign in with Google." });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (user.isDisabled) {
        return res.status(403).json({ message: "This account has been disabled. Please contact support." });
      }

      // If ClickFunnels is configured, require active membership for non-admin users.
      // Admins bypass this check so they always retain access regardless of CF status.
      if (CF_API_TOKEN && CF_COURSE_ID && !user.isAdmin) {
        if (user.cfEnrolled === false) {
          console.warn(`[Login] CF membership revoked for user ${user.id} (${email})`);
          return res.status(403).json({
            message: "Your membership has been revoked. Please reactivate your ClickFunnels membership to continue.",
            error: "cf_revoked",
          });
        }
        if (user.cfEnrolled !== true) {
          console.warn(`[Login] CF enrollment not confirmed for user ${user.id} (${email})`);
          return res.status(403).json({
            message: "This toolkit is exclusively available to active members. Your membership status could not be confirmed.",
            error: "cf_not_enrolled",
          });
        }
      }

      req.session.userId = user.id;
      
      // Update last login timestamp
      await storage.updateUser(user.id, { lastLoginAt: new Date() });
      
      // Log successful login
      logUserAction({
        userId: user.id,
        actionType: "login_success",
        actionLabel: ActionLabels.login_success,
        entityType: "auth",
        metadata: { method: "email" },
        req,
      });

      let gravatarUrl: string | null = null;
      if (user.email) {
        const normalizedEmail = user.email.trim().toLowerCase();
        const hash = crypto.createHash("md5").update(normalizedEmail).digest("hex");
        gravatarUrl = `https://www.gravatar.com/avatar/${hash}?s=64&d=mp`;
      }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          firstName: user.firstName,
          lastName: user.lastName,
          emailConsentAt: user.emailConsentAt,
          isAdmin: user.isAdmin,
          role: user.role || (user.isAdmin ? "admin" : "user"),
          isDisabled: user.isDisabled,
          gravatarUrl,
          timezone: user.timezone || "America/New_York",
          cfEnrolled: user.cfEnrolled,
          cfEnrolledAt: user.cfEnrolledAt,
          cfRevokedAt: user.cfRevokedAt,
        }
      });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    const userId = req.session.userId;
    
    // Log logout before destroying session
    if (userId) {
      logUserAction({
        userId,
        actionType: "logout",
        actionLabel: ActionLabels.logout,
        entityType: "auth",
        req,
      });
    }
    
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out" });
    });
  });

  // ── CF One-Click Login ─────────────────────────────────────────────────────
  // CF Button URL: https://toolkit.fearlessmarketinglab.com/api/auth/cf-login?email={{contact.email}}
  //
  // The GET endpoint (hit by the CF button) simply bounces members to the
  // /cf-login frontend page, which shows a "verifying enrollment" spinner and
  // then calls the POST endpoint below to do the actual work.
  //
  // Rate-limited on both GET and POST: 10 attempts per IP per 10 minutes.
  const cfLoginLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      const APP_BASE_URL = process.env.APP_BASE_URL || "https://toolkit.fearlessmarketinglab.com";
      // For GET redirect errors, land on the cf-login page in error state
      if (_req.method === "POST") {
        return res.status(429).json({ success: false, error: "rate_limited" });
      }
      res.redirect(`${APP_BASE_URL}/cf-login?error=rate_limited`);
    },
  });

  // GET: redirect to the /cf-login intermediary page (keeps CF button URL unchanged)
  //
  // IMPORTANT: We must read the email from the raw URL, not from req.query.
  // req.query (via the qs library) decodes "+" as a space, which corrupts email
  // addresses that contain "+" (e.g. mark+tag@example.com → "mark tag@example.com").
  // We extract the raw encoded value and re-encode it with encodeURIComponent so
  // the downstream /cf-login page receives the correct address.
  app.get("/api/auth/cf-login", cfLoginLimiter, (req: Request, res: Response) => {
    const APP_BASE_URL = process.env.APP_BASE_URL || "https://toolkit.fearlessmarketinglab.com";

    // Extract the raw (still encoded) email from the query string
    const rawEmailMatch = req.originalUrl.match(/[?&]email=([^&]*)/);
    const rawEmail = rawEmailMatch ? rawEmailMatch[1] : "";

    if (!rawEmail) {
      return res.redirect(`${APP_BASE_URL}/cf-login?error=missing_email`);
    }

    // decodeURIComponent decodes %XX sequences but leaves "+" as-is,
    // then encodeURIComponent re-encodes everything (including "+") as %2B.
    const email = decodeURIComponent(rawEmail).trim();
    res.redirect(`${APP_BASE_URL}/cf-login?email=${encodeURIComponent(email)}`);
  });

  // POST: CF one-click login
  // Accepts the member's email from the CF button URL, verifies active enrollment
  // via the CF API, then creates a session. If the user does not yet have a local
  // account but IS enrolled, one is auto-provisioned.
  app.post("/api/auth/cf-login-ajax", cfLoginLimiter, async (req: Request, res: Response) => {
    try {
      const { email: rawEmail } = req.body;
      const email = (rawEmail || "").trim().toLowerCase();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, error: "missing_email" });
      }

      let user = await storage.getUserByEmail(email);

      // Reject explicitly disabled accounts before touching CF API
      if (user?.isDisabled) {
        console.warn(`[CF Login] disabled account attempt: ${email}`);
        return res.status(403).json({ success: false, error: "account_disabled" });
      }

      // If CF is configured, verify active enrollment (always, so revoked members
      // are caught even when cfEnrolled is still true in our DB from a prior session).
      if (CF_API_TOKEN && CF_COURSE_ID) {
        let cfInfo: CfContactInfo;
        try {
          cfInfo = await checkCfEnrollmentByEmail(email, user?.cfContactId ?? undefined);
        } catch (err: any) {
          console.error("[CF Login] CF API error:", err?.message);
          return res.status(502).json({ success: false, error: "cf_api_error" });
        }

        if (!cfInfo.enrolled) {
          console.warn(`[CF Login] not enrolled: ${email}`);
          return res.status(403).json({ success: false, error: "cf_not_enrolled" });
        }

        if (user) {
          // Keep local enrollment state in sync
          if (!user.cfEnrolled || user.cfRevokedAt) {
            await storage.updateUser(user.id, {
              cfEnrolled: true,
              cfEnrolledAt: user.cfEnrolledAt ?? new Date(),
              cfRevokedAt: null,
              isDisabled: false,
              cfContactId: cfInfo.contactId ?? user.cfContactId,
            });
          }
        } else {
          // Auto-provision: enrolled in CF but hasn't signed up to Toolkit yet
          console.log(`[CF Login] auto-provisioning account for enrolled member: ${email}`);
          const displayName =
            [cfInfo.firstName, cfInfo.lastName].filter(Boolean).join(" ") || email.split("@")[0];
          user = await storage.createUser({
            email,
            displayName,
            firstName: cfInfo.firstName || "",
            lastName: cfInfo.lastName || "",
          });
          await storage.updateUser(user.id, {
            cfEnrolled: true,
            cfEnrolledAt: new Date(),
            cfContactId: cfInfo.contactId ?? null,
          });
        }
      } else {
        // CF not configured (dev/staging) — require the account to exist
        if (!user) {
          return res.status(403).json({ success: false, error: "cf_not_enrolled" });
        }
      }

      req.session.userId = user!.id;
      await storage.updateUser(user!.id, { lastLoginAt: new Date() });

      logUserAction({
        userId: user!.id,
        actionType: "login_success",
        actionLabel: ActionLabels.login_success,
        entityType: "auth",
        metadata: { method: "cf_one_click" },
        req,
      });

      console.log(`[CF Login] session created for ${email} (userId: ${user!.id})`);
      return res.json({ success: true });
    } catch (err: any) {
      console.error("[CF Login] unexpected error:", err?.message);
      return res.status(500).json({ success: false, error: "server_error" });
    }
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    if (user.isDisabled) {
      req.session.destroy(() => {});
      return res.status(403).json({ message: "Account is disabled" });
    }

    const isImpersonating = !!req.session.impersonatingAdminId;

    // When CF is configured, enforce active membership here too so the client
    // cannot stay in an authenticated-looking state after membership is revoked.
    // Skip this check when an admin is impersonating.
    if (!isImpersonating && process.env.CF_API_TOKEN && process.env.CF_COURSE_ID && !user.isAdmin) {
      if (user.cfEnrolled !== true) {
        req.session.destroy(() => {});
        return res.status(403).json({
          message: "Active ClickFunnels membership required",
          error: "cf_not_enrolled",
        });
      }
    }

    console.log("[Auth] /api/auth/me - user.isAdmin:", user.isAdmin, "user.role:", user.role, "user.email:", user.email);
    
    // Compute Gravatar URL from email
    let gravatarUrl: string | null = null;
    if (user.email) {
      const normalizedEmail = user.email.trim().toLowerCase();
      const hash = crypto.createHash("md5").update(normalizedEmail).digest("hex");
      gravatarUrl = `https://www.gravatar.com/avatar/${hash}?s=64&d=mp`;
    }

    // If an admin is impersonating this user, include info about the real admin
    let impersonating: { adminId: string; adminDisplayName: string | null; adminEmail: string | null } | null = null;
    if (req.session.impersonatingAdminId) {
      const adminUser = await storage.getUser(req.session.impersonatingAdminId);
      if (adminUser) {
        impersonating = {
          adminId: adminUser.id,
          adminDisplayName: adminUser.displayName,
          adminEmail: adminUser.email,
        };
      }
    }
    
    res.json({ 
      user: { 
        id: user.id, 
        email: user.email, 
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        emailConsentAt: user.emailConsentAt,
        isAdmin: user.isAdmin,
        role: user.role || (user.isAdmin ? "admin" : "user"),
        isDisabled: user.isDisabled,
        gravatarUrl,
        cfEnrolled: user.cfEnrolled,
        cfEnrolledAt: user.cfEnrolledAt,
        cfRevokedAt: user.cfRevokedAt,
        timezone: user.timezone || "America/New_York",
        impersonating,
      } 
    });
  });

  // ===================
  // PASSWORD RESET ROUTES
  // ===================

  const PASSWORD_RESET_EXPIRY_MINUTES = 60;
  const MAX_RESET_REQUESTS_PER_HOUR = 5;

  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const parsed = forgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const { email } = parsed.data;
      const successMessage = "If an account exists for that email, we sent a reset link.";
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // IP-based rate limiting to prevent email enumeration attacks
      const recentRequestsByIp = await storage.countRecentPasswordResetRequestsByIp(clientIp, oneHourAgo);
      if (recentRequestsByIp >= MAX_RESET_REQUESTS_PER_HOUR * 3) {
        console.warn(`[Password Reset] IP rate limit exceeded for ${clientIp}`);
        return res.json({ message: successMessage });
      }

      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        return res.json({ message: successMessage });
      }

      if (!user.passwordHash) {
        return res.json({ message: successMessage });
      }

      // Per-user rate limiting
      const recentRequests = await storage.countRecentPasswordResetRequests(user.id, oneHourAgo);
      if (recentRequests >= MAX_RESET_REQUESTS_PER_HOUR) {
        console.warn(`[Password Reset] User rate limit exceeded for user ${user.id}`);
        return res.json({ message: successMessage });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000);

      await storage.createPasswordResetToken({
        userId: user.id,
        tokenHash,
        expiresAt,
        requestIp: clientIp,
        userAgent: req.get("user-agent") || null,
      });

      await sendPasswordResetEmail(email, token);

      res.json({ message: successMessage });
    } catch (err) {
      console.error("Forgot password error:", err);
      res.status(500).json({ message: "An error occurred. Please try again." });
    }
  });

  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const { token, newPassword } = parsed.data;

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const resetToken = await storage.getPasswordResetTokenByHash(tokenHash);

      if (!resetToken) {
        return res.status(400).json({ message: "Invalid or expired reset link" });
      }

      if (resetToken.usedAt) {
        return res.status(400).json({ message: "This reset link has already been used" });
      }

      if (new Date() > new Date(resetToken.expiresAt)) {
        return res.status(400).json({ message: "This reset link has expired" });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);

      await storage.updateUser(resetToken.userId, { passwordHash });
      await storage.markPasswordResetTokenUsed(resetToken.id);

      res.json({ message: "Password reset successfully. You can now log in with your new password." });
    } catch (err) {
      console.error("Reset password error:", err);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // ===================
  // OAUTH ROUTES
  // ===================

  // Compute APP_BASE_URL from REPLIT_DEV_DOMAIN (modern Replit) or fallback
  const APP_BASE_URL = process.env.APP_BASE_URL || 
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 
    `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`);
  
  console.log("[OAuth] APP_BASE_URL:", APP_BASE_URL);

  // Initialize Passport
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });

  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const googleCallbackURL = process.env.GOOGLE_REDIRECT_URI || `${APP_BASE_URL}/api/auth/oauth/google/callback`;
    console.log("[OAuth] Google callback URL:", googleCallbackURL);
    
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: googleCallbackURL,
      state: true,
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();
        const providerUserId = profile.id;
        const emailVerified = profile.emails?.[0]?.verified || false;
        const firstName = profile.name?.givenName;
        const lastName = profile.name?.familyName;
        const displayName = profile.displayName;

        // Check if identity already exists for this provider
        let identity = await storage.getUserIdentityByProvider("google", providerUserId);
        let user;

        if (identity) {
          // User already linked, just return them
          user = await storage.getUser(identity.userId);
          console.log("[OAuth Google] Existing user logged in:", user?.id);
        } else if (email) {
          // Check if a user with this email already exists
          user = await storage.getUserByEmail(email);

          if (user) {
            // Link the OAuth identity to existing user (don't modify their password)
            await storage.createUserIdentity({
              userId: user.id,
              provider: "google",
              providerUserId,
              emailFromProvider: email,
              emailVerifiedByProvider: emailVerified,
              nameFromProvider: displayName,
            });
            console.log("[OAuth Google] Linked identity to existing user:", user.id);
          } else {
            // Create new user without password (OAuth-only user)
            user = await storage.createUser({
              email,
              passwordHash: null as any,
              firstName: firstName || null,
              lastName: lastName || null,
              displayName: displayName || null,
            });

            await storage.createUserIdentity({
              userId: user.id,
              provider: "google",
              providerUserId,
              emailFromProvider: email,
              emailVerifiedByProvider: emailVerified,
              nameFromProvider: displayName,
            });
            console.log("[OAuth Google] Created new user:", user.id);
          }
        } else {
          // No email from provider - create user without email
          user = await storage.createUser({
            email: null as any,
            passwordHash: null as any,
            firstName: firstName || null,
            lastName: lastName || null,
            displayName: displayName || null,
          });

          await storage.createUserIdentity({
            userId: user.id,
            provider: "google",
            providerUserId,
            emailFromProvider: null,
            emailVerifiedByProvider: false,
            nameFromProvider: displayName,
          });
          console.log("[OAuth Google] Created user without email:", user.id);
        }

        done(null, user);
      } catch (err: any) {
        console.error("[OAuth Google] Error:", err.message);
        done(err);
      }
    }));

    app.get("/api/auth/oauth/google", passport.authenticate("google", {
      scope: ["profile", "email"],
    }));

    app.get("/api/auth/oauth/google/callback", (req: Request, res: Response, next: NextFunction) => {
      console.log("[OAuth Google] Callback received, query:", JSON.stringify(req.query));
      passport.authenticate("google", (err: any, user: any, info: any) => {
        console.log("[OAuth Google] Passport result - err:", err?.message || null, "user:", user?.id || null, "info:", JSON.stringify(info));
        if (err) {
          console.error("[OAuth Google] Authentication error:", err.message, err.stack);
          return res.redirect("/login?error=oauth_failed&reason=auth_error");
        }
        
        if (!user) {
          console.error("[OAuth Google] No user returned from strategy, info:", JSON.stringify(info));
          return res.redirect("/login?error=oauth_failed&reason=no_user");
        }

        if (user.isDisabled) {
          console.warn("[OAuth Google] Login attempt by disabled user:", user.id);
          return res.redirect("/login?error=account_disabled");
        }

        // If ClickFunnels is configured, require active membership for non-admin users.
        if (CF_API_TOKEN && CF_COURSE_ID && !user.isAdmin) {
          if (user.cfEnrolled === false) {
            console.warn("[OAuth Google] CF membership revoked for user:", user.id);
            return res.redirect("/login?error=cf_revoked");
          }
          if (user.cfEnrolled !== true) {
            console.warn("[OAuth Google] CF enrollment not confirmed for user:", user.id);
            return res.redirect("/login?error=cf_not_enrolled");
          }
        }
        
        // Set session and save before redirect
        console.log("[OAuth Google] Setting session for user:", user.id);
        req.session.userId = user.id;
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[OAuth Google] Session save error:", saveErr);
            return res.redirect("/login?error=oauth_failed&reason=session_save");
          }
          console.log("[OAuth Google] Session saved, redirecting to dashboard");
          res.redirect("/dashboard");
        });
      })(req, res, next);
    });
  } else {
    // Fallback routes when Google OAuth is not configured
    app.get("/api/auth/oauth/google", (req: Request, res: Response) => {
      console.log("[OAuth] Google OAuth not configured - missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
      res.redirect("/login?error=oauth_not_configured");
    });
    app.get("/api/auth/oauth/google/callback", (req: Request, res: Response) => {
      res.redirect("/login?error=oauth_not_configured");
    });
  }


  // ===================
  // CLICKFUNNELS INTEGRATION
  // ===================

  // Webhook endpoint – ClickFunnels sends events here (enrollment created/revoked, subscription cancelled)
  // Must be raw body to verify HMAC signature
  app.post(
    "/api/webhooks/clickfunnels",
    (req: Request, res: Response, next: NextFunction) => {
      // Collect raw body before JSON parsing
      let rawBody = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => { rawBody += chunk; });
      req.on("end", () => {
        (req as any).rawBody = rawBody;
        try {
          (req as any).parsedBody = JSON.parse(rawBody);
        } catch {
          (req as any).parsedBody = {};
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const signature = req.headers["x-cf-signature"] as string | undefined
          || req.headers["x-clickfunnels-signature"] as string | undefined;

        const rawBody = (req as any).rawBody || "";
        const body = (req as any).parsedBody || {};

        // Verify signature — fail closed if secret is not configured
        if (!process.env.CF_WEBHOOK_SECRET) {
          console.warn("[CF Webhook] CF_WEBHOOK_SECRET not configured — rejecting unsigned webhook");
          return res.status(401).json({ message: "Webhook signature verification not configured" });
        }
        if (!verifyCfWebhookSignature(rawBody, signature)) {
          console.warn("[CF Webhook] Invalid signature");
          return res.status(401).json({ message: "Invalid signature" });
        }

        const event = parseCfWebhookEvent(body);
        console.log("[CF Webhook] Received:", event.eventType, "| email:", event.contactEmail, "| course:", event.courseId);

        const result = await handleCfEnrollmentEvent(event);
        console.log("[CF Webhook] Action:", result.action, "| email:", result.email);

        res.json({ ok: true, action: result.action });
      } catch (err) {
        console.error("[CF Webhook] Error:", err);
        res.status(500).json({ message: "Webhook processing failed" });
      }
    }
  );

  // Generate a CF SSO magic link for the currently logged-in user
  app.get("/api/clickfunnels/sso-url", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!CF_WORKSPACE_DOMAIN) {
        return res.status(503).json({ message: "ClickFunnels not configured" });
      }
      const user = await storage.getUser(req.session.userId!);
      if (!user?.email) {
        return res.status(400).json({ message: "No email on account" });
      }
      // Only active CF members (or admins) may mint SSO URLs.
      // A revoked or never-enrolled non-admin should not receive a signed CF token.
      if (!user.isAdmin && user.cfEnrolled !== true) {
        console.warn(`[CF SSO] Denied SSO URL for non-enrolled user ${user.id}`);
        return res.status(403).json({ message: "Active ClickFunnels membership required" });
      }
      const redirectTo = (req.query.redirect as string) || undefined;
      const url = generateCfSsoUrl(user.email, redirectTo);
      res.json({ url });
    } catch (err) {
      console.error("[CF SSO] Error:", err);
      res.status(500).json({ message: "Failed to generate SSO link" });
    }
  });

  // Admin: CF integration status & config
  app.get("/api/admin/cf/status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const configured = {
        apiToken: !!process.env.CF_API_TOKEN,
        workspaceDomain: !!process.env.CF_WORKSPACE_DOMAIN,
        courseId: !!process.env.CF_COURSE_ID,
        webhookSecret: !!process.env.CF_WEBHOOK_SECRET,
      };
      const workspaceDomain = process.env.CF_WORKSPACE_DOMAIN || "";
      const courseId = process.env.CF_COURSE_ID || "";
      const allConfigured = Object.values(configured).every(Boolean);

      // Get enrollment stats
      const enrolledResult = await storage.getCfEnrolledUsers();

      res.json({
        configured,
        allConfigured,
        workspaceDomain,
        courseId,
        enrolledCount: enrolledResult.enrolledCount,
        revokedCount: enrolledResult.revokedCount,
      });
    } catch (err) {
      console.error("[CF Admin] Status error:", err);
      res.status(500).json({ message: "Failed to get CF status" });
    }
  });

  // Admin: test CF API contact lookup for a given email (debug only)
  app.get("/api/admin/cf/test-lookup", requireAdmin, async (req: Request, res: Response) => {
    const email = (req.query.email as string || "").trim();
    if (!email) return res.status(400).json({ message: "email query param required" });
    const token = process.env.CF_API_TOKEN || "";
    const rawDomain = (process.env.CF_WORKSPACE_DOMAIN || "").replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    const baseUrl = `https://${rawDomain}/api/v2`;
    const enc = encodeURIComponent(email);
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

    const attempts: Record<string, { status: number; body: string }> = {};

    // Try a handful of possible contact search URL patterns
    const urls: [string, string][] = [
      ["filter[email_address]", `${baseUrl}/contacts?filter[email_address]=${enc}`],
      ["filter%5Bemail_address%5D", `${baseUrl}/contacts?filter%5Bemail_address%5D=${enc}`],
      ["filter[email]", `${baseUrl}/contacts?filter[email]=${enc}`],
      ["filter%5Bemail%5D", `${baseUrl}/contacts?filter%5Bemail%5D=${enc}`],
      ["GET /api/v2", `${baseUrl}`],
      ["GET /api/v2/workspaces", `${baseUrl}/workspaces`],
    ];
    for (const [label, url] of urls) {
      try {
        const r = await fetch(url, { headers });
        const body = await r.text();
        attempts[label] = { status: r.status, body: body.slice(0, 300) };
      } catch (e: any) {
        attempts[label] = { status: -1, body: e.message };
      }
    }

    // Also try full enrollment check
    let enrollmentResult: any = null;
    try {
      const { checkCfEnrollmentByEmail } = await import("./clickfunnels");
      enrollmentResult = await checkCfEnrollmentByEmail(email);
    } catch (e: any) {
      enrollmentResult = { error: e.message };
    }

    res.json({ rawDomain, baseUrl, attempts, enrollmentResult });
  });

  // Admin: list users with CF enrollment info
  app.get("/api/admin/cf/users", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { filter } = req.query;
      const users = await storage.getCfUsers(filter as string);
      res.json({ users });
    } catch (err) {
      console.error("[CF Admin] Users error:", err);
      res.status(500).json({ message: "Failed to get CF users" });
    }
  });

  // Admin: simulate a CF webhook event for testing
  app.post("/api/admin/cf/test-webhook", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { email, eventType } = req.body as { email: string; eventType: string };
      if (!email || !eventType) {
        return res.status(400).json({ message: "email and eventType are required" });
      }

      const validEvents = [
        "courses/enrollment.created",
        "courses/enrollment.suspended",
        "courses/enrollment.deleted",
        "subscription.cancelled",
        "subscription.churned",
      ];
      if (!validEvents.includes(eventType)) {
        return res.status(400).json({ message: "Invalid event type" });
      }

      const event = {
        eventType,
        contactEmail: email.trim().toLowerCase(),
        contactId: null,
        courseId: process.env.CF_COURSE_ID || null,
      };

      const result = await handleCfEnrollmentEvent(event);
      console.log(`[CF Test Webhook] event=${eventType} email=${email} action=${result.action}`);
      res.json({ ok: true, action: result.action, email: result.email });
    } catch (err) {
      console.error("[CF Test Webhook] Error:", err);
      res.status(500).json({ message: "Test webhook failed" });
    }
  });

  // Admin: manually grant CF access to a user
  app.post("/api/admin/users/:id/cf-access", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { grant } = req.body as { grant: boolean };
      const user = await storage.getUser(id);
      if (!user) return res.status(404).json({ message: "User not found" });

      await storage.updateUser(id, {
        cfEnrolled: grant,
        cfEnrolledAt: grant ? new Date() : user.cfEnrolledAt,
        cfRevokedAt: grant ? null : new Date(),
        // Mirror webhook revocation semantics: revoke disables the account so
        // existing sessions are terminated by requireAuth on the next request.
        // Granting re-enables the account so the user can log in again.
        isDisabled: !grant,
      });

      res.json({ ok: true, cfEnrolled: grant });
    } catch (err) {
      console.error("[CF Admin] Error:", err);
      res.status(500).json({ message: "Failed to update CF access" });
    }
  });

  // ===================
  // ADMIN ROUTES - USER MANAGEMENT
  // ===================

  // Admin stats overview
  app.get("/api/admin/stats", requireAdmin, async (req: Request, res: Response) => {
    try {
      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (err) {
      console.error("Admin stats error:", err);
      res.status(500).json({ message: "Failed to get admin stats" });
    }
  });

  // Admin overview stats (new format)
  app.get("/api/admin/overview/stats", requireAdmin, async (req: Request, res: Response) => {
    try {
      const stats = await storage.getOverviewStats();
      res.json(stats);
    } catch (err) {
      console.error("Admin overview stats error:", err);
      res.status(500).json({ message: "Failed to get overview stats" });
    }
  });

  // Admin activity feed with cursor pagination
  // Admin: Member activity feed (page-based, all action types).
  // Query: ?page=1&pageSize=20&actionType=login_success&since=24h|7d|30d|all
  app.get("/api/admin/overview/activity", requireAdmin, async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(Math.max(1, parseInt(req.query.pageSize as string) || 20), 100);
      const actionType = req.query.actionType && req.query.actionType !== "all"
        ? String(req.query.actionType)
        : undefined;
      const sinceParam = String(req.query.since || "all");
      const sinceMap: Record<string, number> = {
        "24h": 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000,
        "30d": 30 * 24 * 60 * 60 * 1000,
      };
      const sinceMs = sinceMap[sinceParam];

      const result = await storage.getAdminActivityFeed({ page, pageSize, actionType, sinceMs });
      const totalPages = Math.max(1, Math.ceil(result.total / pageSize));

      res.json({
        items: result.items,
        page,
        pageSize,
        total: result.total,
        totalPages,
      });
    } catch (err) {
      console.error("Admin activity feed error:", err);
      res.status(500).json({ message: "Failed to get activity feed" });
    }
  });

  // Admin: Get session detail (for viewing any user's session)
  app.get("/api/admin/sessions/:sessionId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      
      const result = await storage.getSessionDetailForAdmin(sessionId);
      if (!result) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      const { session, user } = result;
      
      // Determine if video is available
      const isDeleted = session.videoDeletedAt !== null;
      const status = isDeleted ? "deleted" : "available";
      
      // Build video URL for admin (reuse existing video endpoint)
      const videoUrl = !isDeleted && session.videoPath ? `/api/admin/sessions/${sessionId}/video` : null;
      
      // Build thumbnail URL
      const thumbnailUrl = session.thumbnailPath ? `/api/sessions/${sessionId}/thumbnail` : null;
      
      // Parse score JSON
      const scoreJson = session.scoreJson as any;
      
      res.json({
        session: {
          id: session.id,
          title: session.title,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          status,
          videoUrl,
          thumbnailUrl,
          transcriptText: session.transcriptEditedText || session.transcriptText,
          goalType: session.goalType,
          score: scoreJson ? {
            total: scoreJson.totalScore,
            breakdown: scoreJson.partScores,
          } : null,
          recommendationsJson: scoreJson ? {
            summary: scoreJson.summary,
            parts: scoreJson.parts,
            delivery: scoreJson.delivery,
          } : null,
          rawScoreJson: scoreJson,
          fileMeta: {
            durationSeconds: session.durationSeconds || 0,
            sizeBytes: session.videoSizeBytes || 0,
            format: session.videoMimeType || "video/mp4",
          },
        },
        user,
      });
    } catch (err) {
      console.error("Admin session detail error:", err);
      res.status(500).json({ message: "Failed to get session details" });
    }
  });

  // Admin: Serve video file for admin viewing
  app.get("/api/admin/sessions/:sessionId/video", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      
      const result = await storage.getSessionDetailForAdmin(sessionId);
      if (!result) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      const { session } = result;
      
      // Check if video is available
      if (session.videoDeletedAt) {
        return res.status(410).json({ message: "Video has been deleted" });
      }
      
      if (!session.videoPath) {
        return res.status(404).json({ message: "Video not found" });
      }
      
      const fs = await import("fs");
      const path = await import("path");
      const videoPath = path.resolve(session.videoPath);
      
      if (!fs.existsSync(videoPath)) {
        return res.status(404).json({ message: "Video file not found" });
      }
      
      const stat = fs.statSync(videoPath);
      const fileSize = stat.size;
      const range = req.headers.range;
      
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        const head = {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": session.videoMimeType || "video/mp4",
        };
        res.writeHead(206, head);
        file.pipe(res);
      } else {
        const head = {
          "Content-Length": fileSize,
          "Content-Type": session.videoMimeType || "video/mp4",
        };
        res.writeHead(200, head);
        fs.createReadStream(videoPath).pipe(res);
      }
    } catch (err) {
      console.error("Admin video serve error:", err);
      res.status(500).json({ message: "Failed to serve video" });
    }
  });

  // List users with search, filter, sort, pagination
  app.get("/api/admin/users", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { search, role, status, provider, consent, membership, sort, page, pageSize } = req.query;
      
      const result = await storage.getAllUsers({
        search: search as string,
        role: role as string,
        status: status as string,
        provider: provider as string,
        consent: consent as string,
        membership: membership as string,
        sort: sort as string,
        page: page ? parseInt(page as string) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      });
      
      // Get identities and credits for provider filter info
      const usersWithProvider = await Promise.all(
        result.users.map(async (user) => {
          const [identities, credits] = await Promise.all([
            storage.getUserIdentitiesByUser(user.id),
            storage.getVideoTrendsCredits(user.id),
          ]);
          const providers = identities.map(i => i.provider);
          const hasLocalPassword = !!user.passwordHash;
          if (hasLocalPassword && !providers.includes("local")) {
            providers.push("local");
          }
          // Destructure to exclude passwordHash from response
          const { passwordHash: _, ...safeUser } = user;
          return {
            ...safeUser,
            providers,
            keywordsCreditsThisMonth: credits.creditsUsed,
            keywordsCreditsTotalUsed: credits.totalCreditsUsed || 0,
          };
        })
      );
      
      // Filter by provider if specified
      let filteredUsers = usersWithProvider;
      if (provider && provider !== "all") {
        filteredUsers = usersWithProvider.filter(u => u.providers.includes(provider as AuthProvider));
      }
      
      res.json({
        users: filteredUsers,
        total: result.total,
        page: page ? parseInt(page as string) : 1,
        pageSize: pageSize ? parseInt(pageSize as string) : 25,
      });
    } catch (err) {
      console.error("Admin list users error:", err);
      res.status(500).json({ message: "Failed to list users" });
    }
  });

  // Get single user with full details
  app.get("/api/admin/users/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userDetails = await storage.getUserWithDetails(id);
      
      if (!userDetails) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check if user has local password
      const hasLocalPassword = !!userDetails.user.passwordHash;
      const providers = userDetails.identities.map(i => i.provider);
      if (hasLocalPassword && !providers.includes("local")) {
        providers.push("local");
      }
      
      // Destructure to exclude passwordHash from response
      const { passwordHash: _, ...safeUser } = userDetails.user;

      // Mirror the list-endpoint shape: include KW credits + total videos so the
      // admin User Details panel shows real numbers instead of silent zeros.
      const credits = await storage.getVideoTrendsCredits(id);

      res.json({
        ...userDetails,
        user: {
          ...safeUser,
          totalVideos: userDetails.sessionCount,
          keywordsCreditsThisMonth: credits.creditsUsed,
          keywordsCreditsTotalUsed: credits.totalCreditsUsed || 0,
        },
        providers,
        hasLocalPassword,
      });
    } catch (err) {
      console.error("Admin get user error:", err);
      res.status(500).json({ message: "Failed to get user details" });
    }
  });
  
  // Admin: Get user action history
  app.get("/api/admin/users/:id/actions", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const cursorParam = req.query.cursor as string | undefined;
      
      let cursor: { createdAt: Date; id: string } | undefined;
      if (cursorParam) {
        const [createdAtStr, cursorId] = cursorParam.split("|");
        if (createdAtStr && cursorId) {
          cursor = { createdAt: new Date(createdAtStr), id: cursorId };
        }
      }
      
      const result = await storage.getUserActionLogs({ userId: id, limit, cursor });
      
      res.json({
        items: result.items.map(item => ({
          id: item.id,
          actionType: item.actionType,
          actionLabel: item.actionLabel,
          entityType: item.entityType,
          entityId: item.entityId,
          metadata: item.metadataJson,
          createdAt: item.createdAt,
          ip: item.ip,
          userAgent: item.userAgent,
        })),
        nextCursor: result.nextCursor 
          ? `${result.nextCursor.createdAt.toISOString()}|${result.nextCursor.id}` 
          : null,
      });
    } catch (err) {
      console.error("Admin get user actions error:", err);
      res.status(500).json({ message: "Failed to get user actions" });
    }
  });

  // Update user (role, disabled status, profile)
  app.patch("/api/admin/users/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const adminUser = (req as any).adminUser;
      const updates = req.body;
      
      const targetUser = await storage.getUser(id);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Prevent demoting self if it would leave no admins
      if (updates.role === "user" && targetUser.isAdmin && id === adminUser.id) {
        const adminCount = await storage.getAdminCount();
        if (adminCount <= 1) {
          return res.status(400).json({ message: "Cannot demote yourself - you are the only admin" });
        }
      }
      
      // Prevent demoting to have 0 admins
      if ((updates.isDisabled === true || updates.role === "user") && targetUser.isAdmin) {
        const adminCount = await storage.getAdminCount();
        if (adminCount <= 1) {
          return res.status(400).json({ message: "Cannot remove the last admin" });
        }
      }
      
      const updateData: any = {};
      
      if (updates.role !== undefined) {
        updateData.isAdmin = updates.role === "admin";
        updateData.role = updates.role;
      }
      
      if (updates.isDisabled !== undefined) {
        updateData.isDisabled = updates.isDisabled;
        updateData.disabledAt = updates.isDisabled ? new Date() : null;
        updateData.disabledReason = updates.isDisabled ? (updates.disabledReason || null) : null;
      }
      
      if (updates.displayName !== undefined) updateData.displayName = updates.displayName;
      if (updates.firstName !== undefined) updateData.firstName = updates.firstName;
      if (updates.lastName !== undefined) updateData.lastName = updates.lastName;
      
      const updatedUser = await storage.updateUser(id, updateData);
      
      // Create audit log
      const action = updates.role !== undefined ? "role_change" : 
                     updates.isDisabled !== undefined ? (updates.isDisabled ? "disable_user" : "enable_user") :
                     "update_user";
      await storage.createAuditLog({
        adminUserId: adminUser.id,
        action,
        targetUserId: id,
        metadataJson: { updates, previousValues: { isAdmin: targetUser.isAdmin, isDisabled: targetUser.isDisabled } },
        ip: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });
      
      res.json({ 
        ...updatedUser, 
        passwordHash: undefined 
      });
    } catch (err) {
      console.error("Admin update user error:", err);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Force logout user (invalidate all sessions)
  app.post("/api/admin/users/:id/force-logout", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const adminUser = (req as any).adminUser;
      
      const targetUser = await storage.getUser(id);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Delete user sessions from session store using raw SQL
      await pool.query(
        `DELETE FROM user_sessions WHERE sess::jsonb->>'userId' = $1`,
        [id]
      );
      
      // Create audit log
      await storage.createAuditLog({
        adminUserId: adminUser.id,
        action: "force_logout",
        targetUserId: id,
        ip: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });
      
      res.json({ message: "User sessions invalidated" });
    } catch (err) {
      console.error("Admin force logout error:", err);
      res.status(500).json({ message: "Failed to force logout user" });
    }
  });

  // ── Admin Impersonation ──────────────────────────────────────────────────────
  // NOTE: /end must be registered before /:userId so "end" is not captured as a userId.

  app.post("/api/admin/impersonate/end", requireAuth, async (req: Request, res: Response) => {
    try {
      const adminId = req.session.impersonatingAdminId;
      if (!adminId) {
        return res.status(400).json({ message: "Not currently impersonating" });
      }

      const adminUser = await storage.getUser(adminId);
      if (!adminUser) {
        req.session.destroy(() => {});
        return res.status(401).json({ message: "Original admin account not found" });
      }

      req.session.userId = adminId;
      delete req.session.impersonatingAdminId;
      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve()))
      );

      console.log(`[impersonate] admin ${adminId} ended impersonation`);
      res.json({ message: "Returned to admin account" });
    } catch (err) {
      console.error("[impersonate] end error:", err);
      res.status(500).json({ message: "Failed to end impersonation" });
    }
  });

  app.post("/api/admin/impersonate/:userId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const targetId = req.params.userId;
      const adminId = req.session.userId!;

      if (targetId === adminId) {
        return res.status(400).json({ message: "Cannot impersonate yourself" });
      }

      const target = await storage.getUser(targetId);
      if (!target) {
        return res.status(404).json({ message: "User not found" });
      }

      req.session.impersonatingAdminId = adminId;
      req.session.userId = targetId;
      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve()))
      );

      console.log(`[impersonate] admin ${adminId} is now impersonating ${targetId}`);
      res.json({ message: "Now impersonating user", userId: targetId });
    } catch (err) {
      console.error("[impersonate] error:", err);
      res.status(500).json({ message: "Failed to start impersonation" });
    }
  });

  // Keywords Everywhere Admin Status
  app.get("/api/admin/keywords-everywhere/status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { getKeywordsEverywhereCredits: getKECredits } = await import("./topic-pulse");
      
      // Get system KE account credits (no user ID = system key)
      const keCredits = await getKECredits();
      
      // Get aggregate usage from all users
      const aggregateStats = await storage.getAggregateVideoTrendsCredits();
      
      res.json({
        apiConfigured: keCredits.credits !== null || !keCredits.error?.includes("not configured"),
        accountCredits: keCredits.credits,
        accountError: keCredits.error || null,
        totalCreditsUsedAllTime: aggregateStats.totalCreditsUsedAllTime,
        totalCreditsUsedThisMonth: aggregateStats.totalCreditsUsedThisMonth,
        activeUsersThisMonth: aggregateStats.activeUsers,
        topUsers: aggregateStats.topUsers,
      });
    } catch (err) {
      console.error("Keywords Everywhere status error:", err);
      res.status(500).json({ message: "Failed to get Keywords Everywhere status" });
    }
  });

  // Get monthly credits limit
  app.get("/api/admin/ke/monthly-limit", requireAdmin, async (req: Request, res: Response) => {
    try {
      const limit = await storage.getMonthlyCreditsLimit();
      res.json({ limit });
    } catch (err) {
      console.error("KE monthly limit get error:", err);
      res.status(500).json({ message: "Failed to get monthly credits limit" });
    }
  });

  // Set monthly credits limit
  app.put("/api/admin/ke/monthly-limit", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { limit } = req.body as { limit: number };
      if (!limit || typeof limit !== "number" || limit < 1 || limit > 1000000) {
        return res.status(400).json({ message: "limit must be a number between 1 and 1,000,000" });
      }
      await storage.setMonthlyCreditsLimit(Math.floor(limit));
      res.json({ ok: true, limit: Math.floor(limit) });
    } catch (err) {
      console.error("KE monthly limit set error:", err);
      res.status(500).json({ message: "Failed to set monthly credits limit" });
    }
  });

  // Detect duplicate email accounts
  app.get("/api/admin/users/duplicates", requireAdmin, async (req: Request, res: Response) => {
    try {
      const duplicates = await storage.findDuplicateEmails();
      res.json({ duplicates });
    } catch (err) {
      console.error("Find duplicates error:", err);
      res.status(500).json({ message: "Failed to find duplicate accounts" });
    }
  });

  // Merge duplicate accounts
  app.post("/api/admin/users/merge", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { primaryUserId, duplicateUserId, confirm } = req.body;
      
      if (!primaryUserId || !duplicateUserId) {
        return res.status(400).json({ message: "Both primaryUserId and duplicateUserId are required" });
      }
      
      if (confirm !== "CONFIRM_MERGE") {
        return res.status(400).json({ message: "Confirmation required. Pass confirm: 'CONFIRM_MERGE'" });
      }
      
      const result = await storage.mergeUsers(primaryUserId, duplicateUserId);
      
      if (result.success) {
        // Log the merge action with complete details
        await storage.createAuditLog({
          adminUserId: req.session.userId!,
          action: "merge_users",
          targetUserId: primaryUserId,
          metadataJson: {
            duplicateUserId,
            reassignedSessions: result.reassignedSessions,
            reassignedIdentities: result.reassignedIdentities,
            skippedIdentities: result.skippedIdentities,
          },
          ip: req.ip || null,
          userAgent: req.headers["user-agent"] || null,
        });
        
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (err) {
      console.error("Merge users error:", err);
      res.status(500).json({ message: "Failed to merge accounts" });
    }
  });

  // ONE-TIME: reset all email addresses so members get fresh name-based ones
  app.post("/api/admin/reset-email-addresses", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { confirm } = req.body;
      if (confirm !== "RESET_CONFIRMED") {
        return res.status(400).json({ message: "Pass confirm: 'RESET_CONFIRMED'" });
      }
      const result = await storage.resetAllEmailAddresses();
      console.log("[admin] reset-email-addresses:", result);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error("[admin] reset-email-addresses error:", err);
      res.status(500).json({ message: "Failed to reset addresses" });
    }
  });

  // ===================
  // ACCOUNT ROUTES
  // ===================

  // Get current user's account info with connected providers
  app.get("/api/account", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const identities = await storage.getUserIdentitiesByUser(user.id);
      const connectedProviders = identities.map((i) => i.provider);
      const hasPassword = !!user.passwordHash;

      const gravatarHash = user.email
        ? crypto.createHash("md5").update(user.email.trim().toLowerCase()).digest("hex")
        : null;

      res.json({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerifiedAt: user.emailVerifiedAt,
        emailConsentAt: user.emailConsentAt,
        createdAt: user.createdAt,
        connectedProviders,
        hasPassword,
        themePreference: user.themePreference || "system",
        timezone: user.timezone || "America/New_York",
        cfEnrolled: !!user.cfEnrolled,
        cfEnrolledAt: user.cfEnrolledAt,
        cfRevokedAt: user.cfRevokedAt,
        lastLoginAt: user.lastLoginAt,
        gravatarHash,
      });
    } catch (err) {
      console.error("Get account error:", err);
      res.status(500).json({ message: "Failed to fetch account" });
    }
  });

  // Recent activity for the current user (newest first, capped at 10)
  app.get("/api/account/activity", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await storage.getUserActionLogs({ userId: req.session.userId!, limit: 10 });
      res.json({
        items: result.items.map((item) => ({
          id: item.id,
          actionType: item.actionType,
          actionLabel: item.actionLabel,
          createdAt: item.createdAt,
          ip: item.ip,
          userAgent: item.userAgent,
        })),
      });
    } catch (err) {
      console.error("Get account activity error:", err);
      res.status(500).json({ message: "Failed to fetch activity" });
    }
  });

  // Update account profile
  app.patch("/api/account", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = updateAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { displayName, firstName, lastName, themePreference, timezone } = parsed.data;
      const updates: any = { updatedAt: new Date() };

      if (displayName !== undefined) updates.displayName = displayName;
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;
      if (themePreference !== undefined) updates.themePreference = themePreference;
      if (timezone !== undefined) {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: timezone });
          updates.timezone = timezone;
        } catch {
          return res.status(400).json({ message: "Invalid timezone" });
        }
      }
      // Email is tied to ClickFunnels membership and cannot be changed via this endpoint.

      const updatedUser = await storage.updateUser(user.id, updates);
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to update account" });
      }
      
      // Log account update
      logUserAction({
        userId: user.id,
        actionType: "account_updated",
        actionLabel: ActionLabels.account_updated,
        entityType: "account",
        metadata: { fieldsUpdated: Object.keys(updates).filter(k => k !== 'updatedAt') },
        req,
      });

      const identities = await storage.getUserIdentitiesByUser(user.id);
      const connectedProviders = identities.map((i) => i.provider);

      res.json({
        id: updatedUser.id,
        email: updatedUser.email,
        displayName: updatedUser.displayName,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        emailVerifiedAt: updatedUser.emailVerifiedAt,
        emailConsentAt: updatedUser.emailConsentAt,
        createdAt: updatedUser.createdAt,
        connectedProviders,
        hasPassword: !!updatedUser.passwordHash,
        themePreference: updatedUser.themePreference || "system",
        timezone: updatedUser.timezone || "America/New_York",
      });
    } catch (err) {
      console.error("Update account error:", err);
      res.status(500).json({ message: "Failed to update account" });
    }
  });

  // Set password for OAuth-only accounts
  app.post("/api/account/set-password", requireAuth, async (req: Request, res: Response) => {
    try {
      const { password } = req.body;
      if (!password || typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.passwordHash) {
        return res.status(400).json({ message: "Password already set. Use change password instead." });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      await storage.updateUser(user.id, { passwordHash, updatedAt: new Date() });

      res.json({ message: "Password set successfully" });
    } catch (err) {
      console.error("Set password error:", err);
      res.status(500).json({ message: "Failed to set password" });
    }
  });

  // Disconnect an OAuth provider
  app.delete("/api/account/identities/:provider", requireAuth, async (req: Request, res: Response) => {
    try {
      const provider = req.params.provider as AuthProvider;
      if (!["google"].includes(provider)) {
        return res.status(400).json({ message: "Invalid provider" });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const identities = await storage.getUserIdentitiesByUser(user.id);
      const hasPassword = !!user.passwordHash;
      const otherIdentities = identities.filter((i) => i.provider !== provider);

      // Prevent lockout: must have at least one other sign-in method
      if (!hasPassword && otherIdentities.length === 0) {
        return res.status(400).json({ 
          message: "Cannot disconnect. You need at least one sign-in method (password or another social login)." 
        });
      }

      const deleted = await storage.deleteUserIdentity(user.id, provider);
      if (!deleted) {
        return res.status(404).json({ message: "Provider not connected" });
      }

      res.json({ message: `${provider} disconnected successfully` });
    } catch (err) {
      console.error("Disconnect provider error:", err);
      res.status(500).json({ message: "Failed to disconnect provider" });
    }
  });

  // Connect a new OAuth provider (redirects, similar to login flow but links to current user)
  app.get("/api/account/connect/google", requireAuth, (req: Request, res: Response, next: NextFunction) => {
    // Store userId in session to link after callback
    (req.session as any).connectingUserId = req.session.userId;
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
  });


  // Update consent for email
  app.post("/api/account/consent", requireAuth, async (req: Request, res: Response) => {
    try {
      const { emailConsent } = req.body;
      
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (emailConsent === true && !user.emailConsentAt) {
        const clientIp = req.ip || req.socket.remoteAddress || "unknown";
        await storage.updateUser(user.id, {
          emailConsentAt: new Date(),
          emailConsentIp: clientIp,
          updatedAt: new Date(),
        });

        res.json({ message: "Consent recorded" });
      } else {
        res.json({ message: "No changes made" });
      }
    } catch (err) {
      console.error("Update consent error:", err);
      res.status(500).json({ message: "Failed to update consent" });
    }
  });

  // ===================
  // SESSION ROUTES
  // ===================

  // === FOLDER ROUTES ===
  
  app.get("/api/folders", requireAuth, async (req: Request, res: Response) => {
    try {
      const folders = await storage.getFoldersByUser(req.session.userId!);
      res.json(folders);
    } catch (err) {
      console.error("Get folders error:", err);
      res.status(500).json({ message: "Failed to fetch folders" });
    }
  });

  app.post("/api/folders", requireAuth, async (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "Folder name is required" });
      }
      
      const trimmedName = name.trim().slice(0, 50);
      
      const folder = await storage.createFolder({
        userId: req.session.userId!,
        name: trimmedName,
      });
      
      logUserAction({
        userId: req.session.userId!,
        actionType: "folder_created",
        actionLabel: `Created folder "${trimmedName}"`,
        entityType: "folder",
        entityId: folder.id,
        metadata: { name: trimmedName },
        req,
      });
      
      res.status(201).json(folder);
    } catch (err) {
      console.error("Create folder error:", err);
      res.status(500).json({ message: "Failed to create folder" });
    }
  });

  app.patch("/api/folders/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "Folder name is required" });
      }
      
      const trimmedName = name.trim().slice(0, 50);
      
      const folder = await storage.updateFolder(req.params.id, req.session.userId!, { name: trimmedName });
      
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      
      logUserAction({
        userId: req.session.userId!,
        actionType: "folder_renamed",
        actionLabel: `Renamed folder to "${trimmedName}"`,
        entityType: "folder",
        entityId: folder.id,
        metadata: { name: trimmedName },
        req,
      });
      
      res.json(folder);
    } catch (err) {
      console.error("Update folder error:", err);
      res.status(500).json({ message: "Failed to update folder" });
    }
  });

  app.delete("/api/folders/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteFolder(req.params.id, req.session.userId!);
      
      if (!deleted) {
        return res.status(404).json({ message: "Folder not found" });
      }
      
      logUserAction({
        userId: req.session.userId!,
        actionType: "folder_deleted",
        actionLabel: "Deleted folder",
        entityType: "folder",
        entityId: req.params.id,
        req,
      });
      
      res.json({ success: true });
    } catch (err) {
      console.error("Delete folder error:", err);
      res.status(500).json({ message: "Failed to delete folder" });
    }
  });

  // === BULK SESSION OPERATIONS ===
  
  app.post("/api/sessions/move", requireAuth, async (req: Request, res: Response) => {
    try {
      const { sessionIds, folderId } = req.body;
      
      if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
        return res.status(400).json({ message: "sessionIds array is required" });
      }
      
      if (folderId !== null && typeof folderId !== "string") {
        return res.status(400).json({ message: "folderId must be a string or null" });
      }
      
      // Validate folder ownership if moving to a folder
      if (folderId !== null) {
        const folders = await storage.getFoldersByUser(req.session.userId!);
        if (!folders.some(f => f.id === folderId)) {
          return res.status(404).json({ message: "Folder not found" });
        }
      }
      
      const movedCount = await storage.moveSessions(sessionIds, req.session.userId!, folderId);
      
      logUserAction({
        userId: req.session.userId!,
        actionType: "session_moved_to_folder",
        actionLabel: `Moved ${movedCount} session(s) to ${folderId ? 'folder' : 'Unfiled'}`,
        entityType: "session",
        metadata: { sessionIds, folderId, movedCount },
        req,
      });
      
      res.json({ success: true, movedCount });
    } catch (err) {
      console.error("Move sessions error:", err);
      res.status(500).json({ message: "Failed to move sessions" });
    }
  });

  app.delete("/api/sessions/bulk", requireAuth, async (req: Request, res: Response) => {
    try {
      const { sessionIds } = req.body;
      
      if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
        return res.status(400).json({ message: "sessionIds array is required" });
      }
      
      const { deletedCount, deletedPaths } = await storage.deleteSessions(sessionIds, req.session.userId!);
      
      // Clean up files
      for (const filePath of deletedPaths) {
        try {
          await fs.promises.unlink(filePath);
        } catch (unlinkErr: any) {
          if (unlinkErr.code !== 'ENOENT') {
            console.error(`Failed to delete file ${filePath}:`, unlinkErr);
          }
        }
      }
      
      logUserAction({
        userId: req.session.userId!,
        actionType: "sessions_bulk_deleted",
        actionLabel: `Deleted ${deletedCount} session(s)`,
        entityType: "session",
        metadata: { sessionIds, deletedCount },
        req,
      });
      
      res.json({ success: true, deletedCount });
    } catch (err) {
      console.error("Bulk delete sessions error:", err);
      res.status(500).json({ message: "Failed to delete sessions" });
    }
  });

  app.delete("/api/sessions/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      const { deletedCount, deletedPaths } = await storage.deleteSessions([req.params.id], req.session.userId!);
      
      // Clean up files
      for (const filePath of deletedPaths) {
        try {
          await fs.promises.unlink(filePath);
        } catch (unlinkErr: any) {
          if (unlinkErr.code !== 'ENOENT') {
            console.error(`Failed to delete file ${filePath}:`, unlinkErr);
          }
        }
      }
      
      logUserAction({
        userId: req.session.userId!,
        actionType: "session_deleted",
        actionLabel: `Deleted session "${session.title || 'Untitled'}"`,
        entityType: "session",
        entityId: req.params.id,
        metadata: { title: session.title },
        req,
      });
      
      res.json({ success: true });
    } catch (err) {
      console.error("Delete session error:", err);
      res.status(500).json({ message: "Failed to delete session" });
    }
  });

  app.get("/api/sessions", requireAuth, async (req: Request, res: Response) => {
    try {
      const sessions = await storage.getSessionsByUser(req.session.userId!);
      res.json(sessions);
    } catch (err) {
      console.error("Get sessions error:", err);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  app.get("/api/sessions/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(session);
    } catch (err) {
      console.error("Get session error:", err);
      res.status(500).json({ message: "Failed to fetch session" });
    }
  });

  app.get("/api/sessions/:id/thumbnail", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!session.thumbnailPath) {
        return res.status(404).json({ message: "No thumbnail available" });
      }

      if (session.thumbnailPath.startsWith('/objects/')) {
        try {
          const objectFile = await objectStorageService.getObjectEntityFile(session.thumbnailPath);
          await objectStorageService.downloadObject(objectFile, res, 86400);
        } catch (objErr) {
          console.error(`[Thumbnail] Object storage error for session ${session.id}:`, objErr);
          return res.status(404).json({ message: "Thumbnail unavailable" });
        }
      } else {
        const thumbnailFullPath = path.join(UPLOADS_DIR, session.thumbnailPath);
        
        try {
          if (!fs.existsSync(thumbnailFullPath)) {
            console.warn(`[Thumbnail] File not found for session ${session.id}`);
            return res.status(404).json({ message: "Thumbnail unavailable" });
          }

          const stat = fs.statSync(thumbnailFullPath);
          const ext = path.extname(session.thumbnailPath).toLowerCase();
          const mimeType = ext === ".webp" ? "image/webp" : ext === ".png" ? "image/png" : "image/jpeg";

          res.setHeader("Content-Type", mimeType);
          res.setHeader("Content-Length", stat.size);
          res.setHeader("Cache-Control", "public, max-age=86400");
          
          const readStream = fs.createReadStream(thumbnailFullPath);
          readStream.on("error", (streamErr) => {
            console.error(`[Thumbnail] Stream error for session ${session.id}:`, streamErr);
            if (!res.headersSent) {
              res.status(500).json({ message: "Failed to serve thumbnail" });
            }
          });
          readStream.pipe(res);
        } catch (fsErr) {
          console.error(`[Thumbnail] Filesystem error for session ${session.id}:`, fsErr);
          return res.status(404).json({ message: "Thumbnail unavailable" });
        }
      }
    } catch (err) {
      console.error("[Thumbnail] Error:", err);
      res.status(404).json({ message: "Thumbnail unavailable" });
    }
  });

  app.get("/api/sessions/:id/poster", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!session.previewPosterPath) {
        return res.status(404).json({ message: "No poster available" });
      }

      if (session.previewPosterPath.startsWith('/objects/')) {
        try {
          const objectFile = await objectStorageService.getObjectEntityFile(session.previewPosterPath);
          await objectStorageService.downloadObject(objectFile, res, 86400);
        } catch (objErr) {
          console.error(`[Poster] Object storage error for session ${session.id}:`, objErr);
          return res.status(404).json({ message: "Poster unavailable" });
        }
      } else {
        const posterFullPath = path.join(UPLOADS_DIR, session.previewPosterPath);
        
        try {
          if (!fs.existsSync(posterFullPath)) {
            console.warn(`[Poster] File not found for session ${session.id}`);
            return res.status(404).json({ message: "Poster unavailable" });
          }

          const stat = fs.statSync(posterFullPath);
          const mimeType = session.previewPosterMimeType || "image/jpeg";

          res.setHeader("Content-Type", mimeType);
          res.setHeader("Content-Length", stat.size);
          res.setHeader("Cache-Control", "public, max-age=86400");
          
          const readStream = fs.createReadStream(posterFullPath);
          readStream.on("error", (streamErr) => {
            console.error(`[Poster] Stream error for session ${session.id}:`, streamErr);
            if (!res.headersSent) {
              res.status(500).json({ message: "Failed to serve poster" });
            }
          });
          readStream.pipe(res);
        } catch (fsErr) {
          console.error(`[Poster] Filesystem error for session ${session.id}:`, fsErr);
          return res.status(404).json({ message: "Poster unavailable" });
        }
      }
    } catch (err) {
      console.error("[Poster] Error:", err);
      res.status(404).json({ message: "Poster unavailable" });
    }
  });

  app.get("/api/sessions/:id/timeline/:frameIndex", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      const frameIndex = parseInt(req.params.frameIndex, 10);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!session.timelineFrames || !Array.isArray(session.timelineFrames)) {
        return res.status(404).json({ message: "No timeline frames available" });
      }

      if (isNaN(frameIndex) || frameIndex < 0 || frameIndex >= session.timelineFrames.length) {
        return res.status(404).json({ message: "Invalid frame index" });
      }

      const framePath = session.timelineFrames[frameIndex];
      
      if (framePath.startsWith('/objects/')) {
        try {
          const objectFile = await objectStorageService.getObjectEntityFile(framePath);
          await objectStorageService.downloadObject(objectFile, res, 86400);
        } catch (objErr) {
          console.error(`[Timeline] Object storage error for session ${session.id}:`, objErr);
          return res.status(404).json({ message: "Frame unavailable" });
        }
      } else {
        const frameFullPath = path.join(UPLOADS_DIR, framePath);
        
        try {
          if (!fs.existsSync(frameFullPath)) {
            console.warn(`[Timeline] Frame not found for session ${session.id}, index ${frameIndex}`);
            return res.status(404).json({ message: "Frame unavailable" });
          }

          const stat = fs.statSync(frameFullPath);
          res.setHeader("Content-Type", "image/jpeg");
          res.setHeader("Content-Length", stat.size);
          res.setHeader("Cache-Control", "public, max-age=86400");
          
          const readStream = fs.createReadStream(frameFullPath);
          readStream.on("error", (streamErr) => {
            console.error(`[Timeline] Stream error for session ${session.id}:`, streamErr);
            if (!res.headersSent) {
              res.status(500).json({ message: "Failed to serve frame" });
            }
          });
          readStream.pipe(res);
        } catch (fsErr) {
          console.error(`[Timeline] Filesystem error for session ${session.id}:`, fsErr);
          return res.status(404).json({ message: "Frame unavailable" });
        }
      }
    } catch (err) {
      console.error("[Timeline] Error:", err);
      res.status(404).json({ message: "Frame unavailable" });
    }
  });

  app.post("/api/sessions", requireAuth, async (req: Request, res: Response) => {
    try {
      const { goalType, durationSeconds, title } = req.body;

      if (!goalTypes.includes(goalType)) {
        return res.status(400).json({ message: "Invalid goal type" });
      }

      const trimmedTitle = title?.trim().slice(0, 80) || null;

      const session = await storage.createSession({
        userId: req.session.userId!,
        goalType: goalType as GoalType,
        durationSeconds: durationSeconds || null,
        expiresAt: null,
        videoPath: null,
        videoMimeType: null,
        videoSizeBytes: null,
        videoDeletedAt: null,
        transcriptText: null,
        transcriptEditedText: null,
        scoreJson: null,
        scoreUpdatedAt: null,
        title: trimmedTitle,
        titleSource: trimmedTitle ? "user" : null,
        titleGeneratedAt: trimmedTitle ? new Date() : null,
      });
      
      // Log session created
      logUserAction({
        userId: req.session.userId!,
        actionType: "session_created",
        actionLabel: ActionLabels.session_created,
        entityType: "session",
        entityId: session.id,
        metadata: { goalType, title: trimmedTitle, durationSeconds },
        req,
      });

      res.status(201).json({ id: session.id });
    } catch (err) {
      console.error("Create session error:", err);
      res.status(500).json({ message: "Failed to create session" });
    }
  });

  app.post("/api/sessions/youtube", requireAuth, async (req: Request, res: Response) => {
    const traceId = `yt-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log(`[YouTube:${traceId}] Processing YouTube URL submission`);
    
    try {
      const { youtubeUrl, goalType, title, rightsConfirmed } = req.body;
      
      if (!youtubeUrl || typeof youtubeUrl !== "string") {
        return res.status(400).json({ message: "YouTube URL is required", traceId });
      }
      
      if (!isValidYouTubeUrl(youtubeUrl)) {
        return res.status(400).json({ message: "Invalid YouTube URL. Please provide a valid YouTube video link.", traceId });
      }
      
      if (!goalTypes.includes(goalType)) {
        return res.status(400).json({ message: "Invalid goal type", traceId });
      }
      
      if (rightsConfirmed !== true) {
        return res.status(400).json({ message: "You must confirm you have rights to use this content", traceId });
      }
      
      const sanitizedTitle = title && typeof title === "string" ? title.trim().slice(0, 80) : null;
      
      const videoId = extractYouTubeVideoId(youtubeUrl);
      if (!videoId) {
        return res.status(400).json({ message: "Could not extract video ID from URL", traceId });
      }
      
      console.log(`[YouTube:${traceId}] Downloading audio and thumbnail for video ${videoId}`);
      
      const downloadResult = await downloadYouTubeAudio(youtubeUrl, UPLOADS_DIR);
      
      if (!downloadResult.success || !downloadResult.audioPath) {
        console.error(`[YouTube:${traceId}] Download failed:`, downloadResult.error);
        return res.status(400).json({ 
          message: downloadResult.error || "Failed to download YouTube video",
          traceId 
        });
      }
      
      const sessionTitle = sanitizedTitle || downloadResult.videoInfo?.title?.slice(0, 80) || null;
      
      const session = await storage.createSession({
        userId: req.session.userId!,
        goalType: goalType as GoalType,
        durationSeconds: downloadResult.videoInfo?.duration || null,
        expiresAt: null,
        videoPath: null,
        videoMimeType: null,
        videoSizeBytes: null,
        videoDeletedAt: null,
        transcriptText: null,
        transcriptEditedText: null,
        scoreJson: null,
        scoreUpdatedAt: null,
        title: sessionTitle,
        titleSource: title?.trim() ? "user" : downloadResult.videoInfo?.title ? "youtube" : null,
        titleGeneratedAt: sessionTitle ? new Date() : null,
        sourceType: "youtube",
        youtubeUrl,
        youtubeVideoId: videoId,
        youtubeTitle: downloadResult.videoInfo?.title || null,
        thumbnailPath: downloadResult.thumbnailPath || null,
        processingStatus: "queued",
        processingProgress: 0,
        processingMessage: "YouTube video downloaded, preparing for transcription...",
      });
      
      logUserAction({
        userId: req.session.userId!,
        actionType: "session_created",
        actionLabel: ActionLabels.session_created,
        entityType: "session",
        entityId: session.id,
        metadata: { goalType, title: sessionTitle, sourceType: "youtube", youtubeVideoId: videoId, traceId },
        req,
      });
      
      console.log(`[YouTube:${traceId}] Session created: ${session.id}, starting processing`);
      
      processSession(session.id, req.session.userId!, downloadResult.audioPath).catch((err) => {
        console.error(`[YouTube:${traceId}] Processing error for session ${session.id}:`, err);
      });
      
      res.status(201).json({ 
        id: session.id, 
        title: sessionTitle,
        duration: downloadResult.videoInfo?.duration,
        thumbnailPath: downloadResult.thumbnailPath,
        traceId 
      });
    } catch (err) {
      console.error(`[YouTube:${traceId}] Error:`, err);
      res.status(500).json({ 
        message: "Failed to process YouTube video",
        error: err instanceof Error ? err.message : "Unknown error",
        traceId 
      });
    }
  });

  app.patch("/api/sessions/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { title } = req.body;
      
      if (typeof title !== "string") {
        return res.status(400).json({ message: "Title must be a string" });
      }

      const trimmedTitle = title.trim().slice(0, 80);

      await storage.updateSession(session.id, {
        title: trimmedTitle || null,
        titleSource: "user",
        titleGeneratedAt: new Date(),
      });

      res.json({ title: trimmedTitle });
    } catch (err) {
      console.error("Update session error:", err);
      res.status(500).json({ message: "Failed to update session" });
    }
  });

  // Request a presigned URL for direct-to-cloud video upload
  // This bypasses the Replit proxy size limit for large files
  const objectStorageService = new ObjectStorageService();
  
  app.post("/api/sessions/:id/request-upload-url", requireAuth, async (req: Request, res: Response) => {
    const traceId = `presign-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log(`[Presign:${traceId}] Requesting upload URL for session ${req.params.id}`);
    
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        console.log(`[Presign:${traceId}] Session not found`);
        return res.status(404).json({ message: "Session not found", traceId });
      }

      if (session.userId !== req.session.userId) {
        console.log(`[Presign:${traceId}] Access denied`);
        return res.status(403).json({ message: "Access denied", traceId });
      }

      const { name, size, contentType } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: "Missing required field: name", traceId });
      }

      // Validate file size
      if (size && size > MAX_VIDEO_SIZE) {
        return res.status(400).json({ 
          message: `File too large. Maximum size is ${MAX_VIDEO_SIZE / (1024 * 1024 * 1024)}GB`,
          traceId 
        });
      }

      // Validate file extension
      const ext = path.extname(name).toLowerCase();
      if (!SUPPORTED_VIDEO_EXTENSIONS.includes(ext)) {
        return res.status(400).json({ 
          message: `Unsupported file type. Please upload MP4, MOV, WebM, MKV, AVI, or other common video formats.`,
          traceId 
        });
      }

      // Generate presigned URL for upload
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      console.log(`[Presign:${traceId}] Generated upload URL, objectPath: ${objectPath}`);

      // Store the pending upload info in session, including the issued object path
      // so confirm-upload can verify it matches and prevent path substitution attacks
      await storage.updateSession(session.id, {
        processingStatus: "uploading",
        processingProgress: 0,
        processingMessage: "Preparing for upload...",
        cloudStoragePath: objectPath,
      });

      res.json({
        uploadURL,
        objectPath,
        traceId,
        metadata: { name, size, contentType },
      });
    } catch (err) {
      console.error(`[Presign:${traceId}] Error:`, err);
      res.status(500).json({ 
        message: "Failed to generate upload URL",
        error: err instanceof Error ? err.message : "Unknown error",
        traceId,
      });
    }
  });

  // Confirm upload completion and start processing (for direct-to-cloud uploads)
  app.post("/api/sessions/:id/confirm-upload", requireAuth, async (req: Request, res: Response) => {
    const traceId = `confirm-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log(`[Confirm:${traceId}] Confirming upload for session ${req.params.id}`);
    
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        console.log(`[Confirm:${traceId}] Session not found`);
        return res.status(404).json({ message: "Session not found", traceId });
      }

      if (session.userId !== req.session.userId) {
        console.log(`[Confirm:${traceId}] Access denied`);
        return res.status(403).json({ message: "Access denied", traceId });
      }

      const { objectPath, filename, size, contentType } = req.body;
      
      if (!objectPath || !filename) {
        return res.status(400).json({ message: "Missing required fields: objectPath, filename", traceId });
      }

      // Verify the object path matches the one issued for this session during request-upload-url.
      // This prevents a user from substituting an arbitrary path to access another user's object.
      if (!session.cloudStoragePath || session.cloudStoragePath !== objectPath) {
        console.warn(`[Confirm:${traceId}] Object path mismatch: supplied=${objectPath}, expected=${session.cloudStoragePath}`);
        return res.status(403).json({ message: "Object path does not match the upload issued for this session", traceId });
      }

      console.log(`[Confirm:${traceId}] Object path: ${objectPath}, filename: ${filename}, size: ${size}`);

      // Download the file from cloud storage to local disk for processing
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(filename).toLowerCase() || ".mp4";
      const localFilename = uniqueSuffix + ext;
      const localPath = path.join(UPLOADS_DIR, localFilename);

      console.log(`[Confirm:${traceId}] Streaming from cloud storage to ${localPath}`);

      try {
        const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

        // Enforce MAX_VIDEO_SIZE against the authoritative cloud-storage metadata
        // before touching local disk.  The client-supplied `size` in the request body
        // is untrustworthy; reading it from object metadata closes the bypass.
        // This check is fail-closed: any failure to retrieve or parse the metadata
        // results in a rejection rather than a fallback to disk materialization.
        const [objectMetadata] = await objectFile.getMetadata();
        const actualSize = Number(objectMetadata.size);
        if (isNaN(actualSize)) {
          console.warn(`[Confirm:${traceId}] Could not determine object size from metadata`);
          return res.status(500).json({ message: "Could not verify upload size", traceId });
        }
        if (actualSize > MAX_VIDEO_SIZE) {
          console.warn(`[Confirm:${traceId}] Object too large: ${actualSize} bytes (max ${MAX_VIDEO_SIZE})`);
          return res.status(400).json({
            message: `File too large. Maximum size is ${MAX_VIDEO_SIZE / (1024 * 1024 * 1024)}GB`,
            traceId,
          });
        }
        console.log(`[Confirm:${traceId}] Object size check passed: ${actualSize} bytes`);

        // Stream the file to disk instead of buffering in memory
        // This is critical for handling large files (700MB+)
        await new Promise<void>((resolve, reject) => {
          const readStream = objectFile.createReadStream();
          const writeStream = fs.createWriteStream(localPath);
          
          readStream.on("error", (err) => {
            console.error(`[Confirm:${traceId}] Read stream error:`, err);
            writeStream.destroy();
            reject(err);
          });
          
          writeStream.on("error", (err) => {
            console.error(`[Confirm:${traceId}] Write stream error:`, err);
            readStream.destroy();
            reject(err);
          });
          
          writeStream.on("finish", () => {
            const stats = fs.statSync(localPath);
            console.log(`[Confirm:${traceId}] Streamed ${stats.size} bytes to ${localPath}`);
            resolve();
          });
          
          readStream.pipe(writeStream);
        });
      } catch (downloadErr) {
        console.error(`[Confirm:${traceId}] Failed to stream from cloud storage:`, downloadErr);
        // Clean up partial file if it exists
        try {
          if (fs.existsSync(localPath)) {
            fs.unlinkSync(localPath);
          }
        } catch {}
        return res.status(500).json({ 
          message: "Failed to download file from cloud storage",
          error: downloadErr instanceof Error ? downloadErr.message : "Unknown error",
          traceId,
        });
      }

      // Probe the video file
      const probeResult = await probeVideo(localPath);
      
      if (!probeResult.success) {
        console.log(`[Confirm:${traceId}] Probe failed: ${probeResult.error}`);
        try {
          fs.unlinkSync(localPath);
        } catch {}
        
        await logUserAction({
          userId: req.session.userId!,
          actionType: "file_validation_failed",
          actionLabel: ActionLabels.file_validation_failed,
          entityType: "session",
          entityId: session.id,
          metadata: { error: probeResult.error, filename, traceId },
          req,
        });
        
        return res.status(400).json({ message: probeResult.error || "Invalid video file", traceId });
      }

      if (!probeResult.hasAudio) {
        console.log(`[Confirm:${traceId}] No audio track detected`);
        try {
          fs.unlinkSync(localPath);
        } catch {}
        return res.status(400).json({ message: "Video must have an audio track for transcription", traceId });
      }
      
      console.log(`[Confirm:${traceId}] Probe successful: duration=${probeResult.duration}s, resolution=${probeResult.width}x${probeResult.height}`);

      // Update session with all metadata and set to queued
      await storage.updateSession(session.id, {
        videoPath: localFilename,
        videoMimeType: contentType || "video/mp4",
        videoSizeBytes: size || fs.statSync(localPath).size,
        originalUploadFilename: filename,
        originalUploadMimeType: contentType || "video/mp4",
        originalUploadSizeBytes: size || fs.statSync(localPath).size,
        originalUploadExtension: ext,
        originalUploadPath: localFilename,
        cloudStoragePath: objectPath,
        originalProbeJson: probeResult.data,
        durationSeconds: Math.round(probeResult.duration),
        finalVideoResolution: `${probeResult.width}x${probeResult.height}`,
        finalVideoPath: null,
        processingStatus: "queued",
        processingProgress: 10,
        processingMessage: "Queued for processing...",
        processingError: null,
        processingStartedAt: null,
        processingCompletedAt: null,
        transcriptText: null,
        transcriptEditedText: null,
        scoreJson: null,
        scoreUpdatedAt: null,
      });

      console.log(`[Confirm:${traceId}] Metadata persisted, session status is queued`);

      await logUserAction({
        userId: req.session.userId!,
        actionType: "video_uploaded",
        actionLabel: ActionLabels.video_uploaded,
        entityType: "session",
        entityId: session.id,
        metadata: { 
          filename, 
          size: size || fs.statSync(localPath).size,
          duration: probeResult.duration,
          resolution: `${probeResult.width}x${probeResult.height}`,
          traceId,
          uploadMethod: "cloud_storage",
        },
        req,
      });

      // Start processing in background
      const userId = req.session.userId!;
      const sessionId = session.id;
      setTimeout(() => {
        console.log(`[Confirm:${traceId}] Starting background processing for session ${sessionId}`);
        processSession(sessionId, userId).catch((err) => {
          console.error(`[Confirm:${traceId}] Background processing error:`, err);
        });
      }, 0);

      console.log(`[Confirm:${traceId}] Upload confirmed, processing scheduled`);

      res.json({ 
        success: true,
        message: "Video uploaded successfully",
        sessionId: session.id,
        duration: probeResult.duration,
        hasAudio: probeResult.hasAudio,
        resolution: `${probeResult.width}x${probeResult.height}`,
        traceId,
      });
    } catch (err) {
      console.error(`[Confirm:${traceId}] Error:`, err);
      res.status(500).json({ 
        message: "Failed to confirm upload",
        error: err instanceof Error ? err.message : "Unknown error",
        traceId,
      });
    }
  });

  app.post("/api/sessions/:id/upload", requireAuth, requireSessionOwnership, upload.single("video"), async (req: Request, res: Response) => {
    const traceId = `upload-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log(`[Upload:${traceId}] Starting upload for session ${req.params.id}`);

    // Helper: delete the multer-written file if we need to abort after it was saved
    const cleanupUploadedFile = () => {
      if (req.file) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
    };
    
    try {
      // Session ownership was already verified by requireSessionOwnership middleware
      const session = res.locals.verifiedSession;

      if (!req.file) {
        console.log(`[Upload:${traceId}] No video file provided`);
        return res.status(400).json({ message: "No video file provided", traceId });
      }

      console.log(`[Upload:${traceId}] File received: ${req.file.originalname}, size: ${req.file.size}, path: ${req.file.filename}`);

      // Clean up old files on re-upload
      if (session.videoPath) {
        const oldVideoPath = path.join(UPLOADS_DIR, session.videoPath);
        try {
          if (fs.existsSync(oldVideoPath)) {
            fs.unlinkSync(oldVideoPath);
          }
        } catch {}
      }
      if (session.finalVideoPath && session.finalVideoPath !== session.videoPath) {
        const oldFinalPath = path.join(UPLOADS_DIR, session.finalVideoPath);
        try {
          if (fs.existsSync(oldFinalPath)) {
            fs.unlinkSync(oldFinalPath);
          }
        } catch {}
      }

      const videoFullPath = path.join(UPLOADS_DIR, req.file.filename);
      const probeResult = await probeVideo(videoFullPath);

      if (!probeResult.success) {
        console.log(`[Upload:${traceId}] Probe failed: ${probeResult.error}`);
        try {
          fs.unlinkSync(videoFullPath);
        } catch {}
        
        await logUserAction({
          userId: req.session.userId!,
          actionType: "file_validation_failed",
          actionLabel: ActionLabels.file_validation_failed,
          entityType: "session",
          entityId: session.id,
          metadata: { error: probeResult.error, filename: req.file.originalname, traceId },
          req,
        });
        
        return res.status(400).json({ message: probeResult.error || "Invalid video file", traceId });
      }

      if (!probeResult.hasAudio) {
        console.log(`[Upload:${traceId}] No audio track detected`);
        try {
          fs.unlinkSync(videoFullPath);
        } catch {}
        return res.status(400).json({ message: "Video must have an audio track for transcription", traceId });
      }
      
      console.log(`[Upload:${traceId}] Probe successful: duration=${probeResult.duration}s, resolution=${probeResult.width}x${probeResult.height}`);

      const ext = path.extname(req.file.originalname).toLowerCase();
      
      // Single database update with all metadata and status set to 'queued'
      // This ensures all data is persisted atomically before processing starts
      await storage.updateSession(session.id, {
        videoPath: req.file.filename,
        videoMimeType: req.file.mimetype,
        videoSizeBytes: req.file.size,
        originalUploadFilename: req.file.originalname,
        originalUploadMimeType: req.file.mimetype,
        originalUploadSizeBytes: req.file.size,
        originalUploadExtension: ext,
        originalUploadPath: req.file.filename,
        originalProbeJson: probeResult.data,
        durationSeconds: Math.round(probeResult.duration),
        finalVideoResolution: `${probeResult.width}x${probeResult.height}`,
        finalVideoPath: null,
        processingStatus: "queued",
        processingProgress: 10,
        processingMessage: "Queued for processing...",
        processingError: null,
        processingStartedAt: null,
        processingCompletedAt: null,
        transcriptText: null,
        transcriptEditedText: null,
        scoreJson: null,
        scoreUpdatedAt: null,
      });

      console.log(`[Upload:${traceId}] Metadata persisted, session status is queued`);

      await logUserAction({
        userId: req.session.userId!,
        actionType: "video_uploaded",
        actionLabel: ActionLabels.video_uploaded,
        entityType: "session",
        entityId: session.id,
        metadata: { 
          filename: req.file.originalname, 
          size: req.file.size,
          duration: probeResult.duration,
          resolution: `${probeResult.width}x${probeResult.height}`,
          traceId,
        },
        req,
      });

      // Start processing in background after all data is persisted
      // Use setTimeout with 0ms to ensure this runs after the current stack completes
      const userId = req.session.userId!;
      const sessionId = session.id;
      setTimeout(() => {
        console.log(`[Upload:${traceId}] Starting background processing for session ${sessionId}`);
        processSession(sessionId, userId).catch((err) => {
          console.error(`[Upload:${traceId}] Background processing error:`, err);
        });
      }, 0);

      console.log(`[Upload:${traceId}] Upload complete, processing scheduled`);

      res.json({ 
        success: true,
        message: "Video uploaded successfully",
        sessionId: session.id,
        duration: probeResult.duration,
        hasAudio: probeResult.hasAudio,
        resolution: `${probeResult.width}x${probeResult.height}`,
        traceId,
      });
    } catch (err) {
      cleanupUploadedFile();
      console.error(`[Upload] Error:`, err);
      res.status(500).json({ message: "Failed to upload video", error: err instanceof Error ? err.message : "Unknown error" });
    }
  });

  // SSE endpoint for real-time processing progress
  app.get("/api/sessions/:id/progress/stream", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      // Send current state immediately
      const currentData = {
        status: session.processingStatus || "queued",
        progress: session.processingProgress || 0,
        message: session.processingMessage || "Waiting...",
        error: session.processingError || undefined,
      };
      res.write(`data: ${JSON.stringify(currentData)}\n\n`);

      // Subscribe to updates
      const unsubscribe = subscribeToSession(req.params.id, (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      });

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        res.write(": heartbeat\n\n");
      }, 30000);

      req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });

    } catch (err) {
      console.error("Progress stream error:", err);
      res.status(500).json({ message: "Failed to start progress stream" });
    }
  });

  // Get current processing status (polling fallback)
  app.get("/api/sessions/:id/progress", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json({
        status: session.processingStatus || "queued",
        progress: session.processingProgress || 0,
        message: session.processingMessage || "Waiting...",
        error: session.processingError || undefined,
        startedAt: session.processingStartedAt,
        updatedAt: session.processingUpdatedAt,
        completedAt: session.processingCompletedAt,
      });
    } catch (err) {
      console.error("Get progress error:", err);
      res.status(500).json({ message: "Failed to get progress" });
    }
  });

  // Start background processing for a session
  app.post("/api/sessions/:id/process", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!session.videoPath) {
        return res.status(400).json({ message: "No video to process" });
      }

      // Check if already processing to prevent duplicate runs
      const processingStatuses = ["queued", "transcoding", "transcribing", "scoring"];
      if (session.processingStatus && processingStatuses.includes(session.processingStatus)) {
        return res.json({ message: "Processing already in progress", status: session.processingStatus });
      }

      // Check if already completed
      if (session.processingStatus === "ready" && session.scoreJson) {
        return res.json({ message: "Processing already complete", status: "ready" });
      }

      // Start processing in background (don't await)
      processSession(req.params.id, req.session.userId!).catch((err) => {
        console.error("[Process] Background processing error:", err);
      });

      res.json({ message: "Processing started" });
    } catch (err) {
      console.error("Start processing error:", err);
      res.status(500).json({ message: "Failed to start processing" });
    }
  });

  app.post("/api/sessions/:id/convert", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!session.videoPath) {
        return res.status(400).json({ message: "No video to convert" });
      }

      const videoFullPath = path.join(UPLOADS_DIR, session.videoPath);
      let mp4Path = videoFullPath;
      let outputFilename = session.videoPath;
      let skippedConversion = false;

      if (session.videoPath.endsWith(".mp4")) {
        console.log(`[Convert] Session ${session.id} already has MP4, skipping conversion`);
        skippedConversion = true;
        if (session.videoMimeType !== "video/mp4") {
          await storage.updateSession(session.id, { videoMimeType: "video/mp4" });
        }
      } else {
        const conversionResult = await convertToMp4(videoFullPath, UPLOADS_DIR);
        
        if (!conversionResult.success) {
          return res.status(500).json({ message: conversionResult.error || "Video conversion failed" });
        }

        mp4Path = path.join(UPLOADS_DIR, conversionResult.outputPath!);
        outputFilename = conversionResult.outputPath!;
        const stat = fs.statSync(mp4Path);

        await storage.updateSession(session.id, {
          videoPath: outputFilename,
          videoMimeType: "video/mp4",
          videoSizeBytes: stat.size,
        });
      }

      let thumbnailPath: string | null = session.thumbnailPath;
      let thumbnailError: string | null = null;

      if (!session.thumbnailPath) {
        const thumbnailResult = await generateThumbnail(mp4Path, UPLOADS_DIR);
        
        if (thumbnailResult.success) {
          thumbnailPath = thumbnailResult.thumbnailPath!;
          await storage.updateSession(session.id, {
            thumbnailPath: thumbnailPath,
          });
          console.log(`[Convert] Thumbnail generated for session ${session.id}`);
        } else {
          thumbnailError = thumbnailResult.error || "Unknown thumbnail generation error";
          console.warn(`[Convert] Thumbnail generation failed for session ${session.id}: ${thumbnailError}`);
        }
      }

      res.json({ 
        message: skippedConversion ? "Video already in MP4 format" : "Video converted successfully",
        videoPath: outputFilename,
        thumbnailPath: thumbnailPath,
        thumbnailError: thumbnailError,
        skipped: skippedConversion,
      });
    } catch (err) {
      console.error("Convert error:", err);
      res.status(500).json({ message: "Failed to convert video" });
    }
  });

  app.post("/api/sessions/:id/transcribe", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!session.videoPath) {
        return res.status(400).json({ message: "No video to transcribe" });
      }

      const videoPath = path.join(UPLOADS_DIR, session.videoPath);
      
      const audioResult = await extractAudio(videoPath, UPLOADS_DIR);
      
      if (!audioResult.success) {
        return res.status(500).json({ message: audioResult.error || "Failed to extract audio" });
      }

      const audioPath = path.join(UPLOADS_DIR, audioResult.audioPath!);
      
      try {
        const transcript = await transcribeAudio(audioPath);

        await storage.updateSession(session.id, {
          transcriptText: transcript,
        });

        try {
          if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
            console.log(`[Transcribe] Cleaned up audio file: ${audioResult.audioPath}`);
          }
        } catch (cleanupErr) {
          console.warn(`[Transcribe] Failed to clean up audio file:`, cleanupErr);
        }

        res.json({ transcript });
      } catch (transcribeErr) {
        try {
          if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
          }
        } catch {}
        throw transcribeErr;
      }
    } catch (err) {
      console.error("Transcribe error:", err);
      res.status(500).json({ message: "Failed to transcribe video" });
    }
  });

  app.post("/api/sessions/:id/score", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const transcript = session.transcriptEditedText || session.transcriptText;
      if (!transcript) {
        return res.status(400).json({ message: "No transcript to score" });
      }

      const scoreResult = await scoreTranscript(
        transcript,
        session.goalType as GoalType,
        session.durationSeconds || 60
      );

      await storage.updateSession(session.id, {
        scoreJson: scoreResult,
        scoreUpdatedAt: new Date(),
      });

      // Auto-generate title after initial scoring if no user-provided title exists
      if (!session.title && transcript && transcript.length > 10) {
        try {
          const aiTitle = await generateTitle(transcript);
          await storage.updateSession(session.id, {
            title: aiTitle,
            titleSource: "ai",
            titleGeneratedAt: new Date(),
          });
          console.log(`[Score] Auto-generated title for session ${session.id}: ${aiTitle}`);
        } catch (titleErr) {
          console.warn("Failed to auto-generate title after scoring:", titleErr);
        }
      }

      res.json(scoreResult);
    } catch (err) {
      console.error("Score error:", err);
      res.status(500).json({ message: "Failed to score video" });
    }
  });

  app.post("/api/sessions/:id/rescore", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { transcript } = req.body;
      if (!transcript || typeof transcript !== "string") {
        return res.status(400).json({ message: "Transcript required" });
      }

      // Save edited transcript
      await storage.updateSession(session.id, {
        transcriptEditedText: transcript,
      });

      // Re-score with edited transcript
      const scoreResult = await scoreTranscript(
        transcript,
        session.goalType as GoalType,
        session.durationSeconds || 60
      );

      await storage.updateSession(session.id, {
        scoreJson: scoreResult,
        scoreUpdatedAt: new Date(),
      });

      res.json(scoreResult);
    } catch (err) {
      console.error("Rescore error:", err);
      res.status(500).json({ message: "Failed to rescore video" });
    }
  });

  app.post("/api/sessions/:id/retranscribe", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (session.videoDeletedAt) {
        return res.status(410).json({ message: "Video has been deleted and cannot be retranscribed" });
      }

      if (!session.videoPath) {
        return res.status(400).json({ message: "No video to transcribe" });
      }

      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      if (session.lastRetranscribeAt && new Date(session.lastRetranscribeAt) > twentyFourHoursAgo) {
        const count = session.retranscribeCount || 0;
        if (count >= MAX_RETRANSCRIBES_PER_DAY) {
          return res.status(429).json({ 
            message: `You can only retranscribe ${MAX_RETRANSCRIBES_PER_DAY} times per 24 hours. Please try again later.` 
          });
        }
      }

      const videoPath = path.join(UPLOADS_DIR, session.videoPath);
      
      if (!fs.existsSync(videoPath)) {
        return res.status(404).json({ message: "Video file not found" });
      }

      const audioResult = await extractAudio(videoPath, UPLOADS_DIR);
      
      if (!audioResult.success) {
        return res.status(500).json({ message: audioResult.error || "Failed to extract audio" });
      }

      const audioPath = path.join(UPLOADS_DIR, audioResult.audioPath!);
      
      try {
        const transcript = await transcribeAudio(audioPath);

        const newCount = session.lastRetranscribeAt && new Date(session.lastRetranscribeAt) > twentyFourHoursAgo
          ? (session.retranscribeCount || 0) + 1
          : 1;

        await storage.updateSession(session.id, {
          transcriptText: transcript,
          transcriptEditedText: null,
          retranscribeCount: newCount,
          lastRetranscribeAt: now,
        });

        try {
          if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
          }
        } catch {}

        const scoreResult = await scoreTranscript(
          transcript,
          session.goalType as GoalType,
          session.durationSeconds || 60
        );

        await storage.updateSession(session.id, {
          scoreJson: scoreResult,
          scoreUpdatedAt: new Date(),
        });

        if (session.titleSource === "ai" || !session.title) {
          try {
            if (transcript && transcript.length > 10) {
              const aiTitle = await generateTitle(transcript);
              await storage.updateSession(session.id, {
                title: aiTitle,
                titleSource: "ai",
                titleGeneratedAt: new Date(),
              });
            }
          } catch (titleErr) {
            console.warn("Failed to generate title after retranscribe:", titleErr);
          }
        }

        res.json({ transcript, score: scoreResult });
      } catch (transcribeErr) {
        try {
          if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
          }
        } catch {}
        throw transcribeErr;
      }
    } catch (err) {
      console.error("Retranscribe error:", err);
      res.status(500).json({ message: "Failed to retranscribe video" });
    }
  });

  app.post("/api/sessions/:id/retry-processing", requireAuth, async (req: Request, res: Response) => {
    const traceId = `retry-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log(`[Retry:${traceId}] Retrying processing for session ${req.params.id}`);

    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found", traceId });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied", traceId });
      }

      if (session.videoDeletedAt) {
        return res.status(410).json({ message: "Video has been deleted and cannot be reprocessed", traceId });
      }

      if (!session.videoPath) {
        return res.status(400).json({ message: "No video to process", traceId });
      }

      const videoPath = path.join(UPLOADS_DIR, session.videoPath);
      if (!fs.existsSync(videoPath)) {
        return res.status(404).json({ message: "Video file not found", traceId });
      }

      if (session.processingStatus && !["failed", "ready"].includes(session.processingStatus)) {
        return res.status(409).json({ message: "Video is already being processed", traceId });
      }

      await storage.updateSession(session.id, {
        processingStatus: "queued",
        processingProgress: 0,
        processingMessage: "Queued for reprocessing...",
        processingError: null,
        processingStartedAt: null,
        processingCompletedAt: null,
      });

      const userId = req.session.userId!;
      setTimeout(() => {
        console.log(`[Retry:${traceId}] Starting background reprocessing for session ${session.id}`);
        processSession(session.id, userId).catch((err) => {
          console.error(`[Retry:${traceId}] Background reprocessing error:`, err);
        });
      }, 0);

      console.log(`[Retry:${traceId}] Reprocessing scheduled`);
      res.json({ success: true, message: "Processing restarted", traceId });
    } catch (err) {
      console.error(`[Retry:${traceId}] Error:`, err);
      res.status(500).json({ message: "Failed to retry processing", traceId });
    }
  });

  app.post("/api/sessions/:id/generate-title", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (session.videoDeletedAt) {
        return res.status(410).json({ message: "Video has been deleted" });
      }

      const transcript = session.transcriptEditedText || session.transcriptText;
      if (!transcript || transcript.length < 10) {
        return res.status(400).json({ message: "No transcript available to generate title from" });
      }

      const aiTitle = await generateTitle(transcript);

      await storage.updateSession(session.id, {
        title: aiTitle,
        titleSource: "ai",
        titleGeneratedAt: new Date(),
      });

      res.json({ title: aiTitle });
    } catch (err) {
      console.error("Generate title error:", err);
      res.status(500).json({ message: "Failed to generate title" });
    }
  });




  // PDF report download
  app.get("/api/sessions/:id/report.pdf", requireAuth, async (req: Request, res: Response) => {
    const traceId = `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[PDF:${traceId}] Starting PDF report generation for session ${req.params.id}`);
    
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        console.log(`[PDF:${traceId}] Session not found`);
        return res.status(404).json({ message: "Session not found", traceId });
      }

      const currentUser = await storage.getUser(req.session.userId!);
      const isAdmin = currentUser?.isAdmin === true;
      if (session.userId !== req.session.userId && !isAdmin) {
        console.log(`[PDF:${traceId}] Access denied - user ${req.session.userId} not owner`);
        return res.status(403).json({ message: "Access denied", traceId });
      }

      console.log(`[PDF:${traceId}] Session found - transcript exists: ${!!session.transcriptText}, score exists: ${!!session.scoreJson}`);
      
      if (!session.scoreJson) {
        console.log(`[PDF:${traceId}] No score data available`);
        return res.status(400).json({ message: "No score data available for PDF generation", traceId });
      }

      console.log(`[PDF:${traceId}] Generating PDF buffer...`);
      const pdfBuffer = await generateSessionPdfBuffer(session);
      console.log(`[PDF:${traceId}] PDF generated successfully - size: ${pdfBuffer.length} bytes`);
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="Fearless-Video-Coach-Report.pdf"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err) {
      console.error(`[PDF:${traceId}] PDF generation error:`, err);
      res.status(500).json({ message: "Failed to generate PDF report", traceId, error: err instanceof Error ? err.message : "Unknown error" });
    }
  });

  // Transcript TXT download - filename uses AI-generated session title
  app.get("/api/sessions/:id/transcript.txt", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      const currentUser = await storage.getUser(req.session.userId!);
      const isAdmin = currentUser?.isAdmin === true;
      if (session.userId !== req.session.userId && !isAdmin) {
        return res.status(403).json({ message: "Access denied" });
      }

      const transcript = session.transcriptEditedText || session.transcriptText;
      if (!transcript) {
        return res.status(400).json({ message: "No transcript available" });
      }

      // Sanitize title for cross-platform filename compatibility
      let filename: string;
      if (session.title) {
        const sanitized = session.title
          .replace(/[<>:"/\\|?*\x00-\x1f]/g, "") // Remove invalid chars for Windows/Mac/Linux
          .replace(/[\s]+/g, " ") // Collapse whitespace
          .trim()
          .slice(0, 80); // Limit length
        filename = sanitized ? `${sanitized}.txt` : `session-${session.id}.txt`;
      } else {
        filename = `session-${session.id}.txt`;
      }

      // Build transcript content with header info
      const createdDate = session.createdAt ? new Date(session.createdAt).toLocaleDateString() : "";
      const headerLines = [
        session.title || "Untitled Session",
        createdDate ? `Recorded: ${createdDate}` : "",
        "",
        "---",
        "",
      ].filter(Boolean);
      
      const content = headerLines.join("\n") + transcript;

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(content);
    } catch (err) {
      console.error("Transcript TXT download error:", err);
      res.status(500).json({ message: "Failed to download transcript" });
    }
  });

  // Transcript PDF download
  app.get("/api/sessions/:id/transcript.pdf", requireAuth, async (req: Request, res: Response) => {
    const traceId = `transcript-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found", traceId });
      }

      const currentUser = await storage.getUser(req.session.userId!);
      const isAdmin = currentUser?.isAdmin === true;
      if (session.userId !== req.session.userId && !isAdmin) {
        return res.status(403).json({ message: "Access denied", traceId });
      }

      const transcript = session.transcriptEditedText || session.transcriptText;
      if (!transcript) {
        return res.status(400).json({ message: "No transcript available", traceId });
      }

      // Generate a simple transcript-only PDF using PDFKit
      const { generateTranscriptPdfBuffer } = await import("./pdf");
      const pdfBuffer = await generateTranscriptPdfBuffer(session);
      
      const sanitizedTitle = (session.title || "session")
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .toLowerCase()
        .slice(0, 50);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizedTitle}-transcript.pdf"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err) {
      console.error(`[Transcript PDF:${traceId}] Error:`, err);
      res.status(500).json({ message: "Failed to generate transcript PDF", traceId });
    }
  });

  // ==========================================
  // Topic Pulse Finder API Routes
  // ==========================================
  
  const { generateTopics, enrichTopicDetails, generateScript, generateIntentAnalysis, getApiKeyStatus, getKeywordsEverywhereCredits } = await import("./topic-pulse");
  const { topicSearchInputSchema, scriptGenerationInputSchema } = await import("@shared/schema");

  app.get("/api/topic-pulse/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const status = getApiKeyStatus();
      res.json(status);
    } catch (err) {
      console.error("[TopicPulse] Status error:", err);
      res.status(500).json({ message: "Failed to get status" });
    }
  });

  app.get("/api/topic-pulse/credits", requireAuth, async (req: Request, res: Response) => {
    try {
      const credits = await storage.getVideoTrendsCredits(req.session.userId!);
      res.json(credits);
    } catch (err) {
      console.error("[VideoTrends] Credits error:", err);
      res.status(500).json({ error: "Failed to fetch credits" });
    }
  });
  
  app.get("/api/topic-pulse/api-keys/keywords-everywhere", requireAdmin, async (req: Request, res: Response) => {
    try {
      const apiKey = await storage.getUserApiKey(req.session.userId!, "keywords_everywhere");
      res.json({
        configured: !!apiKey,
        keyLastFour: apiKey?.keyLastFour || null,
        updatedAt: apiKey?.updatedAt || null,
      });
    } catch (err) {
      console.error("[TopicPulse] Get API key status error:", err);
      res.status(500).json({ message: "Failed to get API key status" });
    }
  });
  
  app.post("/api/topic-pulse/api-keys/keywords-everywhere", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 10) {
        return res.status(400).json({ message: "Invalid API key format" });
      }
      
      const result = await storage.setUserApiKey(req.session.userId!, "keywords_everywhere", apiKey.trim());
      res.json({
        success: true,
        keyLastFour: result.keyLastFour,
      });
    } catch (err) {
      console.error("[TopicPulse] Set API key error:", err);
      res.status(500).json({ message: "Failed to save API key" });
    }
  });
  
  app.delete("/api/topic-pulse/api-keys/keywords-everywhere", requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deleteUserApiKey(req.session.userId!, "keywords_everywhere");
      res.json({ success: true });
    } catch (err) {
      console.error("[TopicPulse] Delete API key error:", err);
      res.status(500).json({ message: "Failed to delete API key" });
    }
  });

  app.get("/api/topic-pulse/runs", requireAuth, async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 15));
      const offset = (page - 1) * limit;
      const [runs, total] = await Promise.all([
        storage.getTopicRunsByUser(req.session.userId!, limit, offset),
        storage.countTopicRunsByUser(req.session.userId!),
      ]);
      res.json({ runs, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
      console.error("[TopicPulse] Get runs error:", err);
      res.status(500).json({ message: "Failed to get topic runs" });
    }
  });

  app.post("/api/topic-pulse/search", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = topicSearchInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const credits = await storage.getVideoTrendsCredits(req.session.userId!);
      
      if (credits.remaining < 1) {
        const resetsAt = new Date(credits.resetsAt);
        const daysRemaining = Math.ceil((resetsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        return res.status(403).json({ 
          message: `You've used all your Video Trends credits for this month. Your credits will reset in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`,
          creditsRemaining: credits.remaining,
          resetsAt: credits.resetsAt,
        });
      }

      // Atomically reserve a worst-case credit budget BEFORE any paid keyword lookups.
      // Max possible uncached keywords per search: 15 (autocomplete) + 20 (variations) = 35.
      // We cap the reservation at the user's remaining balance so the reserve always fits.
      const MAX_TOPIC_PULSE_KEYWORDS = 35;
      const reserveAmount = Math.min(MAX_TOPIC_PULSE_KEYWORDS, credits.remaining);
      const reservation = await storage.reserveVideoTrendsCredits(req.session.userId!, reserveAmount);

      if (!reservation.success) {
        const resetsAt = new Date(credits.resetsAt);
        const daysRemaining = Math.ceil((resetsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        return res.status(402).json({
          message: `Insufficient credits to start this search. Your credits will reset in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`,
          creditsRemaining: credits.remaining,
          resetsAt: credits.resetsAt,
        });
      }

      // From this point on, the reservation is held. Any failure must refund it.
      let reservationSettled = false;
      const userId = req.session.userId!;

      try {
        const startTime = Date.now();
        
        const run = await storage.createTopicRun({
          userId,
          seedQuery: parsed.data.seedQuery,
          settingsJson: {
            affiliateProduct: parsed.data.affiliateProduct,
            audienceLevel: parsed.data.audienceLevel,
            tonePreference: parsed.data.tonePreference,
            videoType: parsed.data.videoType,
            region: parsed.data.region,
            recencyDays: parsed.data.recencyDays,
          },
          status: "processing",
        });

        // Pass the reserved amount as the hard budget cap for paid keyword lookups.
        // Actual usage will always be 0 ≤ creditsUsed ≤ reserveAmount.
        const result = await generateTopics(parsed.data, run.id, userId, reserveAmount);

        // Settle reservation: refund the unused portion (reserved - actual usage).
        const refundAmount = reserveAmount - result.creditsUsed;
        if (refundAmount > 0) {
          await storage.refundVideoTrendsCredits(userId, refundAmount);
          console.log(`[TopicPulse] Reserved ${reserveAmount}, used ${result.creditsUsed}, refunded ${refundAmount} for user ${userId}`);
        } else {
          console.log(`[TopicPulse] Reserved and used ${reserveAmount} credits for user ${userId}`);
        }
        reservationSettled = true;

        const createdTopics = await storage.createTopics(result.topics);

        const runtimeMs = Date.now() - startTime;
        await storage.updateTopicRun(run.id, {
          status: "complete",
          runtimeMs,
          topicCount: createdTopics.length,
        });

        res.json({
          runId: run.id,
          topics: createdTopics,
          runtimeMs,
          creditsUsed: result.creditsUsed,
        });
      } catch (innerErr) {
        if (!reservationSettled) {
          // Refund the full reservation since no paid work was successfully completed.
          await storage.refundVideoTrendsCredits(userId, reserveAmount).catch(refundErr => {
            console.error(`[TopicPulse] Failed to refund reservation of ${reserveAmount} for user ${userId}:`, refundErr);
          });
          console.warn(`[TopicPulse] Refunded full reservation of ${reserveAmount} for user ${userId} after error`);
        }
        throw innerErr;
      }
    } catch (err) {
      console.error("[TopicPulse] Search error:", err);
      res.status(500).json({ message: "Failed to search topics" });
    }
  });

  app.get("/api/topic-pulse/runs/:runId/topics", requireAuth, async (req: Request, res: Response) => {
    try {
      const run = await storage.getTopicRun(req.params.runId);
      if (!run) {
        return res.status(404).json({ message: "Run not found" });
      }
      if (run.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const topics = await storage.getTopicsByRun(req.params.runId);
      res.json(topics);
    } catch (err) {
      console.error("[TopicPulse] Get topics error:", err);
      res.status(500).json({ message: "Failed to get topics" });
    }
  });

  app.delete("/api/topic-pulse/runs/:runId", requireAuth, async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteTopicRun(req.params.runId, req.session.userId!);
      if (!deleted) {
        return res.status(404).json({ message: "Run not found or access denied" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[TopicPulse] Delete run error:", err);
      res.status(500).json({ message: "Failed to delete run" });
    }
  });

  app.delete("/api/topic-pulse/runs", requireAuth, async (req: Request, res: Response) => {
    try {
      const count = await storage.deleteAllTopicRuns(req.session.userId!);
      res.json({ success: true, deletedCount: count });
    } catch (err) {
      console.error("[TopicPulse] Delete all runs error:", err);
      res.status(500).json({ message: "Failed to delete runs" });
    }
  });

  app.get("/api/topic-pulse/topics/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const topic = await storage.getTopic(req.params.id);
      if (!topic) {
        return res.status(404).json({ message: "Topic not found" });
      }

      const run = await storage.getTopicRun(topic.runId);
      if (!run || run.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      res.json(topic);
    } catch (err) {
      console.error("[TopicPulse] Get topic error:", err);
      res.status(500).json({ message: "Failed to get topic" });
    }
  });

  app.post("/api/topic-pulse/topics/:id/enrich", requireAuth, async (req: Request, res: Response) => {
    try {
      const topic = await storage.getTopic(req.params.id);
      if (!topic) {
        return res.status(404).json({ message: "Topic not found" });
      }

      const run = await storage.getTopicRun(topic.runId);
      if (!run || run.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const enrichedData = await enrichTopicDetails(topic);
      
      const { db } = await import("./db");
      const { topics } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const [updatedTopic] = await db.update(topics)
        .set(enrichedData as any)
        .where(eq(topics.id, topic.id))
        .returning();

      res.json(updatedTopic);
    } catch (err) {
      console.error("[TopicPulse] Enrich error:", err);
      res.status(500).json({ message: "Failed to enrich topic" });
    }
  });

  app.post("/api/topic-pulse/topics/:id/intent-analysis", requireAuth, async (req: Request, res: Response) => {
    try {
      const topic = await storage.getTopic(req.params.id);
      if (!topic) {
        return res.status(404).json({ message: "Topic not found" });
      }

      const run = await storage.getTopicRun(topic.runId);
      if (!run || run.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (topic.intentAnalysis) {
        return res.json({ analysis: topic.intentAnalysis, cached: true });
      }

      const analysis = await generateIntentAnalysis(topic);
      
      const { db } = await import("./db");
      const { topics } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      await db.update(topics)
        .set({ intentAnalysis: analysis })
        .where(eq(topics.id, topic.id));

      res.json({ analysis, cached: false });
    } catch (err) {
      console.error("[TopicPulse] Intent analysis error:", err);
      res.status(500).json({ message: "Failed to generate intent analysis" });
    }
  });

  app.post("/api/topic-pulse/topics/:id/platform-data", requireAuth, async (req: Request, res: Response) => {
    try {
      const topic = await storage.getTopic(req.params.id);
      if (!topic) {
        return res.status(404).json({ message: "Topic not found" });
      }

      const run = await storage.getTopicRun(topic.runId);
      if (!run || run.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const { fetchPlatformDataForTopic } = await import("./topic-pulse");
      const result = await fetchPlatformDataForTopic(topic.id, req.session.userId!);
      
      if (!result) {
        return res.status(404).json({ message: "Topic not found" });
      }

      res.json(result);
    } catch (err) {
      console.error("[TopicPulse] Platform data fetch error:", err);
      res.status(500).json({ message: "Failed to fetch platform data" });
    }
  });

  app.post("/api/topic-pulse/topics/:id/save", requireAuth, async (req: Request, res: Response) => {
    try {
      const topic = await storage.getTopic(req.params.id);
      if (!topic) {
        return res.status(404).json({ message: "Topic not found" });
      }

      const run = await storage.getTopicRun(topic.runId);
      if (!run || run.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const alreadySaved = await storage.isSavedTopic(topic.id, req.session.userId!);
      if (alreadySaved) {
        return res.status(400).json({ message: "Topic already saved" });
      }

      const savedTopic = await storage.saveTopicForUser({
        userId: req.session.userId!,
        topicId: topic.id,
        notes: req.body.notes || null,
      });

      res.json(savedTopic);
    } catch (err) {
      console.error("[TopicPulse] Save topic error:", err);
      res.status(500).json({ message: "Failed to save topic" });
    }
  });

  app.get("/api/topic-pulse/saved-topics", requireAuth, async (req: Request, res: Response) => {
    try {
      const savedTopics = await storage.getSavedTopicsByUser(req.session.userId!);
      res.json(savedTopics);
    } catch (err) {
      console.error("[TopicPulse] Get saved topics error:", err);
      res.status(500).json({ message: "Failed to get saved topics" });
    }
  });

  app.delete("/api/topic-pulse/saved-topics/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteSavedTopic(req.params.id, req.session.userId!);
      if (!deleted) {
        return res.status(404).json({ message: "Saved topic not found" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[TopicPulse] Delete saved topic error:", err);
      res.status(500).json({ message: "Failed to delete saved topic" });
    }
  });

  app.post("/api/topic-pulse/saved-topics/:id/complete", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await storage.markSavedTopicComplete(req.params.id, req.session.userId!);
      if (!result) {
        return res.status(404).json({ message: "Saved topic not found" });
      }
      res.json(result);
    } catch (err) {
      console.error("[TopicPulse] Mark complete error:", err);
      res.status(500).json({ message: "Failed to mark topic complete" });
    }
  });

  app.post("/api/topic-pulse/saved-topics/:id/reset", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await storage.resetSavedTopicComplete(req.params.id, req.session.userId!);
      if (!result) {
        return res.status(404).json({ message: "Saved topic not found" });
      }
      res.json(result);
    } catch (err) {
      console.error("[TopicPulse] Reset complete error:", err);
      res.status(500).json({ message: "Failed to reset topic" });
    }
  });

  app.post("/api/topic-pulse/scripts/generate", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = scriptGenerationInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }

      const topic = await storage.getTopic(parsed.data.topicId);
      if (!topic) {
        return res.status(404).json({ message: "Topic not found" });
      }

      const run = await storage.getTopicRun(topic.runId);
      if (!run || run.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      const scriptJson = await generateScript(parsed.data, topic);

      const script = await storage.createScript({
        userId: req.session.userId!,
        topicId: topic.id,
        title: topic.topicTitle,
        inputsJson: {
          videoLengthTarget: parsed.data.videoLengthTarget,
          affiliateOffer: parsed.data.affiliateOffer || "",
          affiliateLinkLabel: parsed.data.affiliateLinkLabel || "",
          primaryPromise: parsed.data.primaryPromise || "",
          personalAngle: parsed.data.personalAngle,
          tonePreference: parsed.data.tonePreference,
        },
        scriptJson,
        notes: null,
      });

      res.json(script);
    } catch (err) {
      console.error("[TopicPulse] Generate script error:", err);
      res.status(500).json({ message: "Failed to generate script" });
    }
  });

  app.get("/api/topic-pulse/scripts", requireAuth, async (req: Request, res: Response) => {
    try {
      const scripts = await storage.getScriptsByUser(req.session.userId!);
      res.json(scripts);
    } catch (err) {
      console.error("[TopicPulse] Get scripts error:", err);
      res.status(500).json({ message: "Failed to get scripts" });
    }
  });

  app.get("/api/topic-pulse/scripts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const script = await storage.getScript(req.params.id);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }
      if (script.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(script);
    } catch (err) {
      console.error("[TopicPulse] Get script error:", err);
      res.status(500).json({ message: "Failed to get script" });
    }
  });

  app.patch("/api/topic-pulse/scripts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const updates: { notes?: string; title?: string; scriptJson?: any } = {};
      if (typeof req.body.notes === "string") updates.notes = req.body.notes;
      if (typeof req.body.title === "string") updates.title = req.body.title;
      if (req.body.scriptJson && typeof req.body.scriptJson === "object") {
        updates.scriptJson = req.body.scriptJson;
      }

      const script = await storage.updateScript(req.params.id, req.session.userId!, updates);
      if (!script) {
        return res.status(404).json({ message: "Script not found" });
      }
      res.json(script);
    } catch (err) {
      console.error("[TopicPulse] Update script error:", err);
      res.status(500).json({ message: "Failed to update script" });
    }
  });

  app.delete("/api/topic-pulse/scripts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteScript(req.params.id, req.session.userId!);
      if (!deleted) {
        return res.status(404).json({ message: "Script not found" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[TopicPulse] Delete script error:", err);
      res.status(500).json({ message: "Failed to delete script" });
    }
  });

  // ── Standalone teleprompter scripts ──
  app.get("/api/teleprompter/scripts", requireAuth, async (req: Request, res: Response) => {
    try {
      const list = await storage.getTeleprompterScriptsByUser(req.session.userId!);
      res.json(list);
    } catch (err) {
      console.error("[Teleprompter] Get scripts error:", err);
      res.status(500).json({ message: "Failed to get scripts" });
    }
  });

  app.get("/api/teleprompter/scripts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const script = await storage.getTeleprompterScript(req.params.id, req.session.userId!);
      if (!script) return res.status(404).json({ message: "Script not found" });
      res.json(script);
    } catch (err) {
      console.error("[Teleprompter] Get script error:", err);
      res.status(500).json({ message: "Failed to get script" });
    }
  });

  app.post("/api/teleprompter/scripts", requireAuth, async (req: Request, res: Response) => {
    try {
      const { upsertTeleprompterScriptSchema } = await import("@shared/schema");
      const parsed = upsertTeleprompterScriptSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid input" });
      }
      const script = await storage.createTeleprompterScript(req.session.userId!, parsed.data);
      res.status(201).json(script);
    } catch (err) {
      console.error("[Teleprompter] Create script error:", err);
      res.status(500).json({ message: "Failed to create script" });
    }
  });

  app.patch("/api/teleprompter/scripts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { upsertTeleprompterScriptSchema } = await import("@shared/schema");
      const parsed = upsertTeleprompterScriptSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid input" });
      }
      const script = await storage.updateTeleprompterScript(req.params.id, req.session.userId!, parsed.data);
      if (!script) return res.status(404).json({ message: "Script not found" });
      res.json(script);
    } catch (err) {
      console.error("[Teleprompter] Update script error:", err);
      res.status(500).json({ message: "Failed to update script" });
    }
  });

  app.delete("/api/teleprompter/scripts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteTeleprompterScript(req.params.id, req.session.userId!);
      if (!ok) return res.status(404).json({ message: "Script not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("[Teleprompter] Delete script error:", err);
      res.status(500).json({ message: "Failed to delete script" });
    }
  });

  app.get("/api/topic-pulse/links", requireAuth, async (req: Request, res: Response) => {
    try {
      const links = await storage.getLinkPlaceholdersByUser(req.session.userId!);
      res.json(links);
    } catch (err) {
      console.error("[TopicPulse] Get links error:", err);
      res.status(500).json({ message: "Failed to get link placeholders" });
    }
  });

  app.post("/api/topic-pulse/links", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!req.body.label || typeof req.body.label !== "string") {
        return res.status(400).json({ message: "Label is required" });
      }

      const link = await storage.createLinkPlaceholder({
        userId: req.session.userId!,
        label: req.body.label,
        url: req.body.url || null,
      });

      res.json(link);
    } catch (err) {
      console.error("[TopicPulse] Create link error:", err);
      res.status(500).json({ message: "Failed to create link placeholder" });
    }
  });

  app.patch("/api/topic-pulse/links/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const updates: { label?: string; url?: string } = {};
      if (typeof req.body.label === "string") updates.label = req.body.label;
      if (typeof req.body.url === "string") updates.url = req.body.url;

      const link = await storage.updateLinkPlaceholder(req.params.id, req.session.userId!, updates);
      if (!link) {
        return res.status(404).json({ message: "Link not found" });
      }
      res.json(link);
    } catch (err) {
      console.error("[TopicPulse] Update link error:", err);
      res.status(500).json({ message: "Failed to update link placeholder" });
    }
  });

  app.delete("/api/topic-pulse/links/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteLinkPlaceholder(req.params.id, req.session.userId!);
      if (!deleted) {
        return res.status(404).json({ message: "Link not found" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[TopicPulse] Delete link error:", err);
      res.status(500).json({ message: "Failed to delete link placeholder" });
    }
  });

  // Saved Offers (Call To Action)
  app.get("/api/topic-pulse/offers", requireAuth, async (req: Request, res: Response) => {
    try {
      const offers = await storage.getSavedOffersByUser(req.session.userId!);
      res.json(offers);
    } catch (err) {
      console.error("[TopicPulse] Get offers error:", err);
      res.status(500).json({ message: "Failed to get saved offers" });
    }
  });

  app.post("/api/topic-pulse/offers", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!req.body.name || typeof req.body.name !== "string") {
        return res.status(400).json({ message: "Offer name is required" });
      }

      const offer = await storage.createSavedOffer({
        userId: req.session.userId!,
        name: req.body.name,
        description: req.body.description || null,
        linkUrl: req.body.linkUrl || null,
        linkLabel: req.body.linkLabel || null,
        isDefault: req.body.isDefault || false,
      });

      res.json(offer);
    } catch (err) {
      console.error("[TopicPulse] Create offer error:", err);
      res.status(500).json({ message: "Failed to create saved offer" });
    }
  });

  app.patch("/api/topic-pulse/offers/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const updates: { name?: string; description?: string; linkUrl?: string; linkLabel?: string } = {};
      if (typeof req.body.name === "string") updates.name = req.body.name;
      if (typeof req.body.description === "string") updates.description = req.body.description;
      if (typeof req.body.linkUrl === "string") updates.linkUrl = req.body.linkUrl;
      if (typeof req.body.linkLabel === "string") updates.linkLabel = req.body.linkLabel;

      const offer = await storage.updateSavedOffer(req.params.id, req.session.userId!, updates);
      if (!offer) {
        return res.status(404).json({ message: "Offer not found" });
      }
      res.json(offer);
    } catch (err) {
      console.error("[TopicPulse] Update offer error:", err);
      res.status(500).json({ message: "Failed to update saved offer" });
    }
  });

  app.delete("/api/topic-pulse/offers/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteSavedOffer(req.params.id, req.session.userId!);
      if (!deleted) {
        return res.status(404).json({ message: "Offer not found" });
      }
      res.json({ success: true });
    } catch (err) {
      console.error("[TopicPulse] Delete offer error:", err);
      res.status(500).json({ message: "Failed to delete saved offer" });
    }
  });

  app.post("/api/topic-pulse/offers/:id/set-default", requireAuth, async (req: Request, res: Response) => {
    try {
      const offer = await storage.setDefaultOffer(req.params.id, req.session.userId!);
      if (!offer) {
        return res.status(404).json({ message: "Offer not found" });
      }
      res.json(offer);
    } catch (err) {
      console.error("[TopicPulse] Set default offer error:", err);
      res.status(500).json({ message: "Failed to set default offer" });
    }
  });

  app.get("/api/youtube/search", requireAuth, async (req: Request, res: Response) => {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.status(400).json({ message: "Query must be at least 2 characters" });
      }

      const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
      if (!YOUTUBE_API_KEY) {
        return res.status(503).json({ message: "YouTube API not configured" });
      }

      const searchUrl = `https://www.googleapis.com/youtube/v3/search?key=${YOUTUBE_API_KEY}&type=video&part=snippet&q=${encodeURIComponent(query)}&maxResults=10`;
      const searchResponse = await fetch(searchUrl);
      const searchData = await searchResponse.json();

      if (!searchResponse.ok) {
        console.error("[YouTube] API error:", searchData);
        return res.status(500).json({ message: "YouTube API error" });
      }

      const videoIds = searchData.items.map((item: any) => item.id.videoId).join(",");
      
      const statsUrl = `https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${videoIds}&part=statistics`;
      const statsResponse = await fetch(statsUrl);
      const statsData = await statsResponse.json();
      
      const statsMap: Record<string, any> = {};
      if (statsResponse.ok && statsData.items) {
        statsData.items.forEach((item: any) => {
          statsMap[item.id] = item.statistics || {};
        });
      }

      const videos = searchData.items.map((item: any) => {
        const stats = statsMap[item.id.videoId] || {};
        return {
          videoId: item.id.videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          channelTitle: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
          thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
          viewCount: stats.viewCount ? parseInt(stats.viewCount) : null,
          likeCount: stats.likeCount ? parseInt(stats.likeCount) : null,
          commentCount: stats.commentCount ? parseInt(stats.commentCount) : null,
        };
      });

      res.json(videos);
    } catch (err) {
      console.error("[YouTube] Search error:", err);
      res.status(500).json({ message: "Failed to search YouTube" });
    }
  });

  // YouTube video details (statistics)
  app.get("/api/youtube/video/:videoId", requireAuth, async (req: Request, res: Response) => {
    try {
      const { videoId } = req.params;
      if (!videoId) {
        return res.status(400).json({ message: "Video ID required" });
      }

      const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
      if (!YOUTUBE_API_KEY) {
        return res.status(503).json({ message: "YouTube API not configured" });
      }

      const url = `https://www.googleapis.com/youtube/v3/videos?key=${YOUTUBE_API_KEY}&id=${videoId}&part=snippet,statistics,contentDetails`;
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        console.error("[YouTube] API error:", data);
        return res.status(500).json({ message: "YouTube API error" });
      }

      if (!data.items || data.items.length === 0) {
        return res.status(404).json({ message: "Video not found" });
      }

      const item = data.items[0];
      const stats = item.statistics || {};
      const contentDetails = item.contentDetails || {};

      // Parse ISO 8601 duration (PT1H2M3S) to readable format
      const parseDuration = (iso: string) => {
        if (!iso) return null;
        const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return iso;
        const hours = match[1] ? parseInt(match[1]) : 0;
        const minutes = match[2] ? parseInt(match[2]) : 0;
        const seconds = match[3] ? parseInt(match[3]) : 0;
        if (hours > 0) {
          return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      };

      // Fetch top comments - get 100 and sort by likes to get top 20
      let comments: any[] = [];
      try {
        const commentsUrl = `https://www.googleapis.com/youtube/v3/commentThreads?key=${YOUTUBE_API_KEY}&videoId=${videoId}&part=snippet&maxResults=100&order=relevance&textFormat=plainText`;
        const commentsResponse = await fetch(commentsUrl);
        const commentsData = await commentsResponse.json();
        
        if (commentsResponse.ok && commentsData.items) {
          comments = commentsData.items
            .map((c: any) => ({
              id: c.id,
              authorName: c.snippet.topLevelComment.snippet.authorDisplayName,
              authorProfileImage: c.snippet.topLevelComment.snippet.authorProfileImageUrl,
              text: c.snippet.topLevelComment.snippet.textOriginal || c.snippet.topLevelComment.snippet.textDisplay,
              likeCount: c.snippet.topLevelComment.snippet.likeCount || 0,
              publishedAt: c.snippet.topLevelComment.snippet.publishedAt,
            }))
            .sort((a: any, b: any) => b.likeCount - a.likeCount)
            .slice(0, 20);
        }
      } catch (commentsErr) {
        console.error("[YouTube] Comments fetch error:", commentsErr);
      }

      // Generate AI comment summary
      let commentSummary: string | null = null;
      if (comments.length >= 3) {
        try {
          const commentTexts = comments.slice(0, 20).map(c => c.text).join("\n---\n");
          const summaryResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: `You are an expert at analyzing YouTube video comments. Provide a brief, insightful summary of the comments. Include:
1. Overall sentiment (positive, negative, mixed)
2. Main themes or topics people are discussing
3. 2-3 key points or insights that stood out

Keep it concise (3-4 sentences max). Be specific about what commenters are saying.`
              },
              {
                role: "user",
                content: `Analyze these YouTube comments and provide a summary:\n\n${commentTexts}`
              }
            ],
            max_tokens: 300,
            temperature: 0.7,
          });
          commentSummary = summaryResponse.choices[0]?.message?.content || null;
        } catch (aiErr) {
          console.error("[YouTube] AI summary error:", aiErr);
        }
      }

      res.json({
        videoId: item.id,
        title: item.snippet.title,
        description: item.snippet.description,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        thumbnail: item.snippet.thumbnails?.maxres?.url || item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
        viewCount: stats.viewCount ? parseInt(stats.viewCount) : null,
        likeCount: stats.likeCount ? parseInt(stats.likeCount) : null,
        commentCount: stats.commentCount ? parseInt(stats.commentCount) : null,
        duration: parseDuration(contentDetails.duration),
        tags: item.snippet.tags || [],
        comments,
        commentSummary,
      });
    } catch (err) {
      console.error("[YouTube] Video details error:", err);
      res.status(500).json({ message: "Failed to fetch video details" });
    }
  });

  // ─── DMO Tracker ─────────────────────────────────────────────────────────────

  app.get("/api/dmo/today", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const u = await storage.getUser(userId);
      const today = todayKeyInTz(safeTimezone(u?.timezone));
      const entry = await storage.getDmoEntry(userId, today);
      res.json({ entry: entry ?? null, date: today });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch today's DMO entry" });
    }
  });

  app.post("/api/dmo/entry", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const u = await storage.getUser(userId);
      const today = todayKeyInTz(safeTimezone(u?.timezone));
      const date: string = typeof req.body.date === "string" ? req.body.date : today;
      const parsed = dmoEntryDataSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid DMO entry data" });
      }
      const entry = await storage.upsertDmoEntry(userId, date, parsed.data);
      const streak = await storage.getDmoStreak(userId);
      res.json({ entry, streak });
    } catch (err) {
      res.status(500).json({ message: "Failed to save DMO entry" });
    }
  });

  app.get("/api/dmo/history", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const limit = Math.min(parseInt(req.query.limit as string || "60"), 180);
      const entries = await storage.getDmoEntries(userId, limit);
      res.json(entries);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch DMO history" });
    }
  });

  app.get("/api/dmo/streak", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const streak = await storage.getDmoStreak(userId);
      res.json(streak);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch streak" });
    }
  });

  // DMO Journal Summary — get cached AI summary for a period
  app.get("/api/dmo/summary/:period", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { period } = req.params;
      const cached = await storage.getDmoSummary(userId, period);
      if (cached) return res.json(cached);
      res.json(null);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch summary" });
    }
  });

  // DMO Journal Summary — generate AI summary for a period
  app.post("/api/dmo/summary/generate", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { period, periodType, startDate, endDate } = req.body as {
        period: string;
        periodType: "weekly" | "monthly";
        startDate: string;
        endDate: string;
      };
      if (!period || !periodType || !startDate || !endDate) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Fetch all entries for this period from DB
      const allEntries = await storage.getDmoEntries(userId, 365);
      const periodEntries = allEntries.filter(e => e.date >= startDate && e.date <= endDate);

      if (periodEntries.length === 0) {
        return res.status(400).json({ message: "No entries found for this period" });
      }

      // Build summary-friendly entry objects with calculated points
      const DMO_KEYS = [
        { key: "visionMeditation" as const, secsKey: "visionSeconds" as const, label: "Vision & Meditation", target: 30 },
        { key: "personalDevelopment" as const, secsKey: "personalSeconds" as const, label: "Personal Development", target: 30 },
        { key: "expandSkills" as const, secsKey: "expandSeconds" as const, label: "Expand Skills", target: 60 },
        { key: "execution" as const, secsKey: "executionSeconds" as const, label: "Execution", target: 60 },
        { key: "connecting" as const, secsKey: "connectingSeconds" as const, label: "Connecting", target: 60 },
      ];

      // Points: 0–5 based on seconds vs minute-target (target stays in minutes for display).
      const calcPts = (seconds: number, targetMinutes: number) =>
        Math.min(5, Math.floor((seconds / 60) / (targetMinutes / 5)));

      const entryData = periodEntries.map(e => {
        const activitiesCompleted: string[] = [];
        let totalPoints = 0;
        for (const a of DMO_KEYS) {
          const secs = (e[a.secsKey] as number) ?? 0;
          const pts = calcPts(secs, a.target);
          totalPoints += pts;
          if (pts > 0) activitiesCompleted.push(a.label);
        }
        return { date: e.date, totalPoints, activitiesCompleted, notes: e.notes || null };
      });

      // Format period label
      const periodLabel = periodType === "weekly"
        ? `Week of ${new Date(startDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
        : `${new Date(startDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" })}`;

      const result = await generateDmoSummary(entryData, periodType, periodLabel);
      await storage.upsertDmoSummary(userId, period, periodType, result.summary, result.tips, result.moodScore, result.performanceScore);

      res.json({ ...result, generatedAt: new Date() });
    } catch (err) {
      console.error("[DMO summary generate]", err);
      res.status(500).json({ message: "Failed to generate summary" });
    }
  });

  // ── Inbox Analyzer ──────────────────────────────────────────────────────────

  // Get or create the user's unique seed inbox address
  app.get("/api/inbox-analyzer/address", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
    try {
      const addr = await storage.getOrCreateInboxAddress(req.session.userId);
      const { getInboxAddress } = await import("./inboxAnalyzer");
      res.json({
        token: addr.token,
        email: getInboxAddress(addr.token),
        createdAt: addr.createdAt,
        sendingFromAddress: addr.sendingFromAddress || "",
        lastPlacementResults: addr.lastPlacementResults || null,
        lastPlacementCheckedAt: addr.lastPlacementCheckedAt || null,
        placementAutoCheckUntil: addr.placementAutoCheckUntil || null,
        placementCheckMessageId: addr.placementCheckMessageId || null,
      });
    } catch (err) {
      console.error("[inbox-analyzer] address error", err);
      res.status(500).json({ message: "Failed to get address" });
    }
  });

  app.patch("/api/inbox-analyzer/address/sending-from", requireAuth, async (req: Request, res: Response) => {
    const { sendingFromAddress } = req.body;
    if (typeof sendingFromAddress !== "string") return res.status(400).json({ message: "sendingFromAddress required" });
    try {
      await storage.getOrCreateInboxAddress(req.session!.userId!);
      await storage.updateInboxSendingFrom(req.session!.userId!, sendingFromAddress.trim());
      res.json({ success: true });
    } catch (err) {
      console.error("[inbox-analyzer] sending-from error", err);
      res.status(500).json({ message: "Failed to update sending address" });
    }
  });

  app.get("/api/inbox-analyzer/seed-inboxes", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session!.userId!);
      const isAdmin = user?.isAdmin ?? false;
      const activeOnly = !isAdmin;
      const inboxes = await storage.getSeedInboxes(activeOnly);
      const sanitized = inboxes.map(({ oauthAccessToken: _a, oauthRefreshToken: _r, oauthTokenExpiry: _e, ...rest }) => rest);
      res.json(sanitized);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch seed inboxes" });
    }
  });

  app.post("/api/inbox-analyzer/seed-inboxes", requireAdmin, async (req: Request, res: Response) => {
    const { provider, label, email } = req.body;
    if (!provider || !label || !email) return res.status(400).json({ message: "provider, label, and email are required" });
    try {
      const inbox = await storage.addSeedInbox({ provider, label, email, isActive: true });
      res.json(inbox);
    } catch (err) {
      res.status(500).json({ message: "Failed to add seed inbox" });
    }
  });

  app.patch("/api/inbox-analyzer/seed-inboxes/:id/toggle", requireAdmin, async (req: Request, res: Response) => {
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") return res.status(400).json({ message: "isActive boolean required" });
    try {
      await storage.toggleSeedInbox(req.params.id, isActive);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to toggle seed inbox" });
    }
  });

  app.delete("/api/inbox-analyzer/seed-inboxes/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deleteSeedInbox(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete seed inbox" });
    }
  });

  // Gmail OAuth: start connect flow (admin only)
  app.get("/api/inbox-analyzer/seed-inboxes/connect/gmail", requireAdmin, async (req: Request, res: Response) => {
    const inboxId = req.query.inboxId as string;
    if (!inboxId) return res.status(400).json({ message: "inboxId required" });
    try {
      const inbox = await storage.getSeedInboxById(inboxId);
      if (!inbox) return res.status(404).json({ message: "Inbox not found" });
      if (inbox.provider !== "gmail") return res.status(400).json({ message: "Only Gmail inboxes can be connected via Google OAuth" });
      const nonce = crypto.randomBytes(16).toString("hex");
      req.session.gmailOAuthNonce = nonce;
      req.session.gmailOAuthInboxId = inboxId;
      const url = getGmailAuthUrl(`${inboxId}:${nonce}`);
      res.redirect(url);
    } catch (err: any) {
      console.error("[GmailOAuth] connect error:", err?.message);
      res.redirect("/email-tools/inbox-analyzer?tab=settings&error=oauth_config");
    }
  });

  // Gmail OAuth: callback — requires an active admin session with a matching nonce
  app.get("/api/inbox-analyzer/seed-inboxes/callback/gmail", async (req: Request, res: Response) => {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const error = req.query.error as string;

    if (error || !code || !state) {
      return res.redirect("/email-tools/inbox-analyzer?tab=settings&error=oauth_denied");
    }

    const colonIdx = state.lastIndexOf(":");
    if (colonIdx === -1) {
      return res.redirect("/email-tools/inbox-analyzer?tab=settings&error=oauth_denied");
    }
    const inboxId = state.slice(0, colonIdx);
    const nonce = state.slice(colonIdx + 1);

    const sessionNonce = req.session.gmailOAuthNonce;
    const sessionInboxId = req.session.gmailOAuthInboxId;
    const sessionUserId = req.session.userId;

    if (!sessionUserId || !sessionNonce || sessionNonce !== nonce || sessionInboxId !== inboxId) {
      console.warn("[GmailOAuth] callback rejected: invalid session or nonce mismatch");
      return res.redirect("/email-tools/inbox-analyzer?tab=settings&error=oauth_denied");
    }

    const user = await storage.getUser(sessionUserId);
    if (!user?.isAdmin) {
      console.warn("[GmailOAuth] callback rejected: user is not admin");
      return res.redirect("/email-tools/inbox-analyzer?tab=settings&error=oauth_denied");
    }

    delete req.session.gmailOAuthNonce;
    delete req.session.gmailOAuthInboxId;

    try {
      const inbox = await storage.getSeedInboxById(inboxId);
      if (!inbox) {
        console.warn("[GmailOAuth] callback rejected: inbox not found", inboxId);
        return res.redirect("/email-tools/inbox-analyzer?tab=settings&error=oauth_failed");
      }

      const { accessToken, refreshToken, expiry, email } = await exchangeGmailCode(code);

      if (email.toLowerCase() !== inbox.email.toLowerCase()) {
        console.warn("[GmailOAuth] callback rejected: authorized account", email, "does not match inbox", inbox.email);
        return res.redirect("/email-tools/inbox-analyzer?tab=settings&error=oauth_email_mismatch");
      }

      await storage.storeSeedInboxOAuthTokens(inboxId, accessToken, refreshToken, expiry, email);
      res.redirect("/email-tools/inbox-analyzer?tab=settings&connected=1");
    } catch (err: any) {
      console.error("[GmailOAuth] callback error:", err?.message);
      res.redirect("/email-tools/inbox-analyzer?tab=settings&error=oauth_failed");
    }
  });

  // Disconnect a seed inbox OAuth
  app.delete("/api/inbox-analyzer/seed-inboxes/:id/disconnect", requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.disconnectSeedInbox(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to disconnect inbox" });
    }
  });

  // Placement check: member triggers check of their sending address against connected seed inboxes
  app.get("/api/inbox-analyzer/placement-check", requireAuth, async (req: Request, res: Response) => {
    const userId = req.session!.userId!;
    try {
      const address = await storage.getOrCreateInboxAddress(userId);

      // Resolve the effective sender address: prefer user-configured sendingFromAddress,
      // fall back to the actual from_address on the pinned email analysis record so
      // placement checks still work when the user hasn't set their sending address yet.
      let sendingFrom = address?.sendingFromAddress || "";
      if (!sendingFrom && address?.placementCheckMessageId) {
        const { db } = await import("./db");
        const { emailAnalyses } = await import("../shared/schema");
        const { eq, and } = await import("drizzle-orm");
        const [pinnedEmail] = await db.select({ fromAddress: emailAnalyses.fromAddress })
          .from(emailAnalyses)
          .where(and(
            eq(emailAnalyses.messageId, address.placementCheckMessageId),
            eq(emailAnalyses.userId, userId)
          ));
        sendingFrom = pinnedEmail?.fromAddress || "";
      }

      const allInboxes = await storage.getSeedInboxes(true); // active only
      const connectedInboxes = allInboxes.filter(i => i.isConnected && i.provider === "gmail");

      if (connectedInboxes.length === 0) {
        return res.json({ results: [], sendingFrom, message: "No connected seed inboxes yet" });
      }

      // Pass the pinned email context (Message-ID, subject, received-at) so the Gmail
      // query targets only the specific email under monitoring.  Message-ID is the gold
      // standard: a single globally-unique identifier that matches exactly one message
      // regardless of sender, subject, or date.
      const emailContext = {
        messageId: address?.placementCheckMessageId ?? null,
        receivedAt: address?.placementCheckReceivedAt ?? null,
        subject: address?.placementCheckSubject ?? null,
      };

      const results: PlacementResult[] = await Promise.all(
        connectedInboxes.map(inbox =>
          checkGmailPlacement(
            {
              id: inbox.id,
              label: inbox.label,
              email: inbox.email,
              provider: inbox.provider,
              oauthAccessToken: inbox.oauthAccessToken,
              oauthRefreshToken: inbox.oauthRefreshToken,
            },
            sendingFrom,
            emailContext
          )
        )
      );

      // Persist results so they survive page refresh
      await storage.saveLastPlacementResults(userId, results);

      res.json({ results, sendingFrom });
    } catch (err: any) {
      console.error("[PlacementCheck] error:", err?.message);
      res.status(500).json({ message: "Failed to check placement" });
    }
  });

  // List analyzed emails for the current user
  app.get("/api/inbox-analyzer/emails", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
    try {
      const emails = await storage.getEmailAnalyses(req.session.userId);
      res.json(emails);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch emails" });
    }
  });

  // Get a single analyzed email
  app.get("/api/inbox-analyzer/emails/:id", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
    try {
      const email = await storage.getEmailAnalysis(req.params.id, req.session.userId);
      if (!email) return res.status(404).json({ message: "Not found" });
      res.json(email);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch email" });
    }
  });

  // Delete an analyzed email
  app.delete("/api/inbox-analyzer/emails/:id", async (req: Request, res: Response) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
    try {
      await storage.deleteEmailAnalysis(req.params.id, req.session.userId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete email" });
    }
  });

  // Re-run analysis on an existing email (e.g. stuck in processing/failed)
  app.post("/api/inbox-analyzer/emails/:id/reanalyze", requireAuth, async (req: Request, res: Response) => {
    try {
      const emailId = req.params.id;
      const userId = req.session.userId!;
      const analysis = await storage.getEmailAnalysis(emailId, userId);
      if (!analysis) return res.status(404).json({ message: "Email not found" });

      await storage.updateEmailAnalysis(emailId, { status: "processing" });
      res.status(202).json({ message: "Re-analysis started" });

      (async () => {
        try {
          const {
            parseSpfResult, parseDkimResult, parseDmarcResult,
            extractSendingDomain, extractSendingIp, extractReplyTo,
            checkSpfRecord, checkDkimRecord, checkDmarcRecord,
            analyzeSpamLanguage, computeOverallScore,
            analyzeTechnicalHealth, analyzeSenderTrust, analyzeContentQuality, analyzeCanSpamCompliance,
          } = await import("./inboxAnalyzer");

          const rawHeaders = analysis.rawHeaders || "";
          const fromAddress = analysis.fromAddress;
          const fromRaw = analysis.fromName ? `${analysis.fromName} <${fromAddress}>` : fromAddress;
          const replyTo = analysis.replyTo || extractReplyTo(rawHeaders);
          const spfResult = analysis.spfResult || "unknown";
          const dkimResult = analysis.dkimResult || "unknown";
          const subject = analysis.subject;
          const bodyText = analysis.bodyText || "";
          const bodyHtml = analysis.bodyHtml || "";

          const dmarcResult = parseDmarcResult(rawHeaders, fromAddress, dkimResult, spfResult);
          const sendingDomain = extractSendingDomain(fromAddress);
          const sendingIp = extractSendingIp(rawHeaders);

          const [spfRecordExists, dkimRecordExists, dmarcRecordExists] = await Promise.all([
            checkSpfRecord(sendingDomain),
            checkDkimRecord(sendingDomain),
            checkDmarcRecord(sendingDomain),
          ]);

          const { score: spamScore, flags: spamFlags } = analyzeSpamLanguage(subject, bodyText, bodyHtml);
          const technicalHealth = analyzeTechnicalHealth(bodyHtml, bodyText);
          const contentQuality = analyzeContentQuality(bodyText, bodyHtml);
          const canSpamCompliance = analyzeCanSpamCompliance(bodyText, bodyHtml, subject);
          const senderTrust = await analyzeSenderTrust(fromRaw, replyTo || undefined, sendingIp, sendingDomain);

          const overallScore = computeOverallScore({
            spfResult,
            dkimResult,
            dmarcResult,
            spfRecordExists,
            dkimRecordExists,
            dmarcRecordExists,
            spamScore,
            senderTrust,
            technicalHealth,
            contentQuality,
            canSpamCompliance,
          });

          await storage.updateEmailAnalysis(emailId, {
            dmarcResult,
            sendingDomain,
            sendingIp,
            spfRecordExists,
            dkimRecordExists,
            dmarcRecordExists,
            spamScore,
            spamFlags,
            overallScore,
            technicalHealth,
            senderTrust,
            contentQuality,
            canSpamCompliance,
            status: "complete",
          });

          // If placement hasn't been confirmed yet, trigger a placement check now.
          // We skip this when placementResults is already set (confirmed by the scheduler).
          if (!analysis.placementResults) {
            try {
              const addr = await storage.getOrCreateInboxAddress(userId);
              // Prefer user-configured sendingFromAddress; fall back to the email's actual from address.
              const senderForPlacement = addr?.sendingFromAddress || fromAddress;
              const allInboxes = await storage.getSeedInboxes(true);
              const connectedInboxes = allInboxes.filter(i => i.isConnected && i.provider === "gmail");
              if (connectedInboxes.length > 0 && senderForPlacement) {
                const { checkGmailPlacement } = await import("./gmailOAuth");
                // Always use THIS specific email's own identifiers, not the address-level
                // pinned context (which points to the most recent email and would send
                // the Gmail search after the wrong message for any older email).
                const emailCtx = {
                  messageId: analysis.messageId ?? null,
                  receivedAt: analysis.receivedAt ? new Date(analysis.receivedAt as unknown as string) : null,
                  subject: analysis.subject ?? null,
                };
                const placementResults = await Promise.all(
                  connectedInboxes.map(inbox =>
                    checkGmailPlacement(
                      {
                        id: inbox.id,
                        label: inbox.label,
                        email: inbox.email,
                        provider: inbox.provider,
                        oauthAccessToken: inbox.oauthAccessToken,
                        oauthRefreshToken: inbox.oauthRefreshToken,
                      },
                      senderForPlacement,
                      emailCtx
                    )
                  )
                );
                await storage.saveLastPlacementResults(userId, placementResults);
                console.log(`[inbox-analyzer] reanalyze also ran placement check for email ${emailId}`);
              }
            } catch (placementErr: any) {
              console.error("[inbox-analyzer] reanalyze placement check error:", placementErr?.message);
            }
          }
        } catch (err) {
          console.error("[inbox-analyzer] reanalyze pipeline error:", err);
          await storage.updateEmailAnalysis(emailId, { status: "failed" });
        }
      })();
    } catch (err) {
      console.error("[inbox-analyzer] reanalyze error:", err);
      res.status(500).json({ message: "Failed to start re-analysis" });
    }
  });

  // SendGrid Inbound Parse webhook — receives incoming emails
  app.post("/api/inbox-analyzer/inbound", inboundUpload.any(), async (req: Request, res: Response) => {
    // Acknowledge immediately so SendGrid doesn't retry
    res.status(200).send("OK");

    try {
      const {
        parseSpfResult, parseDkimResult, parseDmarcResult,
        extractSendingDomain, extractSendingIp, extractReplyTo,
        checkSpfRecord, checkDkimRecord, checkDmarcRecord,
        analyzeSpamLanguage, computeOverallScore,
        analyzeTechnicalHealth, analyzeSenderTrust, analyzeContentQuality, analyzeCanSpamCompliance,
        stripTrackingPixels,
      } = await import("./inboxAnalyzer");

      const toRaw: string = (req.body?.to || req.body?.envelope && JSON.parse(req.body.envelope)?.to?.[0]) || "";
      // Handle "Display Name <email@domain>" format in addition to plain "email@domain"
      const emailInBrackets = toRaw.match(/<([^>]+)>/);
      const toField = emailInBrackets ? emailInBrackets[1] : toRaw.trim();
      const tokenMatch = toField.match(/^([a-z0-9]+)@/i);
      if (!tokenMatch) { console.warn("[inbox-analyzer] Could not extract token from:", toRaw); return; }
      const token = tokenMatch[1].toLowerCase();

      const inboxAddr = await storage.getInboxAddressByToken(token);
      if (!inboxAddr) { console.warn("[inbox-analyzer] Unknown token:", token); return; }

      const fromRaw: string = req.body?.from || "";
      const fromNameMatch = fromRaw.match(/^"?([^"<\n]+)"?\s*</);
      const fromName = fromNameMatch ? fromNameMatch[1].trim() : undefined;
      const fromAddrMatch = fromRaw.match(/<([^>]+)>/) || fromRaw.match(/(\S+@\S+)/);
      const fromAddress = fromAddrMatch ? fromAddrMatch[1] : fromRaw;

      const subject: string = req.body?.subject || "(No subject)";
      const bodyText: string = req.body?.text || "";
      const bodyHtml: string = stripTrackingPixels(req.body?.html || "");
      const rawHeaders: string = req.body?.headers || "";
      // SendGrid sends the SPF result as "SPF" (uppercase) in the webhook body
      const spfRaw: string = req.body?.SPF || req.body?.spf || "";
      const dkimRaw: string = req.body?.dkim || "";
      const replyTo: string = extractReplyTo(rawHeaders);
      // Extract the globally-unique Message-ID from headers (strips surrounding angle brackets)
      const messageIdMatch = rawHeaders.match(/^Message-ID:\s*<?([^>\r\n]+)>?/im);
      const messageId: string | undefined = messageIdMatch ? messageIdMatch[1].trim() : undefined;

      const spfResult = parseSpfResult(spfRaw);
      const dkimResult = parseDkimResult(dkimRaw);

      // Create the analysis record
      const analysis = await storage.createEmailAnalysis({
        userId: inboxAddr.userId,
        fromAddress,
        fromName,
        replyTo: replyTo || undefined,
        messageId,
        subject,
        bodyText,
        bodyHtml,
        rawHeaders,
        spfResult,
        dkimResult,
      });

      // Open a 24-hour placement monitoring window, pinned to THIS specific email.
      // We do NOT fire an immediate check here because Gmail's spam filters need a few
      // minutes to process the email before its folder assignment is reliable.
      // Setting lastPlacementCheckedAt = now (done inside setPlacementAutoCheckWindow)
      // enforces the 15-min scheduler throttle, so the first real check runs ~15 minutes
      // after the email arrives — safely after spam filtering completes.
      // Two consecutive matching checks are then required before monitoring stops.
      (async () => {
        const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;
        await storage.setPlacementAutoCheckWindow(
          inboxAddr.userId,
          new Date(Date.now() + TWENTY_FOUR_H),
          { receivedAt: new Date(), subject, messageId }
        );
      })().catch(err => console.error("[PlacementScheduler] window open error:", err));

      // Run full analysis pipeline async
      (async () => {
        try {
          await storage.updateEmailAnalysis(analysis.id, { status: "processing" });

          const dmarcResult = parseDmarcResult(rawHeaders, fromAddress, dkimResult, spfResult);
          const sendingDomain = extractSendingDomain(fromAddress);
          const sendingIp = extractSendingIp(rawHeaders);

          const [spfRecordExists, dkimRecordExists, dmarcRecordExists] = await Promise.all([
            checkSpfRecord(sendingDomain),
            checkDkimRecord(sendingDomain),
            checkDmarcRecord(sendingDomain),
          ]);

          const { score: spamScore, flags: spamFlags } = analyzeSpamLanguage(subject, bodyText, bodyHtml);
          const technicalHealth = analyzeTechnicalHealth(bodyHtml, bodyText);
          const contentQuality = analyzeContentQuality(bodyText, bodyHtml);
          const canSpamCompliance = analyzeCanSpamCompliance(bodyText, bodyHtml, subject);
          const senderTrust = await analyzeSenderTrust(fromRaw, replyTo || undefined, sendingIp, sendingDomain);

          const overallScore = computeOverallScore({
            spfResult: parseSpfResult(spfRaw),
            dkimResult: parseDkimResult(dkimRaw),
            dmarcResult,
            spfRecordExists,
            dkimRecordExists,
            dmarcRecordExists,
            spamScore,
            senderTrust,
            technicalHealth,
            contentQuality,
            canSpamCompliance,
          });

          await storage.updateEmailAnalysis(analysis.id, {
            dmarcResult,
            sendingDomain,
            sendingIp,
            spfRecordExists,
            dkimRecordExists,
            dmarcRecordExists,
            spamScore,
            spamFlags,
            overallScore,
            technicalHealth,
            senderTrust,
            contentQuality,
            canSpamCompliance,
            status: "complete",
          });
        } catch (err) {
          console.error("[inbox-analyzer] pipeline error:", err);
          await storage.updateEmailAnalysis(analysis.id, { status: "failed" });
        }
      })();
    } catch (err) {
      console.error("[inbox-analyzer] inbound webhook error:", err);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Inbox Intel — Competitor Email Intelligence
  // ══════════════════════════════════════════════════════════════════════════

  // SendGrid Inbound Parse webhook for the watch.* subdomain.
  // Public (no auth) — we route by recipient token, which is unguessable.
  // Multer parse errors are caught locally so the webhook always returns 200
  // quickly and never bubbles into the global error handler.
  const inboundParseSafe = (req: Request, res: Response, next: (err?: any) => void) => {
    inboundUpload.any()(req, res, (err: any) => {
      if (err) {
        console.warn("[inbox-intel] inbound parse error:", err?.message || err);
        if (!res.headersSent) res.status(200).send("OK");
        return;
      }
      next();
    });
  };
  app.post("/api/inbox-intel/inbound", inboundParseSafe, async (req: Request, res: Response) => {
    if (!res.headersSent) res.status(200).send("OK");

    try {
      const intel = await import("./inboxIntel");
      const { insertCompetitorTrackerSchema } = await import("@shared/schema");
      void insertCompetitorTrackerSchema; // ensure module side-effect for shared schema typing

      // Recipient extraction (handles both `to` field and SendGrid `envelope`)
      const toRaw: string =
        req.body?.to ||
        (req.body?.envelope ? (() => {
          try { const env = JSON.parse(req.body.envelope); return env?.to?.[0] || ""; } catch { return ""; }
        })() : "") || "";

      const token = intel.extractToken(toRaw);
      if (!token) {
        console.warn("[inbox-intel] Could not extract token from:", toRaw);
        return;
      }

      const seed = await storage.getCompetitorSeedByToken(token);
      if (!seed) {
        console.warn("[inbox-intel] Unknown token:", token);
        return;
      }

      // Parse sender / subject / body
      const fromRaw: string = req.body?.from || "";
      const { name: fromName, email: fromEmail, domain: fromDomain } = intel.parseFromField(fromRaw);
      const subject: string = (req.body?.subject || "(No subject)").substring(0, 500);
      const bodyText: string = req.body?.text || "";
      const bodyHtmlRaw: string = req.body?.html || "";
      const bodyHtml = intel.stripTrackingPixels(bodyHtmlRaw);
      const rawHeaders: string = req.body?.headers || "";

      const replyToEmail = intel.extractReplyTo(rawHeaders);
      const messageId = intel.extractMessageId(rawHeaders);
      const sentAt = intel.extractSentAt(rawHeaders);

      const spfResult = intel.parseSpf(req.body?.SPF || req.body?.spf);
      const dkimResult = intel.parseDkim(req.body?.dkim);
      const dmarcResult = intel.parseDmarc(rawHeaders, fromEmail, dkimResult, spfResult);

      const detectedEsp = intel.detectEsp(rawHeaders, bodyHtml);
      const listUnsubscribePresent = intel.hasListUnsubscribe(rawHeaders);
      const listUnsubscribePostPresent = intel.hasListUnsubscribePost(rawHeaders);

      const preheader = intel.extractPreheader(bodyHtml);
      const plainText = bodyText || intel.htmlToPlainText(bodyHtml);
      const wordCount = intel.countWords(plainText);
      const linkCount = (bodyHtml.match(/<a\b/gi) || []).length;
      const imageCount = intel.countImages(bodyHtml);
      const subjStats = intel.subjectStats(subject);

      // Persist email row
      const created = await storage.createCapturedEmail({
        userId: seed.userId,
        trackerId: seed.trackerId,
        seedAddressId: seed.id,
        subject,
        preheader: preheader || null,
        fromName: fromName || null,
        fromEmail: fromEmail || null,
        fromDomain: fromDomain || null,
        replyToEmail: replyToEmail || null,
        messageId: messageId || null,
        plainBody: plainText.substring(0, 200_000) || null,
        htmlBody: bodyHtml || null,
        htmlBodySize: bodyHtml ? bodyHtml.length : null,
        bodyAvailable: !!(bodyHtml || plainText),
        wordCount,
        linkCount,
        imageCount,
        subjectLength: subjStats.length,
        subjectHasEmoji: subjStats.hasEmoji,
        subjectIsAllCaps: subjStats.isAllCaps,
        preheaderLength: preheader ? preheader.length : 0,
        spfResult,
        dkimResult,
        dmarcResult,
        detectedEsp: detectedEsp || null,
        listUnsubscribePresent,
        listUnsubscribePostPresent,
        sentAt: sentAt || null,
      });

      // Persist links
      const links = intel.extractLinks(bodyHtml, fromDomain);
      if (links.length > 0) {
        await storage.addCapturedEmailLinks(created.id, links);
      }

      // Bump seed counter
      await storage.incrementSeedReceived(seed.id);

      // Prune old non-pinned bodies — keep latest 100 with full HTML
      try {
        const pruned = await storage.pruneOldCapturedBodies(seed.trackerId, 100);
        if (pruned > 0) {
          console.log(`[inbox-intel] Pruned ${pruned} old email bodies for tracker ${seed.trackerId}`);
        }
      } catch (pruneErr) {
        console.error("[inbox-intel] prune error:", pruneErr);
      }
    } catch (err) {
      console.error("[inbox-intel] inbound webhook error:", err);
    }
  });

  // ── Tracker CRUD ─────────────────────────────────────────────────────────
  const MAX_TRACKERS = 20;
  const MAX_SEEDS_PER_TRACKER = 5;
  const MAX_PINNED_PER_TRACKER = 25;

  app.get("/api/inbox-intel/trackers", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const trackers = await storage.getCompetitorTrackers(userId);
      res.json(trackers);
    } catch (err) {
      console.error("[inbox-intel] list trackers error:", err);
      res.status(500).json({ message: "Failed to load competitors" });
    }
  });

  app.post("/api/inbox-intel/trackers", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const { insertCompetitorTrackerSchema } = await import("@shared/schema");
      const parsed = insertCompetitorTrackerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const total = await storage.countCompetitorTrackers(userId);
      if (total >= MAX_TRACKERS) {
        return res.status(409).json({ message: `Limit reached: ${MAX_TRACKERS} competitors maximum` });
      }
      const created = await storage.createCompetitorTracker(userId, parsed.data);
      // Auto-generate the first seed address so the user has something to use immediately
      try {
        const intel = await import("./inboxIntel");
        const creator = await storage.getUser(userId);
        // Insert-with-retry — the DB unique constraint on token is the source
        // of truth, so we catch unique-violations and retry rather than relying
        // on a non-atomic check-then-insert (which races under concurrency).
        for (let attempt = 0; attempt < 8; attempt++) {
          const token = attempt === 0
            ? intel.generateMemberSeedToken(creator?.firstName, creator?.lastName)
            : intel.generateSeedToken();
          try {
            await storage.createCompetitorSeedAddress(userId, created.id, token);
            break;
          } catch (insertErr: any) {
            const code = insertErr?.code || insertErr?.cause?.code;
            const isUnique = code === "23505" || /unique/i.test(insertErr?.message || "");
            if (!isUnique || attempt === 7) throw insertErr;
            // collision — try a fresh token
          }
        }
      } catch (seedErr) {
        console.error("[inbox-intel] auto-seed error:", seedErr);
      }
      // Kick off website screenshot in background (best-effort)
      if (created.website) {
        const { captureWebsiteScreenshotAsync } = await import("./inboxIntelScreenshots");
        captureWebsiteScreenshotAsync(created.id, created.website);
      }
      res.status(201).json(created);
    } catch (err) {
      console.error("[inbox-intel] create tracker error:", err);
      res.status(500).json({ message: "Failed to create competitor" });
    }
  });

  app.get("/api/inbox-intel/trackers/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const trackerId = req.params.id;
      const tracker = await storage.getCompetitorTracker(trackerId, userId);
      if (!tracker) return res.status(404).json({ message: "Competitor not found" });
      const intel = await import("./inboxIntel");
      const seedsRaw = await storage.getCompetitorSeedAddresses(trackerId, userId);
      const seeds = seedsRaw.map((s) => ({ ...s, address: intel.buildSeedAddress(s.token) }));
      const emails = await storage.getCapturedEmails(trackerId, userId, 200);
      const pinnedCount = await storage.countPinnedEmailsForTracker(trackerId);
      res.json({ tracker, seeds, emails, pinnedCount });
    } catch (err) {
      console.error("[inbox-intel] get tracker error:", err);
      res.status(500).json({ message: "Failed to load competitor" });
    }
  });

  app.get("/api/inbox-intel/trackers/:id/analytics", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const trackerId = req.params.id;
      const tracker = await storage.getCompetitorTracker(trackerId, userId);
      if (!tracker) return res.status(404).json({ message: "Competitor not found" });
      const analytics = await storage.getTrackerAnalytics(trackerId, userId);
      res.json(analytics);
    } catch (err) {
      console.error("[inbox-intel] analytics error:", err);
      res.status(500).json({ message: "Failed to load analytics" });
    }
  });

  app.get("/api/inbox-intel/trackers/:id/funnel", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const trackerId = req.params.id;
      const tracker = await storage.getCompetitorTracker(trackerId, userId);
      if (!tracker) return res.status(404).json({ message: "Competitor not found" });
      const intel = await import("./inboxIntel");
      const seedsRaw = await storage.getCompetitorSeedAddresses(trackerId, userId);
      const seeds = seedsRaw.map((s) => ({ ...s, address: intel.buildSeedAddress(s.token) }));
      const emails = await storage.getCapturedEmails(trackerId, userId, 500);
      const { analyzeFunnel } = await import("./inboxIntelFunnel");
      const analysis = analyzeFunnel(seeds, emails);
      res.json(analysis);
    } catch (err) {
      console.error("[inbox-intel] funnel error:", err);
      res.status(500).json({ message: "Failed to analyze funnel" });
    }
  });

  app.get("/api/inbox-intel/feed", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const q = req.query as Record<string, string | undefined>;
      const trackerIds = q.trackerIds
        ? q.trackerIds.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;
      const parseDate = (v?: string): Date | undefined => {
        if (!v) return undefined;
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? undefined : d;
      };
      const limitNum = q.limit ? parseInt(q.limit, 10) : 100;
      const feed = await storage.getCapturedEmailsFeed(userId, {
        trackerIds,
        esp: q.esp || undefined,
        search: q.search || undefined,
        pinnedOnly: q.pinnedOnly === "true" || q.pinnedOnly === "1",
        from: parseDate(q.from),
        to: parseDate(q.to),
        limit: Number.isFinite(limitNum) ? limitNum : 100,
      });
      res.json(feed);
    } catch (err) {
      console.error("[inbox-intel] feed error:", err);
      res.status(500).json({ message: "Failed to load feed" });
    }
  });

  // ── Phase 4 — cross-competitor insights ─────────────────────────────────
  app.get("/api/inbox-intel/insights", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const trackers = await storage.getCompetitorTrackers(userId);
      // Fetch all emails per tracker in parallel (bounded: 20 trackers × ~100 emails)
      const perTracker = await Promise.all(
        trackers.map(async (t) => ({
          tracker: t,
          emails: await storage.getCapturedEmails(t.id, userId, 500),
        })),
      );
      const { computeInsights } = await import("./inboxIntelInsights");
      const insights = computeInsights(perTracker);
      res.json(insights);
    } catch (err) {
      console.error("[inbox-intel] insights error:", err);
      res.status(500).json({ message: "Failed to compute insights" });
    }
  });

  // ── Phase 4 — side-by-side compare summaries ───────────────────────────
  app.get("/api/inbox-intel/compare", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const idsParam = (req.query.ids as string | undefined) || "";
      const requestedIds = idsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (requestedIds.length === 0) {
        return res.json({ trackers: [] });
      }
      if (requestedIds.length > 4) {
        return res.status(400).json({ message: "Compare up to 4 competitors at a time." });
      }
      const intel = await import("./inboxIntel");
      const { analyzeFunnel } = await import("./inboxIntelFunnel");
      const { summarizeForCompare } = await import("./inboxIntelInsights");

      const summaries = await Promise.all(
        requestedIds.map(async (id) => {
          const tracker = await storage.getCompetitorTracker(id, userId);
          if (!tracker) return null;
          const seedsRaw = await storage.getCompetitorSeedAddresses(id, userId);
          const seeds = seedsRaw.map((s) => ({ ...s, address: intel.buildSeedAddress(s.token) }));
          const emails = await storage.getCapturedEmails(id, userId, 500);
          const analytics = await storage.getTrackerAnalytics(id, userId);
          const funnel = analyzeFunnel(seeds, emails);
          return summarizeForCompare({ tracker, emails, analytics, funnel });
        }),
      );
      // Preserve client-supplied order; drop unauthorized/missing ids silently.
      res.json({ trackers: summaries.filter((s) => s !== null) });
    } catch (err) {
      console.error("[inbox-intel] compare error:", err);
      res.status(500).json({ message: "Failed to load comparison" });
    }
  });

  // ── Phase 4 — CSV export per tracker ────────────────────────────────────
  app.get(
    "/api/inbox-intel/trackers/:id/emails.csv",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const userId = req.session!.userId!;
        const trackerId = req.params.id;
        const tracker = await storage.getCompetitorTracker(trackerId, userId);
        if (!tracker) return res.status(404).json({ message: "Competitor not found" });
        const emails = await storage.getCapturedEmails(trackerId, userId, 5000);
        const { emailsToCsv, csvFilename } = await import("./inboxIntelCsv");
        const csv = emailsToCsv(emails.map((email) => ({ trackerName: tracker.name, email })));
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${csvFilename(tracker.name)}"`,
        );
        res.send(csv);
      } catch (err) {
        console.error("[inbox-intel] tracker CSV error:", err);
        res.status(500).json({ message: "Failed to export CSV" });
      }
    },
  );

  // ── Phase 4 — CSV export across feed (same filters as /feed) ────────────
  app.get("/api/inbox-intel/feed.csv", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const q = req.query as Record<string, string | undefined>;
      const trackerIds = q.trackerIds
        ? q.trackerIds.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;
      const parseDate = (v?: string): Date | undefined => {
        if (!v) return undefined;
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? undefined : d;
      };
      const rows = await storage.getEmailsForCsvExport(userId, {
        trackerIds,
        esp: q.esp || undefined,
        search: q.search || undefined,
        pinnedOnly: q.pinnedOnly === "true" || q.pinnedOnly === "1",
        from: parseDate(q.from),
        to: parseDate(q.to),
        limit: 5000,
      });
      const { emailsToCsv, csvFilename } = await import("./inboxIntelCsv");
      const csv = emailsToCsv(rows);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${csvFilename("inbox-intel-feed")}"`,
      );
      res.send(csv);
    } catch (err) {
      console.error("[inbox-intel] feed CSV error:", err);
      res.status(500).json({ message: "Failed to export CSV" });
    }
  });

  app.patch("/api/inbox-intel/trackers/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const { insertCompetitorTrackerSchema } = await import("@shared/schema");
      const parsed = insertCompetitorTrackerSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const before = await storage.getCompetitorTracker(req.params.id, userId);
      if (!before) return res.status(404).json({ message: "Competitor not found" });
      const updated = await storage.updateCompetitorTracker(req.params.id, userId, parsed.data);
      if (!updated) return res.status(404).json({ message: "Competitor not found" });
      // If website changed, re-capture screenshot in background
      const websiteChanged =
        parsed.data.website !== undefined &&
        (parsed.data.website || null) !== (before.website || null);
      if (websiteChanged) {
        const { captureWebsiteScreenshotAsync } = await import("./inboxIntelScreenshots");
        captureWebsiteScreenshotAsync(updated.id, updated.website);
      }
      res.json(updated);
    } catch (err) {
      console.error("[inbox-intel] update tracker error:", err);
      res.status(500).json({ message: "Failed to update competitor" });
    }
  });

  // Manually re-capture the competitor's website screenshot
  app.post("/api/inbox-intel/trackers/:id/refresh-screenshot", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const tracker = await storage.getCompetitorTracker(req.params.id, userId);
      if (!tracker) return res.status(404).json({ message: "Competitor not found" });
      if (!tracker.website) {
        return res.status(400).json({ message: "Add a website to this competitor first" });
      }
      const { captureWebsiteScreenshotAsync } = await import("./inboxIntelScreenshots");
      captureWebsiteScreenshotAsync(tracker.id, tracker.website);
      res.json({ ok: true, status: "capturing" });
    } catch (err) {
      console.error("[inbox-intel] refresh screenshot error:", err);
      res.status(500).json({ message: "Failed to refresh screenshot" });
    }
  });

  // Serve the cached competitor screenshot (auth-scoped to the tracker owner)
  app.get("/api/inbox-intel/trackers/:id/screenshot", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const tracker = await storage.getCompetitorTracker(req.params.id, userId);
      if (!tracker) return res.status(404).json({ message: "Not found" });
      if (!tracker.screenshotPath) return res.status(404).json({ message: "No screenshot yet" });
      const file = await objectStorageService.getObjectEntityFile(tracker.screenshotPath);
      await objectStorageService.downloadObject(file, res, 86400);
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(404).json({ message: "Screenshot unavailable" });
      }
    }
  });

  app.delete("/api/inbox-intel/trackers/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const tracker = await storage.getCompetitorTracker(req.params.id, userId);
      if (!tracker) return res.status(404).json({ message: "Competitor not found" });
      await storage.deleteCompetitorTracker(req.params.id, userId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[inbox-intel] delete tracker error:", err);
      res.status(500).json({ message: "Failed to delete competitor" });
    }
  });

  // ── Seed addresses ──────────────────────────────────────────────────────
  app.post("/api/inbox-intel/trackers/:id/seeds", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const trackerId = req.params.id;
      const tracker = await storage.getCompetitorTracker(trackerId, userId);
      if (!tracker) return res.status(404).json({ message: "Competitor not found" });
      const { seedAddressLabelSchema } = await import("@shared/schema");
      const parsed = seedAddressLabelSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid input" });
      }
      const total = await storage.countCompetitorSeedsForTracker(trackerId);
      if (total >= MAX_SEEDS_PER_TRACKER) {
        return res.status(409).json({ message: `Limit reached: ${MAX_SEEDS_PER_TRACKER} seed addresses per competitor` });
      }
      const intel = await import("./inboxIntel");
      const creator = await storage.getUser(userId);
      let saved: CompetitorSeedAddress | null = null;
      // Insert-with-retry on DB unique-violation (race-safe).
      for (let attempt = 0; attempt < 8; attempt++) {
        const token = attempt === 0
          ? intel.generateMemberSeedToken(creator?.firstName, creator?.lastName)
          : intel.generateSeedToken();
        try {
          saved = await storage.createCompetitorSeedAddress(
            userId,
            trackerId,
            token,
            parsed.data.label || undefined,
          );
          break;
        } catch (insertErr: any) {
          const code = insertErr?.code || insertErr?.cause?.code;
          const isUnique = code === "23505" || /unique/i.test(insertErr?.message || "");
          if (!isUnique) throw insertErr;
          // collision — try a fresh token
        }
      }
      if (!saved) {
        return res.status(500).json({ message: "Couldn't generate a unique address — try again" });
      }
      res.status(201).json({ ...saved, address: intel.buildSeedAddress(saved.token) });
    } catch (err) {
      console.error("[inbox-intel] create seed error:", err);
      res.status(500).json({ message: "Failed to create seed address" });
    }
  });

  app.delete("/api/inbox-intel/seeds/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      await storage.deleteCompetitorSeedAddress(req.params.id, userId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[inbox-intel] delete seed error:", err);
      res.status(500).json({ message: "Failed to delete seed address" });
    }
  });

  // ── Captured emails ─────────────────────────────────────────────────────
  app.get("/api/inbox-intel/emails/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const email = await storage.getCapturedEmail(req.params.id, userId);
      if (!email) return res.status(404).json({ message: "Email not found" });
      const links = await storage.getCapturedEmailLinks(email.id);
      res.json({ email, links });
    } catch (err) {
      console.error("[inbox-intel] get email error:", err);
      res.status(500).json({ message: "Failed to load email" });
    }
  });

  app.patch("/api/inbox-intel/emails/:id/pin", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const pinned = !!req.body?.pinned;
      const existing = await storage.getCapturedEmail(req.params.id, userId);
      if (!existing) return res.status(404).json({ message: "Email not found" });
      if (pinned && !existing.isPinned) {
        const total = await storage.countPinnedEmailsForTracker(existing.trackerId);
        if (total >= MAX_PINNED_PER_TRACKER) {
          return res.status(409).json({
            message: `Limit reached: ${MAX_PINNED_PER_TRACKER} pinned emails per competitor`,
          });
        }
      }
      const updated = await storage.setCapturedEmailPin(req.params.id, userId, pinned);
      res.json(updated);
    } catch (err) {
      console.error("[inbox-intel] pin email error:", err);
      res.status(500).json({ message: "Failed to update pin" });
    }
  });

  // ── Sender Reputation (Google Postmaster Tools) ───────────────────────────

  app.get("/api/sender-reputation/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const conn = await storage.getPostmasterConnection(userId);
      if (!conn) {
        return res.json({ connected: false, domains: [] });
      }
      const domains = await storage.getPostmasterDomains(userId);
      const { oauthAccessToken: _a, oauthRefreshToken: _r, oauthTokenExpiry: _e, ...safeConn } = conn;
      res.json({ connected: true, connectedEmail: safeConn.connectedEmail, lastSyncedAt: safeConn.lastSyncedAt, domains });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch status" });
    }
  });

  app.get("/api/sender-reputation/connect", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const url = getPostmasterAuthUrl(userId);
      res.redirect(url);
    } catch (err) {
      res.status(500).json({ message: "Failed to initiate OAuth" });
    }
  });

  app.get("/api/sender-reputation/callback", async (req: Request, res: Response) => {
    const { code, state: userId, error } = req.query as Record<string, string>;
    if (error || !code || !userId) {
      return res.redirect("/email-tools/sender-reputation?error=oauth_failed");
    }
    try {
      const { accessToken, refreshToken, expiry, email } = await exchangePostmasterCode(code);
      await storage.upsertPostmasterConnection(userId, { oauthAccessToken: accessToken, oauthRefreshToken: refreshToken, oauthTokenExpiry: expiry, connectedEmail: email });
      // Immediately sync domain data
      try {
        const domainData = await fetchPostmasterData(accessToken, refreshToken);
        for (const d of domainData) {
          await storage.upsertPostmasterDomain(userId, d.domainName, { latestReputation: d.latestReputation, latestSpamRate: d.latestSpamRate, latestSpfRatio: d.latestSpfRatio, latestDkimRatio: d.latestDkimRatio, latestDmarcRatio: d.latestDmarcRatio, latestEncryptionRatio: d.latestEncryptionRatio, trafficStats: d.trafficStats });
        }
        await storage.updatePostmasterLastSynced(userId);
      } catch (syncErr) {
        console.error("[Postmaster] Initial sync failed:", syncErr);
      }
      res.redirect("/email-tools/sender-reputation");
    } catch (err) {
      console.error("[Postmaster] OAuth callback error:", err);
      res.redirect("/email-tools/sender-reputation?error=oauth_failed");
    }
  });

  app.post("/api/sender-reputation/sync", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const conn = await storage.getPostmasterConnection(userId);
      if (!conn?.oauthAccessToken) return res.status(400).json({ message: "Not connected" });
      const domainData = await fetchPostmasterData(conn.oauthAccessToken, conn.oauthRefreshToken);
      for (const d of domainData) {
        await storage.upsertPostmasterDomain(userId, d.domainName, { latestReputation: d.latestReputation, latestSpamRate: d.latestSpamRate, latestSpfRatio: d.latestSpfRatio, latestDkimRatio: d.latestDkimRatio, latestDmarcRatio: d.latestDmarcRatio, latestEncryptionRatio: d.latestEncryptionRatio, trafficStats: d.trafficStats });
      }
      await storage.updatePostmasterLastSynced(userId);
      res.json({ success: true, domainsUpdated: domainData.length });
    } catch (err: any) {
      const errMsg: string = err?.message || "";
      const isInsufficientScopes =
        errMsg.toLowerCase().includes("insufficient authentication scopes") ||
        errMsg.toLowerCase().includes("insufficient scope") ||
        err?.response?.status === 403 ||
        err?.code === 403;
      if (isInsufficientScopes) {
        console.error("[Postmaster] Sync failed — token lacks postmaster.readonly scope:", err?.message);
        return res.status(403).json({
          needsReconnect: true,
          message: "Your Google connection is missing the Postmaster permission. Please disconnect and reconnect to grant access.",
        });
      }
      console.error("[Postmaster] Sync error:", err);
      res.status(500).json({ message: "Failed to sync Postmaster data" });
    }
  });

  app.delete("/api/sender-reputation/disconnect", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      await storage.deletePostmasterConnection(userId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to disconnect" });
    }
  });

  // ── Projects (Asana-lite project manager) ──────────────────────────────────

  app.post("/api/projects/import/trello", requireAuth, async (req: Request, res: Response) => {
    try {
      const { trelloData, name: overrideName, color, description } = req.body ?? {};
      if (!trelloData || typeof trelloData !== "object") {
        return res.status(400).json({ message: "Missing or invalid trelloData" });
      }

      const boardName = ((overrideName as string) || (trelloData.name as string) || "Imported Board").trim();
      const boardColor = (color as string) || "#6366f1";
      const boardDesc = (description as string) || (trelloData.desc as string) || "";

      const lists: any[] = Array.isArray(trelloData.lists) ? trelloData.lists : [];
      const cards: any[] = Array.isArray(trelloData.cards) ? trelloData.cards : [];
      const checklists: any[] = Array.isArray(trelloData.checklists) ? trelloData.checklists : [];
      const labels: any[] = Array.isArray(trelloData.labels) ? trelloData.labels : [];
      const actions: any[] = Array.isArray(trelloData.actions) ? trelloData.actions : [];

      const userId = req.session.userId!;

      // 1. Create project
      const project = await storage.createProject(userId, {
        name: boardName,
        description: boardDesc,
        color: boardColor,
        status: "active",
      });

      // 2. Create columns from non-closed lists sorted by pos
      const activeLists = lists
        .filter((l: any) => !l.closed)
        .sort((a: any, b: any) => (a.pos ?? 0) - (b.pos ?? 0));

      const listToColumnId = new Map<string, string>();
      for (let i = 0; i < activeLists.length; i++) {
        const list = activeLists[i];
        const col = await storage.createColumn(userId, project.id, { name: list.name, sortOrder: i });
        listToColumnId.set(list.id, col.id);
      }

      // 3. Build label name lookup
      const labelById = new Map<string, string>();
      for (const label of labels) {
        const labelName = (label.name as string)?.trim() || (label.color as string) || "";
        if (labelName) labelById.set(label.id as string, labelName);
      }

      // 4. Create tasks from non-closed/non-archived cards
      const activeCards = cards
        .filter((c: any) => !c.closed)
        .sort((a: any, b: any) => (a.pos ?? 0) - (b.pos ?? 0));

      const cardToTaskId = new Map<string, string>();
      for (const card of activeCards) {
        const columnId = card.idList ? listToColumnId.get(card.idList as string) ?? null : null;
        const tags: string[] = Array.isArray(card.idLabels)
          ? (card.idLabels as string[]).map((lid) => labelById.get(lid) ?? "").filter(Boolean)
          : [];
        let dueDate: Date | null = null;
        if (card.due) {
          const d = new Date(card.due as string);
          if (!isNaN(d.getTime())) dueDate = d;
        }
        const task = await storage.createTask(userId, project.id, {
          title: (card.name as string) || "Untitled",
          notes: (card.desc as string) || "",
          status: card.dueComplete ? "done" : "todo",
          priority: "none",
          columnId,
          dueDate,
          tags,
          links: [],
          sortOrder: Math.round(card.pos ?? 0),
        });
        cardToTaskId.set(card.id as string, task.id);
      }

      // 5. Create subtasks from checklist items
      for (const checklist of checklists) {
        const parentTaskId = checklist.idCard ? cardToTaskId.get(checklist.idCard as string) : undefined;
        if (!parentTaskId) continue;
        const items: any[] = Array.isArray(checklist.checkItems)
          ? [...checklist.checkItems].sort((a: any, b: any) => (a.pos ?? 0) - (b.pos ?? 0))
          : [];
        for (const item of items) {
          await storage.createTask(userId, project.id, {
            title: (item.name as string) || "Untitled",
            status: item.state === "complete" ? "done" : "todo",
            priority: "none",
            parentTaskId,
            columnId: null,
            notes: "",
            tags: [],
            links: [],
            sortOrder: Math.round(item.pos ?? 0),
          });
        }
      }

      // 6. Import card comments from actions
      const commentActions = actions.filter((a: any) => a.type === "commentCard");
      for (const action of commentActions) {
        const cardId = action.data?.card?.id as string | undefined;
        const text = action.data?.text as string | undefined;
        if (!cardId || !text) continue;
        const taskId = cardToTaskId.get(cardId);
        if (!taskId) continue;
        try {
          await storage.addTaskComment(taskId, userId, text);
        } catch {
          // best-effort — skip if fails
        }
      }

      res.status(201).json({ projectId: project.id, name: project.name });
    } catch (err: any) {
      console.error("[projects] trello import error:", err);
      res.status(500).json({ message: "Failed to import Trello board" });
    }
  });

  // ── Asana CSV import ─────────────────────────────────────────────────────────

  function parseAsanaCSV(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (inQuotes) {
        if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { field += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { row.push(field); field = ""; }
        else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
        else { field += ch; }
      }
    }
    if (field || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
  }

  app.post("/api/projects/import/asana", requireAuth, async (req: Request, res: Response) => {
    try {
      const { csvText, name: overrideName, color } = req.body ?? {};
      if (!csvText || typeof csvText !== "string") {
        return res.status(400).json({ message: "Missing csvText" });
      }

      const rows = parseAsanaCSV(csvText);
      if (rows.length < 2) {
        return res.status(400).json({ message: "CSV appears to be empty" });
      }

      const headers = rows[0].map((h: string) => h.trim().toLowerCase());
      const idx = (...names: string[]) => {
        for (const n of names) { const i = headers.indexOf(n); if (i !== -1) return i; }
        return -1;
      };

      const iName = idx("task name", "name");
      const iSection = idx("section/column", "section", "column");
      const iNotes = idx("notes", "description");
      const iDueDate = idx("due date", "due_date");
      const iTags = idx("tags", "tag");
      const iParent = idx("parent task", "parent_task", "parent");
      const iCompletedAt = idx("completed at", "completed_at", "completed");
      const iPriority = idx("priority");

      if (iName === -1) {
        return res.status(400).json({ message: 'CSV is missing a "Task Name" column. Make sure this is an Asana export (project ⋯ → Export/Print → CSV).' });
      }

      const userId = req.session.userId!;
      const project = await storage.createProject(userId, {
        name: ((overrideName as string) || "Imported from Asana").trim(),
        description: "",
        color: (color as string) || "#f59e0b",
        status: "active",
      });

      const dataRows = rows.slice(1).filter((r: string[]) => r.some((c: string) => c.trim()));

      // Collect unique sections in appearance order (top-level tasks only)
      const sectionOrder: string[] = [];
      const seenSections = new Set<string>();
      for (const row of dataRows) {
        const isSubtask = iParent >= 0 && row[iParent]?.trim();
        if (!isSubtask && iSection >= 0) {
          const sec = (row[iSection] || "").trim().replace(/:$/, "");
          if (sec && !seenSections.has(sec)) { seenSections.add(sec); sectionOrder.push(sec); }
        }
      }

      const sectionToColId = new Map<string, string>();
      for (let i = 0; i < sectionOrder.length; i++) {
        const col = await storage.createColumn(userId, project.id, { name: sectionOrder[i], sortOrder: i });
        sectionToColId.set(sectionOrder[i], col.id);
      }

      const parsePriority = (raw: string) => {
        const p = (raw || "").trim().toLowerCase();
        return p === "high" ? "high" : p === "medium" ? "medium" : p === "low" ? "low" : "none";
      };
      const parseDue = (raw: string): Date | null => {
        if (!raw?.trim()) return null;
        const d = new Date(raw.trim());
        return isNaN(d.getTime()) ? null : d;
      };

      const parentRows = dataRows.filter((r: string[]) => !(iParent >= 0 && r[iParent]?.trim()));
      const subtaskRows = dataRows.filter((r: string[]) => iParent >= 0 && r[iParent]?.trim());

      const taskNameToId = new Map<string, string>();
      for (let i = 0; i < parentRows.length; i++) {
        const row = parentRows[i];
        const title = (row[iName] || "").trim();
        if (!title) continue;
        const sec = iSection >= 0 ? (row[iSection] || "").trim().replace(/:$/, "") : "";
        const columnId = sec ? (sectionToColId.get(sec) ?? null) : null;
        const tags = iTags >= 0 ? (row[iTags] || "").split(",").map((t: string) => t.trim()).filter(Boolean) : [];
        const status = iCompletedAt >= 0 && row[iCompletedAt]?.trim() ? "done" : "todo";
        const task = await storage.createTask(userId, project.id, {
          title,
          notes: iNotes >= 0 ? (row[iNotes] || "") : "",
          status,
          priority: iPriority >= 0 ? parsePriority(row[iPriority]) : "none",
          columnId,
          dueDate: iDueDate >= 0 ? parseDue(row[iDueDate]) : null,
          tags,
          links: [],
          sortOrder: i,
        });
        taskNameToId.set(title.toLowerCase(), task.id);
      }

      for (let i = 0; i < subtaskRows.length; i++) {
        const row = subtaskRows[i];
        const title = (row[iName] || "").trim();
        if (!title) continue;
        const parentName = (row[iParent] || "").trim().toLowerCase();
        const parentTaskId = taskNameToId.get(parentName);
        if (!parentTaskId) continue;
        const tags = iTags >= 0 ? (row[iTags] || "").split(",").map((t: string) => t.trim()).filter(Boolean) : [];
        const status = iCompletedAt >= 0 && row[iCompletedAt]?.trim() ? "done" : "todo";
        await storage.createTask(userId, project.id, {
          title,
          notes: iNotes >= 0 ? (row[iNotes] || "") : "",
          status,
          priority: iPriority >= 0 ? parsePriority(row[iPriority]) : "none",
          parentTaskId,
          columnId: null,
          dueDate: iDueDate >= 0 ? parseDue(row[iDueDate]) : null,
          tags,
          links: [],
          sortOrder: i,
        });
      }

      res.status(201).json({ projectId: project.id, name: project.name });
    } catch (err: any) {
      console.error("[projects] asana import error:", err);
      res.status(500).json({ message: "Failed to import Asana project" });
    }
  });

  app.get("/api/projects", requireAuth, async (req: Request, res: Response) => {
    try {
      const list = await storage.getProjectsForUser(req.session.userId!);
      res.json(list);
    } catch (err) {
      console.error("[projects] list error:", err);
      res.status(500).json({ message: "Failed to load projects" });
    }
  });

  app.post("/api/projects", requireAuth, async (req: Request, res: Response) => {
    try {
      const { templateId, ...rest } = req.body ?? {};
      const data = insertProjectSchema.parse(rest);
      const created = await storage.createProject(req.session.userId!, data);
      if (templateId && typeof templateId === "string") {
        const tpl = await storage.getTemplate(templateId, req.session.userId!);
        if (tpl) {
          await storage.instantiateProjectFromTemplate(req.session.userId!, templateId, created);
        }
      }
      res.status(201).json(created);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid input", errors: err.issues });
      console.error("[projects] create error:", err);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  // ── Project Templates ──────────────────────────────────────────────────────

  app.get("/api/project-templates", requireAuth, async (req: Request, res: Response) => {
    try {
      const list = await storage.getTemplatesForUser(req.session.userId!);
      res.json(list);
    } catch (err) {
      console.error("[templates] list error:", err);
      res.status(500).json({ message: "Failed to load templates" });
    }
  });

  app.post("/api/project-templates", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertProjectTemplateSchema.parse(req.body);
      const created = await storage.createTemplate(req.session.userId!, data);
      res.status(201).json(created);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid input", errors: err.issues });
      console.error("[templates] create error:", err);
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  app.get("/api/project-templates/:id", requireAuth, async (req: Request, res: Response) => {
    const tpl = await storage.getTemplate(req.params.id, req.session.userId!);
    if (!tpl) return res.status(404).json({ message: "Not found" });
    res.json(tpl);
  });

  app.patch("/api/project-templates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertProjectTemplateSchema.partial().parse(req.body);
      const updated = await storage.updateTemplate(req.params.id, req.session.userId!, data);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid input", errors: err.issues });
      console.error("[templates] update error:", err);
      res.status(500).json({ message: "Failed to update template" });
    }
  });

  app.delete("/api/project-templates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const tpl = await storage.getTemplate(req.params.id, req.session.userId!);
      if (!tpl) return res.status(404).json({ message: "Not found" });
      await storage.deleteTemplate(req.params.id, req.session.userId!);
      res.json({ ok: true });
    } catch (err) {
      console.error("[templates] delete error:", err);
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  app.post("/api/project-templates/:id/duplicate", requireAuth, async (req: Request, res: Response) => {
    try {
      const copy = await storage.duplicateTemplate(req.params.id, req.session.userId!);
      if (!copy) return res.status(404).json({ message: "Not found" });
      res.status(201).json(copy);
    } catch (err) {
      console.error("[templates] duplicate error:", err);
      res.status(500).json({ message: "Failed to duplicate template" });
    }
  });

  app.get("/api/project-templates/:id/tasks", requireAuth, async (req: Request, res: Response) => {
    const tpl = await storage.getTemplate(req.params.id, req.session.userId!);
    if (!tpl) return res.status(404).json({ message: "Not found" });
    const tasks = await storage.getTemplateTasks(req.params.id, req.session.userId!);
    res.json(tasks);
  });

  app.post("/api/project-templates/:id/tasks", requireAuth, async (req: Request, res: Response) => {
    try {
      const tpl = await storage.getTemplate(req.params.id, req.session.userId!);
      if (!tpl) return res.status(404).json({ message: "Not found" });
      const data = insertProjectTemplateTaskSchema.parse(req.body);
      const created = await storage.createTemplateTask(req.session.userId!, req.params.id, data);
      res.status(201).json(created);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid input", errors: err.issues });
      if (err?.message?.startsWith("Invalid parent") || err?.message?.startsWith("Subtasks")) {
        return res.status(400).json({ message: err.message });
      }
      console.error("[templates] create task error:", err);
      res.status(500).json({ message: "Failed to create template task" });
    }
  });

  app.patch("/api/template-tasks/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = updateProjectTemplateTaskSchema.parse(req.body);
      const updated = await storage.updateTemplateTask(req.params.id, req.session.userId!, data);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid input", errors: err.issues });
      if (err?.message?.startsWith("Invalid parent") || err?.message?.includes("subtask") || err?.message?.includes("own parent")) {
        return res.status(400).json({ message: err.message });
      }
      console.error("[templates] update task error:", err);
      res.status(500).json({ message: "Failed to update template task" });
    }
  });

  app.delete("/api/template-tasks/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteTemplateTask(req.params.id, req.session.userId!);
      res.json({ ok: true });
    } catch (err) {
      console.error("[templates] delete task error:", err);
      res.status(500).json({ message: "Failed to delete template task" });
    }
  });

  app.post("/api/projects/:id/save-as-template", requireAuth, async (req: Request, res: Response) => {
    try {
      const project = await storage.getProject(req.params.id, req.session.userId!);
      if (!project) return res.status(404).json({ message: "Not found" });
      const name = typeof req.body?.name === "string" ? req.body.name : project.name;
      const tpl = await storage.snapshotProjectAsTemplate(req.session.userId!, req.params.id, name);
      res.status(201).json(tpl);
    } catch (err) {
      console.error("[templates] snapshot error:", err);
      res.status(500).json({ message: "Failed to save as template" });
    }
  });

  // ── Project Board Columns ─────────────────────────────────────────────────

  app.get("/api/projects/:id/columns", requireAuth, async (req: Request, res: Response) => {
    try {
      const project = await storage.getProject(req.params.id, req.session.userId!);
      if (!project) return res.status(404).json({ message: "Not found" });
      const columns = await storage.seedColumnsForProject(req.params.id, req.session.userId!);
      res.json(columns);
    } catch (err) {
      console.error("[columns] list error:", err);
      res.status(500).json({ message: "Failed to load columns" });
    }
  });

  app.post("/api/projects/:id/columns", requireAuth, async (req: Request, res: Response) => {
    try {
      const project = await storage.getProject(req.params.id, req.session.userId!);
      if (!project) return res.status(404).json({ message: "Not found" });
      const data = insertProjectColumnSchema.parse(req.body);
      const created = await storage.createColumn(req.session.userId!, req.params.id, data);
      res.status(201).json(created);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid input", errors: err.issues });
      console.error("[columns] create error:", err);
      res.status(500).json({ message: "Failed to create column" });
    }
  });

  app.patch("/api/project-columns/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertProjectColumnSchema.partial().parse(req.body);
      const updated = await storage.updateColumn(req.params.id, req.session.userId!, data);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid input", errors: err.issues });
      console.error("[columns] update error:", err);
      res.status(500).json({ message: "Failed to update column" });
    }
  });

  app.delete("/api/project-columns/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.deleteColumn(req.params.id, req.session.userId!);
      res.json({ ok: true });
    } catch (err) {
      console.error("[columns] delete error:", err);
      res.status(500).json({ message: "Failed to delete column" });
    }
  });

  app.get("/api/projects/urgent-tasks", requireAuth, async (req: Request, res: Response) => {
    try {
      const tasks = await storage.getUrgentTasksForUser(req.session.userId!, 48);
      res.json(tasks);
    } catch (err) {
      console.error("[projects] urgent-tasks error:", err);
      res.status(500).json({ message: "Failed to load urgent tasks" });
    }
  });

  app.get("/api/projects/all-tasks", requireAuth, async (req: Request, res: Response) => {
    try {
      const tasks = await storage.getAllOpenTasksForUser(req.session.userId!);
      res.json(tasks);
    } catch (err) {
      console.error("[projects] all-tasks error:", err);
      res.status(500).json({ message: "Failed to load tasks" });
    }
  });

  app.get("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    const project = await storage.getProject(req.params.id, req.session.userId!);
    if (!project) return res.status(404).json({ message: "Not found" });
    res.json(project);
  });

  app.patch("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertProjectSchema.partial().parse(req.body);
      const updated = await storage.updateProject(req.params.id, req.session.userId!, data);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid input", errors: err.issues });
      console.error("[projects] update error:", err);
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const project = await storage.getProject(req.params.id, req.session.userId!);
      if (!project) return res.status(404).json({ message: "Not found" });
      await storage.deleteProject(req.params.id, req.session.userId!);
      res.json({ ok: true });
    } catch (err) {
      console.error("[projects] delete error:", err);
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  app.get("/api/projects/:id/tasks", requireAuth, async (req: Request, res: Response) => {
    const project = await storage.getProject(req.params.id, req.session.userId!);
    if (!project) return res.status(404).json({ message: "Not found" });
    const tasks = await storage.getTasksForProject(req.params.id, req.session.userId!);
    res.json(tasks);
  });

  app.post("/api/projects/:id/tasks", requireAuth, async (req: Request, res: Response) => {
    try {
      const project = await storage.getProject(req.params.id, req.session.userId!);
      if (!project) return res.status(404).json({ message: "Not found" });
      const data = insertProjectTaskSchema.parse({ ...req.body, projectId: req.params.id });
      const created = await storage.createTask(req.session.userId!, req.params.id, data);
      res.status(201).json(created);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid input", errors: err.issues });
      if (err?.message?.startsWith("Invalid parent") || err?.message?.startsWith("Subtasks")) {
        return res.status(400).json({ message: err.message });
      }
      console.error("[projects] create task error:", err);
      res.status(500).json({ message: "Failed to create task" });
    }
  });

  app.patch("/api/tasks/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = updateProjectTaskSchema.parse(req.body);
      const updated = await storage.updateTask(req.params.id, req.session.userId!, data);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid input", errors: err.issues });
      if (err?.message?.startsWith("Invalid parent") || err?.message?.includes("subtask") || err?.message?.includes("own parent")) {
        return res.status(400).json({ message: err.message });
      }
      console.error("[projects] update task error:", err);
      res.status(500).json({ message: "Failed to update task" });
    }
  });

  app.delete("/api/tasks/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const task = await storage.getTask(req.params.id, req.session.userId!);
      if (!task) return res.status(404).json({ message: "Not found" });
      await storage.deleteTask(req.params.id, req.session.userId!);
      res.json({ ok: true });
    } catch (err) {
      console.error("[projects] delete task error:", err);
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  app.get("/api/tasks/:id/comments", requireAuth, async (req: Request, res: Response) => {
    try {
      const task = await storage.getTask(req.params.id, req.session.userId!);
      if (!task) return res.status(404).json({ message: "Not found" });
      const comments = await storage.getTaskComments(req.params.id, req.session.userId!);
      res.json(comments);
    } catch (err) {
      console.error("[projects] list comments error:", err);
      res.status(500).json({ message: "Failed to load comments" });
    }
  });

  app.post("/api/tasks/:id/comments", requireAuth, async (req: Request, res: Response) => {
    try {
      const task = await storage.getTask(req.params.id, req.session.userId!);
      if (!task) return res.status(404).json({ message: "Not found" });
      const data = insertTaskCommentSchema.parse(req.body);
      const created = await storage.addTaskComment(req.params.id, req.session.userId!, data.body);
      res.status(201).json(created);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid input", errors: err.issues });
      console.error("[projects] add comment error:", err);
      res.status(500).json({ message: "Failed to add comment" });
    }
  });

  app.patch("/api/tasks/:taskId/comments/:commentId", requireAuth, async (req: Request, res: Response) => {
    try {
      const task = await storage.getTask(req.params.taskId, req.session.userId!);
      if (!task) return res.status(404).json({ message: "Not found" });
      const data = updateTaskCommentSchema.parse(req.body);
      const updated = await storage.updateTaskComment(req.params.taskId, req.params.commentId, req.session.userId!, data.body);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid input", errors: err.issues });
      console.error("[projects] update comment error:", err);
      res.status(500).json({ message: "Failed to update comment" });
    }
  });

  app.delete("/api/tasks/:taskId/comments/:commentId", requireAuth, async (req: Request, res: Response) => {
    try {
      const task = await storage.getTask(req.params.taskId, req.session.userId!);
      if (!task) return res.status(404).json({ message: "Not found" });
      const ok = await storage.deleteTaskComment(req.params.taskId, req.params.commentId, req.session.userId!);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ ok: true });
    } catch (err) {
      console.error("[projects] delete comment error:", err);
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });

  app.get("/api/tasks/:id/activity", requireAuth, async (req: Request, res: Response) => {
    try {
      const task = await storage.getTask(req.params.id, req.session.userId!);
      if (!task) return res.status(404).json({ message: "Not found" });
      const activity = await storage.getTaskActivity(req.params.id, req.session.userId!);
      res.json(activity);
    } catch (err) {
      console.error("[projects] list activity error:", err);
      res.status(500).json({ message: "Failed to load activity" });
    }
  });

  // ── Task Attachments ────────────────────────────────────────────────────────

  const ATTACHMENT_MAX_SIZE = 25 * 1024 * 1024; // 25 MB
  const ATTACHMENT_MAX_COUNT = 10;
  const ATTACHMENT_ALLOWED_TYPES = new Set([
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain", "text/csv",
  ]);

  app.post("/api/tasks/:id/attachments/request-url", requireAuth, async (req: Request, res: Response) => {
    try {
      const task = await storage.getTask(req.params.id, req.session.userId!);
      if (!task) return res.status(404).json({ message: "Task not found" });
      const { filename, mimeType, size } = req.body ?? {};
      if (!filename || !mimeType || !size) {
        return res.status(400).json({ message: "filename, mimeType, and size are required" });
      }
      if (Number(size) > ATTACHMENT_MAX_SIZE) {
        return res.status(400).json({ message: "File too large. Maximum is 25 MB." });
      }
      if (!ATTACHMENT_ALLOWED_TYPES.has(String(mimeType))) {
        return res.status(400).json({ message: "File type not allowed." });
      }
      const existing = await storage.getTaskAttachments(req.params.id, req.session.userId!);
      if (existing.length >= ATTACHMENT_MAX_COUNT) {
        return res.status(400).json({ message: `Maximum ${ATTACHMENT_MAX_COUNT} attachments per task.` });
      }
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadUrl: uploadURL, objectPath });
    } catch (err: any) {
      console.error("[attachments] request-url error:", err);
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  app.post("/api/tasks/:id/attachments", requireAuth, async (req: Request, res: Response) => {
    try {
      const task = await storage.getTask(req.params.id, req.session.userId!);
      if (!task) return res.status(404).json({ message: "Task not found" });
      const { objectPath, filename, mimeType, size } = req.body ?? {};
      if (!objectPath || !filename || !mimeType || !size) {
        return res.status(400).json({ message: "objectPath, filename, mimeType, and size are required" });
      }
      if (!String(objectPath).startsWith("/objects/")) {
        return res.status(400).json({ message: "Invalid objectPath" });
      }
      if (Number(size) > ATTACHMENT_MAX_SIZE) {
        return res.status(400).json({ message: "File too large." });
      }
      if (!ATTACHMENT_ALLOWED_TYPES.has(String(mimeType))) {
        return res.status(400).json({ message: "File type not allowed." });
      }
      const existing = await storage.getTaskAttachments(req.params.id, req.session.userId!);
      if (existing.length >= ATTACHMENT_MAX_COUNT) {
        return res.status(400).json({ message: `Maximum ${ATTACHMENT_MAX_COUNT} attachments per task.` });
      }
      const attachment = await storage.createTaskAttachment(req.params.id, req.session.userId!, {
        objectPath: String(objectPath),
        filename: String(filename).slice(0, 255),
        mimeType: String(mimeType).slice(0, 100),
        size: Number(size),
      });
      res.status(201).json(attachment);
    } catch (err: any) {
      console.error("[attachments] confirm error:", err);
      res.status(500).json({ message: "Failed to save attachment" });
    }
  });

  app.get("/api/tasks/:id/attachments", requireAuth, async (req: Request, res: Response) => {
    try {
      const task = await storage.getTask(req.params.id, req.session.userId!);
      if (!task) return res.status(404).json({ message: "Task not found" });
      const list = await storage.getTaskAttachments(req.params.id, req.session.userId!);
      res.json(list);
    } catch (err) {
      console.error("[attachments] list error:", err);
      res.status(500).json({ message: "Failed to load attachments" });
    }
  });

  app.get("/api/attachments/:id/download", requireAuth, async (req: Request, res: Response) => {
    try {
      const att = await storage.getTaskAttachment(req.params.id, req.session.userId!);
      if (!att) return res.status(404).json({ message: "Not found" });
      res.setHeader("Content-Disposition", `attachment; filename="${att.filename.replace(/"/g, '\\"')}"`);
      const objectFile = await objectStorageService.getObjectEntityFile(att.objectPath);
      await objectStorageService.downloadObject(objectFile, res, 0);
    } catch (err) {
      console.error("[attachments] download error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Failed to download" });
    }
  });

  app.delete("/api/attachments/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const deleted = await storage.deleteTaskAttachment(req.params.id, req.session.userId!);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      try {
        await objectStorageService.deleteObject(deleted.objectPath);
      } catch (e) {
        console.warn("[attachments] GCS delete failed (non-fatal):", e);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[attachments] delete error:", err);
      res.status(500).json({ message: "Failed to delete attachment" });
    }
  });

  app.get("/api/dashboard/projects", requireAuth, async (req: Request, res: Response) => {
    try {
      const summary = await storage.getDashboardProjectsSummary(req.session.userId!);
      res.json(summary);
    } catch (err) {
      console.error("[projects] dashboard summary error:", err);
      res.status(500).json({ message: "Failed to load summary" });
    }
  });

  // Start the automatic placement monitoring scheduler
  startPlacementScheduler(storage);

  return httpServer;
}
