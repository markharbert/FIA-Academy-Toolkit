import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { storage } from "./storage";
import { isSharedWorkspaceRequestAllowed, listAvailableWorkspaces } from "./workspaces";

// Identity-level routes never grant project access or Academy membership.
export async function requireIdentityAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) { res.status(401).json({ message: "Authentication required" }); return; }
  try {
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      res.status(401).json({ message: "Authentication required" }); return;
    }
    if (user.isDisabled) {
      req.session.destroy(() => {});
      res.status(403).json({ message: "Account is disabled" }); return;
    }
    next();
  } catch {
    res.status(500).json({ message: "Authentication check failed" });
  }
}

// Keep selected-workspace checks on every content route, including MCP consent.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  try {
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Authentication required" });
    }
    const isImpersonating = !!req.session.impersonatingAdminId;
    const isCollaborator = !!req.session.workspaceOwnerId;
    if (!isImpersonating && user.isDisabled) {
      req.session.destroy(() => {});
      return res.status(403).json({ message: "Account is disabled" });
    }
    if (isCollaborator) {
      const invite = await storage.getActiveInviteForMember(req.session.userId, req.session.workspaceOwnerId!);
      if (!invite) return res.status(403).json({ message: "Workspace access has been revoked" });
      const owner = await storage.getUser(req.session.workspaceOwnerId!);
      if (!owner || owner.isDisabled) return res.status(403).json({ message: "Workspace access has been revoked" });
      if (!owner.isAdmin && (owner.cfEnrolled !== true || owner.cfRevokedAt)) {
        return res.status(403).json({ message: "Workspace access has been revoked" });
      }
      if (!user.isAdmin && !isImpersonating && !isSharedWorkspaceRequestAllowed(req.path)) {
        return res.status(403).json({ message: "Shared workspaces provide Project Manager access only. Choose your own workspace for other Academy tools." });
      }
    } else if (!isImpersonating && process.env.CF_API_TOKEN && process.env.CF_COURSE_ID && !user.isAdmin) {
      if (user.cfEnrolled !== true) {
        req.session.destroy(() => {});
        return res.status(403).json({ message: "Active ClickFunnels membership required", error: "cf_not_enrolled" });
      }
    }
  } catch (err) {
    console.error("[requireAuth] DB error:", err);
    return res.status(500).json({ message: "Authentication check failed" });
  }
  next();
}

// The explicit flag lets HTTP regressions exercise configured membership checks
// without reading or replacing environment credentials.
export function createAuthMeHandler(membershipRequired = Boolean(process.env.CF_API_TOKEN && process.env.CF_COURSE_ID)) {
  return async (req: Request, res: Response) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user) return res.status(401).json({ message: "User not found" });
      if (user.isDisabled) {
        req.session.destroy(() => {});
        return res.status(403).json({ message: "Account is disabled" });
      }
      const isImpersonating = !!req.session.impersonatingAdminId;
      if (membershipRequired && !isImpersonating && !user.isAdmin && user.cfEnrolled !== true) {
        const hasSharedAccess = (await listAvailableWorkspaces(user.id)).some((choice) => !choice.isOwn);
        // A stale selected shared workspace is not content access. Retain the
        // personal identity so the member can choose another workspace or remove
        // an old agent connection; requireAuth and agent tokens still reject it.
        if (!hasSharedAccess && !req.session.workspaceOwnerId) {
          req.session.destroy(() => {});
          return res.status(403).json({ message: "Active ClickFunnels membership required", error: "cf_not_enrolled" });
        }
      }
      let gravatarUrl: string | null = null;
      if (user.email) {
        const hash = crypto.createHash("md5").update(user.email.trim().toLowerCase()).digest("hex");
        gravatarUrl = `https://www.gravatar.com/avatar/${hash}?s=64&d=mp`;
      }
      let impersonating = null;
      if (req.session.impersonatingAdminId) {
        const admin = await storage.getUser(req.session.impersonatingAdminId);
        if (admin) impersonating = { adminId: admin.id, adminDisplayName: admin.displayName, adminEmail: admin.email };
      }
      const workspaceOwnerId = req.session.workspaceOwnerId ?? null;
      return res.json({ user: {
        id: user.id, email: user.email, displayName: user.displayName, firstName: user.firstName, lastName: user.lastName,
        emailConsentAt: user.emailConsentAt, isAdmin: user.isAdmin,
        role: user.role || (user.isAdmin ? "admin" : "user"), isDisabled: user.isDisabled,
        gravatarUrl, cfEnrolled: user.cfEnrolled, cfEnrolledAt: user.cfEnrolledAt, cfRevokedAt: user.cfRevokedAt,
        timezone: user.timezone || "America/New_York", impersonating, workspaceOwnerId, isCollaborator: !!workspaceOwnerId,
      } });
    } catch {
      return res.status(500).json({ message: "Authentication check failed" });
    }
  };
}
