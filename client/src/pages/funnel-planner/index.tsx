import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Funnel } from "@shared/schema";
import { FUNNEL_TEMPLATES } from "@/components/funnel-planner/funnel-templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { GitFork, Plus, MoreVertical, Trash2, Copy, Loader2, Calendar, Layers } from "lucide-react";

function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function countNodes(funnel: Funnel): number {
  try {
    const data = funnel.canvasData as { nodes?: unknown[] };
    return Array.isArray(data?.nodes) ? data.nodes.length : 0;
  } catch {
    return 0;
  }
}

export default function FunnelPlannerIndex() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Funnel | null>(null);

  const { data: funnels = [], isLoading } = useQuery<Funnel[]>({
    queryKey: ["/api/funnels"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const template = FUNNEL_TEMPLATES.find((t) => t.id === selectedTemplate);
      return apiRequest("POST", "/api/funnels", {
        name: newName.trim() || "Untitled Funnel",
        description: newDescription.trim() || undefined,
        canvasData: template ? template.canvas : { nodes: [], edges: [] },
      });
    },
    onSuccess: async (res) => {
      const funnel: Funnel = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/funnels"] });
      setShowNewDialog(false);
      setNewName("");
      setNewDescription("");
      setSelectedTemplate(null);
      setLocation(`/funnel-grid/${funnel.id}`);
    },
    onError: () => toast({ title: "Error", description: "Failed to create funnel", variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/funnels/${id}/duplicate`, {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/funnels"] });
      toast({ title: "Duplicated", description: "Funnel duplicated successfully" });
    },
    onError: () => toast({ title: "Error", description: "Failed to duplicate funnel", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/funnels/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/funnels"] });
      setDeleteTarget(null);
      toast({ title: "Deleted", description: "Funnel deleted" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete funnel", variant: "destructive" }),
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <GitFork className="h-6 w-6 text-violet-400" />
            <h1 className="text-2xl font-bold text-white">Funnel Grid</h1>
          </div>
          <p className="text-white/50 text-sm">Visualize and plan your sales funnels on a drag-and-drop canvas.</p>
        </div>
        <Button
          onClick={() => setShowNewDialog(true)}
          className="bg-violet-600 hover:bg-violet-700 text-white"
          data-testid="button-new-funnel"
        >
          <Plus className="h-4 w-4 mr-1" />
          New Funnel
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
        </div>
      ) : funnels.length === 0 ? (
        <div className="text-center py-24 border border-white/10 rounded-2xl bg-white/[0.02]">
          <GitFork className="h-12 w-12 text-violet-400/40 mx-auto mb-4" />
          <h2 className="text-white/70 text-lg font-medium mb-2">No funnels yet</h2>
          <p className="text-white/40 text-sm mb-6">Create your first funnel to start planning your sales process visually.</p>
          <Button
            onClick={() => setShowNewDialog(true)}
            className="bg-violet-600 hover:bg-violet-700 text-white"
            data-testid="button-create-first-funnel"
          >
            <Plus className="h-4 w-4 mr-1" />
            Create Your First Funnel
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {funnels.map((funnel) => {
            const nodeCount = countNodes(funnel);
            return (
              <Card
                key={funnel.id}
                className="bg-card border hover:border-violet-500/60 transition-all cursor-pointer group overflow-hidden"
                onClick={() => setLocation(`/funnel-grid/${funnel.id}`)}
                data-testid={`card-funnel-${funnel.id}`}
              >
                {/* Colored header strip */}
                <div className="h-1.5 w-full bg-gradient-to-r from-violet-600 to-violet-400" />
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-violet-500/20 shrink-0">
                          <GitFork className="h-4 w-4 text-violet-400" />
                        </div>
                        <h3 className="text-foreground font-semibold truncate text-sm leading-tight">{funnel.name}</h3>
                      </div>
                      {funnel.description && (
                        <p className="text-muted-foreground text-xs leading-snug line-clamp-2 mb-3">{funnel.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2">
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Layers className="h-3.5 w-3.5" />
                          {nodeCount} {nodeCount === 1 ? "step" : "steps"}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(funnel.updatedAt)}
                        </span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          data-testid={`button-funnel-menu-${funnel.id}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          onClick={() => duplicateMutation.mutate(funnel.id)}
                          data-testid={`button-duplicate-funnel-${funnel.id}`}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-400 focus:text-red-300"
                          onClick={() => setDeleteTarget(funnel)}
                          data-testid={`button-delete-funnel-${funnel.id}`}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Funnel Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Funnel</DialogTitle>
            <DialogDescription>Name your funnel and choose a starting template.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="funnel-name">Funnel Name</Label>
              <Input
                id="funnel-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Sales Funnel"
                className="mt-1"
                data-testid="input-funnel-name"
              />
            </div>
            <div>
              <Label htmlFor="funnel-desc">Description (optional)</Label>
              <Textarea
                id="funnel-desc"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Brief description of what this funnel is for..."
                className="mt-1 resize-none h-20"
                data-testid="input-funnel-description"
              />
            </div>
            <div>
              <Label>Start from</Label>
              <div className="grid grid-cols-1 gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setSelectedTemplate(null)}
                  className={`text-left rounded-lg border p-3 text-sm transition-colors ${
                    selectedTemplate === null
                      ? "border-violet-500 bg-violet-500/10 text-foreground"
                      : "border-border hover:border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="option-blank-canvas"
                >
                  <div className="font-medium">Blank Canvas</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Start from scratch</div>
                </button>
                {FUNNEL_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTemplate(t.id)}
                    className={`text-left rounded-lg border p-3 text-sm transition-colors ${
                      selectedTemplate === t.id
                        ? "border-violet-500 bg-violet-500/10 text-foreground"
                        : "border-border hover:border-border/60 text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid={`option-template-${t.id}`}
                  >
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)} data-testid="button-cancel-new-funnel">
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white"
              data-testid="button-create-funnel"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Create Funnel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Funnel?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}" and all its canvas data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              data-testid="button-confirm-delete-funnel"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
