import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock3, Loader2, Monitor, ShieldCheck, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ExtensionSession {
  id: string | number;
  deviceLabel: string;
  createdAt: string;
  lastUsedAt: string;
}

interface ExtensionSessionsResponse {
  sessions: ExtensionSession[];
}

const sessionsQueryKey = ["/api/account/extension-sessions"];

async function loadSessions(): Promise<ExtensionSessionsResponse> {
  const response = await fetch("/api/account/extension-sessions", { credentials: "include" });
  if (!response.ok) throw new Error("We couldn't load your extension sessions. Please try again.");
  const data = await response.json();
  if (!Array.isArray(data?.sessions)) throw new Error("The server returned an unexpected session list.");
  return data as ExtensionSessionsResponse;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function ExtensionSessionsCard() {
  const queryClient = useQueryClient();
  const [deleteError, setDeleteError] = useState("");
  const sessionsQuery = useQuery({ queryKey: sessionsQueryKey, queryFn: loadSessions });
  const deleteSession = useMutation({
    mutationFn: async (id: string | number) => {
      const response = await fetch(`/api/account/extension-sessions/${encodeURIComponent(String(id))}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-Toolkit-Request": "extension-device" },
      });
      if (!response.ok) {
        if (response.status === 404) throw new Error("That session was already removed. Refresh the list.");
        throw new Error("We couldn't revoke this session. Please try again.");
      }
    },
    onSuccess: async () => {
      setDeleteError("");
      await queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
    },
    onError: (error) => setDeleteError(error instanceof Error ? error.message : "We couldn't revoke this session. Please try again."),
  });

  function revoke(id: string | number, deviceLabel: string) {
    if (deleteSession.isPending) return;
    const confirmed = window.confirm(`Revoke the extension session for “${deviceLabel}”?`);
    if (!confirmed) return;
    setDeleteError("");
    deleteSession.mutate(id);
  }

  const sessions = sessionsQuery.data?.sessions ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-muted/25">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(203,54%,53%/0.12)] text-[hsl(203,54%,43%)]">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <CardTitle>Browser extension sessions</CardTitle>
            <CardDescription className="mt-1">Devices currently signed in through your Academy Toolkit extension.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {sessionsQuery.isPending ? (
          <div className="space-y-3 p-6" aria-label="Loading extension sessions" role="status">
            {[0, 1].map((item) => (
              <div key={item} className="flex items-center gap-4 rounded-xl border border-border/60 p-4">
                <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-36 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-52 max-w-full animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : sessionsQuery.isError ? (
          <div className="m-5 rounded-xl border border-destructive/20 bg-destructive/5 p-4" role="alert">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Sessions couldn’t be loaded</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {sessionsQuery.error instanceof Error ? sessionsQuery.error.message : "Please try again."}
                </p>
                <button type="button" onClick={() => sessionsQuery.refetch()} className="mt-3 text-sm font-semibold text-primary underline-offset-4 hover:underline">
                  Try again
                </button>
              </div>
            </div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Monitor className="h-5 w-5" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">No active extension sessions</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">When you connect a browser extension, its signed-in devices will appear here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {sessions.map((session) => (
              <li key={session.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Monitor className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{session.deviceLabel || "Browser extension"}</p>
                    <div className="mt-1.5 flex flex-col gap-x-4 gap-y-1 text-xs text-muted-foreground sm:flex-row sm:flex-wrap">
                      <span>Connected {formatDate(session.createdAt)}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3 w-3" aria-hidden="true" />
                        Last used {formatDate(session.lastUsedAt)}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(session.id, session.deviceLabel || "Browser extension")}
                  disabled={deleteSession.isPending}
                  aria-label={`Revoke session for ${session.deviceLabel || "Browser extension"}`}
                  className="inline-flex min-h-9 items-center justify-center gap-2 self-start rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition hover:border-destructive/35 hover:bg-destructive/5 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:self-center"
                >
                  {deleteSession.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
        {deleteError && (
          <div className="mx-5 mb-5 flex gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{deleteError}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
