import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { 
  Download, Copy, Check, RefreshCw, AlertCircle, Clock, 
  TrendingUp, MessageSquare, Lightbulb, AlertTriangle, Quote,
  Gauge, Timer, ArrowLeft, Loader2, Pencil, X, Sparkles, FileText,
  Upload, Settings, File, Video, Mic
} from "lucide-react";
import type { Session, ScoreResult, ProcessingStatus, GoalType } from "@shared/schema";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const processingStepLabels: Record<ProcessingStatus, string> = {
  queued: "Preparing your video...",
  uploading: "Uploading video...",
  transcoding: "Generating preview for playback...",
  transcribing: "Transcribing audio with AI...",
  scoring: "Analyzing your video with AI...",
  ready: "Processing complete!",
  failed: "Processing failed",
};

const SUPPORTED_FORMATS = ".mp4, .mov, .webm, .mkv, .avi, .wmv, .mpeg, .mpg, .m4v, .3gp";
const MAX_FILE_SIZE_MB = 2048;

const tips = [
  { icon: Lightbulb, text: "Record in good lighting - face a window or light source" },
  { icon: Mic, text: "Speak clearly and at a steady pace" },
  { icon: Video, text: "Keep it short and focused - aim for 30-90 seconds" },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ScoreCircle({ score, size = "lg" }: { score: number; size?: "sm" | "lg" }) {
  const radius = size === "lg" ? 54 : 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "text-green-500" : score >= 40 ? "text-yellow-500" : "text-red-500";
  const sizeClass = size === "lg" ? "h-32 w-32" : "h-20 w-20";
  const textSize = size === "lg" ? "text-3xl" : "text-lg";
  const cx = size === "lg" ? 64 : 40;
  const cy = size === "lg" ? 64 : 40;

  return (
    <div className={`relative ${sizeClass}`}>
      <svg className={`${sizeClass} -rotate-90`}>
        <circle
          className="text-muted"
          strokeWidth="8"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={cx}
          cy={cy}
        />
        <circle
          className={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r={radius}
          cx={cx}
          cy={cy}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center ${textSize} font-bold`}>
        {score}
      </span>
    </div>
  );
}

function PartScoreBar({ label, score }: { label: string; score: number }) {
  const percentage = (score / 20) * 100;
  const color = score >= 14 ? "bg-green-500" : score >= 8 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{score}/20</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${color} transition-all`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function DetailedPartFeedback({ 
  partKey, 
  title, 
  score, 
  data 
}: { 
  partKey: string;
  title: string; 
  score: number; 
  data: { whatWorked: string[]; whatMissing: string[]; suggestions: string[]; exampleLines: string[] };
}) {
  return (
    <AccordionItem value={partKey}>
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-3">
          <Badge variant={score >= 14 ? "default" : score >= 8 ? "secondary" : "destructive"} className="text-xs">
            {score}/20
          </Badge>
          <span className="font-semibold">{title}</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-4 pt-4">
        {data.whatWorked.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
              <Check className="h-4 w-4" />
              What Worked
            </div>
            <ul className="space-y-1 pl-6">
              {data.whatWorked.map((item, i) => (
                <li key={i} className="text-sm text-muted-foreground list-disc">{item}</li>
              ))}
            </ul>
          </div>
        )}

        {data.whatMissing.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              What's Missing
            </div>
            <ul className="space-y-1 pl-6">
              {data.whatMissing.map((item, i) => (
                <li key={i} className="text-sm text-muted-foreground list-disc">{item}</li>
              ))}
            </ul>
          </div>
        )}

        {data.suggestions.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400">
              <Lightbulb className="h-4 w-4" />
              Suggestions
            </div>
            <ul className="space-y-1 pl-6">
              {data.suggestions.map((item, i) => (
                <li key={i} className="text-sm text-muted-foreground list-disc">{item}</li>
              ))}
            </ul>
          </div>
        )}

        {data.exampleLines.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Quote className="h-4 w-4" />
              Example Lines
            </div>
            <div className="space-y-2 pl-6">
              {data.exampleLines.map((line, i) => (
                <blockquote key={i} className="border-l-2 border-primary pl-3 text-sm italic text-muted-foreground">
                  "{line}"
                </blockquote>
              ))}
            </div>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export default function SessionPage() {
  const [matchWithId, paramsWithId] = useRoute("/session/:id");
  const [matchWithoutId] = useRoute("/session");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const sessionId = paramsWithId?.id;
  const isNewSession = matchWithoutId && !matchWithId;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [goalType, setGoalType] = useState<GoalType>("sales");
  const [sessionTitle, setSessionTitle] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStep, setUploadStep] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);

  const [editedTranscript, setEditedTranscript] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const isUploading = uploadStep === "uploading";
  const activeSessionId = createdSessionId || sessionId;

  const isProcessingActive = (data: Session | undefined) => {
    if (!data) return activeSessionId ? true : false;
    const status = data.processingStatus;
    if (!status) return !data.transcriptText;
    return !["ready", "failed"].includes(status);
  };

  const { data: session, isLoading, error } = useQuery<Session>({
    queryKey: ["/api/sessions", activeSessionId],
    enabled: !!activeSessionId,
    refetchInterval: (query) => {
      const data = query.state.data as Session | undefined;
      return isProcessingActive(data) ? 2000 : false;
    },
  });

  const retryProcessingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/sessions/${activeSessionId}/retry-processing`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to retry processing");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", activeSessionId] });
      toast({ title: "Processing Restarted", description: "Your video is being processed again." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const rescoreMutation = useMutation({
    mutationFn: async (transcript: string) => {
      const res = await apiRequest("POST", `/api/sessions/${activeSessionId}/rescore`, { transcript });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", activeSessionId] });
      setEditedTranscript(null);
    },
  });

  const updateTitleMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("PATCH", `/api/sessions/${activeSessionId}`, { title: title || null });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update title");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", activeSessionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      setIsEditingTitle(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const retranscribeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/sessions/${activeSessionId}/retranscribe`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to retranscribe");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", activeSessionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      toast({ title: "Transcript Updated", description: "Your video has been retranscribed and rescored." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const generateTitleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/sessions/${activeSessionId}/generate-title`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to generate title");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", activeSessionId] });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      toast({ title: "Title Generated", description: `New title: ${data.title}` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleFileSelect = useCallback((file: File) => {
    setUploadError(null);
    
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setUploadError(`File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }

    if (!file.type.startsWith("video/")) {
      setUploadError("Please select a video file.");
      return;
    }

    setSelectedFile(file);
    
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
    }
    setLocalPreviewUrl(URL.createObjectURL(file));
  }, [localPreviewUrl]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const clearFile = () => {
    setSelectedFile(null);
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl(null);
    }
    setUploadError(null);
    setUploadStep("idle");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadAndProcess = async () => {
    if (!selectedFile) return;

    setUploadStep("uploading");
    setUploadProgress(0);
    setUploadError(null);

    try {
      const createRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          goalType, 
          title: sessionTitle.trim() || undefined,
        }),
        credentials: "include",
      });

      if (!createRes.ok) throw new Error("Failed to create session");
      const { id } = await createRes.json();
      setCreatedSessionId(id);

      const urlRes = await fetch(`/api/sessions/${id}/request-upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedFile.name,
          size: selectedFile.size,
          contentType: selectedFile.type || "video/mp4",
        }),
        credentials: "include",
      });

      if (!urlRes.ok) {
        const errData = await urlRes.json();
        throw new Error(errData.message || "Failed to get upload URL");
      }

      const { uploadURL, objectPath, traceId } = await urlRes.json();
      console.log(`[Upload:${traceId}] Got presigned URL, uploading directly to cloud storage`);

      setUploadProgress(5);

      const xhr = new XMLHttpRequest();
      
      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percent = 5 + Math.round((e.loaded / e.total) * 85);
            setUploadProgress(percent);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            console.log(`[Upload:${traceId}] Cloud storage upload complete`);
            resolve();
          } else {
            console.error(`[Upload:${traceId}] Cloud storage upload failed:`, xhr.status, xhr.responseText);
            reject(new Error("Failed to upload to cloud storage"));
          }
        });

        xhr.addEventListener("error", () => {
          console.error(`[Upload:${traceId}] Network error during cloud storage upload`);
          reject(new Error("Network error during upload"));
        });
        xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

        xhr.open("PUT", uploadURL);
        xhr.setRequestHeader("Content-Type", selectedFile.type || "video/mp4");
        xhr.send(selectedFile);
      });

      setUploadProgress(90);

      console.log(`[Upload:${traceId}] Confirming upload and starting processing`);
      const confirmRes = await fetch(`/api/sessions/${id}/confirm-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectPath,
          filename: selectedFile.name,
          size: selectedFile.size,
          contentType: selectedFile.type || "video/mp4",
        }),
        credentials: "include",
      });

      if (!confirmRes.ok) {
        const errData = await confirmRes.json();
        throw new Error(errData.message || "Failed to confirm upload");
      }

      setUploadStep("done");
      setUploadProgress(100);
      
      window.history.replaceState(null, "", `/session/${id}`);
      
    } catch (err) {
      setUploadStep("error");
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setUploadError(errorMessage);
      console.error("[Upload] Error:", errorMessage);
    }
  };

  useEffect(() => {
    const isExpiredNow = session?.videoDeletedAt || (session?.expiresAt && new Date(session.expiresAt) < new Date());
    
    const hasPreviewReady = !!(session as any)?.previewVideoPath;
    const processingPastTranscoding = session?.processingStatus && 
      ["transcribing", "scoring", "ready"].includes(session.processingStatus);
    const processingComplete = session?.processingStatus === "ready";
    
    const videoAvailable = session?.videoPath && (hasPreviewReady || processingPastTranscoding || processingComplete);
    const shouldLoadVideo = videoAvailable && !isExpiredNow;

    if (!shouldLoadVideo || !activeSessionId) {
      return;
    }

    if (videoBlobUrl) return;

    setVideoLoading(true);
    setVideoError(null);

    fetch(`/api/sessions/${activeSessionId}/video`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const contentType = res.headers.get("content-type");
          if (contentType?.includes("application/json")) {
            const data = await res.json();
            throw new Error(data.message || `Failed to load video: ${res.status}`);
          }
          throw new Error(`Failed to load video: ${res.status}`);
        }
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        setVideoBlobUrl(url);
        setVideoLoading(false);
      })
      .catch((err) => {
        console.error("Video load error:", err);
        setVideoError(err.message || "Failed to load video");
        setVideoLoading(false);
      });

    return () => {
      if (videoBlobUrl) {
        URL.revokeObjectURL(videoBlobUrl);
      }
    };
  }, [session?.id, session?.videoPath, (session as any)?.previewVideoPath, session?.processingStatus, session?.videoDeletedAt, session?.expiresAt, activeSessionId]);

  const downloadPdf = async () => {
    if (!activeSessionId) return;
    
    setDownloadingPdf(true);
    try {
      const response = await fetch(`/api/sessions/${activeSessionId}/pdf`, {
        credentials: "include",
      });
      
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const data = await response.json();
          throw new Error(data.message || "Failed to download PDF");
        }
        throw new Error("Failed to download PDF");
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const contentDisposition = response.headers.get("content-disposition");
      let filename = "video-report.pdf";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
          filename = match[1];
        }
      }
      
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF download error:", err);
      toast({
        title: "Download Failed",
        description: err instanceof Error ? err.message : "Failed to download PDF",
        variant: "destructive",
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (isNewSession && !createdSessionId) {
    return (
      <div className="container mx-auto max-w-4xl p-4 md:p-6">
        <div className="mb-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" data-testid="button-back">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-page-title">Upload Video</h1>
              <p className="text-muted-foreground">Upload a video to get AI-powered feedback on your marketing skills.</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-4">
              {!selectedFile ? (
                <div
                  className={`relative aspect-video overflow-hidden rounded-lg border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center gap-4 ${
                    isDragging 
                      ? "border-primary bg-primary/5" 
                      : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="upload-dropzone"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleInputChange}
                    className="hidden"
                    data-testid="input-video-file"
                  />
                  <Upload className={`h-16 w-16 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="text-center px-4">
                    <p className="text-lg font-medium">
                      {isDragging ? "Drop your video here" : "Drag and drop your video here"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      or click to browse your files
                    </p>
                  </div>
                  <div className="text-center text-xs text-muted-foreground space-y-1">
                    <p>Supported formats: {SUPPORTED_FORMATS}</p>
                    <p>Maximum size: 2GB</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
                    <video
                      src={localPreviewUrl || undefined}
                      controls
                      className="h-full w-full object-contain"
                      data-testid="video-preview"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3 min-w-0">
                      <File className="h-8 w-8 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate" data-testid="text-filename">{selectedFile.name}</p>
                        <p className="text-sm text-muted-foreground" data-testid="text-filesize">
                          {formatFileSize(selectedFile.size)}
                        </p>
                      </div>
                    </div>
                    {!isUploading && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={clearFile}
                        data-testid="button-clear-file"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {uploadError && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="error-message">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p>{uploadError}</p>
                </div>
              )}

              {isUploading && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg space-y-3">
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-sm font-medium">Uploading video...</p>
                  </div>
                  <div className="space-y-1">
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="text-center text-xs text-muted-foreground">{uploadProgress}%</p>
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                {selectedFile && !isUploading && (
                  <Button
                    size="lg"
                    onClick={uploadAndProcess}
                    data-testid="button-upload-process"
                  >
                    <Upload className="mr-2 h-5 w-5" />
                    Upload and Analyze
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                Session Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Session Name (optional)</Label>
                <Input
                  id="title"
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  placeholder="e.g., Product pitch practice"
                  maxLength={80}
                  disabled={isUploading}
                  data-testid="input-session-title"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to auto-generate from your transcript
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal">Video Goal</Label>
                <Select value={goalType} onValueChange={(v) => setGoalType(v as GoalType)} disabled={isUploading}>
                  <SelectTrigger id="goal" data-testid="select-goal">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="lead">Lead Capture</SelectItem>
                    <SelectItem value="education">Content Education</SelectItem>
                    <SelectItem value="recruit">Recruitment / Invite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            {tips.map((tip, index) => (
              <Card key={index}>
                <CardContent className="flex items-start gap-3 p-4">
                  <tip.icon className="h-5 w-5 shrink-0 text-primary" />
                  <p className="text-sm">{tip.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isLoading && activeSessionId) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="aspect-video w-full max-w-3xl" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if ((error || !session) && activeSessionId && uploadStep !== "uploading" && uploadStep !== "done") {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <div>
              <h2 className="font-semibold">Session not found</h2>
              <p className="text-sm text-muted-foreground">This session doesn't exist or you don't have access to it.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isExpired = session?.videoDeletedAt || (session?.expiresAt && new Date(session.expiresAt) < new Date());
  const score = session?.scoreJson as ScoreResult | null;
  const transcript = editedTranscript ?? session?.transcriptEditedText ?? session?.transcriptText ?? "";

  const copyTranscript = () => {
    navigator.clipboard.writeText(transcript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRescore = () => {
    if (editedTranscript) {
      rescoreMutation.mutate(editedTranscript);
    }
  };

  const partTitles: Record<string, string> = {
    hook: "Hook",
    setHook: "Set the Hook",
    firstCTA: "First Call to Action",
    content: "Content",
    finalCTA: "Final Call to Action",
  };

  const displayTitle = session?.title || "Practice Session";
  const canRetranscribe = !isExpired && session?.videoPath && (session?.retranscribeCount ?? 0) < 3;
  const retranscribesRemaining = 3 - (session?.retranscribeCount ?? 0);

  const handleStartEditTitle = () => {
    setEditTitle(session?.title || "");
    setIsEditingTitle(true);
  };

  const handleSaveTitle = () => {
    updateTitleMutation.mutate(editTitle);
  };

  const handleCancelEditTitle = () => {
    setEditTitle("");
    setIsEditingTitle(false);
  };

  const showUploadComplete = uploadStep === "done" && !session;

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={80}
                className="text-xl font-bold"
                data-testid="input-edit-title"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") handleCancelEditTitle();
                }}
              />
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={handleSaveTitle}
                disabled={updateTitleMutation.isPending}
                data-testid="button-save-title"
              >
                {updateTitleMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={handleCancelEditTitle}
                data-testid="button-cancel-title"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold" data-testid="text-session-title">{displayTitle}</h1>
              {session && (
                <>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    onClick={handleStartEditTitle}
                    data-testid="button-edit-title"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {session.transcriptText && (
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => generateTitleMutation.mutate()}
                      disabled={generateTitleMutation.isPending}
                      data-testid="button-generate-title"
                    >
                      {generateTitleMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      Generate Title
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
          {session?.createdAt && (
            <p className="text-sm text-muted-foreground">
              {format(new Date(session.createdAt), "MMMM d, yyyy 'at' h:mm a")}
            </p>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="mx-auto max-w-3xl">
            {showUploadComplete ? (
              <div className="flex aspect-video items-center justify-center rounded-lg bg-muted" data-testid="processing-indicator">
                <div className="text-center space-y-4 w-full max-w-md px-8">
                  <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                  <div>
                    <p className="font-medium">Upload complete! Starting processing...</p>
                    <p className="text-sm text-muted-foreground mt-1">Your video is being prepared</p>
                  </div>
                </div>
              </div>
            ) : isExpired ? (
              <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
                <div className="text-center">
                  <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
                  <p className="font-medium">Video Expired</p>
                  <p className="text-sm text-muted-foreground">This video is no longer available for playback or download</p>
                </div>
              </div>
            ) : session?.processingStatus === "failed" ? (
              <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
                <div className="text-center space-y-4">
                  <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
                  <div>
                    <p className="font-medium text-destructive">Processing Failed</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {session.processingError || "An error occurred while processing your video."}
                    </p>
                  </div>
                  <Button 
                    onClick={() => retryProcessingMutation.mutate()}
                    disabled={retryProcessingMutation.isPending}
                    data-testid="button-retry-processing"
                  >
                    {retryProcessingMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Retry Processing
                  </Button>
                </div>
              </div>
            ) : session?.processingStatus && session.processingStatus !== "ready" && !videoBlobUrl ? (
              <div className="flex aspect-video items-center justify-center rounded-lg bg-muted" data-testid="processing-indicator">
                <div className="text-center space-y-4 w-full max-w-md px-8">
                  <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                  <div>
                    <p className="font-medium" data-testid="text-processing-status">
                      {processingStepLabels[session.processingStatus as ProcessingStatus] || "Processing..."}
                    </p>
                    {session.processingMessage && (
                      <p className="text-sm text-muted-foreground mt-1">{session.processingMessage}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Progress value={session.processingProgress || 0} className="h-2" />
                    <p className="text-xs text-muted-foreground">{session.processingProgress || 0}% complete</p>
                  </div>
                  {session.processingStartedAt && (
                    <p className="text-xs text-muted-foreground">
                      Started {formatDistanceToNow(new Date(session.processingStartedAt), { addSuffix: true })}
                    </p>
                  )}
                </div>
              </div>
            ) : videoBlobUrl ? (
              <video
                key={videoBlobUrl}
                src={videoBlobUrl}
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full rounded-lg bg-black"
                data-testid="video-player"
                onError={(e) => {
                  const video = e.currentTarget;
                  const errorCode = video.error?.code;
                  const errorMessage = video.error?.message || "Unknown error";
                  console.error(`Video playback error: code=${errorCode}, message=${errorMessage}`);
                  setVideoError(`Playback error: ${errorMessage}`);
                }}
              />
            ) : videoLoading ? (
              <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
                <div className="text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  <p className="mt-2 text-sm text-muted-foreground">Loading video...</p>
                </div>
              </div>
            ) : videoError ? (
              <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
                <div className="text-center space-y-3">
                  <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
                  <p className="font-medium text-destructive">Video failed to load</p>
                  <p className="text-sm text-muted-foreground">{videoError}</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setVideoError(null);
                      setVideoBlobUrl(null);
                    }}
                    data-testid="button-reload-video"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Retry
                  </Button>
                </div>
              </div>
            ) : session?.videoPath ? (
              <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
                <div className="text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  <p className="mt-2 text-sm text-muted-foreground">Preparing video...</p>
                </div>
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
                <p className="text-muted-foreground">No video available</p>
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            {!isExpired && session?.videoPath && (
              <a href={`/api/sessions/${session.id}/download`} download>
                <Button variant="outline" data-testid="button-download">
                  <Download className="mr-2 h-4 w-4" />
                  Download Video
                </Button>
              </a>
            )}
            {session?.scoreJson && (
              <Button 
                variant="outline" 
                onClick={downloadPdf}
                disabled={downloadingPdf}
                data-testid="button-download-pdf"
              >
                {downloadingPdf ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                Download Report
              </Button>
            )}
            {session?.expiresAt && !isExpired && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Expires {formatDistanceToNow(new Date(session.expiresAt), { addSuffix: true })}
              </Badge>
            )}
            {session?.goalType && (
              <Badge variant="outline">{session.goalType}</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {session?.transcriptText && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Transcript
              </CardTitle>
              <CardDescription>Edit the transcript for more accurate scoring</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {canRetranscribe && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      disabled={retranscribeMutation.isPending}
                      data-testid="button-retranscribe"
                    >
                      {retranscribeMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="mr-2 h-4 w-4" />
                      )}
                      {retranscribeMutation.isPending ? "Processing..." : "Redo Transcript"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Retranscribe Video?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will generate a new transcript from your video and update your scores. 
                        You have {retranscribesRemaining} retranscription{retranscribesRemaining !== 1 ? "s" : ""} remaining for this session.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={retranscribeMutation.isPending}>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => retranscribeMutation.mutate()}
                        disabled={retranscribeMutation.isPending}
                      >
                        {retranscribeMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          "Retranscribe"
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {(session?.retranscribeCount ?? 0) >= 3 && !isExpired && session?.videoPath && (
                <Badge variant="secondary" className="text-xs">
                  No retranscriptions remaining
                </Badge>
              )}
              <Button variant="ghost" size="sm" onClick={copyTranscript} data-testid="button-copy-transcript">
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={transcript}
              onChange={(e) => setEditedTranscript(e.target.value)}
              className="min-h-32 font-mono text-sm"
              placeholder="No transcript available"
              data-testid="textarea-transcript"
            />
            {editedTranscript && editedTranscript !== (session?.transcriptEditedText ?? session?.transcriptText) && (
              <Button 
                onClick={handleRescore} 
                disabled={rescoreMutation.isPending}
                data-testid="button-rescore"
              >
                {rescoreMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Re-score with Edited Transcript
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {score && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Score Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-8 md:grid-cols-2">
                <div className="flex flex-col items-center justify-center">
                  <ScoreCircle score={score.totalScore} />
                  <p className="mt-2 text-lg font-semibold">Total Score</p>
                  <p className="text-sm text-muted-foreground">out of 100</p>
                </div>
                <div className="space-y-3">
                  <PartScoreBar label="Hook" score={score.partScores.hook} />
                  <PartScoreBar label="Set the Hook" score={score.partScores.setHook} />
                  <PartScoreBar label="First CTA" score={score.partScores.firstCTA} />
                  <PartScoreBar label="Content" score={score.partScores.content} />
                  <PartScoreBar label="Final CTA" score={score.partScores.finalCTA} />
                </div>
              </div>

              <div className="mt-8 grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="flex items-center gap-2 font-semibold text-green-600 dark:text-green-400">
                    <Check className="h-4 w-4" />
                    What You Did Well
                  </h4>
                  <ul className="space-y-1">
                    {score.summary.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-green-500" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="flex items-center gap-2 font-semibold text-amber-600 dark:text-amber-400">
                    <Lightbulb className="h-4 w-4" />
                    Top 3 Improvements
                  </h4>
                  <ul className="space-y-1">
                    {score.summary.topImprovements.map((s, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detailed Feedback by Part</CardTitle>
              <CardDescription>Click each section to see specific feedback and suggestions</CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full" data-testid="accordion-feedback">
                {(["hook", "setHook", "firstCTA", "content", "finalCTA"] as const).map((key) => (
                  <DetailedPartFeedback
                    key={key}
                    partKey={key}
                    title={partTitles[key]}
                    score={score.partScores[key]}
                    data={score.parts[key]}
                  />
                ))}
              </Accordion>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-5 w-5" />
                Delivery Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-3">
                <div className="rounded-lg bg-muted/50 p-4 text-center">
                  <Timer className="mx-auto h-8 w-8 text-primary mb-2" />
                  <p className="text-3xl font-bold">{score.delivery.wordsPerMinute}</p>
                  <p className="text-sm text-muted-foreground">Words per minute</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-4 text-center">
                  <MessageSquare className="mx-auto h-8 w-8 text-primary mb-2" />
                  <p className="text-3xl font-bold">{score.delivery.fillerWords.count}</p>
                  <p className="text-sm text-muted-foreground">Filler words</p>
                  {score.delivery.fillerWords.examples.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      ({score.delivery.fillerWords.examples.slice(0, 3).join(", ")})
                    </p>
                  )}
                </div>
                <div className="rounded-lg bg-muted/50 p-4 text-center">
                  <TrendingUp className="mx-auto h-8 w-8 text-primary mb-2" />
                  <p className="text-lg font-semibold">Clarity Notes</p>
                  <ul className="mt-2 text-xs text-muted-foreground space-y-1">
                    {score.delivery.clarityNotes.slice(0, 2).map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!score && session?.transcriptText && session?.processingStatus === "ready" && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <div>
              <p className="font-medium">Scoring in progress or failed</p>
              <p className="text-sm text-muted-foreground">The AI scoring may still be processing or encountered an error.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
