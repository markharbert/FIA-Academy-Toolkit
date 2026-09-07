import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Download, ExternalLink, Eye, EyeOff, Film, Folder, Link as LinkIcon, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/projects/rich-text-editor";
import { TrainingResourceIcon } from "@/components/training-resource-icon";
import { TrainingTranscriptStatus } from "@/components/training-transcript-status";
import { streamTranscriptGeneration, type TranscriptGenerationProgress } from "@/lib/transcript-generation";
import { useToast } from "@/hooks/use-toast";

type Resource = { id: string; name: string; url: string; subtitle: string | null; kind: "link" | "pdf" };
type ReplayChapter = { startSeconds: number; title: string };
type Replay = { id: string; title: string; description: string | null; category: string | null; tags: string[]; durationMinutes: number | null; videoUrl: string | null; content: string | null; status: "draft" | "published"; resources: Resource[]; transcriptText: string | null; transcriptLanguage: string | null; transcriptSource: string | null; transcriptUpdatedAt: string | null; transcriptChapters: ReplayChapter[] | null; transcriptChaptersGeneratedAt: string | null; vimeoChaptersSynced?: boolean; vimeoChapterCount?: number; vimeoChapterSyncMessage?: string };
type VimeoFolder = { id: string; name: string; parentId?: string; path: string[] };
type VimeoVideo = { id: string; name: string; url: string; thumbnailUrl?: string; durationMinutes?: number };
type VimeoVideoPage = { videos: VimeoVideo[]; hasMore: boolean };
type Track = { id: string; language: string; name: string; type: string };
type CfDownload = {
  id: string;
  public_id: string | null;
  workspace_id: string;
  asset_id: string | null;
  name: string;
  editUrl: string | null;
};
type Form = Omit<Replay, "resources" | "tags"> & { tags: string };
type ReplayUpdate = Pick<Form, "title" | "description" | "category" | "durationMinutes" | "videoUrl" | "thumbnailUrl" | "content" | "status"> & { tags: string[] };

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
  const showVimeoChapterSyncToast = (
    updated: Replay,
    successTitle: string,
    successDescription: string,
  ) => {
    if (updated.vimeoChaptersSynced === false) {
      toast({
        title: "Saved, but Vimeo chapters didn’t sync",
        description: updated.vimeoChapterSyncMessage || "Check the Vimeo token’s edit permission and try again.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: successTitle, description: successDescription });
  };
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
  const [vimeoVideoSearch, setVimeoVideoSearch] = useState("");
  const [debouncedVimeoVideoSearch, setDebouncedVimeoVideoSearch] = useState("");
  const [expandedVimeoFolders, setExpandedVimeoFolders] = useState<Record<string, boolean>>({});
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [showAddResource, setShowAddResource] = useState(false);
  const [newResource, setNewResource] = useState({ name: "", url: "", subtitle: "", kind: "link" as "link" | "pdf" });
  const [resourceToDelete, setResourceToDelete] = useState<Resource | null>(null);
  const [cfDownloadUrlHint, setCfDownloadUrlHint] = useState(false);
  const [selectedCfDownloadEditUrl, setSelectedCfDownloadEditUrl] = useState<string | null>(null);
  const [cfDownloadPickerOpen, setCfDownloadPickerOpen] = useState(false);
  const [cfDownloadFilter, setCfDownloadFilter] = useState("");
  const newResourceUrlRef = useRef<HTMLInputElement>(null);
  const [showTranscriptTracks, setShowTranscriptTracks] = useState(false);
  const [transcriptDeleteOpen, setTranscriptDeleteOpen] = useState(false);
  const [freshTranscriptProgress, setFreshTranscriptProgress] = useState<TranscriptGenerationProgress | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [vimeoPickerOpen, setVimeoPickerOpen] = useState(false);
  const videoProvider = detectVideoProvider(form?.videoUrl || "");

  const replayQuery = useQuery<Replay>({
    queryKey: ["/api/admin/training-replays", replayId],
    queryFn: () => api(`/api/admin/training-replays/${replayId}`),
  });
  const catalogQuery = useQuery<Replay[]>({
    queryKey: ["/api/admin/training-replays"],
    queryFn: () => api("/api/admin/training-replays"),
  });
  const categories = useMemo(
    () => [...new Set([
      ...(catalogQuery.data || []).map((item) => item.category?.trim()).filter(Boolean) as string[],
      form?.category?.trim(),
    ].filter(Boolean) as string[])].sort(),
    [catalogQuery.data, form?.category],
  );
  const {
    data: cfDownloadsData,
    isLoading: cfDownloadsLoading,
    error: cfDownloadsError,
  } = useQuery<{ downloads: CfDownload[] }>({
    queryKey: ["/api/admin/cf/downloads"],
    queryFn: () => api("/api/admin/cf/downloads"),
    enabled: cfDownloadPickerOpen,
  });
  const visibleCfDownloads = useMemo(() => {
    const filter = cfDownloadFilter.trim().toLowerCase();
    const downloads = cfDownloadsData?.downloads ?? [];
    return filter
      ? downloads.filter((download) => download.name.toLowerCase().includes(filter))
      : downloads;
  }, [cfDownloadFilter, cfDownloadsData?.downloads]);
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
        thumbnailUrl: data.thumbnailUrl,
        content: data.content,
        status: data.status,
        tags: data.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      };
      return api(`/api/admin/training-replays/${replayId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/training-replays"] });
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
    staleTime: 5 * 60 * 1000,
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
    enabled: vimeoPickerOpen && selectedVimeoFolderId !== "all" && !vimeoVideoSearch.trim(),
    staleTime: 5 * 60 * 1000,
  });
  const {
    data: vimeoSearchData,
    isLoading: vimeoSearchLoading,
    error: vimeoSearchError,
  } = useQuery<VimeoVideoPage>({
    queryKey: ["/api/admin/vimeo/videos/search", debouncedVimeoVideoSearch, vimeoVideoPage],
    queryFn: () => api(`/api/admin/vimeo/videos/search?q=${encodeURIComponent(debouncedVimeoVideoSearch)}&page=${vimeoVideoPage}`),
    enabled: vimeoPickerOpen && !!debouncedVimeoVideoSearch,
    staleTime: 5 * 60 * 1000,
  });
  const activeVimeoVideosData = vimeoVideoSearch.trim() ? vimeoSearchData : videosQuery.data;
  const activeVimeoVideosLoading = vimeoVideoSearch.trim()
    ? vimeoVideoSearch.trim() !== debouncedVimeoVideoSearch || vimeoSearchLoading
    : videosQuery.isLoading;
  const activeVimeoVideosError = vimeoVideoSearch.trim() ? vimeoSearchError : videosQuery.error;
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedVimeoVideoSearch(vimeoVideoSearch.trim()),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [vimeoVideoSearch]);
  const tracksQuery = useQuery<{ tracks: Track[] }>({
    queryKey: ["/api/admin/training-replays", replayId, "vimeo-transcript-tracks"],
    queryFn: () => api(`/api/admin/training-replays/${replayId}/vimeo-transcript-tracks`),
    enabled: showTranscriptTracks && videoProvider === "vimeo",
  });
  useEffect(() => {
    if (!vimeoPickerOpen) return;
    const savedFolderId = window.localStorage.getItem(VIMEO_LAST_FOLDER_STORAGE_KEY);
    setSelectedVimeoFolderId(savedFolderId || "all");
    setVimeoVideoPage(1);
    setVimeoFolderFilter("");
    setVimeoVideoSearch("");
    setDebouncedVimeoVideoSearch("");
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
    setVimeoVideoSearch("");
    setDebouncedVimeoVideoSearch("");
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
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/admin/training-replays", replayId] });
    void queryClient.invalidateQueries({ queryKey: ["/api/training/replays"] });
  };
  const syncTranscriptFields = (updated: Replay) => {
    if (!formRef.current) return;
    const next = {
      ...formRef.current,
      transcriptText: updated.transcriptText,
      transcriptLanguage: updated.transcriptLanguage,
      transcriptSource: updated.transcriptSource,
      transcriptUpdatedAt: updated.transcriptUpdatedAt,
      transcriptChapters: updated.transcriptChapters,
      transcriptChaptersGeneratedAt: updated.transcriptChaptersGeneratedAt,
      description: updated.description,
      durationMinutes: updated.durationMinutes,
      tags: (updated.tags || []).join(", "),
    };
    formRef.current = next;
    setForm(next);
  };
  const importVimeoTranscript = useMutation({
    mutationFn: async (trackId: string) => {
      if (timer.current) clearTimeout(timer.current);
      const saved = await saveRevision(revision.current);
      if (!saved) throw new Error("Save the replay before importing its transcript.");
      return api(`/api/admin/training-replays/${replayId}/vimeo-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId }),
      });
    },
    onSuccess: (updated: Replay) => {
      syncTranscriptFields(updated);
      setShowTranscriptTracks(false);
      invalidate();
      showVimeoChapterSyncToast(
        updated,
        "Replay details and chapters created",
        "The details are ready to review, and the chapters are in the Vimeo player.",
      );
    },
    onError: (error: Error) =>
      toast({ title: "Couldn’t add transcript", description: error.message, variant: "destructive" }),
  });
  const createFreshTranscript = useMutation({
    mutationFn: async () => {
      if (timer.current) clearTimeout(timer.current);
      const saved = await saveRevision(revision.current);
      if (!saved) throw new Error("Save the replay before creating a fresh transcript.");
      return streamTranscriptGeneration<Replay>(
        `/api/admin/training-replays/${replayId}/fresh-transcript`,
        setFreshTranscriptProgress,
      );
    },
    onMutate: () => setFreshTranscriptProgress({ percentage: 0, stage: "Starting" }),
    onSuccess: (updated: Replay) => {
      syncTranscriptFields(updated);
      setShowTranscriptTracks(false);
      invalidate();
      showVimeoChapterSyncToast(
        updated,
        "Fresh transcript and chapters created",
        "The chapters are ready here and in the Vimeo player.",
      );
    },
    onError: (error: Error) =>
      toast({ title: "Couldn’t create fresh transcript", description: error.message, variant: "destructive" }),
    onSettled: () => setFreshTranscriptProgress(null),
  });
  const regenerateDescription = useMutation({
    mutationFn: async () => {
      if (timer.current) clearTimeout(timer.current);
      const saved = await saveRevision(revision.current);
      if (!saved) throw new Error("Save the replay before regenerating its description.");
      return api(`/api/admin/training-replays/${replayId}/description`, { method: "POST" });
    },
    onSuccess: (updated: Replay) => {
      syncTranscriptFields(updated);
      invalidate();
      toast({ title: "Description regenerated", description: "The new description is ready to review." });
    },
    onError: (error: Error) =>
      toast({ title: "Couldn’t regenerate description", description: error.message, variant: "destructive" }),
  });
  const generateTranscriptChapters = useMutation({
    mutationFn: () =>
      api(`/api/admin/training-replays/${replayId}/transcript-chapters`, { method: "POST" }),
    onSuccess: (updated: Replay) => {
      syncTranscriptFields(updated);
      invalidate();
      showVimeoChapterSyncToast(
        updated,
        "Chapters created",
        "Members can use the same chapter markers here and in the Vimeo player.",
      );
    },
    onError: (error: Error) =>
      toast({ title: "Couldn’t create chapters", description: error.message, variant: "destructive" }),
  });
  const updateTranscriptChapters = useMutation({
    mutationFn: (titles: string[]) =>
      api(`/api/admin/training-replays/${replayId}/transcript-chapters`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titles }),
      }),
    onSuccess: (updated: Replay) => {
      syncTranscriptFields(updated);
      invalidate();
      showVimeoChapterSyncToast(
        updated,
        "Chapter titles saved",
        "The updated titles are also live in the Vimeo player.",
      );
    },
    onError: (error: Error) =>
      toast({ title: "Couldn’t save chapter titles", description: error.message, variant: "destructive" }),
  });
  const deleteTranscript = useMutation({
    mutationFn: () =>
      api(`/api/admin/training-replays/${replayId}/transcript`, { method: "DELETE" }),
    onSuccess: (updated: Replay) => {
      syncTranscriptFields(updated);
      setTranscriptDeleteOpen(false);
      setShowTranscriptTracks(false);
      invalidate();
      showVimeoChapterSyncToast(
        updated,
        "Transcript removed",
        "The transcript and chapters were removed here and the Vimeo chapter markers were cleared.",
      );
    },
    onError: (error: Error) =>
      toast({ title: "Couldn’t remove transcript", description: error.message, variant: "destructive" }),
  });
  const resourceMutation = useMutation({
    mutationFn: (resource: typeof newResource) =>
      api(
        editingResource
          ? `/api/admin/training-replays/${replayId}/resources/${editingResource.id}`
          : `/api/admin/training-replays/${replayId}/resources`,
        {
          method: editingResource ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...resource, subtitle: resource.subtitle || null }),
        },
      ),
    onSuccess: () => {
      setNewResource({ name: "", url: "", subtitle: "", kind: "link" });
      setShowAddResource(false);
      setEditingResource(null);
      setCfDownloadUrlHint(false);
      setSelectedCfDownloadEditUrl(null);
      invalidate();
    },
    onError: (error: Error) => toast({ title: "Couldn’t save resource", description: error.message, variant: "destructive" }),
  });
  const deleteResource = useMutation({
    mutationFn: (id: string) =>
      api(`/api/admin/training-replays/${replayId}/resources/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setResourceToDelete(null);
      invalidate();
    },
    onError: (error: Error) => toast({ title: "Couldn’t delete resource", description: error.message, variant: "destructive" }),
  });
  const startEditingResource = (item: Resource) => {
    setEditingResource(item);
    setNewResource({
      name: item.name,
      url: item.url,
      subtitle: item.subtitle || "",
      kind: item.kind === "pdf" ? "pdf" : "link",
    });
    setCfDownloadUrlHint(false);
    setSelectedCfDownloadEditUrl(null);
    setShowAddResource(true);
  };
  const cancelResourceEditing = () => {
    setShowAddResource(false);
    setEditingResource(null);
    setNewResource({ name: "", url: "", subtitle: "", kind: "link" });
    setCfDownloadUrlHint(false);
    setSelectedCfDownloadEditUrl(null);
  };
  const selectCfDownload = (download: CfDownload) => {
    setCfDownloadPickerOpen(false);
    setEditingResource(null);
    setNewResource({ name: download.name, url: "", subtitle: "", kind: "link" });
    setCfDownloadUrlHint(true);
    setSelectedCfDownloadEditUrl(download.editUrl);
    setShowAddResource(true);
    window.setTimeout(() => newResourceUrlRef.current?.focus(), 50);
  };

  if (replayQuery.isLoading || !form) return <div className="mx-auto max-w-[58rem] p-6 sm:p-8"><div className="h-8 w-56 animate-pulse rounded bg-muted" /><div className="mt-5 h-80 animate-pulse rounded bg-muted" /></div>;
  if (replayQuery.isError) return <div className="mx-auto max-w-[58rem] p-8 text-destructive">Couldn’t load this replay. {replayQuery.error instanceof Error ? replayQuery.error.message : ""}</div>;
  return <main className="min-h-[calc(100dvh-3rem)] bg-[radial-gradient(circle_at_12%_0%,hsl(254_74%_94%),transparent_32rem)] p-4 sm:p-8">
     <div className="mx-auto max-w-[58rem]">
    <header className="mb-7 flex items-start gap-3 border-b border-violet-100 pb-6"><Button variant="ghost" size="icon" className="mt-0.5 shrink-0" onClick={() => void backToLibrary()}><ArrowLeft className="h-4 w-4" /></Button><div className="min-w-0 flex-1"><p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-violet-700">Academy vault / replay</p><Input value={form.title} onChange={(e) => change("title", e.target.value)} className="h-auto border-0 bg-transparent px-0 text-2xl font-extrabold shadow-none focus-visible:ring-0" /><div className="mt-1 flex flex-wrap items-center gap-2">{form.status === "published" ? <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600"><Check className="h-3 w-3" />Published</Badge> : <Badge variant="secondary">Draft</Badge>}{isDirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}{saveMutation.isPending && <span className="text-xs text-muted-foreground">Saving changes</span>}</div></div><div className="flex shrink-0 gap-2"><Button variant="outline" size="sm" onClick={() => void saveNow()} disabled={!isDirty || saveMutation.isPending}><Save className="mr-1 h-4 w-4" />Save</Button><Button size="sm" variant={form.status === "published" ? "outline" : "default"} onClick={() => change("status", form.status === "published" ? "draft" : "published")}>{form.status === "published" ? <><EyeOff className="mr-1 h-4 w-4" />Unpublish</> : <><Eye className="mr-1 h-4 w-4" />Publish</>}</Button></div></header>
     <div className="space-y-6">
       <Separator />
       <section className="space-y-2">
         <Label className="flex items-center gap-1.5">
           <LinkIcon className="h-4 w-4 text-muted-foreground" />
           Video URL
         </Label>
         <div className="flex gap-2">
           <Input
             className="min-w-0 flex-1"
             value={form.videoUrl || ""}
             onChange={(event) => change("videoUrl", event.target.value)}
             placeholder="https://youtube.com/watch… or https://vimeo.com/…"
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
         <VideoPreview url={form.videoUrl || ""} />
         {videoProvider === "vimeo" && (
           <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
             <div className="flex flex-wrap items-center justify-between gap-2">
               <div>
                 <p className="text-sm font-medium">Transcript</p>
                 <p className="text-xs text-muted-foreground">
                   {form.transcriptText
                     ? `Imported from ${form.transcriptSource || "Vimeo"}${form.transcriptLanguage ? ` · ${form.transcriptLanguage}` : ""}`
                     : "Import captions already available for this Vimeo video."}
                 </p>
               </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={createFreshTranscript.isPending || importVimeoTranscript.isPending}
                    onClick={() => createFreshTranscript.mutate()}
                  >
                    {createFreshTranscript.isPending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    )}
                     {createFreshTranscript.isPending
                       ? `Transcribing video · ${freshTranscriptProgress?.percentage ?? 0}%`
                       : "Create fresh transcript"}
                  </Button>
                 <Button
                   type="button"
                   size="sm"
                   variant={form.transcriptText ? "outline" : "default"}
                   onClick={() => setShowTranscriptTracks((shown) => !shown)}
                 >
                    Import Vimeo captions
                 </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {form.transcriptText && (
                      <Button asChild size="sm" variant="outline">
                        <a href={`/api/admin/training-replays/${replayId}/transcript/download`}>
                          <Download className="mr-1.5 h-3.5 w-3.5" />
                          Download
                        </a>
                      </Button>
                    )}
                    {form.transcriptText && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setTranscriptDeleteOpen(true)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        <span>Remove</span>
                      </Button>
                    )}
                  </div>
               </div>
             </div>
               <TrainingTranscriptStatus
                 updatedAt={form.transcriptUpdatedAt}
                 source={form.transcriptSource}
                 transcriptText={form.transcriptText}
                 chapters={form.transcriptChapters}
                 chaptersGeneratedAt={form.transcriptChaptersGeneratedAt}
                 onSaveChapterTitles={(titles) => updateTranscriptChapters.mutateAsync(titles).then(() => undefined)}
                 onRegenerateChapters={() => generateTranscriptChapters.mutate()}
                 isRegeneratingChapters={generateTranscriptChapters.isPending}
               />
             {showTranscriptTracks && (
               <div className="border-t pt-3">
                 {tracksQuery.isLoading ? (
                   <div className="flex items-center gap-2 text-sm text-muted-foreground">
                     <Loader2 className="h-4 w-4 animate-spin" />
                     Checking Vimeo for transcripts…
                   </div>
                 ) : tracksQuery.isError ? (
                   <p className="text-sm text-destructive">
                     {tracksQuery.error instanceof Error ? tracksQuery.error.message : "Couldn’t load Vimeo transcripts."}
                   </p>
                 ) : (tracksQuery.data?.tracks.length ?? 0) === 0 ? (
                   <p className="text-sm text-muted-foreground">
                     Vimeo has no caption or transcript track available for this video yet.
                   </p>
                 ) : (
                   <div className="space-y-2">
                     <p className="text-xs text-muted-foreground">Choose a Vimeo text track to import:</p>
                     {tracksQuery.data?.tracks.map((track) => (
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
                         {importVimeoTranscript.isPending ? (
                           <Loader2 className="h-4 w-4 animate-spin" />
                         ) : (
                           <Download className="h-4 w-4" />
                         )}
                       </Button>
                     ))}
                   </div>
                 )}
               </div>
             )}
           </div>
         )}
       </section>
        <section className="grid gap-4 rounded-lg border bg-white/70 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Description</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!form.transcriptText || regenerateDescription.isPending}
                onClick={() => regenerateDescription.mutate()}
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${regenerateDescription.isPending ? "animate-spin" : ""}`} />
                Regenerate Description
              </Button>
            </div>
            <Textarea
              className="mt-1 min-h-24"
              value={form.description || ""}
              onChange={(e) => change("description", e.target.value)}
              placeholder="A clear summary for members browsing the vault."
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-violet-600" />
              Category
            </Label>
            {addingCategory ? (
              <div className="mt-1 space-y-2">
                <Input
                  autoFocus
                  value={categoryDraft}
                  placeholder="New category name"
                  onChange={(e) => setCategoryDraft(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!categoryDraft.trim()}
                    onClick={() => {
                      if (timer.current) clearTimeout(timer.current);
                      change("category", categoryDraft.trim());
                      setAddingCategory(false);
                      setCategoryDraft("");
                      void saveRevision(revision.current);
                    }}
                  >
                    Add category
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAddingCategory(false);
                      setCategoryDraft("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Select
                value={form.category || "__none"}
                onValueChange={(value) => {
                  if (value === "__new") {
                    setCategoryDraft("");
                    setAddingCategory(true);
                  } else {
                    change("category", value === "__none" ? null : value);
                  }
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No category</SelectItem>
                  {categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  <SelectItem value="__new">Create a new category</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label>Duration (min)</Label>
            <Input
              className="mt-1"
              type="number"
              value={form.durationMinutes || ""}
              onChange={(e) => change("durationMinutes", e.target.value ? Number(e.target.value) : null)}
            />
          </div>
          <div>
            <Label>Tags</Label>
            <Input
              className="mt-1"
              value={form.tags}
              onChange={(e) => change("tags", e.target.value)}
              placeholder="mindset, strategy"
            />
          </div>
        </section>
        <section className="space-y-3 rounded-lg border bg-white/70 p-4">
          <Label className="block">Replay Content</Label>
          <RichTextEditor value={form.content || ""} onChange={(value) => change("content", value)} />
        </section>
        <section className="space-y-3 rounded-lg border bg-white/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Resources</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setCfDownloadFilter("");
                  setCfDownloadPickerOpen(true);
                }}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Choose ClickFunnels Download
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (showAddResource) {
                    cancelResourceEditing();
                  } else {
                    setShowAddResource(true);
                  }
                }}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Resource
              </Button>
            </div>
          </div>

          {showAddResource && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input
                    placeholder="Worksheet PDF"
                    value={newResource.name}
                    onChange={(event) => setNewResource((current) => ({ ...current, name: event.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <select
                    value={newResource.kind}
                    onChange={(event) => setNewResource((current) => ({
                      ...current,
                      kind: event.target.value as "link" | "pdf",
                    }))}
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
                  onChange={(event) => setNewResource((current) => ({ ...current, url: event.target.value }))}
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
                  onChange={(event) => setNewResource((current) => ({ ...current, subtitle: event.target.value }))}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={!newResource.name.trim() || !newResource.url.trim() || resourceMutation.isPending}
                  onClick={() => {
                    resourceMutation.mutate(newResource);
                    setCfDownloadUrlHint(false);
                    setSelectedCfDownloadEditUrl(null);
                  }}
                >
                  {editingResource ? "Save changes" : "Add"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={cancelResourceEditing}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {(replayQuery.data?.resources.length ?? 0) > 0 ? (
            <div className="space-y-2">
              {replayQuery.data?.resources.map((item) => (
                <div
                  key={item.id}
                  className="group flex items-center gap-3 rounded-md border bg-card px-3 py-4"
                >
                  <TrainingResourceIcon kind={item.kind} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    {item.subtitle && (
                      <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => startEditingResource(item)}
                      title="Edit resource"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <a href={item.url} target="_blank" rel="noopener noreferrer" title="Open resource">
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setResourceToDelete(item)}
                      title="Delete resource"
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
        </section>
    </div></div>
    <AlertDialog open={!!resourceToDelete} onOpenChange={(open) => !open && setResourceToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete resource?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{resourceToDelete?.name}</strong> will be permanently removed from this replay.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteResource.isPending}>Cancel</AlertDialogCancel>
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
    <AlertDialog open={transcriptDeleteOpen} onOpenChange={(open) => !open && setTranscriptDeleteOpen(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove transcript?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove the transcript, timestamped cues, and generated chapters from this replay. You can import the Vimeo transcript again later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteTranscript.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteTranscript.isPending}
            onClick={(event) => {
              event.preventDefault();
              deleteTranscript.mutate();
            }}
          >
            {deleteTranscript.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Remove transcript
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
                    disabled={resourceMutation.isPending}
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
                    {resourceMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 text-muted-foreground" />
                    )}
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
              <Input
                value={vimeoVideoSearch}
                onChange={(event) => {
                  setVimeoVideoSearch(event.target.value);
                  setVimeoVideoPage(1);
                }}
                placeholder="Search videos by title…"
                className="mb-3"
              />
              {activeVimeoVideosLoading ? (
                <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {vimeoVideoSearch.trim() ? "Searching videos…" : "Loading videos…"}
                </div>
              ) : activeVimeoVideosError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {(activeVimeoVideosError as Error).message || "Unable to load Vimeo videos."}
                </div>
              ) : (activeVimeoVideosData?.videos ?? []).length === 0 ? (
                <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                  {vimeoVideoSearch.trim() ? "No videos match that title." : "No videos in this folder."}
                </div>
              ) : (
                <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                  {(activeVimeoVideosData?.videos ?? []).map((video) => (
                    <button
                      key={video.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-md border p-2 text-left transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring"
                      onClick={() => {
                        change("title", video.name);
                        change("videoUrl", video.url);
                        change("thumbnailUrl", video.thumbnailUrl || null);
                        if (video.durationMinutes) change("durationMinutes", video.durationMinutes);
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
                      disabled={!activeVimeoVideosData?.hasMore}
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
  </main>;
}