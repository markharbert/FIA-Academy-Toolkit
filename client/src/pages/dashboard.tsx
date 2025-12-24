import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Video,
  Clock,
  Download,
  Eye,
  AlertCircle,
  Pencil,
  Check,
  X,
  Loader2,
  Folder,
  FolderPlus,
  MoreVertical,
  Trash2,
  FolderInput,
  ChevronRight,
  FileVideo,
} from "lucide-react";
import type { Session, SessionFolder } from "@shared/schema";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function ScoreCircle({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 36;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "text-green-500" : score >= 40 ? "text-yellow-500" : "text-red-500";

  return (
    <div className="relative h-20 w-20">
      <svg className="h-20 w-20 -rotate-90">
        <circle
          className="text-muted"
          strokeWidth="6"
          stroke="currentColor"
          fill="transparent"
          r="36"
          cx="40"
          cy="40"
        />
        <circle
          className={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r="36"
          cx="40"
          cy="40"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-bold">
        {score}
      </span>
    </div>
  );
}

function VideoThumbnail({ session, isExpired }: { session: Session; isExpired: boolean | Date | null }) {
  if (isExpired) {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-muted sm:w-40">
        <div className="flex flex-col items-center gap-1 text-muted-foreground">
          <AlertCircle className="h-6 w-6" />
          <span className="text-xs font-medium">Expired</span>
        </div>
      </div>
    );
  }

  if (session.thumbnailPath) {
    return (
      <Link href={`/session/${session.id}`} className="block sm:w-40">
        <img
          src={`/api/sessions/${session.id}/thumbnail`}
          alt="Video preview"
          className="aspect-video w-full object-cover sm:w-40"
          data-testid={`thumbnail-session-${session.id}`}
        />
      </Link>
    );
  }

  return (
    <Link href={`/session/${session.id}`} className="flex aspect-video w-full items-center justify-center bg-muted sm:w-40">
      <Video className="h-8 w-8 text-muted-foreground" />
    </Link>
  );
}

interface SessionCardProps {
  session: Session;
  isSelected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  selectionMode: boolean;
}

function SessionCard({ session, isSelected, onSelect, selectionMode }: SessionCardProps) {
  const { toast } = useToast();
  const isExpired = session.videoDeletedAt || (session.expiresAt && new Date(session.expiresAt) < new Date());
  const score = session.scoreJson?.totalScore ?? null;
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title || "");

  const updateTitleMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("PATCH", `/api/sessions/${session.id}`, { title: title || null });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update title");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", session.id] });
      setIsEditing(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const displayTitle = session.title || `Practice Session`;
  const dateStr = format(new Date(session.createdAt), "MMM d, yyyy");

  const handleSaveTitle = () => {
    const trimmed = editTitle.trim();
    updateTitleMutation.mutate(trimmed);
  };

  const handleCancelEdit = () => {
    setEditTitle(session.title || "");
    setIsEditing(false);
  };

  return (
    <Card 
      className={`overflow-hidden transition-shadow hover:shadow-md ${isSelected ? 'ring-2 ring-primary' : ''}`} 
      data-testid={`card-session-${session.id}`}
    >
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          <div className="relative">
            {selectionMode && (
              <div 
                className="absolute left-2 top-2 z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => onSelect(session.id, !!checked)}
                  data-testid={`checkbox-session-${session.id}`}
                  className="bg-background"
                />
              </div>
            )}
            <VideoThumbnail session={session} isExpired={isExpired} />
          </div>
          <div className="flex flex-1 flex-col justify-between p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 flex-1">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      maxLength={80}
                      className="h-8"
                      data-testid={`input-rename-session-${session.id}`}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveTitle();
                        if (e.key === "Escape") handleCancelEdit();
                      }}
                    />
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={handleSaveTitle}
                      disabled={updateTitleMutation.isPending}
                      data-testid={`button-save-rename-${session.id}`}
                    >
                      {updateTitleMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={handleCancelEdit}
                      data-testid={`button-cancel-rename-${session.id}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="font-semibold" data-testid={`text-session-title-${session.id}`}>
                      {displayTitle}
                    </p>
                    <Button 
                      size="icon" 
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => setIsEditing(true)}
                      data-testid={`button-rename-session-${session.id}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  {dateStr} at {format(new Date(session.createdAt), "h:mm a")}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {session.goalType}
                  </Badge>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDuration(session.durationSeconds)}
                  </span>
                  {isExpired ? (
                    <Badge variant="secondary" className="text-xs">
                      Video Expired
                    </Badge>
                  ) : (
                    <Badge variant="default" className="text-xs bg-green-600">
                      Video Available
                    </Badge>
                  )}
                </div>
              </div>
              {score !== null && (
                <ScoreCircle score={score} />
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link href={`/session/${session.id}`}>
                <Button variant="outline" size="sm" data-testid={`button-view-session-${session.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </Button>
              </Link>
              {!isExpired && session.videoPath && (
                <a href={`/api/sessions/${session.id}/download`} download>
                  <Button variant="ghost" size="sm" data-testid={`button-download-session-${session.id}`}>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </a>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SessionCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          <Skeleton className="aspect-video w-full sm:w-40" />
          <div className="flex-1 p-4 space-y-4">
            <div className="flex justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-20 w-20 rounded-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="py-12">
      <CardContent className="flex flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Video className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">No practice sessions yet</h3>
        <p className="mb-6 max-w-sm text-sm text-muted-foreground">
          Record your first practice video to get AI-powered feedback on your delivery.
        </p>
        <Link href="/session">
          <Button data-testid="button-empty-new-session">
            <Plus className="mr-2 h-4 w-4" />
            New Practice Session
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

interface FolderSidebarProps {
  folders: SessionFolder[];
  selectedFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  sessions: Session[];
}

function FolderSidebar({ folders, selectedFolderId, onSelectFolder, sessions }: FolderSidebarProps) {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<SessionFolder | null>(null);

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/folders", { name });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to create folder");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setIsCreating(false);
      setNewFolderName("");
      toast({ title: "Folder created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateFolderMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiRequest("PATCH", `/api/folders/${id}`, { name });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to rename folder");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      setEditingFolderId(null);
      setEditFolderName("");
      toast({ title: "Folder renamed" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/folders/${id}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete folder");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/folders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      if (selectedFolderId === folderToDelete?.id) {
        onSelectFolder(null);
      }
      setDeleteDialogOpen(false);
      setFolderToDelete(null);
      toast({ title: "Folder deleted", description: "Sessions moved to Unfiled" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleCreateFolder = () => {
    const trimmed = newFolderName.trim();
    if (trimmed) {
      createFolderMutation.mutate(trimmed);
    }
  };

  const handleRenameFolder = (id: string) => {
    const trimmed = editFolderName.trim();
    if (trimmed) {
      updateFolderMutation.mutate({ id, name: trimmed });
    }
  };

  const startEditing = (folder: SessionFolder) => {
    setEditingFolderId(folder.id);
    setEditFolderName(folder.name);
  };

  const cancelEditing = () => {
    setEditingFolderId(null);
    setEditFolderName("");
  };

  const getSessionCount = (folderId: string | null) => {
    return sessions.filter(s => s.folderId === folderId).length;
  };

  return (
    <div className="w-64 shrink-0 border-r bg-muted/30 p-4" data-testid="folder-sidebar">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Folders</h2>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setIsCreating(true)}
          data-testid="button-create-folder"
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>

      {isCreating && (
        <div className="mb-2 flex items-center gap-1">
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            className="h-8 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateFolder();
              if (e.key === "Escape") {
                setIsCreating(false);
                setNewFolderName("");
              }
            }}
            data-testid="input-new-folder-name"
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={handleCreateFolder}
            disabled={createFolderMutation.isPending}
            data-testid="button-save-new-folder"
          >
            {createFolderMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={() => {
              setIsCreating(false);
              setNewFolderName("");
            }}
            data-testid="button-cancel-new-folder"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="space-y-1">
        <button
          className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover-elevate ${
            selectedFolderId === null ? "bg-accent text-accent-foreground" : ""
          }`}
          onClick={() => onSelectFolder(null)}
          data-testid="folder-all-sessions"
        >
          <FileVideo className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">All Sessions</span>
          <span className="text-xs text-muted-foreground">{sessions.length}</span>
        </button>

        <button
          className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover-elevate ${
            selectedFolderId === "unfiled" ? "bg-accent text-accent-foreground" : ""
          }`}
          onClick={() => onSelectFolder("unfiled")}
          data-testid="folder-unfiled"
        >
          <Folder className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Unfiled</span>
          <span className="text-xs text-muted-foreground">{getSessionCount(null)}</span>
        </button>

        {folders.map((folder) => (
          <div key={folder.id} className="group relative">
            {editingFolderId === folder.id ? (
              <div className="flex items-center gap-1">
                <Input
                  value={editFolderName}
                  onChange={(e) => setEditFolderName(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameFolder(folder.id);
                    if (e.key === "Escape") cancelEditing();
                  }}
                  data-testid={`input-rename-folder-${folder.id}`}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  onClick={() => handleRenameFolder(folder.id)}
                  disabled={updateFolderMutation.isPending}
                >
                  {updateFolderMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  onClick={cancelEditing}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover-elevate ${
                  selectedFolderId === folder.id ? "bg-accent text-accent-foreground" : ""
                }`}
                onClick={() => onSelectFolder(folder.id)}
                data-testid={`folder-${folder.id}`}
              >
                <Folder className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate text-left">{folder.name}</span>
                <span className="text-xs text-muted-foreground">{getSessionCount(folder.id)}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      data-testid={`button-folder-menu-${folder.id}`}
                    >
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => startEditing(folder)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => {
                        setFolderToDelete(folder);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </button>
            )}
          </div>
        ))}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the folder "{folderToDelete?.name}". Sessions in this folder will be moved to Unfiled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => folderToDelete && deleteFolderMutation.mutate(folderToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteFolderMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface BulkActionsBarProps {
  selectedCount: number;
  folders: SessionFolder[];
  onMove: (folderId: string | null) => void;
  onDelete: () => void;
  onClearSelection: () => void;
  isMoving: boolean;
  isDeleting: boolean;
}

function BulkActionsBar({
  selectedCount,
  folders,
  onMove,
  onDelete,
  onClearSelection,
  isMoving,
  isDeleting,
}: BulkActionsBarProps) {
  return (
    <div className="sticky top-0 z-20 mb-4 flex items-center justify-between gap-4 rounded-md border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{selectedCount} selected</span>
        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          <X className="mr-1 h-4 w-4" />
          Clear
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isMoving}>
              {isMoving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FolderInput className="mr-2 h-4 w-4" />
              )}
              Move to Folder
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onMove(null)}>
              <Folder className="mr-2 h-4 w-4" />
              Unfiled
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {folders.map((folder) => (
              <DropdownMenuItem key={folder.id} onClick={() => onMove(folder.id)}>
                <Folder className="mr-2 h-4 w-4" />
                {folder.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={isDeleting}
          data-testid="button-bulk-delete"
        >
          {isDeleting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          Delete
        </Button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { toast } = useToast();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: sessions, isLoading: sessionsLoading, error: sessionsError } = useQuery<Session[]>({
    queryKey: ["/api/sessions"],
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: folders, isLoading: foldersLoading } = useQuery<SessionFolder[]>({
    queryKey: ["/api/folders"],
    staleTime: 0,
    refetchOnMount: "always",
  });

  const moveSessionsMutation = useMutation({
    mutationFn: async ({ sessionIds, folderId }: { sessionIds: string[]; folderId: string | null }) => {
      const res = await apiRequest("POST", "/api/sessions/move", { sessionIds, folderId });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to move sessions");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      setSelectedSessionIds(new Set());
      toast({ title: `Moved ${data.movedCount} session(s)` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteSessionsMutation = useMutation({
    mutationFn: async (sessionIds: string[]) => {
      const res = await apiRequest("DELETE", "/api/sessions/bulk", { sessionIds });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete sessions");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      setSelectedSessionIds(new Set());
      setDeleteDialogOpen(false);
      toast({ title: `Deleted ${data.deletedCount} session(s)` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    if (selectedFolderId === null) return sessions;
    if (selectedFolderId === "unfiled") return sessions.filter(s => s.folderId === null);
    return sessions.filter(s => s.folderId === selectedFolderId);
  }, [sessions, selectedFolderId]);

  const handleSelectSession = (id: string, selected: boolean) => {
    setSelectedSessionIds(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedSessionIds.size === filteredSessions.length) {
      setSelectedSessionIds(new Set());
    } else {
      setSelectedSessionIds(new Set(filteredSessions.map(s => s.id)));
    }
  };

  const handleMove = (folderId: string | null) => {
    moveSessionsMutation.mutate({
      sessionIds: Array.from(selectedSessionIds),
      folderId,
    });
  };

  const handleDelete = () => {
    deleteSessionsMutation.mutate(Array.from(selectedSessionIds));
  };

  const selectionMode = selectedSessionIds.size > 0;
  const isLoading = sessionsLoading || foldersLoading;

  return (
    <div className="flex h-full">
      {!isLoading && sessions && folders && (
        <FolderSidebar
          folders={folders}
          selectedFolderId={selectedFolderId}
          onSelectFolder={setSelectedFolderId}
          sessions={sessions}
        />
      )}
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
              <p className="text-muted-foreground">Your video practice sessions</p>
            </div>
            <div className="flex items-center gap-2">
              {filteredSessions.length > 0 && (
                <Button
                  variant="outline"
                  onClick={handleSelectAll}
                  data-testid="button-select-all"
                >
                  {selectedSessionIds.size === filteredSessions.length ? "Deselect All" : "Select All"}
                </Button>
              )}
              <Link href="/session">
                <Button size="lg" data-testid="button-new-session">
                  <Plus className="mr-2 h-5 w-5" />
                  New Practice Session
                </Button>
              </Link>
            </div>
          </div>

          {selectionMode && folders && (
            <BulkActionsBar
              selectedCount={selectedSessionIds.size}
              folders={folders}
              onMove={handleMove}
              onDelete={() => setDeleteDialogOpen(true)}
              onClearSelection={() => setSelectedSessionIds(new Set())}
              isMoving={moveSessionsMutation.isPending}
              isDeleting={deleteSessionsMutation.isPending}
            />
          )}

          {sessionsError && (
            <Card className="mb-6 border-destructive">
              <CardContent className="flex items-center gap-3 py-4">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <p className="text-sm text-destructive">Failed to load sessions. Please try again.</p>
              </CardContent>
            </Card>
          )}

          {isLoading ? (
            <div className="space-y-4">
              <SessionCardSkeleton />
              <SessionCardSkeleton />
              <SessionCardSkeleton />
            </div>
          ) : filteredSessions && filteredSessions.length > 0 ? (
            <div className="space-y-4">
              {filteredSessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  isSelected={selectedSessionIds.has(session.id)}
                  onSelect={handleSelectSession}
                  selectionMode={selectionMode}
                />
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedSessionIds.size} session(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The videos and all associated data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSessionsMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
