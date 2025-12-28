import { CheckCircle, Circle, Loader2, AlertCircle, Upload, FileAudio, Brain, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { TranscriptStatus, ScoreStatus, ProcessingStatus } from "@shared/schema";

interface PipelineStatusProps {
  transcriptStatus: TranscriptStatus | null;
  scoreStatus: ScoreStatus | null;
  processingStatus: ProcessingStatus | null;
  processingProgress: number | null;
}

interface StageProps {
  label: string;
  status: "pending" | "in_progress" | "complete" | "failed";
  icon: typeof Upload;
  detail?: string;
}

function Stage({ label, status, icon: Icon, detail }: StageProps) {
  return (
    <div className="flex items-center gap-3 md:flex-col md:items-center md:text-center md:gap-2">
      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
        status === "complete" 
          ? "bg-green-500/20 text-green-600 dark:text-green-400"
          : status === "in_progress" 
            ? "bg-primary/20 text-primary"
            : status === "failed"
              ? "bg-destructive/20 text-destructive"
              : "bg-muted text-muted-foreground"
      }`}>
        {status === "complete" ? (
          <CheckCircle className="h-4 w-4" />
        ) : status === "in_progress" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : status === "failed" ? (
          <AlertCircle className="h-4 w-4" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </div>
      <div className="flex-1 md:flex-none">
        <div className={`text-sm font-medium ${
          status === "complete" 
            ? "text-green-600 dark:text-green-400"
            : status === "in_progress"
              ? "text-foreground"
              : status === "failed"
                ? "text-destructive"
                : "text-muted-foreground"
        }`}>
          {label}
        </div>
        {detail && (
          <div className="text-xs text-muted-foreground">{detail}</div>
        )}
      </div>
    </div>
  );
}

export function PipelineStatus({
  transcriptStatus,
  scoreStatus,
  processingStatus,
  processingProgress
}: PipelineStatusProps) {
  const getUploadStageStatus = (): "pending" | "in_progress" | "complete" | "failed" => {
    if (!processingStatus || processingStatus === "queued") return "pending";
    if (processingStatus === "uploading" || processingStatus === "transcoding") return "in_progress";
    if (processingStatus && processingStatus !== "failed") return "complete";
    if (processingStatus === "failed" && !transcriptStatus) return "failed";
    return "pending";
  };

  const getUploadDetail = (): string => {
    if (!processingStatus || processingStatus === "queued") return "Waiting...";
    if (processingStatus === "uploading") return "Uploading...";
    if (processingStatus === "transcoding") return "Extracting audio...";
    if (processingStatus && processingStatus !== "failed") return "Audio extracted";
    return "Waiting...";
  };

  const getTranscriptStageStatus = (): "pending" | "in_progress" | "complete" | "failed" => {
    if (!transcriptStatus) {
      if (processingStatus === "transcribing" || processingStatus === "transcoding") return "in_progress";
      if (processingStatus === "scoring" || processingStatus === "ready") return "complete";
      return "pending";
    }
    if (transcriptStatus === "extracting_audio" || transcriptStatus === "transcribing") return "in_progress";
    if (transcriptStatus === "complete") return "complete";
    if (transcriptStatus === "failed") return "failed";
    return "pending";
  };

  const getTranscriptDetail = (): string => {
    if (transcriptStatus === "extracting_audio") return "Extracting audio...";
    if (transcriptStatus === "transcribing") return "AI transcribing...";
    if (transcriptStatus === "complete") return "Transcript ready";
    if (transcriptStatus === "failed") return "Transcription failed";
    if (processingStatus === "transcribing") return "Processing audio...";
    if (processingStatus === "scoring" || processingStatus === "ready") return "Transcript ready";
    return "Waiting...";
  };

  const getScoreStageStatus = (): "pending" | "in_progress" | "complete" | "failed" => {
    if (!scoreStatus) {
      if (processingStatus === "scoring") return "in_progress";
      if (processingStatus === "ready") return "complete";
      return "pending";
    }
    if (scoreStatus === "partial") return "in_progress";
    if (scoreStatus === "final") return "complete";
    if (scoreStatus === "failed") return "failed";
    return "pending";
  };

  const getScoreDetail = (): string => {
    if (scoreStatus === "partial") return "Analyzing...";
    if (scoreStatus === "final") return "Score complete";
    if (scoreStatus === "failed") return "Scoring failed";
    if (processingStatus === "scoring") return "AI analyzing...";
    if (processingStatus === "ready") return "Score complete";
    return "Waiting for transcript...";
  };

  const allComplete = 
    (transcriptStatus === "complete" || processingStatus === "ready") &&
    (scoreStatus === "final" || processingStatus === "ready");

  const anyFailed = 
    transcriptStatus === "failed" || 
    scoreStatus === "failed" ||
    processingStatus === "failed";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground">Processing Pipeline</h4>
        {allComplete ? (
          <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            Complete
          </span>
        ) : anyFailed ? (
          <span className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Error
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {processingProgress || 0}%
          </span>
        )}
      </div>

      {!allComplete && !anyFailed && processingProgress !== null && (
        <Progress value={processingProgress} className="h-1.5" />
      )}

      <div className="space-y-3 md:space-y-0 md:flex md:items-start md:justify-between md:gap-4">
        <Stage
          label="Upload & Extract Audio"
          status={getUploadStageStatus()}
          icon={Upload}
          detail={getUploadDetail()}
        />
        <Stage
          label="Transcription"
          status={getTranscriptStageStatus()}
          icon={FileAudio}
          detail={getTranscriptDetail()}
        />
        <Stage
          label="AI Scoring"
          status={getScoreStageStatus()}
          icon={Sparkles}
          detail={getScoreDetail()}
        />
      </div>
    </div>
  );
}
