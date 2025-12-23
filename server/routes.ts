import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { transcribeAudio, scoreTranscript, generateTitle } from "./ai";
import { convertToMp4, generateThumbnail, extractAudio } from "./ffmpeg";
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
  exchangeCodeForTokens,
  isKeapConnected,
  disconnectKeap,
  createOrUpdateContact,
  sendTestContact,
} from "./keap";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const VIDEO_RETENTION_DAYS = 30;
const MAX_VIDEO_SIZE = 250 * 1024 * 1024; // 250MB
const MAX_RETRANSCRIBES_PER_DAY = 3;

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure multer for video uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname) || ".webm");
    },
  }),
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: (req, file, cb) => {
    const allowed = ["video/webm", "video/mp4", "video/quicktime"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only video files are allowed."));
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
  if (!user?.isAdmin) {
    return res.status(403).json({ message: "Admin access required" });
  }
  
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
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
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

      res.json({ user: { id: user.id, email: user.email } });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
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

    res.json({ 
      user: { 
        id: user.id, 
        email: user.email, 
        displayName: user.displayName,
        firstName: user.firstName,
        lastName: user.lastName,
        emailConsentAt: user.emailConsentAt,
        isAdmin: user.isAdmin,
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

  const APP_BASE_URL = process.env.APP_BASE_URL || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;

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
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_REDIRECT_URI || `${APP_BASE_URL}/api/auth/oauth/google/callback`,
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
        }

        done(null, user);
      } catch (err) {
        done(err);
      }
    }));

    app.get("/api/auth/oauth/google", passport.authenticate("google", {
      scope: ["profile", "email"],
    }));

    app.get("/api/auth/oauth/google/callback",
      passport.authenticate("google", { failureRedirect: "/login?error=oauth_failed" }),
      (req: Request, res: Response) => {
        req.session.userId = (req.user as any).id;
        res.redirect("/dashboard");
      }
    );
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
  }

  // Also add Apple connect route for account linking
  app.get("/api/account/connect/apple", requireAuth, (req: Request, res: Response, next: NextFunction) => {
    (req.session as any).connectingUserId = req.session.userId;
    passport.authenticate("apple" as any, { scope: ["name", "email"] })(req, res, next);
  });

  // ===================
  // ADMIN ROUTES - KEAP INTEGRATION
  // ===================

  app.get("/api/admin/keap/status", requireAdmin, async (req: Request, res: Response) => {
    try {
      const connected = await isKeapConnected();
      const settings = await storage.getSystemSettings();
      
      res.json({
        connected,
        connectedAt: settings?.keapConnectedAt || null,
      });
    } catch (err) {
      console.error("Keap status error:", err);
      res.status(500).json({ message: "Failed to get Keap status" });
    }
  });

  app.get("/api/admin/keap/auth-url", requireAdmin, async (req: Request, res: Response) => {
    try {
      const authUrl = getKeapAuthUrl();
      res.json({ authUrl });
    } catch (err) {
      console.error("Keap auth URL error:", err);
      res.status(500).json({ message: "Failed to generate Keap auth URL. Check KEAP_CLIENT_ID and KEAP_REDIRECT_URI." });
    }
  });

  app.get("/api/admin/keap/callback", async (req: Request, res: Response) => {
    try {
      const { code, error } = req.query;
      
      if (error) {
        console.error("Keap OAuth error:", error);
        return res.redirect("/admin?keap_error=oauth_denied");
      }
      
      if (!code || typeof code !== "string") {
        return res.redirect("/admin?keap_error=no_code");
      }
      
      await exchangeCodeForTokens(code);
      res.redirect("/admin?keap_success=connected");
    } catch (err) {
      console.error("Keap callback error:", err);
      res.redirect("/admin?keap_error=token_exchange");
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

  app.post("/api/admin/keap/test", requireAdmin, async (req: Request, res: Response) => {
    try {
      const result = await sendTestContact();
      res.json(result);
    } catch (err) {
      console.error("Keap test error:", err);
      res.status(500).json({ success: false, message: "Failed to send test contact" });
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

      const { displayName, firstName, lastName, email } = parsed.data;
      const updates: any = { updatedAt: new Date() };

      if (displayName !== undefined) updates.displayName = displayName;
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;

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

  app.post("/api/sessions/:id/upload", requireAuth, upload.single("video"), async (req: Request, res: Response) => {
    try {
      const session = await storage.getSession(req.params.id);
      
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }

      if (session.userId !== req.session.userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No video file provided" });
      }

      await storage.updateSession(session.id, {
        videoPath: req.file.filename,
        videoMimeType: req.file.mimetype,
        videoSizeBytes: req.file.size,
      });

      res.json({ message: "Video uploaded successfully" });
    } catch (err) {
      console.error("Upload error:", err);
      res.status(500).json({ message: "Failed to upload video" });
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

      if (session.videoPath.endsWith(".mp4")) {
        console.log(`[Convert] Session ${session.id} already has MP4, skipping conversion`);
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
        message: "Video converted successfully",
        videoPath: outputFilename,
        thumbnailPath: thumbnailPath,
        thumbnailError: thumbnailError,
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

      if (!session.videoPath || session.videoDeletedAt) {
        return res.status(404).json({ message: "Video not available" });
      }

      const videoPath = path.join(UPLOADS_DIR, session.videoPath);
      
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
        const chunkSize = end - start + 1;
        const file = fs.createReadStream(videoPath, { start, end });
        
        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize,
          "Content-Type": session.videoMimeType || "video/webm",
        });
        file.pipe(res);
      } else {
        res.writeHead(200, {
          "Content-Length": fileSize,
          "Content-Type": session.videoMimeType || "video/webm",
        });
        fs.createReadStream(videoPath).pipe(res);
      }
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

  return httpServer;
}
