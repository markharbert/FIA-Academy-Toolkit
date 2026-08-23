import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Save, Eye, EyeOff, Youtube, Link, Plus, Trash2, ExternalLink,
  Film, Folder, Loader2, ChevronDown, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RichTextEditor } from "@/components/projects/rich-text-editor";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Resource = {
  id: string;
  name: string;
  url: string;
  kind: string;
  sortOrder: number;
};

type LessonWithResources = {
  id: string;
  courseId: string;
  moduleId: string;
  title: string;
  videoUrl: string | null;
  content: string | null;
  status: string;
  durationMinutes: number | null;
  resources: Resource[];
};

type VimeoFolder = {
  id: string;
  name: string;
  parentId?: string;
  parentName?: string;
  path: string[];
};

type VimeoPickerVideo = {
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
};

type VimeoVideoPage = {
  videos: VimeoPickerVideo[];
  hasMore: boolean;
};

type VimeoFolderNode = VimeoFolder & { children: VimeoFolderNode[] };

function buildVimeoFolderTree(folders: VimeoFolder[]): VimeoFolderNode[] {
  const nodes = new Map(folders.map((folder) => [folder.id, { ...folder, children: [] }]));
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

async function apiFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || res.statusText);
  }
  return res.json();
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

  if (provider === "youtube") {
    const videoId = url.includes("youtu.be/")
      ? url.split("youtu.be/")[1]?.split("?")[0]
      : new URLSearchParams(url.split("?")[1]).get("v");
    if (videoId) {
      return (
        <div className="aspect-video rounded-lg overflow-hidden bg-black">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            className="w-full h-full"
            allowFullScreen
            title="Video preview"
          />
        </div>
      );
    }
  }

  if (provider === "vimeo") {
    let embedUrl: string | null = null;
    try {
      const parsedUrl = new URL(url);
      const vimeoId = parsedUrl.pathname.match(/(?:^|\/)(?:video\/)?(\d+)(?:\/|$)/)?.[1];
      embedUrl = vimeoId
        ? `https://player.vimeo.com/video/${vimeoId}${parsedUrl.search}`
        : null;
    } catch {
      embedUrl = null;
    }
    if (!embedUrl) return null;
    return (
      <div className="aspect-video rounded-lg overflow-hidden bg-black">
        <iframe
          src={embedUrl}
          className="w-full h-full"
          allowFullScreen
          title="Video preview"
        />
      </div>
    );
  }

  return null;
}

