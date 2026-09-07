import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Check, ChevronDown, ChevronUp, Eye, EyeOff, FolderCog, Library, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type Replay = { id: string; title: string; description?: string | null; category?: string | null; status: "draft" | "published"; durationMinutes?: number | null; tags?: string[] | null; sortOrder?: number };
type ReplayCategory = { id: string; name: string; replayCount: number };
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
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<ReplayCategory | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [categoryToDelete, setCategoryToDelete] = useState<ReplayCategory | null>(null);
  const { data: allReplays = [], isLoading, isError, refetch } = useQuery<Replay[]>({ queryKey: ["/api/admin/training-replays"], queryFn: () => api("/api/admin/training-replays") });
  const { data: categoryRecords = [], isLoading: categoriesLoading } = useQuery<ReplayCategory[]>({
    queryKey: ["/api/admin/training-replay-categories"],
    queryFn: () => api("/api/admin/training-replay-categories"),
  });
  const categories = useMemo(() => categoryRecords.map((item) => item.name), [categoryRecords]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allReplays.filter((replay) => (status === "all" || replay.status === status)
      && (category === "all" || replay.category === category)
      && (!term || [replay.title, replay.description, replay.category, ...(replay.tags || [])].filter(Boolean).join(" ").toLowerCase().includes(term)));
  }, [allReplays, category, search, status]);
  const canReorder = status === "all" && category === "all" && !search.trim();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["/api/admin/training-replays"] });
    void qc.invalidateQueries({ queryKey: ["/api/admin/training-replay-categories"] });
  };
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
  const createCategory = useMutation({
    mutationFn: (name: string) => api("/api/admin/training-replay-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
    onSuccess: () => {
      setNewCategoryName("");
      refresh();
      toast({ title: "Category added", description: "It is now available for every new and existing replay." });
    },
    onError: (error: Error) => toast({ title: "Couldn’t add category", description: error.message, variant: "destructive" }),
  });
  const renameCategory = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api(`/api/admin/training-replay-categories/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
    onSuccess: () => {
      setEditingCategory(null);
      setEditingCategoryName("");
      refresh();
      toast({ title: "Category renamed", description: "Replays using it were updated automatically." });
    },
    onError: (error: Error) => toast({ title: "Couldn’t rename category", description: error.message, variant: "destructive" }),
  });
  const deleteCategory = useMutation({
    mutationFn: (id: string) => api(`/api/admin/training-replay-categories/${id}`, { method: "DELETE" }),
    onSuccess: (result: { replaysUncategorized: number }) => {
      if (category === categoryToDelete?.name) setCategory("all");
      setCategoryToDelete(null);
      refresh();
      toast({
        title: "Category deleted",
        description: result.replaysUncategorized
          ? `${result.replaysUncategorized} replay${result.replaysUncategorized === 1 ? " is" : "s are"} now uncategorized.`
          : "No replays were changed.",
      });
    },
    onError: (error: Error) => toast({ title: "Couldn’t delete category", description: error.message, variant: "destructive" }),
  });
  const published = allReplays.filter((replay) => replay.status === "published").length;

  return <main className="min-h-[calc(100dvh-3rem)] bg-[radial-gradient(circle_at_18%_0%,hsl(254_74%_94%),transparent_28rem)] px-4 py-6 sm:px-8">
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-col gap-5 border-b border-violet-100 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-violet-700"><Library className="h-4 w-4" /> Academy vault</div><h1 className="text-3xl font-extrabold tracking-tight text-slate-950">Vault Manager</h1><p className="mt-1 text-sm text-slate-600">Create, organize, and publish your replay catalog.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setCategoriesOpen(true)} className="border-violet-200 bg-white/80 shadow-sm">
            <FolderCog className="mr-2 h-4 w-4 text-violet-600" />
            Manage categories
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending} className="shadow-sm"><Plus className="mr-2 h-4 w-4" />New replay</Button>
        </div>
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
    <Dialog open={categoriesOpen} onOpenChange={setCategoriesOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="rounded-lg bg-violet-100 p-2 text-violet-700"><FolderCog className="h-4 w-4" /></span>
            Manage Vault categories
          </DialogTitle>
          <DialogDescription>
            Categories stay available for future replays, even when no replay currently uses them.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
          <Label htmlFor="new-vault-category" className="text-xs font-bold uppercase tracking-wider text-violet-900">
            Add a category
          </Label>
          <div className="mt-2 flex gap-2">
            <Input
              id="new-vault-category"
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="Category name"
              maxLength={200}
              onKeyDown={(event) => {
                if (event.key === "Enter" && newCategoryName.trim() && !createCategory.isPending) {
                  createCategory.mutate(newCategoryName.trim());
                }
              }}
            />
            <Button
              disabled={!newCategoryName.trim() || createCategory.isPending}
              onClick={() => createCategory.mutate(newCategoryName.trim())}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add
            </Button>
          </div>
        </div>
        <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
          {categoriesLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((item) => <div key={item} className="h-14 animate-pulse rounded-lg bg-muted" />)}</div>
          ) : categoryRecords.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <FolderCog className="mx-auto h-7 w-7 text-violet-300" />
              <p className="mt-2 text-sm font-medium">No categories yet</p>
              <p className="text-xs text-muted-foreground">Add one above or import a categorized replay.</p>
            </div>
          ) : categoryRecords.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm">
              {editingCategory?.id === item.id ? (
                <>
                  <Input
                    autoFocus
                    value={editingCategoryName}
                    onChange={(event) => setEditingCategoryName(event.target.value)}
                    maxLength={200}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && editingCategoryName.trim() && !renameCategory.isPending) {
                        renameCategory.mutate({ id: item.id, name: editingCategoryName.trim() });
                      }
                      if (event.key === "Escape") setEditingCategory(null);
                    }}
                  />
                  <Button
                    size="sm"
                    disabled={!editingCategoryName.trim() || renameCategory.isPending}
                    onClick={() => renameCategory.mutate({ id: item.id, name: editingCategoryName.trim() })}
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingCategory(null)}>Cancel</Button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                    <p className="text-xs text-slate-500">{item.replayCount} replay{item.replayCount === 1 ? "" : "s"}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Rename ${item.name}`}
                    onClick={() => {
                      setEditingCategory(item);
                      setEditingCategoryName(item.name);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    aria-label={`Delete ${item.name}`}
                    onClick={() => setCategoryToDelete(item)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => !open && setCategoryToDelete(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{categoryToDelete?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The category will disappear from future replay choices.
            {categoryToDelete?.replayCount
              ? ` ${categoryToDelete.replayCount} replay${categoryToDelete.replayCount === 1 ? "" : "s"} will become uncategorized, but no replay will be deleted.`
              : " No replays will be deleted."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteCategory.isPending}>Keep category</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive"
            disabled={deleteCategory.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (categoryToDelete && !deleteCategory.isPending) deleteCategory.mutate(categoryToDelete.id);
            }}
          >
            {deleteCategory.isPending ? "Deleting…" : "Delete category"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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