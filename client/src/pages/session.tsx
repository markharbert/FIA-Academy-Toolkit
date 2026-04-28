import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  Download, Copy, Check, RefreshCw, AlertCircle, Clock, 
  TrendingUp, MessageSquare, Lightbulb, AlertTriangle, Quote,
  Gauge, Timer, ArrowLeft, Loader2, Pencil, X, Sparkles, FileText,
  Upload, File, Video, Film, ChevronRight, ChevronDown, Play, Square
} from "lucide-react";
import type { Session, ScoreResult, ProcessingStatus, GoalType } from "@shared/schema";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { PipelineStatus } from "@/components/pipeline-status";

const processingStepLabels: Record<ProcessingStatus, string> = {
  queued: "Preparing your recording...",
  uploading: "Uploading...",
  transcoding: "Extracting audio...",
  transcribing: "Transcribing with AI...",
  scoring: "Analyzing with AI...",
  ready: "Processing complete!",
  failed: "Processing failed",
};

const SUPPORTED_FORMATS = ".mp4, .mov, .webm, .mkv, .avi, .wmv, .mpeg, .mpg, .m4v, .3gp";
const MAX_FILE_SIZE_MB = 2048;


function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PART_COLORS: Record<string, string> = {
  hook:     "#f97316",
  setHook:  "#a855f7",
  firstCTA: "#eab308",
  content:  "#22c55e",
  finalCTA: "#ec4899",
};

function ScoreCircle({ score, size = "lg" }: { score: number; size?: "sm" | "lg" }) {
  const radius = size === "lg" ? 54 : 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const stroke = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#f43f5e";
  const textColor = score >= 70 ? "text-emerald-500" : score >= 40 ? "text-amber-500" : "text-rose-500";
  const sizeClass = size === "lg" ? "h-32 w-32" : "h-20 w-20";
  const textSize = size === "lg" ? "text-3xl" : "text-lg";
  const viewBox = size === "lg" ? "0 0 128 128" : "0 0 80 80";
  const cx = size === "lg" ? 64 : 40;
  const cy = size === "lg" ? 64 : 40;

  return (
    <div className={`relative ${sizeClass}`}>
      <svg className={`${sizeClass} -rotate-90`} viewBox={viewBox}>
        <circle strokeWidth="8" stroke="currentColor" fill="transparent" r={radius} cx={cx} cy={cy} className="text-muted" />
        <circle strokeWidth="8" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" stroke={stroke} fill="transparent" r={radius} cx={cx} cy={cy} />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center ${textSize} font-bold ${textColor}`}>
        {score}
      </span>
    </div>
  );
}

function getScoreLevel(score: number): { label: string; textColor: string } {
  if (score >= 15) return { label: "Excellent", textColor: "text-emerald-600 dark:text-emerald-400" };
  if (score >= 10) return { label: "Good", textColor: "text-amber-600 dark:text-amber-400" };
  return { label: "Needs work", textColor: "text-rose-600 dark:text-rose-400" };
}

