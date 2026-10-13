import type { Express, Request, Response, RequestHandler } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { pool } from "./db";
import { storage } from "./storage";

const inviteToken = z.string().regex(/^[a-f0-9]{64}$/i);
const normalizeEmail = (email: string | null | undefined) => (email || "").trim().toLowerCase();
export interface WorkspaceChoice { id: string; name: string; isOwn: boolean }

export function isSharedWorkspaceRequestAllowed(path: string) {
  return /^\/api\/(projects|project-templates|project-columns|tasks|task-attachments|account|workspace)(\/|$)/.test(path) ||
    path === "/api/dashboard/projects" || path === "/api/calendar/ical-url" || path === "/api/activity/feature" ||
    /^\/api\/mcp\//.test(path);
}

// Workspace access is an authorization relationship, not a separate identity
// or password. Only the member's accepted invitations confer shared access.
export async function listAvailableWorkspaces(userId: string): Promise<WorkspaceChoice[]> {
  const { rows } = await pool.query(`
    SELECT DISTINCT u.id, u.display_name, u.first_name, u.email
    FROM users u
    WHERE NOT u.is_disabled AND (u.is_admin OR (u.cf_enrolled IS TRUE AND u.cf_revoked_at IS NULL))
      AND (u.id=$1 OR EXISTS (
        SELECT 1 FROM workspace_invites i
        WHERE i.owner_id=u.id AND i.member_id=$1 AND i.status='accepted'
      ))
    ORDER BY u.id`, [userId]);
  return rows.map((u) => ({
    id: u.id, name: u.id === userId ? "My workspace" : `${u.display_name || u.first_name || u.email || "Member"}'s workspace`,
    isOwn: u.id === userId,
  })).sort((a, b) => Number(b.isOwn) - Number(a.isOwn) || a.name.localeCompare(b.name));
}

export async function defaultWorkspaceOwner(userId: string): Promise<string | undefined> {
  const choices = await listAvailableWorkspaces(userId);
  return choices.some((choice) => choice.isOwn) ? undefined : choices[0]?.id;
}

export function workspaceInviteReturnPath(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !inviteToken.safeParse(raw).success) return undefined;
  return `/workspace/accept?token=${raw}`;
}

export async function validInviteForEmail(raw: unknown, email: string | null | undefined) {
  if (!inviteToken.safeParse(raw).success) return undefined;
  const invite = await storage.getWorkspaceInviteByToken(raw as string);
  if (!invite || invite.status !== "pending" || normalizeEmail(invite.inviteEmail) !== normalizeEmail(email)) return undefined;
  const owner = await storage.getUser(invite.ownerId);
  if (!owner || owner.isDisabled || (!owner.isAdmin && (owner.cfEnrolled !== true || owner.cfRevokedAt))) return undefined;
  return invite;
}

async function identityOnly(req: Request, res: Response, next: () => void) {
  if (!req.session.userId) { res.status(401).json({ message: "Please sign in." }); return; }
  const user = await storage.getUser(req.session.userId);
  if (!user || user.isDisabled) { res.status(403).json({ message: "This account is not available." }); return; }
  if (req.session.impersonatingAdminId) { res.status(403).json({ message: "End impersonation before choosing a workspace." }); return; }
  next();
}

function endpoint(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res) => { void fn(req, res).catch((error) => {
    console.error("[workspaces] request failed:", error instanceof Error ? error.name : "Unknown error");
    if (!res.headersSent) res.status(500).json({ message: "Unable to complete this request. Please try again." });
  }); };
}

