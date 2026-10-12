import { z } from "zod";
import { storage } from "../storage";
import { ObjectStorageService } from "../replit_integrations/object_storage/objectStorage";
import type { ToolContext, ToolDefinition } from "./tools";

const objects = new ObjectStorageService();
const id = z.string().uuid();
const request = { request_id: id.describe("Mutation UUID; reuse it with identical arguments when retrying.") };
const filename = z.string().trim().min(1).max(180).refine((name) => !/[/\\\u0000-\u001f]/.test(name), "Use a filename without directories or control characters");
const allowedTypes = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv",
] as const;
const mimeType = z.enum(allowedTypes);
const metadata = { filename, mime_type: mimeType };
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_COUNT = 10;

async function ownTask(taskId: string, c: ToolContext) {
  const value = await storage.getTask(taskId, c.workspaceId);
  if (!value) throw new Error("Task not found in your workspace");
  return value;
}
async function ownAttachment(attachmentId: string, c: ToolContext) {
  const value = await storage.getTaskAttachment(attachmentId, c.workspaceId);
  if (!value) throw new Error("Attachment not found in your workspace");
  return value;
}
async function capacity(taskId: string, c: ToolContext) {
  await ownTask(taskId, c);
  if ((await storage.getTaskAttachments(taskId, c.workspaceId)).length >= MAX_COUNT) throw new Error("This task already has 10 attachments");
}
async function requestUpload(a: any, c: ToolContext) {
  await capacity(a.task_id, c);
  const uploadUrl = await objects.getObjectEntityUploadURL();
  const objectPath = objects.normalizeObjectEntityPath(uploadUrl);
  await storage.registerPendingAttachmentUpload(objectPath, c.workspaceId, a.task_id);
  return { uploadUrl, objectPath, method: "PUT", contentType: a.mime_type, maxBytes: MAX_BYTES,
    instructions: "Upload the file bytes to this URL with PUT, then call complete_attachment_upload using this objectPath. Never substitute a path from another task or user." };
}
async function completeUpload(a: any, c: ToolContext) {
  await capacity(a.task_id, c);
  const pending = await storage.getPendingAttachmentUpload(a.object_path);
  if (!pending || pending.userId !== c.workspaceId || pending.taskId !== a.task_id ||
      Date.now() - new Date(pending.issuedAt).getTime() > 45 * 60 * 1000) {
    throw new Error("Invalid or expired task-bound upload. Request a fresh upload URL.");
  }
  const file = await objects.getObjectEntityFile(a.object_path);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) throw new Error("Attachment is empty or exceeds the 25 MB limit");
  if (metadata.contentType && metadata.contentType !== a.mime_type) throw new Error("File content type does not match the upload declaration");
  // Always download as an attachment, never as an executable page on our domain.
  await file.setMetadata({ contentDisposition: `attachment; filename="${a.filename.replace(/"/g, "_")}"` });
  const attachment = await storage.createTaskAttachment(a.task_id, c.workspaceId,
    { objectPath: a.object_path, filename: a.filename, mimeType: a.mime_type, size });
  await storage.removePendingAttachmentUpload(a.object_path);
  return attachment;
}
export async function deleteAttachmentObject(path: string) {
  await objects.deleteObject(path);
}

export const attachmentTools: Record<string, ToolDefinition> = {
  list_attachments: {
    description: "List attachment metadata for a task you can access.",
    schema: z.object({ task_id: id }).strict(),
    run: async (a, c) => { await ownTask(a.task_id, c); return { items: await storage.getTaskAttachments(a.task_id, c.workspaceId) }; },
  },
  download_attachment: {
    description: "Get a short-lived direct download link for an attachment you own. The selected AI client may need separate file-download support.",
    schema: z.object({ attachment_id: id }).strict(),
    run: async (a, c) => {
      const att = await ownAttachment(a.attachment_id, c);
      const downloadUrl = await objects.getSignedDownloadUrl(att.objectPath, 300, att.filename);
      return { filename: att.filename, mimeType: att.mimeType, size: att.size, downloadUrl, expiresInSeconds: 300 };
    },
  },
  request_attachment_upload: {
    description: "Request a task-bound upload URL for a file up to 25 MB. Client must PUT the file bytes and then complete the upload. File handling varies by AI client.",
    write: true, schema: z.object({ ...request, task_id: id, ...metadata }).strict(), run: requestUpload,
  },
  complete_attachment_upload: {
    description: "Attach a file previously uploaded to the issued task-bound URL; verifies ownership, actual stored size, and content type.",
    write: true, schema: z.object({ ...request, task_id: id, object_path: z.string().max(500).startsWith("/objects/"), ...metadata }).strict(), run: completeUpload,
  },
  upload_small_attachment: {
    description: "Upload and attach modest files directly as base64 (maximum 512 KB). For larger files use the task-bound upload URL tools.",
    write: true, schema: z.object({ ...request, task_id: id, ...metadata,
      content_base64: z.string().min(4).max(700000).regex(/^[A-Za-z0-9+/]+={0,2}$/) }).strict(),
    run: async (a, c) => {
      const bytes = Buffer.from(a.content_base64, "base64");
      if (!bytes.length || bytes.length > 512 * 1024 || bytes.toString("base64") !== a.content_base64) throw new Error("Use valid canonical base64 for a file up to 512 KB");
      const issued = await requestUpload(a, c);
      const response = await fetch(issued.uploadUrl, { method: "PUT", headers: { "Content-Type": a.mime_type }, body: bytes });
      if (!response.ok) throw new Error("File upload failed; no attachment was added");
      return completeUpload({ ...a, object_path: issued.objectPath }, c);
    },
  },
  delete_attachment: {
    description: "Preview deletion of an attachment and its stored file. Ask for confirmation in the AI conversation, then use confirm_deletion.",
    write: true, destructive: true, schema: z.object({ ...request, attachment_id: id }).strict(),
    run: async (a, c) => {
      const att = await ownAttachment(a.attachment_id, c);
      await deleteAttachmentObject(att.objectPath);
      await storage.deleteTaskAttachment(att.id, c.workspaceId);
      return { deleted: true, attachmentId: att.id, filename: att.filename, counts: { attachments: 1 } };
    },
  },
};
