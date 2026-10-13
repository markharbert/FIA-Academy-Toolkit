import type { Pool } from "pg";

const checks = new WeakMap<Pool, Promise<void>>();

// Row locks protect insert/move predicates only when PostgreSQL itself checks
// the referenced key. Schema changes belong to the normal schema/publish flow;
// this read-only guard fails closed if an installation is not ready.
export function ensureProjectDeletionConstraints(pool: Pool): Promise<void> {
  let ready = checks.get(pool);
  if (!ready) {
    ready = (async () => {
      const client = await pool.connect();
      try {
        const { rows: [result] } = await client.query(`
          SELECT count(*)::int AS count FROM (
            VALUES ('project_tasks', 'project_id', 'projects'),
                   ('project_tasks', 'parent_task_id', 'project_tasks'),
                   ('project_columns', 'project_id', 'projects'),
                   ('task_comments', 'task_id', 'project_tasks'),
                   ('task_attachments', 'task_id', 'project_tasks')
          ) AS required(child, column_name, parent)
          WHERE EXISTS (
            SELECT 1 FROM pg_constraint c
            JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname=required.column_name
            JOIN pg_attribute p ON p.attrelid=c.confrelid AND p.attname='id'
            WHERE c.contype='f' AND NOT c.condeferrable
              AND c.conrelid=required.child::regclass AND c.confrelid=required.parent::regclass
              AND c.conkey=ARRAY[a.attnum] AND c.confkey=ARRAY[p.attnum]
              AND (required.column_name <> 'parent_task_id' OR c.confdeltype='a')
          )`);
        if (result.count !== 5) throw new Error("Project deletion requires immediate database relationship constraints; apply the Projects schema before deleting");
      } finally {
        client.release();
      }
    })().catch((error) => { checks.delete(pool); throw error; });
    checks.set(pool, ready);
  }
  return ready;
}
