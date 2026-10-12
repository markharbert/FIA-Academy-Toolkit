import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    // Short database-only critical section. Table locks also protect predicates:
    // new children/comments/files and moves into the target must not slip between
    // the comparison and cascade. All writers participate, including website SQL.
    // No cloud requests run while these locks are held.
    await client.query(`LOCK TABLE projects, project_tasks, project_columns,
      task_comments, task_attachments IN SHARE ROW EXCLUSIVE MODE`);
    const snapshot = await readDeletionSnapshot(client, kind, id, owner);
    if (!snapshot || deletionSnapshotHash(snapshot) !== expectedHash) {
      await client.query("ROLLBACK");
      return false;
    }
    if (kind === "task") {
      // parent_task_id is not a foreign key; mirror the normal explicit cascade.
      await client.query("DELETE FROM project_tasks WHERE parent_task_id=$1", [id]);
    }
    await client.query(`DELETE FROM ${tables[kind]} WHERE id=$1 AND user_id=$2`, [id, owner]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
