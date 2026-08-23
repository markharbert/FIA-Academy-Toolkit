import { z } from "zod";
import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { transcribeAudio, transcribeAudioWhisper, scoreTranscript, generateTitle, generateDmoSummary, generateBulletPoints } from "./ai";
import { convertToMp4, generateThumbnail, extractAudio, probeVideo, faststartMp4, prepareTeleprompterMp4, SUPPORTED_VIDEO_EXTENSIONS, SUPPORTED_VIDEO_MIMETYPES } from "./ffmpeg";
import { signupSchema, loginSchema, goalTypes, type GoalType, forgotPasswordSchema, resetPasswordSchema, type AuthProvider, updateAccountSchema, dmoEntryDataSchema, type CompetitorSeedAddress, insertProjectSchema, insertProjectTaskSchema, updateProjectTaskSchema, insertTaskCommentSchema, updateTaskCommentSchema, insertProjectTemplateSchema, insertProjectTemplateTaskSchema, updateProjectTemplateTaskSchema, insertProjectColumnSchema, insertCannedResponseSchema, insertAnnouncementSchema, insertAffiliateLinkSchema } from "@shared/schema";
import { safeTimezone, todayKeyInTz, dueHasTime } from "@shared/datetime";
import bcrypt from "bcrypt";
import crypto from "crypto";
import multer from "multer";
import rateLimit from "express-rate-limit";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { sendPasswordResetEmail, sendWorkspaceInviteEmail, sendWelcomeEmail, sendMembershipLapsedEmail, sendGraceExpiryWarningEmail, isEmailConfigured } from "./email";
import path from "path";
import fs from "fs";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool, db } from "./db";
import { sql } from "drizzle-orm";
import { logUserAction, ActionLabels } from "./userActionLog";
import * as emailTemplates from "./email-templates";
import { processSession, subscribeToSession } from "./processing";
import { generateSessionPdfBuffer } from "./pdf";
import { ObjectStorageService } from "./replit_integrations/object_storage";
import { isValidYouTubeUrl, extractYouTubeVideoId, downloadYouTubeAudio } from "./youtube";
import { getGmailAuthUrl, exchangeGmailCode, checkGmailPlacement, type PlacementResult } from "./gmailOAuth";
import { getPostmasterAuthUrl, exchangePostmasterCode, fetchPostmasterData } from "./postmaster";
import { getYouTubeAuthUrl, exchangeYouTubeCode, fetchYouTubeChannel, fetchYouTubeVideos, fetchChannelAnalytics, fetchTrafficSources, fetchDeviceBreakdown, fetchTopCountries, fetchVideoAnalytics, fetchDemographics, fetchTopSearchTerms, fetchSubscriberStatus, fetchVideoComments, postCommentReply, fetchVideoMetadata, bulkUpdateVideo } from "./youtubeAnalytics";
import { getGscAuthUrl, exchangeGscCode, fetchGscSites, fetchGscData, fetchGscPageKeywords, inspectGscUrl } from "./searchConsole";
import { startPlacementScheduler } from "./placementScheduler";
import { fireWebhooks } from "./webhooks";
import { formatSwipeListResponse } from "./swipe-api";
import { safeNormalizeWebsite } from "./inboxIntelScreenshots";
import { hasExactIds } from "@shared/course-structure";
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
import { listCfCourses, listCfDownloads, getCfCourseStructure, extractVimeoUrl, type CfTreeNode } from "./cf-import-client";
import { listVimeoProjects, listVimeoVideos, extractVimeoVideoId, listVimeoTextTracks, fetchVimeoTranscript } from "./vimeo";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

async function fetchMicrolinkScreenshotUrl(url: string): Promise<string | null> {
  try {
    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const json = await res.json() as any;
    return json?.data?.screenshot?.url ?? null;
  } catch {
    return null;
  }
}
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const SCREENSHOTS_DIR = path.join(process.cwd(), "uploads", "feedback-screenshots");
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const MAX_RETRANSCRIBES_PER_DAY = 3;