export function registerWorkspaceRoutes(app: Express, limiter: RequestHandler) {
  app.get("/api/workspaces", endpoint(async (req, res) => {
    await identityOnly(req, res, () => {});
    if (res.headersSent) return;
    res.setHeader("Cache-Control", "no-store");
    res.json({
      activeWorkspaceId: req.session.workspaceOwnerId || req.session.userId,
      workspaces: await listAvailableWorkspaces(req.session.userId!),
    });
  }));
  app.post("/api/workspaces/active", endpoint(async (req, res) => {
    await identityOnly(req, res, () => {});
    if (res.headersSent) return;
    const origin = req.get("Origin");
    let sameOrigin = false;
    try { sameOrigin = !!origin && new URL(origin).origin === origin && new URL(origin).host === req.get("host"); } catch {}
    if (!sameOrigin) {
      res.status(403).json({ message: "Choose a workspace from the Toolkit website." }); return;
    }
    const parsed = z.object({ workspaceId: z.string().uuid() }).strict().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Choose a valid workspace." }); return; }
    const choice = (await listAvailableWorkspaces(req.session.userId!)).find((w) => w.id === parsed.data.workspaceId);
    if (!choice) { res.status(403).json({ message: "You no longer have access to this workspace." }); return; }
    if (choice.isOwn) delete req.session.workspaceOwnerId;
    else req.session.workspaceOwnerId = choice.id;
    await new Promise<void>((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true });
  }));

  app.get("/api/workspace/invite/info", limiter, endpoint(async (req, res) => {
    const parsed = inviteToken.safeParse(req.query.token);
    if (!parsed.success) { res.status(400).json({ message: "Invalid invitation link." }); return; }
    const invite = await storage.getWorkspaceInviteByToken(parsed.data);
    if (!invite || invite.status !== "pending") { res.status(404).json({ message: "This invitation is no longer available. Ask the workspace owner for a fresh invitation." }); return; }
    if (!await validInviteForEmail(parsed.data, invite.inviteEmail)) {
      res.status(403).json({ message: "This workspace is not currently available." }); return;
    }
    const [owner, member] = await Promise.all([storage.getUser(invite.ownerId), storage.getUserByEmail(invite.inviteEmail)]);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ownerName: owner?.displayName || owner?.email || "Member", ownerEmail: owner?.email || "",
      inviteEmail: invite.inviteEmail, status: invite.status,
      accountExists: !!member, hasPassword: !!member?.passwordHash,
    });
  }));

  app.post("/api/workspace/invite/accept", limiter, endpoint(async (req, res) => {
    const parsed = z.object({ token: inviteToken, password: z.string().max(128).optional() }).strict().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Check the invitation link and password." }); return; }
    if (req.session.impersonatingAdminId) { res.status(403).json({ message: "End impersonation before accepting an invitation." }); return; }
    const { token, password } = parsed.data;
    const invite = await storage.getWorkspaceInviteByToken(token);
    if (!invite || invite.status !== "pending") { res.status(409).json({ message: "This invitation has already been used or revoked." }); return; }
    if (!await validInviteForEmail(token, invite.inviteEmail)) {
      res.status(403).json({ message: "This workspace is not currently available." }); return;
    }
    let member = await storage.getUserByEmail(invite.inviteEmail);
    if (member) {
      if (member.isDisabled) { res.status(403).json({ message: "This account has been disabled." }); return; }
      if (req.session.userId !== member.id) {
        if (!member.passwordHash) {
          res.status(401).json({ message: "This email already has an account. Use Google sign-in or the password reset option below.", error: "existing_account_no_password" }); return;
        }
        if (!password || !await bcrypt.compare(password, member.passwordHash)) {
          res.status(401).json({ message: "That doesn't match your existing FIA password. Use your current password or choose Forgot password.", error: "existing_account_password" }); return;
        }
      }
    } else {
      if (!password || password.length < 8) { res.status(400).json({ message: "Create a password with at least 8 characters." }); return; }
      const firstName = invite.inviteFirstName || undefined, lastName = invite.inviteLastName || undefined;
      member = await storage.createUser({
        email: normalizeEmail(invite.inviteEmail), passwordHash: await bcrypt.hash(password, 10), firstName, lastName,
        displayName: [firstName, lastName].filter(Boolean).join(" ") || undefined,
      });
    }
    const accepted = await storage.acceptWorkspaceInvite(token, member.id);
    if (!accepted) { res.status(409).json({ message: "This invitation is no longer pending." }); return; }
    await new Promise<void>((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
    req.session.userId = member.id;
    req.session.workspaceOwnerId = invite.ownerId;
    await new Promise<void>((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, userId: member.id, workspaceOwnerId: invite.ownerId });
  }));
}
