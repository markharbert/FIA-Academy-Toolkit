import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Layers3, Loader2, RotateCw } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useSidebar } from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { announceWorkspaceChange, reloadWorkspace } from "@/lib/workspace-navigation";

type Workspace = {
  id: string;
  name: string;
  isOwn: boolean;
};

type WorkspacesResponse = {
  activeWorkspaceId: string;
  workspaces: Workspace[];
};

const WORKSPACES_QUERY_KEY = ["/api/workspaces"];

export function WorkspaceSwitcher() {
  const { user, refetch: refetchAuth } = useAuth();
  const { state, isMobile } = useSidebar();
  const { toast } = useToast();
  const switchingRef = useRef(false);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<WorkspacesResponse>({
    queryKey: WORKSPACES_QUERY_KEY,
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/workspaces");
      return response.json() as Promise<WorkspacesResponse>;
    },
  });

  const switchWorkspace = useMutation({
    mutationFn: async (workspaceId: string) => {
      await apiRequest("POST", "/api/workspaces/active", { workspaceId });
    },
  });

  useEffect(() => {
    if (isError) {
      toast({
        title: "Workspaces couldn’t be loaded",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [isError, error, toast]);

  if (!user || user.impersonating || (data && (data.workspaces.length === 0 ||
    (data.workspaces.length < 2 && data.workspaces.some((w) => w.id === data.activeWorkspaceId))))) return null;

  const activeWorkspace = data?.workspaces.find(
    (workspace) => workspace.id === data.activeWorkspaceId,
  );
  const collapsed = state === "collapsed" && !isMobile;
  const isBusy = switchWorkspace.isPending;

  const handleSwitch = async (workspace: Workspace) => {
    if (workspace.id === data?.activeWorkspaceId || switchingRef.current) return;

    // Keep unrelated writes from crossing a tenant boundary.
    if (queryClient.isMutating() > 0) {
      toast({
        title: "Finish saving before switching",
        description: "A change is still being saved. Try switching workspaces again in a moment.",
        variant: "destructive",
      });
      return;
    }

    // Set synchronously, before starting the mutation, to prevent rapid duplicate requests.
    switchingRef.current = true;
    try {
      await switchWorkspace.mutateAsync(workspace.id);
      await queryClient.cancelQueries();
      queryClient.clear();
      await refetchAuth();
      announceWorkspaceChange();
      // A hard navigation prevents mounted pages and local component state from leaking
      // across workspace boundaries after the shared cache has been cleared.
      reloadWorkspace();
    } catch (switchError) {
      switchingRef.current = false;
      toast({
        title: "Workspace switch failed",
        description:
          switchError instanceof Error
            ? switchError.message
            : "Your active workspace was not changed. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div
        className="mx-2 my-2 flex h-11 items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3"
        aria-label="Loading workspaces"
        aria-busy="true"
        data-testid="workspace-switcher"
      >
        <span className="h-7 w-7 shrink-0 animate-pulse rounded-lg bg-white/10" />
        {!collapsed && <span className="h-3 w-28 animate-pulse rounded bg-white/10" />}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-2 my-2" data-testid="workspace-switcher">
        <button
          type="button"
          onClick={() => void refetch()}
          className={cn(
            "flex min-h-10 w-full items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] px-3 text-left text-xs text-rose-100/90 outline-none transition-colors hover:bg-rose-300/10 focus-visible:ring-2 focus-visible:ring-amber-300/70",
            collapsed && "justify-center px-0",
          )}
          aria-label="Retry loading workspaces"
        >
          <RotateCw className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Retry workspace list</span>}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-2 my-2" data-testid="workspace-switcher">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Current workspace: ${activeWorkspace?.name || "Unavailable"}. Switch workspace`}
            aria-busy={isBusy}
            className={cn(
              "group flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-white/[0.09] bg-[linear-gradient(115deg,rgba(255,255,255,0.075),rgba(255,255,255,0.025))] px-2.5 text-left outline-none transition-colors hover:border-amber-200/25 hover:bg-white/[0.085] focus-visible:ring-2 focus-visible:ring-amber-300/70 data-[state=open]:border-amber-200/30 data-[state=open]:bg-white/[0.09]",
              collapsed && "justify-center px-0",
            )}
            data-testid="workspace-switcher-trigger"
          >
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-100/15 bg-amber-200/[0.09] text-amber-100">
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Layers3 className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-[hsl(230,75%,11%)] bg-emerald-300" />
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">
                    Active workspace
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] font-semibold leading-4 text-white/95">
                    {activeWorkspace?.name || "Choose a workspace"}
                  </span>
                </span>
                <ChevronsUpDown
                  className="h-3.5 w-3.5 shrink-0 text-white/40 transition-colors group-hover:text-white/75"
                  aria-hidden="true"
                />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={isMobile ? "bottom" : collapsed ? "right" : "bottom"}
          align={collapsed || isMobile ? "start" : "center"}
          sideOffset={8}
          className="w-[min(19rem,calc(100vw-2rem))] rounded-xl border-white/10 bg-[hsl(230,55%,12%)] p-1.5 text-white shadow-2xl shadow-black/30"
          aria-label="Choose a workspace"
        >
          <DropdownMenuLabel className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.17em] text-white/45">
            Your workspaces
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="mx-1 my-1 bg-white/[0.08]" />
          {data.workspaces.map((workspace) => {
            const selected = workspace.id === data.activeWorkspaceId;
            return (
              <DropdownMenuItem
                key={workspace.id}
                disabled={isBusy}
                onSelect={(event) => {
                  event.preventDefault();
                  void handleSwitch(workspace);
                }}
                className={cn(
                  "min-h-14 cursor-pointer gap-3 rounded-lg px-3 py-2.5 text-white/80 outline-none focus:bg-white/[0.08] focus:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-55",
                  selected && "bg-white/[0.055] text-white",
                )}
                aria-current={selected ? "true" : undefined}
                data-testid={`workspace-option-${workspace.id}`}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                    selected
                      ? "border-amber-100/20 bg-amber-200/10 text-amber-100"
                      : "border-white/[0.08] bg-white/[0.035] text-white/55",
                  )}
                  aria-hidden="true"
                >
                  <Layers3 className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium leading-5">
                    {workspace.name}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-white/45">
                    {workspace.isOwn ? "My workspace" : "Shared with me"}
                  </span>
                </span>
                {selected && (
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-100/80">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">Selected</span>
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
