import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { transcribeAudio, scoreTranscript, generateTitle } from "./ai";
import { convertToMp4, generateThumbnail, extractAudio, probeVideo, SUPPORTED_VIDEO_EXTENSIONS, SUPPORTED_VIDEO_MIMETYPES } from "./ffmpeg";
import { signupSchema, loginSchema, goalTypes, type GoalType, forgotPasswordSchema, resetPasswordSchema, type AuthProvider, updateAccountSchema } from "@shared/schema";
import bcrypt from "bcrypt";
import crypto from "crypto";
import multer from "multer";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import AppleStrategy from "passport-apple";
import { sendPasswordResetEmail } from "./email";
import path from "path";
import fs from "fs";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import {
  getKeapAuthUrl,
  generateOAuthState,
  validateOAuthState,
  exchangeCodeForTokens,
  isKeapConnected,
  disconnectKeap,
  createOrUpdateContact,
  fetchKeapTags,
  getKeapTagsWithCache,
  setDefaultTag,
  getDefaultTag,
  syncUserToKeap,
  applyTagToUser,
} from "./keap";
import { logUserAction, ActionLabels } from "./userActionLog";
import { processSession, subscribeToSession } from "./processing";
import { generateSessionPdfBuffer } from "./pdf";
import { ObjectStorageService } from "./replit_integrations/object_storage";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const VIDEO_RETENTION_DAYS = 30;
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
const MAX_RETRANSCRIBES_PER_DAY = 3;

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

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
  }
}

