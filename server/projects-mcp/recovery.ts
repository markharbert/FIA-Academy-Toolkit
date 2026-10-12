import { pool } from "../db";
import { createHash } from "node:crypto";
import pg from "pg";
import type { ToolContext } from "./tools";

// Do not reserve the normal query pool while calling storage helpers: enough
// concurrent confirmations could otherwise occupy every connection and wait
// forever for the queries needed to finish their own deletion.
const lockPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4, connectionTimeoutMillis: 1500,
  idleTimeoutMillis: 1000, allowExitOnIdle: true });
lockPool.on("error", () => { console.warn("[Projects MCP] Deletion lock connection lost."); });

// Session locks survive neither a process exit nor a lost DB connection. Hold
// this across BOTH execution and result persistence, never just the claim.
export async function withDeletionLock<T>(id: string, busy: () => T | Promise<T>, work: () => Promise<T>): Promise<T> {
  const client = await lockPool.connect();
  let locked = false;
  let discarded = false;
  let connectionLost = false;
  const onError = () => { connectionLost = true; };
  client.on("error", onError);
  try {
    const { rows: [row] } = await client.query(
      "SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked", [id]);
    locked = row.locked;
    return locked ? await work() : await busy();
  } finally {
    if (locked && !connectionLost) {
      try { await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [id]); }
      catch { client.release(true); discarded = true; }
    }
    client.removeListener("error", onError);
    if (!discarded) client.release(connectionLost);
  }
}

export type InspectDeletion = (row: any, context: ToolContext) => Promise<any>;

export async function readApproval(id: string, c: ToolContext) {
  const { rows: [row] } = await pool.query(
    "SELECT * FROM project_mcp_approvals WHERE id=$1 AND grant_id=$2 AND user_id=$3 AND workspace_id=$4",
    [id, c.grantId, c.userId, c.workspaceId]);
  return row;
}

// Caller holds the same lock as confirm_deletion. No recovery ever invokes a
// deletion or returns the preview to pending. Observations are not attribution.
export async function recoverDeletion(row: any, c: ToolContext, inspect: InspectDeletion) {
  // Before approval_id existed, only an argument hash linked an operation to
  // its confirmation. Match the exact schema-normalized args, not all running
  // work on the connection. Limit the scan; unresolved records remain safe.
  const { rows: legacy } = await pool.query(
    "SELECT id,request_id,args_hash FROM project_mcp_operations WHERE grant_id=$1 AND tool_name='confirm_deletion' AND status='running' AND approval_id IS NULL ORDER BY created_at DESC LIMIT 100",
    [c.grantId]);
  for (const operation of legacy) {
    const expected = createHash("sha256").update(JSON.stringify({
      request_id: operation.request_id, approval_id: row.id, confirmed: true,
    })).digest("hex");
    if (expected === operation.args_hash) {
      await pool.query("UPDATE project_mcp_operations SET approval_id=$2 WHERE id=$1 AND approval_id IS NULL", [operation.id, row.id]);
    }
  }
  const { rows: operations } = await pool.query(
    "SELECT id FROM project_mcp_operations WHERE approval_id=$1 AND grant_id=$2 AND tool_name='confirm_deletion' AND status='running'",
    [row.id, c.grantId]);
  if (row.status === "pending" && new Date(row.expires_at).getTime() <= Date.now()) {
    const { rows: [expired] } = await pool.query(
      "UPDATE project_mcp_approvals SET status='expired' WHERE id=$1 AND status='pending' RETURNING *", [row.id]);
    row = expired || row;
  }
  if (row.status === "executing" || (row.status === "pending" && operations.length)) {
    let observation: any = { outcome: "not_started" };
    if (row.status === "executing") {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        observation = await Promise.race([
          inspect(row, c),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Recovery timed out")), 5000); }),
        ]);
      } catch {
        observation = { outcome: "unknown" };
      } finally { if (timer) clearTimeout(timer); }
    }
    const result = { ...observation, recovered: true, deletionRepeated: false,
      message: "The deletion attempt was interrupted. This is a read-only observation of the current target, not proof that this attempt completed. Nothing was retried. Do not reuse this confirmation. Review the current project and any partial file cleanup with the user in this AI client; if deletion is still wanted, request a fresh preview and explicit confirmation." };
    const { rows: [updated] } = await pool.query(
      "UPDATE project_mcp_approvals SET status='interrupted',result=$2,error=$3 WHERE id=$1 AND status IN ('executing','pending') RETURNING *",
      [row.id, JSON.stringify(result), result.message]);
    row = updated || await readApproval(row.id, c);
  }
  if (operations.length && ["approved", "interrupted", "failed", "denied", "expired"].includes(row.status)) {
    const result = row.status === "approved"
      ? { status: "completed", approvalId: row.id, summary: row.summary, result: row.result }
      : { status: row.status, approvalId: row.id, result: row.result, error: row.error };
    await pool.query(
      "UPDATE project_mcp_operations SET status='done',result=$3 WHERE approval_id=$1 AND grant_id=$2 AND tool_name='confirm_deletion' AND status='running'",
      [row.id, c.grantId, JSON.stringify(result)]);
  }
  return row;
}

export function approvalView(row: any) {
  const { id, tool_name, summary, status, expires_at, result, error } = row;
  return { id, tool_name, summary, status: status === "approved" ? "completed"
    : status === "pending" && new Date(expires_at).getTime() <= Date.now() ? "expired" : status,
    expires_at, result, error };
}
