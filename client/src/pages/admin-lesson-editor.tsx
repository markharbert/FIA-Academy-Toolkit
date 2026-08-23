import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Save, Eye, EyeOff, Youtube, Link, Plus, Trash2, ExternalLink, Pencil,
  Film, Folder, Loader2, ChevronDown, ChevronRight, ArrowRight, Download,
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
import { buildCourseModuleTree, flattenCourseModuleTree } from "@shared/course-structure";

type Resource = {
  id: string;
  name: string;
  url: string;
  subtitle: string | null;
  kind: string;
  sortOrder: number;
};

type LessonWithResources = {
  id: string;
  courseId: string;
  moduleId: string;
  title: string;
  videoUrl: string | null;
  transcriptText: string | null;
  transcriptLanguage: string | null;
  transcriptSource: string | null;
  transcriptUpdatedAt: string | null;
  content: string | null;
  status: string;
  durationMinutes: number | null;
  resources: Resource[];
};

type CourseNavigationStructure = {
  modules: Array<{
    id: string;
    parentModuleId: string | null;
    sortOrder: number;
    lessons: Array<{ id: string; title: string; sortOrder: number }>;
  }>;
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

type VimeoTranscriptTrack = {
  id: string;
  language: string;
  name: string;
  type: string;
  link: string | null;
};

type CfDownload = {
  id: string;
  public_id: string | null;
  workspace_id: string;
  asset_id: string | null;
  name: string;
  editUrl: string | null;
};

type VimeoFolderNode = VimeoFolder & { children: VimeoFolderNode[] };

const VIMEO_LAST_FOLDER_STORAGE_KEY = "academy-toolkit:last-vimeo-folder";

function buildVimeoFolderTree(folders: VimeoFolder[]): VimeoFolderNode[] {
  const nodes = new Map<string, VimeoFolderNode>(
    folders.map((folder) => [folder.id, { ...folder, children: [] as VimeoFolderNode[] }]),
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
  const [newResource, setNewResource] = useState({ name: "", url: "", subtitle: "", kind: "link" as "link" | "pdf" });
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [showAddResource, setShowAddResource] = useState(false);
  const [cfDownloadUrlHint, setCfDownloadUrlHint] = useState(false);
  const [selectedCfDownloadEditUrl, setSelectedCfDownloadEditUrl] = useState<string | null>(null);
  const [cfDownloadPickerOpen, setCfDownloadPickerOpen] = useState(false);
  const [cfDownloadFilter, setCfDownloadFilter] = useState("");
  const newResourceUrlRef = useRef<HTMLInputElement>(null);
  const [vimeoPickerOpen, setVimeoPickerOpen] = useState(false);
  const [selectedVimeoFolderId, setSelectedVimeoFolderId] = useState("all");
  const [vimeoVideoPage, setVimeoVideoPage] = useState(1);
  const [vimeoFolderFilter, setVimeoFolderFilter] = useState("");
  const [expandedVimeoFolders, setExpandedVimeoFolders] = useState<Record<string, boolean>>({});
  const [isNavigatingLesson, setIsNavigatingLesson] = useState(false);
  const [showTranscriptTracks, setShowTranscriptTracks] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formRef = useRef({ title: "", videoUrl: "", content: "" });
  const revisionRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const saveDrainPromiseRef = useRef<Promise<boolean> | null>(null);
  const queuedRevisionRef = useRef<number | null>(null);
  const loadedLessonIdRef = useRef<string | null>(null);
  const [resourceToDelete, setResourceToDelete] = useState<Resource | null>(null);
  const videoProvider = detectVideoProvider(videoUrl);

  const { data: lesson, isLoading } = useQuery<LessonWithResources>({
    queryKey: ["/api/admin/lessons", lessonId],
    queryFn: () => apiFetch(`/api/admin/lessons/${lessonId}?courseId=${encodeURIComponent(courseId)}`),
  });

  const { data: courseStructure, isLoading: courseStructureLoading } = useQuery<CourseNavigationStructure>({
    queryKey: ["/api/admin/courses", courseId, "structure"],
    queryFn: () => apiFetch(`/api/admin/courses/${courseId}/structure`),
  });

  const { data: cfDownloadsData, isLoading: cfDownloadsLoading, error: cfDownloadsError } = useQuery<{
    downloads: CfDownload[];
  }>({
    queryKey: ["/api/admin/cf/downloads"],
    queryFn: () => apiFetch("/api/admin/cf/downloads"),
    enabled: cfDownloadPickerOpen,
  });
  const visibleCfDownloads = useMemo(() => {
    const filter = cfDownloadFilter.trim().toLowerCase();
    const downloads = cfDownloadsData?.downloads ?? [];
    return filter ? downloads.filter((download) => download.name.toLowerCase().includes(filter)) : downloads;
  }, [cfDownloadFilter, cfDownloadsData?.downloads]);

  const orderedLessons = useMemo(() => {
    const roots = buildCourseModuleTree(courseStructure?.modules ?? []);
    return flattenCourseModuleTree(roots).flatMap((module) =>
      [...module.lessons].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    );
  }, [courseStructure?.modules]);
  const currentLessonIndex = orderedLessons.findIndex((item) => item.id === lessonId);
  const nextLesson = currentLessonIndex >= 0 ? orderedLessons[currentLessonIndex + 1] ?? null : null;

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
  const { data: vimeoTranscriptTracks, isLoading: vimeoTranscriptTracksLoading, error: vimeoTranscriptTracksError } = useQuery<{
    tracks: VimeoTranscriptTrack[];
  }>({
    queryKey: ["/api/admin/lessons", lessonId, "vimeo-transcript-tracks"],
    queryFn: () => apiFetch(`/api/admin/lessons/${lessonId}/vimeo-transcript-tracks`),
    enabled: showTranscriptTracks && videoProvider === "vimeo",
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

  useEffect(() => {
    if (!vimeoPickerOpen) return;
    const savedFolderId = window.localStorage.getItem(VIMEO_LAST_FOLDER_STORAGE_KEY);
    setSelectedVimeoFolderId(savedFolderId || "all");
    setVimeoVideoPage(1);
    setVimeoFolderFilter("");
  }, [vimeoPickerOpen]);

  useEffect(() => {
    const folders = vimeoFoldersData?.folders;
    if (!vimeoPickerOpen || !folders || selectedVimeoFolderId === "all") return;
    if (!folders.some((folder) => folder.id === selectedVimeoFolderId)) {
      setSelectedVimeoFolderId("all");
      setVimeoVideoPage(1);
      window.localStorage.setItem(VIMEO_LAST_FOLDER_STORAGE_KEY, "all");
    }
  }, [vimeoFoldersData?.folders, selectedVimeoFolderId, vimeoPickerOpen]);

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
            onClick={() => {
              selectVimeoFolder(folder.id);
            }}
          >
            <Folder className="h-4 w-4 shrink-0" />
            <span className="whitespace-normal break-words">{folder.name}</span>
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

  const saveCurrentDraft = async (revision: number): Promise<boolean> => {
    // Keep writes in order. Without this queue, an older delayed request can
    // reach the server after a newer request and overwrite the latest content.
    if (saveInFlightRef.current) {
      queuedRevisionRef.current = revision;
      return saveDrainPromiseRef.current ? await saveDrainPromiseRef.current : false;
    }

    const drainPromise = (async () => {
      let saved = true;
      saveInFlightRef.current = true;
      try {
        await saveMutation.mutateAsync({ ...formRef.current, revision });
      } catch {
        // The mutation's error handler shows the error and leaves the form dirty.
        saved = false;
      } finally {
        saveInFlightRef.current = false;
        const queuedRevision = queuedRevisionRef.current;
        queuedRevisionRef.current = null;
        saveDrainPromiseRef.current = null;
        if (queuedRevision !== null && queuedRevision > revision) {
          saved = (await saveCurrentDraft(queuedRevision)) && saved;
        }
      }
      return saved;
    })();
    saveDrainPromiseRef.current = drainPromise;
    return await drainPromise;
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

  const importVimeoTranscript = useMutation({
    mutationFn: (trackId: string) =>
      apiFetch(`/api/admin/lessons/${lessonId}/vimeo-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lessons", lessonId] });
      setShowTranscriptTracks(false);
      toast({ title: "Transcript added", description: "The Vimeo transcript is ready for members to view." });
    },
    onError: (e: Error) => toast({ title: "Couldn’t add transcript", description: e.message, variant: "destructive" }),
  });

  const addResource = useMutation({
    mutationFn: (r: { name: string; url: string; subtitle: string; kind: string }) =>
      apiFetch(editingResource ? `/api/admin/resources/${editingResource.id}` : `/api/admin/lessons/${lessonId}/resources`, {
        method: editingResource ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(r),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/lessons", lessonId] });
      setNewResource({ name: "", url: "", subtitle: "", kind: "link" });
      setShowAddResource(false);
      setEditingResource(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const startEditingResource = (resource: Resource) => {
    setEditingResource(resource);
    setNewResource({
      name: resource.name,
      url: resource.url,
      subtitle: resource.subtitle || "",
      kind: resource.kind === "pdf" ? "pdf" : "link",
    });
    setCfDownloadUrlHint(false);
    setShowAddResource(true);
  };

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

  const selectCfDownload = (download: CfDownload) => {
    // The CF API does not expose the direct file URL, so we pre-fill the name
    // and open the Add Resource form for the admin to paste the URL they copy
    // from ClickFunnels → My Assets → Downloads → Copy icon.
    setCfDownloadPickerOpen(false);
    setNewResource({ name: download.name, url: "", subtitle: "", kind: "link" });
    setCfDownloadUrlHint(true);
    setSelectedCfDownloadEditUrl(download.editUrl);
    setShowAddResource(true);
    // Focus the URL field after the form renders
    setTimeout(() => newResourceUrlRef.current?.focus(), 50);
  };

  const saveNow = () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    void saveCurrentDraft(revisionRef.current);
  };

  const navigateToLesson = async (targetLessonId: string) => {
    if (isNavigatingLesson) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setIsNavigatingLesson(true);
    try {
      if (isDirty || saveInFlightRef.current) {
        const saved = await saveCurrentDraft(revisionRef.current);
        if (!saved) {
          toast({
            title: "Couldn’t save this lesson",
            description: "Please save your changes before moving to another lesson.",
            variant: "destructive",
          });
          return;
        }
      }
      setLocation(`/admin/courses/${courseId}/lessons/${targetLessonId}`);
    } finally {
      setIsNavigatingLesson(false);
    }
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
            variant="outline"
            onClick={() => {
              if (nextLesson) void navigateToLesson(nextLesson.id);
            }}
            disabled={!nextLesson || courseStructureLoading || isNavigatingLesson}
            title={nextLesson ? `Next: ${nextLesson.title}` : "This is the final lesson"}
          >
            {isNavigatingLesson ? "Saving…" : "Next lesson"}
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
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
          {videoProvider === "vimeo" && (
            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Transcript</p>
                  <p className="text-xs text-muted-foreground">
                    {lesson.transcriptText
                      ? `Imported from ${lesson.transcriptSource || "Vimeo"}${lesson.transcriptLanguage ? ` · ${lesson.transcriptLanguage}` : ""}`
                      : "Import captions already available for this Vimeo video."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {lesson.transcriptText && (
                    <Button asChild size="sm" variant="outline">
                      <a href={`/api/admin/lessons/${lessonId}/transcript/download`}>
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        Download
                      </a>
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant={lesson.transcriptText ? "outline" : "default"}
                    onClick={() => setShowTranscriptTracks((shown) => !shown)}
                  >
                    {lesson.transcriptText ? "Replace transcript" : "Add transcript"}
                  </Button>
                </div>
              </div>
              {showTranscriptTracks && (
                <div className="border-t pt-3">
                  {vimeoTranscriptTracksLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking Vimeo for transcripts…
                    </div>
                  ) : vimeoTranscriptTracksError ? (
                    <p className="text-sm text-destructive">
                      {vimeoTranscriptTracksError instanceof Error ? vimeoTranscriptTracksError.message : "Couldn’t load Vimeo transcripts."}
                    </p>
                  ) : (vimeoTranscriptTracks?.tracks.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Vimeo has no caption or transcript track available for this video yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Choose a Vimeo text track to import:</p>
                      {vimeoTranscriptTracks?.tracks.map((track) => (
                        <Button
                          key={track.id}
                          type="button"
                          variant="outline"
                          className="h-auto w-full justify-between py-2 text-left"
                          disabled={importVimeoTranscript.isPending}
                          onClick={() => importVimeoTranscript.mutate(track.id)}
                        >
                          <span>
                            <span className="block text-sm">{track.name || track.language || "Vimeo transcript"}</span>
                            <span className="block text-xs font-normal text-muted-foreground">
                              {[track.language, track.type].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          {importVimeoTranscript.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
             <div className="flex items-center gap-2">
               <Button
                 size="sm"
                 variant="outline"
                 onClick={() => {
                   setCfDownloadFilter("");
                   setCfDownloadPickerOpen(true);
                 }}
               >
                 <Download className="h-3.5 w-3.5 mr-1.5" /> Choose ClickFunnels Download
               </Button>
               <Button
                 size="sm"
                 variant="outline"
                 onClick={() => setShowAddResource((p) => !p)}
               >
                 <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Resource
               </Button>
             </div>
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
                  ref={newResourceUrlRef}
                  placeholder="https://…"
                  value={newResource.url}
                  onChange={(e) =>
                    setNewResource((p) => ({ ...p, url: e.target.value }))
                  }
                  className="h-8 text-sm"
                />
                {cfDownloadUrlHint && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    The ClickFunnels API doesn't include the file URL.{" "}
                    {selectedCfDownloadEditUrl ? (
                      <a
                        href={selectedCfDownloadEditUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-300"
                      >
                        Open this asset in ClickFunnels
                      </a>
                    ) : (
                      <span>In ClickFunnels, go to <strong>My Assets → Downloads</strong></span>
                    )}{" "}
                    and click the <strong>Copy</strong> icon next to this file, then paste the URL here.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Subtitle (optional)</Label>
                <Input
                  placeholder="A short explanation for members"
                  value={newResource.subtitle}
                  onChange={(e) =>
                    setNewResource((p) => ({ ...p, subtitle: e.target.value }))
                  }
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    addResource.mutate(newResource);
                    setCfDownloadUrlHint(false);
                    setSelectedCfDownloadEditUrl(null);
                  }}
                  disabled={
                    !newResource.name.trim() ||
                    !newResource.url.trim() ||
                    addResource.isPending
                  }
                >
                  {editingResource ? "Save changes" : "Add"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowAddResource(false);
                    setCfDownloadUrlHint(false);
                    setSelectedCfDownloadEditUrl(null);
                    setEditingResource(null);
                    setNewResource({ name: "", url: "", subtitle: "", kind: "link" });
                  }}
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
                  className="flex items-center gap-3 rounded-md border bg-card px-3 py-4 group"
                >
                  {r.kind === "pdf" ? (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-red-600 text-[10px] font-extrabold tracking-tight text-white shadow-sm">
                      PDF
                    </div>
                  ) : (
                    <Link className="h-5 w-5 text-blue-500 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    {r.subtitle && (
                      <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => startEditingResource(r)}
                      title="Edit resource"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
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

      <Dialog open={cfDownloadPickerOpen} onOpenChange={setCfDownloadPickerOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Choose a ClickFunnels download
            </DialogTitle>
            <DialogDescription>
              Choose an asset to pre-fill its name, or open the asset in ClickFunnels to copy its actual file URL.
            </DialogDescription>
          </DialogHeader>

          <Input
            value={cfDownloadFilter}
            onChange={(event) => setCfDownloadFilter(event.target.value)}
            placeholder="Search ClickFunnels downloads…"
          />

          {cfDownloadsLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading ClickFunnels downloads…
            </div>
          ) : cfDownloadsError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {(cfDownloadsError as Error).message || "Unable to load ClickFunnels downloads."}
            </div>
          ) : visibleCfDownloads.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
              {cfDownloadFilter.trim() ? "No matching ClickFunnels downloads." : "No ClickFunnels downloads are available."}
            </div>
          ) : (
            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {visibleCfDownloads.map((download) => (
                  <div
                    key={download.id}
                    className="flex w-full items-center gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50"
                  >
                    <button
                      type="button"
                      disabled={addResource.isPending}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => selectCfDownload(download)}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted">
                        <Download className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{download.name}</span>
                        <span className="block text-xs text-muted-foreground">Select this asset</span>
                      </span>
                      {addResource.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={vimeoPickerOpen} onOpenChange={setVimeoPickerOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-6xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Film className="h-5 w-5 text-blue-500" />
              Choose a Vimeo video
            </DialogTitle>
            <DialogDescription>
              Choose a folder, then select the video to use for this lesson.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-[24rem_minmax(0,1fr)]">
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
                  selectVimeoFolder("all");
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
                        className="h-auto w-full justify-start gap-2 py-2 text-left"
                        onClick={() => {
                          selectVimeoFolder(folder.id);
                        }}
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
