import { useState, useEffect, useRef, useMemo } from "react";
// (initial auto-select uses a ref so explicit "New script" / delete actions
//  aren't reverted by the effect)
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  Save,
  Play,
  FileText,
  Loader2,
  MonitorPlay,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { openTeleprompter } from "@/lib/teleprompter";
import type { TeleprompterScript } from "@shared/schema";

const MAX_SCRIPT_CHARS = 100_000;
const MAX_FILE_BYTES = 500_000;

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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const { data: scripts, isLoading } = useQuery<TeleprompterScript[]>({
    queryKey: ["/api/teleprompter/scripts"],
  });

  const selected = useMemo(
    () => scripts?.find((s) => s.id === selectedId) ?? null,
    [scripts, selectedId],
  );

  // Auto-select the most recent script only on first successful load.
  const didInitialSelectRef = useRef(false);
  useEffect(() => {
    if (didInitialSelectRef.current) return;
    if (!scripts) return;
    didInitialSelectRef.current = true;
    if (scripts.length > 0) {
      const first = scripts[0];
      setSelectedId(first.id);
      setTitle(first.title);
      setContent(first.content);
      setDirty(false);
    }
  }, [scripts]);

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; content: string }) => {
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
    mutationFn: async (data: { id: string; title: string; content: string }) => {
      const res = await apiRequest("PATCH", `/api/teleprompter/scripts/${data.id}`, {
        title: data.title,
        content: data.content,
      });
      return res.json() as Promise<TeleprompterScript>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teleprompter/scripts"] });
      setDirty(false);
      toast({ title: "Script saved" });
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

  const handleNewScript = () => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    setSelectedId(null);
    setTitle("");
    setContent("");
    setDirty(false);
  };

  const handleSelect = (script: TeleprompterScript) => {
    if (script.id === selectedId) return;
    if (dirty && !confirm("Discard unsaved changes?")) return;
    setSelectedId(script.id);
    setTitle(script.title);
    setContent(script.content);
    setDirty(false);
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
      });
    }
    return createMutation.mutateAsync({
      title: trimmedTitle,
      content: trimmedContent,
    });
  };

  const handleSave = async () => {
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
    openTeleprompter({
      title: scriptToOpen?.title || title.trim() || "Untitled script",
      sections: [{ text: scriptToOpen?.content || trimmedContent }],
    });
  };

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

  const wc = wordCount(content);
  const reading = estimateMinutes(wc);
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="min-h-full flex flex-col">
      {/* Hero header */}
      <div className="relative overflow-hidden border-b border-border shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220_70%_8%)] to-[hsl(200_60%_15%)]" />
        <div className="absolute -bottom-16 -right-10 h-56 w-56 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute -top-12 -left-6 h-48 w-48 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="relative max-w-6xl mx-auto px-6 py-6 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10 shrink-0"
            onClick={() => navigate("/video-tools")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <MonitorPlay className="h-5 w-5 text-sky-300" />
              Teleprompter
            </h1>
            <p className="text-white/60 text-sm mt-0.5">
              Paste or upload any script and roll it through a distraction-free teleprompter. Your scripts save to your account.
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 px-4 sm:px-6 py-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
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
                      <p className="text-sm font-medium text-foreground truncate" data-testid={`script-title-${script.id}`}>
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
                  <div className="flex items-end justify-between mb-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Script
                    </label>
                    <span className="text-[11px] text-muted-foreground" data-testid="text-stats">
                      {wc.toLocaleString()} words · ~{reading} read time
                    </span>
                  </div>
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
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    onClick={handleOpenTeleprompter}
                    disabled={!content.trim() || isSaving}
                    className="bg-gradient-to-r from-slate-700 to-zinc-900 hover:from-slate-800 hover:to-black text-white shadow-md"
                    data-testid="button-open-teleprompter"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Open Teleprompter
                  </Button>
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
                  {dirty && selectedId && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 ml-1" data-testid="text-dirty">
                      Unsaved changes
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Tips
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                <li>Clicking <strong>Open Teleprompter</strong> auto-saves your script first.</li>
                <li>Inside the teleprompter use <kbd className="px-1.5 py-0.5 text-[11px] rounded bg-background border border-border">Space</kbd> to play/pause, <kbd className="px-1.5 py-0.5 text-[11px] rounded bg-background border border-border">[</kbd>/<kbd className="px-1.5 py-0.5 text-[11px] rounded bg-background border border-border">]</kbd> to adjust scroll speed, and the slider in the toolbar for fine control.</li>
                <li>Pop-ups must be allowed for this site so the teleprompter window can open.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
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
    </div>
  );
}
