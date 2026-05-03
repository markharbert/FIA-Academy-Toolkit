import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, ProjectTask, ProjectLink } from "@shared/schema";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { RichTextEditor } from "./rich-text-editor";
import { CalendarIcon, Trash2, X, Plus, Link2, ExternalLink, ListChecks, Tag, Flag, CheckCircle2 } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

const PRIORITY_OPTIONS = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

interface Props {
  project: Project;
  task: ProjectTask | null;
  subtasks: ProjectTask[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allTags: string[];
}

export function TaskDetailSheet({ project, task, subtasks, open, onOpenChange, allTags }: Props) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("none");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [links, setLinks] = useState<ProjectLink[]>([]);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  useEffect(() => {
    if (task && open) {
      setTitle(task.title);
      setNotes(task.notes || "");
      setStatus(task.status);
      setPriority(task.priority);
      setDueDate(task.dueDate ? new Date(task.dueDate) : null);
      setTags(task.tags || []);
      setLinks(task.links || []);
      setTagInput("");
      setLinkLabel("");
      setLinkUrl("");
      setNewSubtaskTitle("");
    }
  }, [task, open]);

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (!task) return null;
      const res = await apiRequest("PATCH", `/api/tasks/${task.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/projects"] });
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => { if (task) await apiRequest("DELETE", `/api/tasks/${task.id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/projects"] });
      toast({ title: "Task deleted" });
      onOpenChange(false);
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/projects"] });
  };

  const addSubtaskMutation = useMutation({
    mutationFn: async (t: string) => {
      if (!task) return null;
      const res = await apiRequest("POST", `/api/projects/${project.id}/tasks`, { title: t, parentTaskId: task.id });
      return res.json();
    },
    onSuccess: () => { invalidateAll(); setNewSubtaskTitle(""); },
  });

  const toggleSubtaskMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/tasks/${id}`, { status });
    },
    onSuccess: invalidateAll,
  });

  const deleteSubtaskMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/tasks/${id}`); },
    onSuccess: invalidateAll,
  });

  const tagSuggestions = useMemo(
    () => allTags.filter(t => !tags.includes(t) && t.toLowerCase().includes(tagInput.toLowerCase())).slice(0, 6),
    [allTags, tags, tagInput],
  );

  if (!task) return null;

  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().slice(0, 40);
    if (!t || tags.includes(t)) return;
    const next = [...tags, t];
    setTags(next);
    updateMutation.mutate({ tags: next });
    setTagInput("");
  };

  const removeTag = (t: string) => {
    const next = tags.filter(x => x !== t);
    setTags(next);
    updateMutation.mutate({ tags: next });
  };

  const addLink = () => {
    if (!linkLabel.trim() || !linkUrl.trim()) return;
    let url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try { new URL(url); } catch { toast({ title: "Invalid URL", variant: "destructive" }); return; }
    const next = [...links, { label: linkLabel.trim().slice(0, 80), url: url.slice(0, 500) }];
    setLinks(next);
    updateMutation.mutate({ links: next });
    setLinkLabel(""); setLinkUrl("");
  };

  const removeLink = (idx: number) => {
    const next = links.filter((_, i) => i !== idx);
    setLinks(next);
    updateMutation.mutate({ links: next });
  };

  const saveTitle = () => {
    const t = title.trim();
    if (!t || t === task.title) return;
    updateMutation.mutate({ title: t });
  };

  const saveNotes = (html: string) => {
    setNotes(html);
    updateMutation.mutate({ notes: html });
  };

  const completedSubs = subtasks.filter(s => s.status === "done").length;

  const initials = (project.name || "P").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0" data-testid="sheet-task-detail">
        {/* Gradient header card */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(245_60%_28%)] via-[hsl(265_55%_35%)] to-[hsl(290_55%_38%)]" />
          <div className="absolute -top-12 -right-8 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <SheetHeader className="relative px-6 pt-6 pb-5">
            <div className="flex items-center gap-3">
              <div
                className="h-11 w-11 rounded-xl flex items-center justify-center text-white font-bold shrink-0 ring-2 ring-white/20"
                style={{ background: project.color }}
              >
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-white/70 font-semibold">{project.name}</p>
                <SheetTitle asChild>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    className="bg-transparent border-0 p-0 text-lg font-semibold text-white placeholder-white/40 focus:outline-none focus:ring-0 w-full"
                    placeholder="Task title…"
                    data-testid="input-task-title"
                  />
                </SheetTitle>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="bg-white/15 text-white border-0 text-[10px]">
                    {STATUS_OPTIONS.find(s => s.value === status)?.label}
                  </Badge>
                  {priority !== "none" && (
                    <Badge variant="secondary" className="bg-white/15 text-white border-0 text-[10px]">
                      <Flag className="h-2.5 w-2.5 mr-1" /> {PRIORITY_OPTIONS.find(p => p.value === priority)?.label}
                    </Badge>
                  )}
                  {dueDate && (
                    <Badge variant="secondary" className="bg-white/15 text-white border-0 text-[10px]">
                      <CalendarIcon className="h-2.5 w-2.5 mr-1" /> {dueDate.toLocaleDateString()}
                    </Badge>
                  )}
                  {subtasks.length > 0 && (
                    <Badge variant="secondary" className="bg-white/15 text-white border-0 text-[10px]">
                      <ListChecks className="h-2.5 w-2.5 mr-1" /> {completedSubs}/{subtasks.length} subtasks
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Status / Priority / Due */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Status</Label>
              <Select value={status} onValueChange={(v) => { setStatus(v); updateMutation.mutate({ status: v }); }}>
                <SelectTrigger className="mt-1 h-8 text-xs" data-testid="select-task-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Priority</Label>
              <Select value={priority} onValueChange={(v) => { setPriority(v); updateMutation.mutate({ priority: v }); }}>
                <SelectTrigger className="mt-1 h-8 text-xs" data-testid="select-task-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Due</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="mt-1 h-8 w-full justify-start text-xs font-normal" data-testid="button-due-date">
                    <CalendarIcon className="h-3 w-3 mr-1.5 shrink-0" />
                    <span className="truncate">{dueDate ? dueDate.toLocaleDateString() : "None"}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto p-0">
                  <Calendar mode="single" selected={dueDate ?? undefined} onSelect={(d) => { setDueDate(d ?? null); updateMutation.mutate({ dueDate: d ? d.toISOString() : null }); }} />
                  {dueDate && (
                    <div className="p-2 border-t">
                      <Button variant="ghost" size="sm" className="w-full" onClick={() => { setDueDate(null); updateMutation.mutate({ dueDate: null }); }}>Clear date</Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Tags */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <Tag className="h-3 w-3" /> Tags
            </Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {tags.map(t => (
                <Badge key={t} variant="secondary" className="text-xs gap-1 pr-1" data-testid={`tag-${t}`}>
                  {t}
                  <button onClick={() => removeTag(t)} className="hover-elevate rounded-sm p-0.5" aria-label={`Remove ${t}`}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
              <div className="relative">
                <Input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); if (tagInput.trim()) addTag(tagInput); }
                    else if (e.key === "Backspace" && !tagInput && tags.length) { removeTag(tags[tags.length - 1]); }
                  }}
                  placeholder="Add tag…"
                  className="h-7 text-xs w-32"
                  data-testid="input-add-tag"
                />
                {tagInput && tagSuggestions.length > 0 && (
                  <div className="absolute z-10 mt-1 left-0 rounded-md border border-border bg-popover shadow-md py-1 min-w-[120px]">
                    {tagSuggestions.map(s => (
                      <button key={s} onClick={() => addTag(s)} className="w-full text-left px-2 py-1 text-xs hover-elevate" data-testid={`suggest-tag-${s}`}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Links */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <Link2 className="h-3 w-3" /> Links
            </Label>
            <div className="mt-1.5 space-y-1.5">
              {links.map((l, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5" data-testid={`link-${idx}`}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 flex items-center gap-2 text-sm hover:underline">
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{l.label}</span>
                    <span className="text-xs text-muted-foreground truncate hidden sm:inline">{l.url}</span>
                  </a>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeLink(idx)} aria-label="Remove link" data-testid={`button-remove-link-${idx}`}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-1.5">
                <Input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Label" className="h-8 text-xs flex-1" data-testid="input-link-label" />
                <Input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…" className="h-8 text-xs flex-[2]" data-testid="input-link-url" />
                <Button size="sm" variant="outline" className="h-8" onClick={addLink} disabled={!linkLabel.trim() || !linkUrl.trim()} data-testid="button-add-link">
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* Notes (WYSIWYG) */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Notes</Label>
            <div className="mt-1.5">
              <RichTextEditor value={notes} onChange={saveNotes} testId="editor-task-notes" />
            </div>
          </div>

          {/* Subtasks */}
          {!task.parentTaskId && (
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                <ListChecks className="h-3 w-3" /> Subtasks
              </Label>
              <div className="mt-1.5 space-y-1">
                {subtasks.map(st => (
                  <div key={st.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5" data-testid={`subtask-${st.id}`}>
                    <button
                      onClick={() => toggleSubtaskMutation.mutate({ id: st.id, status: st.status === "done" ? "todo" : "done" })}
                      className="shrink-0"
                      aria-label={st.status === "done" ? "Mark not done" : "Mark done"}
                      data-testid={`button-toggle-subtask-${st.id}`}
                    >
                      {st.status === "done"
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40" />}
                    </button>
                    <span className={`text-sm flex-1 ${st.status === "done" ? "line-through text-muted-foreground" : ""}`}>{st.title}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteSubtaskMutation.mutate(st.id)} aria-label="Delete subtask" data-testid={`button-delete-subtask-${st.id}`}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <Input
                    value={newSubtaskTitle}
                    onChange={e => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && newSubtaskTitle.trim()) addSubtaskMutation.mutate(newSubtaskTitle.trim()); }}
                    placeholder="Add subtask and press Enter"
                    className="h-8 text-xs"
                    data-testid="input-new-subtask"
                  />
                  <Button size="sm" variant="outline" className="h-8" onClick={() => newSubtaskTitle.trim() && addSubtaskMutation.mutate(newSubtaskTitle.trim())} disabled={!newSubtaskTitle.trim()} data-testid="button-add-subtask">
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="border-t border-border pt-4 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              Created {new Date(task.createdAt).toLocaleDateString()}
              {task.completedAt && <> · Completed {new Date(task.completedAt).toLocaleDateString()}</>}
            </p>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteMutation.mutate()} data-testid="button-delete-task">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete task
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
