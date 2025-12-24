import { Request } from "express";
import { storage } from "./storage";
import { type UserActionType } from "@shared/schema";

interface LogUserActionParams {
  userId: string;
  actionType: UserActionType;
  actionLabel: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
  req?: Request;
}

export async function logUserAction(params: LogUserActionParams): Promise<void> {
  const { userId, actionType, actionLabel, entityType, entityId, metadata, req } = params;
  
  try {
    await storage.createUserActionLog({
      userId,
      actionType,
      actionLabel,
      entityType: entityType || null,
      entityId: entityId || null,
      metadataJson: metadata || null,
      ip: req?.ip || req?.socket?.remoteAddress || null,
      userAgent: req?.get("user-agent") || null,
    });
  } catch (err: any) {
    console.error(`[UserActionLog] Failed to log action ${actionType} for user ${userId}:`, err.message);
  }
}

export const ActionLabels = {
  session_created: "Created a new video session",
  session_deleted: "Deleted a video session",
  session_title_updated: "Updated session title",
  transcript_regenerated: "Regenerated transcript",
  login_success: "Logged in",
  logout: "Logged out",
  account_updated: "Updated account profile",
  keap_sync_attempted: "Keap sync attempted",
  keap_sync_succeeded: "Synced to Keap",
  keap_sync_failed: "Keap sync failed",
  video_uploaded: "Uploaded video for processing",
  upload_failed: "Video upload failed",
  processing_started: "Video processing started",
  processing_completed: "Video processing completed",
  processing_failed: "Video processing failed",
  file_validation_failed: "Video file validation failed",
} as const;
