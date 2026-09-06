import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, ChevronDown, ChevronRight, Download, Eye, EyeOff, Film, Folder, ListVideo, Loader2, Pencil, Plus, Save, Trash2, Tag, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/projects/rich-text-editor";
import { useToast } from "@/hooks/use-toast";

type Resource = { id: string; name: string; url: string; subtitle: string | null; kind: "link" | "pdf" };
type Replay = { id: string; title: string; description: string | null; category: string | null; tags: string[]; durationMinutes: number | null; videoUrl: string | null; content: string | null; status: "draft" | "published"; resources: Resource[]; transcriptText: string | null; transcriptChapters: unknown[] | null };
type VimeoFolder = { id: string; name: string; parentId?: string; path: string[] };
type VimeoVideo = { id: string; name: string; url: string; thumbnailUrl?: string };
type VimeoVideoPage = { videos: VimeoVideo[]; hasMore: boolean };
type Track = { id: string; language: string; name: string; type: string };
type Form = Omit<Replay, "resources" | "tags"> & { tags: string };
type ReplayUpdate = Pick<Form, "title" | "description" | "category" | "durationMinutes" | "videoUrl" | "content" | "status"> & { tags: string[] };

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "include", ...init });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || response.statusText);
  }
  return response.json();
}

type VimeoFolderNode = VimeoFolder & { children: VimeoFolderNode[] };

const VIMEO_LAST_FOLDER_STORAGE_KEY = "academy-toolkit:last-vimeo-folder";

function buildVimeoFolderTree(folders: VimeoFolder[]): VimeoFolderNode[] {
  const nodes = new Map<string, VimeoFolderNode>(
    folders.map((folder) => [folder.id, { ...folder, children: [] }]),
  );
  const roots: VimeoFolderNode[] = [];

  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }

  const sortNodes = (items: VimeoFolderNode[]) => {
    items.sort((a, b) => a.name.localeCompare(b.name));
    items.forEach((item) => sortNodes(item.children));
  };
  sortNodes(roots);
  return roots;
}

function flattenVimeoFolderTree(nodes: VimeoFolderNode[]): VimeoFolderNode[] {
  return nodes.flatMap((node) => [node, ...flattenVimeoFolderTree(node.children)]);
}

function academyFolders(folders: VimeoFolder[]) {
  const permitted = new Set(folders.filter((folder) => folder.name.trim().toLowerCase() === "fearless influencer academy").map((folder) => folder.id));
  let changed = true;
  while (changed) {
    changed = false;
    folders.forEach((folder) => {
      if ((folder.parentId && permitted.has(folder.parentId)) || folder.path?.some((part) => part.trim().toLowerCase() === "fearless influencer academy")) {
        if (!permitted.has(folder.id)) { permitted.add(folder.id); changed = true; }
      }
    });
  }
  return folders.filter((folder) => permitted.has(folder.id));
}

function detectVideoProvider(url: string): "youtube" | "vimeo" | "other" | null {
  if (!url) return null;
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("vimeo.com")) return "vimeo";
  if (url.startsWith("http")) return "other";
  return null;
}

function VideoPreview({ url }: { url: string }) {
  const provider = detectVideoProvider(url);
  let embedUrl: string | null = null;
  if (provider === "youtube") {
    const videoId = url.includes("youtu.be/")
      ? url.split("youtu.be/")[1]?.split("?")[0]
      : new URLSearchParams(url.split("?")[1] || "").get("v");
    if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}`;
  }
  if (provider === "vimeo") {
    try {
      const parsed = new URL(url);
      const videoId = parsed.pathname.match(/(?:^|\/)(?:video\/)?(\d+)(?:\/|$)/)?.[1];
      if (videoId) embedUrl = `https://player.vimeo.com/video/${videoId}${parsed.search}`;
    } catch {
      embedUrl = null;
    }
  }
  if (!embedUrl) return null;
  return <div className="mt-3 aspect-video overflow-hidden rounded-lg bg-slate-950"><iframe src={embedUrl} className="h-full w-full" allowFullScreen title="Video preview" /></div>;
}

