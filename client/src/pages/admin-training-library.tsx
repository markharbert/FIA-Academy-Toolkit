import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Check, ChevronDown, ChevronUp, Eye, EyeOff, Library, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

type Replay = { id: string; title: string; description?: string | null; category?: string | null; status: "draft" | "published"; durationMinutes?: number | null; tags?: string[] | null; sortOrder?: number };
async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) { const error = await res.json().catch(() => ({})); throw new Error(error.message || res.statusText); }
  return res.json();
}

export default function AdminTrainingLibraryPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [remove, setRemove] = useState<Replay | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Replay | null>(null);
  const [deleteText, setDeleteText] = useState("");
  const { data: allReplays = [], isLoading, isError, refetch } = useQuery<Replay[]>({ queryKey: ["/api/admin/training-replays"], queryFn: () => api("/api/admin/training-replays") });
  const categories = useMemo(() => [...new Set(allReplays.map((replay) => replay.category?.trim()).filter(Boolean) as string[])].sort(), [allReplays]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allReplays.filter((replay) => (status === "all" || replay.status === status)
      && (category === "all" || replay.category === category)
      && (!term || [replay.title, replay.description, replay.category, ...(replay.tags || [])].filter(Boolean).join(" ").toLowerCase().includes(term)));
  }, [allReplays, category, search, status]);
  const canReorder = status === "all" && category === "all" && !search.trim();
  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/admin/training-replays"] });
  const create = useMutation({ mutationFn: () => api("/api/admin/training-replays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Untitled replay", status: "draft" }) }), onSuccess: (replay) => setLocation(`/admin/training-library/${replay.id}`), onError: (error: Error) => toast({ title: "Couldn’t create replay", description: error.message, variant: "destructive" }) });
  const update = useMutation({ mutationFn: ({ id, body }: { id: string; body: object }) => api(`/api/admin/training-replays/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), onSuccess: refresh, onError: (error: Error) => toast({ title: "Update failed", description: error.message, variant: "destructive" }) });
  const reorder = useMutation({
    mutationFn: ({ from, to }: { from: number; to: number }) => {
      if (!canReorder) throw new Error("Clear all filters before changing the catalog order.");
      const ordered = [...allReplays]; [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
      return api("/api/admin/training-replays/reorder", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderedIds: ordered.map((item) => item.id) }) });
    }, onSuccess: refresh, onError: (error: Error) => toast({ title: "Couldn’t reorder", description: error.message, variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/api/admin/training-replays/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setConfirmDelete(null);
      setDeleteText("");
      refresh();
    },
    onError: (error: Error) => toast({ title: "Delete failed", description: error.message, variant: "destructive" }),
  });
  const published = allReplays.filter((replay) => replay.status === "published").length;

  return <main className="min-h-[calc(100dvh-3rem)] bg-[radial-gradient(circle_at_18%_0%,hsl(254_74%_94%),transparent_28rem)] px-4 py-6 sm:px-8">
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-col gap-5 border-b border-violet-100 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-violet-700"><Library className="h-4 w-4" /> Academy vault</div><h1 className="text-3xl font-extrabold tracking-tight text-slate-950">Vault Manager</h1><p className="mt-1 text-sm text-slate-600">Create, organize, and publish your replay catalog.</p></div>
        <Button onClick={() => create.mutate()} disabled={create.isPending} className="shadow-sm"><Plus className="mr-2 h-4 w-4" />New replay</Button>
      </header>
      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        {[["Total replays", allReplays.length, "Catalog records"], ["Published", published, "Visible to members"], ["Drafts", allReplays.length - published, "Still in preparation"]].map(([label, count, detail]) => <div key={label as string} className="rounded-xl border border-violet-100 bg-white/80 px-4 py-3 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p><div className="mt-1 flex items-baseline gap-2"><strong className="text-2xl text-slate-950">{count}</strong><span className="text-xs text-slate-500">{detail}</span></div></div>)}
      </section>
      <section className="mb-4 rounded-xl border border-violet-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search titles, descriptions, or tags" className="border-violet-100 pl-9" /></div>
          <div className="flex gap-2"><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-[148px]"><SlidersHorizontal className="mr-2 h-3.5 w-3.5" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any status</SelectItem><SelectItem value="published">Published</SelectItem><SelectItem value="draft">Drafts</SelectItem></SelectContent></Select><span className="flex items-center text-xs text-slate-500">{visible.length} shown</span></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-500">Category</span><Button size="sm" variant={category === "all" ? "default" : "outline"} onClick={() => setCategory("all")}>All <span className="ml-1 opacity-65">{allReplays.length}</span></Button>{categories.map((item) => <Button key={item} size="sm" variant={category === item ? "default" : "outline"} onClick={() => setCategory(item)}>{item}</Button>)}</div>
      </section>
      {!canReorder && <div className="mb-3 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-900">Ordering is locked while you are searching or filtering. Clear filters to reorder the complete catalog safely.</div>}
      {isLoading ? <div className="space-y-2">{[1, 2, 3, 4].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl bg-violet-100/70" />)}</div> : isError ? <div className="rounded-xl border border-destructive/30 bg-white p-8 text-center"><p className="font-semibold text-destructive">The replay library could not be loaded.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Try again</Button></div> : visible.length === 0 ? <div className="rounded-xl border border-dashed border-violet-200 bg-white/70 p-14 text-center"><Library className="mx-auto h-9 w-9 text-violet-300" /><h2 className="mt-3 font-semibold">No replays match this view</h2><p className="mt-1 text-sm text-muted-foreground">Change a filter or add a new replay to the archive.</p></div> :
        <div className="overflow-hidden rounded-xl border border-violet-100 bg-white shadow-sm">{visible.map((replay, index) => <article key={replay.id} className="group flex gap-3 border-b border-violet-50 p-3 last:border-0 hover:bg-violet-50/40">
          <div className="hidden w-9 shrink-0 flex-col justify-center sm:flex">{canReorder ? <><Button variant="ghost" size="icon" aria-label={`Move ${replay.title} up`} disabled={index === 0 || reorder.isPending} onClick={() => reorder.mutate({ from: index, to: index - 1 })}><ChevronUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={`Move ${replay.title} down`} disabled={index === allReplays.length - 1 || reorder.isPending} onClick={() => reorder.mutate({ from: index, to: index + 1 })}><ChevronDown className="h-4 w-4" /></Button></> : <span className="text-center font-mono text-xs text-slate-400">—</span>}</div>
           <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-slate-900">{replay.title}</h2>{replay.status === "published" ? <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600"><Check className="h-3 w-3" />Published</Badge> : <Badge variant="secondary">Draft</Badge>}{replay.category && <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">{replay.category}</span>}</div><p className="mt-1 line-clamp-1 text-sm text-slate-600">{replay.description || "No description yet"}</p><div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">{replay.durationMinutes ? <span>{replay.durationMinutes} min</span> : <span>Duration not set</span>}{replay.tags?.slice(0, 4).map((tag) => <Badge key={tag} variant="outline" className="font-normal">{tag}</Badge>)}</div></div>
          <div className="flex shrink-0 items-start gap-0.5"><Button variant="ghost" size="icon" aria-label={`Edit ${replay.title}`} onClick={() => setLocation(`/admin/training-library/${replay.id}`)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={replay.status === "published" ? "Unpublish replay" : "Publish replay"} onClick={() => update.mutate({ id: replay.id, body: { status: replay.status === "published" ? "draft" : "published" } })}>{replay.status === "published" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button><Button variant="ghost" size="icon" className="text-destructive" aria-label={`Delete ${replay.title}`} onClick={() => setRemove(replay)}><Trash2 className="h-4 w-4" /></Button></div>
        </article>)}</div>}
    </div>
    <AlertDialog open={!!remove} onOpenChange={(open) => !open && setRemove(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete replay?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes “{remove?.title}”, including its resources and transcript.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive"
            onClick={() => {
              if (!remove) return;
              setConfirmDelete(remove);
              setDeleteText("");
              setRemove(null);
            }}
          >
            Yes, continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog
      open={!!confirmDelete}
      onOpenChange={(open) => {
        if (!open) {
          setConfirmDelete(null);
          setDeleteText("");
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Type DELETE to confirm</AlertDialogTitle>
          <AlertDialogDescription>
            This is the final confirmation. Type <strong>DELETE</strong> below to permanently remove “{confirmDelete?.title}”.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={deleteText}
          onChange={(event) => setDeleteText(event.target.value)}
          placeholder="DELETE"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter" && deleteText === "DELETE" && confirmDelete && !del.isPending) {
              del.mutate(confirmDelete.id);
            }
          }}
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive"
            disabled={deleteText !== "DELETE" || del.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (confirmDelete && deleteText === "DELETE" && !del.isPending) {
                del.mutate(confirmDelete.id);
              }
            }}
          >
            {del.isPending ? "Deleting…" : "Delete permanently"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </main>;
}