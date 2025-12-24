import { useEffect, useState, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { 
  type ProcessingStatus, 
  processingStepLabels, 
  processingStepNumbers 
} from "@shared/schema";

interface ProcessingProgressProps {
  sessionId: string;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

interface ProgressData {
  status: ProcessingStatus;
  progress: number;
  message: string;
  error?: string;
}

export function ProcessingProgress({ 
  sessionId, 
  onComplete, 
  onError 
}: ProcessingProgressProps) {
  const [progressData, setProgressData] = useState<ProgressData>({
    status: "queued",
    progress: 0,
    message: "Initializing...",
  });
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const connectSSE = () => {
      const eventSource = new EventSource(
        `/api/sessions/${sessionId}/progress/stream`,
        { withCredentials: true }
      );
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      };

      eventSource.onmessage = (event) => {
        try {
          const data: ProgressData = JSON.parse(event.data);
          setProgressData(data);

          if (data.status === "ready") {
            eventSource.close();
            onComplete?.();
          } else if (data.status === "failed") {
            eventSource.close();
            onError?.(data.error || "Processing failed");
          }
        } catch (err) {
          console.error("Failed to parse SSE data:", err);
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource.close();
        startPolling();
      };
    };

    const startPolling = () => {
      if (pollIntervalRef.current) return;
      
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/sessions/${sessionId}/progress`, {
            credentials: "include",
          });
          if (res.ok) {
            const data: ProgressData = await res.json();
            setProgressData(data);

            if (data.status === "ready") {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
              }
              onComplete?.();
            } else if (data.status === "failed") {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
              }
              onError?.(data.error || "Processing failed");
            }
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      }, 2000);
    };

    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [sessionId, onComplete, onError]);

  const totalSteps = 5;
  const currentStep = processingStepNumbers[progressData.status] || 1;
  const isComplete = progressData.status === "ready";
  const isFailed = progressData.status === "failed";

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="pt-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              {isComplete ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : isFailed ? (
                <XCircle className="h-5 w-5 text-destructive" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              )}
              <span className="font-medium" data-testid="text-processing-status">
                {processingStepLabels[progressData.status] || progressData.status}
              </span>
            </div>
            <span className="text-sm text-muted-foreground" data-testid="text-processing-step">
              Step {currentStep} of {totalSteps}
            </span>
          </div>

          <Progress 
            value={progressData.progress} 
            className="h-2" 
            data-testid="progress-bar"
          />

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span data-testid="text-processing-message">{progressData.message}</span>
            <span data-testid="text-processing-percentage">{progressData.progress}%</span>
          </div>

          {isFailed && progressData.error && (
            <div className="mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {progressData.error}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ProcessingProgressInline({ 
  sessionId,
  onComplete,
}: { 
  sessionId: string;
  onComplete?: () => void;
}) {
  const [progressData, setProgressData] = useState<ProgressData>({
    status: "queued",
    progress: 0,
    message: "Processing...",
  });
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(
      `/api/sessions/${sessionId}/progress/stream`,
      { withCredentials: true }
    );
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: ProgressData = JSON.parse(event.data);
        setProgressData(data);

        if (data.status === "ready" || data.status === "failed") {
          eventSource.close();
          if (data.status === "ready") {
            onComplete?.();
          }
        }
      } catch {}
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [sessionId, onComplete]);

  const isComplete = progressData.status === "ready";
  const isFailed = progressData.status === "failed";

  if (isComplete) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
        <CheckCircle className="h-4 w-4" />
        <span>Complete</span>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <XCircle className="h-4 w-4" />
        <span>Failed</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <Progress value={progressData.progress} className="h-1.5" />
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {progressData.progress}%
      </span>
    </div>
  );
}
