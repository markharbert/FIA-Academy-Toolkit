import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  Camera, FileText, Plus, Copy, Share2, Trash2, Edit3,
  ExternalLink, Eye, EyeOff, Link2, X, Check, Upload,
  Image as ImageIcon, Loader2, Globe, Scroll,
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

  // Shared
  const [tab, setTab] = useState<"upload" | "snippet" | "url">("upload");
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [notes, setNotes] = useState("");

  // Upload
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Snippet
  const [content, setContent] = useState("");

  // Full-page URL capture
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
      // 1. Get signed URL
      const { uploadURL, objectPath } = await apiFetch("/api/swipe/request-upload-url", { method: "POST" });
      // 2. PUT file directly
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
      // 3. Confirm
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

// ---- Promotional Links Tab ----
function PromoLinksTab() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: linksData, isLoading: linksLoading } = useQuery<AffiliateLink[]>({
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

  const allLinks = linksData ?? [];
  const promoLinkIds = promoData?.promoLinkIds ?? [];
  const promoSet = new Set(promoLinkIds);

  // Ordered list of added links (preserves user's add order)
  const addedLinks = promoLinkIds
    .map(id => allLinks.find(l => l.id === id))
    .filter(Boolean) as AffiliateLink[];

  // Active links from library not yet added
  const availableLinks = allLinks.filter(l => l.isActive && !promoSet.has(l.id));

  function addLink(id: string) {
    saveMutation.mutate([...promoLinkIds, id]);
  }

  function removeLink(id: string) {
    saveMutation.mutate(promoLinkIds.filter(lid => lid !== id));
  }

  if (linksLoading || promoLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Explainer */}
      <div className="rounded-lg border bg-card px-5 py-4 flex items-start gap-3">
        <Link2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
        <p className="text-sm text-muted-foreground">
          Pick links from your library. They appear on <strong className="text-foreground">every</strong> share page
          in your account — change them here and every page updates instantly.
        </p>
      </div>

      {/* Currently on share pages */}
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
              <div key={link.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
                <span className="text-lg shrink-0">{link.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{link.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {link.url.replace(/^https?:\/\//, "")}
                  </p>
                </div>
                <Button size="sm" variant="ghost"
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => removeLink(link.id)}
                  disabled={saveMutation.isPending}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Link vault picker */}
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
              <div key={link.id}
                className="flex items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3">
                <span className="text-lg shrink-0">{link.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{link.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {link.url.replace(/^https?:\/\//, "")}
                  </p>
                  {link.description && (
                    <p className="text-xs text-muted-foreground/60 truncate">{link.description}</p>
                  )}
                </div>
                {link.category && (
                  <Badge variant="outline" className="text-xs shrink-0">{link.category}</Badge>
                )}
                <Button size="sm" variant="outline" className="shrink-0 gap-1.5"
                  onClick={() => addLink(link.id)}
                  disabled={saveMutation.isPending}>
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

// ---- Swipe Item Card ----
function SwipeCard({ item, onEdit, onDelete }: { item: SwipeItem; onEdit: () => void; onDelete: () => void }) {
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
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group rounded-xl border bg-card overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      {/* Preview area */}
      {item.type === "upload" && item.imagePath && !imgError ? (
        <div className="relative bg-muted/40 overflow-hidden" style={{ paddingBottom: "56.25%" }}>
          <img
            src={swipeImageUrl(item.id)}
            alt={item.title}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        </div>
      ) : item.type === "snippet" ? (
        <div className="bg-muted/30 border-b px-4 py-3 h-28 overflow-hidden relative">
          <p className="text-xs text-muted-foreground font-mono leading-relaxed line-clamp-5">{item.content}</p>
          <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-muted/50 to-transparent" />
        </div>
      ) : (
        <div className="bg-muted/30 border-b flex items-center justify-center h-28">
          <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 p-3 space-y-2">
        <div className="flex items-start gap-2">
          <p className="font-medium text-sm flex-1 leading-tight">{item.title}</p>
          <Badge variant="secondary" className="shrink-0 text-xs capitalize">
            {item.type === "upload" ? <><Camera className="h-3 w-3 mr-1" />Image</> : <><FileText className="h-3 w-3 mr-1" />Snippet</>}
          </Badge>
        </div>

        {item.sourceUrl && (
          <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary truncate">
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate">{item.sourceUrl.replace(/^https?:\/\//, "")}</span>
          </a>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{format(new Date(item.createdAt), "MMM d, yyyy")}</span>
          {item.shareToken && (
            <span className="flex items-center gap-1 text-emerald-500">
              <Globe className="h-3 w-3" /> {item.viewCount} views
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="border-t px-3 py-2 flex items-center gap-1">
        {item.shareToken ? (
          <>
            <Button size="sm" variant="ghost" className="flex-1 gap-1.5 text-xs" onClick={() => copyLink()}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy Link"}
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground"
              onClick={() => unshareMutation.mutate()} disabled={unshareMutation.isPending}>
              <EyeOff className="h-3.5 w-3.5" /> Unshare
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="flex-1 gap-1.5 text-xs"
            onClick={() => shareMutation.mutate()} disabled={shareMutation.isPending}>
            {shareMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
            Share
          </Button>
        )}
        <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={onEdit}>
          <Edit3 className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
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
  const [typeFilter, setTypeFilter] = useState<"all" | "upload" | "snippet">("all");
  const [search, setSearch] = useState("");

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

  const sharedCount = items.filter(i => !!i.shareToken).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Camera className="h-7 w-7 text-primary" />
                Swipe File
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Save screenshots and text snippets from around the web. Share them with a link that showcases your offers.
              </p>
            </div>
            {activeTab === "swipe" && (
              <Button onClick={() => setAddOpen(true)} className="gap-2 shrink-0">
                <Plus className="h-4 w-4" /> Add Item
              </Button>
            )}
          </div>

          {/* Stats */}
          <div className="flex gap-6 mt-5">
            {[
              { label: "Total Items", value: items.length },
              { label: "Images", value: items.filter(i => i.type === "upload").length },
              { label: "Snippets", value: items.filter(i => i.type === "snippet").length },
              { label: "Shared", value: sharedCount, highlight: true },
            ].map(s => (
              <div key={s.label}>
                <p className={`text-2xl font-bold ${s.highlight ? "text-primary" : ""}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
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
                    onClick={() => setTypeFilter(f)} className="capitalize gap-1.5">
                    {f === "all" ? "All" : f === "upload" ? <><Camera className="h-3.5 w-3.5" />Images</> : <><FileText className="h-3.5 w-3.5" />Snippets</>}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Grid */}
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
                    ? "Save screenshots and text snippets from around the web. Share them with a link that showcases your offers."
                    : "Try a different search term or filter."}
                </p>
                {items.length === 0 && (
                  <Button onClick={() => setAddOpen(true)} className="mt-2 gap-2">
                    <Plus className="h-4 w-4" /> Add Your First Item
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map(item => (
                  <SwipeCard
                    key={item.id}
                    item={item}
                    onEdit={() => setEditItem(item)}
                    onDelete={() => setDeleteItem(item)}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Promotional Links Tab */}
        <TabsContent value="promo" className="mt-0 focus-visible:outline-none">
          <div className="max-w-3xl mx-auto px-6 py-8">
            <PromoLinksTab />
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <AddItemDialog open={addOpen} onClose={() => setAddOpen(false)} />
      {editItem && <EditDialog item={editItem} onClose={() => setEditItem(null)} />}

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
