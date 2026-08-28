import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Download, Eye, EyeOff, Film, ListVideo, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichTextEditor } from "@/components/projects/rich-text-editor";
import { useToast } from "@/hooks/use-toast";

type Resource = { id: string; name: string; url: string; subtitle: string | null; kind: "link" | "pdf" };
type Replay = { id: string; title: string; description: string | null; category: string | null; tags: string[]; durationMinutes: number | null; videoUrl: string | null; content: string | null; status: "draft" | "published"; resources: Resource[]; transcriptText: string | null; transcriptChapters: unknown[] | null };
type Folder = { id: string; name: string; parentId?: string; path?: string[] };
type VimeoVideo = { id: string; name: string; url: string };
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

function academyFolders(folders: Folder[]) {
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
  const [folderId, setFolderId] = useState("");
  const [resourceEditor, setResourceEditor] = useState<Resource | null>(null);
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
  const [resource, setResource] = useState({ name: "", url: "", subtitle: "", kind: "link" as "link" | "pdf" });
  const [trackPickerOpen, setTrackPickerOpen] = useState(false);

  const replayQuery = useQuery<Replay>({
    queryKey: ["/api/admin/training-replays", replayId],
    queryFn: () => api(`/api/admin/training-replays/${replayId}`),
  });
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

  const foldersQuery = useQuery<{ folders: Folder[] }>({ queryKey: ["/api/admin/vimeo/folders"], queryFn: () => api("/api/admin/vimeo/folders") });
  const folders = useMemo(() => academyFolders(foldersQuery.data?.folders || []), [foldersQuery.data]);
  useEffect(() => { if (!folderId && folders[0]) setFolderId(folders[0].id); }, [folderId, folders]);
  const videosQuery = useQuery<{ videos: VimeoVideo[] }>({ queryKey: ["/api/admin/vimeo/folders", folderId, "videos"], queryFn: () => api(`/api/admin/vimeo/folders/${folderId}/videos`), enabled: !!folderId });
  const tracksQuery = useQuery<{ tracks: Track[] }>({ queryKey: ["/api/admin/training-replays", replayId, "vimeo-transcript-tracks"], queryFn: () => api(`/api/admin/training-replays/${replayId}/vimeo-transcript-tracks`), enabled: trackPickerOpen });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/training-replays", replayId] });
  const transcriptMutation = useMutation({ mutationFn: ({ path, body, method = "POST" }: { path: string; body?: object; method?: string }) => api(`/api/admin/training-replays/${replayId}/${path}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }), onSuccess: () => { setTrackPickerOpen(false); invalidate(); }, onError: (error: Error) => toast({ title: "Transcript action failed", description: error.message, variant: "destructive" }) });
  const resourceMutation = useMutation({
    mutationFn: () => api(resourceEditor ? `/api/admin/training-replays/${replayId}/resources/${resourceEditor.id}` : `/api/admin/training-replays/${replayId}/resources`, { method: resourceEditor ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...resource, subtitle: resource.subtitle || null }) }),
    onSuccess: () => { setResourceDialogOpen(false); setResourceEditor(null); setResource({ name: "", url: "", subtitle: "", kind: "link" }); invalidate(); },
    onError: (error: Error) => toast({ title: "Couldn’t save resource", description: error.message, variant: "destructive" }),
  });
  const deleteResource = useMutation({ mutationFn: (id: string) => api(`/api/admin/training-replays/${replayId}/resources/${id}`, { method: "DELETE" }), onSuccess: invalidate, onError: (error: Error) => toast({ title: "Couldn’t delete resource", description: error.message, variant: "destructive" }) });
  const openResource = (item?: Resource) => { setResourceEditor(item || null); setResource(item ? { name: item.name, url: item.url, subtitle: item.subtitle || "", kind: item.kind } : { name: "", url: "", subtitle: "", kind: "link" }); setResourceDialogOpen(true); };

  if (replayQuery.isLoading || !form) return <div className="mx-auto max-w-4xl p-8"><div className="h-8 w-56 animate-pulse rounded bg-muted" /><div className="mt-5 h-80 animate-pulse rounded bg-muted" /></div>;
  if (replayQuery.isError) return <div className="mx-auto max-w-4xl p-8 text-destructive">Couldn’t load this replay. {replayQuery.error instanceof Error ? replayQuery.error.message : ""}</div>;
  return <main className="mx-auto max-w-4xl p-4 sm:p-8">
    <header className="mb-8 flex items-start gap-3"><Button variant="ghost" size="icon" onClick={() => void backToLibrary()}><ArrowLeft className="h-4 w-4" /></Button><div className="min-w-0 flex-1"><Input value={form.title} onChange={(e) => change("title", e.target.value)} className="h-auto border-0 bg-transparent px-0 text-2xl font-bold shadow-none focus-visible:ring-0" /><div className="mt-1 flex gap-2"><Badge variant={form.status === "published" ? "default" : "secondary"} className="capitalize">{form.status}</Badge>{isDirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}</div></div><Button variant="outline" size="sm" onClick={() => void saveNow()} disabled={!isDirty || saveMutation.isPending}><Save className="mr-1 h-4 w-4" />Save</Button><Button size="sm" variant={form.status === "published" ? "outline" : "default"} onClick={() => change("status", form.status === "published" ? "draft" : "published")}>{form.status === "published" ? <><EyeOff className="mr-1 h-4 w-4" />Unpublish</> : <><Eye className="mr-1 h-4 w-4" />Publish</>}</Button></header>
    <div className="space-y-7">
      <section className="grid gap-4 sm:grid-cols-2"><div><Label>Description</Label><Textarea value={form.description || ""} onChange={(e) => change("description", e.target.value)} /></div><div className="grid grid-cols-2 gap-3"><div><Label>Category</Label><Input value={form.category || ""} onChange={(e) => change("category", e.target.value)} /></div><div><Label>Duration (min)</Label><Input type="number" value={form.durationMinutes || ""} onChange={(e) => change("durationMinutes", e.target.value ? Number(e.target.value) : null)} /></div><div className="col-span-2"><Label>Tags (comma separated)</Label><Input value={form.tags} onChange={(e) => change("tags", e.target.value)} /></div></div></section>
      <section className="space-y-3"><Label>Vimeo video</Label><Input value={form.videoUrl || ""} onChange={(e) => change("videoUrl", e.target.value)} placeholder="https://vimeo.com/…" /><div className="rounded-lg border p-3"><Label className="mb-2 block text-xs"><Film className="mr-1 inline h-3.5 w-3.5" />Fearless Influencer Academy videos</Label><select className="mb-2 w-full rounded border bg-background p-2 text-sm" value={folderId} onChange={(e) => setFolderId(e.target.value)}>{folders.map((folder) => <option key={folder.id} value={folder.id}>{[...(folder.path || []), folder.name].join(" / ")}</option>)}</select><div className="grid gap-2 sm:grid-cols-2">{videosQuery.data?.videos.map((video) => <button type="button" className="rounded border p-2 text-left text-sm hover:bg-muted" key={video.id} onClick={() => change("videoUrl", video.url)}>{video.name}</button>)}</div></div></section>
      <section><Label className="mb-2 block">Replay content</Label><RichTextEditor value={form.content || ""} onChange={(value) => change("content", value)} /></section>
      <section className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Transcript & chapters</h2><p className="text-sm text-muted-foreground">{form.transcriptText ? "Transcript imported." : "Import a Vimeo caption track to make this searchable."}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => setTrackPickerOpen(true)}>Import transcript</Button>{form.transcriptText && <><a href={`/api/admin/training-replays/${replayId}/transcript/download`}><Button variant="outline" size="sm"><Download className="mr-1 h-4 w-4" />Download</Button></a><Button variant="outline" size="sm" onClick={() => transcriptMutation.mutate({ path: "transcript-chapters" })}><ListVideo className="mr-1 h-4 w-4" />Chapters</Button><Button variant="ghost" size="sm" className="text-destructive" onClick={() => transcriptMutation.mutate({ path: "transcript", method: "DELETE" })}>Delete</Button></>}</div></div></section>
      <section className="rounded-xl border p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Resources</h2><Button size="sm" variant="outline" onClick={() => openResource()}><Plus className="mr-1 h-4 w-4" />Add resource</Button></div><div className="mt-3 space-y-2">{(replayQuery.data?.resources || []).map((item) => <div key={item.id} className="flex items-center justify-between rounded bg-muted/50 p-2 text-sm"><span>{item.name}</span><span><Button size="icon" variant="ghost" onClick={() => openResource(item)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteResource.mutate(item.id)}><Trash2 className="h-4 w-4" /></Button></span></div>)}</div></section>
    </div>
    <Dialog open={resourceDialogOpen} onOpenChange={(open) => { setResourceDialogOpen(open); if (!open) { setResourceEditor(null); setResource({ name: "", url: "", subtitle: "", kind: "link" }); } }}><DialogContent><DialogHeader><DialogTitle>{resourceEditor ? "Edit resource" : "Add resource"}</DialogTitle></DialogHeader><div className="space-y-3"><Input placeholder="Resource name" value={resource.name} onChange={(e) => setResource({ ...resource, name: e.target.value })} /><Input placeholder="https://…" value={resource.url} onChange={(e) => setResource({ ...resource, url: e.target.value })} /><Input placeholder="Optional description" value={resource.subtitle} onChange={(e) => setResource({ ...resource, subtitle: e.target.value })} /><select className="w-full rounded border bg-background p-2" value={resource.kind} onChange={(e) => setResource({ ...resource, kind: e.target.value as "link" | "pdf" })}><option value="link">Link</option><option value="pdf">PDF</option></select><Button className="w-full" disabled={!resource.name || !resource.url || resourceMutation.isPending} onClick={() => resourceMutation.mutate()}>{resourceEditor ? "Save resource" : "Add resource"}</Button></div></DialogContent></Dialog>
    <Dialog open={trackPickerOpen} onOpenChange={setTrackPickerOpen}><DialogContent><DialogHeader><DialogTitle>Import Vimeo transcript</DialogTitle><DialogDescription>Choose the caption language Vimeo should import.</DialogDescription></DialogHeader>{tracksQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading tracks…</p> : tracksQuery.isError ? <p className="text-sm text-destructive">{tracksQuery.error instanceof Error ? tracksQuery.error.message : "Couldn’t load Vimeo tracks."}</p> : <div className="space-y-2">{tracksQuery.data?.tracks.map((track) => <Button key={track.id} variant="outline" className="w-full justify-start" onClick={() => transcriptMutation.mutate({ path: "vimeo-transcript", body: { trackId: track.id } })}>{track.name || track.language} <span className="ml-2 text-muted-foreground">{track.language}</span></Button>)}{!tracksQuery.data?.tracks.length && <p className="text-sm text-muted-foreground">No caption tracks are available for this Vimeo video.</p>}</div>}</DialogContent></Dialog>
  </main>;
}