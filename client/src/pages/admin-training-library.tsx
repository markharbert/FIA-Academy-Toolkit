import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Plus, Pencil, Trash2, ChevronUp, ChevronDown, Eye, EyeOff, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const [, setLocation] = useLocation(); const qc = useQueryClient(); const { toast } = useToast();
  const [status, setStatus] = useState("all"); const [remove, setRemove] = useState<Replay | null>(null);
  const { data: allReplays = [], isLoading, isError } = useQuery<Replay[]>({ queryKey: ["/api/admin/training-replays"], queryFn: () => api("/api/admin/training-replays") });
  // The admin API returns the complete ordered catalog; filter locally so a
  // status filter can never accidentally be sent to the exact-ID reorder API.
  const data = status === "all" ? allReplays : allReplays.filter((replay) => replay.status === status);
  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/admin/training-replays"] });
  const create = useMutation({ mutationFn: () => api("/api/admin/training-replays", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ title: "Untitled replay", status: "draft" }) }), onSuccess: (r) => setLocation(`/admin/training-library/${r.id}`), onError: (e: Error) => toast({ title: "Couldn’t create replay", description: e.message, variant:"destructive" }) });
  const update = useMutation({ mutationFn: ({ id, body }: {id:string; body:object}) => api(`/api/admin/training-replays/${id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) }), onSuccess: refresh, onError:(e:Error)=>toast({title:"Update failed",description:e.message,variant:"destructive"}) });
  const reorder = useMutation({ mutationFn: ({from,to}:{from:number;to:number}) => {
    if (status !== "all") throw new Error("Clear the status filter before reordering.");
    const ordered = [...data]; [ordered[from],ordered[to]]=[ordered[to],ordered[from]];
    return api("/api/admin/training-replays/reorder",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderedIds:ordered.map(x=>x.id)})});
  }, onSuccess: refresh, onError:(e:Error)=>toast({title:"Couldn’t reorder",description:e.message,variant:"destructive"}) });
  const del = useMutation({ mutationFn:(id:string)=>api(`/api/admin/training-replays/${id}`,{method:"DELETE"}),onSuccess:()=>{setRemove(null);refresh();},onError:(e:Error)=>toast({title:"Delete failed",description:e.message,variant:"destructive"}) });
  return <main className="mx-auto max-w-5xl p-4 sm:p-8">
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3"><div><div className="mb-1 flex items-center gap-2 text-violet-600"><Library className="h-5 w-5"/><span className="text-sm font-semibold">Training</span></div><h1 className="text-3xl font-bold tracking-tight">Replay library</h1><p className="mt-1 text-muted-foreground">Create and curate standalone training replays.</p></div><Button onClick={()=>create.mutate()} disabled={create.isPending}><Plus className="mr-2 h-4 w-4"/>New replay</Button></div>
    <div className="mb-4 flex items-center justify-between"><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All replays</SelectItem><SelectItem value="published">Published</SelectItem><SelectItem value="draft">Drafts</SelectItem></SelectContent></Select></div>
    {isLoading ? <div className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-24 animate-pulse rounded-lg bg-muted"/>)}</div> : isError ? <p className="rounded-lg border border-destructive/30 p-5 text-destructive">The replay library could not be loaded. Please try again.</p> : data.length === 0 ? <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">No {status === "all" ? "" : status} replays yet.</div> :
      <div className="space-y-3">{data.map((replay,index)=><article key={replay.id} className="flex gap-3 rounded-xl border bg-card p-4 shadow-sm"><div className="flex flex-col justify-center"><Button variant="ghost" size="icon" aria-label="Move up" disabled={index===0||reorder.isPending} onClick={()=>reorder.mutate({from:index,to:index-1})}><ChevronUp className="h-4 w-4"/></Button><Button variant="ghost" size="icon" aria-label="Move down" disabled={index===data.length-1||reorder.isPending} onClick={()=>reorder.mutate({from:index,to:index+1})}><ChevronDown className="h-4 w-4"/></Button></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{replay.title}</h2><Badge variant={replay.status==="published"?"default":"secondary"} className="capitalize">{replay.status}</Badge></div><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{replay.description || "No description yet"}</p><div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">{replay.category && <span>{replay.category}</span>}{replay.durationMinutes && <span>• {replay.durationMinutes} min</span>}{replay.tags?.map(t=><Badge key={t} variant="outline">{t}</Badge>)}</div></div><div className="flex items-start gap-1"><Button variant="ghost" size="icon" title="Edit" onClick={()=>setLocation(`/admin/training-library/${replay.id}`)}><Pencil className="h-4 w-4"/></Button><Button variant="ghost" size="icon" title={replay.status==="published"?"Unpublish":"Publish"} onClick={()=>update.mutate({id:replay.id,body:{status:replay.status==="published"?"draft":"published"}})}>{replay.status==="published"?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</Button><Button variant="ghost" size="icon" className="text-destructive" title="Delete" onClick={()=>setRemove(replay)}><Trash2 className="h-4 w-4"/></Button></div></article>)}</div>}
    <AlertDialog open={!!remove} onOpenChange={(open)=>!open&&setRemove(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete replay?</AlertDialogTitle><AlertDialogDescription>This permanently removes “{remove?.title}”, including its resources and transcript.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive" onClick={()=>remove&&del.mutate(remove.id)}>Delete replay</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}