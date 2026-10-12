import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { Response } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidClientMetadataError, InvalidGrantError, InvalidRequestError, InvalidScopeError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { pool } from "../db";
import { storage } from "../storage";
import { ensureMcpDatabase } from "./database";

export const MCP_SCOPES = ["projects:read", "projects:write"];
export const ACCESS_SECONDS = 15 * 60;
export const REFRESH_SECONDS = 30 * 24 * 60 * 60;
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const opaqueToken = () => randomBytes(32).toString("base64url");

export function productionOrigin() {
  // Default verified against the current published deployment, not the development domain.
  return new URL(process.env.APP_BASE_URL || "https://toolkit.fearlessmarketinglab.com").origin;
}
export function mcpOrigin() {
  const production = process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1";
  return production ? productionOrigin() : process.env.REPLIT_DEV_DOMAIN
    ? new URL(`https://${process.env.REPLIT_DEV_DOMAIN}`).origin : "http://127.0.0.1:5000";
}

function encryptionKey() {
  if (!process.env.SESSION_SECRET) throw new Error("Session encryption is not configured");
  return createHash("sha256").update("academy-project-mcp-clients:").update(process.env.SESSION_SECRET).digest();
}
function encryptClient(id: string, data: OAuthClientInformationFull) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(id));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data)), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}
function decryptClient(id: string, value: string): OAuthClientInformationFull {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAAD(Buffer.from(id));
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString());
}

export interface McpGrant {
  id: string; user_id: string; workspace_id: string; client_id: string; scopes: string[];
  resource: string; revoked_at: Date | null;
}

export async function assertWorkspaceAccess(userId: string, workspaceId: string) {
  const actor = await storage.getUser(userId);
  if (!actor || actor.isDisabled) throw new InvalidTokenError("Member access is no longer active");
  const owner = workspaceId === userId ? actor : await storage.getUser(workspaceId);
  if (!owner || owner.isDisabled || (!owner.isAdmin && owner.cfEnrolled !== true)) {
    throw new InvalidTokenError("Active Academy membership is required");
  }
  if (workspaceId !== userId && !await storage.getActiveInviteForMember(userId, workspaceId)) {
    throw new InvalidTokenError("Workspace access has been revoked");
  }
}

export class ProjectsOAuthProvider implements OAuthServerProvider {
  // Validate PKCE in the provider under the same lock as single-use redemption,
  // rather than split validation and consumption across two SDK callbacks.
  skipLocalPkceValidation = true;
  readonly endpoint: string;
  constructor(readonly origin = mcpOrigin()) { this.endpoint = `${origin}/mcp/projects`; }

