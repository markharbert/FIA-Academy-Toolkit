import { pool } from "../db";
import { readApproval } from "./recovery";
import { attachmentObjectGeneration, deleteAttachmentGeneration } from "./attachments";
import { ProjectToolError, type ToolContext } from "./tools";

// No caller-supplied storage paths. Provenance must come from the immutable
// manifest of an interrupted deletion owned by this exact connection.
export async function cleanupSnapshot(a: any, c: ToolContext) {
  const source = await readApproval(a.approval_id, c);
  if (!source || source.status !== "interrupted" ||
      !["delete_attachment", "delete_task", "delete_project"].includes(source.tool_name)) {
    throw new ProjectToolError("An interrupted deletion from this connection is required.", "confirmation_not_found");
  }
  const files = source.recovery_data?.files;
  const file = Array.isArray(files) && files.length <= 100 ? files.find((f: any) => f.id === a.attachment_id) : undefined;
  if (!file || !/^[1-9]\d*$/.test(file.generation || "") || typeof file.path !== "string" || !file.path.startsWith("/objects/")) {
    throw new ProjectToolError("This preview has no verified file-version evidence for cleanup.", "stale_approval");
  }
  // Check globally, not just in this workspace: a still-linked file is not an
  // orphan, even if someone has linked it under a different attachment ID.
  const { rows } = await pool.query("SELECT id FROM task_attachments WHERE id=$1 OR object_path=$2 LIMIT 1",
    [file.id, file.path]);
  if (rows.length) throw new ProjectToolError("This file is still attached. Use a fresh normal deletion preview.", "stale_approval");
  const generation = await attachmentObjectGeneration(file.path);
  if (generation === null || generation !== file.generation) {
    throw new ProjectToolError(generation === null ? "This leftover file is already absent."
      : "This file was replaced after the original preview. It will not be deleted.", "stale_approval");
  }
  return { sourceApprovalId: source.id, id: file.id, path: file.path,
    generation, filename: file.filename || "attachment" };
}

export async function executeCleanup(a: any, c: ToolContext) {
  const file = await cleanupSnapshot(a, c);
  try { await deleteAttachmentGeneration(file.path, file.generation); }
  catch (error) {
    if ((error as any)?.code === 412) {
      throw new ProjectToolError("The file changed after the cleanup preview. Nothing was deleted.", "stale_approval");
    }
    throw error;
  }
  return { deleted: true, attachmentId: file.id, filename: file.filename,
    counts: { files: 1 }, databaseChanged: false };
}

export async function inspectCleanup(row: any) {
  const file = row.recovery_data?.files?.[0];
  if (!file?.generation || !file.path) return { outcome: "unknown", storage: "unknown" };
  const generation = await attachmentObjectGeneration(file.path);
  return { outcome: generation === null ? "target_absent"
    : generation === file.generation ? "target_unchanged" : "target_changed",
    storage: generation === null ? "absent" : "present",
    cleanup: { previewTool: "preview_attachment_cleanup", originalApprovalId: row.args.approval_id,
      attachmentIds: [file.id],
      message: "Nothing was retried. If the original file remains, request a fresh preview using the original interrupted approval, then ask the user for fresh confirmation." } };
}
