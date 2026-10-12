import { pool } from "../db";

let ready: Promise<void> | undefined;

// Additive, idempotent, and lazy: never hold up the application's HTTP listener.
export function ensureMcpDatabase() {
  if (!ready) {
    ready = pool.query(`
      CREATE TABLE IF NOT EXISTS project_mcp_clients (
        id TEXT PRIMARY KEY, encrypted_data TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS project_mcp_requests (
        id VARCHAR PRIMARY KEY, client_id TEXT NOT NULL REFERENCES project_mcp_clients(id) ON DELETE CASCADE,
        data JSONB NOT NULL, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS project_mcp_grants (
        id VARCHAR PRIMARY KEY, user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        workspace_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_id TEXT NOT NULL REFERENCES project_mcp_clients(id) ON DELETE CASCADE,
        scopes TEXT[] NOT NULL, resource TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_used_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS project_mcp_grants_member_idx ON project_mcp_grants(user_id);
      CREATE TABLE IF NOT EXISTS project_mcp_codes (
        hash TEXT PRIMARY KEY, grant_id VARCHAR NOT NULL REFERENCES project_mcp_grants(id) ON DELETE CASCADE,
        client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS project_mcp_tokens (
        hash TEXT PRIMARY KEY, grant_id VARCHAR NOT NULL REFERENCES project_mcp_grants(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('access','refresh')), expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS project_mcp_tokens_grant_idx ON project_mcp_tokens(grant_id);
      CREATE TABLE IF NOT EXISTS project_mcp_approvals (
        id VARCHAR PRIMARY KEY, grant_id VARCHAR NOT NULL REFERENCES project_mcp_grants(id) ON DELETE CASCADE,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        workspace_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tool_name TEXT NOT NULL, args JSONB NOT NULL, summary TEXT NOT NULL, target_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', result JSONB, error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS project_mcp_approvals_member_idx ON project_mcp_approvals(user_id);
      ALTER TABLE project_mcp_approvals ADD COLUMN IF NOT EXISTS target_hash TEXT NOT NULL DEFAULT '';
      ALTER TABLE project_mcp_approvals ADD COLUMN IF NOT EXISTS recovery_data JSONB;
      CREATE TABLE IF NOT EXISTS project_mcp_operations (
        id VARCHAR PRIMARY KEY, grant_id VARCHAR NOT NULL REFERENCES project_mcp_grants(id) ON DELETE CASCADE,
        request_id VARCHAR NOT NULL, tool_name TEXT NOT NULL, args_hash TEXT NOT NULL,
        status TEXT NOT NULL, result JSONB, error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS project_mcp_operations_request_idx ON project_mcp_operations(grant_id, request_id);
      ALTER TABLE project_mcp_operations ADD COLUMN IF NOT EXISTS approval_id VARCHAR;
      CREATE INDEX IF NOT EXISTS project_mcp_operations_approval_idx ON project_mcp_operations(approval_id);
    `).then(() => undefined).catch((error) => { ready = undefined; throw error; });
  }
  return ready;
}

export async function cleanExpiredMcpData() {
  await ensureMcpDatabase();
  await pool.query(`
    DELETE FROM project_mcp_requests WHERE expires_at < NOW() - INTERVAL '1 day';
    DELETE FROM project_mcp_codes WHERE expires_at < NOW();
    DELETE FROM project_mcp_tokens WHERE expires_at < NOW() - INTERVAL '1 day';
    UPDATE project_mcp_approvals SET status='expired' WHERE status='pending' AND expires_at < NOW();
    DELETE FROM project_mcp_approvals WHERE created_at < NOW() - INTERVAL '90 days';
    DELETE FROM project_mcp_operations WHERE created_at < NOW() - INTERVAL '90 days';
    DELETE FROM project_mcp_clients c WHERE created_at < NOW() - INTERVAL '90 days'
      AND NOT EXISTS (SELECT 1 FROM project_mcp_grants g WHERE g.client_id=c.id AND g.revoked_at IS NULL);
  `);
}
