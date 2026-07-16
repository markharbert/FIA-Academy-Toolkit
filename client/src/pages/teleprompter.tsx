import { useState, useEffect, useRef, useMemo } from "react";
// (initial auto-select uses a ref so explicit "New script" / delete actions
//  aren't reverted by the effect)
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  Save,
  Play,
  FileText,
  Loader2,
  MonitorPlay,
  Download,
  Video,
  Clock,
  Sparkles,
  Eye,
  Star,
  BarChart2,
  RefreshCw,
  Check,
  AlertTriangle,
  Quote,
  Lightbulb,
  TrendingUp,
  HelpCircle,
  ChevronRight,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { openTeleprompter, buildTeleprompterHtml } from "@/lib/teleprompter";
import jsPDF from "jspdf";
import type { TeleprompterScript, TeleprompterRecording, ScoreResult, GoalType } from "@shared/schema";
import { cn } from "@/lib/utils";

const MAX_SCRIPT_CHARS = 100_000;
const MAX_FILE_BYTES = 500_000;

// ── Score report helpers ──────────────────────────────────────────────────────

const PART_COLORS: Record<string, string> = {
  hook: "#6366f1",
  setHook: "#8b5cf6",
  firstCTA: "#ec4899",
  content: "#f59e0b",
  finalCTA: "#10b981",
};

const partDefinitions: Record<string, { question: string; definition: string }> = {
  hook: { question: "What is a Hook?", definition: "The opening moment that grabs attention and makes viewers want to keep watching." },
  setHook: { question: "What is Setting the Hook?", definition: "The follow-up that builds on your hook by establishing credibility or deepening curiosity." },
  firstCTA: { question: "What is the First CTA?", definition: "An early prompt that encourages engagement before delivering your main content." },
  content: { question: "What is the Content?", definition: "The main body where you deliver value, teach, share your story, or make your case." },
  finalCTA: { question: "What is the Final CTA?", definition: "Your closing request that tells viewers exactly what to do next." },
};

function TakeScoreCircle({ score }: { score: number }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const stroke = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#f43f5e";
  const textColor = score >= 70 ? "text-emerald-500" : score >= 40 ? "text-amber-500" : "text-rose-500";
  return (
    <div className="relative h-24 w-24">
      <svg className="h-24 w-24 -rotate-90" viewBox="0 0 104 104">
        <circle strokeWidth="7" stroke="currentColor" fill="transparent" r={radius} cx="52" cy="52" className="text-muted" />
        <circle strokeWidth="7" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" stroke={stroke} fill="transparent" r={radius} cx="52" cy="52" />
      </svg>
      <span className={cn("absolute inset-0 flex items-center justify-center text-2xl font-bold", textColor)}>{score}</span>
    </div>
  );
}

