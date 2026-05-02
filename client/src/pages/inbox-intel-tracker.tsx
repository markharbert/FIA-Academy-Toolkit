import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Copy,
  Check,
  Plus,
  Loader2,
  Mail,
  Trash2,
  Pin,
  PinOff,
  Inbox,
  ExternalLink,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type {
  CompetitorTracker,
  CompetitorSeedAddress,
  CapturedCompetitorEmail,
} from "@shared/schema";

const MAX_SEEDS = 5;

interface TrackerDetailResponse {
  tracker: CompetitorTracker;
  seeds: (CompetitorSeedAddress & { address: string })[];
  emails: CapturedCompetitorEmail[];
  pinnedCount: number;
}

function formatDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(d: Date | string | null) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function InboxIntelTrackerPage() {
  const params = useParams<{ trackerId: string }>();
  const trackerId = params.trackerId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [seedLabel, setSeedLabel] = useState("");

  const { data, isLoading, error } = useQuery<TrackerDetailResponse>({
    queryKey: ["/api/inbox-intel/trackers", trackerId],
    enabled: !!trackerId,
  });

  const addSeedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/inbox-intel/trackers/${trackerId}/seeds`, {
        label: seedLabel.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      setSeedLabel("");
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-intel/trackers", trackerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-intel/trackers"] });
      toast({ title: "Seed address created" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't create seed", description: err?.message, variant: "destructive" });
    },
  });

  const deleteSeedMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/inbox-intel/seeds/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-intel/trackers", trackerId] });
      toast({ title: "Seed address removed" });
    },
  });

  const deleteTrackerMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/inbox-intel/trackers/${trackerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-intel/trackers"] });
      toast({ title: "Competitor removed" });
      setLocation("/email-tools/inbox-intel");
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      await apiRequest("PATCH", `/api/inbox-intel/emails/${id}/pin`, { pinned });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-intel/trackers", trackerId] });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't update pin", description: err?.message, variant: "destructive" });
    },
  });

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <p className="text-muted-foreground mb-4">Couldn't load this competitor.</p>
        <Button variant="outline" onClick={() => setLocation("/email-tools/inbox-intel")}>
          Back to Inbox Intel
        </Button>
      </div>
    );
  }

  const { tracker, seeds, emails, pinnedCount } = data;
  const seedAtLimit = seeds.length >= MAX_SEEDS;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-sidebar text-sidebar-foreground px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => setLocation("/email-tools/inbox-intel")}
            className="text-white/60 hover:text-white text-sm flex items-center gap-1 mb-4"
            data-testid="link-back-inbox-intel"
          >
            <ArrowLeft className="h-4 w-4" /> All competitors
          </button>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                {tracker.name.substring(0, 1).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight" data-testid="text-tracker-title">
                  {tracker.name}
                </h1>
                {tracker.website && (
                  <a
                    href={tracker.website.startsWith("http") ? tracker.website : `https://${tracker.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/50 text-xs hover:text-white/80 flex items-center gap-1 mt-0.5"
                  >
                    {tracker.website.replace(/^https?:\/\//, "")} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/70 hover:text-white hover:bg-white/10"
                  data-testid="button-delete-tracker"
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Remove
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove this competitor?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes {tracker.name}, all seed addresses, and every captured email — including pinned ones. This can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteTrackerMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    data-testid="button-confirm-delete-tracker"
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {tracker.notes && (
            <p className="text-white/60 text-sm mt-3 max-w-2xl whitespace-pre-line">{tracker.notes}</p>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Seed addresses */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-bold text-foreground">Seed addresses</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {seeds.length} of {MAX_SEEDS} addresses. Use these to subscribe to {tracker.name}'s list.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {seeds.map((seed) => (
              <div
                key={seed.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                data-testid={`row-seed-${seed.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono text-foreground truncate" data-testid={`text-seed-address-${seed.id}`}>
                      {seed.address}
                    </code>
                    <button
                      onClick={() => copyToClipboard(seed.address, seed.id)}
                      className="text-muted-foreground hover:text-foreground flex-shrink-0"
                      data-testid={`button-copy-seed-${seed.id}`}
                      title="Copy"
                    >
                      {copiedId === seed.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {seed.label && <span>{seed.label}</span>}
                    <span>{seed.receivedCount} received</span>
                    {seed.lastReceivedAt && <span>Last: {formatDate(seed.lastReceivedAt)}</span>}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteSeedMutation.mutate(seed.id)}
                  data-testid={`button-delete-seed-${seed.id}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {!seedAtLimit && (
            <div className="mt-3 flex gap-2">
              <Input
                placeholder="Optional label (e.g. homepage opt-in)"
                value={seedLabel}
                onChange={(e) => setSeedLabel(e.target.value)}
                maxLength={60}
                data-testid="input-seed-label"
              />
              <Button
                onClick={() => addSeedMutation.mutate()}
                disabled={addSeedMutation.isPending}
                data-testid="button-add-seed"
                className="gap-2 flex-shrink-0"
              >
                {addSeedMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Generate seed
              </Button>
            </div>
          )}

          {seedAtLimit && (
            <p className="text-xs text-muted-foreground mt-3">
              You've reached the {MAX_SEEDS}-address limit. Delete one to generate another.
            </p>
          )}
        </section>

        {/* Captured emails */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-bold text-foreground">Captured emails</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {emails.length === 0
                  ? "No emails captured yet. They'll appear here once they arrive."
                  : `${emails.length} ${emails.length === 1 ? "email" : "emails"} • ${pinnedCount} pinned`}
              </p>
            </div>
          </div>

          {emails.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border rounded-xl">
              <Inbox className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Add a seed address above and use it to subscribe to {tracker.name}'s list.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              {emails.map((email) => (
                <div
                  key={email.id}
                  className="flex items-center gap-3 px-4 py-3 hover-elevate active-elevate-2 cursor-pointer transition-colors"
                  onClick={() => setLocation(`/email-tools/inbox-intel/${trackerId}/email/${email.id}`)}
                  data-testid={`row-email-${email.id}`}
                >
                  {email.isPinned && (
                    <Pin className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-foreground truncate" data-testid={`text-email-from-${email.id}`}>
                        {email.fromName || email.fromEmail || "Unknown sender"}
                      </span>
                      {!email.bodyAvailable && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          archived
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground truncate" data-testid={`text-email-subject-${email.id}`}>
                      {email.subject}
                    </p>
                  </div>
                  <div className="hidden sm:flex flex-col items-end text-xs text-muted-foreground flex-shrink-0">
                    <span>{formatDate(email.receivedAt)}</span>
                    <span>{formatTime(email.receivedAt)}</span>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 rounded hover:bg-muted text-muted-foreground"
                        data-testid={`button-email-menu-${email.id}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePinMutation.mutate({ id: email.id, pinned: !email.isPinned });
                        }}
                        data-testid={`button-toggle-pin-${email.id}`}
                      >
                        {email.isPinned ? (
                          <><PinOff className="h-4 w-4 mr-2" /> Unpin</>
                        ) : (
                          <><Pin className="h-4 w-4 mr-2" /> Pin to favorites</>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
