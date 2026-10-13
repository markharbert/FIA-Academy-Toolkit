import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Copy, ExternalLink } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Subscription { url: string; workspaceId: string; scope: "personal" | "projects" }

export function CalendarSync() {
  const { user } = useAuth();
  return <CalendarSubscription key={user?.workspaceOwnerId || user?.id || "signed-out"} />;
}

function CalendarSubscription() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const workspaceId = user?.workspaceOwnerId || user?.id;
  const queryKey = ["/api/calendar/ical-url", workspaceId];
  const [copied, setCopied] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"rotate" | "revoke" | null>(null);
  const [revokedWorkspace, setRevokedWorkspace] = useState<string | null>(null);
  const revoked = revokedWorkspace === workspaceId;
  const { data, isLoading, isError } = useQuery<Subscription>({
    queryKey,
    enabled: !!workspaceId && !revoked,
    queryFn: async () => (await apiRequest("GET", `/api/calendar/ical-url?workspaceId=${encodeURIComponent(workspaceId!)}`)).json(),
  });
  const subscription = data?.workspaceId === workspaceId && !revoked ? data : undefined;
  const mutation = useMutation({
    mutationFn: async (action: "rotate" | "revoke") => {
      const response = await apiRequest(action === "revoke" ? "DELETE" : "POST",
        action === "revoke" ? "/api/calendar/ical-url" : "/api/calendar/rotate-ical-token", { workspaceId });
      return { action, workspaceId: workspaceId!, data: await response.json() };
    },
    onSuccess: ({ action, workspaceId: target, data: result }) => {
      setCopied(false);
      if (action === "revoke") {
        setRevokedWorkspace(target);
        queryClient.removeQueries({ queryKey: ["/api/calendar/ical-url", target], exact: true });
      } else {
        queryClient.setQueryData(["/api/calendar/ical-url", target], result);
        setRevokedWorkspace(null);
      }
      toast({
        title: action === "revoke" ? "Subscription link revoked" : "New subscription link ready",
        description: action === "revoke" ? "The old link no longer works. Your calendar app may keep events it already downloaded."
          : "Replace the old URL in your calendar app. This changes only your subscription for this workspace.",
      });
    },
    onError: (error: Error) => toast({ title: "Could not update subscription", description: error.message, variant: "destructive" }),
  });
  const handleCopy = async () => {
    if (!subscription || mutation.isPending) return;
    try {
      await navigator.clipboard.writeText(subscription.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Link copied!", description: 'Paste it in Google Calendar → Other calendars → "From URL".' });
    } catch {
      toast({ title: "Could not copy link", description: "Select the link and copy it manually.", variant: "destructive" });
    }
  };
  return (
    <div className="mb-4 rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
        <CalendarDays className="h-4 w-4 text-indigo-500 shrink-0" />
        <span className="text-sm font-semibold">Subscribe to Google Calendar</span>
        <a href="https://calendar.google.com/calendar/r/settings/addbyurl" target="_blank" rel="noopener noreferrer"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          data-testid="link-open-google-calendar">
          Open Google Calendar <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="px-4 py-3 flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          {user?.workspaceOwnerId ? "Your private link for the selected shared workspace — Project Manager events only."
            : "Your private link for My workspace — copy into any calendar app."}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input readOnly aria-label="Calendar subscription URL"
            value={revoked ? "Link revoked" : isLoading ? "Generating…" : isError ? "Unable to load subscription" : (subscription?.url ?? "")}
            className="flex-1 min-w-0 text-xs font-mono bg-muted/50 border border-border rounded-md px-2.5 py-1.5 text-muted-foreground truncate"
            onClick={e => (e.target as HTMLInputElement).select()} data-testid="input-ical-url" />
          <Button size="sm" variant="outline" onClick={handleCopy} disabled={!subscription || mutation.isPending} data-testid="button-copy-ical-url">
            <Copy className="h-3.5 w-3.5 mr-1.5" />{copied ? "Copied!" : "Copy"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => revoked ? mutation.mutate("rotate") : setConfirmAction("rotate")}
            disabled={mutation.isPending || (!revoked && !subscription)} data-testid="button-rotate-ical-url">
            {revoked ? "Generate new link" : "Replace link"}
          </Button>
          {!revoked && <Button size="sm" variant="outline" onClick={() => setConfirmAction("revoke")}
            disabled={!subscription || mutation.isPending} data-testid="button-revoke-ical-url">Revoke link</Button>}
        </div>
      </div>
      <AlertDialog open={!!confirmAction} onOpenChange={open => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmAction === "revoke" ? "Revoke this subscription link?" : "Replace this subscription link?"}</AlertDialogTitle>
            <AlertDialogDescription>
              The old link will stop working for this workspace. Other teammates’ links and your other workspaces will not change.
              Events already downloaded may remain in your calendar app.
              {confirmAction === "rotate" && " Subscribe again using the new link."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (confirmAction) mutation.mutate(confirmAction);
              setConfirmAction(null);
            }} data-testid="button-confirm-calendar-change">Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
