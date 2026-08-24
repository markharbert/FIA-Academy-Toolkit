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
  sessions_bulk_deleted: "Bulk deleted video sessions",
  session_title_updated: "Updated session title",
  session_moved_to_folder: "Moved session to folder",
  transcript_regenerated: "Regenerated transcript",
  login_success: "Logged in",
  feature_viewed: "Viewed a feature",
  logout: "Logged out",
  account_updated: "Updated account profile",
  video_uploaded: "Uploaded video for processing",
  upload_failed: "Video upload failed",
  processing_started: "Video processing started",
  processing_completed: "Video processing completed",
  processing_failed: "Video processing failed",
  file_validation_failed: "Video file validation failed",
  folder_created: "Created a session folder",
  folder_renamed: "Renamed a session folder",
  folder_deleted: "Deleted a session folder",
  project_created: "Created a project",
  project_updated: "Updated a project",
  project_deleted: "Deleted a project",
  task_created: "Created a task",
  task_updated: "Updated a task",
  task_completed: "Completed a task",
  task_deleted: "Deleted a task",
  dmo_logged: "Logged daily activities (DMO)",
  topic_searched: "Searched for video topics",
  script_generated: "Generated a video script",
  script_deleted: "Deleted a video script",
  teleprompter_script_created: "Created a teleprompter script",
  teleprompter_script_updated: "Updated a teleprompter script",
  teleprompter_script_deleted: "Deleted a teleprompter script",
  teleprompter_recording_uploaded: "Uploaded a teleprompter recording",
  password_changed: "Changed account password",
  password_reset_requested: "Requested a password reset",
} as const;