  clientsStore = {
    getClient: async (clientId: string) => {
      await ensureMcpDatabase();
      const { rows: [client] } = await pool.query("SELECT * FROM project_mcp_clients WHERE id=$1", [clientId]);
      return client ? decryptClient(client.id, client.encrypted_data) : undefined;
    },
    registerClient: async (input: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">) => {
      if (!input.redirect_uris.length || input.redirect_uris.length > 10) throw new InvalidClientMetadataError("Provide 1–10 redirect URIs");
      for (const uri of input.redirect_uris) {
        const url = new URL(uri);
        const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        if (url.username || url.password || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))) {
          throw new InvalidClientMetadataError("Redirect URIs must be HTTPS or HTTP loopback addresses without credentials or fragments");
        }
      }
      if (input.client_name && input.client_name.length > 120) throw new InvalidClientMetadataError("Client name is too long");
      const client = { ...input, client_id: randomUUID(), client_id_issued_at: Math.floor(Date.now() / 1000) };
      await ensureMcpDatabase();
      await pool.query("INSERT INTO project_mcp_clients(id,encrypted_data) VALUES($1,$2)", [client.client_id, encryptClient(client.client_id, client)]);
      return client;
    },
  };

  assertResource(resource?: URL) {
    if (resource && resource.href !== this.endpoint) throw new InvalidRequestError("Resource must be the Academy Projects MCP endpoint");
  }
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
    this.assertResource(params.resource);
    const scopes = params.scopes?.length ? params.scopes : MCP_SCOPES;
    if (!scopes.includes("projects:read") || scopes.some((scope) => !MCP_SCOPES.includes(scope))) {
      throw new InvalidScopeError("Supported scopes are projects:read and projects:write; projects:read is required");
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge)) throw new InvalidRequestError("A valid S256 PKCE challenge is required");
    const id = randomUUID();
    await ensureMcpDatabase();
    await pool.query(
      "INSERT INTO project_mcp_requests(id,client_id,data,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '10 minutes')",
      [id, client.client_id, JSON.stringify({ ...params, resource: this.endpoint, scopes })],
    );
    res.redirect(`${this.origin}/mcp/authorize?request=${id}`);
  }
  async challengeForAuthorizationCode(client: OAuthClientInformationFull, code: string) {
    await ensureMcpDatabase();
    const { rows: [row] } = await pool.query(
      "SELECT challenge FROM project_mcp_codes WHERE hash=$1 AND client_id=$2 AND expires_at>NOW()", [hashToken(code), client.client_id],
    );
    if (!row) throw new InvalidGrantError("Authorization code is invalid or expired");
    return row.challenge;
  }
  private async issueTokens(connection: { query: typeof pool.query }, grant: McpGrant): Promise<OAuthTokens> {
    const access = opaqueToken(), refresh = opaqueToken();
    await connection.query(
      `INSERT INTO project_mcp_tokens(hash,grant_id,kind,expires_at)
       VALUES($1,$2,'access',NOW()+INTERVAL '15 minutes'),($3,$2,'refresh',NOW()+INTERVAL '30 days')`,
      [hashToken(access), grant.id, hashToken(refresh)],
    );
    return { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: ACCESS_SECONDS, scope: grant.scopes.join(" ") };
  }
  async exchangeAuthorizationCode(client: OAuthClientInformationFull, code: string, verifier?: string, redirectUri?: string, resource?: URL) {
    this.assertResource(resource);
    await ensureMcpDatabase();
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      const { rows: [row] } = await connection.query(
        "SELECT * FROM project_mcp_codes WHERE hash=$1 AND client_id=$2 AND expires_at>NOW() FOR UPDATE", [hashToken(code), client.client_id],
      );
      if (!row || !verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || createHash("sha256").update(verifier).digest("base64url") !== row.challenge ||
          redirectUri !== row.redirect_uri) throw new InvalidGrantError("Code, PKCE verifier, or redirect URI is invalid");
      const { rows: [grant] } = await connection.query("SELECT * FROM project_mcp_grants WHERE id=$1 AND revoked_at IS NULL FOR UPDATE", [row.grant_id]);
      if (!grant) throw new InvalidGrantError("Connection has been revoked");
      await assertWorkspaceAccess(grant.user_id, grant.workspace_id);
      await connection.query("DELETE FROM project_mcp_codes WHERE hash=$1", [row.hash]);
      const tokens = await this.issueTokens(connection, grant);
      await connection.query("COMMIT");
      return tokens;
    } catch (error) { await connection.query("ROLLBACK"); throw error; } finally { connection.release(); }
  }
  async exchangeRefreshToken(client: OAuthClientInformationFull, refresh: string, scopes?: string[], resource?: URL) {
    this.assertResource(resource);
    await ensureMcpDatabase();
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      const { rows: [row] } = await connection.query(
        `SELECT t.hash,g.* FROM project_mcp_tokens t JOIN project_mcp_grants g ON g.id=t.grant_id
         WHERE t.hash=$1 AND t.kind='refresh' AND t.consumed_at IS NULL AND t.expires_at>NOW()
         AND g.client_id=$2 AND g.revoked_at IS NULL FOR UPDATE OF t,g`, [hashToken(refresh), client.client_id],
      );
      if (!row) throw new InvalidGrantError("Refresh token is invalid, expired, or already used");
      if (scopes && (scopes.some((scope) => !row.scopes.includes(scope)) || !scopes.includes("projects:read"))) {
        throw new InvalidScopeError("A refresh cannot expand permissions");
      }
      await assertWorkspaceAccess(row.user_id, row.workspace_id);
      // Rotate both credentials. Previously issued access tokens stop working immediately.
      await connection.query("DELETE FROM project_mcp_tokens WHERE grant_id=$1", [row.id]);
      if (scopes) {
        row.scopes = scopes;
        await connection.query("UPDATE project_mcp_grants SET scopes=$2 WHERE id=$1", [row.id, scopes]);
      }
      const tokens = await this.issueTokens(connection, row);
      await connection.query("COMMIT");
      return tokens;
    } catch (error) { await connection.query("ROLLBACK"); throw error; } finally { connection.release(); }
  }
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new InvalidTokenError("Invalid access token");
    await ensureMcpDatabase();
    const { rows: [grant] } = await pool.query(
      `SELECT g.*,t.expires_at FROM project_mcp_tokens t JOIN project_mcp_grants g ON g.id=t.grant_id
       WHERE t.hash=$1 AND t.kind='access' AND t.expires_at>NOW() AND g.revoked_at IS NULL`, [hashToken(token)],
    );
    if (!grant || grant.resource !== this.endpoint) throw new InvalidTokenError("Connection is expired or revoked");
    await assertWorkspaceAccess(grant.user_id, grant.workspace_id);
    await pool.query("UPDATE project_mcp_grants SET last_used_at=NOW() WHERE id=$1", [grant.id]);
    return { token, clientId: grant.client_id, scopes: grant.scopes, resource: new URL(grant.resource),
      expiresAt: Math.floor(new Date(grant.expires_at).getTime() / 1000),
      extra: { userId: grant.user_id, workspaceId: grant.workspace_id, grantId: grant.id } };
  }
  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest) {
    await ensureMcpDatabase();
    await pool.query(
      `UPDATE project_mcp_grants SET revoked_at=NOW() WHERE client_id=$1
       AND id IN (SELECT grant_id FROM project_mcp_tokens WHERE hash=$2)`, [client.client_id, hashToken(request.token)],
    );
  }
}