function PartScoreBar({ label, score, partKey }: { label: string; score: number; partKey?: string }) {
  const percentage = (score / 20) * 100;
  const { label: levelLabel, textColor } = getScoreLevel(score);
  const barColor = partKey ? PART_COLORS[partKey] : undefined;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${textColor}`}>{levelLabel}</span>
          <span className="text-xs font-bold tabular-nums">{score}/20</span>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-all" style={{ width: `${percentage}%`, background: barColor || "#6366f1" }} />
      </div>
    </div>
  );
}

const partDefinitions: Record<string, { question: string; definition: string }> = {
  hook: {
    question: "What is a Hook?",
    definition: "The opening moment that grabs attention and makes viewers want to keep watching. A strong hook creates curiosity or addresses a pain point within the first few seconds."
  },
  setHook: {
    question: "What is Setting the Hook?",
    definition: "The follow-up that builds on your hook by establishing credibility, deepening curiosity, or promising value. This keeps viewers engaged after the initial grab."
  },
  firstCTA: {
    question: "What is the First Call-to-Action?",
    definition: "An early prompt that encourages engagement, like asking viewers to comment, follow, or stay tuned. This plants a seed before delivering your main content."
  },
  content: {
    question: "What is the Content?",
    definition: "The main body of your video where you deliver value, teach something, share your story, or make your case. Good content is clear, engaging, and delivers on the hook's promise."
  },
  finalCTA: {
    question: "What is the Final Call-to-Action?",
    definition: "Your closing request that tells viewers exactly what to do next, whether it's buying, subscribing, booking a call, or taking another specific action."
  }
};

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
  const { label: levelLabel } = getScoreLevel(score);
  const partColor = PART_COLORS[partKey] || "#6366f1";
  const definition = partDefinitions[partKey];
  
  return (
    <AccordionItem value={partKey} className="border-b-0 mb-2 last:mb-0">
      <AccordionTrigger className="hover:no-underline rounded-xl border bg-card px-4 py-3 hover:bg-muted/40 transition-colors data-[state=open]:rounded-b-none data-[state=open]:border-b-0" style={{ borderLeftWidth: 4, borderLeftColor: partColor }}>
        <div className="flex items-center gap-3">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
            style={{ background: partColor }}
          >
            {score}/20
          </span>
          <span className="font-semibold">{title}</span>
          <span className="text-xs text-muted-foreground font-normal">{levelLabel}</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="border border-t-0 rounded-b-xl px-4 pb-4 pt-3 space-y-4" style={{ borderLeftWidth: 4, borderLeftColor: partColor }}>
        {definition && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 p-3">
            <div className="flex items-start gap-2.5">
              <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 mb-1">{definition.question}</p>
                <p className="text-xs text-amber-700 dark:text-amber-300/80 leading-relaxed">{definition.definition}</p>
              </div>
            </div>
          </div>
        )}
        {data.whatWorked.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
              <Check className="h-3.5 w-3.5" />
              What Worked
            </div>
            <ul className="space-y-1 pl-5">
              {data.whatWorked.map((item, i) => (
                <li key={i} className="text-sm text-muted-foreground list-disc">{item}</li>
              ))}
            </ul>
          </div>
        )}
        {data.whatMissing.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
              <AlertTriangle className="h-3.5 w-3.5" />
              What's Missing
            </div>
            <ul className="space-y-1 pl-5">
              {data.whatMissing.map((item, i) => (
                <li key={i} className="text-sm text-muted-foreground list-disc">{item}</li>
              ))}
            </ul>
          </div>
        )}
        {data.suggestions.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
              <Lightbulb className="h-3.5 w-3.5" />
              Suggestions
            </div>
            <ul className="space-y-1 pl-5">
              {data.suggestions.map((item, i) => (
                <li key={i} className="text-sm text-muted-foreground list-disc">{item}</li>
              ))}
            </ul>
          </div>
        )}
        {data.exampleLines.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <Quote className="h-3.5 w-3.5" />
              Example Lines
            </div>
            <div className="space-y-2 pl-4">
              {data.exampleLines.map((line, i) => (
                <blockquote key={i} className="border-l-2 pl-3 text-sm italic text-muted-foreground" style={{ borderColor: partColor }}>
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

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) {
    return `${secs} seconds`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getVideoQualityLabel(resolution: string | null): { label: string; isHighQuality: boolean; height: number } {
  if (!resolution) return { label: "Unknown", isHighQuality: false, height: 0 };
  
  const parts = resolution.split('x');
  if (parts.length !== 2) return { label: resolution, isHighQuality: false, height: 0 };
  
  const height = parseInt(parts[1], 10);
  
  if (height >= 2160) return { label: "4K Ultra HD", isHighQuality: true, height };
  if (height >= 1440) return { label: "2K QHD", isHighQuality: true, height };
  if (height >= 1080) return { label: "1080p Full HD", isHighQuality: true, height };
  if (height >= 720) return { label: "720p HD", isHighQuality: false, height };
  if (height >= 480) return { label: "480p SD", isHighQuality: false, height };
  return { label: `${height}p`, isHighQuality: false, height };
}

function VideoQualityInfo({ resolution, durationSeconds }: { resolution: string | null | undefined; durationSeconds: number | null | undefined }) {
  const qualityInfo = getVideoQualityLabel(resolution ?? null);
  
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 mb-6 pb-6 border-b">
      {resolution && (
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Quality:</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${qualityInfo.isHighQuality ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-500"}`}>
            {qualityInfo.label}
          </span>
        </div>
      )}
      {durationSeconds && (
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Video Length:</span>
          <span className="text-sm font-semibold">{formatDuration(durationSeconds)}</span>
        </div>
      )}
      {resolution && (
        <p className={`w-full text-center text-xs ${qualityInfo.isHighQuality ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
          {qualityInfo.isHighQuality
            ? "Great video quality! Keep recording in high definition for the best results."
            : "For best results, record and export your videos in 1080p or higher resolution."}
        </p>
      )}
    </div>
  );
}

function VideoTimeline({ sessionId, frameCount, durationSeconds, resolution }: { sessionId: string; frameCount: number; durationSeconds: number | null; resolution: string | null }) {
  const [loadedFrames, setLoadedFrames] = useState<Set<number>>(new Set());
  const [failedFrames, setFailedFrames] = useState<Set<number>>(new Set());
  
  const handleLoad = useCallback((index: number) => {
    setLoadedFrames(prev => new Set(prev).add(index));
  }, []);

  const handleError = useCallback((index: number) => {
    setFailedFrames(prev => new Set(prev).add(index));
  }, []);

  if (frameCount === 0) {
    return null;
  }

  const thumbW = 120;
  const thumbH = 68;
  const gapX = 40;
  const gapY = 48;
  const framesPerRow = 4;
  const rowCount = Math.ceil(frameCount / framesPerRow);
  
  const staggerOffset = 30;
  const totalWidth = framesPerRow * thumbW + (framesPerRow - 1) * gapX + staggerOffset;
  const totalHeight = rowCount * thumbH + (rowCount - 1) * gapY + 40;
  
  const getFrameCenter = (frameIndex: number) => {
    const row = Math.floor(frameIndex / framesPerRow);
    const col = frameIndex % framesPerRow;
    const isReversed = row % 2 === 1;
    const actualCol = isReversed ? (framesPerRow - 1 - col) : col;
    const rowOffset = isReversed ? staggerOffset : 0;
    const x = actualCol * (thumbW + gapX) + thumbW / 2 + rowOffset;
    const y = row * (thumbH + gapY) + thumbH / 2 + 20;
    return { x, y };
  };

  const buildPath = () => {
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < frameCount; i++) {
      points.push(getFrameCenter(i));
    }
    
    if (points.length === 0) return "";
    
    let d = `M ${points[0].x} ${points[0].y}`;
    
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const prevRow = Math.floor((i - 1) / framesPerRow);
      const currRow = Math.floor(i / framesPerRow);
      
      if (prevRow !== currRow) {
        const dropY = prev.y + thumbH / 2 + 8;
        const riseY = curr.y - thumbH / 2 - 8;
        const midY = (dropY + riseY) / 2;
        const curveRadius = 16;
        
        d += ` L ${prev.x} ${dropY}`;
        d += ` Q ${prev.x} ${midY} ${(prev.x + curr.x) / 2} ${midY}`;
        d += ` Q ${curr.x} ${midY} ${curr.x} ${riseY}`;
        d += ` L ${curr.x} ${curr.y}`;
      } else {
        d += ` L ${curr.x} ${curr.y}`;
      }
    }
    
    return d;
  };

  const pathD = buildPath();

  const frames = Array.from({ length: frameCount }, (_, i) => i);
  const rows: number[][] = [];
  for (let i = 0; i < frames.length; i += framesPerRow) {
    rows.push(frames.slice(i, i + framesPerRow));
  }

  const qualityInfo = getVideoQualityLabel(resolution);

  return (
    <div className="hidden md:block" data-testid="video-timeline">
      <div className="flex flex-wrap items-center justify-center gap-4 mb-4">
        {resolution && (
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Quality:</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${qualityInfo.isHighQuality ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-500"}`}>
              {qualityInfo.label}
            </span>
          </div>
        )}
        {durationSeconds && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Duration:</span>
            <span className="text-sm font-semibold">{formatDuration(durationSeconds)}</span>
          </div>
        )}
        {resolution && (
          <p className={`w-full text-center text-xs ${qualityInfo.isHighQuality ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {qualityInfo.isHighQuality
              ? "Great video quality! Keep recording in high definition for the best results."
              : "For best results, record and export your videos in 1080p or higher resolution."}
          </p>
        )}
      </div>
      
      <div className="relative" style={{ width: totalWidth, margin: '0 auto' }}>
        <svg 
          width={totalWidth} 
          height={totalHeight} 
          className="absolute top-0 left-0 pointer-events-none"
          style={{ zIndex: 0 }}
        >
          <path
            d={pathD}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary/50"
          />
        </svg>
        
        <div className="relative pt-5 pb-6" style={{ zIndex: 1 }}>
          {rows.map((row, rowIndex) => {
            const isReversed = rowIndex % 2 === 1;
            
            return (
              <div 
                key={rowIndex} 
                className={`flex ${isReversed ? 'flex-row-reverse' : 'flex-row'}`}
                style={{ 
                  gap: gapX, 
                  marginBottom: rowIndex < rows.length - 1 ? gapY : 0,
                  marginLeft: isReversed ? staggerOffset : 0
                }}
              >
                {row.map((frameIndex, colIndex) => {
                  const isFirstFrame = frameIndex === 0;
                  const isLastFrame = frameIndex === frameCount - 1;
                  const isLoading = !loadedFrames.has(frameIndex) && !failedFrames.has(frameIndex);
                  const hasFailed = failedFrames.has(frameIndex);
                  const frameTimestamp = durationSeconds 
                    ? (frameIndex + 1) * (durationSeconds / (frameCount + 1))
                    : null;
                  
                  return (
                    <div key={frameIndex} className="relative" data-testid={`timeline-frame-${frameIndex}`}>
                      <div className="relative overflow-hidden rounded-lg border-2 border-border bg-muted shadow-sm">
                        {isLoading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-muted z-10">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                        {hasFailed ? (
                          <div style={{ width: thumbW, height: thumbH }} className="flex items-center justify-center">
                            <Video className="h-5 w-5 text-muted-foreground opacity-50" />
                          </div>
                        ) : (
                          <img
                            src={`/api/sessions/${sessionId}/timeline/${frameIndex}`}
                            alt={`Frame ${frameIndex + 1}`}
                            style={{ width: thumbW, height: thumbH }}
                            className={`object-cover transition-opacity ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                            loading="lazy"
                            onLoad={() => handleLoad(frameIndex)}
                            onError={() => handleError(frameIndex)}
                          />
                        )}
                        {frameTimestamp !== null && (
                          <div className="absolute top-1 right-1 bg-black/70 text-white text-xs font-semibold px-1.5 py-0.5 rounded">
                            {formatTimestamp(frameTimestamp)}
                          </div>
                        )}
                      </div>
                      {isFirstFrame && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full pr-3 text-sm font-extrabold text-green-600 dark:text-green-500 flex items-center gap-1.5 whitespace-nowrap">
                          <Play className="h-4 w-4 fill-green-600 dark:fill-green-500" />
                          Start
                        </div>
                      )}
                      {isLastFrame && (
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-3 text-sm font-extrabold text-red-600 dark:text-red-500 flex items-center gap-1.5 whitespace-nowrap">
                          End
                          <Square className="h-4 w-4 fill-red-600 dark:fill-red-500" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function SessionPage() {
  const [matchWithId, paramsWithId] = useRoute("/video-score-upload/:id");
  const [matchWithoutId] = useRoute("/video-score-upload");
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
  const [openFeedbackSections, setOpenFeedbackSections] = useState<string[]>([]);

  const allFeedbackKeys = ["hook", "setHook", "firstCTA", "content", "finalCTA"];
  const allSectionsOpen = allFeedbackKeys.every(key => openFeedbackSections.includes(key));
  
  const toggleAllSections = () => {
    if (allSectionsOpen) {
      setOpenFeedbackSections([]);
    } else {
      setOpenFeedbackSections([...allFeedbackKeys]);
    }
  };

  const isUploading = uploadStep === "uploading";
  const activeSessionId = createdSessionId || sessionId;

  const isProcessingActive = (data: Session | undefined) => {
    if (!data) return activeSessionId ? true : false;
    const status = data.processingStatus;
    if (!status) return !data.transcriptText;
    if (status === "failed") return false;
    if (status === "ready") return false;
    return true;
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
      
      window.history.replaceState(null, "", `/video-score-upload/${id}`);
      
    } catch (err) {
      setUploadStep("error");
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setUploadError(errorMessage);
      console.error("[Upload] Error:", errorMessage);
    }
  };

  if (isNewSession && (!createdSessionId || uploadStep === "uploading")) {
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
              <h1 className="text-2xl font-bold" data-testid="text-page-title">Add Video</h1>
              <p className="text-muted-foreground">Upload a video to get AI-powered feedback.</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-4">
              <div className="w-full">
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
                    <div className="flex items-center justify-between gap-4 p-4 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                          <Video className="h-6 w-6 text-primary" />
                        </div>
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
                  )}

                  {isUploading && (
                    <div className="mt-4 p-6 bg-muted/50 rounded-lg space-y-4">
                      <div className="flex items-center justify-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-lg font-medium">Uploading video...</p>
                      </div>
                      <div className="space-y-2 max-w-md mx-auto">
                        <Progress value={uploadProgress} className="h-3" />
                        <p className="text-center text-sm text-muted-foreground">{uploadProgress}%</p>
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
              </div>

              {uploadError && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="error-message">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p>{uploadError}</p>
                </div>
              )}
            </CardContent>
          </Card>
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

  const isExpired = session?.expiresAt && new Date(session.expiresAt) < new Date();
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
    <div className="min-h-full flex flex-col">
      {/* ── Dark hero header ── */}
      <div className="bg-sidebar text-sidebar-foreground px-6 py-5 shrink-0">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Link href="/video-score">
            <button className="flex items-center gap-1 text-white/50 hover:text-white text-sm transition-colors shrink-0" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
              All Videos
            </button>
          </Link>
          <div className="flex-1 min-w-0">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={80}
                  className="text-base font-bold bg-white/10 border-white/20 text-white placeholder:text-white/40"
                  data-testid="input-edit-title"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTitle();
                    if (e.key === "Escape") handleCancelEditTitle();
                  }}
                />
                <Button size="icon" variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10 shrink-0" onClick={handleSaveTitle} disabled={updateTitleMutation.isPending} data-testid="button-save-title">
                  {updateTitleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
                <Button size="icon" variant="ghost" className="text-white/70 hover:text-white hover:bg-white/10 shrink-0" onClick={handleCancelEditTitle} data-testid="button-cancel-title">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-base font-bold text-white truncate" data-testid="text-session-title">{displayTitle}</h1>
                {session && (
                  <>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-white/40 hover:text-white hover:bg-white/10 shrink-0" onClick={handleStartEditTitle} data-testid="button-edit-title">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {session.transcriptText && (
                      <Button size="sm" variant="ghost" className="text-white/60 hover:text-white hover:bg-white/10 h-7 text-xs shrink-0" onClick={() => generateTitleMutation.mutate()} disabled={generateTitleMutation.isPending} data-testid="button-generate-title">
                        {generateTitleMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                        Generate Title
                      </Button>
                    )}
                  </>
                )}
              </div>
            )}
            {session?.createdAt && (
              <p className="text-xs text-white/40 mt-0.5">
                {format(new Date(session.createdAt), "MMMM d, yyyy 'at' h:mm a")}
              </p>
            )}
          </div>
          {score && (
            <div className="shrink-0 flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className={`text-2xl font-bold ${score.totalScore >= 70 ? "text-emerald-400" : score.totalScore >= 40 ? "text-amber-400" : "text-rose-400"}`}>{score.totalScore}</div>
                <div className="text-xs text-white/40">out of 100</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-auto">
      <div className="container mx-auto max-w-5xl px-4 py-6 space-y-6">

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-violet-500 via-blue-500 to-emerald-500" />
        <div className="p-6">
          <div className="mx-auto max-w-3xl">
            {showUploadComplete ? (
              <div className="flex aspect-[3/2] items-center justify-center rounded-lg bg-muted" data-testid="processing-indicator">
                <div className="text-center space-y-4 w-full max-w-md px-8">
                  <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                  <div>
                    <p className="font-medium">Processing your video...</p>
                    <p className="text-sm text-muted-foreground mt-1">Extracting audio and preparing for transcription</p>
                  </div>
                  <div className="space-y-2">
                    <Progress value={5} className="h-3" />
                    <p className="text-sm text-muted-foreground">5%</p>
                  </div>
                </div>
              </div>
            ) : isExpired ? (
              <div className="flex aspect-[3/2] items-center justify-center rounded-lg bg-muted">
                <div className="text-center">
                  <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
                  <p className="font-medium">Session Expired</p>
                  <p className="text-sm text-muted-foreground">This session has expired and is no longer available</p>
                </div>
              </div>
            ) : session?.processingStatus === "failed" ? (
              <div className="flex aspect-[3/2] items-center justify-center rounded-lg bg-muted">
                <div className="text-center space-y-4">
                  <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
                  <div>
                    <p className="font-medium text-destructive">Processing Failed</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {session.processingError || "An error occurred while processing your recording."}
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
            ) : (() => {
              const isStillProcessing = session?.processingStatus && 
                !["ready", "failed"].includes(session.processingStatus);
              
              if (isStillProcessing) {
                return (
                  <div className="flex aspect-[3/2] items-center justify-center rounded-lg bg-muted" data-testid="processing-indicator">
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
                        <Progress value={session.processingProgress || 0} className="h-3" />
                        <p className="text-sm text-muted-foreground">{session.processingProgress || 0}%</p>
                      </div>
                      {session.processingStartedAt && (
                        <p className="text-xs text-muted-foreground">
                          Started {formatDistanceToNow(new Date(session.processingStartedAt), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  </div>
                );
              }
              
              const hasTimeline = session?.timelineFrames && session.timelineFrames.length > 0;
              const hasPoster = (session as any)?.previewPosterPath;
              
              return (
                <div className="space-y-4">
                  {hasTimeline ? (
                    <div className="-mx-6 -mt-6 mb-4 px-6 pt-8 pb-4 bg-muted/30">
                      <VideoTimeline sessionId={session!.id} frameCount={session!.timelineFrames!.length} durationSeconds={session!.durationSeconds} resolution={(session as any)?.finalVideoResolution} />
                      <div className="md:hidden">
                        {hasPoster && (
                          <img 
                            src={`/api/sessions/${session?.id}/poster`}
                            alt="Video thumbnail"
                            className="w-full aspect-video object-cover rounded-lg"
                            data-testid="img-video-poster"
                          />
                        )}
                      </div>
                    </div>
                  ) : hasPoster ? (
                    <div className="-mx-6 -mt-6 mb-4">
                      <img 
                        src={`/api/sessions/${session?.id}/poster`}
                        alt="Video thumbnail"
                        className="w-full aspect-video object-cover"
                        data-testid="img-video-poster"
                      />
                    </div>
                  ) : null}
                  <div className="flex items-center gap-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500">
                      <Check className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-green-700 dark:text-green-300">Transcript ready</p>
                      <p className="text-sm text-green-600/80 dark:text-green-400/80">Review your transcript and score below</p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          
          {session && session.processingStatus && session.processingStatus !== "ready" && (
            <div className="mt-6 border-t pt-4">
              <PipelineStatus
                transcriptStatus={(session as any)?.transcriptStatus || null}
                scoreStatus={(session as any)?.scoreStatus || null}
                processingStatus={session.processingStatus}
                processingProgress={session.processingProgress || 0}
              />
            </div>
          )}
        </div>
      </div>

      {session?.transcriptText && (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-blue-500 to-violet-500" />
          <div className="px-5 py-4 flex items-center justify-between gap-4 border-b">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-blue-500" />
              <span className="font-semibold text-sm">Transcript</span>
              <span className="text-xs text-muted-foreground">Download or copy for future use</span>
            </div>
            <div className="flex items-center gap-1">
              <a href={`/api/sessions/${session.id}/transcript.txt`} download>
                <Button variant="ghost" size="sm" className="h-8 text-xs" data-testid="button-download-transcript">
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download
                </Button>
              </a>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={copyTranscript} data-testid="button-copy-transcript">
                {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <Textarea
              value={transcript}
              onChange={(e) => setEditedTranscript(e.target.value)}
              className="min-h-32 font-mono text-sm"
              placeholder="No transcript available"
              data-testid="textarea-transcript"
            />
            {editedTranscript && editedTranscript !== (session?.transcriptEditedText ?? session?.transcriptText) && (
              <Button onClick={handleRescore} disabled={rescoreMutation.isPending} data-testid="button-rescore">
                {rescoreMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Re-score with Edited Transcript
              </Button>
            )}
          </div>
        </div>
      )}

      {score && (
        <>
          {/* Score Summary */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
            <div className="px-5 py-4 border-b flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <span className="font-semibold text-sm">Score Summary</span>
            </div>
            <div className="p-5">
              <div className="grid gap-8 md:grid-cols-2">
                <div className="flex flex-col items-center justify-center gap-1">
                  <ScoreCircle score={score.totalScore} />
                  <p className="mt-1 text-base font-semibold">Total Score</p>
                  <p className="text-xs text-muted-foreground">out of 100</p>
                </div>
                <div className="space-y-3.5">
                  <PartScoreBar label="Hook"             score={score.partScores.hook}     partKey="hook" />
                  <PartScoreBar label="Set the Hook"     score={score.partScores.setHook}  partKey="setHook" />
                  <PartScoreBar label="First CTA"        score={score.partScores.firstCTA} partKey="firstCTA" />
                  <PartScoreBar label="Content"          score={score.partScores.content}  partKey="content" />
                  <PartScoreBar label="Final CTA"        score={score.partScores.finalCTA} partKey="finalCTA" />
                </div>
              </div>
              <div className="mt-8 grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                    <Check className="h-3.5 w-3.5" />
                    What You Did Well
                  </h4>
                  <ul className="space-y-1.5">
                    {score.summary.strengths.map((s, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                    <Lightbulb className="h-3.5 w-3.5" />
                    Top 3 Improvements
                  </h4>
                  <ul className="space-y-1.5">
                    {score.summary.topImprovements.map((s, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Detailed Feedback */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-orange-500 via-violet-500 to-pink-500" />
            <div className="px-5 py-4 border-b flex items-center justify-between gap-4">
              <div>
                <span className="font-semibold text-sm">Detailed Feedback by Part</span>
                <p className="text-xs text-muted-foreground mt-0.5">Click each section to see specific feedback and suggestions</p>
              </div>
              <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" onClick={toggleAllSections} data-testid="button-toggle-all-sections">
                {allSectionsOpen ? "Collapse All" : "Expand All"}
              </Button>
            </div>
            <div className="p-5">
              <Accordion type="multiple" className="w-full space-y-0" value={openFeedbackSections} onValueChange={setOpenFeedbackSections} data-testid="accordion-feedback">
                {(["hook", "setHook", "firstCTA", "content", "finalCTA"] as const).map((key) => (
                  <DetailedPartFeedback key={key} partKey={key} title={partTitles[key]} score={score.partScores[key]} data={score.parts[key]} />
                ))}
              </Accordion>
            </div>
          </div>

          {/* AI Coach Summary */}
          {score.summary.overallSummary && (
            <div className="rounded-xl border bg-card shadow-sm overflow-hidden" style={{ borderColor: "hsl(var(--primary) / 0.2)" }}>
              <div className="h-1 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500" />
              <div className="px-5 py-4 border-b">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  <span className="font-semibold text-sm">AI Coach Summary</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Personalized feedback to help you improve</p>
              </div>
              <div className="p-5 space-y-5">
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {score.summary.overallSummary.split('\n\n').map((paragraph, i) => (
                    <p key={i} className="text-muted-foreground leading-relaxed mb-4 last:mb-0">{paragraph}</p>
                  ))}
                </div>
                {score.summary.actionChecklist && score.summary.actionChecklist.length > 0 && (
                  <div className="border-t pt-5">
                    <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      <Check className="h-3.5 w-3.5 text-primary" />
                      Your Action Checklist
                    </h4>
                    <ul className="space-y-2">
                      {score.summary.actionChecklist.map((item, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/30 mt-0.5">
                            <span className="text-xs font-bold text-primary">{i + 1}</span>
                          </div>
                          <span className="text-sm text-muted-foreground">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Delivery Metrics */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500" />
            <div className="px-5 py-4 border-b flex items-center gap-2">
              <Gauge className="h-4 w-4 text-cyan-500" />
              <span className="font-semibold text-sm">Delivery Metrics</span>
            </div>
            <div className="p-5">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-violet-500/5 border border-violet-500/10 p-4 text-center">
                  <div className="mx-auto mb-2 w-10 h-10 flex items-center justify-center rounded-full bg-violet-500/10">
                    <Timer className="h-5 w-5 text-violet-500" />
                  </div>
                  <p className="text-3xl font-bold text-violet-600 dark:text-violet-400">{score.delivery.wordsPerMinute}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Words per minute</p>
                </div>
                <div className="rounded-xl bg-amber-500/5 border border-amber-500/10 p-4 text-center">
                  <div className="mx-auto mb-2 w-10 h-10 flex items-center justify-center rounded-full bg-amber-500/10">
                    <MessageSquare className="h-5 w-5 text-amber-500" />
                  </div>
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{score.delivery.fillerWords.count}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Filler words</p>
                  {score.delivery.fillerWords.examples.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      ({score.delivery.fillerWords.examples.slice(0, 3).join(", ")})
                    </p>
                  )}
                </div>
                <div className="rounded-xl bg-teal-500/5 border border-teal-500/10 p-4 text-center">
                  <div className="mx-auto mb-2 w-10 h-10 flex items-center justify-center rounded-full bg-teal-500/10">
                    <TrendingUp className="h-5 w-5 text-teal-500" />
                  </div>
                  <p className="text-sm font-semibold text-teal-600 dark:text-teal-400">Clarity Notes</p>
                  <ul className="mt-2 text-xs text-muted-foreground space-y-1">
                    {score.delivery.clarityNotes.slice(0, 2).map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {!score && session?.transcriptText && session?.processingStatus === "ready" && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Scoring in progress or failed</p>
            <p className="text-xs text-muted-foreground">The AI scoring may still be processing or encountered an error.</p>
          </div>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
