import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { performance } from "node:perf_hooks";
import { ensureProjectDeletionConstraints } from "./project-deletion-constraints";

export type DeletionKind = "project" | "task" | "attachment";
export interface DeletionSnapshot {
  root: Record<string, any>;
  tasks: Record<string, any>[];
  comments: Record<string, any>[];
  attachments: Record<string, any>[];
  columns: Record<string, any>[];
}

const tables = { project: "projects", task: "project_tasks", attachment: "task_attachments" } as const;

// One statement gives previews and final checks the same complete MVCC snapshot.
// row_to_json retains PostgreSQL timestamp precision (JS Date does not).
export async function readDeletionSnapshot(
  connection: Pool | PoolClient, kind: DeletionKind, id: string, owner: string,
): Promise<DeletionSnapshot | undefined> {
  const { rows: [row] } = await connection.query(`
    WITH root AS (SELECT * FROM ${tables[kind]} WHERE id=$1 AND user_id=$2),
    selected_tasks AS (
      SELECT t.* FROM project_tasks t WHERE
        ${kind === "project" ? "t.project_id=$1" : kind === "task" ? "(t.id=$1 OR t.parent_task_id=$1)" : "false"}
        AND EXISTS (SELECT 1 FROM root)
    )
    SELECT json_build_object(
      'root', (SELECT row_to_json(r) FROM root r),
      'tasks', COALESCE((SELECT json_agg(t ORDER BY t.id) FROM selected_tasks t), '[]'::json),
      'comments', COALESCE((SELECT json_agg(c ORDER BY c.id) FROM task_comments c
        WHERE c.task_id IN (SELECT id FROM selected_tasks)), '[]'::json),
      'attachments', COALESCE((SELECT json_agg(a ORDER BY a.id) FROM task_attachments a
        WHERE ${kind === "attachment" ? "a.id=$1 AND a.user_id=$2" : "a.task_id IN (SELECT id FROM selected_tasks)"}), '[]'::json),
      'columns', COALESCE((SELECT json_agg(c ORDER BY c.id) FROM project_columns c
        WHERE ${kind === "project" ? "c.project_id=$1 AND EXISTS (SELECT 1 FROM root)" : "false"}), '[]'::json)
    ) AS snapshot`, [id, owner]);
  return row.snapshot.root ? row.snapshot : undefined;
}

export function deletionSnapshotHash(snapshot: DeletionSnapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export async function deleteUnchangedTarget(
  pool: Pool, kind: DeletionKind, id: string, owner: string, expectedHash: string,
): Promise<boolean> {
  await ensureProjectDeletionConstraints(pool);
  const client = await pool.connect();
  let lockingStarted: number | undefined;
  let locksAcquired: number | undefined;
  let transactionEnded: number | undefined;
  let outcome = "error";
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    lockingStarted = performance.now();
    // FOR UPDATE (not NO KEY UPDATE) conflicts with the KEY SHARE locks acquired
    // by immediate FK checks, including independent SQL inserts/moves. Lock the
    // parents before discovering children, then lock existing contents against
    // edits/moves out. Each READ COMMITTED statement sees writers that committed
    // while we waited. No cloud I/O occurs in this critical section.
    await client.query(`SELECT id FROM ${tables[kind]} WHERE id=$1 AND user_id=$2 FOR UPDATE`, [id, owner]);
    if (kind !== "attachment") {
      const { rows: tasks } = await client.query(`
        SELECT id FROM project_tasks
        WHERE ${kind === "project" ? "project_id=$1" : "id=$1 OR parent_task_id=$1"}
        ORDER BY id FOR UPDATE`, [id]);
      const taskIds = tasks.map((task) => task.id);
      await client.query("SELECT id FROM task_comments WHERE task_id=ANY($1::varchar[]) ORDER BY id FOR UPDATE", [taskIds]);
      await client.query("SELECT id FROM task_attachments WHERE task_id=ANY($1::varchar[]) ORDER BY id FOR UPDATE", [taskIds]);
      if (kind === "project") {
        await client.query("SELECT id FROM project_columns WHERE project_id=$1 ORDER BY id FOR UPDATE", [id]);
      }
    }
    locksAcquired = performance.now();
    const snapshot = await readDeletionSnapshot(client, kind, id, owner);
    if (!snapshot || deletionSnapshotHash(snapshot) !== expectedHash) {
      await client.query("ROLLBACK");
      transactionEnded = performance.now();
      outcome = "stale";
      return false;
    }
    if (kind === "task") {
      // Keep the existing one-level explicit cascade; the parent FK is NO ACTION.
      await client.query("DELETE FROM project_tasks WHERE parent_task_id=$1", [id]);
    }
    await client.query(`DELETE FROM ${tables[kind]} WHERE id=$1 AND user_id=$2`, [id, owner]);
    await client.query("COMMIT");
    transactionEnded = performance.now();
    outcome = "deleted";
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    transactionEnded = performance.now();
    throw error;
  } finally {
    client.release();
    if (lockingStarted !== undefined) {
      const end = transactionEnded ?? performance.now();
      // No member IDs/content. Total includes time holding early locks while
      // later locks are acquired; holdMs is the final comparison/delete phase.
      console.info("[project-deletion] lock timing", {
        kind, outcome,
        acquireMs: Math.round((locksAcquired ?? end) - lockingStarted),
        holdMs: locksAcquired === undefined ? 0 : Math.round(end - locksAcquired),
        totalMs: Math.round(end - lockingStarted),
      });
    }
  }
}