export default function AdminLessonEditorPage() {
  const { id: courseId, lessonId } = useParams<{ id: string; lessonId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [content, setContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [newResource, setNewResource] = useState({ name: "", url: "", kind: "link" as "link" | "pdf" });
  const [showAddResource, setShowAddResource] = useState(false);
  const [vimeoPickerOpen, setVimeoPickerOpen] = useState(false);
  const [selectedVimeoFolderId, setSelectedVimeoFolderId] = useState("all");
  const [vimeoVideoPage, setVimeoVideoPage] = useState(1);
  const [vimeoFolderFilter, setVimeoFolderFilter] = useState("");
  const [expandedVimeoFolders, setExpandedVimeoFolders] = useState<Record<string, boolean>>({});
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef({ title: "", videoUrl: "", content: "" });
  const revisionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const queuedRevisionRef = useRef<number | null>(null);
  const loadedLessonIdRef = useRef<string | null>(null);
  const [resourceToDelete, setResourceToDelete] = useState<Resource | null>(null);

  const { data: lesson, isLoading } = useQuery<LessonWithResources>({
    queryKey: ["/api/admin/lessons", lessonId],
    queryFn: () => apiFetch(`/api/admin/lessons/${lessonId}?courseId=${encodeURIComponent(courseId)}`),
  });

  const { data: vimeoFoldersData, isLoading: vimeoFoldersLoading, error: vimeoFoldersError } = useQuery<{
    folders: VimeoFolder[];
  }>({
    queryKey: ["/api/admin/vimeo/folders"],
    queryFn: () => apiFetch("/api/admin/vimeo/folders"),
    enabled: vimeoPickerOpen,
  });

  const { data: vimeoVideosData, isLoading: vimeoVideosLoading, error: vimeoVideosError } = useQuery<VimeoVideoPage>({
    queryKey: ["/api/admin/vimeo/folders", selectedVimeoFolderId, "videos", vimeoVideoPage],
    queryFn: () => apiFetch(`/api/admin/vimeo/folders/${selectedVimeoFolderId}/videos?page=${vimeoVideoPage}`),
    enabled: vimeoPickerOpen && !!selectedVimeoFolderId,
  });

  const vimeoFolderTree = useMemo(
    () => buildVimeoFolderTree(vimeoFoldersData?.folders ?? []),
    [vimeoFoldersData?.folders],
  );
  const vimeoFolderSearchResults = useMemo(() => {
    const filter = vimeoFolderFilter.trim().toLowerCase();
    if (!filter) return [];
    return flattenVimeoFolderTree(vimeoFolderTree).filter((folder) =>
      [folder.name, ...(folder.path ?? [])].some((part) => part.toLowerCase().includes(filter)),
    );
  }, [vimeoFolderFilter, vimeoFolderTree]);

  const renderVimeoFolder = (folder: VimeoFolderNode, depth = 0): JSX.Element => {
    const isExpanded = expandedVimeoFolders[folder.id] ?? depth === 0;
    return (
      <div key={folder.id}>
        <div className="flex items-center gap-0.5">
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
            className="min-w-0 flex-1 justify-start gap-2 text-left"
            style={{ paddingLeft: `${8 + Math.min(depth, 6) * 8}px` }}
            onClick={() => {
              setSelectedVimeoFolderId(folder.id);
              setVimeoVideoPage(1);
            }}
          >
            <Folder className="h-4 w-4 shrink-0" />
            <span className="truncate">{folder.name}</span>
          </Button>
        </div>
        {isExpanded && folder.children.map((child) => renderVimeoFolder(child, depth + 1))}
      </div>
    );
  };

  // Populate only when navigating to another lesson. Refetching after a save
  // must not overwrite keystrokes made while the previous save was in flight.
  useEffect(() => {
    if (lesson && loadedLessonIdRef.current !== lesson.id) {
      loadedLessonIdRef.current = lesson.id;
      setTitle(lesson.title);
      setVideoUrl(lesson.videoUrl || "");
      setContent(lesson.content || "");
      formRef.current = { title: lesson.title, videoUrl: lesson.videoUrl || "", content: lesson.content || "" };
      revisionRef.current = 0;
      setIsDirty(false);
    }
  }, [lesson]);

  const saveMutation = useMutation({
    mutationFn: (data: { title: string; videoUrl: string | null; content: string; revision: number }) =>
      apiFetch(`/api/admin/lessons/${lessonId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title,
          videoUrl: data.videoUrl || null,
          content: data.content || null,
        }),
      }),
    onSuccess: (_savedLesson, variables) => {
      if (variables.revision === revisionRef.current) setIsDirty(false);
      toast({ title: "Saved" });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const saveCurrentDraft = async (revision: number) => {
    // Keep writes in order. Without this queue, an older delayed request can
    // reach the server after a newer request and overwrite the latest content.
    if (saveInFlightRef.current) {
      queuedRevisionRef.current = revision;
      return;
    }

    saveInFlightRef.current = true;
    try {
      await saveMutation.mutateAsync({ ...formRef.current, revision });
    } catch {
      // The mutation's error handler shows the error and leaves the form dirty.
    } finally {
      saveInFlightRef.current = false;
      const queuedRevision = queuedRevisionRef.current;
      queuedRevisionRef.current = null;
      if (queuedRevision !== null && queuedRevision > revision) {
        void saveCurrentDraft(queuedRevision);
      }
    }
  };

  const togglePublish = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/lessons/${lessonId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: lesson?.status === "published" ? "draft" : "published" }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/lessons", lessonId] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addResource = useMutation({
    mutationFn: (r: { name: string; url: string; kind: string }) =>
      apiFetch(`/api/admin/lessons/${lessonId}/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(r),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lessons", lessonId] });
      setNewResource({ name: "", url: "", kind: "link" });
      setShowAddResource(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteResource = useMutation({
    mutationFn: (resourceId: string) =>
      apiFetch(`/api/admin/resources/${resourceId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lessons", lessonId] });
      setResourceToDelete(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Auto-save on changes
  const handleChange = (field: "title" | "videoUrl" | "content", value: string) => {
    if (field === "title") setTitle(value);
    if (field === "videoUrl") setVideoUrl(value);
    if (field === "content") setContent(value);
    setIsDirty(true);
    formRef.current = { ...formRef.current, [field]: value };
    const revision = ++revisionRef.current;

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void saveCurrentDraft(revision);
    }, 2000);
  };

  const selectVimeoVideo = (video: VimeoPickerVideo) => {
    handleChange("videoUrl", video.url);
    setVimeoPickerOpen(false);
    toast({ title: "Vimeo video selected", description: video.name });
  };

  const saveNow = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    void saveCurrentDraft(revisionRef.current);
  };

  useEffect(() => () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
  }, []);

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Lesson not found.</p>
      </div>
    );
  }

  const videoProvider = detectVideoProvider(videoUrl);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation(`/admin/courses/${courseId}/outline`)}
          className="h-8 w-8 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <Input
            value={title}
            onChange={(e) => handleChange("title", e.target.value)}
            className="text-lg font-semibold border-0 px-0 shadow-none focus-visible:ring-0 bg-transparent h-auto py-0"
            placeholder="Lesson title…"
          />
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant={lesson.status === "published" ? "default" : "secondary"} className="capitalize text-xs">
              {lesson.status}
            </Badge>
            {isDirty && (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
            {saveMutation.isPending && (
              <span className="text-xs text-muted-foreground">Saving…</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={saveNow}
            disabled={saveMutation.isPending || !isDirty}
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Save
          </Button>
          <Button
            size="sm"
            variant={lesson.status === "published" ? "outline" : "default"}
            onClick={() => togglePublish.mutate()}
            disabled={togglePublish.isPending}
          >
            {lesson.status === "published" ? (
              <><EyeOff className="h-3.5 w-3.5 mr-1.5" /> Unpublish</>
            ) : (
              <><Eye className="h-3.5 w-3.5 mr-1.5" /> Publish</>
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Video URL */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            {videoProvider === "youtube" && <Youtube className="h-4 w-4 text-red-500" />}
            {videoProvider === "vimeo" && <svg className="h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor"><path d="M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609-3.268 4.247-6.026 6.37-8.29 6.37-1.409 0-2.578-1.294-3.553-3.881L5.322 12.7C4.603 10.113 3.834 8.817 3.01 8.817c-.178 0-.799.373-1.866 1.12L0 8.08c1.166-1.03 2.308-2.061 3.422-3.108C4.923 3.751 6.051 3.026 6.8 2.96c1.902-.192 3.08 1.11 3.492 3.87.468 2.913.793 4.72.998 5.424.554 2.507 1.165 3.758 1.833 3.758.52 0 1.293-.82 2.333-2.448 1.038-1.63 1.59-2.87 1.663-3.717.147-1.4-.406-2.099-1.663-2.099-.591 0-1.205.136-1.832.407 1.217-3.98 3.542-5.912 6.994-5.792 2.551.089 3.761 1.726 3.659 4.953z" /></svg>}
            {!videoProvider && <Link className="h-4 w-4 text-muted-foreground" />}
            Video URL
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder="https://youtube.com/watch?v=... or https://vimeo.com/..."
              value={videoUrl}
              onChange={(e) => handleChange("videoUrl", e.target.value)}
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0 gap-1.5"
              onClick={() => {
                setSelectedVimeoFolderId("all");
                setVimeoVideoPage(1);
                setVimeoFolderFilter("");
                setVimeoPickerOpen(true);
              }}
            >
              <Film className="h-4 w-4 text-blue-500" />
              Choose Vimeo
            </Button>
          </div>
          {videoUrl && videoProvider && (
            <div className="mt-3">
              <VideoPreview url={videoUrl} />
            </div>
          )}
        </div>

        <Separator />

        {/* Content */}
        <div className="space-y-2">
          <Label>Lesson Content</Label>
          <RichTextEditor
            value={content}
            onChange={(html) => handleChange("content", html)}
            placeholder="Write the lesson content here…"
          />
        </div>

        <Separator />

        {/* Resources */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Resources</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowAddResource((p) => !p)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Resource
            </Button>
          </div>

          {/* Add resource form */}
          {showAddResource && (
            <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input
                    placeholder="Worksheet PDF"
                    value={newResource.name}
                    onChange={(e) =>
                      setNewResource((p) => ({ ...p, name: e.target.value }))
                    }
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <select
                    value={newResource.kind}
                    onChange={(e) =>
                      setNewResource((p) => ({
                        ...p,
                        kind: e.target.value as "link" | "pdf",
                      }))
                    }
                    className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    <option value="link">Link</option>
                    <option value="pdf">PDF</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">URL</Label>
                <Input
                  placeholder="https://…"
                  value={newResource.url}
                  onChange={(e) =>
                    setNewResource((p) => ({ ...p, url: e.target.value }))
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => addResource.mutate(newResource)}
                  disabled={
                    !newResource.name.trim() ||
                    !newResource.url.trim() ||
                    addResource.isPending
                  }
                >
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddResource(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Resource list */}
          {lesson.resources.length > 0 ? (
            <div className="space-y-2">
              {lesson.resources.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 group"
                >
                  {r.kind === "pdf" ? (
                    <svg className="h-4 w-4 text-red-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z" />
                    </svg>
                  ) : (
                    <Link className="h-4 w-4 text-blue-500 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.url}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <a href={r.url} target="_blank" rel="noopener noreferrer">
                      <Button size="icon" variant="ghost" className="h-7 w-7">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setResourceToDelete(r)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            !showAddResource && (
              <p className="text-sm text-muted-foreground">
                No resources yet. Add PDFs or links members can download.
              </p>
            )
          )}
        </div>
      </div>

      <AlertDialog open={!!resourceToDelete} onOpenChange={(open) => !open && setResourceToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete resource?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{resourceToDelete?.name}</strong> will be permanently removed from this lesson.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteResource.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (resourceToDelete) deleteResource.mutate(resourceToDelete.id);
              }}
            >
              {deleteResource.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={vimeoPickerOpen} onOpenChange={setVimeoPickerOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Film className="h-5 w-5 text-blue-500" />
              Choose a Vimeo video
            </DialogTitle>
            <DialogDescription>
              Choose a folder, then select the video to use for this lesson.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <div className="max-h-[55vh] space-y-1 overflow-y-auto rounded-md border bg-muted/20 p-2">
              <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Folders
              </p>
              <Input
                value={vimeoFolderFilter}
                onChange={(event) => setVimeoFolderFilter(event.target.value)}
                placeholder="Find a folder…"
                className="mb-1 h-8 text-xs"
              />
              <Button
                type="button"
                variant={selectedVimeoFolderId === "all" ? "secondary" : "ghost"}
                className="w-full justify-start gap-2"
                onClick={() => {
                  setSelectedVimeoFolderId("all");
                  setVimeoVideoPage(1);
                }}
              >
                <Folder className="h-4 w-4" />
                All videos
              </Button>
              {vimeoFoldersLoading ? (
                <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading folders…
                </div>
              ) : vimeoFoldersError ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">
                  Folders are unavailable for this Vimeo token. You can still choose from all videos.
                </p>
              ) : vimeoFolderFilter.trim() ? (
                vimeoFolderSearchResults.length > 0 ? (
                  <div className="space-y-1">
                    {vimeoFolderSearchResults.map((folder) => (
                      <Button
                        key={folder.id}
                        type="button"
                        variant={selectedVimeoFolderId === folder.id ? "secondary" : "ghost"}
                        className="h-auto w-full justify-start gap-2 py-1.5 text-left"
                        onClick={() => {
                          setSelectedVimeoFolderId(folder.id);
                          setVimeoVideoPage(1);
                        }}
                      >
                        <Folder className="h-4 w-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{folder.name}</span>
                          {folder.path.length > 0 && (
                            <span className="block truncate text-xs font-normal text-muted-foreground">
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
              ) : (
                vimeoFolderTree.map((folder) => renderVimeoFolder(folder))
              )}
            </div>

            <div className="min-w-0">
              {vimeoVideosLoading ? (
                <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading videos…
                </div>
              ) : vimeoVideosError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {(vimeoVideosError as Error).message || "Unable to load Vimeo videos."}
                </div>
              ) : (vimeoVideosData?.videos ?? []).length === 0 ? (
                <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                  No videos in this folder.
                </div>
              ) : (
                <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                  {(vimeoVideosData?.videos ?? []).map((video) => (
                    <button
                      key={video.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-md border p-2 text-left transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring"
                      onClick={() => selectVimeoVideo(video)}
                    >
                      {video.thumbnailUrl ? (
                        <img
                          src={video.thumbnailUrl}
                          alt=""
                          className="h-12 w-20 rounded object-cover bg-muted"
                        />
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
                      disabled={!vimeoVideosData?.hasMore}
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
    </div>
  );
}