export default function AdminTrainingReplayEditorPage() {
  const { replayId } = useParams<{ replayId: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [, setSaveVersion] = useState(0);
  const formRef = useRef<Form | null>(null);
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const saving = useRef<Promise<boolean> | null>(null);
  const queued = useRef<number | null>(null);
  const [selectedVimeoFolderId, setSelectedVimeoFolderId] = useState("all");
  const [vimeoVideoPage, setVimeoVideoPage] = useState(1);
  const [vimeoFolderFilter, setVimeoFolderFilter] = useState("");
  const [expandedVimeoFolders, setExpandedVimeoFolders] = useState<Record<string, boolean>>({});
  const [resourceEditor, setResourceEditor] = useState<Resource | null>(null);
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
  const [resource, setResource] = useState({ name: "", url: "", subtitle: "", kind: "link" as "link" | "pdf" });
  const [trackPickerOpen, setTrackPickerOpen] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [vimeoPickerOpen, setVimeoPickerOpen] = useState(false);

  const replayQuery = useQuery<Replay>({
    queryKey: ["/api/admin/training-replays", replayId],
    queryFn: () => api(`/api/admin/training-replays/${replayId}`),
  });
  const catalogQuery = useQuery<Replay[]>({
    queryKey: ["/api/admin/training-replays"],
    queryFn: () => api("/api/admin/training-replays"),
  });
  const categories = useMemo(
    () => [...new Set((catalogQuery.data || []).map((item) => item.category?.trim()).filter(Boolean) as string[])].sort(),
    [catalogQuery.data],
  );
  useEffect(() => {
    if (replayQuery.data && !formRef.current) {
      const next = { ...replayQuery.data, tags: (replayQuery.data.tags || []).join(", ") };
      setForm(next); formRef.current = next;
    }
  }, [replayQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (data: Form) => {
      const update: ReplayUpdate = {
        title: data.title,
        description: data.description,
        category: data.category,
        durationMinutes: data.durationMinutes,
        videoUrl: data.videoUrl,
        content: data.content,
        status: data.status,
        tags: data.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      };
      return api(`/api/admin/training-replays/${replayId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    },
    onError: (error: Error) => toast({ title: "Save failed", description: error.message, variant: "destructive" }),
  });
  const saveRevision = async (target: number): Promise<boolean> => {
    if (saving.current) { queued.current = Math.max(queued.current ?? 0, target); return saving.current; }
    const current = formRef.current;
    if (!current || target <= savedRevision.current) return true;
    const promise = (async () => {
      try {
        await saveMutation.mutateAsync(current);
        savedRevision.current = Math.max(savedRevision.current, target);
        setSaveVersion((version) => version + 1);
        return true;
      } catch { return false; }
      finally {
        saving.current = null;
        const later = queued.current; queued.current = null;
        if (later && later > target) await saveRevision(later);
      }
    })();
    saving.current = promise;
    return promise;
  };
  const isDirty = revision.current > savedRevision.current;
  const change = (field: keyof Form, value: Form[keyof Form]) => {
    if (!formRef.current) return;
    const next = { ...formRef.current, [field]: value };
    formRef.current = next; setForm(next); revision.current += 1;
    if (timer.current) clearTimeout(timer.current);
    const target = revision.current;
    timer.current = setTimeout(() => void saveRevision(target), 1600);
  };
  const saveNow = async () => {
    if (timer.current) clearTimeout(timer.current);
    const ok = await saveRevision(revision.current);
    if (ok) toast({ title: "Saved" });
  };
  const backToLibrary = async () => {
    if (timer.current) clearTimeout(timer.current);
    if (revision.current > savedRevision.current && !(await saveRevision(revision.current))) {
      toast({ title: "Changes were not saved", description: "Please try saving before leaving.", variant: "destructive" });
      return;
    }
    setLocation("/admin/training-library");
  };
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (revision.current > savedRevision.current) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", warn);
    return () => { if (timer.current) clearTimeout(timer.current); window.removeEventListener("beforeunload", warn); };
  }, []);

  const foldersQuery = useQuery<{ folders: VimeoFolder[] }>({
    queryKey: ["/api/admin/vimeo/folders"],
    queryFn: () => api("/api/admin/vimeo/folders"),
    enabled: vimeoPickerOpen,
  });
  const folders = useMemo(() => academyFolders(foldersQuery.data?.folders || []), [foldersQuery.data]);
  const vimeoFolderTree = useMemo(() => buildVimeoFolderTree(folders), [folders]);
  const vimeoFolderSearchResults = useMemo(() => {
    const filter = vimeoFolderFilter.trim().toLowerCase();
    if (!filter) return [];
    return flattenVimeoFolderTree(vimeoFolderTree).filter((folder) =>
      [folder.name, ...(folder.path || [])].some((part) => part.toLowerCase().includes(filter)),
    );
  }, [vimeoFolderFilter, vimeoFolderTree]);
  const videosQuery = useQuery<VimeoVideoPage>({
    queryKey: ["/api/admin/vimeo/folders", selectedVimeoFolderId, "videos", vimeoVideoPage],
    queryFn: () => api(`/api/admin/vimeo/folders/${selectedVimeoFolderId}/videos?page=${vimeoVideoPage}`),
    enabled: vimeoPickerOpen && selectedVimeoFolderId !== "all",
  });
  const tracksQuery = useQuery<{ tracks: Track[] }>({ queryKey: ["/api/admin/training-replays", replayId, "vimeo-transcript-tracks"], queryFn: () => api(`/api/admin/training-replays/${replayId}/vimeo-transcript-tracks`), enabled: trackPickerOpen });
  useEffect(() => {
    if (!vimeoPickerOpen) return;
    const savedFolderId = window.localStorage.getItem(VIMEO_LAST_FOLDER_STORAGE_KEY);
    setSelectedVimeoFolderId(savedFolderId || "all");
    setVimeoVideoPage(1);
    setVimeoFolderFilter("");
  }, [vimeoPickerOpen]);
  useEffect(() => {
    if (!vimeoPickerOpen || !foldersQuery.data?.folders) return;
    const academyFolder = folders.find(
      (folder) => folder.name.trim().toLowerCase() === "fearless influencer academy",
    );
    const selectedFolderIsInAcademy = folders.some((folder) => folder.id === selectedVimeoFolderId);
    if (academyFolder && !selectedFolderIsInAcademy) {
      setSelectedVimeoFolderId(academyFolder.id);
      setVimeoVideoPage(1);
      window.localStorage.setItem(VIMEO_LAST_FOLDER_STORAGE_KEY, academyFolder.id);
    }
  }, [folders, foldersQuery.data?.folders, selectedVimeoFolderId, vimeoPickerOpen]);
  const selectVimeoFolder = (folderId: string) => {
    setSelectedVimeoFolderId(folderId);
    setVimeoVideoPage(1);
    window.localStorage.setItem(VIMEO_LAST_FOLDER_STORAGE_KEY, folderId);
  };
  const renderVimeoFolder = (folder: VimeoFolderNode, depth = 0): JSX.Element => {
    const isExpanded = expandedVimeoFolders[folder.id] ?? depth === 0;
    return (
      <div key={folder.id}>
        <div className="flex items-start gap-0.5">
          {folder.children.length > 0 ? (
            <button
              type="button"
              aria-label={isExpanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
              className="flex h-7 w-6 shrink-0 items-center justify-center rounded hover:bg-muted"
              onClick={() => setExpandedVimeoFolders((current) => ({
                ...current,
                [folder.id]: !isExpanded,
              }))}
            >
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="w-6 shrink-0" />
          )}
          <Button
            type="button"
            variant={selectedVimeoFolderId === folder.id ? "secondary" : "ghost"}
            className="h-auto min-h-10 min-w-0 flex-1 justify-start gap-2 py-2 text-left"
            style={{ paddingLeft: `${8 + Math.min(depth, 6) * 8}px` }}
            onClick={() => selectVimeoFolder(folder.id)}
          >
            <Folder className="h-4 w-4 shrink-0" />
            <span className="whitespace-normal break-words">{folder.name}</span>
          </Button>
        </div>
        {isExpanded && folder.children.map((child) => renderVimeoFolder(child, depth + 1))}
      </div>
    );
  };
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/training-replays", replayId] });
  const transcriptMutation = useMutation({
    mutationFn: ({ path, body, method = "POST" }: { path: string; body?: object; method?: string }) =>
      api(`/api/admin/training-replays/${replayId}/${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      }),
    onSuccess: (updated: Replay) => {
      setTrackPickerOpen(false);
      if (formRef.current) {
        const next = {
          ...formRef.current,
          transcriptText: updated.transcriptText,
          transcriptChapters: updated.transcriptChapters,
        };
        formRef.current = next;
        setForm(next);
      }
      invalidate();
    },
    onError: (error: Error) =>
      toast({ title: "Transcript action failed", description: error.message, variant: "destructive" }),
  });
  const resourceMutation = useMutation({
    mutationFn: () => api(resourceEditor ? `/api/admin/training-replays/${replayId}/resources/${resourceEditor.id}` : `/api/admin/training-replays/${replayId}/resources`, { method: resourceEditor ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...resource, subtitle: resource.subtitle || null }) }),
    onSuccess: () => { setResourceDialogOpen(false); setResourceEditor(null); setResource({ name: "", url: "", subtitle: "", kind: "link" }); invalidate(); },
    onError: (error: Error) => toast({ title: "Couldn’t save resource", description: error.message, variant: "destructive" }),
  });
  const deleteResource = useMutation({ mutationFn: (id: string) => api(`/api/admin/training-replays/${replayId}/resources/${id}`, { method: "DELETE" }), onSuccess: invalidate, onError: (error: Error) => toast({ title: "Couldn’t delete resource", description: error.message, variant: "destructive" }) });
  const openResource = (item?: Resource) => { setResourceEditor(item || null); setResource(item ? { name: item.name, url: item.url, subtitle: item.subtitle || "", kind: item.kind } : { name: "", url: "", subtitle: "", kind: "link" }); setResourceDialogOpen(true); };

  if (replayQuery.isLoading || !form) return <div className="mx-auto max-w-3xl p-6 sm:p-8"><div className="h-8 w-56 animate-pulse rounded bg-muted" /><div className="mt-5 h-80 animate-pulse rounded bg-muted" /></div>;
  if (replayQuery.isError) return <div className="mx-auto max-w-3xl p-8 text-destructive">Couldn’t load this replay. {replayQuery.error instanceof Error ? replayQuery.error.message : ""}</div>;
  return <main className="min-h-[calc(100dvh-3rem)] bg-[radial-gradient(circle_at_12%_0%,hsl(254_74%_94%),transparent_32rem)] p-4 sm:p-8">
     <div className="mx-auto max-w-3xl">
    <header className="mb-7 flex items-start gap-3 border-b border-violet-100 pb-6"><Button variant="ghost" size="icon" className="mt-0.5 shrink-0" onClick={() => void backToLibrary()}><ArrowLeft className="h-4 w-4" /></Button><div className="min-w-0 flex-1"><p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-violet-700">Academy vault / replay</p><Input value={form.title} onChange={(e) => change("title", e.target.value)} className="h-auto border-0 bg-transparent px-0 text-2xl font-extrabold shadow-none focus-visible:ring-0" /><div className="mt-1 flex flex-wrap items-center gap-2"><Badge variant={form.status === "published" ? "default" : "secondary"} className="capitalize">{form.status}</Badge>{isDirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}{saveMutation.isPending && <span className="text-xs text-muted-foreground">Saving changes</span>}</div></div><div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" onClick={() => void saveNow()} disabled={!isDirty || saveMutation.isPending}><Save className="mr-1 h-4 w-4" />Save</Button><Button size="sm" variant={form.status === "published" ? "outline" : "default"} onClick={() => change("status", form.status === "published" ? "draft" : "published")}>{form.status === "published" ? <><EyeOff className="mr-1 h-4 w-4" />Unpublish</> : <><Eye className="mr-1 h-4 w-4" />Publish</>}</Button></div></header>
     <div className="space-y-6">
       <section className="grid gap-4 rounded-lg border bg-white/70 p-4 sm:grid-cols-2"><div className="sm:col-span-2"><Label>Description</Label><Textarea className="mt-1 min-h-24" value={form.description || ""} onChange={(e) => change("description", e.target.value)} placeholder="A clear summary for members browsing the vault." /></div><div className="sm:col-span-2"><Label className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5 text-violet-600" />Category</Label>{addingCategory ? <div className="mt-1 space-y-2"><Input autoFocus value={categoryDraft} placeholder="New category name" onChange={(e) => setCategoryDraft(e.target.value)} /><div className="flex gap-2"><Button type="button" size="sm" disabled={!categoryDraft.trim()} onClick={() => { change("category", categoryDraft.trim()); setAddingCategory(false); setCategoryDraft(""); }}>Add category</Button><Button type="button" size="sm" variant="ghost" onClick={() => { setAddingCategory(false); setCategoryDraft(""); }}>Cancel</Button></div></div> : <Select value={form.category || "__none"} onValueChange={(value) => { if (value === "__new") { setCategoryDraft(""); setAddingCategory(true); } else change("category", value === "__none" ? null : value); }}><SelectTrigger className="mt-1"><SelectValue placeholder="Choose a category" /></SelectTrigger><SelectContent><SelectItem value="__none">No category</SelectItem>{categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}<SelectItem value="__new">Create a new category</SelectItem></SelectContent></Select>}</div><div><Label>Duration (min)</Label><Input className="mt-1" type="number" value={form.durationMinutes || ""} onChange={(e) => change("durationMinutes", e.target.value ? Number(e.target.value) : null)} /></div><div><Label>Tags</Label><Input className="mt-1" value={form.tags} onChange={(e) => change("tags", e.target.value)} placeholder="mindset, strategy" /></div></section>
       <Separator />
       <section className="space-y-2"><Label className="flex items-center gap-1.5"><LinkIcon className="h-4 w-4 text-muted-foreground" />Video URL</Label><div className="flex gap-2"><Input className="min-w-0 flex-1" value={form.videoUrl || ""} onChange={(e) => change("videoUrl", e.target.value)} placeholder="https://youtube.com/watch… or https://vimeo.com/…" /><Button type="button" variant="outline" className="shrink-0" onClick={() => setVimeoPickerOpen(true)}><Film className="mr-1.5 h-4 w-4 text-blue-500" />Choose Vimeo</Button></div><VideoPreview url={form.videoUrl || ""} /></section>
      <section className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Transcript & chapters</h2><p className="text-sm text-muted-foreground">{form.transcriptText ? "Transcript imported." : "Import a Vimeo caption track to make this searchable."}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setTrackPickerOpen(true)}>Import transcript</Button>{form.transcriptText && <><a href={`/api/admin/training-replays/${replayId}/transcript/download`}><Button variant="outline" size="sm"><Download className="mr-1 h-4 w-4" />Download</Button></a><Button variant="outline" size="sm" onClick={() => transcriptMutation.mutate({ path: "transcript-chapters" })}><ListVideo className="mr-1 h-4 w-4" />Chapters</Button><Button variant="ghost" size="sm" className="text-destructive" onClick={() => transcriptMutation.mutate({ path: "transcript", method: "DELETE" })}>Delete</Button></>}</div></div></section>
       <Separator />
       <section><Label className="mb-2 block">Replay content</Label><RichTextEditor value={form.content || ""} onChange={(value) => change("content", value)} /></section>
      <section className="rounded-xl border p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Resources</h2><Button size="sm" variant="outline" onClick={() => openResource()}><Plus className="mr-1 h-4 w-4" />Add resource</Button></div><div className="mt-3 space-y-2">{(replayQuery.data?.resources || []).map((item) => <div key={item.id} className="flex items-center justify-between rounded bg-muted/50 p-2 text-sm"><span>{item.name}</span><span><Button size="icon" variant="ghost" onClick={() => openResource(item)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteResource.mutate(item.id)}><Trash2 className="h-4 w-4" /></Button></span></div>)}</div></section>
    </div></div>
    <Dialog open={resourceDialogOpen} onOpenChange={(open) => { setResourceDialogOpen(open); if (!open) { setResourceEditor(null); setResource({ name: "", url: "", subtitle: "", kind: "link" }); } }}><DialogContent><DialogHeader><DialogTitle>{resourceEditor ? "Edit resource" : "Add resource"}</DialogTitle></DialogHeader><div className="space-y-3"><Input placeholder="Resource name" value={resource.name} onChange={(e) => setResource({ ...resource, name: e.target.value })} /><Input placeholder="https://…" value={resource.url} onChange={(e) => setResource({ ...resource, url: e.target.value })} /><Input placeholder="Optional description" value={resource.subtitle} onChange={(e) => setResource({ ...resource, subtitle: e.target.value })} /><select className="w-full rounded border bg-background p-2" value={resource.kind} onChange={(e) => setResource({ ...resource, kind: e.target.value as "link" | "pdf" })}><option value="link">Link</option><option value="pdf">PDF</option></select><Button className="w-full" disabled={!resource.name || !resource.url || resourceMutation.isPending} onClick={() => resourceMutation.mutate()}>{resourceEditor ? "Save resource" : "Add resource"}</Button></div></DialogContent></Dialog>
      <Dialog open={vimeoPickerOpen} onOpenChange={setVimeoPickerOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Film className="h-5 w-5 text-blue-500" />
              Choose a Vimeo video
            </DialogTitle>
            <DialogDescription>
              Select a Fearless Influencer Academy video to use for this replay.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[24rem_minmax(0,1fr)]">
            <div className="max-h-[55vh] space-y-1 overflow-y-auto rounded-md border bg-muted/20 p-2">
              <Input
                value={vimeoFolderFilter}
                onChange={(event) => setVimeoFolderFilter(event.target.value)}
                placeholder="Search folders…"
                className="mb-2 h-8 text-sm"
              />
              <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Folders
              </p>
              {foldersQuery.isLoading ? (
                <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading folders…
                </div>
              ) : foldersQuery.isError ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  The Fearless Influencer Academy folder is unavailable for this Vimeo token.
                </p>
              ) : vimeoFolderFilter.trim() ? (
                vimeoFolderSearchResults.length > 0 ? (
                  <div className="space-y-1">
                    {vimeoFolderSearchResults.map((folder) => (
                      <Button
                        key={folder.id}
                        type="button"
                        variant={selectedVimeoFolderId === folder.id ? "secondary" : "ghost"}
                        className="h-auto w-full justify-start gap-2 py-2 text-left"
                        onClick={() => selectVimeoFolder(folder.id)}
                      >
                        <Folder className="h-4 w-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block whitespace-normal break-words text-sm">{folder.name}</span>
                          {folder.path.length > 0 && (
                            <span className="block whitespace-normal break-words text-xs font-normal text-muted-foreground">
                              {folder.path.join(" / ")}
                            </span>
                          )}
                        </span>
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="px-2 py-3 text-xs text-muted-foreground">No matching folders.</p>
                )
              ) : vimeoFolderTree.length > 0 ? (
                vimeoFolderTree.map((folder) => renderVimeoFolder(folder))
              ) : (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  The Fearless Influencer Academy folder was not found.
                </p>
              )}
            </div>
            <div className="min-w-0">
              {videosQuery.isLoading ? (
                <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading videos…
                </div>
              ) : videosQuery.isError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {(videosQuery.error as Error).message || "Unable to load Vimeo videos."}
                </div>
              ) : (videosQuery.data?.videos ?? []).length === 0 ? (
                <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                  No videos in this folder.
                </div>
              ) : (
                <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                  {(videosQuery.data?.videos ?? []).map((video) => (
                    <button
                      key={video.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-md border p-2 text-left transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring"
                      onClick={() => {
                        change("videoUrl", video.url);
                        setVimeoPickerOpen(false);
                      }}
                    >
                      {video.thumbnailUrl ? (
                        <img src={video.thumbnailUrl} alt="" className="h-12 w-20 rounded bg-muted object-cover" />
                      ) : (
                        <div className="flex h-12 w-20 items-center justify-center rounded bg-muted">
                          <Film className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{video.name}</span>
                    </button>
                  ))}
                  <div className="flex items-center justify-between border-t pt-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={vimeoVideoPage === 1}
                      onClick={() => setVimeoVideoPage((page) => page - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground">Page {vimeoVideoPage}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!videosQuery.data?.hasMore}
                      onClick={() => setVimeoVideoPage((page) => page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    <Dialog open={trackPickerOpen} onOpenChange={setTrackPickerOpen}><DialogContent><DialogHeader><DialogTitle>Import Vimeo transcript</DialogTitle><DialogDescription>Choose the caption language Vimeo should import.</DialogDescription></DialogHeader>{tracksQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading tracks…</p> : tracksQuery.isError ? <p className="text-sm text-destructive">{tracksQuery.error instanceof Error ? tracksQuery.error.message : "Couldn’t load Vimeo tracks."}</p> : <div className="space-y-2">{tracksQuery.data?.tracks.map((track) => <Button key={track.id} variant="outline" className="w-full justify-start" onClick={() => transcriptMutation.mutate({ path: "vimeo-transcript", body: { trackId: track.id } })}>{track.name || track.language} <span className="ml-2 text-muted-foreground">{track.language}</span></Button>)}{!tracksQuery.data?.tracks.length && <p className="text-sm text-muted-foreground">No caption tracks are available for this Vimeo video.</p>}</div>}</DialogContent></Dialog>
  </main>;
}