// Auth middleware
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
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
  
  // Session timeout: 3 hours of inactivity
  // Rolling sessions extend the timeout on each request
  const SESSION_INACTIVITY_TIMEOUT = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
  
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
      saveUninitialized: false,
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

      const passwordHash = await bcrypt.hash(password, 10);
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      
      const user = await storage.createUser({ 
        email, 
        passwordHash,
        emailConsentAt: emailConsent ? new Date() : undefined,
        emailConsentIp: emailConsent ? clientIp : undefined,
      });

      req.session.userId = user.id;

      if (emailConsent) {
        const keapConnected = await isKeapConnected();
        if (keapConnected) {
          createOrUpdateContact(email, firstName, lastName)
            .then(async (contactId) => {
              if (contactId) {
                await storage.updateUser(user.id, { keapContactId: String(contactId) });
                console.log(`Synced user ${email} to Keap with contact ID: ${contactId}`);
              }
            })
            .catch((err) => {
              console.error(`Failed to sync user ${email} to Keap:`, err);
            });
        }
      }

      res.status(201).json({ user: { id: user.id, email: user.email } });
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
        return res.status(401).json({ message: "This account uses social login. Please sign in with Google or Facebook." });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password" });
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

      res.json({ user: { id: user.id, email: user.email } });
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

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    console.log("[Auth] /api/auth/me - user.isAdmin:", user.isAdmin, "user.role:", user.role, "user.email:", user.email);
    
    // Compute Gravatar URL from email
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
      passport.authenticate("google", (err: any, user: any, info: any) => {
        if (err) {
          console.error("[OAuth Google] Authentication error:", err.message);
          return res.redirect("/login?error=oauth_failed");
        }
        
        if (!user) {
          console.error("[OAuth Google] No user returned from strategy");
          return res.redirect("/login?error=oauth_failed");
        }
        
        // Set session and save before redirect
        req.session.userId = user.id;
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[OAuth Google] Session save error:", saveErr);
            return res.redirect("/login?error=oauth_failed");
          }
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

  // Facebook OAuth Strategy
  if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    passport.use(new FacebookStrategy({
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: process.env.FACEBOOK_REDIRECT_URI || `${APP_BASE_URL}/api/auth/oauth/facebook/callback`,
      profileFields: ["id", "emails", "name", "displayName"],
      enableProof: true,
      state: true,
    } as any, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();
        const providerUserId = profile.id;
        const firstName = profile.name?.givenName;
        const lastName = profile.name?.familyName;
        const displayName = profile.displayName;

        // Check if identity already exists for this provider
        let identity = await storage.getUserIdentityByProvider("facebook", providerUserId);
        let user;

        if (identity) {
          // User already linked, just return them
          user = await storage.getUser(identity.userId);
        } else if (email) {
          // Check if a user with this email already exists
          user = await storage.getUserByEmail(email);

          if (user) {
            // Link the OAuth identity to existing user (don't modify their password)
            await storage.createUserIdentity({
              userId: user.id,
              provider: "facebook",
              providerUserId,
              emailFromProvider: email,
              emailVerifiedByProvider: false,
              nameFromProvider: displayName,
            });
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
              provider: "facebook",
              providerUserId,
              emailFromProvider: email,
              emailVerifiedByProvider: false,
              nameFromProvider: displayName,
            });
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
            provider: "facebook",
            providerUserId,
            emailFromProvider: null,
            emailVerifiedByProvider: false,
            nameFromProvider: displayName,
          });
        }

        done(null, user);
      } catch (err) {
        done(err);
      }
    }));

    app.get("/api/auth/oauth/facebook", passport.authenticate("facebook" as any, {
      scope: ["email"],
    }));

    app.get("/api/auth/oauth/facebook/callback",
      passport.authenticate("facebook", { failureRedirect: "/login?error=oauth_failed" }),
      (req: Request, res: Response) => {
        req.session.userId = (req.user as any).id;
        res.redirect("/dashboard");
      }
    );
  } else {
    // Fallback routes when Facebook OAuth is not configured
    app.get("/api/auth/oauth/facebook", (req: Request, res: Response) => {
      console.log("[OAuth] Facebook OAuth not configured - missing FACEBOOK_APP_ID or FACEBOOK_APP_SECRET");
      res.redirect("/login?error=oauth_not_configured");
    });
    app.get("/api/auth/oauth/facebook/callback", (req: Request, res: Response) => {
      res.redirect("/login?error=oauth_not_configured");
    });
  }

  // Apple OAuth Strategy
  if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY) {
    passport.use(new AppleStrategy({
      clientID: process.env.APPLE_CLIENT_ID,
      teamID: process.env.APPLE_TEAM_ID,
      keyID: process.env.APPLE_KEY_ID,
      privateKeyString: process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      callbackURL: process.env.APPLE_REDIRECT_URI || `${APP_BASE_URL}/api/auth/oauth/apple/callback`,
      passReqToCallback: true,
    } as any, async (req: any, accessToken: any, refreshToken: any, idToken: any, profile: any, done: any) => {
      try {
        // Apple provides email only on first authorization
        // The profile might have the email in different places
        const email = profile?.email?.toLowerCase() || idToken?.email?.toLowerCase();
        const providerUserId = profile?.id || idToken?.sub;
        const firstName = profile?.name?.firstName || req.body?.user?.name?.firstName;
        const lastName = profile?.name?.lastName || req.body?.user?.name?.lastName;
        const displayName = firstName && lastName ? `${firstName} ${lastName}` : firstName || null;

        if (!providerUserId) {
          return done(null, false, { message: "No user ID from Apple" });
        }

        // Check if identity already exists for this provider
        let identity = await storage.getUserIdentityByProvider("apple", providerUserId);
        let user;

        if (identity) {
          // User already linked, just return them
          user = await storage.getUser(identity.userId);
        } else if (email) {
          // Check if a user with this email already exists
          user = await storage.getUserByEmail(email);

          if (user) {
            // Link the OAuth identity to existing user (don't modify their password)
            await storage.createUserIdentity({
              userId: user.id,
              provider: "apple",
              providerUserId,
              emailFromProvider: email,
              emailVerifiedByProvider: true, // Apple verifies emails
              nameFromProvider: displayName,
            });
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
              provider: "apple",
              providerUserId,
              emailFromProvider: email,
              emailVerifiedByProvider: true,
              nameFromProvider: displayName,
            });
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
            provider: "apple",
            providerUserId,
            emailFromProvider: null,
            emailVerifiedByProvider: false,
            nameFromProvider: displayName,
          });
        }

        done(null, user);
      } catch (err) {
        done(err);
      }
    }));

    app.get("/api/auth/oauth/apple", passport.authenticate("apple" as any, {
      scope: ["name", "email"],
    }));

    // Apple uses POST for callback
    app.post("/api/auth/oauth/apple/callback",
      passport.authenticate("apple" as any, { failureRedirect: "/login?error=oauth_failed" }),
      (req: Request, res: Response) => {
        req.session.userId = (req.user as any).id;
        res.redirect("/dashboard");
      }
    );
    
    // Apple connect route for account linking
    app.get("/api/account/connect/apple", requireAuth, (req: Request, res: Response, next: NextFunction) => {
      (req.session as any).connectingUserId = req.session.userId;
      passport.authenticate("apple" as any, { scope: ["name", "email"] })(req, res, next);
    });
  } else {
    // Fallback routes when Apple OAuth is not configured
    app.get("/api/auth/oauth/apple", (req: Request, res: Response) => {
      console.log("[OAuth] Apple OAuth not configured - missing required env vars");
      res.redirect("/login?error=oauth_not_configured");
    });
    app.post("/api/auth/oauth/apple/callback", (req: Request, res: Response) => {
      res.redirect("/login?error=oauth_not_configured");
    });
    app.get("/api/account/connect/apple", requireAuth, (req: Request, res: Response) => {
      res.redirect("/account?error=oauth_not_configured");
    });
  }

  // ===================
  // ADMIN ROUTES - USER MANAGEMENT
  // ===================

  // Admin stats overview
  app.get("/api/admin/stats", requireAdmin, async (req: Request, res: Response) => {
    try {
      const stats = await storage.getAdminStats();
      const keapSettings = await storage.getSystemSettings();
      
      let keapStatus = "not_connected";
      if (keapSettings?.keapAccessToken) {
        const expiresAt = keapSettings.keapTokenExpiresAt;
        if (expiresAt) {
          const hoursUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
          if (hoursUntilExpiry < 24) {
            keapStatus = "token_expiring_soon";
          } else {
            keapStatus = "connected";
          }
        } else {
          keapStatus = "connected";
        }
      }
      
      res.json({
        ...stats,
        keapStatus,
        keapTokenExpiresAt: keapSettings?.keapTokenExpiresAt || null,
        keapLastError: keapSettings?.keapLastError || null,
      });
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
  app.get("/api/admin/overview/activity", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { limit = "20", cursor } = req.query;
      const limitNum = Math.min(Math.max(1, parseInt(limit as string) || 20), 50);
      
      // Parse cursor from query string (format: createdAt|id)
      let cursorObj: { createdAt: Date; id: string } | undefined;
      if (cursor && typeof cursor === "string") {
        const [createdAtStr, id] = cursor.split("|");
        if (createdAtStr && id) {
          const createdAt = new Date(createdAtStr);
          if (!isNaN(createdAt.getTime())) {
            cursorObj = { createdAt, id };
          }
        }
      }
      
      const result = await storage.getActivityFeed({ limit: limitNum, cursor: cursorObj });
      
      // Convert nextCursor to string format for client
      const nextCursorStr = result.nextCursor 
        ? `${result.nextCursor.createdAt.toISOString()}|${result.nextCursor.id}`
        : null;
      
      res.json({
        items: result.items,
        nextCursor: nextCursorStr,
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
      const isExpired = session.videoDeletedAt || (session.expiresAt && new Date(session.expiresAt) < new Date());
      const status = isExpired ? "expired" : "available";
      
      // Build video URL for admin (reuse existing video endpoint)
      const videoUrl = !isExpired && session.videoPath ? `/api/admin/sessions/${sessionId}/video` : null;
      
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
      const { search, role, status, provider, consent, keapStatus, sort, page, pageSize } = req.query;
      
      const result = await storage.getAllUsers({
        search: search as string,
        role: role as string,
        status: status as string,
        provider: provider as string,
        consent: consent as string,
        keapStatus: keapStatus as string,
        sort: sort as string,
        page: page ? parseInt(page as string) : undefined,
        pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      });
      
      // Get identities for provider filter info
      const usersWithProvider = await Promise.all(
        result.users.map(async (user) => {
          const identities = await storage.getUserIdentitiesByUser(user.id);
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
      
      res.json({
        ...userDetails,
        user: safeUser,
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

  // Trigger Keap sync for a specific user
  app.post("/api/admin/users/:id/keap-sync", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const adminUser = (req as any).adminUser;
      
      const targetUser = await storage.getUser(id);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }
      
      if (!targetUser.email) {
        return res.status(400).json({ message: "User has no email address" });
      }
      
      // Log attempt
      logUserAction({
        userId: id,
        actionType: "keap_sync_attempted",
        actionLabel: ActionLabels.keap_sync_attempted,
        entityType: "keap",
        metadata: { triggeredBy: "admin", adminUserId: adminUser.id },
        req,
      });
      
      // Check if Keap is connected
      const keapConnected = await isKeapConnected();
      if (!keapConnected) {
        return res.status(400).json({ message: "Keap is not connected" });
      }
      
      // Create or update contact
      const contactId = await createOrUpdateContact(
        targetUser.email!,
        targetUser.firstName || undefined,
        targetUser.lastName || undefined
      );
      
      if (!contactId) {
        // Log failure
        logUserAction({
          userId: id,
          actionType: "keap_sync_failed",
          actionLabel: ActionLabels.keap_sync_failed,
          entityType: "keap",
          metadata: { reason: "No contact ID returned" },
          req,
        });
        
        await storage.updateUser(id, {
          keapSyncStatus: "failed",
          keapLastSyncAt: new Date(),
          keapSyncError: "Failed to create or update contact",
        });
        
        return res.status(500).json({ message: "Failed to sync user to Keap" });
      }
      
      // Determine if created or updated
      const wasCreated = !targetUser.keapContactId || targetUser.keapContactId !== String(contactId);
      
      // Apply default tag if set
      let tagApplied = false;
      const defaultTag = await getDefaultTag();
      if (defaultTag && defaultTag.id) {
        try {
          const tagResult = await applyTagToUser(String(contactId), defaultTag.id);
          tagApplied = tagResult;
        } catch (tagErr) {
          console.error(`Failed to apply tag to contact ${contactId}:`, tagErr);
        }
      }
      
      // Update user's keap sync status
      await storage.updateUser(id, {
        keapContactId: String(contactId),
        keapSyncStatus: "synced",
        keapLastSyncAt: new Date(),
        keapSyncError: null,
      });
      
      // Log success
      logUserAction({
        userId: id,
        actionType: "keap_sync_succeeded",
        actionLabel: ActionLabels.keap_sync_succeeded,
        entityType: "keap",
        metadata: { contactId, wasCreated, tagApplied, tagId: defaultTag?.id },
        req,
      });
      
      const result = { 
        success: true, 
        created: wasCreated,
        updated: !wasCreated,
        contactId: String(contactId),
        tagApplied,
      };
      
      // Create admin audit log
      await storage.createAuditLog({
        adminUserId: adminUser.id,
        action: "keap_sync",
        targetUserId: id,
        metadataJson: { result },
        ip: req.ip || null,
        userAgent: req.get("user-agent") || null,
      });
      
      res.json(result);
    } catch (err: any) {
      console.error("Admin keap sync error:", err);
      const userId = req.params.id;
      
      // Log failure
      logUserAction({
        userId,
        actionType: "keap_sync_failed",
        actionLabel: ActionLabels.keap_sync_failed,
        entityType: "keap",
        metadata: { error: err.message },
        req,
      });
      
      await storage.updateUser(userId, {
        keapSyncStatus: "failed",
        keapLastSyncAt: new Date(),
        keapSyncError: err.message,
      });
      
      res.status(500).json({ message: err.message || "Failed to sync user to Keap" });
    }
  });

  // ===================
  // ADMIN ROUTES - KEAP INTEGRATION
  // ===================

  app.get("/api/admin/keap/status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const connected = await isKeapConnected();
      const settings = await storage.getSystemSettings();
      const defaultTag = await getDefaultTag();
      
      res.json({
        connected,
        connectedAt: settings?.keapConnectedAt || null,
        lastError: settings?.keapLastError || null,
        tokenExpiresAt: settings?.keapTokenExpiresAt || null,
        defaultTag: defaultTag,
        lastTagSyncAt: settings?.keapLastTagSyncAt || null,
      });
    } catch (err) {
      console.error("Keap status error:", err);
      res.status(500).json({ message: "Failed to get Keap status" });
    }
  });

  app.get("/api/admin/keap/auth-url", requireAdmin, async (req: Request, res: Response) => {
    try {
      const state = generateOAuthState();
      const authUrl = getKeapAuthUrl(state);
      res.json({ authUrl });
    } catch (err) {
      console.error("Keap auth URL error:", err);
      res.status(500).json({ message: "Failed to generate Keap auth URL. Check KEAP_CLIENT_ID and KEAP_REDIRECT_URI." });
    }
  });

  app.get("/api/admin/keap/callback", async (req: Request, res: Response) => {
    try {
      const { code, error, error_description, state } = req.query;
      
      console.log("[Keap Callback] Received callback");
      console.log("[Keap Callback] Query params:", { 
        hasCode: !!code, 
        hasError: !!error, 
        hasState: !!state,
        error: error || null,
        error_description: error_description || null 
      });
      
      if (error) {
        console.error("[Keap Callback] OAuth error from Keap:", error, error_description);
        const errorMsg = encodeURIComponent(String(error_description || error));
        return res.redirect(`/admin?keap_error=${errorMsg}`);
      }
      
      if (!code || typeof code !== "string") {
        console.error("[Keap Callback] No authorization code received");
        return res.redirect("/admin?keap_error=no_code");
      }
      
      // Validate state - REQUIRED for CSRF protection
      if (!state || typeof state !== "string") {
        console.error("[Keap Callback] Missing OAuth state parameter");
        return res.redirect("/admin?keap_error=missing_state");
      }
      
      if (!validateOAuthState(state)) {
        console.error("[Keap Callback] Invalid or expired OAuth state");
        return res.redirect("/admin?keap_error=invalid_state");
      }
      
      await exchangeCodeForTokens(code);
      console.log("[Keap Callback] Token exchange successful");
      res.redirect("/admin?keap_success=connected");
    } catch (err) {
      console.error("[Keap Callback] Error:", err);
      const errorMsg = err instanceof Error ? encodeURIComponent(err.message) : "token_exchange";
      res.redirect(`/admin?keap_error=${errorMsg}`);
    }
  });

  app.post("/api/admin/keap/disconnect", requireAdmin, async (req: Request, res: Response) => {
    try {
      await disconnectKeap();
      res.json({ message: "Keap disconnected successfully" });
    } catch (err) {
      console.error("Keap disconnect error:", err);
      res.status(500).json({ message: "Failed to disconnect Keap" });
    }
  });

  // Fetch tags from Keap (with caching)
  app.get("/api/admin/keap/tags", requireAdmin, async (req: Request, res: Response) => {
    try {
      const force = req.query.force === "true";
      const result = await getKeapTagsWithCache(force);
      res.json(result);
    } catch (err) {
      console.error("Keap fetch tags error:", err);
      res.status(500).json({ message: "Failed to fetch tags from Keap" });
    }
  });

  // Force refresh tags from Keap
  app.post("/api/admin/keap/tags/refresh", requireAdmin, async (req: Request, res: Response) => {
    try {
      const result = await getKeapTagsWithCache(true);
      res.json(result);
    } catch (err) {
      console.error("Keap refresh tags error:", err);
      res.status(500).json({ message: "Failed to refresh tags from Keap" });
    }
  });

  // Set default tag for new signups
  app.post("/api/admin/keap/default-tag", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { tagId, tagName } = req.body;
      
      if (!tagId || !tagName) {
        return res.status(400).json({ message: "Tag ID and name are required" });
      }
      
      await setDefaultTag(Number(tagId), String(tagName));
      res.json({ message: "Default tag set successfully" });
    } catch (err) {
      console.error("Set default tag error:", err);
      res.status(500).json({ message: "Failed to set default tag" });
    }
  });

  // Apply tag to a specific user
  app.post("/api/admin/users/:id/apply-tag", requireAdmin, async (req: Request, res: Response) => {
    try {
      const { tagId } = req.body;
      
      if (!tagId) {
        return res.status(400).json({ message: "Tag ID is required" });
      }
      
      const success = await applyTagToUser(req.params.id, Number(tagId));
      
      if (success) {
        res.json({ message: "Tag applied successfully" });
      } else {
        res.status(400).json({ message: "Failed to apply tag. User may not have a Keap contact." });
      }
    } catch (err) {
      console.error("Apply tag error:", err);
      res.status(500).json({ message: "Failed to apply tag" });
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
      });
    } catch (err) {
      console.error("Get account error:", err);
      res.status(500).json({ message: "Failed to fetch account" });
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

      const { displayName, firstName, lastName, email, themePreference } = parsed.data;
      const updates: any = { updatedAt: new Date() };

      if (displayName !== undefined) updates.displayName = displayName;
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;
      if (themePreference !== undefined) updates.themePreference = themePreference;

      // Handle email change
      if (email && email !== user.email) {
        // Check if email is already taken
        const existingUser = await storage.getUserByEmail(email.toLowerCase());
        if (existingUser && existingUser.id !== user.id) {
          return res.status(400).json({ message: "Email already in use" });
        }
        updates.email = email.toLowerCase();
        updates.emailVerifiedAt = null; // Reset verification when email changes
      }

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
      if (!["google", "facebook", "apple"].includes(provider)) {
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

  app.get("/api/account/connect/facebook", requireAuth, (req: Request, res: Response, next: NextFunction) => {
    (req.session as any).connectingUserId = req.session.userId;
    passport.authenticate("facebook" as any, { scope: ["email"] })(req, res, next);
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

        // Sync to Keap if email exists
        if (user.email) {
          const keapConnected = await isKeapConnected();
          if (keapConnected) {
            createOrUpdateContact(user.email, user.firstName || undefined, user.lastName || undefined)
              .then(async (contactId) => {
                if (contactId) {
                  await storage.updateUser(user.id, { keapContactId: String(contactId) });
                  console.log(`Synced OAuth user ${user.email} to Keap with contact ID: ${contactId}`);
                }
              })
              .catch((err) => {
                console.error(`Failed to sync OAuth user ${user.email} to Keap:`, err);
              });
          }
        }

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

  app.post("/api/sessions", requireAuth, async (req: Request, res: Response) => {
    try {
      const { goalType, durationSeconds, title } = req.body;

      if (!goalTypes.includes(goalType)) {
        return res.status(400).json({ message: "Invalid goal type" });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + VIDEO_RETENTION_DAYS);

      const trimmedTitle = title?.trim().slice(0, 80) || null;

      const session = await storage.createSession({
        userId: req.session.userId!,
        goalType: goalType as GoalType,
        durationSeconds: durationSeconds || null,
        expiresAt,
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

      // Store the pending upload info in session
      await storage.updateSession(session.id, {
        processingStatus: "uploading",
        processingProgress: 0,
        processingMessage: "Preparing for upload...",
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

      console.log(`[Confirm:${traceId}] Object path: ${objectPath}, filename: ${filename}, size: ${size}`);

      // Download the file from cloud storage to local disk for processing
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(filename).toLowerCase() || ".mp4";
      const localFilename = uniqueSuffix + ext;
      const localPath = path.join(UPLOADS_DIR, localFilename);

      console.log(`[Confirm:${traceId}] Streaming from cloud storage to ${localPath}`);

      try {
        const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
        
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

  app.post("/api/sessions/:id/upload", requireAuth, upload.single("video"), async (req: Request, res: Response) => {
    const traceId = `upload-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log(`[Upload:${traceId}] Starting upload for session ${req.params.id}`);
    
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        console.log(`[Upload:${traceId}] Session not found`);
        return res.status(404).json({ message: "Session not found", traceId });
      }

      if (session.userId !== req.session.userId) {
        console.log(`[Upload:${traceId}] Access denied`);
        return res.status(403).json({ message: "Access denied", traceId });
      }

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

      if (session.videoDeletedAt || (session.expiresAt && new Date(session.expiresAt) < new Date())) {
        return res.status(410).json({ message: "Video has expired and cannot be retranscribed" });
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

      if (session.videoDeletedAt || (session.expiresAt && new Date(session.expiresAt) < new Date())) {
        return res.status(410).json({ message: "Video has expired and cannot be reprocessed", traceId });
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

      if (session.videoDeletedAt || (session.expiresAt && new Date(session.expiresAt) < new Date())) {
        return res.status(410).json({ message: "Video has expired" });
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

  app.get("/api/sessions/:id/video", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (session.videoDeletedAt) {
        return res.status(404).json({ message: "Video not available" });
      }

      // Determine which video path to use (prefer preview video)
      const preferredVideoPath = session.previewVideoPath || session.videoPath;
      const preferredCloudPath = session.previewCloudStoragePath || session.cloudStoragePath;

      if (!preferredVideoPath && !preferredCloudPath) {
        return res.status(404).json({ message: "Video not available" });
      }

      const mimeType = session.videoMimeType || "video/mp4";

      // Try local file first (prioritize preview if available)
      if (preferredVideoPath) {
        const videoPath = path.join(UPLOADS_DIR, preferredVideoPath);
        if (fs.existsSync(videoPath)) {
          const stat = fs.statSync(videoPath);
          const fileSize = stat.size;
          const range = req.headers.range;

          if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = end - start + 1;
            const file = fs.createReadStream(videoPath, { start, end });
            
            res.writeHead(206, {
              "Content-Range": `bytes ${start}-${end}/${fileSize}`,
              "Accept-Ranges": "bytes",
              "Content-Length": chunkSize,
              "Content-Type": mimeType,
            });
            file.pipe(res);
          } else {
            res.writeHead(200, {
              "Content-Length": fileSize,
              "Content-Type": mimeType,
              "Accept-Ranges": "bytes",
            });
            fs.createReadStream(videoPath).pipe(res);
          }
          return;
        }
      }

      // Fall back to Object Storage if local file not found
      if (preferredCloudPath) {
        console.log(`[Video] Local file not found, streaming from cloud storage: ${preferredCloudPath}`);
        try {
          const objectFile = await objectStorageService.getObjectEntityFile(preferredCloudPath);
          const [metadata] = await objectFile.getMetadata();
          const fileSize = parseInt(metadata.size?.toString() || "0", 10);
          const range = req.headers.range;
          
          if (range && fileSize > 0) {
            // Handle range requests for cloud storage
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = end - start + 1;
            
            res.writeHead(206, {
              "Content-Range": `bytes ${start}-${end}/${fileSize}`,
              "Accept-Ranges": "bytes",
              "Content-Length": chunkSize,
              "Content-Type": mimeType,
            });
            
            const stream = objectFile.createReadStream({ start, end });
            stream.on("error", (err) => {
              console.error("[Video] Cloud storage stream error:", err);
              if (!res.headersSent) {
                res.status(500).json({ message: "Failed to stream video from cloud storage" });
              }
            });
            stream.pipe(res);
          } else {
            res.writeHead(200, {
              "Content-Type": mimeType,
              "Content-Length": fileSize,
              "Accept-Ranges": "bytes",
            });
            
            const stream = objectFile.createReadStream();
            stream.on("error", (err) => {
              console.error("[Video] Cloud storage stream error:", err);
              if (!res.headersSent) {
                res.status(500).json({ message: "Failed to stream video from cloud storage" });
              }
            });
            stream.pipe(res);
          }
          return;
        } catch (cloudErr) {
          console.error("[Video] Failed to stream from cloud storage:", cloudErr);
          return res.status(404).json({ message: "Video file not found in local or cloud storage" });
        }
      }

      return res.status(404).json({ message: "Video file not found" });
    } catch (err) {
      console.error("Video stream error:", err);
      res.status(500).json({ message: "Failed to stream video" });
    }
  });

  app.get("/api/sessions/:id/download", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (session.videoDeletedAt || (session.expiresAt && new Date(session.expiresAt) < new Date())) {
        return res.status(410).json({ message: "Video has expired and is no longer available for download" });
      }

      if (!session.videoPath) {
        return res.status(404).json({ message: "No video available" });
      }

      const videoPath = path.join(UPLOADS_DIR, session.videoPath);
      
      if (!fs.existsSync(videoPath)) {
        return res.status(404).json({ message: "Video file not found" });
      }

      const ext = session.videoMimeType === "video/mp4" ? ".mp4" : ".webm";
      const filename = `practice-session-${session.id}${ext}`;
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", session.videoMimeType || "video/mp4");
      
      fs.createReadStream(videoPath).pipe(res);
    } catch (err) {
      console.error("Download error:", err);
      res.status(500).json({ message: "Failed to download video" });
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

      const thumbnailPath = path.join(UPLOADS_DIR, session.thumbnailPath);
      
      if (!fs.existsSync(thumbnailPath)) {
        return res.status(404).json({ message: "Thumbnail file not found" });
      }

      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      fs.createReadStream(thumbnailPath).pipe(res);
    } catch (err) {
      console.error("Thumbnail error:", err);
      res.status(500).json({ message: "Failed to get thumbnail" });
    }
  });

  // PDF report download
  app.get("/api/sessions/:id/pdf", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!session.scoreJson) {
        return res.status(400).json({ message: "No score data available for PDF generation" });
      }

      const pdfBuffer = await generateSessionPdfBuffer(session);
      const sanitizedTitle = (session.title || "practice-session")
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .toLowerCase()
        .slice(0, 50);
      const filename = `${sanitizedTitle}-report.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("PDF generation error:", err);
      res.status(500).json({ message: "Failed to generate PDF report" });
    }
  });

  return httpServer;
}
