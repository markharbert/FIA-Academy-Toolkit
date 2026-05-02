import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, Plus, ArrowRight, Loader2, ChevronLeft, Mail, Pin, Inbox, Globe, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertCompetitorTrackerSchema, type CompetitorTrackerWithStats } from "@shared/schema";
import { EditTrackerDialog } from "@/components/edit-tracker-dialog";

const MAX_TRACKERS = 20;

const newTrackerSchema = insertCompetitorTrackerSchema;
type NewTrackerForm = z.infer<typeof newTrackerSchema>;

function formatRelative(d: Date | string | null): string {
  if (!d) return "No emails yet";
  const then = new Date(d).getTime();
  const diff = Date.now() - then;
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function InboxIntelPage() {
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: trackers = [], isLoading } = useQuery<CompetitorTrackerWithStats[]>({
    queryKey: ["/api/inbox-intel/trackers"],
    // Auto-refetch every 6s while any tracker is still waiting for its screenshot
    refetchInterval: (q) => {
      const list = (q.state.data as CompetitorTrackerWithStats[] | undefined) || [];
      // Only poll while a tracker is actively capturing (or website set with no
      // status yet for older rows). Stop on terminal states: ready / failed / none.
      const anyWaiting = list.some(
        (t) =>
          t.website &&
          !t.screenshotPath &&
          (t.screenshotStatus === "capturing" || t.screenshotStatus == null),
      );
      return anyWaiting ? 6000 : false;
    },
  });

  const form = useForm<NewTrackerForm>({
    resolver: zodResolver(newTrackerSchema),
    defaultValues: { name: "", website: "", notes: "" },
  });

  const createMutation = useMutation({
    mutationFn: async (data: NewTrackerForm) => {
      const res = await apiRequest("POST", "/api/inbox-intel/trackers", data);
      return res.json();
    },
    onSuccess: (created: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-intel/trackers"] });
      setDialogOpen(false);
      form.reset();
      toast({ title: "Competitor added", description: `${created.name} is being tracked.` });
      if (created?.id) setLocation(`/email-tools/inbox-intel/${created.id}`);
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't add competitor",
        description: err?.message || "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: NewTrackerForm) => createMutation.mutate(data);

  const remaining = MAX_TRACKERS - trackers.length;
  const atLimit = remaining <= 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Hero header */}
      <div className="bg-sidebar text-sidebar-foreground px-6 py-10">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => setLocation("/email-tools")}
            className="text-white/60 hover:text-white text-sm flex items-center gap-1 mb-4"
            data-testid="link-back-email-tools"
          >
            <ChevronLeft className="h-4 w-4" /> Back to Email Tools
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Eye className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Inbox Intel</h1>
          </div>
          <p className="text-white/50 text-sm mt-1.5 max-w-xl">
            Spy on your competitors' email funnels. Subscribe to their lists with a unique private address, then watch every campaign land here — automatically captured, analyzed, and saved for swipe-file inspiration.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Action row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-foreground">Tracked Competitors</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {trackers.length} of {MAX_TRACKERS} {trackers.length === 1 ? "competitor" : "competitors"} tracked
            </p>
          </div>
          <div className="flex items-center gap-2">
            {trackers.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setLocation("/email-tools/inbox-intel/feed")}
                data-testid="button-view-feed"
                className="gap-2"
              >
                <Inbox className="h-4 w-4" /> View full feed
              </Button>
            )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button
                disabled={atLimit}
                data-testid="button-add-competitor"
                className="gap-2"
              >
                <Plus className="h-4 w-4" /> Add competitor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a competitor to track</DialogTitle>
                <DialogDescription>
                  We'll generate a unique seed address for you. Use it to subscribe to their list.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Competitor name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. Acme Coaching"
                            {...field}
                            data-testid="input-tracker-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website (optional)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="https://acmecoaching.com"
                            {...field}
                            value={field.value ?? ""}
                            data-testid="input-tracker-website"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="What you want to learn from them — funnel structure, subject lines, cadence..."
                            rows={3}
                            {...field}
                            value={field.value ?? ""}
                            data-testid="input-tracker-notes"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      data-testid="button-cancel-tracker"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createMutation.isPending}
                      data-testid="button-submit-tracker"
                    >
                      {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Add competitor
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {atLimit && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 mb-6 text-sm text-amber-600 dark:text-amber-400">
            You've reached the {MAX_TRACKERS}-competitor limit. Delete a tracker to add a new one.
          </div>
        )}

        {/* Trackers grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : trackers.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-2xl">
            <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <Eye className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">No competitors tracked yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-5">
              Add your first competitor to get a unique seed address you can use to subscribe to their email list.
            </p>
            <Button onClick={() => setDialogOpen(true)} data-testid="button-add-first-competitor" className="gap-2">
              <Plus className="h-4 w-4" /> Add your first competitor
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {trackers.map((t) => (
              <TrackerTile key={t.id} tracker={t} onOpen={() => setLocation(`/email-tools/inbox-intel/${t.id}`)} />
            ))}
          </div>
        )}

        {/* How it works */}
        {trackers.length > 0 && (
          <div className="mt-10 rounded-xl border border-border bg-muted/20 p-5">
            <h3 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
              <Mail className="h-4 w-4" /> How Inbox Intel works
            </h3>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-5">
              <li>Add a competitor and we'll generate a unique private email address.</li>
              <li>Use that address to subscribe to their list (homepage opt-in, lead magnet, webinar — wherever they collect emails).</li>
              <li>Every email they send is captured here automatically and analyzed for cadence, copy patterns, and funnel structure.</li>
              <li>Pin emails worth saving forever (up to 25 per competitor) — older non-pinned emails roll off after 100.</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <div className={`font-bold text-foreground ${small ? "text-xs" : "text-base"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function TrackerTile({ tracker, onOpen }: { tracker: CompetitorTrackerWithStats; onOpen: () => void }) {
  const t = tracker;
  const [imgError, setImgError] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // Bust cached screenshot when it updates
  const screenshotSrc = t.screenshotPath
    ? `/api/inbox-intel/trackers/${t.id}/screenshot?v=${t.screenshotUpdatedAt ? new Date(t.screenshotUpdatedAt).getTime() : ""}`
    : null;
  const showScreenshot = !!screenshotSrc && !imgError;
  const isCapturing =
    !t.screenshotPath &&
    !!t.website &&
    (t.screenshotStatus === "capturing" || t.screenshotStatus == null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };

  return (
    <>
      <div
        onClick={onOpen}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        data-testid={`card-tracker-${t.id}`}
        className="group relative cursor-pointer text-left rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Screenshot header (16:9) */}
        <div className="relative aspect-[16/9] w-full bg-muted/40 overflow-hidden border-b border-border">
          {showScreenshot ? (
            <img
              src={screenshotSrc!}
              alt={`${t.name} website preview`}
              loading="lazy"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover object-top group-hover:scale-[1.02] transition-transform duration-300"
              data-testid={`img-screenshot-${t.id}`}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground bg-gradient-to-br from-muted/20 to-muted/40">
              {isCapturing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mb-1.5" />
                  <span className="text-[10px] uppercase tracking-wider">Capturing preview…</span>
                </>
              ) : (
                <>
                  <Globe className="h-6 w-6 mb-1 opacity-50" />
                  <span className="text-[10px] uppercase tracking-wider opacity-70">
                    {t.website ? "Preview unavailable" : "No website"}
                  </span>
                </>
              )}
            </div>
          )}
          {/* Edit button (top-left overlay) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditOpen(true);
            }}
            onKeyDown={(e) => {
              // Prevent Enter/Space from bubbling to parent card's onKeyDown
              // (which would navigate to the detail page instead of opening edit).
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
              }
            }}
            data-testid={`button-edit-tracker-${t.id}`}
            title="Edit competitor"
            aria-label={`Edit ${t.name}`}
            className="absolute top-2 left-2 h-7 w-7 rounded-full bg-black/55 hover:bg-black/75 text-white flex items-center justify-center shadow-sm backdrop-blur-sm opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 transition-opacity"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {t.pinnedCount > 0 && (
            <span className="absolute top-2 right-2 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/90 text-white shadow-sm flex items-center gap-1 backdrop-blur-sm">
              <Pin className="h-2.5 w-2.5" /> {t.pinnedCount}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold shrink-0">
              {t.name.substring(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-foreground truncate" data-testid={`text-tracker-name-${t.id}`}>
                {t.name}
              </h3>
              {t.website && (
                <p className="text-xs text-muted-foreground truncate">
                  {t.website.replace(/^https?:\/\//, "")}
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Seeds" value={t.seedCount.toString()} />
            <Stat label="Emails" value={t.emailCount.toString()} />
            <Stat label="Last" value={formatRelative(t.lastReceivedAt)} small />
          </div>
          <div className="flex items-center justify-end mt-4 text-xs font-semibold text-violet-600 dark:text-violet-400">
            Open <ArrowRight className="h-3 w-3 ml-1 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
      <EditTrackerDialog tracker={t} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
