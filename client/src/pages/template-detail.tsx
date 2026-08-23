import { useMemo, useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ProjectTemplate, ProjectTemplateTask, ProjectLink } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Plus, ChevronDown, ChevronRight, Flag, Loader2, ListChecks, Trash2, ExternalLink, X, Tag } from "lucide-react";

const PRIORITY_TONE: Record<string, string> = {
  none:   "",
  low:    "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  high:   "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  urgent: "bg-rose-600 text-white",
};

export default function TemplateDetailPage() {
  const params = useParams();
  const templateId = params.id!;
  const { toast } = useToast();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [quickAdd, setQuickAdd] = useState("");
  const [quickAddSub, setQuickAddSub] = useState<Record<string, string>>({});

  const { data: template, isLoading: templateLoading } = useQuery<ProjectTemplate>({
    queryKey: ["/api/project-templates", templateId],
  });
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<ProjectTemplateTask[]>({
    queryKey: ["/api/project-templates", templateId, "tasks"],
  });

  const topLevel = useMemo(() => tasks.filter(t => !t.parentTaskId), [tasks]);
  const subsByParent = useMemo(() => {
    const map: Record<string, ProjectTemplateTask[]> = {};
    tasks.filter(t => t.parentTaskId).forEach(t => {
      const arr = map[t.parentTaskId!] ?? [];
      arr.push(t);
      map[t.parentTaskId!] = arr;
    });
    return map;
  }, [tasks]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/project-templates", templateId, "tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] });
  };

  const createTaskMutation = useMutation({
    mutationFn: async ({ title, parentTaskId }: { title: string; parentTaskId?: string }) => {
      const res = await apiRequest("POST", `/api/project-templates/${templateId}/tasks`, { title, parentTaskId });
      return res.json();
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/template-tasks/${id}`); },
    onSuccess: () => { invalidate(); setOpenTaskId(null); },
  });

  const submitQuickAdd = () => {
    const t = quickAdd.trim();
    if (!t) return;
    createTaskMutation.mutate({ title: t });
    setQuickAdd("");
  };
  const submitQuickAddSub = (parentTaskId: string) => {
    const t = quickAddSub[parentTaskId]?.trim();
    if (!t) return;
    createTaskMutation.mutate({ title: t, parentTaskId });
    setQuickAddSub(prev => ({ ...prev, [parentTaskId]: "" }));
  };

  if (templateLoading || !template) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="template-loading">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading template…
      </div>
    );
  }

  const openTask = openTaskId ? tasks.find(t => t.id === openTaskId) ?? null : null;
  const openSubs = openTask && !openTask.parentTaskId ? (subsByParent[openTask.id] ?? []) : [];
  const openParent = openTask?.parentTaskId ? tasks.find(t => t.id === openTask.parentTaskId) ?? null : null;

  return (
    <div className="flex-1 overflow-auto bg-background">
      {/* Header */}
      <div className="border-b border-border" style={{ background: `linear-gradient(135deg, ${template.color}E6, ${template.color}99)` }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 text-white">
          <Link href="/projects">
            <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/10 -ml-2 mb-2" data-testid="link-back-templates">
              <ChevronLeft className="h-4 w-4 mr-1" /> All projects
            </Button>
          </Link>
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <Badge className="bg-white/20 text-white border-0 mb-2 text-[10px] uppercase tracking-wide">Template</Badge>
              <h1 className="text-3xl font-bold tracking-tight" data-testid="text-template-title">{template.name}</h1>
              {template.description && (
                <p className="mt-1 text-sm text-white/85 max-w-2xl">{template.description}</p>
              )}
            </div>
            <Badge className="bg-white/15 text-white border-0">
              {tasks.length} task{tasks.length === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground" data-testid="text-template-help">
          Tasks in a template have no due date — pick dates after creating a project from this template.
        </div>

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
              <h2 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Tasks</h2>
              <span className="text-xs text-muted-foreground tabular-nums">· {topLevel.length}</span>
            </div>
            <div className="divide-y divide-border">
              {tasksLoading && (
                <p className="px-4 py-3 text-xs text-muted-foreground italic">Loading…</p>
              )}
              {!tasksLoading && topLevel.length === 0 && (
                <p className="px-4 py-3 text-xs text-muted-foreground italic">No tasks yet — add your first task below.</p>
              )}
              {topLevel.map(task => {
                const subs = subsByParent[task.id] ?? [];
                const isExpanded = expanded[task.id];
                return (
                  <div key={task.id} data-testid={`template-task-row-${task.id}`}>
                    <div className="flex items-center gap-2 px-4 py-2 hover:bg-muted/30 group">
                      {subs.length > 0 ? (
                        <button
                          onClick={() => setExpanded(p => ({ ...p, [task.id]: !p[task.id] }))}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label={isExpanded ? "Collapse" : "Expand"}
                          data-testid={`button-template-expand-${task.id}`}
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      ) : (
                        <span className="w-4 shrink-0" />
                      )}
                      <button
                        onClick={() => setOpenTaskId(task.id)}
                        className="flex-1 min-w-0 text-left"
                        data-testid={`button-template-open-task-${task.id}`}
                      >
                        <span className="text-sm">{task.title}</span>
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {task.priority !== "none" && (
                          <Badge className={`text-[10px] gap-0.5 px-1.5 py-0 ${PRIORITY_TONE[task.priority]}`} variant="secondary">
                            <Flag className="h-2.5 w-2.5" /> {task.priority}
                          </Badge>
                        )}
                        {subs.length > 0 && (
                          <Badge variant="outline" className="text-[10px] gap-0.5 px-1.5 py-0">
                            <ListChecks className="h-2.5 w-2.5" /> {subs.length}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="bg-muted/20 border-t border-border">
                        {subs.map(st => (
                          <div key={st.id} className="flex items-center gap-2 pl-12 pr-4 py-1.5 hover:bg-muted/30" data-testid={`template-subtask-row-${st.id}`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                            <button onClick={() => setOpenTaskId(st.id)} className="text-sm text-left flex-1 min-w-0">
                              {st.title}
                            </button>
                            {st.priority !== "none" && (
                              <Badge className={`text-[10px] px-1.5 py-0 ${PRIORITY_TONE[st.priority]}`} variant="secondary">{st.priority}</Badge>
                            )}
                          </div>
                        ))}
                        <div className="flex items-center gap-2 pl-12 pr-4 py-1.5 bg-muted/10">
                          <Plus className="h-3 w-3 text-muted-foreground shrink-0" />
                          <Input
                            value={quickAddSub[task.id] ?? ""}
                            onChange={e => setQuickAddSub(prev => ({ ...prev, [task.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === "Enter") submitQuickAddSub(task.id); }}
                            placeholder="Add a subtask…"
                            className="h-6 text-xs border-0 shadow-none px-1 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
                            data-testid={`input-template-subtask-${task.id}`}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="flex items-center gap-2 px-4 py-2 bg-muted/10">
                <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Input
                  value={quickAdd}
                  onChange={e => setQuickAdd(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") submitQuickAdd(); }}
                  placeholder="Add a task to this template…"
                  className="h-7 text-sm border-0 shadow-none px-1 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
                  data-testid="input-template-quick-add"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <TemplateTaskSheet
        templateId={templateId}
        task={openTask}
        parentTask={openParent}
        subtasks={openSubs}
        open={!!openTaskId}
        onOpenChange={(o) => { if (!o) setOpenTaskId(null); }}
        onOpenTask={(id) => setOpenTaskId(id)}
        onDelete={(id) => deleteTaskMutation.mutate(id)}
      />
    </div>
  );
}

// ── Sheet ────────────────────────────────────────────────────────────────────

function TemplateTaskSheet({
  templateId, task, parentTask, subtasks, open, onOpenChange, onOpenTask, onDelete,
}: {
  templateId: string;
  task: ProjectTemplateTask | null;
  parentTask: ProjectTemplateTask | null;
  subtasks: ProjectTemplateTask[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onOpenTask: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<"none" | "low" | "medium" | "high" | "urgent">("none");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [links, setLinks] = useState<ProjectLink[]>([]);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [subAdd, setSubAdd] = useState("");

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setPriority((task.priority as any) ?? "none");
    setTags(task.tags ?? []);
    setLinks(task.links ?? []);
    setTagInput("");
    setLinkLabel("");
    setLinkUrl("");
    setSubAdd("");
  }, [task?.id]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/project-templates", templateId, "tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] });
  };

  const updateMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      if (!task) return;
      await apiRequest("PATCH", `/api/template-tasks/${task.id}`, patch);
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const createSubMutation = useMutation({
    mutationFn: async (subTitle: string) => {
      if (!task) return;
      await apiRequest("POST", `/api/project-templates/${templateId}/tasks`, { title: subTitle, parentTaskId: task.id });
    },
    onSuccess: () => { invalidate(); setSubAdd(""); },
  });

  if (!task) return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent /></Sheet>;

  const saveTitle = () => {
    const t = title.trim();
    if (!t || t === task.title) return;
    updateMutation.mutate({ title: t });
  };
  const saveNotes = () => {
    if ((notes ?? "") === (task.notes ?? "")) return;
    updateMutation.mutate({ notes });
  };
  const setPriorityNow = (p: typeof priority) => {
    setPriority(p);
    updateMutation.mutate({ priority: p });
  };
  const addTag = () => {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) { setTagInput(""); return; }
    const next = [...tags, t];
    setTags(next);
    setTagInput("");
    updateMutation.mutate({ tags: next });
  };
  const removeTag = (t: string) => {
    const next = tags.filter(x => x !== t);
    setTags(next);
    updateMutation.mutate({ tags: next });
  };
  const addLink = () => {
    const label = linkLabel.trim();
    const url = linkUrl.trim();
    if (!label || !url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast({ title: "Link must start with http:// or https://", variant: "destructive" });
      return;
    }
    const next = [...links, { label, url }];
    setLinks(next);
    setLinkLabel(""); setLinkUrl("");
    updateMutation.mutate({ links: next });
  };
  const removeLink = (idx: number) => {
    const next = links.filter((_, i) => i !== idx);
    setLinks(next);
    updateMutation.mutate({ links: next });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto" data-testid="sheet-template-task">
        <SheetHeader className="pb-3">
          <SheetTitle>Edit template task</SheetTitle>
        </SheetHeader>

        {parentTask && (
          <button
            onClick={() => onOpenTask(parentTask.id)}
            className="w-full text-left mb-3 px-3 py-2 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2"
            data-testid="button-template-back-to-parent-top"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back to “{parentTask.title}”
          </button>
        )}

        <div className="space-y-4">
          <div>
            <Label htmlFor="tpl-title">Title</Label>
            <Input
              id="tpl-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              data-testid="input-template-task-title"
            />
          </div>

          <div>
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriorityNow(v as typeof priority)}>
              <SelectTrigger className="mt-1.5" data-testid="select-template-priority"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="tpl-notes">Notes</Label>
            <Textarea
              id="tpl-notes"
              rows={5}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Notes saved with this template task…"
              data-testid="input-template-notes"
            />
          </div>

          <div>
            <Label>Tags</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {tags.map(t => (
                <Badge key={t} variant="secondary" className="gap-1" data-testid={`tag-${t}`}>
                  <Tag className="h-2.5 w-2.5" /> {t}
                  <button onClick={() => removeTag(t)} aria-label="Remove tag" className="ml-1 hover:text-destructive">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="mt-1.5 flex gap-2">
              <Input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="Add tag and press Enter"
                className="h-8"
                data-testid="input-template-tag"
              />
              <Button size="sm" variant="outline" onClick={addTag}>Add</Button>
            </div>
          </div>

          <div>
            <Label>Links</Label>
            <div className="mt-1.5 space-y-1.5">
              {links.map((l, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border" data-testid={`link-row-${i}`}>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  <a href={l.url} target="_blank" rel="noreferrer" className="text-xs flex-1 truncate hover:underline">{l.label}</a>
                  <button onClick={() => removeLink(i)} aria-label="Remove link" className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <Input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Label" className="h-8" data-testid="input-template-link-label" />
              <Input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…" className="h-8" data-testid="input-template-link-url" />
            </div>
            <Button size="sm" variant="outline" className="mt-1.5" onClick={addLink} data-testid="button-template-link-add">Add link</Button>
          </div>

          {!task.parentTaskId && (
            <div>
              <Label>Subtasks</Label>
              <div className="mt-1.5 space-y-1">
                {subtasks.map(st => (
                  <button
                    key={st.id}
                    onClick={() => onOpenTask(st.id)}
                    className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-md hover:bg-muted/50 text-sm"
                    data-testid={`template-subtask-link-${st.id}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                    <span className="flex-1 min-w-0 truncate">{st.title}</span>
                    {st.priority !== "none" && (
                      <Badge className={`text-[10px] px-1.5 py-0 ${PRIORITY_TONE[st.priority]}`} variant="secondary">{st.priority}</Badge>
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-1.5 flex gap-2">
                <Input
                  value={subAdd}
                  onChange={e => setSubAdd(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { const t = subAdd.trim(); if (t) createSubMutation.mutate(t); } }}
                  placeholder="Add a subtask…"
                  className="h-8"
                  data-testid="input-template-add-subtask"
                />
                <Button size="sm" variant="outline" onClick={() => { const t = subAdd.trim(); if (t) createSubMutation.mutate(t); }}>Add</Button>
              </div>
            </div>
          )}

          {parentTask && (
            <button
              onClick={() => onOpenTask(parentTask.id)}
              className="w-full text-left px-3 py-2 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2"
              data-testid="button-template-back-to-parent-bottom"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back to “{parentTask.title}”
            </button>
          )}

          <div className="pt-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete(task.id)}
              data-testid="button-template-delete-task"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete task
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
