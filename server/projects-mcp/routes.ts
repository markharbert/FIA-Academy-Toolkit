import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response, RequestHandler } from "express";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { authorizationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/authorize.js";
import { tokenHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/token.js";
import { clientRegistrationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/register.js";
import { revocationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/revoke.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { createOAuthMetadata } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { metadataHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/metadata.js";
import { pool } from "../db";
import { storage } from "../storage";
import { requireIdentityAuth } from "../member-auth";
import { buildMcpReference } from "./reference";
import { cleanExpiredMcpData, ensureMcpDatabase } from "./database";
import { ProjectsOAuthProvider, MCP_SCOPES, opaqueToken, hashToken, assertWorkspaceAccess, productionOrigin } from "./oauth";
import { createProjectsMcpServer, projectTools, publicToolError, type ToolContext } from "./tools";
import { mcpBranding } from "./branding";

declare module "express-session" {
  interface SessionData {
    mcpConsentRequest?: string;
    mcpConsentToken?: string;
    mcpConsentWorkspaceId?: string;
  }
}
const uuid = z.string().uuid();
const noStore: RequestHandler = (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); };
function browserWrite(req: Request, res: Response) {
  // Cookie-authorized writes must originate on this exact app host. OAuth token
  // endpoints intentionally use non-cookie client credentials and their SDK CORS.
  const origin = req.get("Origin");
  try {
    if (origin && new URL(origin).host === req.get("host")) return true;
  } catch { /* reject invalid Origin */ }
  res.status(403).json({ message: "This action must be approved on the Academy website." });
  return false;
}
function secretEqual(a: string | undefined, b: string | undefined) {
  if (!a || !b) return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function api(handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res) => { void handler(req, res).catch((error) => {
    if (!res.headersSent) res.status(error instanceof z.ZodError ? 400 : error instanceof InvalidTokenError ? 403 : 500).json({
      message: error instanceof z.ZodError ? "Invalid request" : error instanceof InvalidTokenError ? error.message : publicToolError(error),
    });
  }); };
}
async function workspaceView(userId: string, workspaceId: string) {
  const kind = workspaceId === userId ? "own" as const : "shared" as const;
  try {
    // Resolve names only through the same access check used by agent tokens.
    const owner = await assertWorkspaceAccess(userId, workspaceId);
    const ownerName = owner.displayName || owner.firstName;
    return { id: workspaceId, kind, accessAvailable: true,
      name: ownerName ? `${ownerName}'s workspace` : kind === "own" ? "Your workspace" : "Shared workspace" };
  } catch (error) {
    if (!(error instanceof InvalidTokenError)) throw error;
    return { id: workspaceId, kind, accessAvailable: false, name: null };
  }
}
function connectionView(row: any, clientName: string, workspace: Awaited<ReturnType<typeof workspaceView>>) {
  return { id: row.id, clientName, scopes: row.scopes, createdAt: row.created_at,
    lastUsedAt: row.last_used_at, revokedAt: row.revoked_at, workspace };
}
function approvalView(row: any, clientName: string) {
  return { id: row.id, connectionId: row.grant_id, clientName, toolName: row.tool_name, summary: row.summary,
    status: row.status === "pending" && new Date(row.expires_at).getTime() <= Date.now() ? "expired" : row.status,
    createdAt: row.created_at, expiresAt: row.expires_at, result: row.result, error: row.error };
}

export function registerProjectsMcpRoutes(app: Express, requireAuth: RequestHandler, options: { origin?: string } = {}) {
  const provider = new ProjectsOAuthProvider(options.origin);
  const origin = provider.origin;
  app.get("/api/admin/mcp/reference", requireAuth, noStore, api(async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user?.isAdmin || user.isDisabled) {
      res.status(403).json({ message: "Admin access required" });
      return;
    }
    res.json(buildMcpReference(origin));
  }));
  const metadata = createOAuthMetadata({ provider, issuerUrl: new URL(origin), scopesSupported: MCP_SCOPES,
    serviceDocumentationUrl: new URL("/projects/ai", origin) });
  const oauthMetadata = { ...metadata,
    authorization_endpoint: `${origin}/api/mcp/oauth/authorize`, token_endpoint: `${origin}/api/mcp/oauth/token`,
    registration_endpoint: `${origin}/api/mcp/oauth/register`, revocation_endpoint: `${origin}/api/mcp/oauth/revoke` };
  const branding = mcpBranding(origin);
  const resourceMetadata = {
    authorization_servers: [origin], scopes_supported: MCP_SCOPES,
    resource_name: branding.title, resource_logo_uri: branding.icons![0].src,
    resource_documentation: new URL("/projects/ai", origin).href,
  };
  // The SDK's metadata router does not accept resource_logo_uri. Reuse its
  // GET/OPTIONS-only, CORS-enabled handler for branded RFC 9728 discovery.
  app.use("/.well-known/oauth-authorization-server", metadataHandler(oauthMetadata));
  app.use("/.well-known/oauth-protected-resource/mcp/agent",
    metadataHandler({ ...resourceMetadata, resource: provider.endpoint }));
  // Keep root discovery and legacy connections branded too.
  app.use("/.well-known/oauth-protected-resource",
    metadataHandler({ ...resourceMetadata, resource: provider.endpoint }));
  app.use("/.well-known/oauth-protected-resource/mcp/projects",
    metadataHandler({ ...resourceMetadata, resource: `${origin}/mcp/projects` }));
  app.use("/api/mcp/oauth/authorize", noStore, authorizationHandler({ provider }));
  app.use("/api/mcp/oauth/token", noStore, tokenHandler({ provider }));
  app.use("/api/mcp/oauth/register", noStore, clientRegistrationHandler({ clientsStore: provider.clientsStore, clientSecretExpirySeconds: 0 }));
  app.use("/api/mcp/oauth/revoke", noStore, revocationHandler({ provider }));

  const browserLimit = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false,
    message: { message: "Too many connection requests. Please wait a minute." } });
  app.use("/api/mcp/consent", browserLimit);
  app.use("/api/mcp/approvals", browserLimit);
  app.use("/api/mcp/connections", browserLimit);

  app.get("/api/mcp/config", requireIdentityAuth, noStore, api(async (_req, res) => {
    await ensureMcpDatabase();
    res.json({ ready: true, endpoint: provider.endpoint, productionEndpoint: `${productionOrigin()}/mcp/agent`,
      scopes: MCP_SCOPES, capabilities: [
        "Projects: create, edit, reorder, archive, restore, and approved deletion",
        "Tasks and subtasks: details, completion, priorities, deadlines, tags, links, sections, and ordering",
        "Board sections, comments, task activity, and project summaries",
        "Templates: create, edit, duplicate, save projects as templates, and instantiate",
        "Attachments: list, download, upload up to 25 MB with task-bound URLs, or direct base64 up to 512 KB",
      ] });
  }));
  app.get("/api/mcp/consent/:requestId", requireAuth, noStore, api(async (req, res) => {
    const requestId = uuid.parse(req.params.requestId);
    if (req.session.impersonatingAdminId) { res.status(403).json({ message: "Stop impersonating before connecting an AI assistant." }); return; }
    const workspace = req.session.workspaceOwnerId ?? req.session.userId!;
    const workspaceMetadata = await workspaceView(req.session.userId!, workspace);
    if (!workspaceMetadata.accessAvailable) throw new InvalidTokenError("Workspace access is no longer available");
    await ensureMcpDatabase();
    const { rows: [row] } = await pool.query("SELECT * FROM project_mcp_requests WHERE id=$1 AND consumed_at IS NULL AND expires_at>NOW()", [requestId]);
    if (!row) { res.status(410).json({ message: "This connection request expired or was already used. Start again from your AI assistant." }); return; }
    const client = await provider.clientsStore.getClient(row.client_id);
    if (!client) { res.status(410).json({ message: "The requesting assistant is no longer registered." }); return; }
    req.session.mcpConsentRequest = requestId;
    req.session.mcpConsentToken = opaqueToken();
    req.session.mcpConsentWorkspaceId = workspace;
    const csrfToken = req.session.mcpConsentToken;
    await new Promise<void>((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
    res.json({ requestId, clientName: client.client_name || "Unnamed AI assistant", redirectUri: row.data.redirectUri,
      scopes: row.data.scopes, csrfToken, expiresAt: row.expires_at, workspace: workspaceMetadata });
  }));
  app.post("/api/mcp/consent/:requestId", requireAuth, noStore, api(async (req, res) => {
    if (!browserWrite(req, res)) return;
    const requestId = uuid.parse(req.params.requestId);
    const input = z.object({ csrfToken: z.string().max(100), decision: z.enum(["approve", "deny"]),
      scopes: z.array(z.enum(["projects:read", "projects:write"])).max(2) }).strict().parse(req.body);
    if (req.session.impersonatingAdminId || req.session.mcpConsentRequest !== requestId ||
        !secretEqual(req.session.mcpConsentToken, input.csrfToken)) {
      res.status(403).json({ message: "This approval is not valid for your sign-in session. Reload the consent page." }); return;
    }
    const userId = req.session.userId!, workspaceId = req.session.mcpConsentWorkspaceId;
    if (!workspaceId || workspaceId !== (req.session.workspaceOwnerId ?? userId)) {
      res.status(409).json({ message: "Your selected workspace changed. Reload the consent page to review and authorize that workspace." }); return;
    }
    await assertWorkspaceAccess(userId, workspaceId);
    const connection = await pool.connect();
    let redirect: URL;
    try {
      await connection.query("BEGIN");
      const { rows: [row] } = await connection.query("SELECT * FROM project_mcp_requests WHERE id=$1 AND consumed_at IS NULL AND expires_at>NOW() FOR UPDATE", [requestId]);
      if (!row) { await connection.query("ROLLBACK"); res.status(410).json({ message: "This connection request expired or was already used." }); return; }
      if (input.decision === "approve" && (!input.scopes.includes("projects:read") || input.scopes.some((scope) => !row.data.scopes.includes(scope)))) {
        await connection.query("ROLLBACK"); res.status(400).json({ message: "Permissions cannot exceed what the assistant requested; read access is required." }); return;
      }
      redirect = new URL(row.data.redirectUri);
      if (row.data.state) redirect.searchParams.set("state", row.data.state);
      if (input.decision === "deny") redirect.searchParams.set("error", "access_denied");
      else {
        const grantId = randomUUID(), code = opaqueToken();
        await connection.query("INSERT INTO project_mcp_grants(id,user_id,workspace_id,client_id,scopes,resource) VALUES($1,$2,$3,$4,$5,$6)",
          [grantId, userId, workspaceId, row.client_id, [...new Set(input.scopes)], provider.endpoint]);
        await connection.query(`INSERT INTO project_mcp_codes(hash,grant_id,client_id,redirect_uri,challenge,expires_at)
          VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '5 minutes')`, [hashToken(code), grantId, row.client_id, row.data.redirectUri, row.data.codeChallenge]);
        redirect.searchParams.set("code", code);
      }
      await connection.query("UPDATE project_mcp_requests SET consumed_at=NOW() WHERE id=$1", [requestId]);
      await connection.query("COMMIT");
    } catch (error) { await connection.query("ROLLBACK"); throw error; } finally { connection.release(); }
    delete req.session.mcpConsentRequest;
    delete req.session.mcpConsentToken;
    delete req.session.mcpConsentWorkspaceId;
    await new Promise<void>((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()));
    res.json({ redirectTo: redirect!.href });
  }));
  app.get("/api/mcp/connections", requireIdentityAuth, noStore, api(async (req, res) => {
    await ensureMcpDatabase();
    const { rows } = await pool.query("SELECT * FROM project_mcp_grants WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100", [req.session.userId]);
    const names = new Map<string, string>();
    const workspaces = new Map<string, Awaited<ReturnType<typeof workspaceView>>>();
    for (const row of rows) if (!names.has(row.client_id)) names.set(row.client_id, (await provider.clientsStore.getClient(row.client_id))?.client_name || "Unnamed AI assistant");
    for (const row of rows) if (!workspaces.has(row.workspace_id)) {
      workspaces.set(row.workspace_id, await workspaceView(req.session.userId!, row.workspace_id));
    }
    const { rows: approvals } = await pool.query(`SELECT a.*,g.client_id FROM project_mcp_approvals a JOIN project_mcp_grants g ON g.id=a.grant_id
      WHERE a.user_id=$1 ORDER BY a.created_at DESC LIMIT 100`, [req.session.userId]);
    res.json({ connections: rows.map((row) => connectionView(row, names.get(row.client_id) || "AI assistant", workspaces.get(row.workspace_id)!)),
      approvals: approvals.map((row) => approvalView(row, names.get(row.client_id) || "AI assistant")) });
  }));
  app.delete("/api/mcp/connections/:id", requireIdentityAuth, noStore, api(async (req, res) => {
    if (!browserWrite(req, res)) return;
    const connectionId = uuid.parse(req.params.id);
    const { rows: [row] } = await pool.query("UPDATE project_mcp_grants SET revoked_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING id", [connectionId, req.session.userId]);
    if (!row) { res.status(404).json({ message: "Connection not found." }); return; }
    await pool.query("UPDATE project_mcp_approvals SET status='denied' WHERE grant_id=$1 AND status='pending'", [connectionId]);
    res.json({ ok: true });
  }));
  app.post("/api/mcp/approvals/:id", requireAuth, noStore, api(async (req, res) => {
    // Explicit retirement response for older website clients. Never claim or
    // execute a preview here; confirmations belong exclusively to the AI client.
    res.status(410).json({ message: "Website action approvals are no longer available. Confirm or cancel this request in your AI app using confirm_deletion or cancel_deletion." });
  }));

  const mcpLimit = rateLimit({ windowMs: 60_000, max: 1000, standardHeaders: true, legacyHeaders: false });
  const memberLimit = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (_req, res) => res.locals.mcpActor });
  const uploadLimit = rateLimit({ windowMs: 10 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false,
    keyGenerator: (_req, res) => res.locals.mcpActor });
  async function applyLimit(limiter: RequestHandler, req: Request, res: Response) {
    return new Promise<boolean>((resolve, reject) => {
      const finished = () => resolve(false);
      res.once("finish", finished);
      limiter(req, res, (error?: unknown) => {
        res.off("finish", finished);
        if (error) reject(error); else resolve(true);
      });
    });
  }
  const transportPaths = ["/mcp/agent", "/mcp/projects"];
  app.options(transportPaths, (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id");
    res.sendStatus(204);
  });
  app.post(transportPaths, mcpLimit, api(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate, MCP-Session-Id");
    res.setHeader("Cache-Control", "no-store");
    let auth;
    try {
      const match = req.get("Authorization")?.match(/^Bearer ([A-Za-z0-9_-]+)$/i);
      if (!match) throw new Error("Missing token");
      auth = await provider.verifyAccessToken(match[1]);
    } catch {
      res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource${req.path}", scope="projects:read projects:write"`);
      res.status(401).json({ error: "invalid_token", message: "Sign in and connect your AI assistant to FIA Toolkit." }); return;
    }
    const context: ToolContext = { userId: auth.extra!.userId as string, workspaceId: auth.extra!.workspaceId as string,
      grantId: auth.extra!.grantId as string, scopes: auth.scopes, origin };
    res.locals.mcpActor = context.userId;
    if (!await applyLimit(memberLimit, req, res)) return;
    if (req.body?.method === "tools/call" && ["request_attachment_upload", "complete_attachment_upload", "upload_small_attachment"].includes(req.body?.params?.name)) {
      if (!await applyLimit(uploadLimit, req, res)) return;
    }
    const server = createProjectsMcpServer(context);
    const client = await provider.clientsStore.getClient(auth.clientId);
    const allowedOrigins = [origin, ...client?.redirect_uris.map((uri) => new URL(uri).origin) ?? []];
    if (client?.client_uri) {
      try { allowedOrigins.push(new URL(client.client_uri).origin); } catch { /* invalid optional metadata is not an origin */ }
    }
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true,
      enableDnsRebindingProtection: true,
      allowedHosts: [...new Set([new URL(origin).host, new URL(productionOrigin()).host, "127.0.0.1:5000", "localhost:5000"])],
      allowedOrigins });
    res.on("close", () => { void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      await server.close();
      throw error;
    }
  }));
  app.all(transportPaths, (_req, res) => { res.setHeader("Allow", "POST, OPTIONS"); res.sendStatus(405); });

  void cleanExpiredMcpData().catch(() => console.error("[Projects MCP] Database initialization failed; requests will retry initialization."));
  const cleanup = setInterval(() => {
    void cleanExpiredMcpData().catch(() => console.error("[Projects MCP] Scheduled cleanup failed; will retry on the next cleanup."));
  }, 24 * 60 * 60 * 1000);
  cleanup.unref();
  return provider;
}