function TakePartBar({ label, score, partKey }: { label: string; score: number; partKey: string }) {
  const pct = (score / 20) * 100;
  const color = PART_COLORS[partKey] || "#6366f1";
  const levelLabel = score >= 15 ? "Excellent" : score >= 10 ? "Good" : "Needs work";
  const levelColor = score >= 15 ? "text-emerald-600 dark:text-emerald-400" : score >= 10 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className={cn("font-semibold", levelColor)}>{levelLabel}</span>
          <span className="font-bold tabular-nums text-foreground">{score}/20</span>
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function TakePartDetail({
  partKey, data,
}: {
  partKey: string;
  data: { whatWorked: string[]; whatMissing: string[]; suggestions: string[]; exampleLines: string[] };
}) {
  const color = PART_COLORS[partKey] || "#6366f1";
  return (
    <div className="space-y-3">
      {(data.whatMissing.length > 0 || data.suggestions.length > 0) && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
            <Lightbulb className="h-3 w-3" />How to Improve
          </div>
          <ul className="space-y-1 pl-4">
            {[...data.whatMissing, ...data.suggestions].map((item, i) => (
              <li key={i} className="text-xs text-muted-foreground list-disc">{item}</li>
            ))}
          </ul>
        </div>
      )}
      {data.exampleLines.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <Quote className="h-3 w-3" />Try Something Like This
          </div>
          <div className="space-y-2 pl-3">
            {data.exampleLines.slice(0, 2).map((line, i) => (
              <blockquote key={i} className="border-l-2 pl-2.5 text-xs italic text-muted-foreground" style={{ borderColor: color }}>"{line}"</blockquote>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function formatRelative(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function estimateMinutes(words: number): string {
  if (words === 0) return "0:00";
  const minutes = words / 150; // ~150 wpm conversational pace
  const totalSeconds = Math.round(minutes * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TeleprompterPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showHelp, setShowHelp] = useState(false);
  const [modalSrc, setModalSrc] = useState<string | null>(null);
  const [modalPos, setModalPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [bulletPoints, setBulletPoints] = useState("");
  const [editorTab, setEditorTab] = useState<"script" | "bullets">("script");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingDeleteRecordingId, setPendingDeleteRecordingId] = useState<string | null>(null);
  const [previewRec, setPreviewRec] = useState<TeleprompterRecording | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [transcribingIds, setTranscribingIds] = useState<Set<string>>(new Set());
  const [transcriptModal, setTranscriptModal] = useState<{
    open: boolean;
    title: string;
    text: string;
    recordingId: string;
    durationSeconds: number | null;
    scoreJson: ScoreResult | null;
    scoreGoalType: GoalType | null;
  }>({ open: false, title: "", text: "", recordingId: "", durationSeconds: null, scoreJson: null, scoreGoalType: null });
  const [isScoring, setIsScoring] = useState(false);
  const [dirty, setDirty] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [showDirtyDialog, setShowDirtyDialog] = useState(false);
  const [dirtyDialogAction, setDirtyDialogAction] = useState<(() => void) | null>(null);

  // Fetch recording as a blob when preview opens — one continuous download instead
  // of the browser making multiple range requests hunting for the moov atom.
  useEffect(() => {
    if (!previewRec) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewUrl(null);
    setPreviewPlaying(false);
    fetch(`/api/teleprompter/recordings/${previewRec.id}/stream`, { credentials: "include" })
      .then((r) => r.blob())
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setPreviewLoading(false);
      })
      .catch(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [previewRec?.id]);

  const { data: scripts, isLoading } = useQuery<TeleprompterScript[]>({
    queryKey: ["/api/teleprompter/scripts"],
  });

  const selected = useMemo(
    () => scripts?.find((s) => s.id === selectedId) ?? null,
    [scripts, selectedId],
  );

  const search = useSearch();

  // Auto-select on first successful load. If a ?script=id param is present
  // (e.g. arriving from the script editor flow), select that script; otherwise
  // fall back to the most recently saved script.
  const didInitialSelectRef = useRef(false);
  useEffect(() => {
    if (didInitialSelectRef.current) return;
    if (!scripts) return;
    didInitialSelectRef.current = true;
    if (scripts.length > 0) {
      const params = new URLSearchParams(search);
      const paramId = params.get("script");
      const target = (paramId ? scripts.find((s) => s.id === paramId) : null) ?? scripts[0];
      setSelectedId(target.id);
      setTitle(target.title);
      setContent(target.content);
      setBulletPoints(target.bulletPoints || "");
      setDirty(false);
    }
  }, [scripts]);

  // postMessage handling is consolidated in the effect below (upload-request + recording-saved)

  // Auto-save: 5 seconds after the last change, silently PATCH the existing script.
  // Only runs for scripts that already exist (selectedId set). New scripts require
  // an explicit "Save to library" so the user can give them a title first.
  useEffect(() => {
    if (!dirty || !selectedId || !content.trim()) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      setAutoSaveStatus("saving");
      try {
        await apiRequest("PATCH", `/api/teleprompter/scripts/${selectedId}`, {
          title: title.trim() || "Untitled script",
          content: content.trim(),
          bulletPoints: bulletPoints.trim() || null,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/teleprompter/scripts"] });
        setDirty(false);
        setAutoSaveStatus("saved");
        setTimeout(() => setAutoSaveStatus("idle"), 2500);
      } catch {
        setAutoSaveStatus("idle");
      }
    }, 5000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [dirty, selectedId, title, content, bulletPoints]);

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; content: string; bulletPoints?: string | null }) => {
      const res = await apiRequest("POST", "/api/teleprompter/scripts", data);
      return res.json() as Promise<TeleprompterScript>;
    },
    onSuccess: (script) => {
      queryClient.invalidateQueries({ queryKey: ["/api/teleprompter/scripts"] });
      setSelectedId(script.id);
      setDirty(false);
      toast({ title: "Script saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; title: string; content: string; bulletPoints?: string | null }) => {
      const res = await apiRequest("PATCH", `/api/teleprompter/scripts/${data.id}`, {
        title: data.title,
        content: data.content,
        bulletPoints: data.bulletPoints ?? null,
      });
      return res.json() as Promise<TeleprompterScript>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teleprompter/scripts"] });
      setDirty(false);
      setAutoSaveStatus("saved");
      setTimeout(() => setAutoSaveStatus("idle"), 2500);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/teleprompter/scripts/${id}`, {});
      return res.json();
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/teleprompter/scripts"] });
      if (selectedId === id) {
        setSelectedId(null);
        setTitle("");
        setContent("");
        setDirty(false);
      }
      setPendingDeleteId(null);
      toast({ title: "Script deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    },
  });

  const confirmOrProceed = (action: () => void) => {
    if (dirty) {
      setDirtyDialogAction(() => action);
      setShowDirtyDialog(true);
    } else {
      action();
    }
  };

  const handleNewScript = () => {
    confirmOrProceed(() => {
      setSelectedId(null);
      setTitle("");
      setContent("");
      setBulletPoints("");
      setEditorTab("script");
      setDirty(false);
    });
  };

  const handleSelect = (script: TeleprompterScript) => {
    if (script.id === selectedId) return;
    confirmOrProceed(() => {
      setSelectedId(script.id);
      setTitle(script.title);
      setContent(script.content);
      setBulletPoints(script.bulletPoints || "");
      setDirty(false);
    });
  };

  const performSave = (): Promise<TeleprompterScript | null> => {
    const trimmedTitle = title.trim() || "Untitled script";
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      toast({
        title: "Add some text first",
        description: "Paste or upload your script before saving.",
        variant: "destructive",
      });
      return Promise.resolve(null);
    }
    if (selectedId) {
      return updateMutation.mutateAsync({
        id: selectedId,
        title: trimmedTitle,
        content: trimmedContent,
        bulletPoints: bulletPoints.trim() || null,
      });
    }
    return createMutation.mutateAsync({
      title: trimmedTitle,
      content: trimmedContent,
      bulletPoints: bulletPoints.trim() || null,
    });
  };

  const handleSave = async () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setAutoSaveStatus("idle");
    await performSave();
  };

  const handleOpenTeleprompter = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      toast({
        title: "Add some text first",
        description: "Paste or upload your script before opening the teleprompter.",
        variant: "destructive",
      });
      return;
    }
    // Always save (or update) before launching so the script is persisted to the user's account.
    let scriptToOpen: TeleprompterScript | null = selected;
    if (dirty || !selectedId) {
      scriptToOpen = await performSave();
      if (!scriptToOpen) return;
    }
    const opened = openTeleprompter({
      title: scriptToOpen?.title || title.trim() || "Untitled script",
      sections: [{ text: scriptToOpen?.content || trimmedContent }],
      scriptId: scriptToOpen?.id,
      bulletPoints: scriptToOpen?.bulletPoints || bulletPoints.trim() || undefined,
    });
    if (!opened) {
      toast({
        title: "Popup blocked",
        description: "Your browser blocked the teleprompter window. Click the popup icon in your address bar to allow it, then try again.",
        variant: "destructive",
        duration: 8000,
      });
    }
  };

  const handleOpenModal = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      toast({ title: "Add some text first", description: "Paste or upload your script first.", variant: "destructive" });
      return;
    }
    let scriptToOpen: TeleprompterScript | null = selected;
    if (dirty || !selectedId) {
      scriptToOpen = await performSave();
      if (!scriptToOpen) return;
    }
    const html = buildTeleprompterHtml({
      title: scriptToOpen?.title || title.trim() || "Untitled script",
      sections: [{ text: scriptToOpen?.content || trimmedContent }],
      scriptId: scriptToOpen?.id,
      bulletPoints: scriptToOpen?.bulletPoints || bulletPoints.trim() || undefined,
    });
    if (!html) return;
    const mw = window.innerWidth * 0.75;
    const mh = window.innerHeight * 0.95;
    setModalPos({
      x: Math.round((window.innerWidth - mw) / 2),
      y: Math.round((window.innerHeight - mh) / 2),
    });
    if (modalSrc) URL.revokeObjectURL(modalSrc);
    const blob = new Blob([html], { type: "text/html" });
    setModalSrc(URL.createObjectURL(blob));
  };

  const handleModalDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragOffsetRef.current = { x: e.clientX - modalPos.x, y: e.clientY - modalPos.y };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      setModalPos({ x: e.clientX - dragOffsetRef.current.x, y: e.clientY - dragOffsetRef.current.y });
    };
    const onUp = () => setIsDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      if (e.data?.type === "teleprompter-recording-saved") {
        queryClient.invalidateQueries({ queryKey: ["/api/teleprompter/recordings"] });
      }

      if (e.data?.type === "teleprompter-upload-request") {
        const { blob, title, scriptId, durationSeconds, format, mimeType } = e.data;
        const source = e.source as Window | null;
        const reply = (payload: object) => { try { source?.postMessage(payload, "*"); } catch (_) {} };
        try {
          const ext = (mimeType && mimeType.includes("mp4")) ? ".mp4" : ".webm";
          const fd = new FormData();
          fd.append("video", blob, "recording" + ext);
          fd.append("title", title || "Untitled Take");
          if (scriptId) fd.append("scriptId", scriptId);
          fd.append("durationSeconds", String(durationSeconds || 0));
          fd.append("format", format || "landscape");
          const res = await fetch("/api/teleprompter/recordings", {
            method: "POST",
            body: fd,
            credentials: "include",
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            reply({ type: "teleprompter-upload-result", success: false, error: `Upload failed (${res.status})${errText ? ": " + errText.slice(0, 120) : ""}` });
            return;
          }
          const data = await res.json();
          queryClient.invalidateQueries({ queryKey: ["/api/teleprompter/recordings"] });
          reply({ type: "teleprompter-upload-result", success: true, data });
        } catch (err: any) {
          reply({ type: "teleprompter-upload-result", success: false, error: err?.message || "Upload failed" });
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast({
        title: "File too large",
        description: `Maximum file size is ${Math.round(MAX_FILE_BYTES / 1000)}KB.`,
        variant: "destructive",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result || "");
      const truncated = text.slice(0, MAX_SCRIPT_CHARS);
      setContent(truncated);
      if (!title.trim()) {
        setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 120));
      }
      setDirty(true);
      toast({
        title: "File loaded",
        description: `${truncated.length.toLocaleString()} characters imported.`,
      });
    };
    reader.onerror = () => {
      toast({ title: "Failed to read file", variant: "destructive" });
    };
    reader.readAsText(file);
  };

  const { data: scoreUsage } = useQuery<{ used: number; limit: number | null; isAdmin: boolean }>({
    queryKey: ["/api/teleprompter/score-usage"],
    refetchOnWindowFocus: false,
  });

  const { data: recordings, isLoading: recordingsLoading } = useQuery<TeleprompterRecording[]>({
    queryKey: ["/api/teleprompter/recordings"],
  });

  // Only show takes that belong to the currently selected script
  const scriptRecordings = recordings?.filter((r) => r.scriptId === selectedId) ?? [];

  const deleteRecordingMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/teleprompter/recordings/${id}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teleprompter/recordings"] });
      toast({ title: "Recording deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete recording", description: err.message, variant: "destructive" });
    },
  });

  const generateBulletsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/teleprompter/scripts/generate-bullets", { content });
      return res.json() as Promise<{ bulletPoints: string }>;
    },
    onSuccess: (data) => {
      setBulletPoints(data.bulletPoints);
      setDirty(true);
      toast({ title: "Bullet points generated", description: "Review and edit them as needed." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to generate bullets", description: err.message, variant: "destructive" });
    },
  });

  const wc = wordCount(content);
  const reading = estimateMinutes(wc);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDuration(seconds: number | null | undefined): string {
    if (!seconds) return "";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  async function handleGetTranscript(rec: TeleprompterRecording) {
    // If transcript already exists, show it immediately in the modal
    if (rec.transcriptText) {
      setTranscriptModal({
        open: true,
        title: rec.title,
        text: rec.transcriptText,
        recordingId: rec.id,
        durationSeconds: rec.durationSeconds ?? null,
        scoreJson: (rec.scoreJson as ScoreResult) ?? null,
        scoreGoalType: (rec.scoreGoalType as GoalType) ?? null,
      });
      return;
    }
    setTranscribingIds((prev) => new Set(prev).add(rec.id));
    try {
      const res = await apiRequest("POST", `/api/teleprompter/recordings/${rec.id}/transcribe`, {});
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Transcription failed");
      // Invalidate recordings cache so the button label updates to "Transcript"
      queryClient.invalidateQueries({ queryKey: ["/api/teleprompter/recordings"] });
      // Show the result in the modal
      setTranscriptModal({
        open: true,
        title: rec.title,
        text: data.transcript,
        recordingId: rec.id,
        durationSeconds: rec.durationSeconds ?? null,
        scoreJson: null,
        scoreGoalType: null,
      });
    } catch (err: any) {
      toast({ title: "Transcription failed", description: err.message, variant: "destructive" });
    } finally {
      setTranscribingIds((prev) => { const s = new Set(prev); s.delete(rec.id); return s; });
    }
  }

  async function handleScoreTake() {
    if (!transcriptModal.recordingId) return;
    setIsScoring(true);
    try {
      const res = await apiRequest("POST", `/api/teleprompter/recordings/${transcriptModal.recordingId}/score`, {});
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Scoring failed");
      queryClient.invalidateQueries({ queryKey: ["/api/teleprompter/recordings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teleprompter/score-usage"] });
      setTranscriptModal((m) => ({ ...m, scoreJson: data }));
    } catch (err: any) {
      toast({ title: "Scoring failed", description: err.message, variant: "destructive" });
    } finally {
      setIsScoring(false);
    }
  }

  function downloadTranscriptTxt(title: string, text: string) {
    const blob = new Blob([`${title}\n${"=".repeat(title.length)}\n\n${text}`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadTranscriptPdf(title: string, text: string) {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const margin = 54;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const contentW = pageW - margin * 2;

    // Header bar
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageW, 48, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Academy Toolkit", margin, 31);

    // Title
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    const titleLines = doc.splitTextToSize(title, contentW);
    doc.text(titleLines, margin, 82);
    const titleBlockH = titleLines.length * 18;

    // Divider
    const divY = 82 + titleBlockH + 6;
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, divY, pageW - margin, divY);

    // Body text
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    const bodyLines = doc.splitTextToSize(text, contentW);
    let y = divY + 18;
    for (const line of bodyLines) {
      if (y > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 15;
    }

    // Footer on each page
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 24, { align: "right" });
      doc.text("Academy Toolkit — Teleprompter Transcript", margin, pageH - 24);
    }

    const filename = `${title.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "")}.pdf`;
    doc.save(filename);
  }

  function formatDaysLeft(expiresAt: string | Date): string {
    const exp = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
    const days = Math.ceil((exp.getTime() - Date.now()) / 86400000);
    const dateStr = exp.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (days <= 0) return "Expired";
    if (days === 1) return `Expires tomorrow · ${dateStr}`;
    return `Expires in ${days} day${days !== 1 ? "s" : ""} · ${dateStr}`;
  }

  return (
    <div className="min-h-full flex flex-col">
      {/* Hero header */}
      <div className="relative overflow-hidden border-b border-border shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220_70%_8%)] to-[hsl(200_60%_15%)]" />
        <div className="absolute -bottom-16 -right-10 h-56 w-56 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute -top-12 -left-6 h-48 w-48 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="relative max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center gap-2.5 flex-wrap">
            <MonitorPlay className="h-4 w-4 text-sky-300 shrink-0" />
            <h1 className="text-xl font-bold text-white" data-testid="text-page-title">Teleprompter</h1>
            <button
              onClick={() => setShowHelp(true)}
              className="ml-auto text-white/45 hover:text-white/75 transition-colors"
              data-testid="button-help"
              title="Tips & Shortcuts"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
          <p className="text-white/50 text-xs mt-0.5">Paste or upload any script and roll it through a distraction-free teleprompter. Your scripts save to your account.</p>
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 mt-2.5">
            <button
              onClick={() => navigate("/video-studio")}
              className="text-white/45 hover:text-white/75 text-xs font-medium transition-colors"
              data-testid="button-back-video-studio"
            >
              Video Studio
            </button>
            <ChevronRight className="h-3 w-3 text-white/25 shrink-0" />
            <button
              onClick={() => navigate("/video-studio/research")}
              className="text-white/45 hover:text-white/75 text-xs font-medium transition-colors"
              data-testid="button-back-research"
            >
              Research
            </button>
            <ChevronRight className="h-3 w-3 text-white/25 shrink-0" />
            <button
              onClick={() => navigate("/video-studio/scripts")}
              className="text-white/45 hover:text-white/75 text-xs font-medium transition-colors"
              data-testid="button-back-scripts"
            >
              Scripts
            </button>
            <ChevronRight className="h-3 w-3 text-white/25 shrink-0" />
            <span className="text-white/75 text-xs font-medium">Teleprompter</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 sm:px-6 py-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[325px_1fr] gap-6">
          {/* ── Saved scripts list ── */}
          <aside className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Saved scripts {scripts ? `(${scripts.length})` : ""}
              </h2>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={handleNewScript}
                data-testid="button-new-script"
              >
                <Plus className="h-3 w-3 mr-1" /> New
              </Button>
            </div>

            <div className="space-y-1.5 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {!isLoading && (!scripts || scripts.length === 0) && (
                <div className="rounded-lg border border-dashed border-border p-4 text-center">
                  <FileText className="h-6 w-6 mx-auto text-muted-foreground/40 mb-1.5" />
                  <p className="text-xs text-muted-foreground">
                    No scripts yet. Paste or upload one to get started.
                  </p>
                </div>
              )}
              {scripts?.map((script) => {
                const active = script.id === selectedId;
                return (
                  <div
                    key={script.id}
                    className={`group relative rounded-lg border px-3 py-2 transition-colors cursor-pointer ${
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-muted-foreground/40 hover:bg-muted/40"
                    }`}
                    onClick={() => handleSelect(script)}
                    data-testid={`script-item-${script.id}`}
                  >
                    <div className="pr-6">
                      <p className="text-sm font-medium text-foreground leading-snug" data-testid={`script-title-${script.id}`}>
                        {script.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {wordCount(script.content).toLocaleString()} words · {formatRelative(script.updatedAt)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDeleteId(script.id);
                      }}
                      className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      data-testid={`button-delete-${script.id}`}
                      aria-label="Delete script"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* ── Editor ── */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="relative">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-slate-500 to-zinc-700" />
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
                    Title
                  </label>
                  <Input
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="My Script"
                    maxLength={120}
                    data-testid="input-title"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
                      <button
                        type="button"
                        className={`px-3 py-1.5 text-xs font-semibold transition-colors ${editorTab === "script" ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"}`}
                        onClick={() => setEditorTab("script")}
                        data-testid="tab-script"
                      >
                        Word-for-Word
                      </button>
                      <button
                        type="button"
                        className={`px-3 py-1.5 text-xs font-semibold transition-colors border-l border-border ${editorTab === "bullets" ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"}`}
                        onClick={() => setEditorTab("bullets")}
                        data-testid="tab-bullets"
                      >
                        Bullet Points
                      </button>
                    </div>
                    {editorTab === "script" && (
                      <span className="text-[11px] text-muted-foreground" data-testid="text-stats">
                        {wc.toLocaleString()} words · ~{reading} read time
                      </span>
                    )}
                    {editorTab === "bullets" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs gap-1"
                        onClick={() => generateBulletsMutation.mutate()}
                        disabled={!content.trim() || generateBulletsMutation.isPending}
                        data-testid="button-generate-bullets"
                        title={!content.trim() ? "Add a script first" : "Generate from your script using AI"}
                      >
                        {generateBulletsMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        AI Generate
                      </Button>
                    )}
                  </div>
                  {editorTab === "script" ? (
                    <Textarea
                      value={content}
                      onChange={(e) => {
                        const next = e.target.value.slice(0, MAX_SCRIPT_CHARS);
                        setContent(next);
                        setDirty(true);
                      }}
                      placeholder="Paste your script here, or upload a .txt file below…"
                      className="min-h-[360px] font-serif text-xl leading-relaxed resize-y"
                      data-testid="input-content"
                    />
                  ) : (
                    <div className="space-y-1.5">
                      <Textarea
                        value={bulletPoints}
                        onChange={(e) => {
                          setBulletPoints(e.target.value);
                          setDirty(true);
                        }}
                        placeholder={"• Opening hook\n• Key point 1\n• Key point 2\n• Key point 3\n• Call to action\n\nType bullet points manually, or click \"AI Generate\" to extract them from your script automatically."}
                        className="min-h-[360px] text-base leading-relaxed resize-y"
                        data-testid="input-bullets"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        One bullet per line. These appear as a reference card in the teleprompter so you can ad-lib naturally.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    onClick={handleOpenModal}
                    disabled={!content.trim() || isSaving}
                    className="bg-red-600 hover:bg-red-700 text-white shadow-md"
                    data-testid="button-open-teleprompter-modal"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Open Teleprompter
                  </Button>
                  {scoreUsage?.isAdmin && (
                    <Button
                      onClick={handleOpenTeleprompter}
                      disabled={!content.trim() || isSaving}
                      className="bg-gradient-to-r from-slate-700 to-zinc-900 hover:from-slate-800 hover:to-black text-white shadow-md"
                      data-testid="button-open-teleprompter"
                      size="sm"
                    >
                      <Play className="h-3.5 w-3.5 mr-1.5" />
                      Open Teleprompter (Popup)
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={handleSave}
                    disabled={!content.trim() || isSaving || (!dirty && !!selectedId)}
                    data-testid="button-save"
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    {selectedId ? "Save changes" : "Save to library"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-upload"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload .txt
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,text/plain"
                    onChange={handleFileUpload}
                    className="hidden"
                    data-testid="input-file"
                  />
                  {selectedId && (dirty || autoSaveStatus !== "idle") && (
                    <span
                      className={`text-xs ml-1 ${autoSaveStatus === "saved" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
                      data-testid="text-dirty"
                    >
                      {autoSaveStatus === "saving" ? "Saving…" : autoSaveStatus === "saved" ? "✓ Changes saved" : "Unsaved changes"}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Your Takes (Recordings) ── */}
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="relative">
                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-600 to-sky-700" />
              </div>
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <Video className="h-4 w-4 text-teal-500" />
                    Your Takes
                    {scriptRecordings.length > 0 && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">({scriptRecordings.length})</span>
                    )}
                  </h3>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Recordings are kept for 30 days
                  </span>
                </div>

                {recordingsLoading && (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}

                {!recordingsLoading && scriptRecordings.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border p-5 text-center">
                    <Video className="h-7 w-7 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No takes for this script yet.</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">Open the teleprompter and record a take — it'll appear here automatically.</p>
                  </div>
                )}

                {scriptRecordings.length > 0 && (
                  <div className="space-y-2">
                    {scriptRecordings.map((rec) => {
                      const daysLeft = formatDaysLeft(rec.expiresAt);
                      const isExpiringSoon = new Date(rec.expiresAt).getTime() - Date.now() < 5 * 86400000;
                      return (
                        <div
                          key={rec.id}
                          className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5 hover:bg-muted/40 transition-colors"
                          data-testid={`recording-item-${rec.id}`}
                        >
                          <div className="shrink-0 w-8 h-8 rounded-md bg-teal-500/10 flex items-center justify-center">
                            <Video className="h-4 w-4 text-teal-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" data-testid={`recording-title-${rec.id}`}>
                              {rec.title || "Untitled Take"}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span>{formatRelative(rec.createdAt)}</span>
                              {rec.durationSeconds && (
                                <><span>·</span><span>{formatDuration(rec.durationSeconds)}</span></>
                              )}
                              <span>·</span>
                              <span>{formatBytes(rec.sizeBytes)}</span>
                              <span>·</span>
                              <span className={`font-mono text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                                rec.format === "portrait" ? "bg-violet-500/10 text-violet-500" :
                                rec.format === "square"   ? "bg-blue-500/10 text-blue-500" :
                                "bg-muted text-muted-foreground"
                              }`}>
                                {rec.format === "portrait" ? "9:16" : rec.format === "square" ? "1:1" : "16:9"}
                              </span>
                              <span>·</span>
                              <span className={isExpiringSoon ? "text-amber-500 font-medium" : ""}>
                                {daysLeft}
                              </span>
                            </p>
                          </div>
                          <TooltipProvider delayDuration={300}>
                          <div className="flex items-center gap-1 shrink-0">
                            {/* Preview */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setPreviewRec(rec)}
                                  className="p-2 rounded-md text-blue-500 hover:text-blue-600 hover:bg-blue-500/10 transition-colors"
                                  data-testid={`button-preview-recording-${rec.id}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Preview</TooltipContent>
                            </Tooltip>

                            {/* Transcript */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleGetTranscript(rec)}
                                  disabled={transcribingIds.has(rec.id)}
                                  className="p-2 rounded-md text-violet-500 hover:text-violet-600 hover:bg-violet-500/10 transition-colors disabled:opacity-50"
                                  data-testid={`button-transcript-recording-${rec.id}`}
                                >
                                  {transcribingIds.has(rec.id)
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <FileText className="h-4 w-4" />}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {transcribingIds.has(rec.id) ? "Transcribing…" : rec.transcriptText ? "View Transcript" : "Get Transcript"}
                              </TooltipContent>
                            </Tooltip>

                            {/* Download */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a
                                  href={`/api/teleprompter/recordings/${rec.id}/download`}
                                  download
                                  className="p-2 rounded-md text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                                  data-testid={`button-download-recording-${rec.id}`}
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                              </TooltipTrigger>
                              <TooltipContent>Download Video</TooltipContent>
                            </Tooltip>


                            {/* Delete */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setPendingDeleteRecordingId(rec.id)}
                                  disabled={deleteRecordingMutation.isPending}
                                  className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                  data-testid={`button-delete-recording-${rec.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                          </div>
                          </TooltipProvider>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>


          </div>
        </div>
      </div>

      {/* In-page teleprompter overlay (Beta) — draggable */}
      {modalSrc && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          <div
            className="absolute flex flex-col bg-black rounded-xl overflow-hidden pointer-events-auto shadow-2xl"
            style={{ width: "75vw", height: "95vh", left: modalPos.x, top: modalPos.y }}
          >
            {/* Drag handle */}
            <div
              className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-white/10 shrink-0 select-none"
              style={{ cursor: isDragging ? "grabbing" : "grab" }}
              onMouseDown={handleModalDragStart}
            >
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                  <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                  <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                </div>
                <span className="text-white/40 text-xs select-none">Teleprompter — drag to reposition</span>
              </div>
              <button
                onClick={() => { if (modalSrc) URL.revokeObjectURL(modalSrc); setModalSrc(null); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white text-xs font-medium transition-colors"
                data-testid="button-close-teleprompter-modal"
              >
                ✕ Close
              </button>
            </div>
            {/* Iframe — transparent blocker overlay during drag prevents iframe swallowing mouse events */}
            <div className="relative flex-1 min-h-0">
              {isDragging && <div className="absolute inset-0 z-10" />}
              <iframe
                src={modalSrc}
                allow="camera; microphone"
                className="w-full h-full border-0"
                title="Teleprompter"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tips & Shortcuts help dialog */}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-lg w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              Tips &amp; Shortcuts
            </DialogTitle>
            <DialogDescription className="sr-only">Teleprompter tips and keyboard shortcuts</DialogDescription>
          </DialogHeader>
          <ul className="text-sm text-muted-foreground space-y-3 pt-1">
            <li className="flex gap-2">
              <span className="shrink-0 text-primary">→</span>
              <span><strong className="text-foreground">Open Teleprompter</strong> auto-saves your script before launching so you're always reading the latest version.</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-primary">→</span>
              <span>Hit <kbd className="px-1.5 py-0.5 text-[11px] rounded bg-muted border border-border">Space</kbd> to play/pause the scroll. Use <kbd className="px-1.5 py-0.5 text-[11px] rounded bg-muted border border-border">↑</kbd> and <kbd className="px-1.5 py-0.5 text-[11px] rounded bg-muted border border-border">↓</kbd> to speed up or slow down, or drag the Speed slider in the toolbar.</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-primary">→</span>
              <span>Use <kbd className="px-1.5 py-0.5 text-[11px] rounded bg-muted border border-border">+</kbd> / <kbd className="px-1.5 py-0.5 text-[11px] rounded bg-muted border border-border">−</kbd> to make the script text larger or smaller while reading.</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-primary">→</span>
              <span>The camera panel on the right lets you record directly. Each take is saved here automatically and kept for <strong className="text-foreground">30 days</strong>.</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-primary">→</span>
              <span>Click the <strong className="text-foreground">violet transcript icon</strong> on any take to generate an AI transcript — then copy it or reference it while editing.</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-primary">→</span>
              <span>Make sure your browser allows <strong className="text-foreground">pop-ups for this site</strong> — the teleprompter opens in a separate window by design so you can move it to a second screen.</span>
            </li>
          </ul>
        </DialogContent>
      </Dialog>

      {/* Recording preview modal */}
      <Dialog open={!!previewRec} onOpenChange={(open) => !open && setPreviewRec(null)}>
        <DialogContent className="max-w-3xl w-full p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3">
            <DialogTitle className="text-base truncate">
              {previewRec?.title || "Recording Preview"}
            </DialogTitle>
            <DialogDescription className="sr-only">Video preview player</DialogDescription>
          </DialogHeader>
          <div className="bg-black w-full flex items-center justify-center min-h-[200px] relative">
            {previewLoading && (
              <div className="flex flex-col items-center gap-2 text-white/60 py-12">
                <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                <span className="text-sm">Loading video…</span>
              </div>
            )}
            {previewUrl && (
              <>
                <video
                  ref={previewVideoRef}
                  key={previewRec?.id}
                  src={previewUrl}
                  controls
                  className="w-full max-h-[60vh] outline-none"
                  data-testid="video-preview-player"
                  onPlay={() => setPreviewPlaying(true)}
                  onPause={() => setPreviewPlaying(false)}
                  onEnded={() => setPreviewPlaying(false)}
                />
                {!previewPlaying && (
                  <button
                    onClick={() => previewVideoRef.current?.play()}
                    className="absolute inset-0 flex items-center justify-center group"
                    aria-label="Play video"
                    data-testid="button-overlay-play"
                  >
                    <span className="relative flex items-center justify-center">
                      <span className="absolute h-20 w-20 rounded-full bg-white/20 animate-ping" />
                      <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-110">
                        <Play className="h-7 w-7 text-black fill-black ml-1" />
                      </span>
                    </span>
                  </button>
                )}
              </>
            )}
          </div>
          <div className="flex items-center justify-between px-5 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {previewRec?.durationSeconds ? `${Math.floor(previewRec.durationSeconds / 60)}:${String(previewRec.durationSeconds % 60).padStart(2, "0")}` : ""}
              {previewRec?.sizeBytes ? ` · ${(previewRec.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}
            </p>
            <a
              href={previewRec ? `/api/teleprompter/recordings/${previewRec.id}/download` : "#"}
              download
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted transition-colors"
              data-testid="button-preview-download"
            >
              <Download className="h-3.5 w-3.5" />
              Download this take
            </a>
          </div>
        </DialogContent>
      </Dialog>

      {/* Transcript viewer modal */}
      <Dialog open={transcriptModal.open} onOpenChange={(open) => !open && setTranscriptModal((m) => ({ ...m, open: false }))}>
        <DialogContent
          className={cn("w-full flex flex-col overflow-hidden transition-all", transcriptModal.scoreJson ? "max-w-[75vw]" : "max-w-2xl")}
          style={transcriptModal.scoreJson ? { maxHeight: "90vh", height: "90vh" } : { maxHeight: "90vh" }}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-base leading-snug">{transcriptModal.title}</DialogTitle>
            <DialogDescription>
              {transcriptModal.scoreJson
                ? `Score: ${transcriptModal.scoreJson.totalScore}/100`
                : "Transcript — score your take or copy below."}
            </DialogDescription>
          </DialogHeader>

          {/* Two-panel body */}
          <div className={cn("flex-1 min-h-0 overflow-hidden flex gap-4 mt-2", transcriptModal.scoreJson ? "flex-row" : "flex-col")}>

            {/* ── Score report panel (left, 60%) ── */}
            {transcriptModal.scoreJson && (() => {
              const sc = transcriptModal.scoreJson;
              return (
                <div className="w-[60%] shrink-0 min-h-0 overflow-y-auto pr-2 flex flex-col gap-3">

                  {/* Score Summary card — circle, strengths/improvements, AI coach summary */}
                  <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
                    <div className="px-4 py-3 border-b flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                      <span className="font-semibold text-sm">Score Summary</span>
                    </div>
                    <div className="p-4 flex gap-5 items-start">
                      {/* Circle */}
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <TakeScoreCircle score={sc.totalScore} />
                        <p className="text-xs font-semibold">Total Score</p>
                        <p className="text-xs text-muted-foreground">out of 100</p>
                      </div>
                      {/* Right column: strengths + improvements + AI summary */}
                      <div className="flex-1 flex flex-col gap-3 pt-1">
                        <div className="grid grid-cols-2 gap-3">
                          {sc.summary.strengths.length > 0 && (
                            <div className="space-y-1.5">
                              <h4 className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                                <Check className="h-3 w-3" />What You Did Well
                              </h4>
                              <ul className="space-y-1">
                                {sc.summary.strengths.map((s, i) => (
                                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                    <span className="shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />{s}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {sc.summary.topImprovements.length > 0 && (
                            <div className="space-y-1.5">
                              <h4 className="flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                                <Lightbulb className="h-3 w-3" />Top Improvements
                              </h4>
                              <ul className="space-y-1">
                                {sc.summary.topImprovements.map((s, i) => (
                                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                    <span className="shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />{s}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                        {sc.summary.overallSummary && (
                          <div className="pt-2 border-t flex items-start gap-2">
                            <Sparkles className="h-3.5 w-3.5 text-violet-500 mt-0.5 shrink-0" />
                            <p className="text-xs leading-relaxed text-muted-foreground">{sc.summary.overallSummary}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Detailed feedback accordion */}
                  <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-orange-500 via-violet-500 to-pink-500" />
                    <div className="px-4 py-3 border-b">
                      <span className="font-semibold text-sm">Detailed Feedback by Part</span>
                    </div>
                    <div className="p-3">
                      <Tabs defaultValue="hook">
                        <TabsList className="grid grid-cols-5 w-full h-auto mb-3">
                          {(["hook","setHook","firstCTA","content","finalCTA"] as const).map((key) => {
                            const labels: Record<string,string> = { hook:"Hook", setHook:"Set the Hook", firstCTA:"First CTA", content:"Content", finalCTA:"Final CTA" };
                            const color = PART_COLORS[key] || "#6366f1";
                            return (
                              <TabsTrigger key={key} value={key} className="flex flex-col gap-0.5 py-1.5 h-auto">
                                <span className="text-xs">{labels[key]}</span>
                                <span className="text-[10px] font-bold tabular-nums" style={{ color }}>{sc.partScores[key]}/20</span>
                              </TabsTrigger>
                            );
                          })}
                        </TabsList>
                        {(["hook","setHook","firstCTA","content","finalCTA"] as const).map((key) => (
                          <TabsContent key={key} value={key} className="mt-0">
                            <TakePartDetail partKey={key} data={sc.parts[key]} />
                          </TabsContent>
                        ))}
                      </Tabs>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── Transcript panel (right, 40% or full when no score) ── */}
            <div className={cn("flex flex-col gap-2 min-h-0 overflow-hidden", transcriptModal.scoreJson ? "w-[40%]" : "flex-1")}>
              <div className="flex-1 overflow-y-auto rounded-md border border-border bg-muted/40 p-4 min-h-0">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{transcriptModal.text}</p>
              </div>
              {/* Copy / download row inside transcript panel */}
              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <Button variant="outline" size="sm"
                  onClick={() => navigator.clipboard.writeText(transcriptModal.text).then(() => toast({ title: "Copied to clipboard" }))}
                  data-testid="button-copy-transcript">
                  <FileText className="h-3.5 w-3.5 mr-1.5" />Copy
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadTranscriptTxt(transcriptModal.title, transcriptModal.text)} data-testid="button-download-transcript-txt">
                  <Download className="h-3.5 w-3.5 mr-1.5" />TXT
                </Button>
                <Button variant="outline" size="sm" onClick={() => downloadTranscriptPdf(transcriptModal.title, transcriptModal.text)} data-testid="button-download-transcript-pdf">
                  <Download className="h-3.5 w-3.5 mr-1.5" />PDF
                </Button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center pt-3 shrink-0 border-t border-border mt-2">
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                disabled={isScoring || (!scoreUsage?.isAdmin && (scoreUsage?.used ?? 0) >= 5)}
                onClick={handleScoreTake}
                data-testid="button-score-take"
              >
                {isScoring ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Scoring…</>
                ) : transcriptModal.scoreJson ? (
                  <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Re-score</>
                ) : (
                  <><BarChart2 className="h-3.5 w-3.5 mr-1.5" />Score this take</>
                )}
              </Button>
              {scoreUsage && (
                scoreUsage.isAdmin ? (
                  <span className="text-xs text-muted-foreground">Admin — Unlimited</span>
                ) : (
                  <span className={`text-xs ${scoreUsage.used >= 5 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    {scoreUsage.used >= 5
                      ? "Daily limit reached (5 of 5 used)"
                      : `${scoreUsage.used} of 5 scores used today`}
                  </span>
                )
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setTranscriptModal((m) => ({ ...m, open: false }))} data-testid="button-close-transcript">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recording delete confirmation */}
      <AlertDialog open={!!pendingDeleteRecordingId} onOpenChange={(open) => !open && setPendingDeleteRecordingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this recording?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the video from your account and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-recording-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteRecordingId) {
                  deleteRecordingMutation.mutate(pendingDeleteRecordingId);
                  setPendingDeleteRecordingId(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-delete-recording-confirm"
            >
              Yes, delete it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Script delete confirmation */}
      <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this script?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the script from your library. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDeleteId && deleteMutation.mutate(pendingDeleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-delete-confirm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved changes guard */}
      <AlertDialog open={showDirtyDialog} onOpenChange={(open) => { if (!open) setShowDirtyDialog(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this script. They will be lost if you continue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => setShowDirtyDialog(false)}
              data-testid="button-dirty-cancel"
            >
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowDirtyDialog(false);
                dirtyDialogAction?.();
                setDirtyDialogAction(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-dirty-discard"
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
