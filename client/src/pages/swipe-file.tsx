import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  Camera, FileText, Plus, Copy, Share2, Trash2, Edit3,
  ExternalLink, Eye, EyeOff, Link2, X, Check, Upload,
  Image as ImageIcon, Loader2, Globe, Scroll, ChevronLeft, ChevronRight,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

// ---- Types ----
type PromoLink = { title: string; url: string; description?: string; emoji?: string };
type AffiliateLink = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  category: string | null;
  emoji: string;
  isActive: boolean;
  sortOrder: number;
};
type SwipeItem = {
  id: string;
  userId: string;
  title: string;
  type: "upload" | "snippet";
  content: string | null;
  imagePath: string | null;
  strips: string[] | null;
  sourceUrl: string | null;
  notes: string | null;
  shareToken: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
};

// ---- API helpers ----
async function apiFetch(url: string, opts: RequestInit = {}) {
  const r = await fetch(url, { credentials: "include", ...opts });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? r.statusText);
  return r.json();
}

function swipeImageUrl(id: string) {
  return `/api/swipe/${id}/image`;
}

function shareUrl(token: string) {
  return `${window.location.origin}/swipe/${token}`;
}

// ---- Add Item Dialog ----
function AddItemDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<"upload" | "snippet" | "url">("upload");
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [captureUrl, setCaptureUrl] = useState("");
  const [captureTitle, setCaptureTitle] = useState("");

  const reset = () => {
    setTitle(""); setSourceUrl(""); setNotes(""); setFile(null);
    setContent(""); setUploading(false); setUploadProgress(0);
    setCaptureUrl(""); setCaptureTitle("");
  };

  const handleClose = () => { reset(); onClose(); };

  const createMutation = useMutation({
    mutationFn: (body: object) => apiFetch("/api/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swipe"] });
      toast({ title: "Saved to Swipe File" });
      handleClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  async function handleUploadSubmit() {
    if (!title.trim()) return toast({ title: "Title is required", variant: "destructive" });
    if (!file) return toast({ title: "Please select an image", variant: "destructive" });
    setUploading(true);
    try {
      const { uploadURL, objectPath } = await apiFetch("/api/swipe/request-upload-url", { method: "POST" });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadURL);
        xhr.setRequestHeader("Content-Type", file.type || "image/png");
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 90));
        };
        xhr.onload = () => xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
      });
      setUploadProgress(95);
      createMutation.mutate({ type: "upload", title: title.trim(), imagePath: objectPath, sourceUrl: sourceUrl.trim() || undefined, notes: notes.trim() || undefined });
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  function handleSnippetSubmit() {
    if (!title.trim()) return toast({ title: "Title is required", variant: "destructive" });
    if (!content.trim()) return toast({ title: "Snippet text is required", variant: "destructive" });
    createMutation.mutate({ type: "snippet", title: title.trim(), content: content.trim(), sourceUrl: sourceUrl.trim() || undefined, notes: notes.trim() || undefined });
  }

  const captureMutation = useMutation({
    mutationFn: (body: object) => apiFetch("/api/swipe/capture-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swipe"] });
      toast({ title: "Full-page capture saved!" });
      handleClose();
    },
    onError: (e: Error) => toast({ title: "Capture failed", description: e.message, variant: "destructive" }),
  });

  function handleUrlSubmit() {
    if (!captureUrl.trim()) return toast({ title: "URL is required", variant: "destructive" });
    try { new URL(captureUrl.trim()); } catch {
      return toast({ title: "Enter a valid URL (starting with https://…)", variant: "destructive" });
    }
    captureMutation.mutate({ url: captureUrl.trim(), title: captureTitle.trim() || undefined });
  }

  const busy = uploading || createMutation.isPending || captureMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Add to Swipe File
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => setTab(v as any)}>
          <TabsList className="w-full">
            <TabsTrigger value="upload" className="flex-1 gap-2 text-xs">
              <Upload className="h-3.5 w-3.5" /> Upload
            </TabsTrigger>
            <TabsTrigger value="snippet" className="flex-1 gap-2 text-xs">
              <FileText className="h-3.5 w-3.5" /> Snippet
            </TabsTrigger>
            <TabsTrigger value="url" className="flex-1 gap-2 text-xs">
              <Scroll className="h-3.5 w-3.5" /> Full Page
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 space-y-4">
            <div>
              <Label htmlFor="sw-title">Title *</Label>
              <Input id="sw-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Give this a descriptive title" />
            </div>

            <TabsContent value="upload" className="m-0 space-y-3">
              <div
                onClick={() => !busy && fileRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  file ? "border-primary/50 bg-primary/5" : "border-muted-foreground/30 hover:border-primary/40"
                }`}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-3">
                    <ImageIcon className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <button onClick={e => { e.stopPropagation(); setFile(null); }} className="ml-auto text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Click to select an image (PNG, JPG, WebP, GIF)</p>
                  </>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)} />
              {uploading && (
                <div className="space-y-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground text-right">{uploadProgress}%</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="snippet" className="m-0">
              <Label htmlFor="sw-content">Snippet Text *</Label>
              <Textarea id="sw-content" value={content} onChange={e => setContent(e.target.value)}
                placeholder="Paste the text you want to save…" rows={5} />
            </TabsContent>

            {tab !== "url" && (
              <>
                <div>
                  <Label htmlFor="sw-source">Source URL</Label>
                  <Input id="sw-source" type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)}
                    placeholder="https://example.com/original-page" />
                </div>
                <div>
                  <Label htmlFor="sw-notes">Personal Notes</Label>
                  <Textarea id="sw-notes" value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Why did you save this? What's the hook?" rows={2} />
                </div>
              </>
            )}

            <TabsContent value="url" className="m-0 space-y-3">
              <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                <Scroll className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Captures the <strong>full scrolling page</strong> at that URL using a headless browser. Works on public pages only. Takes 10–30 seconds.</span>
              </div>
              <div>
                <Label htmlFor="sw-cap-url">Page URL *</Label>
                <Input id="sw-cap-url" type="url" value={captureUrl} onChange={e => setCaptureUrl(e.target.value)}
                  placeholder="https://example.com/sales-page" />
              </div>
              <div>
                <Label htmlFor="sw-cap-title">Title (optional)</Label>
                <Input id="sw-cap-title" value={captureTitle} onChange={e => setCaptureTitle(e.target.value)}
                  placeholder="Saved as the page's domain if blank" />
              </div>
              {captureMutation.isPending && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Launching headless browser and capturing full page…
                  </div>
                  <p className="text-xs text-muted-foreground">This usually takes 10–30 seconds.</p>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={busy} className="flex-1">Cancel</Button>
          <Button
            onClick={tab === "upload" ? handleUploadSubmit : tab === "snippet" ? handleSnippetSubmit : handleUrlSubmit}
            disabled={busy}
            className="flex-1"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {uploading ? `Uploading… ${uploadProgress}%` : tab === "url" ? (captureMutation.isPending ? "Capturing…" : "Capture Full Page") : "Save to Swipe File"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Edit Dialog ----
function EditDialog({ item, onClose }: { item: SwipeItem; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes ?? "");
  const [sourceUrl, setSourceUrl] = useState(item.sourceUrl ?? "");

  const updateMutation = useMutation({
    mutationFn: (body: object) => apiFetch(`/api/swipe/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swipe"] });
      toast({ title: "Saved" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="h-5 w-5 text-primary" /> Edit Item
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Source URL</Label>
            <Input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <Label>Personal Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <div className="flex gap-2 pt-4">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => updateMutation.mutate({ title, notes, sourceUrl })}
            disabled={updateMutation.isPending} className="flex-1">
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Preview Modal ----
function PreviewModal({
  item,
  items,
  onNavigate,
  onClose,
  onEdit,
  onDelete,
}: {
  item: SwipeItem;
  items: SwipeItem[];
  onNavigate: (item: SwipeItem) => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);


  const currentIndex = items.findIndex(i => i.id === item.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;

  // Reset image state when item changes
  useEffect(() => {
    setImgError(false);
    setImgLoaded(false);
    setCopied(false);
  }, [item.id]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onNavigate(items[currentIndex - 1]);
      if (e.key === "ArrowRight" && hasNext) onNavigate(items[currentIndex + 1]);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentIndex, hasPrev, hasNext, items, onNavigate, onClose]);

  const shareMutation = useMutation({
    mutationFn: () => apiFetch(`/api/swipe/${item.id}/share`, { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/swipe"] });
      copyLink(data.token);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const unshareMutation = useMutation({
    mutationFn: () => apiFetch(`/api/swipe/${item.id}/share`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/swipe"] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function copyLink(token?: string) {
    const t = token ?? item.shareToken;
    if (!t) return;
    navigator.clipboard.writeText(shareUrl(t));
    setCopied(true);
    toast({ title: "Share link copied!" });
    setTimeout(() => setCopied(false), 2500);
  }

  const isImage = item.type === "upload" && item.imagePath && !imgError;
  const isFullPage = isImage && item.strips && item.strips.length > 1;

  return createPortal(
    // Full-screen overlay — portalled into document.body so position:fixed is
    // always relative to the true viewport, never trapped by overflow:auto parents
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={onClose}
    >
      {/* Modal panel — click inside stops propagation */}
      <div
        className="relative flex flex-col md:flex-row rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "hsl(230,45%,10%)", width: "75vw", height: "75vh", minWidth: "320px", minHeight: "400px" }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Image / content pane ── */}
        {/* Mobile: top 55% of modal height; Desktop: flex-1 fills remaining width */}
        <div className="relative flex flex-col bg-[hsl(230,30%,7%)] min-w-0 min-h-0 h-[55%] shrink-0 md:h-auto md:flex-1">
          {/* Navigation counter */}
          <div className="absolute top-3 left-3 z-10">
            <span className="text-xs text-white/50 bg-black/40 rounded-full px-2.5 py-1 backdrop-blur-sm">
              {currentIndex + 1} / {items.length}
            </span>
          </div>

          {/* Close button — mobile only, top-right of image pane */}
          <button
            onClick={onClose}
            className="md:hidden absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-black/50 flex items-center justify-center text-white/70 hover:text-white backdrop-blur-sm"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Content area — vertically scrollable so tall images can scroll top-to-bottom */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {isImage ? (
              <div className="p-4 md:p-6">
                {/* Spinner shown before image loads */}
                {!imgLoaded && (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-white/30" />
                  </div>
                )}
                {/* Image fills pane width, natural height — tall images scroll with mouse wheel */}
                <img
                  src={swipeImageUrl(item.id)}
                  alt={item.title}
                  className={`w-full h-auto block rounded-lg shadow-xl transition-opacity duration-300 ${imgLoaded ? "opacity-100" : "opacity-0 h-0"}`}
                  onLoad={() => setImgLoaded(true)}
                  onError={() => { setImgError(true); setImgLoaded(true); }}
                />
                {isFullPage && imgLoaded && (
                  <p className="text-center text-xs text-white/40 mt-3">
                    Full-page capture · {item.strips!.length} sections — scroll to see all
                  </p>
                )}
              </div>
            ) : item.type === "snippet" ? (
              <div className="flex items-center justify-center p-4 md:p-6 min-h-full">
                <div className="w-full max-w-3xl rounded-xl border border-white/10 bg-[hsl(230,25%,12%)] p-5 md:p-8 shadow-xl">
                  <p className="text-sm text-white/80 font-mono leading-relaxed whitespace-pre-wrap break-words">
                    {item.content}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 text-white/30 h-full">
                <ImageIcon className="h-16 w-16" />
                <p className="text-sm">Image unavailable</p>
              </div>
            )}
          </div>

          {/* Prev / Next navigation arrows — larger tap targets on mobile */}
          {hasPrev && (
            <button
              onClick={() => onNavigate(items[currentIndex - 1])}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-12 w-12 md:h-10 md:w-10 rounded-full bg-black/50 hover:bg-black/70 border border-white/10 flex items-center justify-center text-white/80 hover:text-white transition-all backdrop-blur-sm"
              title="Previous (←)"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {hasNext && (
            <button
              onClick={() => onNavigate(items[currentIndex + 1])}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-12 w-12 md:h-10 md:w-10 rounded-full bg-black/50 hover:bg-black/70 border border-white/10 flex items-center justify-center text-white/80 hover:text-white transition-all backdrop-blur-sm"
              title="Next (→)"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* ── Metadata sidebar ── */}
        {/* Mobile: remaining 45% height below image; Desktop: 300px fixed right column */}
        <div
          className="flex flex-col border-t md:border-t-0 md:border-l overflow-hidden flex-1 md:flex-none md:w-[300px]"
          style={{ borderColor: "hsl(230,40%,18%)" }}
        >
          {/* Sidebar header — desktop only (mobile has close btn on the image pane) */}
          <div className="hidden md:flex items-start gap-2 p-4 border-b" style={{ borderColor: "hsl(230,40%,18%)" }}>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-sm text-white leading-tight line-clamp-3">{item.title}</h2>
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  item.type === "upload"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                }`}>
                  {item.type === "upload" ? (
                    <><Camera className="h-3 w-3 inline mr-1" />Image</>
                  ) : (
                    <><FileText className="h-3 w-3 inline mr-1" />Snippet</>
                  )}
                </span>
                {item.shareToken && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Shared
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Mobile-only compact header (title + type badge) */}
          <div className="md:hidden flex items-center gap-2 px-3 pt-2.5 pb-1 shrink-0">
            <h2 className="font-semibold text-sm text-white leading-tight flex-1 truncate">{item.title}</h2>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
              item.type === "upload"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "bg-violet-500/20 text-violet-300 border border-violet-500/30"
            }`}>
              {item.type === "upload" ? "Image" : "Snippet"}
            </span>
          </div>

          {/* Metadata — scrollable */}
          <div className="flex-1 overflow-y-auto px-3 py-2 md:p-4 space-y-3 md:space-y-4">
            {/* Date + views — horizontal on mobile to save space */}
            <div className="flex items-center gap-4 text-xs text-white/50">
              <div className="flex items-center gap-1.5">
                <span className="text-white/40">Added</span>
                <span className="text-white/70">{format(new Date(item.createdAt), "MMM d, yyyy")}</span>
              </div>
              {item.shareToken && (
                <div className="flex items-center gap-1 text-emerald-400">
                  <Globe className="h-3 w-3" />
                  <span>{item.viewCount} views</span>
                </div>
              )}
            </div>

            {/* Source URL */}
            {item.sourceUrl && (
              <div>
                <p className="text-xs font-medium text-white/40 uppercase tracking-widest mb-1.5">Source</p>
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors break-all"
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span>{item.sourceUrl.replace(/^https?:\/\//, "")}</span>
                </a>
              </div>
            )}

            {/* Notes */}
            {item.notes && (
              <div>
                <p className="text-xs font-medium text-white/40 uppercase tracking-widest mb-1.5">Notes</p>
                <p className="text-xs text-white/70 leading-relaxed whitespace-pre-wrap">{item.notes}</p>
              </div>
            )}

            {/* Snippet content preview in sidebar */}
            {item.type === "snippet" && item.content && (
              <div>
                <p className="text-xs font-medium text-white/40 uppercase tracking-widest mb-1.5">Preview</p>
                <p className="text-xs text-white/60 font-mono leading-relaxed line-clamp-6">{item.content}</p>
              </div>
            )}

            {/* Keyboard hint — desktop only */}
            {items.length > 1 && (
              <div className="hidden md:block rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] text-white/40 leading-relaxed">
                  Use <kbd className="bg-white/10 px-1 rounded text-white/60">←</kbd> <kbd className="bg-white/10 px-1 rounded text-white/60">→</kbd> to navigate · <kbd className="bg-white/10 px-1 rounded text-white/60">Esc</kbd> to close
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-3 py-2.5 md:p-4 space-y-2 border-t shrink-0" style={{ borderColor: "hsl(230,40%,18%)" }}>
            {/* Share / Copy */}
            {item.shareToken ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => copyLink()}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied!" : "Copy Link"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"
                  onClick={() => unshareMutation.mutate()}
                  disabled={unshareMutation.isPending}
                  title="Remove share link"
                >
                  {unshareMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                className="w-full gap-1.5"
                variant="outline"
                style={{ borderColor: "hsl(230,40%,25%)", color: "hsl(0,0%,70%)" }}
                onClick={() => shareMutation.mutate()}
                disabled={shareMutation.isPending}
              >
                {shareMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
                Share with Link
              </Button>
            )}

            {/* Source link */}
            {item.sourceUrl && (
              <Button size="sm" variant="outline" className="w-full gap-1.5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white" asChild>
                <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Open Source Page
                </a>
              </Button>
            )}

            {/* Edit + Delete side by side on mobile to save vertical space */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1.5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"
                onClick={() => { onClose(); setTimeout(onEdit, 50); }}
              >
                <Edit3 className="h-3.5 w-3.5" /> Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1.5 border-red-900/50 text-red-400/80 hover:bg-red-950/50 hover:text-red-400 hover:border-red-800/60"
                onClick={() => { onClose(); setTimeout(onDelete, 50); }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---- Promotional Links Tab ----
function PromoLinksTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: linksData, isLoading: linksLoading } = useQuery<{ links: AffiliateLink[] }>({
    queryKey: ["/api/affiliate-links"],
    queryFn: () => apiFetch("/api/affiliate-links"),
  });

  const { data: promoData, isLoading: promoLoading } = useQuery<{ promoLinkIds: string[] }>({
    queryKey: ["/api/swipe/promo-links"],
    queryFn: () => apiFetch("/api/swipe/promo-links"),
  });

  const saveMutation = useMutation({
    mutationFn: (promoLinkIds: string[]) => apiFetch("/api/swipe/promo-links", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promoLinkIds }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/swipe/promo-links"] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const allLinks = linksData?.links ?? [];
  const promoLinkIds = promoData?.promoLinkIds ?? [];
  const promoSet = new Set(promoLinkIds);
  const addedLinks = promoLinkIds.map(id => allLinks.find(l => l.id === id)).filter(Boolean) as AffiliateLink[];
  const availableLinks = allLinks.filter(l => l.isActive && !promoSet.has(l.id));

  function addLink(id: string) { saveMutation.mutate([...promoLinkIds, id]); }
  function removeLink(id: string) { saveMutation.mutate(promoLinkIds.filter(lid => lid !== id)); }

  if (linksLoading || promoLoading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-8">
      <div className="rounded-lg border bg-card px-5 py-4 flex items-start gap-3">
        <Link2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <p className="text-sm text-muted-foreground">
          Pick links from your library. They appear on <strong className="text-foreground">every</strong> share page
          in your account — change them here and every page updates instantly.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          On your share pages {addedLinks.length > 0 && `· ${addedLinks.length}`}
        </p>
        {addedLinks.length === 0 ? (
          <div className="rounded-lg border border-dashed flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
            <Link2 className="h-7 w-7 opacity-25" />
            <p className="text-sm">Nothing added yet — pick from your library below.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {addedLinks.map(link => (
              <div key={link.id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
                <span className="text-lg shrink-0">{link.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{link.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{link.url.replace(/^https?:\/\//, "")}</p>
                </div>
                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => removeLink(link.id)} disabled={saveMutation.isPending}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          Your link vault {availableLinks.length > 0 && `· ${availableLinks.length} available`}
        </p>
        {allLinks.length === 0 ? (
          <div className="rounded-lg border border-dashed flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
            <p className="text-sm">You don't have any links in your library yet.</p>
            <a href="/links" className="text-primary text-sm hover:underline">Go to Link Vault →</a>
          </div>
        ) : availableLinks.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">All active links are already on your share pages.</p>
        ) : (
          <div className="space-y-2">
            {availableLinks.map(link => (
              <div key={link.id} className="flex items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3">
                <span className="text-lg shrink-0">{link.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{link.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{link.url.replace(/^https?:\/\//, "")}</p>
                  {link.description && <p className="text-xs text-muted-foreground/60 truncate">{link.description}</p>}
                </div>
                {link.category && <Badge variant="outline" className="text-xs shrink-0">{link.category}</Badge>}
                <Button size="sm" variant="outline" className="shrink-0 gap-1.5"
                  onClick={() => addLink(link.id)} disabled={saveMutation.isPending}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Compact Swipe Card ----
function SwipeCard({
  item,
  onPreview,
  onEdit,
  onDelete,
}: {
  item: SwipeItem;
  onPreview: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  const shareMutation = useMutation({
    mutationFn: () => apiFetch(`/api/swipe/${item.id}/share`, { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/swipe"] });
      copyLink(data.token);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function copyLink(token?: string) {
    const t = token ?? item.shareToken;
    if (!t) return;
    navigator.clipboard.writeText(shareUrl(t));
    setCopied(true);
    toast({ title: "Share link copied!" });
    setTimeout(() => setCopied(false), 2000);
  }

  const isImage = item.type === "upload" && item.imagePath && !imgError;

  return (
    <div
      className="group relative rounded-xl border bg-card overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:border-primary/40 hover:-translate-y-0.5"
      onClick={onPreview}
    >
      {/* Thumbnail */}
      <div className="relative overflow-hidden bg-muted/30" style={{ paddingBottom: "65%" }}>
        {isImage ? (
          <img
            src={swipeImageUrl(item.id)}
            alt={item.title}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-400"
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
          />
        ) : item.type === "snippet" ? (
          <div className="absolute inset-0 bg-gradient-to-br from-violet-950/60 to-slate-900/80 p-3.5 overflow-hidden">
            <p className="text-[10px] text-white/65 font-mono leading-relaxed line-clamp-8 select-none">{item.content}</p>
            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-slate-900/90 to-transparent pointer-events-none" />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground/25" />
          </div>
        )}

        {/* Hover overlay — preview hint */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors duration-200 flex items-center justify-center pointer-events-none">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/90 dark:bg-white/80 rounded-full p-2.5 shadow-xl">
            <ZoomIn className="h-4 w-4 text-slate-800" />
          </div>
        </div>

        {/* Type chip */}
        <div className="absolute top-2 left-2 pointer-events-none">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold tracking-wide ${
            item.type === "upload"
              ? "bg-amber-500/85 text-white"
              : "bg-violet-500/85 text-white"
          }`}>
            {item.type === "upload" ? "IMG" : "TXT"}
          </span>
        </div>

        {/* Shared indicator */}
        {item.shareToken && (
          <div className="absolute top-2 right-2 pointer-events-none">
            <Globe className="h-3.5 w-3.5 text-emerald-400 drop-shadow" />
          </div>
        )}
      </div>

      {/* Bottom strip: title + micro-actions */}
      <div className="px-3 py-2.5">
        <p className="text-sm font-medium truncate leading-snug mb-1.5">{item.title}</p>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {format(new Date(item.createdAt), "MMM d, yyyy")}
          </span>
          {/* Micro-action icons — stop click from opening preview */}
          <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
            {item.shareToken ? (
              <button
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Copy share link"
                onClick={() => copyLink()}
              >
                {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
              </button>
            ) : (
              <button
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Share"
                onClick={() => shareMutation.mutate()}
                disabled={shareMutation.isPending}
              >
                {shareMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Share2 className="h-3 w-3" />}
              </button>
            )}
            <button
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Edit"
              onClick={onEdit}
            >
              <Edit3 className="h-3 w-3" />
            </button>
            <button
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
              title="Delete"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Main Page ----
export default function SwipeFilePage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState("swipe");
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<SwipeItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<SwipeItem | null>(null);
  const [previewItem, setPreviewItem] = useState<SwipeItem | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "upload" | "snippet">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 30;

  const { data, isLoading } = useQuery<{ items: SwipeItem[] }>({
    queryKey: ["/api/swipe"],
    queryFn: () => apiFetch("/api/swipe"),
    enabled: !!user?.isAdmin,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/swipe/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/swipe"] });
      toast({ title: "Deleted" });
      setDeleteItem(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (authLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!user?.isAdmin) return <Redirect to="/dashboard" />;

  const items = data?.items ?? [];
  const filtered = items.filter(item => {
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return item.title.toLowerCase().includes(s)
        || (item.sourceUrl ?? "").toLowerCase().includes(s)
        || (item.notes ?? "").toLowerCase().includes(s)
        || (item.content ?? "").toLowerCase().includes(s);
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sharedCount = items.filter(i => !!i.shareToken).length;

  // Reset to page 1 whenever filters change
  useEffect(() => { setPage(1); }, [search, typeFilter]);

  // Keep previewItem in sync with updated data (e.g. after share mutation)
  const livePreviewItem = previewItem
    ? (items.find(i => i.id === previewItem.id) ?? previewItem)
    : null;

  return (
    <div className="min-h-screen bg-background">

      {/* ── Hero ── */}
      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220_70%_8%)] to-[hsl(35_60%_16%)]" />
        <div className="absolute -bottom-24 -right-12 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute -top-16 -left-8 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-xl bg-amber-500/20 ring-1 ring-amber-400/30 flex items-center justify-center shrink-0">
                  <Camera className="h-5 w-5 text-amber-300" />
                </div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Swipe File</h1>
              </div>
              <p className="text-white/60 text-sm mt-1 max-w-xl">
                Save screenshots and text snippets from around the web. Click any item to preview it full-size.
              </p>
            </div>
            {activeTab === "swipe" && (
              <Button
                onClick={() => setAddOpen(true)}
                className="bg-white text-[hsl(35,60%,25%)] hover:bg-white/90 shadow-lg gap-2 shrink-0"
              >
                <Plus className="h-4 w-4" /> Add Item
              </Button>
            )}
          </div>

          {/* Stats */}
          <div className="flex gap-6 mt-6">
            {[
              { label: "Total Items", value: items.length },
              { label: "Images", value: items.filter(i => i.type === "upload").length },
              { label: "Snippets", value: items.filter(i => i.type === "snippet").length },
              { label: "Shared", value: sharedCount, highlight: true },
            ].map(s => (
              <div key={s.label}>
                <p className={`text-2xl font-bold ${s.highlight ? "text-amber-300" : "text-white"}`}>{s.value}</p>
                <p className="text-xs text-white/60">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-0">
        <div className="border-b bg-card">
          <div className="max-w-6xl mx-auto px-6">
            <TabsList className="h-auto bg-transparent p-0 gap-0 rounded-none">
              <TabsTrigger
                value="swipe"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 font-medium gap-2"
              >
                <Camera className="h-4 w-4" /> Swipe File
              </TabsTrigger>
              <TabsTrigger
                value="promo"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3 font-medium gap-2"
              >
                <Link2 className="h-4 w-4" /> Promotional Links
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        {/* Swipe File Tab */}
        <TabsContent value="swipe" className="mt-0 focus-visible:outline-none">
          {/* Toolbar */}
          <div className="max-w-6xl mx-auto px-6 py-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Input
                placeholder="Search swipe file…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <div className="flex gap-1">
                {(["all", "upload", "snippet"] as const).map(f => (
                  <Button key={f} size="sm" variant={typeFilter === f ? "default" : "outline"}
                    onClick={() => setTypeFilter(f)} className="gap-1.5">
                    {f === "all" ? "All" : f === "upload" ? <><Camera className="h-3.5 w-3.5" />Images</> : <><FileText className="h-3.5 w-3.5" />Snippets</>}
                  </Button>
                ))}
              </div>
              {filtered.length > 0 && (
                <span className="text-sm text-muted-foreground ml-auto">
                  {filtered.length} item{filtered.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* Compact Grid */}
          <div className="max-w-6xl mx-auto px-6 pb-12">
            {isLoading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
                <div className="rounded-full bg-muted p-5">
                  <Camera className="h-10 w-10 text-muted-foreground/50" />
                </div>
                <h3 className="font-semibold text-lg">
                  {items.length === 0 ? "Your swipe file is empty" : "No items match your filters"}
                </h3>
                <p className="text-muted-foreground text-sm max-w-sm">
                  {items.length === 0
                    ? "Save screenshots and text snippets from around the web. Click any item to preview it full-size."
                    : "Try a different search term or filter."}
                </p>
                {items.length === 0 && (
                  <Button onClick={() => setAddOpen(true)} className="mt-2 gap-2">
                    <Plus className="h-4 w-4" /> Add Your First Item
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {paginated.map(item => (
                    <SwipeCard
                      key={item.id}
                      item={item}
                      onPreview={() => setPreviewItem(item)}
                      onEdit={() => setEditItem(item)}
                      onDelete={() => setDeleteItem(item)}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-8">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="gap-1.5"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> Previous
                    </Button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => {
                        const isActive = p === page;
                        const nearCurrent = Math.abs(p - page) <= 2;
                        const isEdge = p === 1 || p === totalPages;
                        if (!nearCurrent && !isEdge) {
                          // Show ellipsis at the boundary positions
                          if (p === page - 3 || p === page + 3) {
                            return <span key={p} className="px-1 text-muted-foreground text-sm">…</span>;
                          }
                          return null;
                        }
                        return (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={`h-8 w-8 rounded-md text-sm font-medium transition-colors ${
                              isActive
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {p}
                          </button>
                        );
                      })}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="gap-1.5"
                    >
                      Next <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}

                {/* Item count */}
                {totalPages > 1 && (
                  <p className="text-center text-xs text-muted-foreground pt-2 pb-4">
                    Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} items
                  </p>
                )}
              </>
            )}
          </div>
        </TabsContent>

        {/* Promotional Links Tab */}
        <TabsContent value="promo" className="mt-0 focus-visible:outline-none">
          <div className="max-w-3xl mx-auto px-6 py-8">
            {activeTab === "promo" && <PromoLinksTab />}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Preview Modal ── */}
      {livePreviewItem && (
        <PreviewModal
          item={livePreviewItem}
          items={filtered}
          onNavigate={setPreviewItem}
          onClose={() => setPreviewItem(null)}
          onEdit={() => setEditItem(livePreviewItem)}
          onDelete={() => setDeleteItem(livePreviewItem)}
        />
      )}

      {/* Add Dialog */}
      <AddItemDialog open={addOpen} onClose={() => setAddOpen(false)} />

      {/* Edit Dialog */}
      {editItem && <EditDialog item={editItem} onClose={() => setEditItem(null)} />}

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteItem} onOpenChange={v => !v && setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this item?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteItem?.title}" will be permanently deleted, including any active share link.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteItem && deleteMutation.mutate(deleteItem.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