// Ensure upload directories exist
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer for bug report screenshots (images only, 5MB max)
const screenshotUpload = multer({
  storage: multer.diskStorage({
    destination: SCREENSHOTS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".png";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed for screenshots"));
  },
});

// Dedicated multer for teleprompter recording chunks — no fileFilter so any
// MIME type (including codec-qualified types like video/mp4;codecs=avc1) is accepted.
const chunkUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, _file, cb) => {
      cb(null, `chunk-tmp-${Date.now()}-${Math.round(Math.random() * 1e9)}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per chunk (generous cap)
});

// Dedicated multer for the public inbound email webhook.
// All limits are set before any recipient-token validation so an unauthenticated
// caller cannot exhaust heap by sending large or numerous multipart fields.
const inboundUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1 * 1024 * 1024, // 1 MB per attached file
    files: 5,                   // max attached files
    fields: 30,                 // max non-file form fields
    fieldSize: 64 * 1024,       // 64 KB per text field value
    parts: 35,                  // total parts (fields + files combined)
  },
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
    workspaceOwnerId: string;
  }
}

declare module "express-serve-static-core" {
  interface Request {
    effectiveUserId: string;
  }
}

// Returns the workspace owner's userId when the current session is a
// collaborator, otherwise returns the logged-in user's own userId.
function getEffectiveUserId(req: Request): string {
  return req.session.workspaceOwnerId ?? req.session.userId!;
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
    // Workspace collaborators get a pass on CF enrollment checks — the owner's
    // membership is what matters. Verify the invite is still active.
    const isCollaborator = !!req.session.workspaceOwnerId;

    if (!isImpersonating && user.isDisabled) {
      req.session.destroy(() => {});
      return res.status(403).json({ message: "Account is disabled" });
    }

    if (isCollaborator) {
      const invite = await storage.getActiveInviteForMember(req.session.userId!, req.session.workspaceOwnerId!);
      if (!invite) {
        req.session.destroy(() => {});
        return res.status(403).json({ message: "Workspace access has been revoked" });
      }
      // The collaborator's access is only as valid as the owner's membership.
      // If the owner loses their CF enrollment or is disabled, cut the collaborator
      // off immediately — they are tied to that account.
      const owner = await storage.getUser(req.session.workspaceOwnerId!);
      if (!owner || owner.isDisabled) {
        req.session.destroy(() => {});
        return res.status(403).json({ message: "Workspace access has been revoked" });
      }
      if (process.env.CF_API_TOKEN && process.env.CF_COURSE_ID && owner.cfEnrolled !== true) {
        const ownerInGrace =
          owner.cfRevokedGraceUntil &&
          new Date(owner.cfRevokedGraceUntil) > new Date();
        if (!ownerInGrace) {
          req.session.destroy(() => {});
          return res.status(403).json({ message: "Workspace access has been revoked" });
        }
      }
    } else if (!isImpersonating && process.env.CF_API_TOKEN && process.env.CF_COURSE_ID && !user.isAdmin) {
      // When CF is configured, enforce active membership on every authenticated
      // request so revoked members are denied mid-session without waiting for
      // their session to naturally expire. Admins are always exempt.
      if (user.cfEnrolled !== true) {
        // If the member is within their revocation grace window, let the request
        // through — their payment may still succeed during the retry window.
        const inGrace =
          user.cfRevokedGraceUntil &&
          new Date(user.cfRevokedGraceUntil) > new Date();
        if (!inGrace) {
          req.session.destroy(() => {});
          return res.status(403).json({
            message: "Active ClickFunnels membership required",
            error: "cf_not_enrolled",
          });
        }
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
  
  // Session timeout: 7 days of inactivity
  // Rolling sessions extend the timeout on each request
  const SESSION_INACTIVITY_TIMEOUT = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  
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
      secret: (() => {
        const s = process.env.SESSION_SECRET;
        if (!s) throw new Error("SESSION_SECRET environment variable is required but not set");
        return s;
      })(),
      resave: true,
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

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many attempts, please try again later." },
  });

  const apiV1Limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Rate limit exceeded. Please slow down your requests." },
  });

  // Per-user rate limiter for expensive video-ingestion routes (YouTube, upload,
  // presign).  Keyed on session userId so that one member cannot flood the pipeline
  // by rotating IP addresses.  Falls back to IP when no session exists (should not
  // normally happen on authenticated routes, but ensures the limiter never crashes).
  const videoIngestionLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => String(req.session?.userId ?? "anonymous"),
    message: { message: "You have submitted too many videos in a short period. Please wait a few minutes before trying again." },
  });

  app.post("/api/auth/signup", authLimiter, async (req: Request, res: Response) => {
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

      await new Promise<void>((resolve, reject) =>
        req.session.regenerate(err => (err ? reject(err) : resolve()))
      );
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

  app.post("/api/auth/login", authLimiter, async (req: Request, res: Response) => {
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

      // Check if this user is an active workspace collaborator.
      // Collaborators bypass the CF enrollment check — the owner's membership
      // is what matters, not theirs. We also stamp workspaceOwnerId onto the
      // session here so requireAuth recognises them as a collaborator going forward.
      const collaboratorOwnerId = await storage.getCollaboratorOwner(user.id);
      const isCollaborator = !!collaboratorOwnerId;

      // If ClickFunnels is configured, verify active membership via live CF API
      // for non-admin, non-collaborator users.
      if (!isCollaborator && CF_API_TOKEN && CF_COURSE_ID && !user.isAdmin) {
        try {
          const cfInfo = await checkCfEnrollmentByEmail(email, user.cfContactId ?? undefined);
          if (!cfInfo.enrolled) {
            console.warn(`[Login] CF live check: not enrolled — ${email}`);
            await storage.updateUser(user.id, { cfEnrolled: false, cfRevokedAt: new Date() });
            return res.status(403).json({
              message: "Your Fearless Influencer Academy membership is not active. Please check your membership and try again.",
              error: "cf_not_enrolled",
            });
          }
          // Sync latest CF data back to local DB
          await storage.updateUser(user.id, {
            cfEnrolled: true,
            cfRevokedAt: null,
            cfContactId: cfInfo.contactId ?? user.cfContactId,
          });
          console.log(`[Login] CF live check passed for ${email}`);
        } catch (cfErr: any) {
          console.error(`[Login] CF API check failed, falling back to local DB: ${cfErr?.message}`);
          // CF API is down — fall back to locally-synced status
          if (user.cfEnrolled === false) {
            return res.status(403).json({
              message: "Your membership has been revoked. Please reactivate your Fearless Influencer Academy membership to continue.",
              error: "cf_revoked",
            });
          }
          if (user.cfEnrolled !== true) {
            return res.status(403).json({
              message: "We couldn't verify your membership right now. Please try again in a moment.",
              error: "cf_api_error",
            });
          }
        }
      }

      await new Promise<void>((resolve, reject) =>
        req.session.regenerate(err => (err ? reject(err) : resolve()))
      );
      req.session.userId = user.id;
      if (collaboratorOwnerId) {
        req.session.workspaceOwnerId = collaboratorOwnerId;
      }

      // Update last login timestamp
      await storage.updateUser(user.id, { lastLoginAt: new Date() });
      
      // Log successful login
      logUserAction({
        userId: user.id,
        actionType: "login_success",
        actionLabel: ActionLabels.login_success,
        entityType: "auth",
        metadata: { method: "email", isCollaborator },
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
          workspaceOwnerId: collaboratorOwnerId ?? null,
          isCollaborator,
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

  // Public: serve brand logo (used in email templates)
  app.get("/lion-logo.png", (_req: Request, res: Response) => {
    const imgPath = path.join(process.cwd(), "client", "public", "lion-logo.png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.sendFile(imgPath);
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

    // Workspace collaborator context
    const workspaceOwnerId = req.session.workspaceOwnerId ?? null;
    const isCollaborator = !!workspaceOwnerId;
    
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
        workspaceOwnerId,
        isCollaborator,
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

  // ── Magic Link Login ─────────────────────────────────────────────────────────
  const MAGIC_LINK_EXPIRY_MINUTES = 20;
  const MAX_MAGIC_LINK_REQUESTS_PER_15MIN = 3;

  // POST: Request a magic link (member email login)
  app.post("/api/auth/request-magic-link", async (req: Request, res: Response) => {
    try {
      const { email: rawEmail } = req.body;
      const email = (rawEmail || "").trim().toLowerCase();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "invalid_email", message: "Please enter a valid email address." });
      }

      const successMessage = "If this email is linked to an active membership, a login link has been sent. Check your inbox — it expires in 20 minutes.";

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.json({ message: successMessage });
      }

      if (user.isDisabled) {
        return res.status(403).json({ error: "account_disabled", message: "This account has been disabled. Please contact support." });
      }

      // Rate limit: max 3 requests per user per 15 min
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
      const recentCount = await storage.countRecentMagicLinkRequests(user.id, fifteenMinAgo);
      if (recentCount >= MAX_MAGIC_LINK_REQUESTS_PER_15MIN) {
        return res.status(429).json({ error: "rate_limited", message: "Too many login requests. Please wait 15 minutes and try again." });
      }

      // Verify active CF membership when CF is configured
      if (CF_API_TOKEN && CF_COURSE_ID) {
        let cfInfo: CfContactInfo;
        try {
          cfInfo = await checkCfEnrollmentByEmail(email, (user as any).cfContactId ?? undefined);
        } catch (err: any) {
          console.error("[MagicLink] CF API error:", err?.message);
          return res.status(502).json({ error: "cf_api_error", message: "We couldn't verify your membership right now. Please try again in a moment." });
        }

        if (!cfInfo.enrolled) {
          console.warn(`[MagicLink] not enrolled: ${email}`);
          return res.status(403).json({
            error: "cf_not_enrolled",
            message: "We couldn't verify an active membership for this email. If you believe this is an error, please contact support@markharbert.com.",
          });
        }
      }

      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000);

      await storage.createMagicLinkToken({ userId: user.id, tokenHash, expiresAt });

      const APP_ML_BASE = process.env.APP_BASE_URL || "https://toolkit.fearlessmarketinglab.com";
      const loginUrl = `${APP_ML_BASE}/api/auth/magic-link?token=${token}`;
      const tpl = emailTemplates.magicLinkLoginEmail({
        firstName: (user as any).firstName ?? null,
        loginUrl,
        expiresAt,
      });
      const { sendEmail: sendMagicLinkEmail } = await import("./email-sendgrid");
      await sendMagicLinkEmail({ to: email, ...tpl });

      console.log(`[MagicLink] login link sent to ${email}`);
      res.json({ message: successMessage });
    } catch (err: any) {
      console.error("[MagicLink] request error:", err?.message);
      res.status(500).json({ error: "server_error", message: "Something went wrong. Please try again." });
    }
  });

  // GET: Validate magic link token, create session, redirect to dashboard
  app.get("/api/auth/magic-link", async (req: Request, res: Response) => {
    const APP_ML_BASE = process.env.APP_BASE_URL || "https://toolkit.fearlessmarketinglab.com";
    try {
      const { token } = req.query;
      if (!token || typeof token !== "string") {
        return res.redirect(`${APP_ML_BASE}/member-login?error=invalid_token`);
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const magicToken = await storage.getMagicLinkTokenByHash(tokenHash);

      if (!magicToken) {
        return res.redirect(`${APP_ML_BASE}/member-login?error=invalid_token`);
      }

      if (magicToken.usedAt) {
        return res.redirect(`${APP_ML_BASE}/member-login?error=already_used`);
      }

      if (new Date() > new Date(magicToken.expiresAt)) {
        return res.redirect(`${APP_ML_BASE}/member-login?error=expired`);
      }

      const user = await storage.getUser(magicToken.userId);
      if (!user || user.isDisabled) {
        return res.redirect(`${APP_ML_BASE}/member-login?error=invalid_token`);
      }

      await storage.markMagicLinkTokenUsed(magicToken.id);

      req.session.regenerate((err) => {
        if (err) {
          console.error("[MagicLink] session regeneration error:", err);
          return res.redirect(`${APP_ML_BASE}/member-login?error=server_error`);
        }
        req.session.userId = user.id;
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[MagicLink] session save error:", saveErr);
            return res.redirect(`${APP_ML_BASE}/member-login?error=server_error`);
          }
          console.log(`[MagicLink] session created for user ${user.id} (${user.email})`);
          res.redirect(`${APP_ML_BASE}/dashboard`);
        });
      });
    } catch (err: any) {
      console.error("[MagicLink] verify error:", err?.message);
      res.redirect(`${APP_ML_BASE}/member-login?error=server_error`);
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
          return res.redirect("/?error=oauth_failed&reason=auth_error");
        }
        
        if (!user) {
          console.error("[OAuth Google] No user returned from strategy, info:", JSON.stringify(info));
          return res.redirect("/?error=oauth_failed&reason=no_user");
        }

        if (user.isDisabled) {
          console.warn("[OAuth Google] Login attempt by disabled user:", user.id);
          return res.redirect("/?error=account_disabled");
        }

        // If ClickFunnels is configured, require active membership for non-admin users.
        if (CF_API_TOKEN && CF_COURSE_ID && !user.isAdmin) {
          if (user.cfEnrolled === false) {
            console.warn("[OAuth Google] CF membership revoked for user:", user.id);
            return res.redirect("/?error=cf_revoked");
          }
          if (user.cfEnrolled !== true) {
            console.warn("[OAuth Google] CF enrollment not confirmed for user:", user.id);
            return res.redirect("/?error=cf_not_enrolled");
          }
        }
        
        // Set session and save before redirect
        console.log("[OAuth Google] Setting session for user:", user.id);
        req.session.userId = user.id;
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[OAuth Google] Session save error:", saveErr);
            return res.redirect("/?error=oauth_failed&reason=session_save");
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
      res.redirect("/?error=oauth_not_configured");
    });
    app.get("/api/auth/oauth/google/callback", (req: Request, res: Response) => {
      res.redirect("/?error=oauth_not_configured");
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
      // Collect raw body for HMAC verification.
      // Two guards prevent unauthenticated DoS on this public endpoint:
      //   1. Absolute 30-second wall-clock deadline (global setTimeout, not
      //      req.setTimeout which is an inactivity timer). Fires regardless of
      //      whether bytes are still arriving — closes the socket even if an
      //      attacker drip-feeds chunks below the inactivity threshold.
      //   2. 1 MB body cap — abort immediately if cumulative body size exceeds
      //      this limit before the signature is ever verified.
      const MAX_CF_BODY = 1 * 1024 * 1024; // 1 MB
      let rawBody = "";
      let byteCount = 0;
      let aborted = false;

      // Absolute wall-clock deadline: destroy the socket 30 s after the
      // middleware is entered, regardless of ongoing data events.
      const deadline = setTimeout(() => {
        if (!aborted) {
          aborted = true;
          if (!res.headersSent) {
            res.status(408).json({ message: "Request timeout" });
          }
          req.destroy();
        }
      }, 30_000);
      // Always clear the timer so it does not prevent process exit.
      req.on("close", () => clearTimeout(deadline));

      req.setEncoding("utf8");
      req.on("data", (chunk: string) => {
        if (aborted) return;
        byteCount += Buffer.byteLength(chunk, "utf8");
        if (byteCount > MAX_CF_BODY) {
          aborted = true;
          clearTimeout(deadline);
          res.status(413).json({ message: "Request body too large" });
          req.destroy();
          return;
        }
        rawBody += chunk;
      });
      req.on("end", () => {
        if (aborted) return;
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

        // New enrollment: send welcome email with a 7-day password setup link
        if (result.action === "created" && result.email) {
          try {
            const newUser = await storage.getUserByEmail(result.email);
            if (newUser) {
              const token = crypto.randomBytes(32).toString("hex");
              const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
              const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
              await storage.createPasswordResetToken({
                userId: newUser.id,
                tokenHash,
                expiresAt,
                requestIp: "cf-webhook",
                userAgent: "cf-enrollment",
              });
              const APP_BASE = process.env.APP_BASE_URL || "https://toolkit.fearlessmarketinglab.com";
              const setupLink = `${APP_BASE}/reset-password?token=${token}&welcome=1`;
              const resources = await storage.getActiveEmailResourceLinks();
              await sendWelcomeEmail({
                email: newUser.email,
                firstName: newUser.firstName,
                setupLink,
                resources,
              });
            }
          } catch (emailErr: any) {
            console.error("[CF Webhook] Failed to send welcome email:", emailErr?.message);
          }
        }

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

  // ─── Email Template Helpers ───────────────────────────────────────────────────

  function buildDefaultTemplateMap(resources: emailTemplates.EmailResourceLink[] = []): Record<string, () => { subject: string; html: string; text: string }> {
    const sample = { firstName: "Mark", email: "mark@example.com" };
    return {
      taskDueReminders: () => emailTemplates.taskDueReminderEmail({
        firstName: sample.firstName,
        tasks: [
          { title: "Record intro video", projectName: "Video Project", dueDate: "Tomorrow" },
          { title: "Write email sequence", projectName: "Blog project", dueDate: "In 2 days" },
        ],
      }, resources),
      overdueAlerts: () => emailTemplates.overdueAlertEmail({
        firstName: sample.firstName,
        tasks: [
          { title: "Review analytics", projectName: "Blog project", daysOverdue: 3 },
          { title: "Update lead magnet", projectName: "Video Project", daysOverdue: 1 },
        ],
      }, resources),
      projectDueReminders: () => emailTemplates.projectDueReminderEmail({
        firstName: sample.firstName,
        projectName: "Video Project",
        daysLeft: 3,
        dueDate: "Friday, May 9",
      }, resources),
      weeklyProjectDigest: () => emailTemplates.weeklyProjectDigestEmail({
        firstName: sample.firstName,
        openTasks: 8,
        doneTasks: 5,
        overdueCount: 2,
        projects: [
          { name: "Video Project", openTasks: 5 },
          { name: "Blog project", openTasks: 3 },
        ],
      }, resources),
      dmoStreakAtRisk: () => emailTemplates.dmoStreakAtRiskEmail({ firstName: sample.firstName, streakCount: 14 }, resources),
      dmoMilestone: () => emailTemplates.dmoMilestoneEmail({ firstName: sample.firstName, streakCount: 30 }, resources),
      dmoBroken: () => emailTemplates.dmoStreakBrokenEmail({ firstName: sample.firstName, streakCount: 14 }, resources),
      weeklyDmoSummary: () => emailTemplates.weeklyDmoSummaryEmail({
        firstName: sample.firstName, points: 340, currentStreak: 21, activitiesLogged: 6,
      }, resources),
      videoScoringComplete: () => emailTemplates.videoScoringCompleteEmail({
        firstName: sample.firstName, videoTitle: "How I Got 10 Clients in 30 Days", score: 78, sessionId: "demo-session-id",
      }, resources),
      videoPracticeReminder: () => emailTemplates.videoPracticeReminderEmail({ firstName: sample.firstName }, resources),
      reputationDropAlert: () => emailTemplates.reputationDropAlertEmail({
        firstName: sample.firstName, domain: "fearlessmarketinglab.com", score: "LOW", previousScore: "HIGH",
      }, resources),
      weeklyInboxReport: () => emailTemplates.weeklyInboxReportEmail({
        firstName: sample.firstName, inboxRate: 87, spamRate: 4, emailsAnalyzed: 23,
      }, resources),
      welcome: () => emailTemplates.welcomeEmail({ firstName: sample.firstName, email: sample.email, setupLink: `${process.env.APP_BASE_URL || "https://toolkit.fearlessmarketinglab.com"}/reset-password?token=preview-token&welcome=1` }, resources),
      feedbackSubmittedFeature: () => emailTemplates.feedbackSubmittedEmail({ firstName: sample.firstName, type: "feature", title: "Add dark mode to the teleprompter", postId: "demo-post-id" }, resources),
      feedbackSubmittedBug: () => emailTemplates.feedbackSubmittedEmail({ firstName: sample.firstName, type: "bug", title: "Video upload fails on files over 500MB", postId: "demo-post-id" }, resources),
      newBugAdminAlert: () => emailTemplates.newBugAdminAlertEmail({ submitterName: "Jane Smith", submitterEmail: "jane@example.com", title: "Video upload fails on files over 500MB", description: "When I try to upload a video larger than 500MB the upload just spins and never completes. I've tried multiple times with different files.", postId: "demo-post-id" }, resources),
      feedbackCommentFeature: () => emailTemplates.feedbackCommentEmail({ firstName: sample.firstName, type: "feature", postTitle: "Add dark mode to the teleprompter", commenterName: "Admin", commentBody: "Great idea! We've added this to our roadmap for Q3.", isAdmin: false, postId: "demo-post-id" }, resources),
      feedbackCommentBug: () => emailTemplates.feedbackCommentEmail({ firstName: sample.firstName, type: "bug", postTitle: "Video upload fails on files over 500MB", commenterName: "Jane Smith", commentBody: "Still happening for me even after the latest update.", isAdmin: true, postId: "demo-post-id" }, resources),
      feedbackStatusChanged: () => emailTemplates.feedbackStatusChangedEmail({ firstName: sample.firstName, type: "bug", postTitle: "Video upload fails on files over 500MB", newStatus: "in_progress", postId: "demo-post-id", adminResponse: "We've reproduced this and a fix is on the way!" }, resources),
      workspaceInvite: () => emailTemplates.workspaceInviteEmail({
        ownerName: "Jane Smith",
        inviteUrl: `${process.env.APP_BASE_URL || "https://toolkit.fearlessmarketinglab.com"}/workspace/accept?token=preview-token`,
      }, resources),
      magicLink: () => emailTemplates.magicLinkLoginEmail({
        firstName: sample.firstName,
        loginUrl: `${process.env.APP_BASE_URL || "https://toolkit.fearlessmarketinglab.com"}/api/auth/magic-link?token=preview-token`,
        expiresAt: new Date(Date.now() + 20 * 60 * 1000),
      }, resources),
    };
  }

  // Admin: Email template preview (checks DB override first)
  app.get("/api/admin/email-preview/:template", requireAdmin, async (req: Request, res: Response) => {
    const { template } = req.params;
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      // Rewrite production asset URLs so images load correctly in the dev preview
      const prodBase = "https://toolkit.fearlessmarketinglab.com";
      const reqBase = `${req.protocol}://${req.get("host")}`;
      function rewriteForPreview(html: string) {
        return html.replace(new RegExp(prodBase, "g"), reqBase);
      }
      const override = await storage.getEmailTemplateOverride(template);
      if (override?.htmlOverride) {
        res.setHeader("Content-Type", "text/html");
        return res.send(rewriteForPreview(override.htmlOverride));
      }
      const resources = await storage.getActiveEmailResources();
      const fn = buildDefaultTemplateMap(resources)[template];
      if (!fn) {
        const available = Object.keys(buildDefaultTemplateMap()).join("\n");
        return res.status(404).send(`<pre>Unknown template "${template}".\n\nAvailable:\n${available}</pre>`);
      }
      res.setHeader("Content-Type", "text/html");
      res.send(rewriteForPreview(fn().html));
    } catch (err) {
      res.status(500).send("<pre>Error rendering template</pre>");
    }
  });

  // Admin: List all templates with override status
  app.get("/api/admin/email-templates", requireAdmin, async (req: Request, res: Response) => {
    try {
      const overrides = await storage.getAllEmailTemplateOverrides();
      res.json({ overrides });
    } catch (err) {
      res.status(500).json({ message: "Failed to load template overrides" });
    }
  });

  // Admin: Get current source (subject + html) for a template
  app.get("/api/admin/email-templates/:key/source", requireAdmin, async (req: Request, res: Response) => {
    const { key } = req.params;
    try {
      const resources = await storage.getActiveEmailResources();
      const templateMap = buildDefaultTemplateMap(resources);
      const fn = templateMap[key];
      if (!fn) return res.status(404).json({ message: "Unknown template" });
      const defaultRendered = fn();
      const override = await storage.getEmailTemplateOverride(key);
      res.json({
        subject: override?.subjectOverride ?? defaultRendered.subject,
        html: override?.htmlOverride ?? defaultRendered.html,
        defaultSubject: defaultRendered.subject,
        defaultHtml: defaultRendered.html,
        hasOverride: !!(override?.htmlOverride),
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to load template source" });
    }
  });

  // Admin: Save template override
  app.put("/api/admin/email-templates/:key", requireAdmin, async (req: Request, res: Response) => {
    const { key } = req.params;
    const { subject, html } = req.body;
    try {
      if (!buildDefaultTemplateMap()[key]) return res.status(404).json({ message: "Unknown template" });
      if (!subject || !html) return res.status(400).json({ message: "subject and html are required" });
      await storage.upsertEmailTemplateOverride(key, subject, html);
      res.json({ message: "Template saved" });
    } catch (err) {
      res.status(500).json({ message: "Failed to save template" });
    }
  });

  // Admin: Send a test email for a template to the logged-in admin's own address
  app.post("/api/admin/email-templates/:key/send-test", requireAdmin, async (req: Request, res: Response) => {
    const { key } = req.params;
    try {
      const resources = await storage.getActiveEmailResources();
      const templateMap = buildDefaultTemplateMap(resources);
      const fn = templateMap[key];
      if (!fn) return res.status(404).json({ message: "Unknown template" });

      const override = await storage.getEmailTemplateOverride(key);
      const subject = override?.subjectOverride ?? fn().subject;
      const html    = override?.htmlOverride   ?? fn().html;
      const text    = fn().text;

      // Allow caller to specify a recipient; fall back to the admin's own email
      const { email: bodyEmail } = req.body as { email?: string };
      const sendTo = bodyEmail?.trim() || (await storage.getUser(req.session.userId!))?.email;
      if (!sendTo) return res.status(400).json({ message: "No email address available" });

      const { sendEmail } = await import("./email-sendgrid");
      await sendEmail({ to: sendTo, subject: `[TEST] ${subject}`, html, text });
      res.json({ message: "Test email sent", to: sendTo });
    } catch (err: any) {
      console.error("[email-templates] send-test error:", err);
      res.status(500).json({ message: err?.message ?? "Failed to send test email" });
    }
  });

  // Admin: Reset template to default
  app.delete("/api/admin/email-templates/:key", requireAdmin, async (req: Request, res: Response) => {
    const { key } = req.params;
    try {
      await storage.deleteEmailTemplateOverride(key);
      res.json({ message: "Template reset to default" });
    } catch (err) {
      res.status(500).json({ message: "Failed to reset template" });
    }
  });

  // Admin: Email resource links CRUD
  app.get("/api/admin/email-resources", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const links = await storage.getAllEmailResources();
      res.json(links);
    } catch (err) {
      res.status(500).json({ message: "Failed to load email resources" });
    }
  });

  app.post("/api/admin/email-resources", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { description, url, anchorText, sortOrder } = req.body;
      if (!description || !url || !anchorText) return res.status(400).json({ message: "description, url, and anchorText are required" });
      const result = await storage.createEmailResource({ description, url, anchorText, sortOrder: sortOrder ?? 0 });
      res.status(201).json(result);
    } catch (err) {
      res.status(500).json({ message: "Failed to create email resource" });
    }
  });

  app.patch("/api/admin/email-resources/:id", requireAdmin, async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      const { description, url, anchorText, sortOrder, isActive } = req.body;
      await storage.updateEmailResource(id, { description, url, anchorText, sortOrder, isActive });
      res.json({ message: "Updated" });
    } catch (err) {
      res.status(500).json({ message: "Failed to update email resource" });
    }
  });

  app.delete("/api/admin/email-resources/:id", requireAdmin, async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
      await storage.deleteEmailResource(id);
      res.json({ message: "Deleted" });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete email resource" });
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

  // Admin: immediately push fresh tokens to all enrolled members with a CF Contact ID
  // Debug: read a CF contact directly to inspect custom_attributes
  app.get("/api/admin/cf/contact/:contactId", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { contactId } = req.params;
      const token = process.env.CF_API_TOKEN || "";
      const rawDomain = (process.env.CF_WORKSPACE_DOMAIN || "").replace(/^https?:\/\//i, "").replace(/\/+$/, "");
      const url = `https://${rawDomain}/api/v2/contacts/${contactId}`;
      const cfRes = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const body = await cfRes.text();
      res.json({ status: cfRes.status, url, body: JSON.parse(body) });
    } catch (err: any) {
      res.status(500).json({ message: err?.message });
    }
  });

  // Admin: import ALL CF-enrolled members from the CF API, creating accounts for unknowns
  app.post("/api/admin/cf/import-all-members", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { getAllCfEnrollments } = await import("./clickfunnels");
      const enrollments = await getAllCfEnrollments();

      let created = 0, contactIdUpdated = 0, skipped = 0, inactive = 0, errors = 0;

      for (const enrollment of enrollments) {
        try {
          if (!enrollment.active) {
            inactive++;
            continue;
          }

          const existing = await storage.getUserByEmail(enrollment.email);

          if (!existing) {
            // Brand-new member — provision a Toolkit account for them
            const firstName = enrollment.firstName || "";
            const lastName = enrollment.lastName || "";
            const displayName = [firstName, lastName].filter(Boolean).join(" ") || enrollment.email.split("@")[0];
            const newUser = await storage.createUser({
              email: enrollment.email,
              displayName,
              firstName: firstName || undefined,
              lastName: lastName || undefined,
            });
            await storage.updateUser(newUser.id, {
              cfEnrolled: true,
              cfEnrolledAt: new Date(),
              cfContactId: enrollment.contactId,
              isDisabled: false,
            });
            created++;
          } else if (!existing.cfContactId) {
            // Existing account — just fill in the missing Contact ID + ensure enrolled
            await storage.updateUser(existing.id, {
              cfContactId: enrollment.contactId,
              cfEnrolled: true,
              cfEnrolledAt: existing.cfEnrolledAt ?? new Date(),
              isDisabled: false,
            });
            contactIdUpdated++;
          } else {
            skipped++;
          }
        } catch (err: any) {
          console.error(`[CF Import] Error processing ${enrollment.email}:`, err?.message);
          errors++;
        }
      }

      console.log(`[CF Import] Done — created=${created} updated=${contactIdUpdated} skipped=${skipped} inactive=${inactive} errors=${errors}`);
      res.json({
        total: enrollments.length,
        created,
        contactIdUpdated,
        skipped,
        inactive,
        errors,
        message: `Import complete. ${created} new accounts created, ${contactIdUpdated} contact IDs updated, ${skipped} already up-to-date, ${inactive} inactive/revoked skipped.`,
      });
    } catch (err: any) {
      console.error("[CF Import] Fatal error:", err?.message);
      res.status(500).json({ message: err?.message || "Import failed" });
    }
  });

  // Admin: backfill CF Contact IDs for enrolled members who are missing one
  app.post("/api/admin/cf/sync-contact-ids", requireAdmin, async (req: Request, res: Response) => {
    try {
      const cfUsers = await storage.getCfUsers("enrolled");
      const missing = cfUsers.filter((u) => !u.cfContactId);
      if (missing.length === 0) return res.json({ synced: 0, skipped: 0, errors: 0, message: "All enrolled members already have a Contact ID." });

      let synced = 0, skipped = 0, errors = 0;
      for (const member of missing) {
        try {
          const info = await checkCfEnrollmentByEmail(member.email);
          if (info.contactId) {
            await storage.updateUser(member.id, { cfContactId: info.contactId });
            synced++;
          } else {
            skipped++;
          }
        } catch {
          errors++;
        }
      }
      res.json({ synced, skipped, errors, message: `Synced ${synced} contact IDs. Skipped ${skipped} (not found in CF). Errors: ${errors}.` });
    } catch (err: any) {
      console.error("[CF Sync] error:", err?.message);
      res.status(500).json({ message: "Sync failed" });
    }
  });

  // ── CF Course Import ─────────────────────────────────────────────────────────

  type CfImportResult = {
    created: number;
    updated: number;
    wrappedLessons: number;
    videosImported: number;
    videosSkipped: number;
    videosUnavailable: number;
  };

  /** Recursively import a module node and its children into the DB (idempotent via externalId). */
  async function importModuleNode(
    node: CfTreeNode,
    courseId: string,
    parentModuleId: string | null,
    sortOrder: number,
    result: CfImportResult,
  ) {
    const extId = `cf-section-${node.cfId}`;
    let moduleId: string;

    const existing = await storage.getCourseModuleByExternalId(courseId, extId);
    if (existing) {
      if (existing.title !== node.title) await storage.updateCourseModule(existing.id, { title: node.title });
      moduleId = existing.id;
      result.updated++;
    } else {
      const created = await storage.createCourseModule({
        courseId,
        parentModuleId,
        title: node.title,
        status: node.published ? "published" : "draft",
        sortOrder,
        externalId: extId,
      } as any);
      moduleId = created.id;
      result.created++;
    }

    let childSort = 0;
    for (const child of node.children) {
      if (child.type === "module") await importModuleNode(child, courseId, moduleId, childSort++, result);
      else await importLessonNode(child, courseId, moduleId, childSort++, result);
    }
  }

  /** Import a lesson node (idempotent via externalId). */
  async function importLessonNode(
    node: CfTreeNode,
    courseId: string,
    moduleId: string,
    sortOrder: number,
    result: CfImportResult,
  ) {
    const extId = `cf-lesson-${node.cfId}`;
    const existing = await storage.getCourseLessonByExternalId(courseId, extId);
    const videoUrl = node.videoUrl ? extractVimeoUrl(node.videoUrl) : null;
    if (existing) {
      const updates: { title?: string; videoUrl?: string } = {};
      if (existing.title !== node.title) updates.title = node.title;
      // Never replace an existing admin-entered video URL; re-imports only fill
      // missing video fields with a newly discovered ClickFunnels Vimeo URL.
      if (videoUrl && !existing.videoUrl) {
        updates.videoUrl = videoUrl;
        result.videosImported++;
      } else if (videoUrl) {
        result.videosSkipped++;
      } else {
        result.videosUnavailable++;
      }
      if (Object.keys(updates).length) await storage.updateCourseLesson(existing.id, updates as any);
      result.updated++;
    } else {
      await storage.createCourseLesson({
        courseId,
        moduleId,
        title: node.title,
        status: node.published ? "published" : "draft",
        sortOrder,
        externalId: extId,
        videoUrl,
      } as any);
      if (videoUrl) result.videosImported++;
      else result.videosUnavailable++;
      result.created++;
    }
  }

  /** List all courses from the connected CF workspace. */
  app.get("/api/admin/cf/import/courses", requireAdmin, async (req: Request, res: Response) => {
    try {
      const courses = await listCfCourses();
      res.json({ courses });
    } catch (err: any) {
      console.error("[CF Import] listCfCourses:", err?.message);
      res.status(502).json({ message: err?.message ?? "Failed to list CF courses" });
    }
  });

  /** List ClickFunnels downloads for linking from lesson resources. */
  app.get("/api/admin/cf/downloads", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const downloads = await listCfDownloads();
      res.json({
        downloads: downloads.map((download) => ({
          ...download,
          editUrl: download.public_id
            ? `https://${CF_WORKSPACE_DOMAIN}/account/downloads/${encodeURIComponent(download.public_id)}/edit`
            : null,
        })),
      });
    } catch (err: any) {
      console.error("[CF Downloads] list:", err?.message);
      res.status(502).json({ message: err?.message ?? "Failed to list ClickFunnels downloads" });
    }
  });

  /**
   * Stream the full section + lesson tree for a CF course as SSE.
   * Events: { type:"progress"|"done"|"error", message?, structure? }
   */
  app.get("/api/admin/cf/import/courses/:cfCourseId/structure", requireAdmin, async (req: Request, res: Response) => {
    const { cfCourseId } = req.params;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    let closed = false;
    req.on("close", () => { closed = true; });
    const send = (data: object) => { if (!closed) res.write(`data: ${JSON.stringify(data)}\n\n`); };

    try {
      const structure = await getCfCourseStructure(cfCourseId, (msg) => send({ type: "progress", message: msg }));
      send({ type: "done", structure });
    } catch (err: any) {
      console.error("[CF Import] structure fetch:", err?.message);
      send({ type: "error", message: err?.message ?? "Failed to fetch course structure" });
    } finally {
      res.end();
    }
  });

  /**
   * Execute the import.
   * Body: { cfCourseTitle, filteredTree, destination, promote }
   * Response: { created, updated, wrappedLessons, courseId, courseName }
   */
  app.post("/api/admin/cf/import/execute", requireAdmin, async (req: Request, res: Response) => {
    const adminUser = (req as any).adminUser;
    try {
      const { cfCourseTitle, filteredTree, destination, promote } = req.body as {
        cfCourseTitle: string;
        filteredTree: CfTreeNode[];
        destination: { type: "new" | "existing"; title?: string; existingCourseId?: string };
        promote: boolean;
      };

      if (!Array.isArray(filteredTree)) return res.status(400).json({ message: "filteredTree is required" });
      if (!destination?.type) return res.status(400).json({ message: "destination.type is required" });

      // Apply promotion: lift single root module's children up one level
      let importRoots: CfTreeNode[] = filteredTree;
      let promotedTitle = "";
      if (promote && filteredTree.length === 1 && filteredTree[0].type === "module") {
        promotedTitle = filteredTree[0].title;
        importRoots = filteredTree[0].children;
      }

      // Resolve target course
      let targetCourseId: string;
      let courseName: string;

      if (destination.type === "new") {
        const rawTitle = (destination.title?.trim() || promotedTitle || cfCourseTitle || "CF Import").slice(0, 200);
        const baseSlug = generateCourseSlug(rawTitle);
        let finalSlug = baseSlug;
        let slugAttempt = 0;
        while (true) {
          const { rows } = await pool.query("SELECT id FROM courses WHERE slug = $1 LIMIT 1", [finalSlug]);
          if (!rows.length) break;
          finalSlug = `${baseSlug}-${++slugAttempt}`;
        }
        const course = await storage.createCourse({ title: rawTitle, slug: finalSlug, status: "draft", sortOrder: 0 });
        targetCourseId = course.id;
        courseName = rawTitle;
      } else {
        if (!destination.existingCourseId) return res.status(400).json({ message: "existingCourseId required" });
        const existing = await storage.getCourse(destination.existingCourseId);
        if (!existing) return res.status(404).json({ message: "Target course not found" });
        targetCourseId = existing.id;
        courseName = existing.title;
      }

      // Append after existing modules
      const existingModules = await storage.getCourseModules(targetCourseId);
      let sortIdx = existingModules.length > 0 ? Math.max(...existingModules.map(m => m.sortOrder)) + 1 : 0;

      const importResult: CfImportResult = {
        created: 0,
        updated: 0,
        wrappedLessons: 0,
        videosImported: 0,
        videosSkipped: 0,
        videosUnavailable: 0,
      };

      // Loose root-level lessons → wrap in "Bonus" module
      const topModules = importRoots.filter(n => n.type === "module");
      const looseRootLessons = importRoots.filter(n => n.type === "lesson");

      if (looseRootLessons.length > 0) {
        const bonusMod = await storage.createCourseModule({
          courseId: targetCourseId,
          parentModuleId: null,
          title: "Bonus",
          status: "draft",
          sortOrder: sortIdx++,
        });
        importResult.created++;
        for (let i = 0; i < looseRootLessons.length; i++) {
          await importLessonNode(looseRootLessons[i], targetCourseId, bonusMod.id, i, importResult);
        }
        importResult.wrappedLessons = looseRootLessons.length;
      }

      // Import top-level modules recursively
      for (const node of topModules) {
        await importModuleNode(node, targetCourseId, null, sortIdx++, importResult);
      }

      // Audit log
      await storage.createAuditLog({
        adminUserId: adminUser.id,
        action: "cf_course_import",
        metadataJson: { targetCourseId, courseName, cfCourseTitle, ...importResult } as any,
        ip: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });

      res.json({ ...importResult, courseId: targetCourseId, courseName });
    } catch (err: any) {
      console.error("[CF Import] execute:", err?.message);
      res.status(500).json({ message: err?.message ?? "Import failed" });
    }
  });

  app.get("/api/admin/vimeo/folders", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const folders = await listVimeoProjects();
      res.json({ folders });
    } catch (err: any) {
      console.error("[Vimeo] list folders:", err?.message);
      res.status(502).json({ message: err?.message ?? "Failed to load Vimeo folders" });
    }
  });

  app.get("/api/admin/vimeo/folders/:folderId/videos", requireAdmin, async (req: Request, res: Response) => {
    const { folderId } = req.params;
    const page = Number.parseInt(String(req.query.page ?? "1"), 10);
    if (folderId !== "all" && !/^\d+$/.test(folderId)) {
      return res.status(400).json({ message: "Invalid Vimeo folder" });
    }
    if (!Number.isInteger(page) || page < 1 || page > 10_000) {
      return res.status(400).json({ message: "Invalid Vimeo page" });
    }
    try {
      res.json(await listVimeoVideos(folderId === "all" ? undefined : folderId, page));
    } catch (err: any) {
      console.error("[Vimeo] list videos:", err?.message);
      res.status(502).json({ message: err?.message ?? "Failed to load Vimeo videos" });
    }
  });

  // ── end CF Course Import ──────────────────────────────────────────────────────

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
        // Reset the warning flag on grant so a new warning fires on any future revocation.
        ...(grant ? { cfRevokedGraceUntil: null, cfGraceExpirySentAt: null } : {}),
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

  // Admin: get CF button customizer settings
  app.get("/api/admin/cf/button-settings", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const settings = await storage.getCfButtonSettings();
      res.json(settings);
    } catch (err) {
      console.error("[CF Button Admin] get error:", err);
      res.status(500).json({ message: "Failed to get button settings" });
    }
  });

  // Admin: save CF button customizer settings
  app.post("/api/admin/cf/button-settings", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { text, bg, color, radius, width, fontSize, padding } = req.body as { text: string; bg: string; color: string; radius: string; width: string; fontSize: string; padding: string };
      await storage.setCfButtonSettings({
        text: String(text || ""),
        bg: String(bg || ""),
        color: String(color || ""),
        radius: String(radius || "rounded"),
        width: String(width || "auto"),
        fontSize: String(fontSize || "15"),
        padding: String(padding || "normal"),
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("[CF Button Admin] save error:", err);
      res.status(500).json({ message: "Failed to save button settings" });
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
      const { search, role, status, provider, consent, membership, login, sort, page, pageSize } = req.query;
      
      const result = await storage.getAllUsers({
        search: search as string,
        role: role as string,
        status: status as string,
        provider: provider as string,
        consent: consent as string,
        membership: membership as string,
        login: login as string,
        sort: sort as string,
        page: page ? parseInt(page as string) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      });
      
      // Get identities and credits for provider filter info
      const usersWithProvider = await Promise.all(
        result.users.map(async (user) => {
          const [identities, credits, activityStats] = await Promise.all([
            storage.getUserIdentitiesByUser(user.id),
            storage.getVideoTrendsCredits(user.id),
            storage.getUserActivityStats(user.id),
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
            projectCount: activityStats.projectCount,
            taskCount: activityStats.taskCount,
            tasksDoneCount: activityStats.tasksDoneCount,
            dmoLast30Days: activityStats.dmoLast30Days,
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

  // ── Notification Preferences ──────────────────────────────────────────────

  app.get("/api/account/notification-preferences", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const prefs = await storage.getNotificationPrefs(userId);
      res.json(prefs);
    } catch (err) {
      console.error("Get notification prefs error:", err);
      res.status(500).json({ message: "Failed to get notification preferences" });
    }
  });

  app.put("/api/account/notification-preferences", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { allEnabled, preferences } = req.body;
      if (typeof allEnabled !== "boolean" || typeof preferences !== "object" || !preferences) {
        return res.status(400).json({ message: "Invalid request body" });
      }
      await storage.upsertNotificationPrefs(userId, allEnabled, preferences);
      res.json({ message: "Notification preferences saved" });
    } catch (err) {
      console.error("Update notification prefs error:", err);
      res.status(500).json({ message: "Failed to save notification preferences" });
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

  app.post("/api/sessions/youtube", requireAuth, videoIngestionLimiter, async (req: Request, res: Response) => {
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

  // In-process atomic gate: tracks which session IDs currently have a confirm
  // in progress.  Because Node.js is single-threaded and there is no `await`
  // between the `.has()` check and the `.add()` call, this is race-free on a
  // single process.  It prevents concurrent confirm requests from racing on the
  // same session and triggering multiple full-object downloads to disk.
  const activeConfirming = new Set<string>();

  // Scheduled sweep: delete cloud-storage objects for sessions that have been
  // stuck in "uploading" status for longer than 45 minutes.  The presigned URL
  // TTL is 15 minutes, so any object still unclaimed after 45 minutes will
  // never be legitimately confirmed.  Cleaning them up prevents indefinite
  // storage-cost accumulation from uploads that were never confirmed.
  const STALE_UPLOAD_TTL_MS = 45 * 60 * 1000; // 45 minutes
  setInterval(async () => {
    try {
      const staleSessions = await storage.getStaleUploadingSessions(STALE_UPLOAD_TTL_MS);
      for (const staleSession of staleSessions) {
        try {
          if (staleSession.cloudStoragePath) {
            await objectStorageService.deleteObject(staleSession.cloudStoragePath);
            console.log(`[UploadCleanup] Deleted orphaned object for session ${staleSession.id}: ${staleSession.cloudStoragePath}`);
          }
          await storage.updateSession(staleSession.id, {
            processingStatus: "failed",
            processingMessage: "Upload timed out. Please try uploading your video again.",
            processingError: "upload_timeout",
            cloudStoragePath: null,
          });
        } catch (itemErr) {
          console.warn(`[UploadCleanup] Failed to clean up session ${staleSession.id}:`, itemErr);
        }
      }
      if (staleSessions.length > 0) {
        console.log(`[UploadCleanup] Swept ${staleSessions.length} stale uploading session(s)`);
      }
    } catch (sweepErr) {
      console.warn("[UploadCleanup] Sweep error:", sweepErr);
    }
  }, 15 * 60 * 1000); // run every 15 minutes
  
  app.post("/api/sessions/:id/request-upload-url", requireAuth, videoIngestionLimiter, async (req: Request, res: Response) => {
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

      // If a previous presigned URL was issued for this session and never confirmed,
      // the old object in cloud storage is now orphaned.  Delete it proactively so
      // it does not accumulate indefinitely and drive up storage costs.
      if (session.cloudStoragePath && session.processingStatus === "uploading") {
        try {
          await objectStorageService.deleteObject(session.cloudStoragePath);
          console.log(`[Presign:${traceId}] Deleted previous orphaned upload object: ${session.cloudStoragePath}`);
        } catch (delErr) {
          console.warn(`[Presign:${traceId}] Could not delete previous orphaned object (may already be gone):`, delErr);
        }
      }

      // Generate presigned URL for upload
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      console.log(`[Presign:${traceId}] Generated upload URL, objectPath: ${objectPath}`);

      // Store the pending upload info in session, including the issued object path
      // so confirm-upload can verify it matches and prevent path substitution attacks.
      // processingUpdatedAt is set here so the stale-upload sweep uses the upload-
      // issuance timestamp rather than the session's original createdAt.
      await storage.updateSession(session.id, {
        processingStatus: "uploading",
        processingProgress: 0,
        processingMessage: "Preparing for upload...",
        cloudStoragePath: objectPath,
        processingUpdatedAt: new Date(),
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
  app.post("/api/sessions/:id/confirm-upload", requireAuth, videoIngestionLimiter, async (req: Request, res: Response) => {
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

      // Idempotency gate: only accept a confirm when the session is actively awaiting
      // an upload.  Any other status means the upload was already confirmed (or never
      // requested), so further confirm calls are rejected.
      if (session.processingStatus !== "uploading") {
        console.warn(`[Confirm:${traceId}] Duplicate confirm rejected — session ${session.id} status is '${session.processingStatus}'`);
        return res.status(409).json({
          message: "Upload already confirmed or not in an uploadable state",
          status: session.processingStatus,
          traceId,
        });
      }

      // Atomic in-process lock: because there is no `await` between the `.has()`
      // check and the `.add()`, Node.js's single-threaded event loop guarantees
      // this is race-free.  Concurrent confirm requests for the same session that
      // both pass the DB status check above (before either updates the row) are
      // stopped here — only the first caller proceeds to download.
      if (activeConfirming.has(session.id)) {
        console.warn(`[Confirm:${traceId}] Concurrent confirm blocked for session ${session.id}`);
        return res.status(409).json({
          message: "Upload confirmation already in progress for this session",
          traceId,
        });
      }
      activeConfirming.add(session.id);

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
    } finally {
      // Release the in-process confirm lock regardless of how the handler exits.
      // Set.delete is a no-op when the key was never added (early-rejection paths),
      // so this is always safe to call unconditionally.
      activeConfirming.delete(req.params.id);
    }
  });

  app.post("/api/sessions/:id/upload", requireAuth, videoIngestionLimiter, requireSessionOwnership, upload.single("video"), async (req: Request, res: Response) => {
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
  
  const { generateTopics, enrichTopicDetails, generateScript, generateFullScript, generateIntentAnalysis, getApiKeyStatus, getKeywordsEverywhereCredits } = await import("./topic-pulse");
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

  app.get("/api/topic-pulse/runs/:runId", requireAuth, async (req: Request, res: Response) => {
    try {
      const run = await storage.getTopicRun(req.params.runId);
      if (!run) return res.status(404).json({ message: "Run not found" });
      if (run.userId !== req.session.userId) return res.status(403).json({ message: "Forbidden" });
      res.json(run);
    } catch (err) {
      console.error("[TopicPulse] Get run error:", err);
      res.status(500).json({ message: "Failed to get run" });
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
        logUserAction({
          userId,
          actionType: "topic_searched",
          actionLabel: ActionLabels.topic_searched,
          entityType: "topic_run",
          entityId: run.id,
          metadata: { topicCount: createdTopics.length, creditsUsed: result.creditsUsed },
          req,
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

      // Ensure intent analysis exists — generate and persist it if not
      let intentAnalysis = topic.intentAnalysis;
      if (!intentAnalysis) {
        try {
          intentAnalysis = await generateIntentAnalysis(topic);
          const { db } = await import("./db");
          const { topics } = await import("@shared/schema");
          const { eq } = await import("drizzle-orm");
          await db.update(topics).set({ intentAnalysis }).where(eq(topics.id, topic.id));
        } catch (e) {
          console.error("[TopicPulse] Intent analysis generation failed (non-fatal):", e);
          intentAnalysis = null;
        }
      }

      const scriptJson = await generateScript(parsed.data, topic, intentAnalysis);

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
      logUserAction({
        userId: req.session.userId!,
        actionType: "script_generated",
        actionLabel: ActionLabels.script_generated,
        entityType: "script",
        entityId: script.id,
        metadata: { title: topic.topicTitle, videoLength: parsed.data.videoLengthTarget },
        req,
      });
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
      const updates: { notes?: string; title?: string; scriptJson?: any; teleprompterScriptId?: string | null } = {};
      if (typeof req.body.notes === "string") updates.notes = req.body.notes;
      if (typeof req.body.title === "string") updates.title = req.body.title;
      if (req.body.scriptJson && typeof req.body.scriptJson === "object") {
        updates.scriptJson = req.body.scriptJson;
      }
      if ("teleprompterScriptId" in req.body) {
        updates.teleprompterScriptId = req.body.teleprompterScriptId ?? null;
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

  app.post("/api/topic-pulse/scripts/:id/generate-full", requireAuth, async (req: Request, res: Response) => {
    try {
      const script = await storage.getScript(req.params.id);
      if (!script || script.userId !== req.session.userId) {
        return res.status(404).json({ message: "Script not found" });
      }

      const rawJson = script.scriptJson as any;
      const fullScript = rawJson?.fullScript ?? rawJson?.scriptJson?.fullScript;
      if (!fullScript) {
        return res.status(400).json({ message: "Script has no outline content yet" });
      }

      const topic = await storage.getTopic(script.topicId);
      const inputsJson = (script.inputsJson ?? {}) as any;
      const videoLengthTarget = req.body?.videoLengthTarget ?? inputsJson.videoLengthTarget ?? "6-10";

      const expandedScript = await generateFullScript(
        fullScript,
        { ...inputsJson, videoLengthTarget },
        topic?.topicTitle ?? script.title
      );

      const newScriptJson = { ...rawJson, expandedScript };
      await storage.updateScript(req.params.id, req.session.userId!, { scriptJson: newScriptJson });

      res.json({ expandedScript });
    } catch (err) {
      console.error("[TopicPulse] Generate full script error:", err);
      res.status(500).json({ message: "Failed to generate full script" });
    }
  });

  app.post("/api/topic-pulse/scripts/:id/regenerate-hook", requireAuth, async (req: Request, res: Response) => {
    try {
      const script = await storage.getScript(req.params.id);
      if (!script || script.userId !== req.session.userId) {
        return res.status(404).json({ message: "Script not found" });
      }

      const rawJson = script.scriptJson as any;
      const fullScript = rawJson?.fullScript ?? rawJson?.scriptJson?.fullScript;
      if (!fullScript) {
        return res.status(400).json({ message: "Script has no outline yet" });
      }

      const currentHook: string = fullScript.hook?.text ?? "";

      let topic: import("../shared/schema").Topic | { topicTitle: string; keywordQuery: string; intents: string[] | null; intentAnalysis: string | null } | null = null;
      if (script.topicId) {
        topic = await storage.getTopic(script.topicId) ?? null;
      }
      if (!topic) {
        topic = {
          topicTitle: script.title ?? "this topic",
          keywordQuery: script.title ?? "this topic",
          intents: null,
          intentAnalysis: null,
        };
      }

      const intentAnalysis: string | null = (topic as any).intentAnalysis ?? null;

      const { generateHookVariations } = await import("./topic-pulse");
      const newHook = await generateHookVariations(topic as any, currentHook, intentAnalysis);

      res.json({ hook: newHook });
    } catch (err) {
      console.error("[TopicPulse] Regenerate hook error:", err);
      res.status(500).json({ message: "Failed to regenerate hook" });
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
      logUserAction({
        userId: req.session.userId!,
        actionType: "teleprompter_script_created",
        actionLabel: ActionLabels.teleprompter_script_created,
        entityType: "teleprompter_script",
        entityId: script.id,
        metadata: { title: script.title },
        req,
      });
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
      logUserAction({
        userId: req.session.userId!,
        actionType: "teleprompter_script_updated",
        actionLabel: ActionLabels.teleprompter_script_updated,
        entityType: "teleprompter_script",
        entityId: req.params.id,
        metadata: { title: script.title },
        req,
      });
    } catch (err) {
      console.error("[Teleprompter] Update script error:", err);
      res.status(500).json({ message: "Failed to update script" });
    }
  });

  app.post("/api/teleprompter/scripts/generate-bullets", requireAuth, async (req: Request, res: Response) => {
    try {
      const { content } = req.body;
      if (!content || typeof content !== "string" || !content.trim()) {
        return res.status(400).json({ message: "content is required" });
      }
      const bullets = await generateBulletPoints(content);
      res.json({ bulletPoints: bullets });
    } catch (err: any) {
      console.error("[Teleprompter] Generate bullets error:", err?.message || err);
      res.status(500).json({ message: "Failed to generate bullet points" });
    }
  });

  app.delete("/api/teleprompter/scripts/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const ok = await storage.deleteTeleprompterScript(req.params.id, req.session.userId!);
      if (!ok) return res.status(404).json({ message: "Script not found" });
      res.json({ success: true });
      logUserAction({
        userId: req.session.userId!,
        actionType: "teleprompter_script_deleted",
        actionLabel: ActionLabels.teleprompter_script_deleted,
        entityType: "teleprompter_script",
        entityId: req.params.id,
        req,
      });
    } catch (err) {
      console.error("[Teleprompter] Delete script error:", err);
      res.status(500).json({ message: "Failed to delete script" });
    }
  });

  // ── Teleprompter Recordings ──

  // Step 1 of the two-step signed-URL upload flow.
  // Returns a presigned GCS PUT URL so the browser can push the video directly
  // to cloud storage without routing through the deployment proxy (which has a
  // request-body size limit that kills large video uploads in production).
  app.post("/api/teleprompter/recordings/prepare-upload", requireAuth, async (req: Request, res: Response) => {
    try {
      const objectStorage = new ObjectStorageService();
      const uploadUrl = await objectStorage.getObjectEntityUploadURL();
      const storageKey = objectStorage.normalizeObjectEntityPath(uploadUrl);
      res.json({ uploadUrl, storageKey });
    } catch (err) {
      console.error("[Teleprompter] prepare-upload error:", err);
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  // Step 2 of the two-step signed-URL upload flow.
  // Called after the browser has PUT the video directly to GCS. Registers the
  // recording in the database and increments the script take counter.
  app.post("/api/teleprompter/recordings/confirm-upload", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { storageKey, title: rawTitle, scriptId: rawScriptId, durationSeconds: rawDuration, mimeType: rawMime, sizeBytes: rawSize } = req.body ?? {};

      if (!storageKey || typeof storageKey !== "string" || !storageKey.startsWith("/objects/")) {
        return res.status(400).json({ message: "Invalid storage key" });
      }

      const scriptId = (typeof rawScriptId === "string" && rawScriptId) ? rawScriptId : null;
      const baseTitle = (typeof rawTitle === "string" && rawTitle.trim()) ? rawTitle.trim().slice(0, 100) : "Untitled";
      const durationSeconds = rawDuration ? (parseInt(String(rawDuration), 10) || null) : null;
      const mimeType = (typeof rawMime === "string" && rawMime) ? rawMime : "video/webm";
      const sizeBytes = rawSize ? (parseInt(String(rawSize), 10) || null) : null;
      const format = (typeof req.body.format === "string" && ["landscape", "portrait", "square"].includes(req.body.format))
        ? req.body.format : "landscape";

      let takeNumber: number;
      if (scriptId) {
        takeNumber = await storage.incrementTeleprompterScriptTakeCount(scriptId, userId);
      } else {
        const existingRecordings = await storage.getTeleprompterRecordingsByUser(userId);
        const takeRegex = /^Take (\d+)\s*\u2014/;
        const suffix = " \u2014 " + baseTitle;
        const maxTake = existingRecordings
          .filter((r) => r.title.endsWith(suffix))
          .reduce((max, r) => { const m = takeRegex.exec(r.title); return m ? Math.max(max, parseInt(m[1], 10)) : max; }, 0);
        takeNumber = maxTake + 1;
      }
      const title = `Take ${takeNumber} \u2014 ${baseTitle}`;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      const recording = await storage.createTeleprompterRecording({
        userId,
        scriptId,
        title,
        storageKey,
        mimeType,
        sizeBytes,
        durationSeconds,
        format,
        expiresAt,
      });
      res.json(recording);
    } catch (err) {
      console.error("[Teleprompter] confirm-upload error:", err);
      res.status(500).json({ message: "Failed to register recording" });
    }
  });

  // Chunked upload — Step A: receive one chunk and write it to a temp dir.
  // Each chunk is ≤ 5 MB so it passes through the deployment ingress without a 413.
  app.post("/api/teleprompter/recordings/upload-chunk", requireAuth, chunkUpload.single("chunk"), async (req: Request, res: Response) => {
    const file = req.file;
    console.log("[chunk-upload] hit — file:", file?.originalname, "body:", req.body);
    if (!file) return res.status(400).json({ message: "No chunk received — multer found no file field named 'chunk'" });
    try {
      const { uploadId, chunkIndex, totalChunks } = req.body;
      if (!uploadId || chunkIndex === undefined || !totalChunks) {
        try { fs.unlinkSync(file.path); } catch (_) {}
        return res.status(400).json({ message: "Missing uploadId, chunkIndex, or totalChunks" });
      }
      const chunkDir = path.join(UPLOADS_DIR, "chunks", uploadId);
      fs.mkdirSync(chunkDir, { recursive: true });
      const chunkPath = path.join(chunkDir, `chunk-${String(chunkIndex).padStart(6, "0")}`);
      fs.renameSync(file.path, chunkPath);
      console.log("[chunk-upload] ok — uploadId:", uploadId, "chunk:", chunkIndex, "/", totalChunks);
      res.json({ ok: true, chunkIndex });
    } catch (err) {
      try { if (req.file) fs.unlinkSync(req.file.path); } catch (_) {}
      console.error("[Teleprompter] chunk upload error:", err);
      res.status(500).json({ message: "Failed to store chunk" });
    }
  });

  // Chunked upload — Step B: assemble all chunks, faststart, push to GCS, register in DB.
  app.post("/api/teleprompter/recordings/finalize-chunked-upload", requireAuth, async (req: Request, res: Response) => {
    console.log("[finalize-upload] hit — body keys:", Object.keys(req.body ?? {}));
    const chunkDir = path.join(UPLOADS_DIR, "chunks", req.body?.uploadId ?? "");
    const assembledPath = path.join(UPLOADS_DIR, `assembled-${req.body?.uploadId ?? "bad"}`);
    try {
      const userId = req.session.userId!;
      const { uploadId, totalChunks, title: rawTitle, scriptId: rawScriptId, durationSeconds: rawDuration, mimeType: rawMime, sizeBytes: rawSize, format: rawFormat } = req.body ?? {};
      if (!uploadId || !totalChunks) return res.status(400).json({ message: "Missing uploadId or totalChunks" });

      const n = parseInt(String(totalChunks), 10);
      const writeStream = fs.createWriteStream(assembledPath);
      for (let i = 0; i < n; i++) {
        const cp = path.join(chunkDir, `chunk-${String(i).padStart(6, "0")}`);
        writeStream.write(fs.readFileSync(cp));
      }
      await new Promise<void>((resolve, reject) => { writeStream.end((err: any) => err ? reject(err) : resolve()); });
      try { fs.rmSync(chunkDir, { recursive: true }); } catch (_) {}

      const scriptId = (typeof rawScriptId === "string" && rawScriptId) ? rawScriptId : null;
      const baseTitle = (typeof rawTitle === "string" && rawTitle.trim()) ? rawTitle.trim().slice(0, 100) : "Untitled";
      const durationSeconds = rawDuration ? (parseInt(String(rawDuration), 10) || null) : null;
      const mimeType = (typeof rawMime === "string" && rawMime) ? rawMime : "video/webm";
      const format = (typeof rawFormat === "string" && ["landscape", "portrait", "square"].includes(rawFormat)) ? rawFormat : "landscape";
      const isMp4 = mimeType.includes("mp4");

      let takeNumber: number;
      if (scriptId) {
        takeNumber = await storage.incrementTeleprompterScriptTakeCount(scriptId, userId);
      } else {
        const existingRecordings = await storage.getTeleprompterRecordingsByUser(userId);
        const takeRegex = /^Take (\d+)\s*\u2014/;
        const suffix = " \u2014 " + baseTitle;
        const maxTake = existingRecordings
          .filter((r) => r.title.endsWith(suffix))
          .reduce((max, r) => { const m = takeRegex.exec(r.title); return m ? Math.max(max, parseInt(m[1], 10)) : max; }, 0);
        takeNumber = maxTake + 1;
      }
      const title = `Take ${takeNumber} \u2014 ${baseTitle}`;
      const objectId = crypto.randomUUID();
      const fileExt = isMp4 ? ".mp4" : ".webm";
      const storageKey = `/objects/recordings/${userId}/${objectId}${fileExt}`;

      const finalMime = isMp4 ? "video/mp4" : (mimeType || "video/webm");
      const sizeEstimate = rawSize ? (parseInt(String(rawSize), 10) || 0) : 0;

      // Create the DB record immediately so the take appears in the list right away
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      const recording = await storage.createTeleprompterRecording({
        userId, scriptId, title, storageKey,
        mimeType: finalMime, sizeBytes: sizeEstimate,
        durationSeconds, format, expiresAt,
        processingStatus: "processing",
      });

      // Respond immediately so the client can show the take as "Processing"
      res.json(recording);

      // Finish the heavy work in the background
      (async () => {
        let uploadPath = assembledPath;
        let faststartPath: string | null = null;
        try {
          if (isMp4) {
            // Faststart remux + Opus→AAC audio transcode when needed, so the
            // downloaded file plays with audio in QuickTime/Windows players.
            const processed = await prepareTeleprompterMp4(assembledPath);
            if (processed !== assembledPath) { faststartPath = processed; uploadPath = processed; }
          }
          const sizeBytes = fs.statSync(uploadPath).size;
          const objectStorage = new ObjectStorageService();
          await objectStorage.uploadFileFromPath(uploadPath, storageKey, finalMime);
          await storage.updateTeleprompterRecording(recording.id, userId, {
            processingStatus: "complete",
            sizeBytes,
          });
          console.log(`[Teleprompter] finalize-chunked-upload complete: ${recording.id} (${sizeBytes} bytes)`);
        } catch (bgErr) {
          console.error("[Teleprompter] background GCS upload failed:", bgErr);
          try { await storage.updateTeleprompterRecording(recording.id, userId, { processingStatus: "failed" }); } catch (_) {}
        } finally {
          try { fs.unlinkSync(assembledPath); } catch (_) {}
          if (faststartPath) { try { fs.unlinkSync(faststartPath); } catch (_) {} }
        }
      })();
    } catch (err) {
      try { fs.unlinkSync(assembledPath); } catch (_) {}
      try { fs.rmSync(chunkDir, { recursive: true }); } catch (_) {}
      console.error("[Teleprompter] finalize-chunked-upload error:", err);
      res.status(500).json({ message: "Failed to finalize recording" });
    }
  });

  app.post("/api/teleprompter/recordings", requireAuth, upload.single("video"), async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "No video file received" });
    try {
      const userId = req.session.userId!;
      const scriptId = (typeof req.body.scriptId === "string" && req.body.scriptId) ? req.body.scriptId : null;
      const baseTitle = (typeof req.body.title === "string" && req.body.title.trim()) ? req.body.title.trim().slice(0, 100) : "Untitled";
      const durationSeconds = req.body.durationSeconds ? (parseInt(req.body.durationSeconds, 10) || null) : null;
      // Auto-number takes using a persistent counter on the script that only ever
      // increments — deletions never reduce it, so numbering is always correct.
      let takeNumber: number;
      if (scriptId) {
        takeNumber = await storage.incrementTeleprompterScriptTakeCount(scriptId, userId);
      } else {
        // No script attached — fall back to scanning existing titles for max number
        const existingRecordings = await storage.getTeleprompterRecordingsByUser(userId);
        const takeRegex = /^Take (\d+)\s*\u2014/;
        const suffix = " \u2014 " + baseTitle;
        const maxTake = existingRecordings
          .filter((r) => r.title.endsWith(suffix))
          .reduce((max, r) => { const m = takeRegex.exec(r.title); return m ? Math.max(max, parseInt(m[1], 10)) : max; }, 0);
        takeNumber = maxTake + 1;
      }
      const title = `Take ${takeNumber} \u2014 ${baseTitle}`;
      const format = (typeof req.body.format === "string" && ["landscape", "portrait", "square"].includes(req.body.format))
        ? req.body.format : "landscape";
      const isMp4 = file.mimetype.includes("mp4") || file.originalname.toLowerCase().endsWith(".mp4");
      const ext = path.extname(file.originalname).toLowerCase() || (isMp4 ? ".mp4" : ".webm");
      const objectId = crypto.randomUUID();
      const storageKey = `/objects/recordings/${userId}/${objectId}${ext}`;

      // Move moov atom to the front so the browser can start playing immediately,
      // and transcode Opus audio to AAC so downloads play everywhere.
      let uploadPath = file.path;
      let faststartPath: string | null = null;
      if (isMp4) {
        const processed = await prepareTeleprompterMp4(file.path);
        if (processed !== file.path) {
          faststartPath = processed;
          uploadPath = processed;
        }
      }

      const finalMime = isMp4 ? "video/mp4" : (file.mimetype || "video/webm");
      const sizeBytes = fs.statSync(uploadPath).size;
      const objectStorage = new ObjectStorageService();
      await objectStorage.uploadFileFromPath(uploadPath, storageKey, finalMime);
      try { fs.unlinkSync(file.path); } catch (_) {}
      if (faststartPath) { try { fs.unlinkSync(faststartPath); } catch (_) {} }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      const recording = await storage.createTeleprompterRecording({
        userId,
        scriptId,
        title,
        storageKey,
        mimeType: finalMime,
        sizeBytes,
        durationSeconds,
        format,
        expiresAt,
      });
      res.json(recording);
    } catch (err) {
      try { if (req.file) fs.unlinkSync(req.file.path); } catch (_) {}
      console.error("[Teleprompter] Upload recording error:", err);
      res.status(500).json({ message: "Failed to upload recording" });
    }
  });

  app.get("/api/teleprompter/recordings", requireAuth, async (req: Request, res: Response) => {
    try {
      // Lazy-clean expired recordings
      storage.deleteExpiredTeleprompterRecordings().catch(() => {});
      const recordings = await storage.getTeleprompterRecordingsByUser(req.session.userId!);
      res.json(recordings);
    } catch (err) {
      console.error("[Teleprompter] Get recordings error:", err);
      res.status(500).json({ message: "Failed to get recordings" });
    }
  });

  app.get("/api/teleprompter/recordings/:id/stream", requireAuth, async (req: Request, res: Response) => {
    console.log(`[rec-stream] id=${req.params.id} user=${req.session.userId}`);
    try {
      const recording = await storage.getTeleprompterRecording(req.params.id, req.session.userId!);
      if (!recording) { console.log(`[rec-stream] not found id=${req.params.id}`); return res.status(404).json({ message: "Recording not found" }); }
      console.log(`[rec-stream] storageKey=${recording.storageKey} size=${recording.sizeBytes} status=${recording.processingStatus}`);
      const objectStorage = new ObjectStorageService();
      // Generate a 1-hour signed GCS URL and redirect the browser directly to GCS.
      // This avoids streaming 400 MB through the Express process and gives the
      // browser native range-request support for seeking.
      const signedUrl = await objectStorage.getSignedReadUrl(recording.storageKey, 3600);
      console.log(`[rec-stream] redirecting to signed URL (ttl=3600s)`);
      return res.redirect(302, signedUrl);
    } catch (err) {
      console.error("[Teleprompter] Stream recording error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Failed to stream recording" });
    }
  });

  app.get("/api/teleprompter/recordings/:id/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const recording = await storage.getTeleprompterRecording(req.params.id, req.session.userId!);
      if (!recording) return res.status(404).json({ message: "Not found" });
      res.json({ processingStatus: recording.processingStatus });
    } catch (err) {
      res.status(500).json({ message: "Error fetching status" });
    }
  });

  // Returns a signed GCS download URL as JSON so the client can navigate to it
  // directly. This replaces the old 302-redirect approach; now the client fetches
  // this endpoint, checks for errors explicitly, and only navigates when successful —
  // avoiding the "download.json" bug where a 500 JSON error was silently saved.
  app.get("/api/teleprompter/recordings/:id/download-url", requireAuth, async (req: Request, res: Response) => {
    console.log(`[rec-download] id=${req.params.id} user=${req.session.userId}`);
    try {
      const recording = await storage.getTeleprompterRecording(req.params.id, req.session.userId!);
      if (!recording) { console.log(`[rec-download] not found id=${req.params.id}`); return res.status(404).json({ message: "Recording not found" }); }
      if (recording.processingStatus === "processing") {
        return res.status(202).json({ message: "Recording is still processing — please wait and try again." });
      }
      if (recording.processingStatus === "failed") {
        return res.status(422).json({ message: "Recording failed to upload — the file could not be saved to your account." });
      }
      const ext = path.extname(recording.storageKey) || ".mp4";
      const safeTitle = recording.title
        .replace(/\u2014/g, " - ")
        .replace(/[^\w\s().,'&!-]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100) || "recording";
      // Set Content-Disposition as object metadata (V4 signed URLs reject a
      // disposition param added after signing), then return the plain signed URL.
      // The browser navigates to it directly — no Express proxy, no 32 MiB limit.
      const objectStorage = new ObjectStorageService();
      const url = await objectStorage.getSignedDownloadUrl(recording.storageKey, 300, `${safeTitle}${ext}`);
      console.log(`[rec-download] returning signed URL for id=${req.params.id}`);
      return res.json({ url });
    } catch (err) {
      console.error("[Teleprompter] Download recording error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Failed to generate download link — the file may not have uploaded correctly." });
    }
  });

  // Legacy redirect route kept for backwards-compatibility (e.g. old emails / direct links).
  app.get("/api/teleprompter/recordings/:id/download", requireAuth, async (req: Request, res: Response) => {
    return res.redirect(302, `/api/teleprompter/recordings/${req.params.id}/download-url`);
  });

  // Transcribe a teleprompter recording on demand — downloads from GCS, extracts audio,
  // runs Gemini transcription, stores the text, then returns it.
  app.post("/api/teleprompter/recordings/:id/transcribe", requireAuth, async (req: Request, res: Response) => {
    const tmpVideoPath = path.join(UPLOADS_DIR, `rec_${req.params.id}_${Date.now()}.mp4`);
    let tmpAudioPath: string | null = null;
    try {
      const recording = await storage.getTeleprompterRecording(req.params.id, req.session.userId!);
      if (!recording) return res.status(404).json({ message: "Recording not found" });

      // If already transcribed, return cached version immediately
      if (recording.transcriptText) {
        return res.json({ transcript: recording.transcriptText });
      }

      // Download GCS object to a temp file so ffmpeg can process it
      const objectStorage = new ObjectStorageService();
      const file = await objectStorage.getObjectEntityFile(recording.storageKey);
      const [buffer] = await file.download();
      fs.writeFileSync(tmpVideoPath, buffer);

      // Extract audio
      const audioResult = await extractAudio(tmpVideoPath, UPLOADS_DIR);
      if (!audioResult.success) {
        return res.status(500).json({ message: audioResult.error || "Failed to extract audio from recording" });
      }
      tmpAudioPath = path.join(UPLOADS_DIR, audioResult.audioPath!);

      // Transcribe with Gemini
      const transcript = await transcribeAudio(tmpAudioPath);

      // Persist transcript so subsequent requests are instant
      await storage.updateTeleprompterRecording(recording.id, req.session.userId!, { transcriptText: transcript });

      res.json({ transcript });
    } catch (err: any) {
      console.error("[Teleprompter] Transcribe recording error:", err);
      if (!res.headersSent) {
        const isQuota = err?.status === 429 || err?.message?.includes("RESOURCE_EXHAUSTED") || err?.message?.includes("quota");
        res.status(isQuota ? 429 : 500).json({
          message: isQuota
            ? "Transcription limit reached — please try again in a minute."
            : "Failed to transcribe recording",
        });
      }
    } finally {
      try { if (fs.existsSync(tmpVideoPath)) fs.unlinkSync(tmpVideoPath); } catch (_) {}
      try { if (tmpAudioPath && fs.existsSync(tmpAudioPath)) fs.unlinkSync(tmpAudioPath); } catch (_) {}
    }
  });

  // Daily score usage for the current user
  app.get("/api/teleprompter/score-usage", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (user?.isAdmin) return res.json({ used: 0, limit: null, isAdmin: true });
      const used = await storage.getTodayScoreUsage(req.session.userId!);
      res.json({ used, limit: 5, isAdmin: false });
    } catch (err) {
      console.error("[Teleprompter] Score usage error:", err);
      res.status(500).json({ message: "Failed to get score usage" });
    }
  });

  // Score a recording's transcript using the 5-part formula
  app.post("/api/teleprompter/recordings/:id/score", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);

      // Enforce 5-per-day limit for non-admins
      if (!user?.isAdmin) {
        const used = await storage.getTodayScoreUsage(req.session.userId!);
        if (used >= 5) {
          return res.status(429).json({
            message: "Daily limit reached — you've used all 5 scores for today. Come back tomorrow.",
            used,
            limit: 5,
          });
        }
      }

      const recording = await storage.getTeleprompterRecording(req.params.id, req.session.userId!);
      if (!recording) return res.status(404).json({ message: "Recording not found" });
      if (!recording.transcriptText) return res.status(400).json({ message: "No transcript yet — transcribe first" });

      const result = await scoreTranscript(
        recording.transcriptText,
        "sales" as GoalType,
        recording.durationSeconds ?? 60
      );

      await storage.updateTeleprompterRecording(recording.id, req.session.userId!, {
        scoreJson: result,
        scoreGoalType: "sales" as GoalType,
      });

      // Count this score (non-admins only)
      if (!user?.isAdmin) {
        await storage.incrementScoreUsage(req.session.userId!);
      }

      res.json(result);
    } catch (err) {
      console.error("[Teleprompter] Score recording error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Failed to score recording" });
    }
  });

  // Download the stored transcript for a recording as a .txt file
  app.get("/api/teleprompter/recordings/:id/transcript.txt", requireAuth, async (req: Request, res: Response) => {
    try {
      const recording = await storage.getTeleprompterRecording(req.params.id, req.session.userId!);
      if (!recording) return res.status(404).json({ message: "Recording not found" });
      if (!recording.transcriptText) return res.status(404).json({ message: "No transcript yet — transcribe first" });

      const safeTitle = recording.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim().slice(0, 80) || `recording-${recording.id}`;
      const dateStr = new Date(recording.createdAt).toLocaleDateString();
      const content = `${recording.title}\nRecorded: ${dateStr}\n\n---\n\n${recording.transcriptText}`;

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}.txt"`);
      res.send(content);
    } catch (err) {
      console.error("[Teleprompter] Transcript download error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Failed to download transcript" });
    }
  });

  app.delete("/api/teleprompter/recordings/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const recording = await storage.getTeleprompterRecording(req.params.id, req.session.userId!);
      if (!recording) return res.status(404).json({ message: "Recording not found" });
      try {
        const objectStorage = new ObjectStorageService();
        await objectStorage.deleteObject(recording.storageKey);
      } catch (_) {}
      await storage.deleteTeleprompterRecording(req.params.id, req.session.userId!);
      res.json({ success: true });
    } catch (err) {
      console.error("[Teleprompter] Delete recording error:", err);
      res.status(500).json({ message: "Failed to delete recording" });
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
      fireWebhooks(userId, "dmo.updated", { entry, streak });
      logUserAction({
        userId,
        actionType: "dmo_logged",
        actionLabel: ActionLabels.dmo_logged,
        entityType: "dmo",
        entityId: date,
        metadata: { date, streak: streak.current },
        req,
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to save DMO entry" });
    }
  });

  app.patch("/api/dmo/entry/notes", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { date, notes } = req.body;
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "Invalid date" });
      }
      if (typeof notes !== "string") {
        return res.status(400).json({ message: "Invalid notes" });
      }
      const existing = await storage.getDmoEntry(userId, date);
      if (!existing) {
        return res.status(404).json({ message: "No DMO entry found for that date" });
      }
      const updated = await storage.updateDmoNotes(userId, date, notes);
      res.json({ entry: updated });
    } catch (err) {
      res.status(500).json({ message: "Failed to update notes" });
    }
  });

  app.get("/api/dmo/history", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const limit = Math.min(parseInt(req.query.limit as string || "60"), 1825);
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

  // DMO Settings — per-user goal targets
  app.get("/api/dmo/settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const settings = await storage.getDmoSettings(userId);
      res.json(settings);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch DMO settings" });
    }
  });

  app.post("/api/dmo/settings", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const clamp = (v: unknown, min = 1, max = 480) =>
        v != null ? Math.max(min, Math.min(max, Math.round(Number(v)))) : undefined;
      const settings = await storage.upsertDmoSettings(userId, {
        visionTarget: clamp(req.body.visionTarget),
        personalTarget: clamp(req.body.personalTarget),
        expandTarget: clamp(req.body.expandTarget),
        executionTarget: clamp(req.body.executionTarget),
        connectingTarget: clamp(req.body.connectingTarget),
      });
      res.json(settings);
    } catch (err) {
      res.status(500).json({ message: "Failed to save DMO settings" });
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
      const user = await storage.getUser(req.session.userId);
      const isAdmin = user?.isAdmin ?? false;
      // Strip seed inbox email addresses from lastPlacementResults for non-admin users.
      const rawResults = addr.lastPlacementResults as Array<Record<string, unknown>> | null;
      const lastPlacementResults = rawResults
        ? (isAdmin ? rawResults : rawResults.map(({ email: _e, ...rest }) => rest))
        : null;
      res.json({
        token: addr.token,
        email: getInboxAddress(addr.token),
        createdAt: addr.createdAt,
        sendingFromAddress: addr.sendingFromAddress || "",
        lastPlacementResults,
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
    const trimmed = sendingFromAddress.trim();
    const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    if (!EMAIL_RE.test(trimmed)) {
      return res.status(400).json({ message: "sendingFromAddress must be a valid email address" });
    }
    try {
      await storage.getOrCreateInboxAddress(req.session!.userId!);
      await storage.updateInboxSendingFrom(req.session!.userId!, trimmed);
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
      const { isServiceAccountConfigured, isServiceAccountEligible } = await import("./gmailOAuth");
      const saConfigured = isServiceAccountConfigured();
      const sanitized = inboxes.map(({ oauthAccessToken: _a, oauthRefreshToken: _r, oauthTokenExpiry: _e, imapPassword: _p, ...rest }) => {
        const base = {
          ...rest,
          serviceAccountConfigured: saConfigured && isServiceAccountEligible(rest.email),
        };
        // Non-admin members have no legitimate need for the actual seed inbox email
        // addresses — exposing them turns the shared mailboxes into a cross-tenant
        // deliverability oracle (attacker sets sendingFromAddress to a competitor's
        // domain then calls placement-check against the known seed address).
        if (!isAdmin) {
          const { email: _email, ...memberSafe } = base;
          return memberSafe;
        }
        return base;
      });
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

  app.post("/api/inbox-analyzer/seed-inboxes/:id/test", requireAdmin, async (req: Request, res: Response) => {
    try {
      const inbox = await storage.getSeedInboxById(req.params.id);
      if (!inbox) return res.status(404).json({ success: false, message: "Inbox not found" });

      const { isServiceAccountConfigured, isServiceAccountEligible } = await import("./gmailOAuth");
      const { verifyImapConnection } = await import("./imapPlacement");
      const { decryptApiKey } = await import("./storage");

      // Service Account path
      if (isServiceAccountConfigured() && isServiceAccountEligible(inbox.email)) {
        if (isServiceAccountConfigured()) {
          return res.json({ success: true, message: "Workspace Service Account is active and configured correctly." });
        }
        return res.json({ success: false, message: "Service Account not configured on this server." });
      }

      // IMAP path
      if ((inbox as any).authMethod === "imap" && (inbox as any).imapPassword) {
        const plain = decryptApiKey((inbox as any).imapPassword);
        const result = await verifyImapConnection(inbox.email, plain);
        if (result.success) {
          return res.json({ success: true, message: "IMAP connection verified — App Password is working." });
        }
        return res.json({ success: false, message: result.error || "IMAP connection failed." });
      }

      // OAuth path (legacy)
      if (inbox.isConnected && (inbox as any).oauthAccessToken) {
        return res.json({ success: true, message: "OAuth token is present. It may still expire — consider switching to App Password." });
      }

      return res.json({ success: false, message: "Inbox is not connected. Set an App Password to activate it." });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || "Test failed unexpectedly." });
    }
  });

  app.patch("/api/inbox-analyzer/seed-inboxes/:id/rename", requireAdmin, async (req: Request, res: Response) => {
    const { label } = req.body;
    if (!label || typeof label !== "string" || !label.trim()) {
      return res.status(400).json({ message: "label is required" });
    }
    try {
      await storage.renameSeedInbox(req.params.id, label.trim());
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to rename inbox" });
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

  // IMAP + App Password: connect a personal Gmail seed inbox (admin only)
  app.post("/api/inbox-analyzer/seed-inboxes/:id/connect/imap", requireAdmin, async (req: Request, res: Response) => {
    const { password } = req.body;
    if (!password || typeof password !== "string" || password.trim().length < 8) {
      return res.status(400).json({ message: "App Password is required (at least 8 characters)" });
    }
    try {
      const inbox = await storage.getSeedInboxById(req.params.id);
      if (!inbox) return res.status(404).json({ message: "Inbox not found" });
      if (inbox.provider !== "gmail") return res.status(400).json({ message: "IMAP App Password is only supported for Gmail inboxes" });

      // Verify the credentials work before saving
      const { verifyImapConnection } = await import("./imapPlacement");
      const verify = await verifyImapConnection(inbox.email, password.trim());
      if (!verify.success) {
        return res.status(400).json({ message: verify.error || "IMAP connection failed" });
      }

      // Store encrypted
      const { encryptApiKey } = await import("./storage");
      const encrypted = encryptApiKey(password.trim());
      await storage.storeImapPassword(inbox.id, encrypted);

      res.json({ success: true });
    } catch (err: any) {
      console.error("[IMAP] connect error:", err?.message);
      res.status(500).json({ message: "Failed to save App Password" });
    }
  });

  // Gmail OAuth: start connect flow (admin only) — LEGACY, kept for existing OAuth inboxes
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

      // Security: ALWAYS derive sendingFrom from the server-verified fromAddress on the
      // pinned email analysis record owned by this user.  We deliberately do NOT use
      // the user-controlled sendingFromAddress profile field here — that field can be
      // set to any arbitrary email (including a competitor's sender address) and would
      // turn the shared seed inboxes into a cross-tenant deliverability oracle.
      let sendingFrom = "";
      if (address?.placementCheckMessageId) {
        const { db } = await import("./db");
        const { emailAnalyses } = await import("../shared/schema");
        const { eq, and } = await import("drizzle-orm");
        const [pinnedEmail] = await db.select({ fromAddress: emailAnalyses.fromAddress })
          .from(emailAnalyses)
          .where(and(
            eq(emailAnalyses.messageId, address.placementCheckMessageId),
            eq(emailAnalyses.userId, userId)          // ownership check — user must own this record
          ));
        sendingFrom = pinnedEmail?.fromAddress || "";
      }

      // Validate the server-derived sendingFrom value as a plain email address.
      // Defense-in-depth: prevent any inadvertently stored operator string from
      // reaching Gmail/IMAP search even if the DB record was written by older code.
      const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
      if (!sendingFrom || !EMAIL_RE.test(sendingFrom)) {
        return res.json({ results: [], sendingFrom, message: "No pinned email found — send a test email to your seed address first" });
      }

      const allInboxes = await storage.getSeedInboxes(true); // active only
      const { checkGmailPlacementServiceAccount: saCheck, isServiceAccountConfigured, isServiceAccountEligible } = await import("./gmailOAuth");
      const { checkGmailPlacementImap } = await import("./imapPlacement");
      const saConfigured = isServiceAccountConfigured();
      // SA (DWD): Workspace accounts. IMAP: @gmail.com with App Password. Dual: both. OAuth: OAuth only.
      const connectedInboxes = allInboxes.filter(i =>
        i.provider === "gmail" && (
          (saConfigured && isServiceAccountEligible(i.email)) ||
          i.authMethod === "imap" ||
          i.authMethod === "dual" ||
          (i.isConnected && i.oauthAccessToken && !i.oauthNeedsReconnect)
        )
      );

      if (connectedInboxes.length === 0) {
        return res.json({ results: [], sendingFrom, message: "No connected seed inboxes yet" });
      }

      // Pass the pinned email context (Message-ID, subject, received-at) so the Gmail
      // query targets only the specific email under monitoring.
      const emailContext = {
        messageId: address?.placementCheckMessageId ?? null,
        receivedAt: address?.placementCheckReceivedAt ?? null,
        subject: address?.placementCheckSubject ?? null,
      };

      const results: PlacementResult[] = await Promise.all(
        connectedInboxes.map(async inbox => {
          // 1. Service Account (Google Workspace — DWD, never expires)
          if (saConfigured && isServiceAccountEligible(inbox.email)) {
            return saCheck(inbox, sendingFrom, emailContext);
          }
          // 2. IMAP + App Password (personal Gmail, permanent)
          if (inbox.authMethod === "imap") {
            return checkGmailPlacementImap(
              { id: inbox.id, label: inbox.label, email: inbox.email, provider: inbox.provider, imapPassword: inbox.imapPassword },
              sendingFrom,
              emailContext
            );
          }
          // 3. Dual mode — IMAP + OAuth both active; run in parallel, OAuth wins when definitive
          if (inbox.authMethod === "dual") {
            const DEFINITIVE = new Set(["primary","promotions","social","updates","forums","spam"]);
            const [imapS, oauthS] = await Promise.allSettled([
              checkGmailPlacementImap({ id: inbox.id, label: inbox.label, email: inbox.email, provider: inbox.provider, imapPassword: inbox.imapPassword }, sendingFrom, emailContext),
              checkGmailPlacement({ id: inbox.id, label: inbox.label, email: inbox.email, provider: inbox.provider, oauthAccessToken: inbox.oauthAccessToken, oauthRefreshToken: inbox.oauthRefreshToken }, sendingFrom, emailContext),
            ]);
            const imapRes  = imapS.status  === "fulfilled" ? imapS.value  : null;
            const oauthRes = oauthS.status === "fulfilled" ? oauthS.value : null;
            if (imapRes && oauthRes && imapRes.status !== oauthRes.status)
              console.log(`[DualMode] ${inbox.email} | IMAP:${imapRes.status} OAuth:${oauthRes.status} → using OAuth`);
            if (oauthRes && DEFINITIVE.has(oauthRes.status)) return oauthRes;
            if (imapRes  && DEFINITIVE.has(imapRes.status))  return imapRes;
            return oauthRes ?? imapRes ?? { inboxId: inbox.id, label: inbox.label, email: inbox.email, provider: inbox.provider, status: "error" as const };
          }
          // 4. OAuth only
          return checkGmailPlacement(
            { id: inbox.id, label: inbox.label, email: inbox.email, provider: inbox.provider, oauthAccessToken: inbox.oauthAccessToken, oauthRefreshToken: inbox.oauthRefreshToken },
            sendingFrom,
            emailContext
          );
        })
      );

      // Persist results so they survive page refresh
      await storage.saveLastPlacementResults(userId, results);

      // Strip seed inbox email addresses from the response for non-admin users.
      // Members have no need for the actual mailbox addresses; including them in
      // placement results would allow an attacker to enumerate shared seed inboxes
      // even after the GET /seed-inboxes email-redaction fix.
      const user = await storage.getUser(userId);
      const isAdmin = user?.isAdmin ?? false;
      const sanitizedResults = isAdmin
        ? results
        : results.map(({ email: _email, ...rest }) => rest);

      res.json({ results: sanitizedResults, sendingFrom });
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
      const user = await storage.getUser(req.session.userId);
      const isAdmin = user?.isAdmin ?? false;
      // Strip seed inbox email addresses from placementResults for non-admin users.
      const sanitized = isAdmin ? emails : emails.map(e => ({
        ...e,
        placementResults: Array.isArray(e.placementResults)
          ? (e.placementResults as Array<Record<string, unknown>>).map(({ email: _em, ...rest }) => rest)
          : e.placementResults,
      }));
      res.json(sanitized);
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
      const user = await storage.getUser(req.session.userId);
      const isAdmin = user?.isAdmin ?? false;
      // Strip seed inbox email addresses from placementResults for non-admin users.
      const sanitized = isAdmin ? email : {
        ...email,
        placementResults: Array.isArray(email.placementResults)
          ? (email.placementResults as Array<Record<string, unknown>>).map(({ email: _em, ...rest }) => rest)
          : email.placementResults,
      };
      res.json(sanitized);
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
  app.post("/api/inbox-analyzer/emails/:id/resend-report", requireAuth, async (req: Request, res: Response) => {
    try {
      const emailId = req.params.id;
      const userId = req.session.userId!;
      const analysis = await storage.getEmailAnalysis(emailId, userId);
      if (!analysis) return res.status(404).json({ message: "Email not found" });
      if (analysis.status !== "complete") return res.status(400).json({ message: "Analysis is not complete yet" });
      if (!analysis.placementConfirmedAt) return res.status(400).json({ message: "Placement monitoring has not finished yet" });

      const user = await storage.getUser(userId);
      if (!user?.email) return res.status(400).json({ message: "No email address on your account" });

      const [resources] = await Promise.all([storage.getActiveEmailResources()]);
      const { inboxAnalysisReportEmail } = await import("./email-templates");
      const { sendEmail } = await import("./email-sendgrid");
      const tpl = inboxAnalysisReportEmail({
        firstName: user.firstName ?? null,
        analysisId: analysis.id,
        subject: analysis.subject,
        fromName: analysis.fromName ?? null,
        fromAddress: analysis.fromAddress,
        sendingDomain: analysis.sendingDomain ?? null,
        receivedAt: analysis.receivedAt ?? null,
        overallScore: analysis.overallScore ?? null,
        spfResult: analysis.spfResult ?? null,
        dkimResult: analysis.dkimResult ?? null,
        dmarcResult: analysis.dmarcResult ?? null,
        spamFlags: (analysis.spamFlags as any[] | null) ?? null,
        technicalHealth: (analysis.technicalHealth as any) ?? null,
        contentQuality: (analysis.contentQuality as any) ?? null,
        canSpamCompliance: (analysis.canSpamCompliance as any) ?? null,
        aiSuggestions: (analysis.copyFeedback as any)?.topSuggestions ?? null,
        placementResults: Array.isArray(analysis.placementResults)
          ? (analysis.placementResults as any[]).map((r: any) => ({ label: r.label, email: r.email, status: r.status }))
          : null,
      }, resources);
      await sendEmail({ to: user.email, ...tpl });
      await storage.logNotification(userId, "inbox_report_ready_resend", analysis.id);
      return res.json({ message: "Report sent to " + user.email });
    } catch (err) {
      console.error("[inbox-analyzer] resend-report error:", err);
      res.status(500).json({ message: "Failed to send report" });
    }
  });

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
          const contentQuality = analyzeContentQuality(bodyText, bodyHtml, subject);
          const canSpamCompliance = analyzeCanSpamCompliance(bodyText, bodyHtml, subject);
          const senderTrust = await analyzeSenderTrust(fromRaw, replyTo || undefined, sendingIp, sendingDomain, bodyHtml);

          // Debug: log intermediate values so we can see what the analysis found
          {
            const _totalAnchors = ((bodyHtml || "").match(/<a\b/gi) || []).length;
            const _anchorBlocks = ((bodyHtml || "").match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || []).length;
            const _bodyTextWords = (bodyText || "").trim().split(/\s+/).filter(Boolean).length;
            console.log(`[reanalyze-debug] emailId=${emailId} bodyText.len=${bodyText.length} bodyHtml.len=${bodyHtml.length} bodyTextWords=${_bodyTextWords} wordCount=${contentQuality.wordCount} totalAnchors=${_totalAnchors} anchorBlocks=${_anchorBlocks} linkCount=${contentQuality.linkCount} ratio=${contentQuality.linkToTextRatio?.toFixed(4)}`);
            console.log(`[reanalyze-debug] bodyTextPreview=${JSON.stringify((bodyText || "").slice(0, 400))}`);
          }

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

          // Always re-run placement on reanalyze so that bug fixes (e.g. subject
          // truncation) take effect retroactively — don't skip even if we already
          // have confirmed results.
          try {
            // Security: always derive the sender from the server-trusted fromAddress
            // on the analysis record (owned by this user). Ignore sendingFromAddress —
            // it's user-controlled and must not be used to query shared seed inboxes.
            const EMAIL_RE_RA = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
            const senderForPlacement = EMAIL_RE_RA.test((fromAddress || "").trim()) ? fromAddress.trim() : "";
            const allInboxes = await storage.getSeedInboxes(true);
            const { checkGmailPlacement, checkGmailPlacementServiceAccount: saCheck2, isServiceAccountConfigured: isSA, isServiceAccountEligible: isSAEligible } = await import("./gmailOAuth");
            const { checkGmailPlacementImap: imapCheck2 } = await import("./imapPlacement");
            const useSA = isSA();
            const connectedInboxes = allInboxes.filter(i =>
              i.provider === "gmail" && (
                (useSA && isSAEligible(i.email)) ||
                i.authMethod === "imap" ||
                i.authMethod === "dual" ||
                (i.isConnected && i.oauthAccessToken && !i.oauthNeedsReconnect)
              )
            );
            if (connectedInboxes.length > 0 && senderForPlacement) {
              const emailCtx = {
                messageId: analysis.messageId ?? null,
                receivedAt: analysis.receivedAt ? new Date(analysis.receivedAt as unknown as string) : null,
                subject: analysis.subject ?? null,
              };
              // Re-open the monitoring window pinned to THIS email so the scheduler
              // also picks it up for follow-up checks.
              const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;
              await storage.setPlacementAutoCheckWindow(
                userId,
                new Date(Date.now() + TWENTY_FOUR_H),
                {
                  receivedAt: emailCtx.receivedAt ?? new Date(),
                  subject: emailCtx.subject ?? "",
                  messageId: emailCtx.messageId ?? undefined,
                }
              );
              const placementResults = await Promise.all(
                connectedInboxes.map(async inbox => {
                  if (useSA && isSAEligible(inbox.email)) return saCheck2(inbox, senderForPlacement, emailCtx);
                  if (inbox.authMethod === "imap") return imapCheck2({ id: inbox.id, label: inbox.label, email: inbox.email, provider: inbox.provider, imapPassword: inbox.imapPassword }, senderForPlacement, emailCtx);
                  if (inbox.authMethod === "dual") {
                    const DEFINITIVE = new Set(["primary","promotions","social","updates","forums","spam"]);
                    const [imapS, oauthS] = await Promise.allSettled([
                      imapCheck2({ id: inbox.id, label: inbox.label, email: inbox.email, provider: inbox.provider, imapPassword: inbox.imapPassword }, senderForPlacement, emailCtx),
                      checkGmailPlacement({ id: inbox.id, label: inbox.label, email: inbox.email, provider: inbox.provider, oauthAccessToken: inbox.oauthAccessToken, oauthRefreshToken: inbox.oauthRefreshToken }, senderForPlacement, emailCtx),
                    ]);
                    const imapRes  = imapS.status  === "fulfilled" ? imapS.value  : null;
                    const oauthRes = oauthS.status === "fulfilled" ? oauthS.value : null;
                    if (imapRes && oauthRes && imapRes.status !== oauthRes.status)
                      console.log(`[DualMode] ${inbox.email} | IMAP:${imapRes.status} OAuth:${oauthRes.status} → using OAuth`);
                    if (oauthRes && DEFINITIVE.has(oauthRes.status)) return oauthRes;
                    if (imapRes  && DEFINITIVE.has(imapRes.status))  return imapRes;
                    return oauthRes ?? imapRes ?? { inboxId: inbox.id, label: inbox.label, email: inbox.email, provider: inbox.provider, status: "error" as const };
                  }
                  return checkGmailPlacement({ id: inbox.id, label: inbox.label, email: inbox.email, provider: inbox.provider, oauthAccessToken: inbox.oauthAccessToken, oauthRefreshToken: inbox.oauthRefreshToken }, senderForPlacement, emailCtx);
                })
              );
              await storage.saveLastPlacementResults(userId, placementResults);
              // If all inboxes resolved definitively, lock in immediately on the email record
              const DEFINITIVE = new Set(["primary", "promotions", "social", "updates", "forums", "spam"]);
              if (placementResults.length > 0 && placementResults.every(r => DEFINITIVE.has(r.status))) {
                if (analysis.messageId) {
                  await storage.saveEmailPlacementResults(analysis.messageId, userId, placementResults);
                }
                await storage.setPlacementAutoCheckWindow(userId, null);
              }
              console.log(`[inbox-analyzer] reanalyze ran placement check for email ${emailId}: ${placementResults.map(r => `${r.label}:${r.status}`).join(", ")}`);
            }
          } catch (placementErr: any) {
            console.error("[inbox-analyzer] reanalyze placement check error:", placementErr?.message);
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

  // Retry placement only — re-opens the 24-h window for a specific email and immediately
  // runs a fresh placement check. Returns results synchronously so the UI can update right away.
  app.post("/api/inbox-analyzer/emails/:id/retry-placement", requireAuth, async (req: Request, res: Response) => {
    try {
      const emailId = req.params.id;
      const userId  = req.session.userId!;
      const analysis = await storage.getEmailAnalysis(emailId, userId);
      if (!analysis) return res.status(404).json({ message: "Email not found" });

      // Security: always derive the sender from the server-trusted fromAddress on
      // the analysis record (owned by this user). Ignore sendingFromAddress —
      // it's user-controlled and must not be used to query shared seed inboxes.
      const EMAIL_RE_RP = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
      const senderForPlacement = EMAIL_RE_RP.test((analysis.fromAddress || "").trim())
        ? analysis.fromAddress!.trim()
        : "";
      if (!senderForPlacement) {
        return res.status(400).json({ message: "No valid sending address found on this email record." });
      }

      const allInboxes = await storage.getSeedInboxes(true);
      const { checkGmailPlacement, checkGmailPlacementServiceAccount: saCheck, isServiceAccountConfigured: isSA, isServiceAccountEligible: isSAEligible } = await import("./gmailOAuth");
      const { checkGmailPlacementImap: imapCheck } = await import("./imapPlacement");
      const useSA = isSA();
      const connectedInboxes = allInboxes.filter(i =>
        i.provider === "gmail" && (
          (useSA && isSAEligible(i.email)) ||
          i.authMethod === "imap" ||
          i.authMethod === "dual" ||
          (i.isConnected && i.oauthAccessToken && !i.oauthNeedsReconnect)
        )
      );

      if (connectedInboxes.length === 0) {
        return res.json({ results: [], message: "No connected seed inboxes" });
      }

      const emailCtx = {
        messageId: analysis.messageId ?? null,
        receivedAt: analysis.receivedAt ? new Date(analysis.receivedAt as unknown as string) : null,
        subject: analysis.subject ?? null,
      };

      // Re-open a fresh 24-h monitoring window pinned to this email
      const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;
      await storage.setPlacementAutoCheckWindow(userId, new Date(Date.now() + TWENTY_FOUR_H), {
        receivedAt: emailCtx.receivedAt ?? new Date(),
        subject: emailCtx.subject ?? "",
        messageId: emailCtx.messageId ?? undefined,
      });

      // Run the check immediately
      const results = await Promise.all(
        connectedInboxes.map(async inbox => {
          if (useSA && isSAEligible(inbox.email)) return saCheck(inbox, senderForPlacement, emailCtx);
          if (inbox.authMethod === "imap") return imapCheck({ id: inbox.id, label: inbox.label, email: inbox.email, provider: inbox.provider, imapPassword: inbox.imapPassword }, senderForPlacement, emailCtx);
          if (inbox.authMethod === "dual") {
            const DEFINITIVE = new Set(["primary","promotions","social","updates","forums","spam"]);
            const [imapS, oauthS] = await Promise.allSettled([
              imapCheck({ id: inbox.id, label: inbox.label, email: inbox.email, provider: inbox.provider, imapPassword: inbox.imapPassword }, senderForPlacement, emailCtx),
              checkGmailPlacement({ id: inbox.id, label: inbox.label, email: inbox.email, provider: inbox.provider, oauthAccessToken: inbox.oauthAccessToken, oauthRefreshToken: inbox.oauthRefreshToken }, senderForPlacement, emailCtx),
            ]);
            const imapRes  = imapS.status  === "fulfilled" ? imapS.value  : null;
            const oauthRes = oauthS.status === "fulfilled" ? oauthS.value : null;
            if (imapRes && oauthRes && imapRes.status !== oauthRes.status)
              console.log(`[DualMode] ${inbox.email} | IMAP:${imapRes.status} OAuth:${oauthRes.status} → using OAuth`);
            if (oauthRes && DEFINITIVE.has(oauthRes.status)) return oauthRes;
            if (imapRes  && DEFINITIVE.has(imapRes.status))  return imapRes;
            return oauthRes ?? imapRes ?? { inboxId: inbox.id, label: inbox.label, email: inbox.email, provider: inbox.provider, status: "error" as const };
          }
          return checkGmailPlacement({ id: inbox.id, label: inbox.label, email: inbox.email, provider: inbox.provider, oauthAccessToken: inbox.oauthAccessToken, oauthRefreshToken: inbox.oauthRefreshToken }, senderForPlacement, emailCtx);
        })
      );

      await storage.saveLastPlacementResults(userId, results);

      // Lock in immediately if all inboxes returned a definitive result
      const DEFINITIVE = new Set(["primary", "promotions", "social", "updates", "forums", "spam"]);
      if (results.length > 0 && results.every(r => DEFINITIVE.has(r.status))) {
        if (analysis.messageId) await storage.saveEmailPlacementResults(analysis.messageId, userId, results);
        await storage.setPlacementAutoCheckWindow(userId, null);
      }

      console.log(`[retry-placement] email ${emailId}: ${results.map(r => `${r.label}:${r.status}`).join(", ")}`);

      // Strip seed inbox email addresses from the response for non-admin users.
      const retryUser = await storage.getUser(userId);
      const retryIsAdmin = retryUser?.isAdmin ?? false;
      const sanitizedRetryResults = retryIsAdmin
        ? results
        : results.map(({ email: _email, ...rest }) => rest);

      res.json({ results: sanitizedRetryResults, sendingFrom: senderForPlacement });
    } catch (err: any) {
      console.error("[retry-placement] error:", err?.message);
      res.status(500).json({ message: "Failed to retry placement check" });
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
      // lastPlacementCheckedAt is stamped as 10 minutes ago inside setPlacementAutoCheckWindow,
      // so the 15-min scheduler throttle fires the first real check ~5 minutes after arrival —
      // enough time for Gmail's spam filters to finish, but fast enough to show a quick result.
      // A confirmation check then runs 15 minutes after that first check.
      // Two consecutive matching checks are required before monitoring stops.
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
          const contentQuality = analyzeContentQuality(bodyText, bodyHtml, subject);
          const canSpamCompliance = analyzeCanSpamCompliance(bodyText, bodyHtml, subject);
          const senderTrust = await analyzeSenderTrust(fromRaw, replyTo || undefined, sendingIp, sendingDomain, bodyHtml);

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
      const domainRows = await storage.getPostmasterDomains(userId);
      // Ensure trafficStats is always an array — it can be null in the DB if the initial
      // sync failed after OAuth completed (domain row inserted but stats never written).
      const domains = domainRows.map(d => ({
        ...d,
        trafficStats: Array.isArray(d.trafficStats) ? d.trafficStats : [],
      }));
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
      // Delete domain data first, then the connection. Domain rows are NOT foreign-keyed
      // to the connection row, so they must be removed explicitly — otherwise they become
      // orphaned and appear again if the user reconnects with a different Google account.
      await storage.deletePostmasterDomains(userId);
      await storage.deletePostmasterConnection(userId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to disconnect" });
    }
  });

  // ── Analytics: YouTube ─────────────────────────────────────────────────────

  app.get("/api/analytics/youtube/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const conn = await storage.getYouTubeConnection(userId);
      if (!conn?.oauthAccessToken) return res.json({ connected: false });

      const STATUS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — channel stats change slowly
      const [cachedStatus, currentUser] = await Promise.all([
        storage.getYoutubeAnalyticsCache(userId, "channel-status"),
        storage.getUser(userId),
      ]);
      const isAdmin = currentUser?.isAdmin ?? false;

      // Serve from cache when fresh — avoids a live YouTube API call on every page open
      if (cachedStatus && (Date.now() - cachedStatus.updatedAt.getTime() < STATUS_CACHE_TTL_MS)) {
        return res.json({ connected: true, connectedEmail: conn.connectedEmail, channel: cachedStatus.data, isAdmin, channelId: (cachedStatus.data as any).id });
      }

      // Cache cold or stale — call live API, then cache the result
      try {
        const channel = await fetchYouTubeChannel(conn.oauthAccessToken, conn.oauthRefreshToken);
        await Promise.all([
          storage.updateYouTubeChannel(userId, {
            channelId: channel.id,
            channelTitle: channel.title,
            channelHandle: channel.handle,
            channelThumbnail: channel.thumbnail,
            uploadsPlaylistId: channel.uploadsPlaylistId,
          }),
          storage.setYoutubeAnalyticsCache(userId, "channel-status", channel),
        ]);
        return res.json({ connected: true, connectedEmail: conn.connectedEmail, channel, isAdmin, channelId: channel.id });
      } catch (apiErr: any) {
        console.error("[Analytics/YouTube] status API error:", apiErr?.message);
        // Fall back to DB-stored metadata (subscriber/view counts will be 0 if never cached)
        const fallbackChannel = conn.channelId
          ? { id: conn.channelId, title: conn.channelTitle, handle: conn.channelHandle, thumbnail: conn.channelThumbnail, subscriberCount: 0, videoCount: 0, viewCount: 0, uploadsPlaylistId: conn.uploadsPlaylistId }
          : null;
        return res.json({ connected: true, connectedEmail: conn.connectedEmail, channel: fallbackChannel, isAdmin });
      }
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch YouTube status" });
    }
  });

  app.get("/api/analytics/youtube/connect", requireAuth, (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      res.redirect(getYouTubeAuthUrl(userId));
    } catch (err) {
      res.status(500).json({ message: "Failed to initiate YouTube OAuth" });
    }
  });

  app.get("/api/analytics/youtube/callback", async (req: Request, res: Response) => {
    const { code, state: userId, error } = req.query as Record<string, string>;
    if (error || !code || !userId) return res.redirect("/analytics/youtube?error=oauth_failed");
    try {
      const { accessToken, refreshToken, expiry, email } = await exchangeYouTubeCode(code);
      await storage.upsertYouTubeConnection(userId, { oauthAccessToken: accessToken, oauthRefreshToken: refreshToken, oauthTokenExpiry: expiry, connectedEmail: email });
      try {
        const channel = await fetchYouTubeChannel(accessToken, refreshToken);
        await storage.updateYouTubeChannel(userId, { channelId: channel.id, channelTitle: channel.title, channelHandle: channel.handle, channelThumbnail: channel.thumbnail, uploadsPlaylistId: channel.uploadsPlaylistId });
      } catch (channelErr) {
        console.error("[Analytics/YouTube] Initial channel fetch failed:", channelErr);
      }
      res.redirect("/analytics/youtube");
    } catch (err) {
      console.error("[Analytics/YouTube] OAuth callback error:", err);
      res.redirect("/analytics/youtube?error=oauth_failed");
    }
  });

  const YT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  function ytCacheValid(updatedAt: Date): boolean {
    return Date.now() - updatedAt.getTime() < YT_CACHE_TTL_MS;
  }

  app.get("/api/analytics/youtube/videos", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const conn = await storage.getYouTubeConnection(userId);
      if (!conn?.oauthAccessToken) return res.status(401).json({ message: "Not connected" });
      if (!conn.uploadsPlaylistId) return res.json([]);
      const cached = await storage.getYoutubeAnalyticsCache(userId, "videos");
      if (cached && ytCacheValid(cached.updatedAt)) return res.json(cached.data);
      const videos = await fetchYouTubeVideos(conn.oauthAccessToken, conn.oauthRefreshToken, conn.uploadsPlaylistId);
      await storage.setYoutubeAnalyticsCache(userId, "videos", videos);
      res.json(videos);
    } catch (err: any) {
      console.error("[Analytics/YouTube] videos error:", err?.message);
      res.status(500).json({ message: "Failed to fetch videos" });
    }
  });

  app.post("/api/analytics/youtube/refresh", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const conn = await storage.getYouTubeConnection(userId);
      if (!conn?.oauthAccessToken) return res.status(400).json({ message: "Not connected" });
      const channel = await fetchYouTubeChannel(conn.oauthAccessToken, conn.oauthRefreshToken);
      await storage.updateYouTubeChannel(userId, { channelId: channel.id, channelTitle: channel.title, channelHandle: channel.handle, channelThumbnail: channel.thumbnail, uploadsPlaylistId: channel.uploadsPlaylistId });
      await storage.clearYoutubeAnalyticsCache(userId);
      res.json({ success: true });
    } catch (err: any) {
      console.error("[Analytics/YouTube] refresh error:", err?.message);
      res.status(500).json({ message: "Failed to refresh" });
    }
  });

  app.delete("/api/analytics/youtube/disconnect", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      await storage.deleteYouTubeConnection(userId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to disconnect" });
    }
  });

  app.get("/api/analytics/youtube/channel-analytics", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const conn = await storage.getYouTubeConnection(userId);
      if (!conn?.oauthAccessToken) return res.status(401).json({ message: "Not connected" });
      const days = Math.min(Math.max(parseInt(req.query.days as string || "28"), 7), 365);
      const cacheKey = `channel-analytics-${days}`;
      const cached = await storage.getYoutubeAnalyticsCache(userId, cacheKey);
      if (cached && ytCacheValid(cached.updatedAt)) return res.json(cached.data);
      const result = await fetchChannelAnalytics(conn.oauthAccessToken, conn.oauthRefreshToken, days);
      const payload = result ?? { timeSeries: [], totals: null, error: "analytics_unavailable" };
      await storage.setYoutubeAnalyticsCache(userId, cacheKey, payload);
      res.json(payload);
    } catch (err: any) {
      console.error("[Analytics/YouTube] channel-analytics error:", err?.message);
      res.status(500).json({ message: "Failed to fetch channel analytics" });
    }
  });

  app.get("/api/analytics/youtube/breakdowns", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const conn = await storage.getYouTubeConnection(userId);
      if (!conn?.oauthAccessToken) return res.status(401).json({ message: "Not connected" });
      const days = Math.min(Math.max(parseInt(req.query.days as string || "28"), 7), 365);
      const cacheKey = `breakdowns-${days}`;
      const cached = await storage.getYoutubeAnalyticsCache(userId, cacheKey);
      if (cached && ytCacheValid(cached.updatedAt)) return res.json(cached.data);
      const [traffic, devices, countries, demographics, searchTerms, subscriberStatus] = await Promise.all([
        fetchTrafficSources(conn.oauthAccessToken, conn.oauthRefreshToken, days),
        fetchDeviceBreakdown(conn.oauthAccessToken, conn.oauthRefreshToken, days),
        fetchTopCountries(conn.oauthAccessToken, conn.oauthRefreshToken, days),
        fetchDemographics(conn.oauthAccessToken, conn.oauthRefreshToken, days),
        fetchTopSearchTerms(conn.oauthAccessToken, conn.oauthRefreshToken, days),
        fetchSubscriberStatus(conn.oauthAccessToken, conn.oauthRefreshToken, days),
      ]);
      const payload = { traffic, devices, countries, demographics, searchTerms, subscriberStatus };
      await storage.setYoutubeAnalyticsCache(userId, cacheKey, payload);
      res.json(payload);
    } catch (err: any) {
      console.error("[Analytics/YouTube] breakdowns error:", err?.message);
      res.status(500).json({ message: "Failed to fetch breakdowns" });
    }
  });

  app.get("/api/analytics/youtube/video-analytics", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const conn = await storage.getYouTubeConnection(userId);
      if (!conn?.oauthAccessToken) return res.status(401).json({ message: "Not connected" });
      const days = Math.min(Math.max(parseInt(req.query.days as string || "28"), 7), 365);
      const cacheKey = `video-analytics-${days}`;
      const cached = await storage.getYoutubeAnalyticsCache(userId, cacheKey);
      if (cached && ytCacheValid(cached.updatedAt)) return res.json(cached.data);
      const result = await fetchVideoAnalytics(conn.oauthAccessToken, conn.oauthRefreshToken, days);
      await storage.setYoutubeAnalyticsCache(userId, cacheKey, result);
      res.json(result);
    } catch (err: any) {
      console.error("[Analytics/YouTube] video-analytics error:", err?.message);
      res.status(500).json({ message: "Failed to fetch video analytics" });
    }
  });

  // ── YouTube: Comments & Canned Responses ────────────────────────────────────

  app.get("/api/analytics/youtube/video/:videoId/comments", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const conn = await storage.getYouTubeConnection(userId);
      if (!conn?.oauthAccessToken) return res.status(401).json({ message: "Not connected" });
      const { videoId } = req.params;
      const pageToken = req.query.pageToken as string | undefined;
      const orderRaw = req.query.order as string | undefined;
      const order: "relevance" | "time" = orderRaw === "time" ? "time" : "relevance";
      const result = await fetchVideoComments(conn.oauthAccessToken, conn.oauthRefreshToken, videoId, pageToken, order);
      res.json(result);
    } catch (err: any) {
      console.error("[YouTube] comments error:", err?.message);
      if (err?.code === "insufficient_scopes" || String(err?.message).includes("insufficient")) {
        return res.status(403).json({ message: "requires_reconnect", requiresReconnect: true });
      }
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.post("/api/analytics/youtube/comments/:commentId/reply", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const conn = await storage.getYouTubeConnection(userId);
      if (!conn?.oauthAccessToken) return res.status(401).json({ message: "Not connected" });
      const { commentId } = req.params;
      const { text } = req.body;
      if (!text?.trim()) return res.status(400).json({ message: "Reply text is required" });
      const result = await postCommentReply(conn.oauthAccessToken, conn.oauthRefreshToken, commentId, text.trim());
      res.json(result);
    } catch (err: any) {
      console.error("[YouTube] reply error:", err?.message);
      const msg = String(err?.message || "");
      if (err?.code === 403 || err?.status === 403 || msg.includes("forbidden") || msg.includes("insufficientPermissions") || msg.includes("403")) {
        return res.status(403).json({ message: "requires_reconnect", requiresReconnect: true });
      }
      res.status(500).json({ message: "Failed to post reply" });
    }
  });

  app.get("/api/analytics/youtube/canned-responses", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const responses = await storage.getCannedResponses(userId);
      res.json(responses);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to fetch canned responses" });
    }
  });

  app.post("/api/analytics/youtube/canned-responses", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const parsed = insertCannedResponseSchema.omit({ userId: true }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data" });
      const response = await storage.createCannedResponse(userId, parsed.data);
      res.json(response);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to create canned response" });
    }
  });

  app.patch("/api/analytics/youtube/canned-responses/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const { id } = req.params;
      const { title, body } = req.body;
      const updated = await storage.updateCannedResponse(id, userId, { title, body });
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to update canned response" });
    }
  });

  app.delete("/api/analytics/youtube/canned-responses/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const { id } = req.params;
      await storage.deleteCannedResponse(id, userId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to delete canned response" });
    }
  });

  // ── YouTube: All Comments (cached, last-12-months videos) ──────────────────

  app.post("/api/analytics/youtube/all-comments", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const conn = await storage.getYouTubeConnection(userId);
      if (!conn?.oauthAccessToken) return res.status(401).json({ message: "Not connected" });

      const { videos, forceRefresh = false } = req.body as {
        videos: { id: string; title: string; thumbnail: string; publishedAt?: string }[];
        forceRefresh?: boolean;
      };
      if (!Array.isArray(videos) || videos.length === 0) {
        return res.json({ threads: [], cacheHits: 0, apiFetches: 0 });
      }

      const channelId = conn.channelId || "";
      const now = Date.now();
      const TWO_HOURS   = 2  * 60 * 60 * 1000;
      const TWENTY_FOUR = 24 * 60 * 60 * 1000;
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

      let cacheHits = 0, apiFetches = 0;
      const allThreads: any[] = [];

      await Promise.all(videos.map(async (video) => {
        const cacheRow = await storage.getYoutubeCommentCache(userId, video.id);

        let isFresh = false;
        if (!forceRefresh && cacheRow) {
          const videoAge = video.publishedAt
            ? now - new Date(video.publishedAt).getTime()
            : THIRTY_DAYS + 1;
          const ttl = videoAge < THIRTY_DAYS ? TWO_HOURS : TWENTY_FOUR;
          isFresh = (now - new Date(cacheRow.cachedAt).getTime()) < ttl;
        }

        let threads: any[] = [];
        if (isFresh && cacheRow) {
          threads = cacheRow.threads as any[];
          cacheHits++;
        } else {
          try {
            const result = await fetchVideoComments(
              conn.oauthAccessToken!,
              conn.oauthRefreshToken,
              video.id,
              undefined,
              "time"
            );
            threads = result.threads || [];
            await storage.upsertYoutubeCommentCache(userId, {
              videoId: video.id,
              videoTitle: video.title,
              videoThumbnail: video.thumbnail,
              videoPublishedAt: video.publishedAt ? new Date(video.publishedAt) : null,
              threads,
              totalResults: result.totalResults || threads.length,
            });
            apiFetches++;
          } catch (err: any) {
            if (err?.code === "insufficient_scopes") throw err;
            threads = (cacheRow?.threads as any[]) || [];
          }
        }

        for (const t of threads) {
          const isReplied = channelId
            ? (t.replies || []).some((r: any) => r.authorChannelId === channelId)
            : false;
          allThreads.push({
            ...t,
            videoId: video.id,
            videoTitle: video.title,
            videoThumbnail: video.thumbnail,
            isReplied,
          });
        }
      }));

      allThreads.sort((a, b) =>
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );

      res.json({ threads: allThreads, cacheHits, apiFetches });
    } catch (err: any) {
      console.error("[YouTube] all-comments error:", err?.message);
      if (err?.code === "insufficient_scopes" || String(err?.message).includes("insufficient")) {
        return res.status(403).json({ message: "requires_reconnect", requiresReconnect: true });
      }
      res.status(500).json({ message: "Failed to fetch comments" });
    }
  });

  app.post("/api/analytics/youtube/all-comments/refresh", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      await storage.clearYoutubeCommentCache(userId);
      res.json({ cleared: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to clear cache" });
    }
  });

  // ── YouTube: Video Metadata (title + description + tags + categoryId) ────────

  app.get("/api/analytics/youtube/video-metadata", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const conn = await storage.getYouTubeConnection(userId);
      if (!conn?.oauthAccessToken || !conn.uploadsPlaylistId) {
        return res.status(401).json({ message: "Not connected" });
      }
      const metadata = await fetchVideoMetadata(
        conn.oauthAccessToken, conn.oauthRefreshToken, conn.uploadsPlaylistId
      );
      res.json(metadata);
    } catch (err: any) {
      console.error("[YouTube] video-metadata error:", err?.message);
      res.status(500).json({ message: "Failed to fetch video metadata" });
    }
  });

  // ── YouTube: Bulk Update ─────────────────────────────────────────────────────

  app.post("/api/analytics/youtube/bulk-update", requireAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const conn = await storage.getYouTubeConnection(userId);
      if (!conn?.oauthAccessToken) return res.status(401).json({ message: "Not connected" });

      const { updates } = req.body as {
        updates: { id: string; title: string; description: string; tags: string[]; categoryId: string; defaultLanguage?: string }[];
      };
      if (!Array.isArray(updates) || updates.length === 0) {
        return res.json({ results: [] });
      }

      const results: { id: string; title: string; success: boolean; error?: string }[] = [];
      for (const update of updates) {
        try {
          await bulkUpdateVideo(conn.oauthAccessToken, conn.oauthRefreshToken, update);
          results.push({ id: update.id, title: update.title, success: true });
        } catch (err: any) {
          const msg = err?.message || "Unknown error";
          results.push({ id: update.id, title: update.title, success: false, error: msg });
        }
        // Small delay to avoid hammering quota too fast
        await new Promise((r) => setTimeout(r, 80));
      }

      res.json({ results });
    } catch (err: any) {
      console.error("[YouTube] bulk-update error:", err?.message);
      res.status(500).json({ message: "Failed to apply bulk updates" });
    }
  });

  // ── Analytics: Google Search Console ───────────────────────────────────────

  const GSC_STATUS_CACHE_TTL = 60 * 60 * 1000;        // 1 hour — sites list rarely changes
  const GSC_DATA_CACHE_TTL   = 24 * 60 * 60 * 1000;   // 24 hours — mirrors YouTube pattern

  app.get("/api/analytics/gsc/status", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const conn = await storage.getGscConnection(userId);
      if (!conn?.oauthAccessToken) return res.json({ connected: false });

      // Serve from cache when fresh — avoids a live Google API call on every page open
      const cached = await storage.getGscAnalyticsCache(userId, "gsc-status");
      if (cached && (Date.now() - cached.updatedAt.getTime() < GSC_STATUS_CACHE_TTL)) {
        const { sites, selectedSiteUrl } = cached.data as { sites: string[]; selectedSiteUrl: string | null };
        return res.json({ connected: true, connectedEmail: conn.connectedEmail, sites, selectedSiteUrl });
      }

      try {
        const onTokenRefresh = (t: string, exp: Date | null) => storage.updateGscAccessToken(userId, t, exp).catch(() => {});
        const sites = await fetchGscSites(conn.oauthAccessToken, conn.oauthRefreshToken, onTokenRefresh);
        const selectedSiteUrl = conn.selectedSiteUrl && sites.includes(conn.selectedSiteUrl)
          ? conn.selectedSiteUrl
          : (sites.length === 1 ? sites[0] : null);
        if (selectedSiteUrl && selectedSiteUrl !== conn.selectedSiteUrl) {
          await storage.setGscSelectedSite(userId, selectedSiteUrl);
        }
        await storage.setGscAnalyticsCache(userId, "gsc-status", { sites, selectedSiteUrl });
        return res.json({ connected: true, connectedEmail: conn.connectedEmail, sites, selectedSiteUrl });
      } catch (apiErr: any) {
        console.error("[Analytics/GSC] status API error:", apiErr?.message);
        return res.json({ connected: true, connectedEmail: conn.connectedEmail, sites: [], selectedSiteUrl: conn.selectedSiteUrl });
      }
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch GSC status" });
    }
  });

  app.get("/api/analytics/gsc/connect", requireAuth, (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      res.redirect(getGscAuthUrl(userId));
    } catch (err) {
      res.status(500).json({ message: "Failed to initiate GSC OAuth" });
    }
  });

  app.get("/api/analytics/gsc/callback", async (req: Request, res: Response) => {
    const { code, state: userId, error } = req.query as Record<string, string>;
    if (error || !code || !userId) return res.redirect("/analytics/search-console?error=oauth_failed");
    try {
      const { accessToken, refreshToken, expiry, email } = await exchangeGscCode(code);
      await storage.upsertGscConnection(userId, { oauthAccessToken: accessToken, oauthRefreshToken: refreshToken, oauthTokenExpiry: expiry, connectedEmail: email });
      try {
        const sites = await fetchGscSites(accessToken, refreshToken);
        if (sites.length === 1) await storage.setGscSelectedSite(userId, sites[0]);
      } catch (sitesErr) {
        console.error("[Analytics/GSC] Initial sites fetch failed:", sitesErr);
      }
      res.redirect("/analytics/search-console");
    } catch (err) {
      console.error("[Analytics/GSC] OAuth callback error:", err);
      res.redirect("/analytics/search-console?error=oauth_failed");
    }
  });

  app.get("/api/analytics/gsc/data", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const conn = await storage.getGscConnection(userId);
      if (!conn?.oauthAccessToken) return res.status(401).json({ message: "Not connected" });
      const siteUrl = (req.query.siteUrl as string) || conn.selectedSiteUrl;
      if (!siteUrl) return res.status(400).json({ message: "No site selected" });
      const days = Math.min(parseInt((req.query.days as string) || "28", 10) || 28, 365);
      // Cache key: truncate siteUrl to keep within column limit
      const cacheKey = `gsc-data-${days}-${siteUrl.slice(0, 100)}`;
      const cached = await storage.getGscAnalyticsCache(userId, cacheKey);
      if (cached && (Date.now() - cached.updatedAt.getTime() < GSC_DATA_CACHE_TTL)) {
        return res.json(cached.data);
      }
      const onTokenRefresh = (t: string, exp: Date | null) => storage.updateGscAccessToken(userId, t, exp).catch(() => {});
      const data = await fetchGscData(conn.oauthAccessToken, conn.oauthRefreshToken, siteUrl, days, onTokenRefresh);
      await storage.setGscAnalyticsCache(userId, cacheKey, data);
      res.json(data);
    } catch (err: any) {
      console.error("[Analytics/GSC] data error:", err?.message);
      res.status(500).json({ message: "Failed to fetch Search Console data" });
    }
  });

  app.post("/api/analytics/gsc/select-site", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const { siteUrl } = req.body as { siteUrl: string };
      if (!siteUrl) return res.status(400).json({ message: "siteUrl required" });
      // Clear analytics caches when switching sites so stale data from the old site doesn't show
      await Promise.all([
        storage.setGscSelectedSite(userId, siteUrl),
        storage.clearGscAnalyticsCache(userId),
      ]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to select site" });
    }
  });

  app.post("/api/analytics/gsc/refresh", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const conn = await storage.getGscConnection(userId);
      if (!conn?.oauthAccessToken) return res.status(400).json({ message: "Not connected" });
      // Clear all GSC caches so next page load re-fetches everything from Google
      await storage.clearGscAnalyticsCache(userId);
      const onTokenRefresh = (t: string, exp: Date | null) => storage.updateGscAccessToken(userId, t, exp).catch(() => {});
      const sites = await fetchGscSites(conn.oauthAccessToken, conn.oauthRefreshToken, onTokenRefresh);
      res.json({ success: true, sites });
    } catch (err: any) {
      console.error("[Analytics/GSC] refresh error:", err?.message);
      res.status(500).json({ message: "Failed to refresh" });
    }
  });

  app.delete("/api/analytics/gsc/disconnect", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      await Promise.all([
        storage.deleteGscConnection(userId),
        storage.clearGscAnalyticsCache(userId),
      ]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to disconnect" });
    }
  });

  app.get("/api/analytics/gsc/page-keywords", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const conn = await storage.getGscConnection(userId);
      if (!conn?.oauthAccessToken) return res.status(401).json({ message: "Not connected" });
      const siteUrl = (req.query.siteUrl as string) || conn.selectedSiteUrl;
      if (!siteUrl) return res.status(400).json({ message: "No site selected" });
      const days = Math.min(parseInt((req.query.days as string) || "28", 10) || 28, 365);
      const cacheKey = `gsc-pk-${days}-${siteUrl.slice(0, 100)}`;
      const cached = await storage.getGscAnalyticsCache(userId, cacheKey);
      if (cached && (Date.now() - cached.updatedAt.getTime() < GSC_DATA_CACHE_TTL)) {
        return res.json(cached.data);
      }
      const onTokenRefresh = (t: string, exp: Date | null) => storage.updateGscAccessToken(userId, t, exp).catch(() => {});
      const data = await fetchGscPageKeywords(conn.oauthAccessToken, conn.oauthRefreshToken, siteUrl, days, onTokenRefresh);
      await storage.setGscAnalyticsCache(userId, cacheKey, data);
      res.json(data);
    } catch (err: any) {
      console.error("[Analytics/GSC] page-keywords error:", err?.message);
      res.status(500).json({ message: "Failed to fetch page keywords" });
    }
  });

  app.post("/api/analytics/gsc/inspect-url", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session!.userId!;
      const conn = await storage.getGscConnection(userId);
      if (!conn?.oauthAccessToken) return res.status(401).json({ message: "Not connected" });
      const siteUrl = conn.selectedSiteUrl;
      if (!siteUrl) return res.status(400).json({ message: "No site selected" });
      const { url } = req.body as { url: string };
      if (!url) return res.status(400).json({ message: "url required" });
      const result = await inspectGscUrl(conn.oauthAccessToken, conn.oauthRefreshToken, siteUrl, url);
      res.json(result);
    } catch (err: any) {
      console.error("[Analytics/GSC] inspect-url error:", err?.message);
      res.status(500).json({ message: err?.message || "Failed to inspect URL" });
    }
  });

  app.get("/api/analytics/psi", requireAuth, async (req: Request, res: Response) => {
    try {
      const { url, strategy = "mobile" } = req.query as { url?: string; strategy?: string };
      if (!url) return res.status(400).json({ message: "url required" });
      const params = new URLSearchParams({
        url,
        strategy: strategy === "desktop" ? "desktop" : "mobile",
      });
      ["performance", "accessibility", "best-practices", "seo"].forEach((c) =>
        params.append("category", c)
      );
      const apiKey = process.env.GOOGLE_API_KEY || process.env.YOUTUBE_API_KEY;
      if (apiKey) params.set("key", apiKey);
      const psiRes = await fetch(
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params.toString()}`
      );
      if (!psiRes.ok) {
        let errMsg = `PageSpeed API error (HTTP ${psiRes.status})`;
        try {
          const errBody = await psiRes.json() as any;
          const detail = errBody?.error?.message || errBody?.error?.errors?.[0]?.message;
          if (detail) errMsg = detail;
          if (psiRes.status === 429) errMsg = "PageSpeed API quota exceeded. A Google API key with the PageSpeed Insights API enabled is required — add one as GOOGLE_API_KEY in your environment secrets.";
          if (psiRes.status === 400) errMsg = "The URL could not be fetched. Make sure it is a valid, publicly accessible page.";
          if (psiRes.status === 403) errMsg = "API key does not have access to the PageSpeed Insights API. Enable it in Google Cloud Console.";
        } catch { /* keep generic message */ }
        console.error("[PSI] API error:", psiRes.status, errMsg);
        return res.status(502).json({ message: errMsg });
      }
      const psiData = await psiRes.json();
      const lhr = psiData.lighthouseResult || {};
      const cats = lhr.categories || {};
      const audits = lhr.audits || {};
      const le = psiData.loadingExperience || {};

      const score = (key: string) => Math.round((cats[key]?.score ?? 0) * 100);
      const metric = (key: string) => ({
        displayValue: audits[key]?.displayValue || "—",
        score: audits[key]?.score ?? null,
        numericValue: audits[key]?.numericValue ?? null,
      });

      const opportunities = Object.values(audits as Record<string, any>)
        .filter((a: any) => a.details?.type === "opportunity" && a.score !== null && a.score < 0.9 && a.details?.overallSavingsMs > 100)
        .sort((a: any, b: any) => (b.details?.overallSavingsMs ?? 0) - (a.details?.overallSavingsMs ?? 0))
        .slice(0, 6)
        .map((a: any) => ({
          id: a.id,
          title: a.title,
          description: a.description,
          displayValue: a.displayValue || "",
          score: a.score ?? null,
          savingsMs: a.details?.overallSavingsMs ?? 0,
        }));

      const fieldMetrics = le.metrics
        ? {
            lcp: { value: le.metrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null, category: le.metrics.LARGEST_CONTENTFUL_PAINT_MS?.category ?? null },
            fid: { value: le.metrics.FIRST_INPUT_DELAY_MS?.percentile ?? null, category: le.metrics.FIRST_INPUT_DELAY_MS?.category ?? null },
            cls: { value: le.metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?? null, category: le.metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.category ?? null },
            fcp: { value: le.metrics.FIRST_CONTENTFUL_PAINT_MS?.percentile ?? null, category: le.metrics.FIRST_CONTENTFUL_PAINT_MS?.category ?? null },
            overallCategory: le.overall_category ?? null,
          }
        : null;

      res.json({
        url,
        strategy,
        fetchTime: lhr.fetchTime || new Date().toISOString(),
        scores: {
          performance: score("performance"),
          accessibility: score("accessibility"),
          bestPractices: score("best-practices"),
          seo: score("seo"),
        },
        metrics: {
          fcp: metric("first-contentful-paint"),
          lcp: metric("largest-contentful-paint"),
          tbt: metric("total-blocking-time"),
          cls: metric("cumulative-layout-shift"),
          si: metric("speed-index"),
          tti: metric("interactive"),
        },
        opportunities,
        fieldData: fieldMetrics,
      });
    } catch (err: any) {
      console.error("[Analytics/PSI] error:", err?.message);
      res.status(500).json({ message: err?.message || "Failed to run PageSpeed analysis" });
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

      const userId = getEffectiveUserId(req);

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

      const userId = getEffectiveUserId(req);
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

  // ── Create project from funnel canvas ────────────────────────────────────────
  app.post("/api/projects/from-funnel", requireAuth, async (req: Request, res: Response) => {
    console.log("[from-funnel] route hit, body:", JSON.stringify(req.body));
    try {
      const uid = getEffectiveUserId(req);
      const { funnelId } = req.body ?? {};
      if (!funnelId || typeof funnelId !== "string") {
        return res.status(400).json({ message: "funnelId is required" });
      }

      const funnel = await storage.getFunnel(funnelId, uid);
      if (!funnel) return res.status(404).json({ message: "Funnel not found" });

      const canvas = funnel.canvasData as { nodes?: any[] } | null;
      const rawNodes: any[] = canvas?.nodes ?? [];

      const PAGE_TYPES = ["capturePage", "thankYouPage", "salesPage", "videoPage", "webinar", "zoom", "orderForm", "upsell", "downsell", "externalLink"];

      const trafficNodes = rawNodes.filter((n) => n.data?.nodeType === "trafficSource");
      const pageNodes    = rawNodes.filter((n) => PAGE_TYPES.includes(n.data?.nodeType));
      const emailNodes   = rawNodes
        .filter((n) => n.data?.nodeType === "emailNode")
        .sort((a, b) => (a.data?.emailDay ?? 999) - (b.data?.emailDay ?? 999));
      const smsNodes     = rawNodes
        .filter((n) => n.data?.nodeType === "smsNode")
        .sort((a, b) => (a.data?.smsDay ?? 999) - (b.data?.smsDay ?? 999));

      const TASKS: Record<string, string[]> = {
        trafficSource: [
          "Define your ideal customer avatar (age, pain points, goals)",
          "Create 3–5 ad creatives or content pieces to test",
          "Write 2–3 variations of ad copy for A/B testing",
          "Set your daily budget and campaign objective",
          "Install your tracking pixel on all funnel pages",
          "Set up a retargeting audience based on page visits",
          "Add UTM tracking parameters to all funnel URLs",
        ],
        capturePage: [
          "Build / confirm your page is live and accessible",
          "Write a compelling headline focused on a specific transformation or benefit",
          "Add a supporting sub-headline that reinforces the main promise",
          "Include a mockup or visual of your lead magnet",
          "Set up your opt-in form (name and/or email field)",
          "Connect your email autoresponder to the form",
          "Add a 'What You'll Get' bullet list (3–5 bullets max)",
          "Remove all navigation links — distraction-free only",
          "Add your privacy policy link (legally required)",
          "Set the redirect URL to your Thank-You page",
          "Test the opt-in flow on mobile and desktop",
        ],
        thankYouPage: [
          "Build / confirm your page is live and accessible",
          "Write a 'Check your inbox' confirmation message",
          "Deliver or link directly to your lead magnet",
          "Add a short welcome video introducing yourself (60–90 seconds)",
          "Tell them what to expect from your email series",
          "Add a soft One-Time Offer (OTO) or upsell if applicable",
          "Link to your Facebook group or community",
          "Add a follow button for your primary social media platform",
        ],
        salesPage: [
          "Build / confirm your page is live and accessible",
          "Write a powerful headline focused on the biggest transformation",
          "Open with a story that connects with the reader's pain or desire",
          "Clearly list what they get (lead with benefits, then features)",
          "Add social proof: testimonials, case studies, or results screenshots",
          "Include a prominent Call-To-Action button with your price",
          "Add a FAQ section handling the top 5 objections",
          "Set up your payment processor and checkout page",
          "Add a money-back guarantee if applicable",
          "Test the complete checkout flow end-to-end",
          "Install conversion tracking (Facebook Pixel / Google Tag)",
        ],
        videoPage: [
          "Build / confirm your page is live and accessible",
          "Script and record your VSL",
          "Upload to Vimeo or Wistia for full playback control",
          "Disable video controls until the offer is revealed",
          "Add a 'Buy Now' button that appears at the right moment",
          "Write a supporting headline above the video",
          "Add a brief text summary below the video for scanners",
          "Install conversion tracking on the page",
        ],
        webinar: [
          "Write your webinar title focused on a clear transformation",
          "List 3–5 specific outcomes attendees will leave with",
          "Set up your webinar platform (Zoom, EasyWebinar, or WebinarJam)",
          "Create your slide deck for the presentation",
          "Set up registration form and confirmation emails",
          "Build a show-up reminder sequence (24h and 1h before start)",
          "Prepare your offer presentation for the end of the webinar",
        ],
        zoom: [
          "Write a clear headline that states who the call is for",
          "Add 3–5 qualification questions to your application form",
          "Set up your calendar booking tool (Calendly or Acuity)",
          "Write a confirmation page with call preparation instructions",
          "Create a pre-call questionnaire for serious applicants",
          "Set up reminder emails 24 hours and 1 hour before the call",
        ],
        orderForm: [
          "Connect your payment processor (Stripe, PayPal, or similar)",
          "Write a brief order summary — clearly state what they're buying",
          "Add a security badge and SSL indicator",
          "Offer a payment plan option if the price warrants it",
          "Add an order bump (a small complementary add-on offer)",
          "Test the complete purchase flow from start to finish",
          "Set up your post-purchase confirmation and delivery email",
        ],
        upsell: [
          "Create an offer that directly complements the front-end purchase",
          "Write a headline referencing the purchase they just completed",
          "Keep the page short — one offer, one decision",
          "Include a clear 'Yes, upgrade me!' and 'No thanks' link",
          "Set up one-click order processing (no re-entering card details)",
          "Test the upsell flow from the order form",
        ],
        downsell: [
          "Create a lower-commitment version of the upsell offer",
          "Write new copy emphasizing the reduced price and core value",
          "Set up the trigger after the upsell 'No thanks' click",
          "Include a clear 'Yes, I want this!' and 'No thanks' link",
          "Test the complete OTO sequence end-to-end",
        ],
        externalLink: [
          "Confirm the destination URL is correct and the page is live",
          "Add UTM parameters to track traffic from your funnel",
          "Ensure the linked page matches the visitor's expectations",
        ],
        emailNode: [
          "Write your subject line (aim for curiosity, urgency, or a clear benefit)",
          "Write your preview text / preheader (40–90 characters)",
          "Write your email body",
          "Include one clear call-to-action link",
          "Add personalization with a first name merge tag",
          "Schedule in your autoresponder at the correct delay",
          "Send a test to yourself and check formatting on mobile",
        ],
        smsNode: [
          "Write your SMS message body",
          "Keep under 160 characters (single message segment)",
          "Include subscriber's first name if your platform supports merge tags",
          "Include one clear, shortened URL",
          "Schedule in your SMS platform at the correct send delay",
          "Confirm subscribers have opted in to receive SMS (TCPA / GDPR compliance)",
        ],
      };

      const project = await storage.createProject(uid, {
        name: `${funnel.name} — Launch Plan`,
        description: `Created from Funnel Planner: ${funnel.name}`,
        color: "#6366f1",
        status: "active",
      });

      async function buildNodeTasks(
        label: string,
        nodeType: string,
        columnId: string | null,
        sortOrder: number,
        status: "todo" | "in_progress" | "done",
        notes: string,
      ) {
        const taskList = TASKS[nodeType] ?? [];
        const parent = await storage.createTask(uid, project.id, {
          title: label || nodeType,
          notes,
          status,
          priority: "none",
          columnId,
          sortOrder,
          tags: [],
          links: [],
        });
        for (let i = 0; i < taskList.length; i++) {
          await storage.createTask(uid, project.id, {
            title: taskList[i],
            notes: "",
            status: "todo",
            priority: "none",
            parentTaskId: parent.id,
            columnId: null,
            sortOrder: i,
            tags: [],
            links: [],
          });
        }
      }

      let colOrder = 0;

      if (trafficNodes.length > 0) {
        const col = await storage.createColumn(uid, project.id, { name: "Traffic Sources", sortOrder: colOrder++ });
        for (let i = 0; i < trafficNodes.length; i++) {
          const n = trafficNodes[i];
          const platforms = [
            ...((n.data?.trafficPlatforms as string[] | undefined) ?? []),
            ...(n.data?.trafficPlatform ? [n.data.trafficPlatform as string] : []),
          ];
          const unique = [...new Set(platforms)].filter(Boolean);
          const notes = unique.length > 0 ? `Platforms: ${unique.join(", ")}` : "";
          await buildNodeTasks(n.data?.label || "Traffic Source", "trafficSource", col.id, i, "todo", notes);
        }
      }

      if (pageNodes.length > 0) {
        const col = await storage.createColumn(uid, project.id, { name: "Funnel Pages", sortOrder: colOrder++ });
        for (let i = 0; i < pageNodes.length; i++) {
          const n = pageNodes[i];
          const url = ((n.data?.pageUrl as string | undefined) ?? "").trim();
          const hasUrl = !!url;
          const notes = url ? `Page URL: ${url}` : "";
          const status = hasUrl ? "in_progress" : "todo";
          await buildNodeTasks(n.data?.label || n.data?.nodeType, n.data?.nodeType, col.id, i, status, notes);
        }
      }

      if (emailNodes.length > 0) {
        const col = await storage.createColumn(uid, project.id, { name: "Email Sequence", sortOrder: colOrder++ });
        for (let i = 0; i < emailNodes.length; i++) {
          const n = emailNodes[i];
          const hasSubject = !!(n.data?.emailSubject as string | undefined)?.trim();
          const hasBody    = !!(n.data?.emailBody    as string | undefined)?.trim();
          const day        = (n.data?.emailDay as number | undefined) ?? (i + 1);
          const subject    = (n.data?.emailSubject as string | undefined) ?? "";
          const notes      = subject ? `Day ${day} — Subject: ${subject}` : `Day ${day}`;
          const status     = hasSubject && hasBody ? "done" : hasSubject ? "in_progress" : "todo";
          await buildNodeTasks(n.data?.label || `Email ${i + 1}`, "emailNode", col.id, i, status, notes);
        }
      }

      if (smsNodes.length > 0) {
        const col = await storage.createColumn(uid, project.id, { name: "SMS Sequence", sortOrder: colOrder++ });
        for (let i = 0; i < smsNodes.length; i++) {
          const n = smsNodes[i];
          const hasBody = !!(n.data?.smsBody as string | undefined)?.trim();
          const day     = (n.data?.smsDay  as number | undefined) ?? (i + 1);
          await buildNodeTasks(n.data?.label || `SMS ${i + 1}`, "smsNode", col.id, i, hasBody ? "in_progress" : "todo", `Day ${day}`);
        }
      }

      res.status(201).json({ projectId: project.id, projectName: project.name });
    } catch (err: any) {
      console.error("[projects] from-funnel error:", err);
      res.status(500).json({ message: "Failed to create project from funnel" });
    }
  });

  app.get("/api/projects", requireAuth, async (req: Request, res: Response) => {
    try {
      const list = await storage.getProjectsForUser(getEffectiveUserId(req));
      res.json(list);
    } catch (err) {
      console.error("[projects] list error:", err);
      res.status(500).json({ message: "Failed to load projects" });
    }
  });

  app.post("/api/projects", requireAuth, async (req: Request, res: Response) => {
    try {
      const uid = getEffectiveUserId(req);
      const { templateId, ...rest } = req.body ?? {};
      const data = insertProjectSchema.parse(rest);
      const created = await storage.createProject(uid, data);
      if (templateId && typeof templateId === "string") {
        const tpl = await storage.getTemplate(templateId, uid);
        if (tpl) {
          await storage.instantiateProjectFromTemplate(uid, templateId, created);
        }
      }
      res.status(201).json(created);
      logUserAction({
        userId: uid,
        actionType: "project_created",
        actionLabel: ActionLabels.project_created,
        entityType: "project",
        entityId: created.id,
        metadata: { name: created.name, fromTemplate: !!templateId },
        req,
      });
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid input", errors: err.issues });
      console.error("[projects] create error:", err);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  // ── Project Templates ──────────────────────────────────────────────────────

  app.get("/api/project-templates", requireAuth, async (req: Request, res: Response) => {
    try {
      const list = await storage.getTemplatesForUser(getEffectiveUserId(req));
      res.json(list);
    } catch (err) {
      console.error("[templates] list error:", err);
      res.status(500).json({ message: "Failed to load templates" });
    }
  });

  app.post("/api/project-templates", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertProjectTemplateSchema.parse(req.body);
      const created = await storage.createTemplate(getEffectiveUserId(req), data);
      res.status(201).json(created);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid input", errors: err.issues });
      console.error("[templates] create error:", err);
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  app.get("/api/project-templates/:id", requireAuth, async (req: Request, res: Response) => {
    const tpl = await storage.getTemplate(req.params.id, getEffectiveUserId(req));
    if (!tpl) return res.status(404).json({ message: "Not found" });
    res.json(tpl);
  });

  app.patch("/api/project-templates/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const data = insertProjectTemplateSchema.partial().parse(req.body);
      const updated = await storage.updateTemplate(req.params.id, getEffectiveUserId(req), data);
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
      const uid = getEffectiveUserId(req);
      const tpl = await storage.getTemplate(req.params.id, uid);
      if (!tpl) return res.status(404).json({ message: "Not found" });
      await storage.deleteTemplate(req.params.id, uid);
      res.json({ ok: true });
    } catch (err) {
      console.error("[templates] delete error:", err);
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  app.post("/api/project-templates/:id/duplicate", requireAuth, async (req: Request, res: Response) => {
    try {
      const copy = await storage.duplicateTemplate(req.params.id, getEffectiveUserId(req));
      if (!copy) return res.status(404).json({ message: "Not found" });
      res.status(201).json(copy);
    } catch (err) {
      console.error("[templates] duplicate error:", err);
      res.status(500).json({ message: "Failed to duplicate template" });
    }
  });

  app.get("/api/project-templates/:id/tasks", requireAuth, async (req: Request, res: Response) => {
    const uid = getEffectiveUserId(req);
    const tpl = await storage.getTemplate(req.params.id, uid);
    if (!tpl) return res.status(404).json({ message: "Not found" });
    const tasks = await storage.getTemplateTasks(req.params.id, uid);
    res.json(tasks);
  });

  app.post("/api/project-templates/:id/tasks", requireAuth, async (req: Request, res: Response) => {
    try {
      const uid = getEffectiveUserId(req);
      const tpl = await storage.getTemplate(req.params.id, uid);
      if (!tpl) return res.status(404).json({ message: "Not found" });
      const data = insertProjectTemplateTaskSchema.parse(req.body);
      const created = await storage.createTemplateTask(uid, req.params.id, data);
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
      const updated = await storage.updateTemplateTask(req.params.id, getEffectiveUserId(req), data);
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
      await storage.deleteTemplateTask(req.params.id, getEffectiveUserId(req));
      res.json({ ok: true });
    } catch (err) {
      console.error("[templates] delete task error:", err);
      res.status(500).json({ message: "Failed to delete template task" });
    }
  });

  app.post("/api/projects/:id/save-as-template", requireAuth, async (req: Request, res: Response) => {
    try {
      const uid = getEffectiveUserId(req);
      const project = await storage.getProject(req.params.id, uid);
      if (!project) return res.status(404).json({ message: "Not found" });
      const name = typeof req.body?.name === "string" ? req.body.name : project.name;
      const tpl = await storage.snapshotProjectAsTemplate(uid, req.params.id, name);
      res.status(201).json(tpl);
    } catch (err) {
      console.error("[templates] snapshot error:", err);
      res.status(500).json({ message: "Failed to save as template" });
    }
  });

  // ── Project Board Columns ─────────────────────────────────────────────────

  app.get("/api/projects/:id/columns", requireAuth, async (req: Request, res: Response) => {
    try {
      const uid = getEffectiveUserId(req);
      const project = await storage.getProject(req.params.id, uid);
      if (!project) return res.status(404).json({ message: "Not found" });
      const columns = await storage.seedColumnsForProject(req.params.id, uid);
      res.json(columns);
    } catch (err) {
      console.error("[columns] list error:", err);
      res.status(500).json({ message: "Failed to load columns" });
    }
  });

  app.post("/api/projects/:id/columns", requireAuth, async (req: Request, res: Response) => {
    try {
      const uid = getEffectiveUserId(req);
      const project = await storage.getProject(req.params.id, uid);
      if (!project) return res.status(404).json({ message: "Not found" });
      const data = insertProjectColumnSchema.parse(req.body);
      const created = await storage.createColumn(uid, req.params.id, data);
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
      const updated = await storage.updateColumn(req.params.id, getEffectiveUserId(req), data);
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
      await storage.deleteColumn(req.params.id, getEffectiveUserId(req));
      res.json({ ok: true });
    } catch (err) {
      console.error("[columns] delete error:", err);
      res.status(500).json({ message: "Failed to delete column" });
    }
  });

  app.get("/api/projects/urgent-tasks", requireAuth, async (req: Request, res: Response) => {
    try {
      const tasks = await storage.getUrgentTasksForUser(getEffectiveUserId(req), 48);
      res.json(tasks);
    } catch (err) {
      console.error("[projects] urgent-tasks error:", err);
      res.status(500).json({ message: "Failed to load urgent tasks" });
    }
  });

  app.get("/api/projects/all-tasks", requireAuth, async (req: Request, res: Response) => {
    try {
      const tasks = await storage.getAllOpenTasksForUser(getEffectiveUserId(req));
      res.json(tasks);
    } catch (err) {
      console.error("[projects] all-tasks error:", err);
      res.status(500).json({ message: "Failed to load tasks" });
    }
  });

  app.get("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    const project = await storage.getProject(req.params.id, getEffectiveUserId(req));
    if (!project) return res.status(404).json({ message: "Not found" });
    res.json(project);
  });

  app.patch("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const uid = getEffectiveUserId(req);
      const data = insertProjectSchema.partial().parse(req.body);
      const updated = await storage.updateProject(req.params.id, uid, data);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
      fireWebhooks(uid, "project.updated", updated);
      logUserAction({
        userId: uid,
        actionType: "project_updated",
        actionLabel: ActionLabels.project_updated,
        entityType: "project",
        entityId: req.params.id,
        metadata: { name: updated.name },
        req,
      });
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid input", errors: err.issues });
      console.error("[projects] update error:", err);
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const uid = getEffectiveUserId(req);
      const project = await storage.getProject(req.params.id, uid);
      if (!project) return res.status(404).json({ message: "Not found" });
      // Clean up all attachment files from cloud storage before DB cascade removes records
      try {
        const allTasks = await storage.getTasksForProject(req.params.id, uid);
        for (const task of allTasks) {
          const atts = await storage.getTaskAttachments(task.id, uid);
          for (const att of atts) {
            try { await objectStorageService.deleteObject(att.objectPath); } catch {}
          }
        }
      } catch (cleanupErr) {
        console.warn("[projects] attachment cleanup error (non-fatal):", cleanupErr);
      }
      await storage.deleteProject(req.params.id, uid);
      res.json({ ok: true });
      fireWebhooks(uid, "project.deleted", { id: req.params.id });
      logUserAction({
        userId: uid,
        actionType: "project_deleted",
        actionLabel: ActionLabels.project_deleted,
        entityType: "project",
        entityId: req.params.id,
        metadata: { name: project.name },
        req,
      });
    } catch (err) {
      console.error("[projects] delete error:", err);
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  app.get("/api/projects/:id/tasks", requireAuth, async (req: Request, res: Response) => {
    const uid = getEffectiveUserId(req);
    const project = await storage.getProject(req.params.id, uid);
    if (!project) return res.status(404).json({ message: "Not found" });
    const tasks = await storage.getTasksForProject(req.params.id, uid);
    res.json(tasks);
  });

  app.post("/api/projects/:id/tasks/reorder", requireAuth, async (req: Request, res: Response) => {
    try {
      const uid = getEffectiveUserId(req);
      const project = await storage.getProject(req.params.id, uid);
      if (!project) return res.status(404).json({ message: "Not found" });
      const updates = z.array(z.object({
        id: z.string(),
        columnId: z.string(),
        sortOrder: z.number().int(),
      })).parse(req.body);
      await storage.reorderTasks(req.params.id, uid, updates);
      res.json({ ok: true });
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid input", errors: err.issues });
      console.error("[projects] reorder error:", err);
      res.status(500).json({ message: "Failed to reorder tasks" });
    }
  });

  app.post("/api/projects/:id/tasks", requireAuth, async (req: Request, res: Response) => {
    try {
      const uid = getEffectiveUserId(req);
      const project = await storage.getProject(req.params.id, uid);
      if (!project) return res.status(404).json({ message: "Not found" });
      const data = insertProjectTaskSchema.parse({ ...req.body, projectId: req.params.id });
      const created = await storage.createTask(uid, req.params.id, data);
      res.status(201).json(created);
      logUserAction({
        userId: uid,
        actionType: "task_created",
        actionLabel: ActionLabels.task_created,
        entityType: "task",
        entityId: created.id,
        metadata: { title: created.title, projectId: req.params.id, projectName: project.name },
        req,
      });
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
      const uid = getEffectiveUserId(req);
      const data = updateProjectTaskSchema.parse(req.body);
      const updated = await storage.updateTask(req.params.id, uid, data);
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
      fireWebhooks(uid, "task.updated", updated);
      const isCompletion = !!(data as any).completedAt;
      logUserAction({
        userId: uid,
        actionType: isCompletion ? "task_completed" : "task_updated",
        actionLabel: isCompletion ? ActionLabels.task_completed : ActionLabels.task_updated,
        entityType: "task",
        entityId: req.params.id,
        metadata: { title: updated.title, projectId: updated.projectId },
        req,
      });
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
      const uid = getEffectiveUserId(req);
      const task = await storage.getTask(req.params.id, uid);
      if (!task) return res.status(404).json({ message: "Not found" });
      // Clean up attachment files from cloud storage for this task and its subtasks
      try {
        const allTaskIds = [req.params.id];
        const allTasks = await storage.getTasksForProject(task.projectId, uid);
        allTasks.filter(t => t.parentTaskId === req.params.id).forEach(st => allTaskIds.push(st.id));
        for (const tid of allTaskIds) {
          const atts = await storage.getTaskAttachments(tid, uid);
          for (const att of atts) {
            try { await objectStorageService.deleteObject(att.objectPath); } catch {}
          }
        }
      } catch (cleanupErr) {
        console.warn("[projects] task attachment cleanup error (non-fatal):", cleanupErr);
      }
      await storage.deleteTask(req.params.id, uid);
      res.json({ ok: true });
      fireWebhooks(uid, "task.deleted", { id: req.params.id });
      logUserAction({
        userId: uid,
        actionType: "task_deleted",
        actionLabel: ActionLabels.task_deleted,
        entityType: "task",
        entityId: req.params.id,
        metadata: { title: task.title, projectId: task.projectId },
        req,
      });
    } catch (err) {
      console.error("[projects] delete task error:", err);
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  app.get("/api/tasks/:id/comments", requireAuth, async (req: Request, res: Response) => {
    try {
      const uid = getEffectiveUserId(req);
      const task = await storage.getTask(req.params.id, uid);
      if (!task) return res.status(404).json({ message: "Not found" });
      const comments = await storage.getTaskComments(req.params.id, uid);
      res.json(comments);
    } catch (err) {
      console.error("[projects] list comments error:", err);
      res.status(500).json({ message: "Failed to load comments" });
    }
  });

  app.post("/api/tasks/:id/comments", requireAuth, async (req: Request, res: Response) => {
    try {
      const uid = getEffectiveUserId(req);
      const task = await storage.getTask(req.params.id, uid);
      if (!task) return res.status(404).json({ message: "Not found" });
      const data = insertTaskCommentSchema.parse(req.body);
      const created = await storage.addTaskComment(req.params.id, uid, data.body);
      res.status(201).json(created);
    } catch (err: any) {
      if (err?.issues) return res.status(400).json({ message: "Invalid input", errors: err.issues });
      console.error("[projects] add comment error:", err);
      res.status(500).json({ message: "Failed to add comment" });
    }
  });

  app.patch("/api/tasks/:taskId/comments/:commentId", requireAuth, async (req: Request, res: Response) => {
    try {
      const uid = getEffectiveUserId(req);
      const task = await storage.getTask(req.params.taskId, uid);
      if (!task) return res.status(404).json({ message: "Not found" });
      const data = updateTaskCommentSchema.parse(req.body);
      const updated = await storage.updateTaskComment(req.params.taskId, req.params.commentId, uid, data.body);
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
      const uid = getEffectiveUserId(req);
      const task = await storage.getTask(req.params.taskId, uid);
      if (!task) return res.status(404).json({ message: "Not found" });
      const ok = await storage.deleteTaskComment(req.params.taskId, req.params.commentId, uid);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ ok: true });
    } catch (err) {
      console.error("[projects] delete comment error:", err);
      res.status(500).json({ message: "Failed to delete comment" });
    }
  });

  app.get("/api/tasks/:id/activity", requireAuth, async (req: Request, res: Response) => {
    try {
      const uid = getEffectiveUserId(req);
      const task = await storage.getTask(req.params.id, uid);
      if (!task) return res.status(404).json({ message: "Not found" });
      const activity = await storage.getTaskActivity(req.params.id, uid);
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

  // Rate limiter for attachment upload issuance and confirmation.  Keyed on the
  // authenticated user so one member cannot mint/upload many large blobs in
  // parallel before TTL cleanup kicks in.
  const attachmentIngestionLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => String(req.session?.userId ?? "anonymous"),
    message: { message: "You have uploaded too many attachments in a short period. Please wait a few minutes before trying again." },
  });

  // TTL for attachment presigned URLs — objects not confirmed within this window
  // are treated as orphans and deleted by the scheduled sweep below.
  // Tracking is DB-backed (pending_attachment_uploads table) so orphan records
  // survive process restarts; the sweep is idempotent and safe to run on every
  // replica if the app scales horizontally.
  const ATTACHMENT_UPLOAD_TTL_MS = 45 * 60 * 1000; // 45 minutes
  setInterval(async () => {
    try {
      const stale = await storage.getExpiredPendingAttachmentUploads(ATTACHMENT_UPLOAD_TTL_MS);
      for (const row of stale) {
        await storage.removePendingAttachmentUpload(row.objectPath);
        try {
          await objectStorageService.deleteObject(row.objectPath);
          console.log(`[AttachmentCleanup] Deleted orphaned attachment object: ${row.objectPath}`);
        } catch (delErr) {
          console.warn(`[AttachmentCleanup] Could not delete orphaned attachment object ${row.objectPath}:`, delErr);
        }
      }
      if (stale.length > 0) {
        console.log(`[AttachmentCleanup] Swept ${stale.length} orphaned attachment object(s)`);
      }
    } catch (sweepErr) {
      console.error("[AttachmentCleanup] Sweep error:", sweepErr);
    }
  }, 15 * 60 * 1000); // run every 15 minutes

  app.post("/api/tasks/:id/attachments/request-url", requireAuth, attachmentIngestionLimiter, async (req: Request, res: Response) => {
    try {
      const uid = getEffectiveUserId(req);
      const task = await storage.getTask(req.params.id, uid);
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
      const existing = await storage.getTaskAttachments(req.params.id, uid);
      if (existing.length >= ATTACHMENT_MAX_COUNT) {
        return res.status(400).json({ message: `Maximum ${ATTACHMENT_MAX_COUNT} attachments per task.` });
      }
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      // Register the issued objectPath in the DB, bound to this user+task, so the
      // confirm endpoint can reject any path not issued for this exact caller/task.
      // DB-backed tracking survives process restarts unlike an in-memory Map.
      await storage.registerPendingAttachmentUpload(objectPath, uid, req.params.id);
      res.json({ uploadUrl: uploadURL, objectPath });
    } catch (err: any) {
      console.error("[attachments] request-url error:", err);
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  app.post("/api/tasks/:id/attachments", requireAuth, attachmentIngestionLimiter, async (req: Request, res: Response) => {
    try {
      const uid = getEffectiveUserId(req);
      const task = await storage.getTask(req.params.id, uid);
      if (!task) return res.status(404).json({ message: "Task not found" });
      const { objectPath, filename, mimeType } = req.body ?? {};
      if (!objectPath || !filename || !mimeType) {
        return res.status(400).json({ message: "objectPath, filename, and mimeType are required" });
      }

      // Verify this objectPath was issued by this app for exactly this user+task.
      // Reject ANY path not found in pending_attachment_uploads or belonging to a
      // different caller/task — this prevents object-path substitution attacks where
      // a user supplies an arbitrary /objects/ path they did not upload.
      const pending = await storage.getPendingAttachmentUpload(String(objectPath));
      if (!pending || pending.userId !== uid || pending.taskId !== req.params.id) {
        console.warn(`[attachments] rejected unissued/mismatched objectPath: ${objectPath} uid=${uid} taskId=${req.params.id}`);
        return res.status(400).json({ message: "Invalid or expired upload token. Please request a new upload URL." });
      }

      if (!ATTACHMENT_ALLOWED_TYPES.has(String(mimeType))) {
        return res.status(400).json({ message: "File type not allowed." });
      }
      const existing = await storage.getTaskAttachments(req.params.id, uid);
      if (existing.length >= ATTACHMENT_MAX_COUNT) {
        return res.status(400).json({ message: `Maximum ${ATTACHMENT_MAX_COUNT} attachments per task.` });
      }

      // Verify the authoritative object size from cloud-storage metadata rather than
      // trusting the client-supplied `size` field.  Without this, a user could upload
      // a blob far exceeding 25 MB through the presigned URL and then register it as a
      // supposedly compliant attachment by providing a small fake size value.
      let actualSize: number;
      try {
        const objectFile = await objectStorageService.getObjectEntityFile(String(objectPath));
        const [objectMetadata] = await objectFile.getMetadata();
        actualSize = Number(objectMetadata.size);
        if (isNaN(actualSize)) {
          return res.status(500).json({ message: "Could not verify attachment size from storage" });
        }
      } catch (metaErr: any) {
        console.error("[attachments] failed to fetch object metadata:", metaErr);
        return res.status(400).json({ message: "Could not verify attachment in storage. Please re-upload the file." });
      }

      if (actualSize > ATTACHMENT_MAX_SIZE) {
        // Immediately delete the non-compliant object from storage rather than
        // waiting for the TTL sweep, so oversized blobs never linger.
        await storage.removePendingAttachmentUpload(String(objectPath));
        try {
          await objectStorageService.deleteObject(String(objectPath));
          console.warn(`[attachments] deleted oversized object (${actualSize} bytes): ${objectPath}`);
        } catch (delErr) {
          console.warn(`[attachments] could not delete oversized object ${objectPath}:`, delErr);
        }
        return res.status(400).json({ message: "File too large. Maximum is 25 MB." });
      }

      const attachment = await storage.createTaskAttachment(req.params.id, uid, {
        objectPath: String(objectPath),
        filename: String(filename).slice(0, 255),
        mimeType: String(mimeType).slice(0, 100),
        size: actualSize,
      });
      // Remove from orphan-tracking now that the object is legitimately registered.
      await storage.removePendingAttachmentUpload(String(objectPath));
      res.status(201).json(attachment);
    } catch (err: any) {
      console.error("[attachments] confirm error:", err);
      res.status(500).json({ message: "Failed to save attachment" });
    }
  });

  app.get("/api/tasks/:id/attachments", requireAuth, async (req: Request, res: Response) => {
    try {
      const uid = getEffectiveUserId(req);
      const task = await storage.getTask(req.params.id, uid);
      if (!task) return res.status(404).json({ message: "Task not found" });
      const list = await storage.getTaskAttachments(req.params.id, uid);
      res.json(list);
    } catch (err) {
      console.error("[attachments] list error:", err);
      res.status(500).json({ message: "Failed to load attachments" });
    }
  });

  app.get("/api/attachments/:id/download", requireAuth, async (req: Request, res: Response) => {
    try {
      const att = await storage.getTaskAttachment(req.params.id, getEffectiveUserId(req));
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
      const deleted = await storage.deleteTaskAttachment(req.params.id, getEffectiveUserId(req));
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
      const summary = await storage.getDashboardProjectsSummary(getEffectiveUserId(req));
      res.json(summary);
    } catch (err) {
      console.error("[projects] dashboard summary error:", err);
      res.status(500).json({ message: "Failed to load summary" });
    }
  });

  app.get("/api/dashboard/layout", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      return res.json({ layout: (user as any).dashboardLayout ?? null });
    } catch (err) {
      console.error("[dashboard] layout get error:", err);
      res.status(500).json({ message: "Failed to load layout" });
    }
  });

  app.patch("/api/dashboard/layout", requireAuth, async (req: Request, res: Response) => {
    try {
      const { layout } = req.body;
      if (!Array.isArray(layout)) {
        return res.status(400).json({ message: "layout must be an array" });
      }
      await storage.updateUser(req.session.userId!, { dashboardLayout: layout } as any);
      return res.json({ ok: true });
    } catch (err) {
      console.error("[dashboard] layout save error:", err);
      res.status(500).json({ message: "Failed to save layout" });
    }
  });

  // ─── Workspace Collaborators ────────────────────────────────────────────────

  const MAX_COLLABORATORS = 1;

  // GET /api/workspace/team — list all invites for the owner
  app.get("/api/workspace/team", requireAuth, async (req: Request, res: Response) => {
    if (req.session.workspaceOwnerId) {
      return res.status(403).json({ message: "Collaborators cannot manage team members" });
    }
    try {
      const invites = await storage.getWorkspaceInvites(req.session.userId!);
      res.json(invites);
    } catch (err) {
      console.error("[workspace] list error:", err);
      res.status(500).json({ message: "Failed to load team" });
    }
  });

  // POST /api/workspace/invite — send invite (owner only)
  app.post("/api/workspace/invite", requireAuth, async (req: Request, res: Response) => {
    if (req.session.workspaceOwnerId) {
      return res.status(403).json({ message: "Collaborators cannot send invites" });
    }
    const { email, firstName, lastName } = req.body ?? {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ message: "Valid email is required" });
    }
    try {
      const active = await storage.countActiveWorkspaceInvites(req.session.userId!);
      if (active >= MAX_COLLABORATORS) {
        return res.status(400).json({ message: `You can only have ${MAX_COLLABORATORS} active collaborator${MAX_COLLABORATORS > 1 ? "s" : ""}` });
      }
      const owner = await storage.getUser(req.session.userId!);
      const token = crypto.randomBytes(32).toString("hex");
      const invite = await storage.createWorkspaceInvite(
        req.session.userId!,
        email.trim().toLowerCase(),
        token,
        firstName || undefined,
        lastName || undefined,
      );
      const appBase = process.env.APP_BASE_URL || "https://toolkit.fearlessmarketinglab.com";
      await sendWorkspaceInviteEmail({
        to: invite.inviteEmail,
        ownerName: owner?.displayName || owner?.email || "Your workspace owner",
        inviteUrl: `${appBase}/workspace/accept?token=${token}`,
      });
      res.status(201).json(invite);
    } catch (err: any) {
      console.error("[workspace] invite error:", err);
      res.status(500).json({ message: "Failed to send invite" });
    }
  });

  // DELETE /api/workspace/invite/:id — revoke invite (owner only)
  app.delete("/api/workspace/invite/:id", requireAuth, async (req: Request, res: Response) => {
    if (req.session.workspaceOwnerId) {
      return res.status(403).json({ message: "Collaborators cannot revoke invites" });
    }
    try {
      const revoked = await storage.revokeWorkspaceInvite(req.params.id, req.session.userId!);
      if (!revoked) return res.status(404).json({ message: "Invite not found" });
      res.json({ ok: true });
    } catch (err) {
      console.error("[workspace] revoke error:", err);
      res.status(500).json({ message: "Failed to revoke invite" });
    }
  });

  // POST /api/workspace/invite/:id/resend — resend a pending invite with a fresh token
  app.post("/api/workspace/invite/:id/resend", requireAuth, async (req: Request, res: Response) => {
    if (req.session.workspaceOwnerId) {
      return res.status(403).json({ message: "Collaborators cannot resend invites" });
    }
    try {
      const newToken = crypto.randomBytes(32).toString("hex");
      const invite = await storage.refreshWorkspaceInviteToken(req.params.id, req.session.userId!, newToken);
      if (!invite) return res.status(404).json({ message: "Pending invite not found" });
      const owner = await storage.getUser(req.session.userId!);
      const appBase = process.env.APP_BASE_URL || "https://toolkit.fearlessmarketinglab.com";
      await sendWorkspaceInviteEmail({
        to: invite.inviteEmail,
        ownerName: owner?.displayName || owner?.email || "Your workspace owner",
        inviteUrl: `${appBase}/workspace/accept?token=${newToken}`,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("[workspace] resend error:", err);
      res.status(500).json({ message: "Failed to resend invite" });
    }
  });

  // GET /api/workspace/invite/info?token=xxx — public, returns invite metadata
  app.get("/api/workspace/invite/info", async (req: Request, res: Response) => {
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ message: "Token is required" });
    }
    try {
      const invite = await storage.getWorkspaceInviteByToken(token);
      if (!invite || invite.status === "revoked") {
        return res.status(404).json({ message: "Invite not found or has been revoked" });
      }
      if (invite.status === "accepted") {
        return res.status(400).json({ message: "This invite has already been used" });
      }
      const owner = await storage.getUser(invite.ownerId);
      res.json({
        ownerName: owner?.displayName || owner?.email || "Unknown",
        ownerEmail: owner?.email || "",
        inviteEmail: invite.inviteEmail,
        status: invite.status,
      });
    } catch (err) {
      console.error("[workspace] invite-info error:", err);
      res.status(500).json({ message: "Failed to load invite" });
    }
  });

  // POST /api/workspace/invite/accept — accept invite (creates/logs-in account)
  app.post("/api/workspace/invite/accept", async (req: Request, res: Response) => {
    const { token, password } = req.body ?? {};
    if (!token || typeof token !== "string") {
      return res.status(400).json({ message: "Token is required" });
    }
    try {
      const invite = await storage.getWorkspaceInviteByToken(token);
      if (!invite || invite.status === "revoked") {
        return res.status(404).json({ message: "Invite not found or has been revoked" });
      }
      if (invite.status === "accepted") {
        return res.status(400).json({ message: "This invite has already been used" });
      }

      let memberId: string;
      const existingUser = await storage.getUserByEmail(invite.inviteEmail);

      if (existingUser) {
        // Existing account — log them in (password optional if already logged in)
        memberId = existingUser.id;
        if (!req.session.userId || req.session.userId !== existingUser.id) {
          if (!password || typeof password !== "string") {
            return res.status(400).json({ message: "Password required to log in to the existing account" });
          }
          const bcrypt = await import("bcrypt");
          const valid = await bcrypt.compare(password, existingUser.passwordHash || "");
          if (!valid) {
            return res.status(401).json({ message: "Incorrect password" });
          }
        }
      } else {
        // New account — create with provided password and name from invite
        if (!password || typeof password !== "string" || password.length < 8) {
          return res.status(400).json({ message: "Password must be at least 8 characters" });
        }
        const bcrypt = await import("bcrypt");
        const hash = await bcrypt.hash(password, 10);
        const firstName = invite.inviteFirstName || undefined;
        const lastName = invite.inviteLastName || undefined;
        const displayName = firstName && lastName
          ? `${firstName} ${lastName}`
          : firstName || lastName || undefined;
        const newUser = await storage.createUser({
          email: invite.inviteEmail,
          passwordHash: hash,
          firstName,
          lastName,
          displayName,
        });
        memberId = newUser.id;
      }

      // Mark invite as accepted and set memberId
      await storage.acceptWorkspaceInvite(invite.inviteToken, memberId);

      // Establish session as collaborator
      req.session.userId = memberId;
      req.session.workspaceOwnerId = invite.ownerId;

      res.json({ ok: true, userId: memberId, workspaceOwnerId: invite.ownerId });
    } catch (err) {
      console.error("[workspace] accept error:", err);
      res.status(500).json({ message: "Failed to accept invite" });
    }
  });

  // ─── Admin: API Access Toggle ─────────────────────────────────────────────
  app.get("/api/admin/settings/email-sender", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const settings = await storage.getEmailSenderSettings();
      res.json(settings);
    } catch (err) {
      console.error("[email-sender] get error:", err);
      res.status(500).json({ message: "Failed to get email sender settings" });
    }
  });

  app.put("/api/admin/settings/email-sender", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { fromName, fromEmail } = req.body as { fromName: string; fromEmail: string };
      if (!fromName?.trim() || !fromEmail?.trim()) {
        return res.status(400).json({ message: "fromName and fromEmail are required" });
      }
      await storage.setEmailSenderSettings(fromName.trim(), fromEmail.trim());
      const { configureEmailSender } = await import("./email-sendgrid");
      configureEmailSender(fromName.trim(), fromEmail.trim());
      res.json({ fromName: fromName.trim(), fromEmail: fromEmail.trim() });
    } catch (err) {
      console.error("[email-sender] set error:", err);
      res.status(500).json({ message: "Failed to update email sender settings" });
    }
  });

  app.get("/api/admin/settings/api-access", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const enabled = await storage.getApiAccessEnabled();
      res.json({ enabled });
    } catch (err) {
      console.error("[api-access] get error:", err);
      res.status(500).json({ message: "Failed to get API access setting" });
    }
  });

  app.put("/api/admin/settings/api-access", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { enabled } = req.body as { enabled: boolean };
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ message: "enabled must be a boolean" });
      }
      await storage.setApiAccessEnabled(enabled);
      res.json({ enabled });
    } catch (err) {
      console.error("[api-access] set error:", err);
      res.status(500).json({ message: "Failed to update API access setting" });
    }
  });

  // ─── Admin: CF Grace Period Setting ──────────────────────────────────────
  app.get("/api/admin/settings/cf-grace-period", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const hours = await storage.getCfGracePeriodHours();
      res.json({ hours });
    } catch (err) {
      console.error("[cf-grace-period] get error:", err);
      res.status(500).json({ message: "Failed to get CF grace period setting" });
    }
  });

  app.put("/api/admin/settings/cf-grace-period", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { hours } = req.body as { hours: number };
      if (typeof hours !== "number" || isNaN(hours) || hours < 0) {
        return res.status(400).json({ message: "hours must be a non-negative number" });
      }
      await storage.setCfGracePeriodHours(hours);
      res.json({ hours });
    } catch (err) {
      console.error("[cf-grace-period] set error:", err);
      res.status(500).json({ message: "Failed to update CF grace period setting" });
    }
  });

  // ─── User: Public API Key Management ─────────────────────────────────────
  app.get("/api/account/api-key", requireAuth, async (req: Request, res: Response) => {
    try {
      const [record, accessEnabled, user] = await Promise.all([
        storage.getUserPublicApiKey(req.session.userId!),
        storage.getApiAccessEnabled(),
        storage.getUser(req.session.userId!),
      ]);
      res.json({
        accessEnabled: accessEnabled || user?.isAdmin,
        record: record ? { id: record.id, keyPrefix: record.keyPrefix, label: record.label, createdAt: record.createdAt, lastUsedAt: record.lastUsedAt } : null,
      });
    } catch (err) {
      console.error("[api-key] get error:", err);
      res.status(500).json({ message: "Failed to get API key" });
    }
  });

  app.post("/api/account/api-key", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      const accessEnabled = await storage.getApiAccessEnabled();
      if (!accessEnabled && !user?.isAdmin) {
        return res.status(403).json({ message: "API access is not yet enabled for members" });
      }
      const { label } = req.body as { label?: string };
      const { rawKey, record } = await storage.generateUserPublicApiKey(req.session.userId!, label);
      res.json({
        rawKey,
        record: { id: record.id, keyPrefix: record.keyPrefix, label: record.label, createdAt: record.createdAt, lastUsedAt: record.lastUsedAt },
      });
    } catch (err) {
      console.error("[api-key] generate error:", err);
      res.status(500).json({ message: "Failed to generate API key" });
    }
  });

  app.delete("/api/account/api-key", requireAuth, async (req: Request, res: Response) => {
    try {
      await storage.revokeUserPublicApiKey(req.session.userId!);
      res.json({ ok: true });
    } catch (err) {
      console.error("[api-key] revoke error:", err);
      res.status(500).json({ message: "Failed to revoke API key" });
    }
  });

  // ─── Public Read-Only API (v1) ────────────────────────────────────────────
  async function requireApiKey(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers["authorization"] || "";
    const xApiKey = req.headers["x-api-key"] as string | undefined;
    let rawKey = xApiKey || "";
    if (!rawKey && authHeader.toLowerCase().startsWith("bearer ")) {
      rawKey = authHeader.slice(7).trim();
    }
    if (!rawKey || !rawKey.startsWith("ftk_")) {
      return res.status(401).json({ message: "Missing or invalid API key. Use Authorization: Bearer <key> or X-API-Key header." });
    }
    try {
      const { createHash } = await import("crypto");
      const keyHash = createHash("sha256").update(rawKey).digest("hex");
      const user = await storage.getUserByPublicApiKeyHash(keyHash);
      if (!user) return res.status(401).json({ message: "API key not found or revoked." });
      if (user.disabled) return res.status(403).json({ message: "Account is disabled." });

      // ClickFunnels membership check (cached 24 h)
      const keyRecord = await storage.getUserPublicApiKey(user.id);
      const cfCheckedAt = keyRecord?.cfLastCheckedAt;
      const needsCfCheck = !cfCheckedAt || (Date.now() - new Date(cfCheckedAt).getTime() > 24 * 60 * 60 * 1000);
      let cfEnrolled = user.cfEnrolled;
      if (needsCfCheck && user.email) {
        try {
          const { checkCfEnrollmentByEmail } = await import("./clickfunnels");
          const cfInfo = await checkCfEnrollmentByEmail(user.email, user.cfContactId ?? undefined);
          cfEnrolled = cfInfo.enrolled;
          await storage.updateUser(user.id, {
            cfEnrolled: cfInfo.enrolled,
            cfEnrolledAt: cfInfo.enrolled ? (user.cfEnrolledAt ?? new Date()) : user.cfEnrolledAt,
            cfRevokedAt: !cfInfo.enrolled ? new Date() : user.cfRevokedAt,
          });
          await storage.touchPublicApiKey(keyHash, true);
        } catch {
          await storage.touchPublicApiKey(keyHash, false);
        }
      } else {
        await storage.touchPublicApiKey(keyHash, false);
      }

      if (!cfEnrolled && !user.isAdmin) {
        // Honour the revocation grace window so that API key callers mid-session
        // are not immediately cut off when the webhook arrives.
        const inGrace =
          user.cfRevokedGraceUntil &&
          new Date(user.cfRevokedGraceUntil) > new Date();
        if (!inGrace) {
          return res.status(403).json({ message: "Active Fearless Influencer Academy membership required." });
        }
      }

      (req as any).apiUser = user;
      next();
    } catch (err) {
      console.error("[v1] auth error:", err);
      res.status(500).json({ message: "Internal error during API key validation." });
    }
  }

  // CORS + rate limiting for v1 API
  app.use("/api/v1", apiV1Limiter, (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, X-API-Key, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
    if (_req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // Force a live CF enrollment re-check, bypassing the 24-hour cache.
  // Used by the extension's "Check Again" button on the suspended screen so
  // a re-enrolled member can regain access within seconds.
  //
  // Disabled-user handling:
  //   • CF-suspended users (isDisabled=true, cfEnrolled=false, cfRevokedAt set)
  //     are allowed through — the whole point is to let them recover.
  //   • Administratively disabled users (isDisabled=true but NOT CF-revoked)
  //     are blocked immediately; live CF check cannot override admin action.
  app.post("/api/v1/membership/check", async (req: Request, res: Response) => {
    const authHeader = req.headers["authorization"] || "";
    const xApiKey = req.headers["x-api-key"] as string | undefined;
    let rawKey = xApiKey || "";
    if (!rawKey && authHeader.toLowerCase().startsWith("bearer ")) {
      rawKey = authHeader.slice(7).trim();
    }
    if (!rawKey || !rawKey.startsWith("ftk_")) {
      return res.status(401).json({ message: "Missing or invalid API key." });
    }
    try {
      const { createHash } = await import("crypto");
      const keyHash = createHash("sha256").update(rawKey).digest("hex");
      const user = await storage.getUserByPublicApiKeyHash(keyHash);
      if (!user) return res.status(401).json({ message: "API key not found or revoked." });

      // A CF-suspended user has isDisabled=true, cfEnrolled=false, and cfRevokedAt set.
      // Only those users should be allowed through to attempt membership recovery.
      // Administratively disabled accounts (no cfRevokedAt, or cfEnrolled not explicitly false)
      // must remain blocked regardless of CF status.
      const isCfSuspended = user.isDisabled && user.cfEnrolled === false && !!user.cfRevokedAt;
      if (user.isDisabled && !isCfSuspended) {
        return res.status(403).json({ enrolled: false, message: "Account is disabled." });
      }

      if (!user.email || !CF_API_TOKEN || !CF_COURSE_ID) {
        // CF not configured — treat as enrolled (no-op restriction)
        return res.json({ enrolled: true });
      }

      const cfInfo = await checkCfEnrollmentByEmail(user.email, user.cfContactId ?? undefined);
      if (cfInfo.enrolled) {
        // Membership restored — re-enable the account and update CF fields
        await storage.updateUser(user.id, {
          cfEnrolled: true,
          cfEnrolledAt: user.cfEnrolledAt ?? new Date(),
          cfRevokedAt: null,
          isDisabled: false,
          cfContactId: cfInfo.contactId ?? user.cfContactId,
        });
      } else {
        // Still not enrolled — keep disabled, refresh the revoked timestamp
        await storage.updateUser(user.id, {
          cfEnrolled: false,
          cfRevokedAt: new Date(),
        });
      }
      // Reset the 24-hour cache stamp so the next regular requireApiKey call
      // also sees the fresh result instead of skipping the check.
      await storage.touchPublicApiKey(keyHash, true);

      return res.json({ enrolled: cfInfo.enrolled });
    } catch (err) {
      console.error("[v1/membership/check] error:", err);
      return res.status(503).json({ enrolled: false, message: "Could not reach membership system. Please try again shortly." });
    }
  });

  app.get("/api/v1/me", requireApiKey, async (req: Request, res: Response) => {
    const user = (req as any).apiUser;
    res.json({
      id: user.id,
      displayName: user.displayName,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      cfEnrolled: user.cfEnrolled,
      timezone: user.timezone,
      createdAt: user.createdAt,
    });
  });

  app.get("/api/v1/dashboard", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const [summary, streak] = await Promise.all([
        storage.getDashboardProjectsSummary(user.id),
        storage.getDmoStreak(user.id),
      ]);
      res.json({
        projects: {
          totalActive: summary.totalActive,
          totalOpenTasks: summary.totalOpenTasks,
          totalDueThisWeek: summary.totalDueThisWeek,
          totalOverdue: summary.totalOverdue,
        },
        dmo: {
          currentStreak: streak.current,
          bestStreak: streak.best,
          totalDays: streak.totalDays,
        },
      });
    } catch (err) {
      console.error("[v1] dashboard error:", err);
      res.status(500).json({ message: "Failed to load dashboard data" });
    }
  });

  app.get("/api/v1/tasks", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const tasks = await storage.getAllOpenTasksForUser(user.id);
      res.json({ tasks });
    } catch (err) {
      console.error("[v1] tasks error:", err);
      res.status(500).json({ message: "Failed to load tasks" });
    }
  });

  app.get("/api/v1/dmo", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const tz = user.timezone || "UTC";
      const { todayKeyInTz } = await import("../shared/datetime");
      const todayKey = todayKeyInTz(tz);
      const [entry, streak] = await Promise.all([
        storage.getDmoEntry(user.id, todayKey),
        storage.getDmoStreak(user.id),
      ]);
      res.json({ date: todayKey, entry: entry ?? null, streak });
    } catch (err) {
      console.error("[v1] dmo error:", err);
      res.status(500).json({ message: "Failed to load DMO data" });
    }
  });

  // ─── v1 Projects write access ─────────────────────────────────────────────

  app.get("/api/v1/projects", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const projects = await storage.getProjectsForUser(user.id);
      res.json({ projects });
    } catch (err) {
      console.error("[v1] projects list error:", err);
      res.status(500).json({ message: "Failed to load projects" });
    }
  });

  app.get("/api/v1/projects/:id", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const project = await storage.getProject(req.params.id, user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      res.json({ project });
    } catch (err) {
      console.error("[v1] project get error:", err);
      res.status(500).json({ message: "Failed to load project" });
    }
  });

  app.get("/api/v1/projects/:id/tasks", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const project = await storage.getProject(req.params.id, user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const tasks = await storage.getTasksForProject(req.params.id, user.id);
      res.json({ tasks: tasks.map(t => ({ ...t, parentId: t.parentTaskId ?? null })) });
    } catch (err) {
      console.error("[v1] project tasks error:", err);
      res.status(500).json({ message: "Failed to load tasks" });
    }
  });

  app.post("/api/v1/projects", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const parsed = insertProjectSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten().fieldErrors });
      const project = await storage.createProject(user.id, parsed.data);
      res.status(201).json({ project });
    } catch (err) {
      console.error("[v1] project create error:", err);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.patch("/api/v1/projects/:id", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const parsed = insertProjectSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten().fieldErrors });
      const project = await storage.updateProject(req.params.id, user.id, parsed.data);
      if (!project) return res.status(404).json({ message: "Project not found" });
      res.json({ project });
    } catch (err) {
      console.error("[v1] project update error:", err);
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  app.delete("/api/v1/projects/:id", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const existing = await storage.getProject(req.params.id, user.id);
      if (!existing) return res.status(404).json({ message: "Project not found" });
      await storage.deleteProject(req.params.id, user.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[v1] project delete error:", err);
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  // ─── v1 Project Sections (Columns) ───────────────────────────────────────

  app.get("/api/v1/projects/:id/sections", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const project = await storage.getProject(req.params.id, user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const sections = await storage.seedColumnsForProject(req.params.id, user.id);
      res.json({ sections });
    } catch (err) {
      console.error("[v1] sections list error:", err);
      res.status(500).json({ message: "Failed to load sections" });
    }
  });

  app.post("/api/v1/projects/:id/sections", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const project = await storage.getProject(req.params.id, user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const parsed = insertProjectColumnSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten().fieldErrors });
      const section = await storage.createColumn(user.id, req.params.id, parsed.data);
      res.status(201).json({ section });
    } catch (err) {
      console.error("[v1] section create error:", err);
      res.status(500).json({ message: "Failed to create section" });
    }
  });

  app.patch("/api/v1/sections/:id", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const parsed = insertProjectColumnSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten().fieldErrors });
      const section = await storage.updateColumn(req.params.id, user.id, parsed.data);
      if (!section) return res.status(404).json({ message: "Section not found" });
      res.json({ section });
    } catch (err) {
      console.error("[v1] section update error:", err);
      res.status(500).json({ message: "Failed to update section" });
    }
  });

  app.delete("/api/v1/sections/:id", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      await storage.deleteColumn(req.params.id, user.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[v1] section delete error:", err);
      res.status(500).json({ message: "Failed to delete section" });
    }
  });

  // ─── v1 Tasks write access ────────────────────────────────────────────────

  app.get("/api/v1/tasks/:id", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const task = await storage.getTask(req.params.id, user.id);
      if (!task) return res.status(404).json({ message: "Task not found" });
      res.json({ task });
    } catch (err) {
      console.error("[v1] task get error:", err);
      res.status(500).json({ message: "Failed to load task" });
    }
  });

  app.post("/api/v1/tasks", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const parsed = insertProjectTaskSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten().fieldErrors });
      const project = await storage.getProject(parsed.data.projectId, user.id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      const task = await storage.createTask(user.id, parsed.data.projectId, parsed.data);
      res.status(201).json({ task });
      fireWebhooks(user.id, "task.created", task);
    } catch (err) {
      console.error("[v1] task create error:", err);
      res.status(500).json({ message: "Failed to create task" });
    }
  });

  app.patch("/api/v1/tasks/:id", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      // Normalize mobile-friendly status aliases to internal values
      const body = { ...req.body };
      if (body.status === "completed") body.status = "done";
      if (body.status === "open") body.status = "todo";
      const parsed = updateProjectTaskSchema.safeParse(body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten().fieldErrors });
      const task = await storage.updateTask(req.params.id, user.id, parsed.data);
      if (!task) return res.status(404).json({ message: "Task not found" });
      res.json({ task });
      fireWebhooks(user.id, "task.updated", task);
    } catch (err) {
      console.error("[v1] task update error:", err);
      res.status(500).json({ message: "Failed to update task" });
    }
  });

  app.delete("/api/v1/tasks/:id", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const existing = await storage.getTask(req.params.id, user.id);
      if (!existing) return res.status(404).json({ message: "Task not found" });
      await storage.deleteTask(req.params.id, user.id);
      res.json({ ok: true });
      fireWebhooks(user.id, "task.deleted", { id: req.params.id });
    } catch (err) {
      console.error("[v1] task delete error:", err);
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  // ─── v1 DMO write + history ───────────────────────────────────────────────

  app.post("/api/v1/dmo", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const dateRaw = req.body.date;
      const date = (typeof dateRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw))
        ? dateRaw
        : (() => { const { todayKeyInTz } = require("../shared/datetime"); return todayKeyInTz(user.timezone || "UTC"); })();
      const parsed = dmoEntryDataSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten().fieldErrors });
      const entry = await storage.upsertDmoEntry(user.id, date, parsed.data);
      res.json({ entry });
      fireWebhooks(user.id, "dmo.updated", { entry });
    } catch (err) {
      console.error("[v1] dmo save error:", err);
      res.status(500).json({ message: "Failed to save DMO entry" });
    }
  });

  app.get("/api/v1/dmo/settings", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const settings = await storage.getDmoSettings(user.id);
      res.json(settings);
    } catch (err) {
      console.error("[v1] dmo settings error:", err);
      res.status(500).json({ message: "Failed to load DMO settings" });
    }
  });

  app.get("/api/v1/dmo/history", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const limit = Math.min(Number(req.query.limit) || 60, 365);
      const entries = await storage.getDmoEntries(user.id, limit);
      res.json({ entries });
    } catch (err) {
      console.error("[v1] dmo history error:", err);
      res.status(500).json({ message: "Failed to load DMO history" });
    }
  });

  // ─── v1 Video Sessions (read-only) ────────────────────────────────────────

  app.get("/api/v1/sessions/folders", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const folders = await storage.getFoldersByUser(user.id);
      res.json({ folders });
    } catch (err) {
      console.error("[v1] session folders error:", err);
      res.status(500).json({ message: "Failed to load folders" });
    }
  });

  app.get("/api/v1/sessions", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const sessions = await storage.getSessionsByUser(user.id);
      res.json({
        sessions: sessions.map(s => ({
          id: s.id,
          title: s.title,
          goalType: s.goalType,
          sourceType: s.sourceType,
          processingStatus: s.processingStatus,
          totalScore: s.scoreJson ? (s.scoreJson as any).totalScore ?? null : null,
          durationSeconds: s.durationSeconds,
          folderId: s.folderId,
          thumbnailPath: s.thumbnailPath,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
        })),
      });
    } catch (err) {
      console.error("[v1] sessions list error:", err);
      res.status(500).json({ message: "Failed to load sessions" });
    }
  });

  app.get("/api/v1/sessions/:id", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const session = await storage.getSession(req.params.id);
      if (!session || session.userId !== user.id) return res.status(404).json({ message: "Session not found" });
      res.json({ session: {
        id: session.id,
        title: session.title,
        goalType: session.goalType,
        sourceType: session.sourceType,
        processingStatus: session.processingStatus,
        durationSeconds: session.durationSeconds,
        folderId: session.folderId,
        thumbnailPath: session.thumbnailPath,
        transcriptText: session.transcriptEditedText || session.transcriptText,
        scoreJson: session.scoreJson,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      }});
    } catch (err) {
      console.error("[v1] session detail error:", err);
      res.status(500).json({ message: "Failed to load session" });
    }
  });

  // ─── v1 Teleprompter (full CRUD) ──────────────────────────────────────────

  app.get("/api/v1/teleprompter", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const scripts = await storage.getTeleprompterScriptsByUser(user.id);
      res.json({ scripts });
    } catch (err) {
      console.error("[v1] teleprompter list error:", err);
      res.status(500).json({ message: "Failed to load scripts" });
    }
  });

  app.get("/api/v1/teleprompter/:id", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const script = await storage.getTeleprompterScript(req.params.id, user.id);
      if (!script) return res.status(404).json({ message: "Script not found" });
      res.json({ script });
    } catch (err) {
      console.error("[v1] teleprompter get error:", err);
      res.status(500).json({ message: "Failed to load script" });
    }
  });

  app.post("/api/v1/teleprompter", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const { title, content } = req.body;
      if (!title || typeof title !== "string" || !title.trim()) return res.status(400).json({ message: "title is required" });
      if (typeof content !== "string") return res.status(400).json({ message: "content is required" });
      const script = await storage.createTeleprompterScript(user.id, { title: title.trim(), content });
      res.status(201).json({ script });
    } catch (err) {
      console.error("[v1] teleprompter create error:", err);
      res.status(500).json({ message: "Failed to create script" });
    }
  });

  app.patch("/api/v1/teleprompter/:id", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const { title, content } = req.body;
      if (title !== undefined && (typeof title !== "string" || !title.trim())) return res.status(400).json({ message: "title must be a non-empty string" });
      const script = await storage.updateTeleprompterScript(req.params.id, user.id, {
        ...(title !== undefined ? { title: title.trim() } : {}),
        ...(content !== undefined ? { content } : {}),
      });
      if (!script) return res.status(404).json({ message: "Script not found" });
      res.json({ script });
    } catch (err) {
      console.error("[v1] teleprompter update error:", err);
      res.status(500).json({ message: "Failed to update script" });
    }
  });

  app.delete("/api/v1/teleprompter/:id", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const ok = await storage.deleteTeleprompterScript(req.params.id, user.id);
      if (!ok) return res.status(404).json({ message: "Script not found" });
      res.json({ ok: true });
    } catch (err) {
      console.error("[v1] teleprompter delete error:", err);
      res.status(500).json({ message: "Failed to delete script" });
    }
  });

  // ─── v1 Webhooks (register / list / delete) ──────────────────────────────

  const VALID_EVENTS = ["*", "task.created", "task.updated", "task.deleted", "project.created", "project.updated", "project.deleted", "dmo.updated"];

  app.get("/api/v1/webhooks", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const list = await storage.getWebhooksForUser(user.id);
      // Never return the secret in list view
      res.json({ webhooks: list.map(({ secret: _s, ...rest }) => rest) });
    } catch (err) {
      console.error("[v1] webhooks list error:", err);
      res.status(500).json({ message: "Failed to load webhooks" });
    }
  });

  app.post("/api/v1/webhooks", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const { url, label, events } = req.body;
      if (!url || typeof url !== "string" || !/^https?:\/\/.+/.test(url)) {
        return res.status(400).json({ message: "A valid url is required" });
      }
      const safeUrl = await safeNormalizeWebsite(url);
      if (!safeUrl) {
        return res.status(400).json({ message: "URL resolves to a private or reserved address and cannot be used as a webhook target." });
      }
      if (events !== undefined && (!Array.isArray(events) || events.some((e: string) => !VALID_EVENTS.includes(e)))) {
        return res.status(400).json({ message: `events must be an array of: ${VALID_EVENTS.join(", ")}` });
      }
      const { webhook, secret } = await storage.createWebhook(user.id, { url: safeUrl, label, events });
      // Return secret only on creation — not retrievable again
      res.status(201).json({ webhook: { ...webhook, secret } });
    } catch (err) {
      console.error("[v1] webhooks create error:", err);
      res.status(500).json({ message: "Failed to create webhook" });
    }
  });

  app.patch("/api/v1/webhooks/:id", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const { active, label, events } = req.body;
      if (events !== undefined && (!Array.isArray(events) || events.some((e: string) => !VALID_EVENTS.includes(e)))) {
        return res.status(400).json({ message: `events must be an array of: ${VALID_EVENTS.join(", ")}` });
      }
      const updated = await storage.updateWebhook(req.params.id, user.id, { active, label, events });
      if (!updated) return res.status(404).json({ message: "Webhook not found" });
      const { secret: _s, ...rest } = updated;
      res.json({ webhook: rest });
    } catch (err) {
      console.error("[v1] webhooks update error:", err);
      res.status(500).json({ message: "Failed to update webhook" });
    }
  });

  app.delete("/api/v1/webhooks/:id", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      await storage.deleteWebhook(req.params.id, user.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[v1] webhooks delete error:", err);
      res.status(500).json({ message: "Failed to delete webhook" });
    }
  });

  // ─── v1: Inbox Analyzer (read-only) ──────────────────────────────────────────

  // GET /api/v1/inbox-analyzer/address
  // Returns the user's seed address and current placement monitoring state.
  app.get("/api/v1/inbox-analyzer/address", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const addr = await storage.getOrCreateInboxAddress(user.id);
      const { getInboxAddress } = await import("./inboxAnalyzer");
      const rawResults = addr.lastPlacementResults as Array<Record<string, unknown>> | null;
      const lastPlacementResults = rawResults
        ? rawResults.map(({ email: _e, ...rest }) => rest)
        : null;
      res.json({
        token: addr.token,
        email: getInboxAddress(addr.token),
        sendingFromAddress: addr.sendingFromAddress || null,
        lastPlacementResults,
        lastPlacementCheckedAt: addr.lastPlacementCheckedAt || null,
        placementAutoCheckUntil: addr.placementAutoCheckUntil || null,
        placementCheckMessageId: addr.placementCheckMessageId || null,
        placementCheckSubject: addr.placementCheckSubject || null,
        placementCheckReceivedAt: addr.placementCheckReceivedAt || null,
        createdAt: addr.createdAt,
      });
    } catch (err) {
      console.error("[v1] inbox-analyzer address error:", err);
      res.status(500).json({ message: "Failed to get inbox address" });
    }
  });

  // GET /api/v1/inbox-analyzer/emails?limit=50&offset=0
  // Paginated list of email analyses (summary fields only — no body HTML/raw headers).
  app.get("/api/v1/inbox-analyzer/emails", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 100);
      const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
      const all = await storage.getEmailAnalyses(user.id, 500);
      const page = all.slice(offset, offset + limit);
      res.json({
        total: all.length,
        limit,
        offset,
        emails: page.map(e => ({
          id: e.id,
          subject: e.subject,
          fromAddress: e.fromAddress,
          fromName: e.fromName || null,
          receivedAt: e.receivedAt,
          status: e.status,
          overallScore: e.overallScore ?? null,
          spamScore: e.spamScore ?? null,
          copyScore: e.copyScore ?? null,
          spfResult: e.spfResult || null,
          dkimResult: e.dkimResult || null,
          dmarcResult: e.dmarcResult || null,
          sendingDomain: e.sendingDomain || null,
          sendingIp: e.sendingIp || null,
          hasPlacementResults: Array.isArray(e.placementResults) && (e.placementResults as unknown[]).length > 0,
        })),
      });
    } catch (err) {
      console.error("[v1] inbox-analyzer emails list error:", err);
      res.status(500).json({ message: "Failed to load emails" });
    }
  });

  // GET /api/v1/inbox-analyzer/emails/:id
  // Full detail of a single email analysis including all AI insights and scores.
  // bodyHtml and rawHeaders are excluded for payload size; use bodyText for content.
  app.get("/api/v1/inbox-analyzer/emails/:id", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const email = await storage.getEmailAnalysis(req.params.id, user.id);
      if (!email) return res.status(404).json({ message: "Email not found" });
      res.json({
        id: email.id,
        subject: email.subject,
        fromAddress: email.fromAddress,
        fromName: email.fromName || null,
        replyTo: email.replyTo || null,
        messageId: email.messageId || null,
        receivedAt: email.receivedAt,
        status: email.status,
        bodyText: email.bodyText || null,
        sendingDomain: email.sendingDomain || null,
        sendingIp: email.sendingIp || null,
        // Scores
        overallScore: email.overallScore ?? null,
        spamScore: email.spamScore ?? null,
        copyScore: email.copyScore ?? null,
        // Authentication
        spfResult: email.spfResult || null,
        dkimResult: email.dkimResult || null,
        dmarcResult: email.dmarcResult || null,
        spfRecordExists: email.spfRecordExists ?? null,
        dkimRecordExists: email.dkimRecordExists ?? null,
        dmarcRecordExists: email.dmarcRecordExists ?? null,
        // AI insights (full JSONB objects)
        spamFlags: email.spamFlags || null,
        copyFeedback: email.copyFeedback || null,
        subjectAnalysis: email.subjectAnalysis || null,
        technicalHealth: email.technicalHealth || null,
        senderTrust: email.senderTrust || null,
        contentQuality: email.contentQuality || null,
        canSpamCompliance: email.canSpamCompliance || null,
        // Placement
        placementResults: email.placementResults || null,
        placementConfirmedAt: email.placementConfirmedAt || null,
      });
    } catch (err) {
      console.error("[v1] inbox-analyzer email detail error:", err);
      res.status(500).json({ message: "Failed to load email" });
    }
  });

  // GET /api/v1/inbox-analyzer/emails/:id/placement
  // Placement results for a specific email with a computed inboxRate percentage.
  app.get("/api/v1/inbox-analyzer/emails/:id/placement", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const email = await storage.getEmailAnalysis(req.params.id, user.id);
      if (!email) return res.status(404).json({ message: "Email not found" });
      const results = email.placementResults as any[] | null;
      if (!results || !Array.isArray(results) || results.length === 0) {
        return res.json({
          messageId: email.messageId,
          subject: email.subject,
          receivedAt: email.receivedAt,
          placementRate: null,
          results: null,
          confirmedAt: null,
        });
      }
      const definitive = results.filter((r: any) =>
        ["primary", "promotions", "social", "updates", "forums", "spam"].includes(r.status)
      );
      const inboxCount = definitive.filter((r: any) => r.status !== "spam").length;
      const placementRate = definitive.length > 0
        ? Math.round((inboxCount / definitive.length) * 100)
        : null;
      res.json({
        messageId: email.messageId,
        subject: email.subject,
        receivedAt: email.receivedAt,
        placementRate,
        results: results.map(({ email: _e, ...rest }: any) => rest),
        confirmedAt: email.placementConfirmedAt || null,
      });
    } catch (err) {
      console.error("[v1] inbox-analyzer placement error:", err);
      res.status(500).json({ message: "Failed to load placement results" });
    }
  });

  // GET /api/v1/inbox-analyzer/summary
  // Computed analytics overview: avg scores, placement rate, and trend direction.
  // Mirrors the analytics cards shown on the Inbox Analyzer web page.
  app.get("/api/v1/inbox-analyzer/summary", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const all = await storage.getEmailAnalyses(user.id, 500);
      const completed = all.filter(e => e.status === "complete" || e.overallScore != null);

      // Avg overall score + trend (compare most-recent 5 vs previous 5)
      const overallScores = completed.filter(e => e.overallScore != null).map(e => e.overallScore!);
      const avgOverallScore = overallScores.length > 0
        ? Math.round(overallScores.reduce((a, b) => a + b, 0) / overallScores.length)
        : null;
      let trend: string | null = null;
      if (overallScores.length >= 6) {
        const recentAvg = overallScores.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
        const prev = overallScores.slice(5, 10);
        const prevAvg = prev.reduce((a, b) => a + b, 0) / prev.length;
        trend = recentAvg > prevAvg + 2 ? "up" : recentAvg < prevAvg - 2 ? "down" : "flat";
      }

      // Avg auth score (SPF/DKIM/DMARC weighted, 0-100)
      const authScores = completed.map(e => {
        if (!e.spfResult && !e.dkimResult && !e.dmarcResult) return null;
        let pts = 0;
        if (e.spfResult === "pass") pts += 8;
        else if (e.spfResult === "softfail") pts += 4;
        if (e.dkimResult === "pass") pts += 8;
        if (e.dmarcResult === "pass") pts += 7;
        if (e.spfRecordExists) pts += 4;
        if (e.dkimRecordExists) pts += 3;
        return Math.round((pts / 30) * 100);
      }).filter((s): s is number => s != null);
      const avgAuthScore = authScores.length > 0
        ? Math.round(authScores.reduce((a, b) => a + b, 0) / authScores.length)
        : null;

      // Avg content quality score (0-100)
      const contentScores = completed.map(e => {
        const cq = e.contentQuality as any;
        if (!cq) return null;
        let pts = 0;
        if (!cq.hasUrlShortener) pts += 2;
        const hidClass = cq.hiddenTextClassification ?? (cq.hasHiddenText ? "SPAM_SIGNAL" : "NONE");
        if (hidClass === "NONE" || hidClass === "PREHEADER") pts += 2;
        else if (hidClass === "AMBIGUOUS") pts += 1;
        if (cq.htmlToTextRatio >= 0.3) pts += 1;
        if (cq.linkToTextRatio <= 0.02) pts += 1;
        const wc = cq.wordCount;
        if (wc >= 50 && wc <= 500) pts += 2;
        else if (wc > 500 && wc <= 900) pts += 1;
        const sc = cq.subjectCharCount ?? 0;
        if (sc >= 20 && sc <= 60) pts += 1;
        if (cq.hasPersonalization || cq.hasPs) pts += 1;
        return Math.round((pts / 10) * 100);
      }).filter((s): s is number => s != null);
      const avgContentQualityScore = contentScores.length > 0
        ? Math.round(contentScores.reduce((a, b) => a + b, 0) / contentScores.length)
        : null;

      // Placement rate across emails that have definitive results
      const withPlacement = completed.filter(e => Array.isArray(e.placementResults) && (e.placementResults as unknown[]).length > 0);
      let placementRate: number | null = null;
      if (withPlacement.length > 0) {
        const inboxCount = withPlacement.filter(e => {
          const results = e.placementResults as any[];
          const definitive = results.filter((r: any) =>
            ["primary", "promotions", "social", "updates", "forums", "spam"].includes(r.status)
          );
          return definitive.length > 0 && definitive.some((r: any) => r.status !== "spam");
        }).length;
        placementRate = Math.round((inboxCount / withPlacement.length) * 100);
      }

      res.json({
        totalEmails: all.length,
        completedEmails: completed.length,
        avgOverallScore,
        avgAuthScore,
        avgContentQualityScore,
        placementRate,
        placementCheckedCount: withPlacement.length,
        trend,
        computedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[v1] inbox-analyzer summary error:", err);
      res.status(500).json({ message: "Failed to compute summary" });
    }
  });

  // ─── Feedback (Bug Reports & Feature Requests) ────────────────────────────────
  app.get("/api/feedback", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;
    try {
      const posts = await storage.getFeedbackPosts(req.session.userId, !!user.isAdmin, type, status);
      res.json(posts);
    } catch (err) {
      console.error("[feedback] list error:", err);
      res.status(500).json({ message: "Failed to load feedback" });
    }
  });

  // Serve feedback screenshots
  app.get("/api/feedback-screenshots/:filename", requireAuth, (req: Request, res: Response) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(SCREENSHOTS_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "Not found" });
    res.sendFile(filePath);
  });

  app.post("/api/feedback", screenshotUpload.single("screenshot"), async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
    const { title, description, type } = req.body;
    if (!title?.trim() || !description?.trim() || !["bug", "feature"].includes(type)) {
      // Clean up uploaded file if validation fails
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ message: "Title, description, and valid type are required" });
    }
    // Only allow screenshots on bug reports
    const screenshotPath = (type === "bug" && req.file) ? `feedback-screenshots/${req.file.filename}` : null;
    try {
      const post = await storage.createFeedbackPost({
        userId: req.session.userId,
        title: title.trim(),
        description: description.trim(),
        type,
        status: "open",
        screenshotPath,
      });
      res.status(201).json(post);

      // Fire notifications asynchronously (don't block response)
      (async () => {
        try {
          const { sendEmail } = await import("./email-sendgrid");
          const [submitter, resources] = await Promise.all([
            storage.getUser(req.session.userId!),
            storage.getActiveEmailResources(),
          ]);
          if (!submitter) return;

          const prefKey = type === "feature" ? "featureRequestReceived" : "bugReportReceived";

          // Email the submitter confirmation
          if (submitter.email) {
            const submitterPrefs = await storage.getNotificationPrefs(submitter.id);
            if (submitterPrefs.allEnabled && submitterPrefs.preferences[prefKey]?.enabled !== false) {
              const tpl = emailTemplates.feedbackSubmittedEmail(
                { firstName: submitter.firstName, type: type as "feature" | "bug", title: title.trim(), postId: post.id },
                resources
              );
              await sendEmail({ to: submitter.email, ...tpl });
            }
          }

          // For bug reports, also notify all admins
          if (type === "bug") {
            const admins = await storage.getAdminUsersForNotifications();
            for (const admin of admins) {
              if (!admin.email || admin.id === submitter.id) continue;
              const adminPrefs = await storage.getNotificationPrefs(admin.id);
              if (adminPrefs.allEnabled && adminPrefs.preferences.bugReportReceived?.enabled !== false) {
                const tpl = emailTemplates.newBugAdminAlertEmail({
                  submitterName: submitter.displayName || submitter.firstName || "A member",
                  submitterEmail: submitter.email || "",
                  title: title.trim(),
                  description: description.trim(),
                  postId: post.id,
                }, resources);
                await sendEmail({ to: admin.email, ...tpl });
              }
            }
          }
        } catch (notifErr) {
          console.error("[feedback] notification error:", notifErr);
        }
      })();
    } catch (err) {
      console.error("[feedback] create error:", err);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

  app.get("/api/feedback/:id", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    try {
      const post = await storage.getFeedbackPost(req.params.id, req.session.userId, !!user.isAdmin);
      if (!post) return res.status(404).json({ message: "Not found" });
      res.json(post);
    } catch (err) {
      console.error("[feedback] get error:", err);
      res.status(500).json({ message: "Failed to load feedback post" });
    }
  });

  app.post("/api/feedback/:id/vote", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
    try {
      const result = await storage.toggleFeedbackVote(req.params.id, req.session.userId);
      res.json(result);
    } catch (err) {
      console.error("[feedback] vote error:", err);
      res.status(500).json({ message: "Failed to toggle vote" });
    }
  });

  app.post("/api/feedback/:id/comments", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const { body, isAdminNote } = req.body;
    if (!body?.trim()) return res.status(400).json({ message: "Comment body is required" });
    if (isAdminNote && !user.isAdmin) return res.status(403).json({ message: "Forbidden" });
    try {
      const comment = await storage.addFeedbackComment(req.params.id, req.session.userId, body.trim(), !!isAdminNote);
      res.status(201).json(comment);

      // Fire comment notifications asynchronously
      (async () => {
        try {
          const { sendEmail } = await import("./email-sendgrid");
          const [post, resources, admins] = await Promise.all([
            storage.getFeedbackPost(req.params.id, req.session.userId!, true),
            storage.getActiveEmailResources(),
            storage.getAdminUsersForNotifications(),
          ]);
          if (!post) return;

          const postType = post.type as "feature" | "bug";
          const commenterName = user.displayName || user.firstName || "Someone";
          const prefKey = postType === "feature" ? "featureRequestComment" : "bugReportComment";

          // Notify post owner if they're not the one commenting
          if (post.userId !== req.session.userId) {
            const owner = await storage.getUser(post.userId);
            if (owner?.email) {
              const ownerPrefs = await storage.getNotificationPrefs(owner.id);
              if (ownerPrefs.allEnabled && ownerPrefs.preferences[prefKey]?.enabled !== false) {
                const tpl = emailTemplates.feedbackCommentEmail({
                  firstName: owner.firstName,
                  type: postType,
                  postTitle: post.title,
                  commenterName,
                  commentBody: body.trim(),
                  isAdmin: false,
                  postId: req.params.id,
                }, resources);
                await sendEmail({ to: owner.email, ...tpl });
              }
            }
          }

          // Notify all admins if the commenter is not an admin
          if (!user.isAdmin) {
            for (const admin of admins) {
              if (!admin.email) continue;
              const adminPrefs = await storage.getNotificationPrefs(admin.id);
              if (adminPrefs.allEnabled && adminPrefs.preferences[prefKey]?.enabled !== false) {
                const tpl = emailTemplates.feedbackCommentEmail({
                  firstName: admin.firstName,
                  type: postType,
                  postTitle: post.title,
                  commenterName,
                  commentBody: body.trim(),
                  isAdmin: true,
                  postId: req.params.id,
                }, resources);
                await sendEmail({ to: admin.email, ...tpl });
              }
            }
          }
        } catch (notifErr) {
          console.error("[feedback] comment notification error:", notifErr);
        }
      })();
    } catch (err) {
      console.error("[feedback] comment error:", err);
      res.status(500).json({ message: "Failed to add comment" });
    }
  });

  app.patch("/api/feedback/:id", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(req.session.userId);
    if (!user?.isAdmin) return res.status(403).json({ message: "Forbidden" });
    const { status, adminResponse } = req.body;
    try {
      // Fetch the existing post before updating so we can detect status changes
      const existingPost = await storage.getFeedbackPost(req.params.id, req.session.userId, true);
      const previousStatus = existingPost?.status;

      const post = await storage.updateFeedbackPost(req.params.id, { status, adminResponse });
      if (!post) return res.status(404).json({ message: "Not found" });
      res.json(post);

      // Fire status-change notification asynchronously
      if (status && status !== previousStatus) {
        (async () => {
          try {
            const { sendEmail } = await import("./email-sendgrid");
            const [resources] = await Promise.all([storage.getActiveEmailResources()]);
            const owner = await storage.getUser(post.userId);
            if (owner?.email) {
              const ownerPrefs = await storage.getNotificationPrefs(owner.id);
              if (ownerPrefs.allEnabled && ownerPrefs.preferences.feedbackStatusChanged?.enabled !== false) {
                const tpl = emailTemplates.feedbackStatusChangedEmail({
                  firstName: owner.firstName,
                  type: post.type as "feature" | "bug",
                  postTitle: post.title,
                  newStatus: status,
                  postId: req.params.id,
                  adminResponse: adminResponse || post.adminResponse,
                }, resources);
                await sendEmail({ to: owner.email, ...tpl });
              }
            }
          } catch (notifErr) {
            console.error("[feedback] status notification error:", notifErr);
          }
        })();
      }
    } catch (err) {
      console.error("[feedback] update error:", err);
      res.status(500).json({ message: "Failed to update feedback" });
    }
  });

  app.delete("/api/feedback/:id", async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(req.session.userId);
    if (!user?.isAdmin) return res.status(403).json({ message: "Forbidden" });
    try {
      await storage.deleteFeedbackPost(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[feedback] delete error:", err);
      res.status(500).json({ message: "Failed to delete feedback" });
    }
  });

  // ─── iCal Calendar Feed ──────────────────────────────────────────────────────

  function icalDateOnly(d: Date): string {
    const yy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yy}${mm}${dd}`;
  }

  function icalDtstamp(d: Date): string {
    return `${icalDateOnly(d)}T${String(d.getUTCHours()).padStart(2,"0")}${String(d.getUTCMinutes()).padStart(2,"0")}${String(d.getUTCSeconds()).padStart(2,"0")}Z`;
  }

  function icalNextDay(d: Date): string {
    const next = new Date(d);
    next.setUTCDate(next.getUTCDate() + 1);
    return icalDateOnly(next);
  }

  function icalEscape(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }

  // Returns the user's current iCal subscription URL (generates token if missing)
  app.get("/api/calendar/ical-url", requireAuth, async (req: Request, res: Response) => {
    try {
      let user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      let token = user.icalToken;
      if (!token) token = await storage.rotateIcalToken(req.session.userId!);
      const proto = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const url = `${proto}://${host}/api/calendar/ical/${token}.ics`;
      res.json({ url });
    } catch (err) {
      console.error("[ical] get-url error:", err);
      res.status(500).json({ message: "Failed to get iCal URL" });
    }
  });

  // Regenerates the token, invalidating the old link
  app.post("/api/calendar/rotate-ical-token", requireAuth, async (req: Request, res: Response) => {
    try {
      const token = await storage.rotateIcalToken(req.session.userId!);
      const proto = req.headers["x-forwarded-proto"] || req.protocol;
      const host = req.headers["x-forwarded-host"] || req.get("host");
      const url = `${proto}://${host}/api/calendar/ical/${token}.ics`;
      res.json({ url });
    } catch (err) {
      console.error("[ical] rotate-token error:", err);
      res.status(500).json({ message: "Failed to rotate token" });
    }
  });

  // Public iCal feed — secured by the opaque token, no session required
  app.get("/api/calendar/ical/:token", async (req: Request, res: Response) => {
    try {
      const token = req.params.token.replace(/\.ics$/, "");
      const user = await storage.getUserByIcalToken(token);
      if (!user) return res.status(404).type("text/plain").send("Calendar not found");

      const [tasks, projects] = await Promise.all([
        storage.getAllTasksWithDueDatesForUser(user.id),
        storage.getProjectsForUser(user.id),
      ]);

      const now = new Date();
      const dtstamp = icalDtstamp(now);
      const appHost = "toolkit.fearlessmarketinglab.com";

      function priorityLabel(p: string): string {
        if (p === "high") return "🔴 High";
        if (p === "medium") return "🟡 Medium";
        if (p === "low") return "🟢 Low";
        return "";
      }

      const lines: string[] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Academy Toolkit//Projects Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        `X-WR-CALNAME:${user.firstName ? `${user.firstName}'s Project Calendar` : "My Project Calendar"}`,
        "X-WR-TIMEZONE:UTC",
      ];

      // ── Tasks ───────────────────────────────────────────────────────────────
      for (const t of tasks) {
        if (!t.dueDate) continue;
        const due = new Date(t.dueDate);
        const hasTime = dueHasTime(due);
        const isOverdue = due < now;

        const summary = icalEscape(
          `${isOverdue ? "⚠️ OVERDUE: " : ""}${t.title}${t.projectName ? ` [${t.projectName}]` : ""}`
        );

        const descParts: string[] = [];
        if (t.projectName) descParts.push(`Project: ${t.projectName}`);
        if (t.priority && t.priority !== "none") descParts.push(`Priority: ${priorityLabel(t.priority)}`);
        if (Array.isArray(t.tags) && t.tags.length > 0) descParts.push(`Tags: ${(t.tags as string[]).join(", ")}`);
        if (isOverdue) descParts.push("⚠️ This task is overdue");
        if (t.notes) descParts.push(`\nNotes: ${t.notes}`);
        descParts.push(`\nOpen in Toolkit: https://${appHost}/projects?project=${t.projectId}`);
        const desc = icalEscape(descParts.join("\n"));

        // Day-before alarm (all events)
        const alarms: string[] = [
          "BEGIN:VALARM",
          "TRIGGER:-P1D",
          "ACTION:DISPLAY",
          "DESCRIPTION:Due tomorrow",
          "END:VALARM",
        ];

        if (hasTime) {
          // Timed event — also alert 30 min before
          alarms.push(
            "BEGIN:VALARM",
            "TRIGGER:-PT30M",
            "ACTION:DISPLAY",
            "DESCRIPTION:Due in 30 minutes",
            "END:VALARM",
          );
          // DTEND = DTSTART + 1 hour so the event block is visible on the calendar
          const dtend = new Date(due.getTime() + 60 * 60 * 1000);
          lines.push(
            "BEGIN:VEVENT",
            `UID:task-${t.id}@${appHost}`,
            `DTSTAMP:${dtstamp}`,
            `DTSTART:${icalDtstamp(due)}`,
            `DTEND:${icalDtstamp(dtend)}`,
            `SUMMARY:${summary}`,
            `DESCRIPTION:${desc}`,
            `URL:https://${appHost}/projects?project=${t.projectId}`,
            ...alarms,
            "END:VEVENT",
          );
        } else {
          // All-day event — also alert morning of (9 AM, 9 h after midnight start)
          alarms.push(
            "BEGIN:VALARM",
            "TRIGGER:PT9H",
            "ACTION:DISPLAY",
            "DESCRIPTION:Due today",
            "END:VALARM",
          );
          lines.push(
            "BEGIN:VEVENT",
            `UID:task-${t.id}@${appHost}`,
            `DTSTAMP:${dtstamp}`,
            `DTSTART;VALUE=DATE:${icalDateOnly(due)}`,
            `DTEND;VALUE=DATE:${icalNextDay(due)}`,
            `SUMMARY:${summary}`,
            `DESCRIPTION:${desc}`,
            `URL:https://${appHost}/projects?project=${t.projectId}`,
            ...alarms,
            "END:VEVENT",
          );
        }
      }

      // ── Projects (duration block + due-date marker) ──────────────────────────
      for (const p of projects) {
        if (!p.dueDate || p.status === "archived") continue;
        const due = new Date(p.dueDate);
        const isOverdue = due < now;

        const descParts: string[] = [];
        if (p.description) descParts.push(p.description);
        descParts.push(`Open tasks: ${p.openTasks}`);
        if (isOverdue) descParts.push("⚠️ This project is overdue");
        descParts.push(`\nOpen in Toolkit: https://${appHost}/projects?project=${p.id}`);
        const desc = icalEscape(descParts.join("\n"));

        const summary = icalEscape(`${isOverdue ? "⚠️ OVERDUE: " : ""}📁 ${p.name} (project due)`);

        // Duration block spans from project creation → due date (transparent so it doesn't block time)
        lines.push(
          "BEGIN:VEVENT",
          `UID:project-${p.id}@${appHost}`,
          `DTSTAMP:${dtstamp}`,
          `DTSTART;VALUE=DATE:${icalDateOnly(new Date(p.createdAt))}`,
          `DTEND;VALUE=DATE:${icalNextDay(due)}`,
          `SUMMARY:${summary}`,
          `DESCRIPTION:${desc}`,
          `URL:https://${appHost}/projects?project=${p.id}`,
          "TRANSP:TRANSPARENT",
          "BEGIN:VALARM",
          "TRIGGER:-P1D",
          "ACTION:DISPLAY",
          "DESCRIPTION:Project due tomorrow",
          "END:VALARM",
          "BEGIN:VALARM",
          "TRIGGER:PT9H",
          "ACTION:DISPLAY",
          "DESCRIPTION:Project due today",
          "END:VALARM",
          "END:VEVENT",
        );
      }

      lines.push("END:VCALENDAR");

      res.set("Content-Type", "text/calendar; charset=utf-8");
      res.set("Content-Disposition", 'attachment; filename="academy-toolkit.ics"');
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
      res.send(lines.join("\r\n"));
    } catch (err) {
      console.error("[ical] feed error:", err);
      res.status(500).type("text/plain").send("Failed to generate calendar");
    }
  });

  // ─── Funnel Planner ───────────────────────────────────────────────────────

  app.get("/api/funnels", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const list = await storage.getFunnelsByUser(userId);
      res.json(list);
    } catch (err) {
      console.error("[funnels] list error:", err);
      res.status(500).json({ message: "Failed to load funnels" });
    }
  });

  app.post("/api/funnels", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const schema = z.object({
        name: z.string().min(1).max(200).default("Untitled Funnel"),
        description: z.string().max(1000).optional(),
        canvasData: z.any().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });
      const funnel = await storage.createFunnel(userId, parsed.data);
      res.status(201).json(funnel);
    } catch (err) {
      console.error("[funnels] create error:", err);
      res.status(500).json({ message: "Failed to create funnel" });
    }
  });

  app.get("/api/funnels/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const funnel = await storage.getFunnelById(req.params.id);
      if (!funnel) return res.status(404).json({ message: "Funnel not found" });
      if (funnel.userId !== userId) return res.status(403).json({ message: "Access denied" });
      res.json(funnel);
    } catch (err) {
      console.error("[funnels] get error:", err);
      res.status(500).json({ message: "Failed to load funnel" });
    }
  });

  app.patch("/api/funnels/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const schema = z.object({
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(1000).optional().nullable(),
        canvasData: z.any().optional(),
        thumbnailData: z.string().optional().nullable(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });
      const existing = await storage.getFunnelById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Funnel not found" });
      if (existing.userId !== userId) return res.status(403).json({ message: "Access denied" });
      const updated = await storage.updateFunnel(req.params.id, userId, parsed.data as any);
      res.json(updated);
    } catch (err) {
      console.error("[funnels] update error:", err);
      res.status(500).json({ message: "Failed to update funnel" });
    }
  });

  // Beacon endpoint — same logic as PATCH but accepts POST from sendBeacon on page unload
  app.post("/api/funnels/:id/beacon", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const schema = z.object({
        name: z.string().min(1).max(200).optional(),
        canvasData: z.any().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data" });
      const existing = await storage.getFunnelById(req.params.id);
      if (!existing || existing.userId !== userId) return res.status(403).json({ message: "Access denied" });
      await storage.updateFunnel(req.params.id, userId, parsed.data as any);
      res.status(204).end();
    } catch (err) {
      console.error("[funnels] beacon error:", err);
      res.status(500).end();
    }
  });

  app.delete("/api/funnels/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const existing = await storage.getFunnelById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Funnel not found" });
      if (existing.userId !== userId) return res.status(403).json({ message: "Access denied" });
      await storage.deleteFunnel(req.params.id, userId);
      res.status(204).send();
    } catch (err) {
      console.error("[funnels] delete error:", err);
      res.status(500).json({ message: "Failed to delete funnel" });
    }
  });

  app.post("/api/funnels/:id/duplicate", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const existing = await storage.getFunnelById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Funnel not found" });
      if (existing.userId !== userId) return res.status(403).json({ message: "Access denied" });
      const copy = await storage.duplicateFunnel(req.params.id, userId);
      res.status(201).json(copy);
    } catch (err) {
      console.error("[funnels] duplicate error:", err);
      res.status(500).json({ message: "Failed to duplicate funnel" });
    }
  });

  // ─── Funnel sharing ──────────────────────────────────────────────────────────

  // Public endpoint — no auth required — returns read-only funnel data by share token
  // Password-protected funnels require a follow-up POST to /unlock with { password } in body
  app.get("/api/funnels/share/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const funnel = await storage.getFunnelByShareToken(token);
      if (!funnel) return res.status(404).json({ message: "Share link not found or has been revoked." });

      if (funnel.sharePasswordHash) {
        return res.status(401).json({ message: "Password required", passwordRequired: true });
      }

      res.json({
        id: funnel.id,
        name: funnel.name,
        description: funnel.description,
        canvasData: funnel.canvasData,
        thumbnailData: funnel.thumbnailData,
        updatedAt: funnel.updatedAt,
      });
    } catch (err) {
      console.error("[funnels/share] get error:", err);
      res.status(500).json({ message: "Failed to load shared funnel" });
    }
  });

  // Public endpoint — password unlock for protected share links (password in POST body, never in URL)
  app.post("/api/funnels/share/:token/unlock", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { password } = req.body as { password?: string };
      if (!password || typeof password !== "string") {
        return res.status(400).json({ message: "Password is required" });
      }
      const funnel = await storage.getFunnelByShareToken(token);
      if (!funnel) return res.status(404).json({ message: "Share link not found or has been revoked." });
      if (!funnel.sharePasswordHash) {
        return res.json({
          id: funnel.id,
          name: funnel.name,
          description: funnel.description,
          canvasData: funnel.canvasData,
          thumbnailData: funnel.thumbnailData,
          updatedAt: funnel.updatedAt,
        });
      }
      const valid = await bcrypt.compare(password, funnel.sharePasswordHash);
      if (!valid) return res.status(401).json({ message: "Incorrect password", passwordRequired: true });
      res.json({
        id: funnel.id,
        name: funnel.name,
        description: funnel.description,
        canvasData: funnel.canvasData,
        thumbnailData: funnel.thumbnailData,
        updatedAt: funnel.updatedAt,
      });
    } catch (err) {
      console.error("[funnels/share] unlock error:", err);
      res.status(500).json({ message: "Failed to unlock shared funnel" });
    }
  });

  // Generate (or regenerate) a share token for a funnel
  app.post("/api/funnels/:id/share", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const schema = z.object({ password: z.string().max(100).optional().nullable() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });

      const existing = await storage.getFunnelById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Funnel not found" });
      if (existing.userId !== userId) return res.status(403).json({ message: "Access denied" });

      const token = crypto.randomBytes(24).toString("hex");
      const passwordHash = parsed.data.password ? await bcrypt.hash(parsed.data.password, 10) : null;

      const updated = await storage.setFunnelShareToken(req.params.id, userId, token, passwordHash);
      res.json({ shareToken: updated?.shareToken, hasPassword: !!updated?.sharePasswordHash });
    } catch (err) {
      console.error("[funnels/share] create error:", err);
      res.status(500).json({ message: "Failed to create share link" });
    }
  });

  // Revoke a share token
  app.delete("/api/funnels/:id/share", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const existing = await storage.getFunnelById(req.params.id);
      if (!existing) return res.status(404).json({ message: "Funnel not found" });
      if (existing.userId !== userId) return res.status(403).json({ message: "Access denied" });
      await storage.clearFunnelShareToken(req.params.id, userId);
      res.status(204).end();
    } catch (err) {
      console.error("[funnels/share] revoke error:", err);
      res.status(500).json({ message: "Failed to revoke share link" });
    }
  });

  // ─── Funnel Brain ────────────────────────────────────────────────────────────

  const brainUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 1 }, // 20 MB per file
  });

  // GET brain state (targeting + file list, no extracted text in list response)
  app.get("/api/funnels/:id/brain", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const funnel = await storage.getFunnelById(req.params.id);
      if (!funnel) return res.status(404).json({ message: "Funnel not found" });
      if (funnel.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      const files = await storage.getFunnelBrainFiles(req.params.id, userId);
      res.json({
        targeting: funnel.brainTargeting ?? "",
        files: files.map((f) => ({ id: f.id, filename: f.filename, fileSize: f.fileSize, mimeType: f.mimeType, createdAt: f.createdAt })),
      });
    } catch (err) {
      console.error("[funnel-brain] get error:", err);
      res.status(500).json({ message: "Failed to load funnel brain" });
    }
  });

  // PATCH targeting description
  app.patch("/api/funnels/:id/brain", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { targeting } = req.body as { targeting?: string };
      const funnel = await storage.getFunnelById(req.params.id);
      if (!funnel) return res.status(404).json({ message: "Funnel not found" });
      if (funnel.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      await storage.updateFunnelBrainTargeting(req.params.id, userId, targeting ?? "");
      res.json({ ok: true });
    } catch (err) {
      console.error("[funnel-brain] patch error:", err);
      res.status(500).json({ message: "Failed to update targeting" });
    }
  });

  // POST upload a context file — extract text, store, no raw file kept
  app.post("/api/funnels/:id/brain/files", requireAuth, brainUpload.single("file"), async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const funnel = await storage.getFunnelById(req.params.id);
      if (!funnel) return res.status(404).json({ message: "Funnel not found" });
      if (funnel.userId !== userId) return res.status(403).json({ message: "Forbidden" });

      const existing = await storage.countFunnelBrainFiles(req.params.id);
      if (existing >= 25) return res.status(400).json({ message: "Maximum 25 context files per funnel" });

      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const { originalname, mimetype, buffer, size } = req.file;
      let extractedText = "";

      try {
        if (mimetype === "application/pdf") {
          const pdfParse = (await import("pdf-parse")).default;
          const data = await pdfParse(buffer);
          extractedText = data.text ?? "";
        } else if (
          mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          originalname.toLowerCase().endsWith(".docx")
        ) {
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({ buffer });
          extractedText = result.value ?? "";
        } else {
          // Plain text, markdown, transcript files
          extractedText = buffer.toString("utf-8");
        }
      } catch (extractErr) {
        console.error("[funnel-brain] text extraction error:", extractErr);
        extractedText = buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ");
      }

      const file = await storage.addFunnelBrainFile(req.params.id, userId, {
        filename: originalname,
        mimeType: mimetype,
        fileSize: size,
        extractedText: extractedText.trim(),
      });

      res.status(201).json({ id: file.id, filename: file.filename, fileSize: file.fileSize, mimeType: file.mimeType, createdAt: file.createdAt });
    } catch (err) {
      console.error("[funnel-brain] upload error:", err);
      res.status(500).json({ message: "Failed to upload context file" });
    }
  });

  // DELETE a context file
  app.delete("/api/funnels/:id/brain/files/:fileId", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const funnel = await storage.getFunnelById(req.params.id);
      if (!funnel) return res.status(404).json({ message: "Funnel not found" });
      if (funnel.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      await storage.deleteFunnelBrainFile(req.params.fileId, userId);
      res.status(204).end();
    } catch (err) {
      console.error("[funnel-brain] delete file error:", err);
      res.status(500).json({ message: "Failed to delete context file" });
    }
  });

  // Funnel planner: capture a page screenshot via Microlink
  app.post("/api/funnels/screenshot", requireAuth, async (req: Request, res: Response) => {
    const { url } = req.body as { url?: string };
    if (!url || typeof url !== "string") return res.status(400).json({ message: "url is required" });
    let normalized = url.trim();
    if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
      normalized = "https://" + normalized;
    }
    try {
      // First try: full screenshot + metadata (30s timeout)
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      let screenshotRes: Response;
      try {
        screenshotRes = await fetch(
          `https://api.microlink.io/?url=${encodeURIComponent(normalized)}&screenshot=true&force=true`,
          { signal: controller.signal }
        );
      } finally {
        clearTimeout(timer);
      }

      type MicrolinkJson = {
        status: string;
        message?: string;
        data?: {
          screenshot?: { url?: string };
          image?: { url?: string };
          title?: string;
          description?: string;
        };
      };
      const json = await screenshotRes.json() as MicrolinkJson;
      console.log("[funnels/screenshot] microlink status:", json.status, "| message:", json.message ?? "(none)");

      let previewUrl = json.data?.screenshot?.url || json.data?.image?.url;

      // Fallback: if screenshot failed, try metadata-only to at least get OG image
      if (!previewUrl) {
        console.log("[funnels/screenshot] screenshot failed, trying OG image fallback");
        const fallbackController = new AbortController();
        const fallbackTimer = setTimeout(() => fallbackController.abort(), 15000);
        try {
          const fallbackRes = await fetch(
            `https://api.microlink.io/?url=${encodeURIComponent(normalized)}&screenshot=false&force=true`,
            { signal: fallbackController.signal }
          );
          const fallbackJson = await fallbackRes.json() as MicrolinkJson;
          console.log("[funnels/screenshot] fallback status:", fallbackJson.status);
          previewUrl = fallbackJson.data?.image?.url;
          if (previewUrl) {
            return res.json({
              screenshotUrl: previewUrl,
              title: fallbackJson.data?.title ?? json.data?.title ?? null,
              description: fallbackJson.data?.description ?? json.data?.description ?? null,
            });
          }
        } catch (fbErr) {
          console.error("[funnels/screenshot] fallback error:", fbErr);
        } finally {
          clearTimeout(fallbackTimer);
        }

        // Identify likely causes for a clearer user message
        const isCFPage = /clickfunnels\.com|myclickfunnels\.com/i.test(normalized);
        const userMsg = isCFPage
          ? "ClickFunnels checkout pages block automated screenshots. Use 'Upload your own image' instead — take a screenshot of the page and upload it."
          : "This page could not be captured automatically. It may require a login or block screenshot tools. Try 'Upload your own image' instead.";
        return res.status(422).json({ message: userMsg, canUpload: true });
      }

      res.json({
        screenshotUrl: previewUrl,
        title: json.data?.title ?? null,
        description: json.data?.description ?? null,
      });
    } catch (err: unknown) {
      const isAbort = err instanceof Error && err.name === "AbortError";
      console.error("[funnels/screenshot] error:", isAbort ? "request timed out" : err);
      res.status(isAbort ? 504 : 500).json({
        message: isAbort
          ? "The page took too long to load — make sure the URL is publicly accessible."
          : "Screenshot capture failed. Make sure the page is publicly accessible.",
      });
    }
  });

  // Funnel planner: AI email draft (uses Funnel Brain context when available)
  app.post("/api/funnels/:id/draft-email", requireAuth, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const { subject, emailDay, label, nodeId, nodes, edges } = req.body as {
      subject?: string;
      emailDay?: number;
      label?: string;
      nodeId?: string;
      nodes?: Array<{ id: string; type?: string; data?: Record<string, unknown> }>;
      edges?: Array<{ source: string; target: string }>;
    };
    const existingSubject = typeof subject === "string" ? subject.trim() : "";
    try {
      const funnel = await storage.getFunnelById(req.params.id);
      if (!funnel) return res.status(404).json({ message: "Funnel not found" });
      if (funnel.userId !== userId) return res.status(403).json({ message: "Forbidden" });

      // Build Funnel Brain context block
      const targeting = funnel.brainTargeting?.trim() ?? "";
      const brainFiles = await storage.getFunnelBrainFiles(req.params.id, userId);

      let brainContext = "";
      if (targeting || brainFiles.length > 0) {
        const parts: string[] = ["=== FUNNEL BRAIN CONTEXT ==="];
        if (targeting) parts.push(`TARGET AUDIENCE:\n${targeting}`);
        if (brainFiles.length > 0) {
          // Distribute up to 12000 chars across all files
          const perFileLimit = Math.floor(12000 / brainFiles.length);
          parts.push("CONTEXT DOCUMENTS:");
          for (const f of brainFiles) {
            const snippet = f.extractedText.slice(0, perFileLimit).trim();
            if (snippet) parts.push(`--- ${f.filename} ---\n${snippet}`);
          }
        }
        parts.push("=== END BRAIN CONTEXT ===\n");
        brainContext = parts.join("\n\n");
      }

      // Crawl the connected upstream page (capture page / opt-in page) if available
      let pageContext = "";
      if (nodeId && Array.isArray(nodes) && Array.isArray(edges)) {
        const upstreamIds = (edges as Array<{ source: string; target: string }>)
          .filter((e) => e.target === nodeId)
          .map((e) => e.source);

        const pageNode = (nodes as Array<{ id: string; data?: Record<string, unknown> }>)
          .find((n) => upstreamIds.includes(n.id) && typeof n.data?.pageUrl === "string" && n.data.pageUrl);

        if (pageNode) {
          const rawPageUrl = pageNode.data!.pageUrl as string;
          try {
            const parsedUrl = new URL(rawPageUrl);
            if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), 8000);
              const pageRes = await fetch(rawPageUrl, {
                signal: controller.signal,
                headers: { "User-Agent": "Mozilla/5.0 (compatible; FunnelBot/1.0)" },
              }).finally(() => clearTimeout(timeout));

              if (pageRes.ok) {
                const html = await pageRes.text();
                const pageText = html
                  .replace(/<script[\s\S]*?<\/script>/gi, " ")
                  .replace(/<style[\s\S]*?<\/style>/gi, " ")
                  .replace(/<[^>]+>/g, " ")
                  .replace(/&nbsp;/gi, " ")
                  .replace(/&amp;/gi, "&")
                  .replace(/&lt;/gi, "<")
                  .replace(/&gt;/gi, ">")
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 3500);

                if (pageText) {
                  const pageLabel = (pageNode.data?.label as string) || "Connected Page";
                  pageContext = `=== CONNECTED OPT-IN PAGE CONTENT ===\nThe subscriber just opted in on a page titled "${pageLabel}" (${rawPageUrl}). Here is the text from that page — use this to write an email that directly continues the conversation and delivers on what was promised:\n\n${pageText}\n=== END PAGE CONTENT ===\n\n`;
                }
              }
            }
          } catch (fetchErr) {
            console.warn("[funnels/draft-email] could not crawl page:", rawPageUrl, (fetchErr as Error).message);
          }
        }
      }

      const dayContext = emailDay ? `This is Day ${emailDay} of the email sequence.` : "";
      const labelContext = label && label !== "Email" ? `The email is labeled "${label}".` : "";

      const systemPrompt = `You are an expert email copywriter who writes high-converting marketing emails for coaches and private practice professionals. Write emails that are conversational, personal, and focused on building trust. Use clear paragraphs separated by line breaks. Always respond with valid JSON containing exactly two keys: "subject" (a compelling email subject line string) and "body" (the email body string — no greeting like "Hi [Name]", no sign-off like "Best, [Name]", just 3-4 body paragraphs ending with a clear call to action).`;

      const subjectInstruction = existingSubject
        ? `Use this subject line (do not change it): "${existingSubject}"`
        : `Also write a compelling, curiosity-driven subject line that fits the email.`;

      const userPrompt = `${brainContext}${pageContext}${subjectInstruction} ${dayContext} ${labelContext}

Write 3-4 conversational body paragraphs. Make it feel personal and authentic. Focus on delivering value and end with a clear, natural call to action.

Respond with JSON only: {"subject": "...", "body": "..."}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
        max_tokens: 700,
      });
      const raw = response.choices[0]?.message?.content?.trim() ?? "{}";
      const parsed = JSON.parse(raw) as { subject?: string; body?: string };
      res.json({
        subject: parsed.subject?.trim() ?? existingSubject,
        body: parsed.body?.trim() ?? "",
      });
    } catch (err) {
      console.error("[funnels/draft-email] error:", err);
      res.status(500).json({ message: "Failed to draft email" });
    }
  });

  // ── Funnel Templates (admin-managed) ──────────────────────────────────
  app.get("/api/funnel-templates", requireAuth, async (_req: Request, res: Response) => {
    try {
      const templates = await storage.getFunnelTemplates();
      res.json(templates);
    } catch (err) {
      console.error("[funnel-templates] list error:", err);
      res.status(500).json({ message: "Failed to load templates" });
    }
  });

  app.post("/api/funnel-templates", requireAdmin, async (req: Request, res: Response) => {
    const userId = req.session.userId!;
    const { name, description, canvasData } = req.body as { name?: string; description?: string; canvasData?: unknown };
    if (!name?.trim()) return res.status(400).json({ message: "Name is required" });
    if (!canvasData || typeof canvasData !== "object") return res.status(400).json({ message: "canvasData is required" });
    try {
      const template = await storage.createFunnelTemplate({
        name: name.trim(),
        description: (description ?? "").trim(),
        canvasData,
        createdBy: userId,
      });
      res.status(201).json(template);
    } catch (err) {
      console.error("[funnel-templates] create error:", err);
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  app.patch("/api/funnel-templates/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const body = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
      }).parse(req.body);
      const template = await storage.updateFunnelTemplate(req.params.id, body);
      res.json(template);
    } catch (err) {
      console.error("[funnel-templates] update error:", err);
      res.status(500).json({ message: "Failed to update template" });
    }
  });

  app.delete("/api/funnel-templates/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deleteFunnelTemplate(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[funnel-templates] delete error:", err);
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  // ── Announcements ─────────────────────────────────────────────────────────
  // Public (auth-only): active announcements for the dashboard banner, filtered by user dismissals
  app.get("/api/announcements/active", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as string;
      const announcements = await storage.getActiveAnnouncements(userId);
      res.json({ announcements });
    } catch (err) {
      console.error("[announcements] get active error:", err);
      res.status(500).json({ message: "Failed to get announcements" });
    }
  });

  // Dismiss a banner (records server-side so it won't show again for this user)
  app.post("/api/announcements/:id/dismiss", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId as string;
      await storage.dismissAnnouncement(userId, parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error("[announcements] dismiss error:", err);
      res.status(500).json({ message: "Failed to dismiss announcement" });
    }
  });

  // Admin: list all
  app.get("/api/admin/announcements", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const list = await storage.getAllAnnouncements();
      res.json({ announcements: list });
    } catch (err) {
      console.error("[announcements] list error:", err);
      res.status(500).json({ message: "Failed to list announcements" });
    }
  });

  // Admin: create
  app.post("/api/admin/announcements", requireAdmin, async (req: Request, res: Response) => {
    try {
      const data = insertAnnouncementSchema.parse(req.body);
      const announcement = await storage.createAnnouncement(data);
      res.json({ announcement });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message });
      console.error("[announcements] create error:", err);
      res.status(500).json({ message: "Failed to create announcement" });
    }
  });

  // Admin: update
  app.patch("/api/admin/announcements/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const data = insertAnnouncementSchema.partial().parse(req.body);
      const announcement = await storage.updateAnnouncement(id, data);
      if (!announcement) return res.status(404).json({ message: "Not found" });
      res.json({ announcement });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message });
      console.error("[announcements] update error:", err);
      res.status(500).json({ message: "Failed to update announcement" });
    }
  });

  // Admin: delete
  app.delete("/api/admin/announcements/:id", requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deleteAnnouncement(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error("[announcements] delete error:", err);
      res.status(500).json({ message: "Failed to delete announcement" });
    }
  });

  // Admin: activate (deactivates all others first)
  app.post("/api/admin/announcements/:id/activate", requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.activateAnnouncement(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error("[announcements] activate error:", err);
      res.status(500).json({ message: "Failed to activate announcement" });
    }
  });

  // Admin: deactivate
  app.post("/api/admin/announcements/:id/deactivate", requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.deactivateAnnouncement(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error("[announcements] deactivate error:", err);
      res.status(500).json({ message: "Failed to deactivate announcement" });
    }
  });

  // Admin: reset dismissals (bumps version so all members see it again)
  app.post("/api/admin/announcements/:id/reset-dismissals", requireAdmin, async (req: Request, res: Response) => {
    try {
      await storage.resetAnnouncementDismissals(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error("[announcements] reset-dismissals error:", err);
      res.status(500).json({ message: "Failed to reset dismissals" });
    }
  });

  // Admin: reorder
  app.post("/api/admin/announcements/reorder", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { orderedIds } = z.object({ orderedIds: z.array(z.number().int()) }).parse(req.body);
      await storage.reorderAnnouncements(orderedIds);
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0]?.message });
      console.error("[announcements] reorder error:", err);
      res.status(500).json({ message: "Failed to reorder announcements" });
    }
  });

  // ─── Affiliate Links ─────────────────────────────────────────────────────────
  app.get("/api/affiliate-links/categories", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId as string;
      const categories = await storage.getAffiliateLinkCategories(userId);
      res.json(categories);
    } catch (err) {
      console.error("[affiliate-links] categories error:", err);
      res.status(500).json({ message: "Failed to load categories" });
    }
  });

  app.get("/api/affiliate-links", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId as string;
      const { q, category, page, limit } = req.query as { q?: string; category?: string; page?: string; limit?: string };
      const result = await storage.getAffiliateLinksPage(userId, {
        q,
        category,
        page:  page  ? parseInt(page,  10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
      });
      res.json(result);
    } catch (err) {
      console.error("[affiliate-links] list error:", err);
      res.status(500).json({ message: "Failed to load links" });
    }
  });

  app.post("/api/affiliate-links", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId as string;
      const parsed = insertAffiliateLinkSchema.safeParse({ ...req.body, userId });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });
      const screenshotUrl = await fetchMicrolinkScreenshotUrl(parsed.data.url);
      const link = await storage.createAffiliateLink(userId, { ...parsed.data, screenshotUrl });
      res.status(201).json(link);
    } catch (err) {
      console.error("[affiliate-links] create error:", err);
      res.status(500).json({ message: "Failed to create link" });
    }
  });

  app.patch("/api/affiliate-links/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId as string;
      const parsed = insertAffiliateLinkSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });
      const { userId: _uid, ...updates } = parsed.data as any;
      // If URL is changing, refresh the cached screenshot
      if (updates.url) {
        updates.screenshotUrl = await fetchMicrolinkScreenshotUrl(updates.url);
      }
      const link = await storage.updateAffiliateLink(req.params.id, userId, updates);
      if (!link) return res.status(404).json({ message: "Link not found" });
      res.json(link);
    } catch (err) {
      console.error("[affiliate-links] update error:", err);
      res.status(500).json({ message: "Failed to update link" });
    }
  });

  app.delete("/api/affiliate-links/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId as string;
      await storage.deleteAffiliateLink(req.params.id, userId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[affiliate-links] delete error:", err);
      res.status(500).json({ message: "Failed to delete link" });
    }
  });

  app.post("/api/affiliate-links/:id/click", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId as string;
      await storage.incrementAffiliateLinkClick(req.params.id, userId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[affiliate-links] click error:", err);
      res.status(500).json({ message: "Failed to track click" });
    }
  });

  // ---- Swipe File (all authenticated members) ----

  // In-memory ownership cache for the image route — eliminates a DB round-trip per thumbnail.
  // Key: "userId:itemId" → { imagePath, ts }. TTL 5 minutes.
  const swipeImageOwnerCache = new Map<string, { imagePath: string; ts: number }>();
  const SWIPE_IMG_CACHE_TTL = 5 * 60 * 1000;

  // List items — supports server-side search, type filter, and pagination
  app.get("/api/swipe", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId as string;
      const { search, type, favorite, limit = "60", offset = "0" } = req.query as Record<string, string>;
      const result = await storage.getSwipeItems(userId, {
        search: search || undefined,
        type: type || undefined,
        favorite: favorite === "true",
        limit: Math.min(parseInt(limit, 10) || 60, 200),
        offset: parseInt(offset, 10) || 0,
      });
      res.json(result);
    } catch (err) {
      console.error("[swipe] list error:", err);
      res.status(500).json({ message: "Failed to load swipe items" });
    }
  });

  // Request upload URL (returns signed PUT URL + objectPath for client-side upload)
  app.post("/api/swipe/request-upload-url", requireAuth, async (req: Request, res: Response) => {
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath });
    } catch (err) {
      console.error("[swipe] request-upload-url error:", err);
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  /**
   * Validate and normalise a palette content payload.
   * Expects { version: 1, colors: [6 × "#RRGGBB"], fonts?: [...] }.
   * Returns canonical JSON string on success, or a human-readable error string.
   */
  function parsePaletteContent(raw: unknown): { ok: true; json: string } | { ok: false; error: string } {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: "palette content must be a JSON object" };
    }
    const obj = raw as Record<string, unknown>;
    if (obj.version !== 1) {
      return { ok: false, error: "palette content.version must be 1" };
    }
    if (!Array.isArray(obj.colors)) {
      return { ok: false, error: "palette content.colors must be an array" };
    }
    if (obj.colors.length !== 6) {
      return { ok: false, error: `palette content.colors must contain exactly 6 colors, got ${obj.colors.length}` };
    }
    const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
    const normalized: string[] = [];
    for (let i = 0; i < 6; i++) {
      const c = obj.colors[i];
      if (typeof c !== "string" || !HEX_RE.test(c)) {
        return { ok: false, error: `palette content.colors[${i}] is not a valid #RRGGBB hex color` };
      }
      normalized.push(c.toUpperCase());
    }

    let fonts: Array<{ family: string; variants: Array<{ weight: string; size: string; count: number }> }> | undefined;
    if (obj.fonts !== undefined) {
      if (!Array.isArray(obj.fonts) || obj.fonts.length > 8) {
        return { ok: false, error: "palette content.fonts must contain at most 8 font families" };
      }
      fonts = [];
      for (let i = 0; i < obj.fonts.length; i++) {
        const rawFont = obj.fonts[i];
        if (rawFont === null || typeof rawFont !== "object" || Array.isArray(rawFont)) {
          return { ok: false, error: `palette content.fonts[${i}] must be an object` };
        }
        const font = rawFont as Record<string, unknown>;
        const family = typeof font.family === "string" ? font.family.trim().replace(/\s+/g, " ") : "";
        if (!family || family.length > 120 || /[\u0000-\u001F\u007F]/.test(family)) {
          return { ok: false, error: `palette content.fonts[${i}].family must be a valid font name` };
        }
        if (!Array.isArray(font.variants) || font.variants.length < 1 || font.variants.length > 8) {
          return { ok: false, error: `palette content.fonts[${i}].variants must contain 1 to 8 entries` };
        }
        const variants: Array<{ weight: string; size: string; count: number }> = [];
        for (let j = 0; j < font.variants.length; j++) {
          const rawVariant = font.variants[j];
          if (rawVariant === null || typeof rawVariant !== "object" || Array.isArray(rawVariant)) {
            return { ok: false, error: `palette content.fonts[${i}].variants[${j}] must be an object` };
          }
          const variant = rawVariant as Record<string, unknown>;
          const weight = typeof variant.weight === "string" ? variant.weight.trim() : "";
          const size = typeof variant.size === "string" ? variant.size.trim() : "";
          const count = variant.count;
          if (!/^\d{1,4}$/.test(weight) || Number(weight) < 1 || Number(weight) > 1000) {
            return { ok: false, error: `palette content.fonts[${i}].variants[${j}].weight must be a numeric CSS font weight` };
          }
          if (!/^\d+(?:\.\d+)?px$/.test(size) || Number.parseFloat(size) <= 0 || Number.parseFloat(size) > 1000) {
            return { ok: false, error: `palette content.fonts[${i}].variants[${j}].size must be a pixel value` };
          }
          if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > 100_000) {
            return { ok: false, error: `palette content.fonts[${i}].variants[${j}].count must be a positive integer` };
          }
          variants.push({ weight, size, count });
        }
        fonts.push({ family, variants });
      }
    }

    const canonical = JSON.stringify({
      version: 1,
      colors: normalized,
      ...(fonts !== undefined ? { fonts } : {}),
    });
    return { ok: true, json: canonical };
  }

  // Create item (snippet, confirmed upload, or palette)
  app.post("/api/swipe", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId as string;
      const { title, type, sourceUrl, notes } = req.body;
      let { content, imagePath, strips } = req.body;
      if (!title) return res.status(400).json({ message: "title is required" });
      if (!type || !["upload", "snippet", "palette"].includes(type))
        return res.status(400).json({ message: "type must be upload, snippet, or palette" });
      if (type === "snippet" && !content) return res.status(400).json({ message: "content is required for snippets" });
      if (type === "palette") {
        // content may arrive as a pre-serialised string or a parsed object
        let rawPalette: unknown = content;
        if (typeof rawPalette === "string") {
          try { rawPalette = JSON.parse(rawPalette); } catch {
            return res.status(400).json({ message: "palette content must be valid JSON" });
          }
        }
        const result = parsePaletteContent(rawPalette);
        if (!result.ok) return res.status(400).json({ message: result.error });
        content = result.json;
      }
      // For multi-strip (full-page) captures, imagePath defaults to first strip
      if (type === "upload" && !imagePath && Array.isArray(strips) && strips.length > 0) imagePath = strips[0];
      if (type === "upload" && !imagePath) return res.status(400).json({ message: "imagePath is required for uploads" });
      const item = await storage.createSwipeItem(userId, { title, type, content, imagePath, strips: strips ?? null, sourceUrl, notes });
      res.json({ item });
    } catch (err) {
      console.error("[swipe] create error:", err);
      res.status(500).json({ message: "Failed to create swipe item" });
    }
  });

  // Serve image (authenticated, owner only) — uses in-memory cache to skip DB lookup
  app.get("/api/swipe/:id/image", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId as string;
      const { id } = req.params;
      const cacheKey = `${userId}:${id}`;
      const cached = swipeImageOwnerCache.get(cacheKey);
      let imagePath: string;
      if (cached && Date.now() - cached.ts < SWIPE_IMG_CACHE_TTL) {
        imagePath = cached.imagePath;
      } else {
        const item = await storage.getSwipeItem(id, userId);
        if (!item || !item.imagePath) return res.status(404).json({ message: "Not found" });
        swipeImageOwnerCache.set(cacheKey, { imagePath: item.imagePath, ts: Date.now() });
        imagePath = item.imagePath;
      }
      const file = await objectStorageService.getObjectEntityFile(imagePath);
      await objectStorageService.downloadObject(file, res, 3600);
    } catch (err) {
      console.error("[swipe] image error:", err);
      res.status(500).json({ message: "Failed to serve image" });
    }
  });

  // Update item
  app.patch("/api/swipe/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId as string;
      const { title, notes, sourceUrl } = req.body;
      const item = await storage.updateSwipeItem(req.params.id, userId, { title, notes, sourceUrl });
      if (!item) return res.status(404).json({ message: "Not found" });
      res.json({ item });
    } catch (err) {
      console.error("[swipe] update error:", err);
      res.status(500).json({ message: "Failed to update swipe item" });
    }
  });

  // Delete item (also delete GCS object if present)
  app.delete("/api/swipe/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId as string;
      const item = await storage.getSwipeItem(req.params.id, userId);
      if (!item) return res.status(404).json({ message: "Not found" });
      if (item.imagePath) {
        try { await objectStorageService.deleteObject(item.imagePath); } catch (_) {}
      }
      await storage.deleteSwipeItem(req.params.id, userId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[swipe] delete error:", err);
      res.status(500).json({ message: "Failed to delete swipe item" });
    }
  });

  // Generate share token
  app.post("/api/swipe/:id/share", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId as string;
      const existing = await storage.getSwipeItem(req.params.id, userId);
      if (!existing) return res.status(404).json({ message: "Not found" });
      // Reuse existing token if already shared
      const token = existing.shareToken ?? crypto.randomBytes(24).toString("hex");
      const item = await storage.setSwipeItemShareToken(req.params.id, userId, token);
      res.json({ item, token });
    } catch (err) {
      console.error("[swipe] share error:", err);
      res.status(500).json({ message: "Failed to generate share link" });
    }
  });

  // Revoke share token
  app.delete("/api/swipe/:id/share", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId as string;
      const item = await storage.setSwipeItemShareToken(req.params.id, userId, null);
      if (!item) return res.status(404).json({ message: "Not found" });
      res.json({ item });
    } catch (err) {
      console.error("[swipe] unshare error:", err);
      res.status(500).json({ message: "Failed to revoke share link" });
    }
  });

  // Toggle favorite
  app.post("/api/swipe/:id/favorite", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId as string;
      const item = await storage.toggleSwipeFavorite(req.params.id, userId);
      if (!item) return res.status(404).json({ message: "Not found" });
      res.json({ item });
    } catch (err) {
      console.error("[swipe] favorite error:", err);
      res.status(500).json({ message: "Failed to update favorite" });
    }
  });

  // ---- Account-level Promotional Links ----

  // Get current user's promotional link IDs (references into their link vault)
  app.get("/api/swipe/promo-links", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId as string;
      const user = await storage.getUser(userId);
      res.json({ promoLinkIds: user?.swipePromoLinks ?? [] });
    } catch (err) {
      console.error("[swipe] promo-links get error:", err);
      res.status(500).json({ message: "Failed to load promo links" });
    }
  });

  // Replace current user's promotional link IDs (ordered list of affiliate link IDs)
  app.put("/api/swipe/promo-links", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId as string;
      const { promoLinkIds } = req.body;
      if (!Array.isArray(promoLinkIds)) return res.status(400).json({ message: "promoLinkIds must be an array" });
      await storage.updateUser(userId, { swipePromoLinks: promoLinkIds });
      res.json({ promoLinkIds });
    } catch (err) {
      console.error("[swipe] promo-links update error:", err);
      res.status(500).json({ message: "Failed to update promo links" });
    }
  });

  // ---- FIA Affiliate Link (account-level, shown in share page footer) ----

  app.get("/api/swipe/affiliate-link", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId as string;
      const user = await storage.getUser(userId);
      res.json({ fiaAffiliateLink: user?.fiaAffiliateLink ?? null });
    } catch (err) {
      console.error("[swipe] affiliate-link get error:", err);
      res.status(500).json({ message: "Failed to load affiliate link" });
    }
  });

  app.put("/api/swipe/affiliate-link", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req.session as any).userId as string;
      const { fiaAffiliateLink } = req.body;
      const link = typeof fiaAffiliateLink === "string" ? fiaAffiliateLink.trim() || null : null;
      await storage.updateUser(userId, { fiaAffiliateLink: link } as any);
      res.json({ fiaAffiliateLink: link });
    } catch (err) {
      console.error("[swipe] affiliate-link update error:", err);
      res.status(500).json({ message: "Failed to save affiliate link" });
    }
  });

  // ---- Swipe File – Public Share Routes (no auth required) ----

  // Get public item metadata by token
  app.get("/api/swipe/public/:token", async (req: Request, res: Response) => {
    try {
      const item = await storage.getSwipeItemByToken(req.params.token);
      if (!item) return res.status(404).json({ message: "Not found or link has been revoked" });
      await storage.incrementSwipeItemViewCount(req.params.token);
      // Resolve owner's promotional link IDs → full affiliate link data
      const owner = await storage.getUser(item.userId);
      const promoLinkIds = (owner?.swipePromoLinks ?? []) as string[];
      let promoLinks: object[] = [];
      if (promoLinkIds.length > 0) {
        const allLinks = await storage.getAffiliateLinks(item.userId, {});
        const byId = new Map(allLinks.map(l => [l.id, l]));
        promoLinks = promoLinkIds
          .map(id => byId.get(id))
          .filter(l => l && l.isActive)
          .map(l => ({ title: l!.title, url: l!.url, description: l!.description, emoji: l!.emoji }));
      }
      // Return safe subset (no userId, replace per-item promo_links with account-level ones)
      const { userId: _uid, promoLinks: _itemPromo, ...safe } = item;
      res.json({ item: { ...safe, promoLinks, fiaAffiliateLink: owner?.fiaAffiliateLink ?? null } });
    } catch (err) {
      console.error("[swipe] public get error:", err);
      res.status(500).json({ message: "Failed to load item" });
    }
  });

  // Serve public image by token (first strip or single image)
  app.get("/api/swipe/public/:token/image", async (req: Request, res: Response) => {
    try {
      const item = await storage.getSwipeItemByToken(req.params.token);
      if (!item || !item.imagePath) return res.status(404).json({ message: "Not found" });
      const file = await objectStorageService.getObjectEntityFile(item.imagePath);
      await objectStorageService.downloadObject(file, res, 3600);
    } catch (err) {
      console.error("[swipe] public image error:", err);
      res.status(500).json({ message: "Failed to serve image" });
    }
  });

  // Serve individual strip by index for multi-strip (full-page) captures
  app.get("/api/swipe/public/:token/strip/:index", async (req: Request, res: Response) => {
    try {
      const item = await storage.getSwipeItemByToken(req.params.token);
      if (!item) return res.status(404).json({ message: "Not found" });
      const strips = item.strips as string[] | null;
      const idx = parseInt(req.params.index, 10);
      if (!strips || isNaN(idx) || idx < 0 || idx >= strips.length)
        return res.status(404).json({ message: "Strip not found" });
      const file = await objectStorageService.getObjectEntityFile(strips[idx]);
      await objectStorageService.downloadObject(file, res, 3600);
    } catch (err) {
      console.error("[swipe] public strip error:", err);
      res.status(500).json({ message: "Failed to serve strip" });
    }
  });

  // v1 API – Affiliate Links
  app.get("/api/v1/links", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const { q, category } = req.query as { q?: string; category?: string };
      // Default activeOnly=true for backward compat; pass activeOnly=false to see all (e.g. extension management)
      const activeOnly = req.query.activeOnly !== "false";
      const links = await storage.getAffiliateLinks(user.id, { q, category, activeOnly });
      res.json({ links });
    } catch (err) {
      console.error("[v1] links list error:", err);
      res.status(500).json({ message: "Failed to load links" });
    }
  });

  app.post("/api/v1/links", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const parsed = insertAffiliateLinkSchema.safeParse({ ...req.body, userId: user.id });
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten().fieldErrors });
      const screenshotUrl = await fetchMicrolinkScreenshotUrl(parsed.data.url);
      const link = await storage.createAffiliateLink(user.id, { ...parsed.data, screenshotUrl });
      res.status(201).json({ link });
    } catch (err) {
      console.error("[v1] links create error:", err);
      res.status(500).json({ message: "Failed to create link" });
    }
  });

  app.patch("/api/v1/links/:id", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const parsed = insertAffiliateLinkSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten().fieldErrors });
      const { userId: _uid, ...updates } = parsed.data as any;
      // If URL is changing, refresh the cached screenshot
      if (updates.url) {
        updates.screenshotUrl = await fetchMicrolinkScreenshotUrl(updates.url);
      }
      const link = await storage.updateAffiliateLink(req.params.id, user.id, updates);
      if (!link) return res.status(404).json({ message: "Link not found" });
      res.json({ link });
    } catch (err) {
      console.error("[v1] links update error:", err);
      res.status(500).json({ message: "Failed to update link" });
    }
  });

  app.delete("/api/v1/links/:id", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      await storage.deleteAffiliateLink(req.params.id, user.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[v1] links delete error:", err);
      res.status(500).json({ message: "Failed to delete link" });
    }
  });

  app.post("/api/v1/links/:id/click", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      await storage.incrementAffiliateLinkClick(req.params.id, user.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[v1] links click error:", err);
      res.status(500).json({ message: "Failed to record click" });
    }
  });

  // ---- v1 API – Swipe File (extension access) ----

  // List recent items. The canonical response is:
  // { items: SwipeItem[], total: number, counts: { all, upload, snippet,
  //   palette, shared, favorites } }
  // Clients still using the original nested response can request
  // ?format=legacy while they migrate.
  app.get("/api/v1/swipe", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const format = req.query.format as string | undefined;
      if (format && format !== "canonical" && format !== "legacy") {
        return res.status(400).json({ message: "format must be canonical or legacy" });
      }
      const result = await storage.getSwipeItems(user.id);
      res.json(formatSwipeListResponse(result, format === "legacy" ? "legacy" : "canonical"));
    } catch (err) {
      console.error("[v1] swipe list error:", err);
      res.status(500).json({ message: "Failed to load swipe items" });
    }
  });

  // Request a signed upload URL
  app.post("/api/v1/swipe/request-upload-url", requireApiKey, async (req: Request, res: Response) => {
    try {
      const uploadURL  = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath });
    } catch (err) {
      console.error("[v1] swipe upload-url error:", err);
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  // Create a swipe item (snippet, upload, or palette)
  app.post("/api/v1/swipe", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const { title, type, sourceUrl, notes } = req.body;
      let { content, imagePath, strips } = req.body;
      if (!title)  return res.status(400).json({ message: "title is required" });
      if (!type || !["upload", "snippet", "palette"].includes(type))
        return res.status(400).json({ message: "type must be upload, snippet, or palette" });
      if (type === "snippet" && !content) return res.status(400).json({ message: "content required for snippets" });
      if (type === "palette") {
        // content may arrive as a pre-serialised string or a parsed object
        let rawPalette: unknown = content;
        if (typeof rawPalette === "string") {
          try { rawPalette = JSON.parse(rawPalette); } catch {
            return res.status(400).json({ message: "palette content must be valid JSON" });
          }
        }
        const result = parsePaletteContent(rawPalette);
        if (!result.ok) return res.status(400).json({ message: result.error });
        content = result.json;
      }
      // For multi-strip (full-page) captures, imagePath defaults to first strip
      if (type === "upload" && !imagePath && Array.isArray(strips) && strips.length > 0) imagePath = strips[0];
      if (type === "upload" && !imagePath) return res.status(400).json({ message: "imagePath required for uploads" });
      const item = await storage.createSwipeItem(user.id, { title, type, content, imagePath, strips: strips ?? null, sourceUrl, notes });
      res.json({ item });
    } catch (err) {
      console.error("[v1] swipe create error:", err);
      res.status(500).json({ message: "Failed to create swipe item" });
    }
  });

  // Generate / retrieve share token
  app.post("/api/v1/swipe/:id/share", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user     = (req as any).apiUser;
      const existing = await storage.getSwipeItem(req.params.id, user.id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const token = existing.shareToken ?? crypto.randomBytes(24).toString("hex");
      const item  = await storage.setSwipeItemShareToken(req.params.id, user.id, token);
      res.json({ item, token });
    } catch (err) {
      console.error("[v1] swipe share error:", err);
      res.status(500).json({ message: "Failed to generate share link" });
    }
  });

  // Full-page capture via Puppeteer (v1 API key — for extension)
  app.post("/api/v1/swipe/capture-url", requireApiKey, async (req: Request, res: Response) => {
    const user = (req as any).apiUser;
    const { url, title } = req.body;
    if (!url) return res.status(400).json({ message: "url is required" });
    let parsedUrl: URL;
    try { parsedUrl = new URL(url); } catch { return res.status(400).json({ message: "Invalid URL" }); }
    if (!["http:", "https:"].includes(parsedUrl.protocol))
      return res.status(400).json({ message: "Only http/https URLs are supported" });
    try {
      const { captureFullPage } = await import("./puppeteerCapture");
      console.log(`[v1 swipe] capturing full page: ${url}`);
      const buffer = await captureFullPage(url, 45_000);
      const uploadURL  = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      await objectStorageService.uploadFile(objectPath, buffer, "image/png");
      const itemTitle = (title ?? "").trim() || new URL(url).hostname;
      const item = await storage.createSwipeItem(user.id, {
        type: "upload", title: itemTitle, imagePath: objectPath, sourceUrl: url,
      });
      res.json({ item });
    } catch (err: any) {
      console.error("[v1 swipe] capture-url error:", err);
      res.status(500).json({ message: err?.message ?? "Capture failed" });
    }
  });

  // Full-page capture (session auth — for web app)
  app.post("/api/swipe/capture-url", requireAuth, async (req: Request, res: Response) => {
    if (!(req as any).user?.isAdmin) return res.status(403).json({ message: "Admin only" });
    const userId = (req.session as any).userId as string;
    const { url, title } = req.body;
    if (!url) return res.status(400).json({ message: "url is required" });
    let parsedUrl: URL;
    try { parsedUrl = new URL(url); } catch { return res.status(400).json({ message: "Invalid URL" }); }
    if (!["http:", "https:"].includes(parsedUrl.protocol))
      return res.status(400).json({ message: "Only http/https URLs are supported" });
    try {
      const { captureFullPage } = await import("./puppeteerCapture");
      console.log(`[swipe] capturing full page: ${url}`);
      const buffer = await captureFullPage(url, 45_000);
      const uploadURL  = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      await objectStorageService.uploadFile(objectPath, buffer, "image/png");
      const itemTitle = (title ?? "").trim() || new URL(url).hostname;
      const item = await storage.createSwipeItem(userId, {
        type: "upload", title: itemTitle, imagePath: objectPath, sourceUrl: url,
      });
      res.json({ item });
    } catch (err: any) {
      console.error("[swipe] capture-url error:", err);
      res.status(500).json({ message: err?.message ?? "Capture failed" });
    }
  });

  // ─── Chrome Extension: Push Subscriptions ────────────────────────────────
  // Save or replace push subscription for the authenticated member
  // ---- Extension version check + download (public, no auth) ----

  // ---- Public pages (no auth, server-rendered HTML) ----

  app.get("/privacy-policy", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy — FIA Academy Toolkit</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1a1a1a; line-height: 1.7; background: #fff; }
    .wrap { max-width: 720px; margin: 0 auto; padding: 48px 24px 80px; }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
    .meta { color: #888; font-size: 14px; margin-bottom: 40px; }
    h2 { font-size: 18px; font-weight: 700; margin: 32px 0 8px; }
    p { margin-bottom: 12px; }
    ul { padding-left: 24px; display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
    code { font-size: 13px; background: #f3f4f6; padding: 1px 5px; border-radius: 4px; }
    hr { border: none; border-top: 1px solid #e5e5e5; margin: 48px 0 16px; }
    .footer { font-size: 13px; color: #999; }
  </style>
</head>
<body>
<div class="wrap">
  <h1>Privacy Policy</h1>
  <p class="meta">FIA Academy Toolkit Chrome Extension &nbsp;·&nbsp; Last updated: July 2026</p>

  <h2>Overview</h2>
  <p>The FIA Academy Toolkit extension ("Extension") is a private tool exclusively for members of the Fearless Influence Academy ("FIA Academy"). This policy explains what data the Extension collects, how it is used, and how it is stored. We do not sell, share, or rent your data to any third party.</p>

  <h2>Data We Collect</h2>
  <p>The Extension collects and transmits the following data:</p>
  <ul>
    <li><strong>API Key.</strong> A personal API key that authenticates you to the FIA Academy Toolkit server. This key is stored locally in <code>chrome.storage.local</code> on your device and is sent with every request to the Toolkit server. It is never shared with any third party.</li>
    <li><strong>DMO Activity Logs.</strong> When you log Daily Method of Operation (DMO) activities, those entries are sent to and stored on the FIA Academy Toolkit server associated with your account.</li>
    <li><strong>Affiliate &amp; Resource Links.</strong> Links you manage through the Extension are stored on the FIA Academy Toolkit server and synced to your account.</li>
    <li><strong>Swipe File Captures.</strong> Screenshots you take of browser tabs, text snippets you clip via right-click, and full-page captures submitted by URL are uploaded to and stored on the FIA Academy Toolkit server under your account. You control whether individual items are shared publicly via a share link.</li>
    <li><strong>Page URL &amp; Title.</strong> When you capture a screenshot, the URL and title of the active browser tab are read solely to pre-fill a title field and record the source of the capture. This information is only used locally in the popup and, if saved, stored as part of your Swipe File entry.</li>
    <li><strong>Selected Text.</strong> When you use the right-click "Save to Swipe File" context menu on a text selection, the selected text is sent to the FIA Academy Toolkit server and stored as a snippet in your Swipe File.</li>
  </ul>

  <h2>How We Use Your Data</h2>
  <ul>
    <li>To provide and operate the features of the Extension and the FIA Academy Toolkit platform.</li>
    <li>To authenticate your account and ensure only authorized members can access the Toolkit.</li>
    <li>To store your activity logs, links, and Swipe File captures in your personal account.</li>
    <li>To display your data back to you within the Extension and on the FIA Academy Toolkit website.</li>
  </ul>
  <p>We do not use your data for advertising, profiling, or any purpose beyond operating the Toolkit.</p>

  <h2>Data Storage &amp; Security</h2>
  <p>Your API key is stored locally on your device using Chrome's built-in <code>chrome.storage.local</code> API. All other data is stored on our servers hosted on Google Cloud infrastructure. Data in transit is encrypted via HTTPS. We follow industry-standard security practices to protect your information.</p>

  <h2>Permissions Used</h2>
  <ul>
    <li><strong>storage</strong> — stores your API key and settings locally on your device.</li>
    <li><strong>activeTab / tabs</strong> — reads the URL and title of the current tab when you initiate a screenshot capture. The Extension does not access tab content passively.</li>
    <li><strong>contextMenus</strong> — adds a "Save to Swipe File" option when you right-click selected text. The Extension only reads the selected text when you explicitly invoke this menu item.</li>
    <li><strong>notifications</strong> — displays a confirmation notification after a snippet is saved via right-click.</li>
    <li><strong>alarms</strong> — powers timed reminders and DMO tracking features.</li>
  </ul>

  <h2>Third Parties</h2>
  <p>The Extension communicates exclusively with the FIA Academy Toolkit server (<strong>toolkit.fearlessmarketinglab.com</strong>). No data is sent to any advertising network, analytics provider, or other third party.</p>

  <h2>Data Deletion</h2>
  <p>You can remove your locally stored API key at any time by clicking "Disconnect &amp; clear all data" in the Extension's Settings panel. To request deletion of your account data from our servers, contact FIA Academy support.</p>

  <h2>Changes to This Policy</h2>
  <p>We may update this policy as the Extension evolves. The "last updated" date at the top of this page reflects the most recent revision. Continued use of the Extension after changes are posted constitutes acceptance of the updated policy.</p>

  <h2>Contact</h2>
  <p>Questions about this policy? Reach out through the FIA Academy member support channels.</p>

  <hr />
  <p class="footer">&copy; 2026 FIA Academy &nbsp;·&nbsp; FIA Academy Toolkit</p>
</div>
</body>
</html>`);
  });

  app.get("/api/extension/version", async (_req: Request, res: Response) => {
    try {
      const fs   = await import("fs");
      const path = await import("path");
      const manifestPath = path.resolve("extension/manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.json({
        version:     manifest.version,
        downloadUrl: "/api/extension/download",
      });
    } catch (err) {
      console.error("[extension/version]", err);
      res.status(500).json({ message: "Could not read extension version" });
    }
  });

  app.get("/api/extension/download", async (_req: Request, res: Response) => {
    try {
      const fs   = await import("fs");
      const path = await import("path");
      // Read version from manifest, then serve the versioned zip
      const manifestPath = path.resolve("extension/manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const version = manifest.version || "latest";
      const filename = `fia-toolkit-extension-v${version}.zip`;
      const zipPath = path.resolve(`extension/${filename}`);
      if (!fs.existsSync(zipPath)) {
        return res.status(404).json({ message: "Extension package not found" });
      }
      const stat = fs.statSync(zipPath);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", stat.size);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      res.setHeader("Pragma", "no-cache");
      fs.createReadStream(zipPath).pipe(res);
    } catch (err) {
      console.error("[extension/download]", err);
      res.status(500).json({ message: "Download failed" });
    }
  });

  app.post("/api/extension/subscribe", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      const { endpoint, keys } = req.body;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: "Invalid subscription object" });
      }
      await db.execute(sql`
        INSERT INTO extension_push_subscriptions (user_id, endpoint, p256dh, auth)
        VALUES (${user.id}, ${endpoint}, ${keys.p256dh}, ${keys.auth})
        ON CONFLICT (user_id) DO UPDATE
          SET endpoint = EXCLUDED.endpoint,
              p256dh   = EXCLUDED.p256dh,
              auth     = EXCLUDED.auth,
              created_at = CURRENT_TIMESTAMP
      `);
      res.json({ ok: true });
    } catch (err) {
      console.error("[extension] subscribe error:", err);
      res.status(500).json({ message: "Failed to save subscription" });
    }
  });

  // Remove push subscription when user disconnects the extension
  app.delete("/api/extension/unsubscribe", requireApiKey, async (req: Request, res: Response) => {
    try {
      const user = (req as any).apiUser;
      await db.execute(sql`DELETE FROM extension_push_subscriptions WHERE user_id = ${user.id}`);
      res.json({ ok: true });
    } catch (err) {
      console.error("[extension] unsubscribe error:", err);
      res.status(500).json({ message: "Failed to remove subscription" });
    }
  });

  // Admin: count of active extension subscribers
  app.get("/api/admin/extension-stats", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const rows = await db.execute(sql`SELECT COUNT(*)::int AS count FROM extension_push_subscriptions`);
      res.json({ subscribers: (rows.rows[0] as any).count ?? 0 });
    } catch (err) {
      console.error("[extension] stats error:", err);
      res.status(500).json({ message: "Failed to load stats" });
    }
  });

  // Admin: broadcast a Web Push notification to all extension subscribers
  app.post("/api/admin/notify-extension", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { title, body } = req.body;
      if (!title?.trim() || !body?.trim()) {
        return res.status(400).json({ message: "title and body are required" });
      }
      const vapidPublicKey  = process.env.VAPID_PUBLIC_KEY;
      const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
      const vapidContact    = process.env.VAPID_CONTACT || "mailto:admin@fearlessmarketinglab.com";
      if (!vapidPublicKey || !vapidPrivateKey) {
        return res.status(500).json({ message: "VAPID keys not configured" });
      }

      const webpush = await import("web-push");
      webpush.default.setVapidDetails(vapidContact, vapidPublicKey, vapidPrivateKey);

      const rows = await db.execute(sql`SELECT endpoint, p256dh, auth FROM extension_push_subscriptions`);
      const subs = rows.rows as { endpoint: string; p256dh: string; auth: string }[];

      const payload = JSON.stringify({ title: title.trim(), body: body.trim() });
      let sent = 0, failed = 0, pruned = 0;

      await Promise.allSettled(
        subs.map(async (sub) => {
          try {
            await webpush.default.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload,
            );
            sent++;
          } catch (err: any) {
            if (err.statusCode === 410 || err.statusCode === 404) {
              // Subscription expired — prune it
              await db.execute(sql`DELETE FROM extension_push_subscriptions WHERE endpoint = ${sub.endpoint}`).catch(() => {});
              pruned++;
            } else {
              failed++;
            }
          }
        }),
      );

      res.json({ ok: true, sent, failed, pruned, total: subs.length });
    } catch (err) {
      console.error("[extension] notify error:", err);
      res.status(500).json({ message: "Failed to send notifications" });
    }
  });

  // ── Hourly sweep: disable accounts whose CF grace period has expired ─────────
  // When a revoke webhook fires, members get a 48-hour grace window in case
  // their payment retry succeeds. If it doesn't, `isDisabled` is never set to
  // true automatically, so the admin panel never reflects the real state.
  // This job corrects that by scanning for cfEnrolled=false users whose
  // cfRevokedGraceUntil has passed and who are still not flagged as disabled.
  // It also sends a 24-hour warning email before the grace period expires.
  async function runGracePeriodExpirySweep() {
    if (!process.env.CF_API_TOKEN && !process.env.CF_COURSE_ID) {
      // CF not configured — nothing to do
      return;
    }

    // ── Part 1: Send 24-hour warning emails ───────────────────────────────────
    try {
      const approaching = await storage.getUsersApproachingGraceExpiry();
      if (approaching.length > 0) {
        console.log(`[GracePeriodSweep] Found ${approaching.length} account(s) approaching grace expiry — sending warning`);
        const reactivateUrl = CF_WORKSPACE_DOMAIN
          ? `https://${CF_WORKSPACE_DOMAIN}`
          : "https://members.fearlessinfluenceracademy.com";
        for (const user of approaching) {
          try {
            let warned = true; // assume warned if email not configured (skip without re-attempting)
            if (user.email && isEmailConfigured()) {
              warned = await sendGraceExpiryWarningEmail({
                email: user.email,
                firstName: user.firstName ?? null,
                expiresAt: user.cfRevokedGraceUntil!,
                reactivateUrl,
              });
            }
            if (warned) {
              // Only stamp as sent after a confirmed successful delivery
              await storage.updateUser(user.id, { cfGraceExpirySentAt: new Date() });
              console.log(`[GracePeriodSweep] Grace-expiry warning sent to ${user.email}`);
            } else {
              console.warn(`[GracePeriodSweep] Email delivery failed for ${user.email} — will retry on next sweep`);
            }
          } catch (userErr) {
            console.warn(`[GracePeriodSweep] Failed to warn user ${user.id}:`, userErr);
          }
        }
      }
    } catch (warnErr) {
      console.error("[GracePeriodSweep] Warning sweep error:", warnErr);
    }

    // ── Part 2: Disable accounts whose grace period has now expired ───────────
    try {
      const expired = await storage.getUsersWithExpiredGracePeriod();
      if (expired.length === 0) return;

      console.log(`[GracePeriodSweep] Found ${expired.length} account(s) with expired grace period — disabling`);
      for (const user of expired) {
        try {
          await storage.updateUser(user.id, { isDisabled: true });
          console.log(`[GracePeriodSweep] Disabled account: ${user.email}`);
          // Send a lapsed-membership notification if email is configured
          if (user.email && isEmailConfigured()) {
            await sendMembershipLapsedEmail({ email: user.email, firstName: user.firstName ?? null });
          }
        } catch (userErr) {
          console.warn(`[GracePeriodSweep] Failed to process user ${user.id}:`, userErr);
        }
      }
    } catch (sweepErr) {
      console.error("[GracePeriodSweep] Sweep error:", sweepErr);
    }
  }

  // Run once at startup (catches anything that expired while the server was down)
  // then repeat every hour.
  runGracePeriodExpirySweep().catch(() => {});
  setInterval(runGracePeriodExpirySweep, 60 * 60 * 1000); // every hour

  // ── Course Management Routes ─────────────────────────────────────────────────

  function generateCourseSlug(title: string): string {
    return title.toLowerCase().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "") + "-" + Date.now().toString(36);
  }

  const courseStatusSchema = z.enum(["draft", "published"]);
  const courseTitleSchema = z.string().trim().min(1, "Title is required").max(500, "Title is too long");
  const courseCreateSchema = z.object({
    title: courseTitleSchema,
    description: z.string().trim().max(10_000).nullable().optional(),
    coverGradient: z.string().max(1_000).nullable().optional(),
  }).strict();
  const courseUpdateSchema = z.object({
    title: courseTitleSchema.optional(),
    description: z.string().trim().max(10_000).nullable().optional(),
    coverGradient: z.string().max(1_000).nullable().optional(),
    icon: z.string().trim().max(100).nullable().optional(),
    status: courseStatusSchema.optional(),
  }).strict().refine((updates) => Object.keys(updates).length > 0, "At least one update is required");
  const moduleUpdateSchema = z.object({
    title: courseTitleSchema.optional(),
    status: courseStatusSchema.optional(),
  }).strict().refine((updates) => Object.keys(updates).length > 0, "At least one update is required");
  const lessonUpdateSchema = z.object({
    title: courseTitleSchema.optional(),
    videoUrl: z.string().trim().max(4_000).nullable().optional(),
    content: z.string().max(1_000_000).nullable().optional(),
    status: courseStatusSchema.optional(),
    durationMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
  }).strict().refine((updates) => Object.keys(updates).length > 0, "At least one update is required");
  const resourceUpdateSchema = z.object({
    name: z.string().trim().min(1, "Resource name is required").max(500).optional(),
    url: z.string().trim().min(1, "Resource URL is required").max(4_000).optional(),
    subtitle: z.string().trim().max(500).nullable().optional(),
    kind: z.enum(["link", "pdf"]).optional(),
  }).strict().refine((updates) => Object.keys(updates).length > 0, "At least one update is required");
  function validationError(res: Response, error: z.ZodError) {
    return res.status(400).json({ message: error.issues[0]?.message || "Invalid course data" });
  }

  // Admin: list courses with lesson counts
  app.get("/api/admin/courses", requireAdmin, async (_req, res) => {
    try {
      const allCourses = await storage.getCourses();
      // Enrich each course with module/lesson counts
      const enriched = await Promise.all(allCourses.map(async (c) => {
        const modules = await storage.getCourseModules(c.id);
        let lessonCount = 0;
        for (const m of modules) {
          const lessons = await storage.getCourseLessons(m.id);
          lessonCount += lessons.length;
        }
        return { ...c, moduleCount: modules.length, lessonCount };
      }));
      res.json(enriched);
    } catch (e) {
      console.error("[courses] list error:", e);
      res.status(500).json({ message: "Failed to load courses" });
    }
  });

  // Admin: create course
  app.post("/api/admin/courses", requireAdmin, async (req, res) => {
    try {
      const parsed = courseCreateSchema.safeParse(req.body);
      if (!parsed.success) return validationError(res, parsed.error);
      const { title, description, coverGradient } = parsed.data;
      const slug = generateCourseSlug(title);
      const course = await storage.createCourse({ title, description: description || null, slug, coverGradient: coverGradient || null, status: "draft", sortOrder: 0 });
      res.status(201).json(course);
    } catch (e) {
      console.error("[courses] create error:", e);
      res.status(500).json({ message: "Failed to create course" });
    }
  });

  // Admin: get single course
  app.get("/api/admin/courses/:id", requireAdmin, async (req, res) => {
    try {
      const course = await storage.getCourse(req.params.id);
      if (!course) return res.status(404).json({ message: "Not found" });
      res.json(course);
    } catch (e) {
      res.status(500).json({ message: "Failed to load course" });
    }
  });

  // Admin: update course
  app.put("/api/admin/courses/:id", requireAdmin, async (req, res) => {
    try {
      const parsed = courseUpdateSchema.safeParse(req.body);
      if (!parsed.success) return validationError(res, parsed.error);
      const course = await storage.updateCourse(req.params.id, parsed.data);
      if (!course) return res.status(404).json({ message: "Not found" });
      res.json(course);
    } catch (e) {
      res.status(500).json({ message: "Failed to update course" });
    }
  });

  // Admin: delete course
  app.delete("/api/admin/courses/:id", requireAdmin, async (req, res) => {
    try {
      const ok = await storage.deleteCourse(req.params.id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to delete course" });
    }
  });

  // Admin: get course structure (modules + lessons)
  app.get("/api/admin/courses/:id/structure", requireAdmin, async (req, res) => {
    try {
      const course = await storage.getCourse(req.params.id);
      if (!course) return res.status(404).json({ message: "Not found" });
      const modules = await storage.getCourseModules(req.params.id);
      const modulesWithLessons = await Promise.all(modules.map(async (m) => ({
        ...m,
        lessons: await storage.getCourseLessons(m.id),
      })));
      res.json({ course, modules: modulesWithLessons });
    } catch (e) {
      res.status(500).json({ message: "Failed to load structure" });
    }
  });

  // Admin: reorder modules
  app.put("/api/admin/courses/:id/modules/reorder", requireAdmin, async (req, res) => {
    try {
      const { orderedIds, parentModuleId } = req.body;
      if (!Array.isArray(orderedIds)) return res.status(400).json({ message: "orderedIds required" });
      if (parentModuleId !== null && parentModuleId !== undefined && typeof parentModuleId !== "string") {
        return res.status(400).json({ message: "parentModuleId must be a string or null" });
      }
      const modules = await storage.getCourseModules(req.params.id);
      const siblingModules = modules.filter((module) => module.parentModuleId === (parentModuleId ?? null));
      if (!hasExactIds(siblingModules.map((module) => module.id), orderedIds)) {
        return res.status(400).json({ message: "orderedIds must include each module in this group exactly once" });
      }
      await storage.reorderCourseModules(req.params.id, orderedIds);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to reorder" });
    }
  });

  // Admin: create module
  app.post("/api/admin/courses/:courseId/modules", requireAdmin, async (req, res) => {
    try {
      const parsed = courseTitleSchema.safeParse(req.body?.title);
      if (!parsed.success) return validationError(res, parsed.error);
      const course = await storage.getCourse(req.params.courseId);
      if (!course) return res.status(404).json({ message: "Course not found" });
      const modules = await storage.getCourseModules(req.params.courseId);
      const module = await storage.createCourseModule({ courseId: req.params.courseId, title: parsed.data, status: "draft", sortOrder: modules.length });
      res.status(201).json(module);
    } catch (e) {
      res.status(500).json({ message: "Failed to create module" });
    }
  });

  // Admin: update module
  app.put("/api/admin/modules/:id", requireAdmin, async (req, res) => {
    try {
      const parsed = moduleUpdateSchema.safeParse(req.body);
      if (!parsed.success) return validationError(res, parsed.error);
      const module = await storage.updateCourseModule(req.params.id, parsed.data);
      if (!module) return res.status(404).json({ message: "Not found" });
      res.json(module);
    } catch (e) {
      res.status(500).json({ message: "Failed to update module" });
    }
  });

  // Admin: delete module
  app.delete("/api/admin/modules/:id", requireAdmin, async (req, res) => {
    try {
      const ok = await storage.deleteCourseModule(req.params.id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to delete module" });
    }
  });

  // Admin: reorder lessons in a module
  app.put("/api/admin/modules/:id/lessons/reorder", requireAdmin, async (req, res) => {
    try {
      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds)) return res.status(400).json({ message: "orderedIds required" });
      const lessons = await storage.getCourseLessons(req.params.id);
      if (!hasExactIds(lessons.map((lesson) => lesson.id), orderedIds)) {
        return res.status(400).json({ message: "orderedIds must include each lesson in this module exactly once" });
      }
      await storage.reorderCourseLessons(req.params.id, orderedIds);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to reorder" });
    }
  });

  // Admin: create lesson
  app.post("/api/admin/modules/:moduleId/lessons", requireAdmin, async (req, res) => {
    try {
      const parsed = courseTitleSchema.safeParse(req.body?.title);
      if (!parsed.success) return validationError(res, parsed.error);
      const module = await storage.getCourseModule(req.params.moduleId);
      if (!module) return res.status(404).json({ message: "Module not found" });
      if (req.body?.courseId && req.body.courseId !== module.courseId) {
        return res.status(400).json({ message: "Module does not belong to the supplied course" });
      }
      const lessons = await storage.getCourseLessons(req.params.moduleId);
      const lesson = await storage.createCourseLesson({ courseId: module.courseId, moduleId: req.params.moduleId, title: parsed.data, status: "draft", sortOrder: lessons.length });
      res.status(201).json(lesson);
    } catch (e) {
      res.status(500).json({ message: "Failed to create lesson" });
    }
  });

  // Admin: get lesson with resources
  app.get("/api/admin/lessons/:id", requireAdmin, async (req, res) => {
    try {
      const lesson = await storage.getCourseLesson(req.params.id);
      if (!lesson) return res.status(404).json({ message: "Not found" });
      if (typeof req.query.courseId === "string" && lesson.courseId !== req.query.courseId) {
        return res.status(404).json({ message: "Lesson not found in this course" });
      }
      const resources = await storage.getLessonResources(req.params.id);
      res.json({ ...lesson, resources });
    } catch (e) {
      res.status(500).json({ message: "Failed to load lesson" });
    }
  });

  // Admin: update lesson
  app.put("/api/admin/lessons/:id", requireAdmin, async (req, res) => {
    try {
      const parsed = lessonUpdateSchema.safeParse(req.body);
      if (!parsed.success) return validationError(res, parsed.error);
      const updates = parsed.data;
      // Validate videoUrl — only allow http/https to prevent javascript: injection
      if (updates.videoUrl !== undefined && updates.videoUrl !== null && updates.videoUrl !== "") {
        try {
          const { protocol } = new URL(updates.videoUrl);
          if (protocol !== "https:" && protocol !== "http:") {
            return res.status(400).json({ message: "videoUrl must be an http(s) URL" });
          }
        } catch {
          return res.status(400).json({ message: "videoUrl must be a valid URL" });
        }
      }
      const lesson = await storage.updateCourseLesson(req.params.id, updates);
      if (!lesson) return res.status(404).json({ message: "Not found" });
      res.json(lesson);
    } catch (e) {
      res.status(500).json({ message: "Failed to update lesson" });
    }
  });

  app.get("/api/admin/lessons/:id/vimeo-transcript-tracks", requireAdmin, async (req, res) => {
    try {
      const lesson = await storage.getCourseLesson(req.params.id);
      const videoId = lesson?.videoUrl ? extractVimeoVideoId(lesson.videoUrl) : null;
      if (!lesson || !videoId) return res.status(400).json({ message: "Add a Vimeo video to this lesson first." });
      res.json({ tracks: await listVimeoTextTracks(videoId) });
    } catch (e) {
      console.error("[Vimeo transcript tracks]", e);
      res.status(502).json({ message: "Vimeo could not provide transcript tracks for this video." });
    }
  });

  app.post("/api/admin/lessons/:id/vimeo-transcript", requireAdmin, async (req, res) => {
    try {
      const lesson = await storage.getCourseLesson(req.params.id);
      const videoId = lesson?.videoUrl ? extractVimeoVideoId(lesson.videoUrl) : null;
      const trackId = typeof req.body?.trackId === "string" ? req.body.trackId : "";
      if (!lesson || !videoId) return res.status(400).json({ message: "Add a Vimeo video to this lesson first." });
      if (!/^\d+$/.test(trackId)) return res.status(400).json({ message: "Choose a transcript language." });
      const transcript = await fetchVimeoTranscript(videoId, trackId);
      const saved = await storage.updateCourseLesson(req.params.id, {
        transcriptText: transcript.text,
        transcriptLanguage: transcript.language || null,
        transcriptSource: `Vimeo${transcript.name ? ` · ${transcript.name}` : ""}`,
        transcriptUpdatedAt: new Date(),
      });
      res.json(saved);
    } catch (e) {
      console.error("[Vimeo transcript import]", e);
      res.status(502).json({ message: e instanceof Error ? e.message : "Vimeo transcript import failed." });
    }
  });

  app.get("/api/admin/lessons/:id/transcript/download", requireAdmin, async (req, res) => {
    const lesson = await storage.getCourseLesson(req.params.id);
    if (!lesson?.transcriptText) return res.status(404).json({ message: "No transcript has been saved for this lesson." });
    const filename = `${lesson.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "lesson"}-transcript.txt`;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(`${lesson.title}\n\n${lesson.transcriptText}\n`);
  });

  // Admin: delete lesson
  app.delete("/api/admin/lessons/:id", requireAdmin, async (req, res) => {
    try {
      const ok = await storage.deleteCourseLesson(req.params.id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to delete lesson" });
    }
  });

  // Admin: get lesson resources
  app.get("/api/admin/lessons/:id/resources", requireAdmin, async (req, res) => {
    try {
      const lesson = await storage.getCourseLesson(req.params.id);
      if (!lesson) return res.status(404).json({ message: "Lesson not found" });
      const resources = await storage.getLessonResources(req.params.id);
      res.json(resources);
    } catch (e) {
      res.status(500).json({ message: "Failed to load resources" });
    }
  });

  // Admin: prepare a direct-to-storage upload for an inline lesson image.
  app.post("/api/admin/lesson-images/request-upload-url", requireAdmin, async (req, res) => {
    try {
      const { name, size, contentType } = req.body ?? {};
      const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
      if (typeof name !== "string" || typeof contentType !== "string" || !Number.isFinite(Number(size))) {
        return res.status(400).json({ message: "name, size, and contentType are required" });
      }
      if (!allowedTypes.has(contentType)) {
        return res.status(400).json({ message: "Please upload a JPG, PNG, WebP, or GIF image." });
      }
      if (Number(size) <= 0 || Number(size) > 10 * 1024 * 1024) {
        return res.status(400).json({ message: "Images must be 10 MB or smaller." });
      }

      const objectStorage = new ObjectStorageService();
      const uploadUrl = await objectStorage.getObjectEntityUploadURL();
      const objectPath = objectStorage.normalizeObjectEntityPath(uploadUrl);
      const imageId = objectPath.match(/^\/objects\/uploads\/([0-9a-f-]{36})$/i)?.[1];
      if (!imageId) throw new Error("Unexpected object-storage path");

      res.json({ uploadUrl, imageUrl: `/api/lesson-images/${imageId}` });
    } catch (err) {
      console.error("[lesson images] prepare upload error:", err);
      res.status(500).json({ message: "Failed to prepare image upload" });
    }
  });

  // Inline lesson images are private to authenticated Toolkit members.
  app.get("/api/lesson-images/:id", requireAuth, async (req, res) => {
    try {
      const imageId = req.params.id;
      if (!/^[0-9a-f-]{36}$/i.test(imageId)) {
        return res.status(400).json({ message: "Invalid image ID" });
      }
      const objectStorage = new ObjectStorageService();
      const image = await objectStorage.getObjectEntityFile(`/objects/uploads/${imageId}`);
      await objectStorage.downloadObject(image, res, 86_400);
    } catch (err) {
      console.error("[lesson images] serve image error:", err);
      if (!res.headersSent) res.status(404).json({ message: "Image not found" });
    }
  });

  // Admin: add resource to lesson
  app.post("/api/admin/lessons/:lessonId/resources", requireAdmin, async (req, res) => {
    try {
      const { name, url, subtitle, kind } = req.body;
      if (!name?.trim() || !url?.trim()) return res.status(400).json({ message: "name and url required" });
      if (kind !== undefined && kind !== "link" && kind !== "pdf") {
        return res.status(400).json({ message: "Resource kind must be link or pdf" });
      }
      const lesson = await storage.getCourseLesson(req.params.lessonId);
      if (!lesson) return res.status(404).json({ message: "Lesson not found" });
      // Validate resource URL — only allow http/https
      try {
        const { protocol } = new URL(url.trim());
        if (protocol !== "https:" && protocol !== "http:") {
          return res.status(400).json({ message: "Resource URL must be an http(s) URL" });
        }
      } catch {
        return res.status(400).json({ message: "Resource URL must be a valid URL" });
      }
      const existing = await storage.getLessonResources(req.params.lessonId);
      const resource = await storage.createCourseResource({
        lessonId: req.params.lessonId,
        name: name.trim(),
        url: url.trim(),
        subtitle: subtitle?.trim() || null,
        kind: kind || "link",
        sortOrder: existing.length,
      });
      res.status(201).json(resource);
    } catch (e) {
      res.status(500).json({ message: "Failed to add resource" });
    }
  });

  // Admin: update resource
  app.put("/api/admin/resources/:id", requireAdmin, async (req, res) => {
    try {
      const parsed = resourceUpdateSchema.safeParse(req.body);
      if (!parsed.success) return validationError(res, parsed.error);
      const updates = parsed.data;
      // Validate URL if present
      if (updates.url) {
        try {
          const { protocol } = new URL(updates.url);
          if (protocol !== "https:" && protocol !== "http:") {
            return res.status(400).json({ message: "Resource URL must be an http(s) URL" });
          }
        } catch {
          return res.status(400).json({ message: "Resource URL must be a valid URL" });
        }
      }
      const resource = await storage.updateCourseResource(req.params.id, updates);
      if (!resource) return res.status(404).json({ message: "Not found" });
      res.json(resource);
    } catch (e) {
      res.status(500).json({ message: "Failed to update resource" });
    }
  });

  // Admin: delete resource
  app.delete("/api/admin/resources/:id", requireAdmin, async (req, res) => {
    try {
      const ok = await storage.deleteCourseResource(req.params.id);
      if (!ok) return res.status(404).json({ message: "Not found" });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to delete resource" });
    }
  });

  // Admin-only (until member rollout): list published courses
  app.get("/api/training/courses", requireAdmin, async (_req, res) => {
    try {
      const published = await storage.getPublishedCourses();
      res.json(published);
    } catch (e) {
      res.status(500).json({ message: "Failed to load courses" });
    }
  });

  // Admin-only (until member rollout): get course with structure + progress
  app.get("/api/training/courses/:id", requireAdmin, async (req, res) => {
    try {
      const userId = req.session.userId as string;
      const result = await storage.getCourseWithStructure(req.params.id, userId);
      if (!result) return res.status(404).json({ message: "Not found" });
      // Enforce published access for members
      if (result.course.status !== "published") return res.status(404).json({ message: "Not found" });
      // Filter to published lessons only
      const filtered = {
        ...result,
        modules: result.modules
          .map((m) => ({ ...m, lessons: m.lessons.filter((l) => l.status === "published") }))
          .filter((m) => m.lessons.length > 0),
      };
      res.json(filtered);
    } catch (e) {
      res.status(500).json({ message: "Failed to load course" });
    }
  });

  // Admin-only (until member rollout): get lesson content + resources
  app.get("/api/training/lessons/:id", requireAdmin, async (req, res) => {
    try {
      const lesson = await storage.getCourseLesson(req.params.id);
      if (!lesson || lesson.status !== "published") return res.status(404).json({ message: "Not found" });
      if (typeof req.query.courseId === "string" && lesson.courseId !== req.query.courseId) {
        return res.status(404).json({ message: "Lesson not found in this course" });
      }
      const course = await storage.getCourse(lesson.courseId);
      if (!course || course.status !== "published") return res.status(404).json({ message: "Not found" });
      const resources = await storage.getLessonResources(req.params.id);
      res.json({ ...lesson, resources });
    } catch (e) {
      res.status(500).json({ message: "Failed to load lesson" });
    }
  });

  // Admin-only (until member rollout): upsert lesson progress
  app.post("/api/training/lessons/:id/progress", requireAdmin, async (req, res) => {
    try {
      const userId = req.session.userId as string;
      const lesson = await storage.getCourseLesson(req.params.id);
      if (!lesson || lesson.status !== "published") return res.status(404).json({ message: "Not found" });
      const course = await storage.getCourse(lesson.courseId);
      if (!course || course.status !== "published") return res.status(404).json({ message: "Not found" });
      const { completed } = req.body;
      const progress = await storage.upsertCourseProgress(userId, lesson.courseId, req.params.id, !!completed);
      res.json(progress);
    } catch (e) {
      res.status(500).json({ message: "Failed to update progress" });
    }
  });

  // ── End Course Management Routes ──────────────────────────────────────────────

  // Start the automatic placement monitoring scheduler
  startPlacementScheduler(storage);

  return httpServer;
}
