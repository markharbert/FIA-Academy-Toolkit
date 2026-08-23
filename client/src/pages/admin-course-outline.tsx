import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Plus, ChevronDown, ChevronRight, Pencil, Trash2,
  FileText, Eye, EyeOff, ArrowUp, ArrowDown, Check, X, Smile, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { COURSE_ICON_GROUPS, CourseIcon } from "@/lib/course-icons";
import { buildCourseModuleTree, type CourseModuleTree } from "@shared/course-structure";

type Lesson = {
  id: string;
  title: string;
  status: string;
  sortOrder: number;
  videoUrl: string | null;
  durationMinutes: number | null;
};

type Module = {
  id: string;
  parentModuleId: string | null;
  title: string;
  status: string;
  sortOrder: number;
  lessons: Lesson[];
};

type CourseStructure = {
  course: {
    id: string;
    title: string;
    status: string;
    description: string | null;
    icon: string | null;
  };
  modules: Module[];
};

async function apiFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || res.statusText);
  }
  return res.json();
}

function InlineEdit({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <span
        className={cn("cursor-pointer hover:underline hover:decoration-dashed", className)}
        onClick={() => { setDraft(value); setEditing(true); }}
      >
        {value}
      </span>
    );
  }

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => { e.preventDefault(); onSave(draft); setEditing(false); }}
    >
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="h-7 text-sm py-0"
      />
      <Button type="submit" size="icon" variant="ghost" className="h-7 w-7">
        <Check className="h-3.5 w-3.5 text-green-500" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(false)}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </form>
  );
}

export default function AdminCourseOutlinePage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [addingModuleTitle, setAddingModuleTitle] = useState("");
  const [showAddModule, setShowAddModule] = useState(false);
  const [addingLesson, setAddingLesson] = useState<{ moduleId: string; title: string } | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [customNumber, setCustomNumber] = useState("");
  const [moduleToDelete, setModuleToDelete] = useState<{ id: string; title: string } | null>(null);
  const [lessonToDelete, setLessonToDelete] = useState<{ id: string; title: string } | null>(null);

  const { data, isLoading } = useQuery<CourseStructure>({
    queryKey: ["/api/admin/courses", id, "structure"],
    queryFn: () => apiFetch(`/api/admin/courses/${id}/structure`),
  });

  // Auto-expand all modules when data first loads
  const hasExpanded = useState(false);
  useEffect(() => {
    if (data && !hasExpanded[0]) {
      setExpandedModules(new Set(data.modules.map((m) => m.id)));
      hasExpanded[1](true);
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/courses", id, "structure"] });

  const updateCourse = useMutation({
    mutationFn: (updates: { title?: string; icon?: string | null }) =>
      apiFetch(`/api/admin/courses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      }),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/courses"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const togglePublishCourse = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/courses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: data?.course.status === "published" ? "draft" : "published" }),
      }),
    onSuccess: () => { invalidate(); queryClient.invalidateQueries({ queryKey: ["/api/admin/courses"] }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addModule = useMutation({
    mutationFn: (title: string) =>
      apiFetch(`/api/admin/courses/${id}/modules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }),
    onSuccess: (newMod) => {
      invalidate();
      setShowAddModule(false);
      setAddingModuleTitle("");
      setExpandedModules((prev) => new Set([...prev, newMod.id]));
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateModule = useMutation({
    mutationFn: ({ moduleId, title }: { moduleId: string; title: string }) =>
      apiFetch(`/api/admin/modules/${moduleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }),
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteModule = useMutation({
    mutationFn: (moduleId: string) =>
      apiFetch(`/api/admin/modules/${moduleId}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addLesson = useMutation({
    mutationFn: ({ moduleId, title }: { moduleId: string; title: string }) =>
      apiFetch(`/api/admin/modules/${moduleId}/lessons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, courseId: id }),
      }),
    onSuccess: () => { invalidate(); setAddingLesson(null); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateLesson = useMutation({
    mutationFn: ({ lessonId, title }: { lessonId: string; title: string }) =>
      apiFetch(`/api/admin/lessons/${lessonId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }),
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteLesson = useMutation({
    mutationFn: (lessonId: string) =>
      apiFetch(`/api/admin/lessons/${lessonId}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const reorderModules = useMutation({
    mutationFn: ({ orderedIds, parentModuleId }: { orderedIds: string[]; parentModuleId: string | null }) =>
      apiFetch(`/api/admin/courses/${id}/modules/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds, parentModuleId }),
      }),
    onSuccess: invalidate,
    onError: (e: Error) => {
      invalidate();
      toast({ title: "Couldn't save module order", description: e.message, variant: "destructive" });
    },
  });

  const reorderLessons = useMutation({
    mutationFn: ({ moduleId, orderedIds }: { moduleId: string; orderedIds: string[] }) =>
      apiFetch(`/api/admin/modules/${moduleId}/lessons/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      }),
    onSuccess: invalidate,
    onError: (e: Error) => {
      invalidate();
      toast({ title: "Couldn't save lesson order", description: e.message, variant: "destructive" });
    },
  });

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-muted-foreground">Course not found.</p>
      </div>
    );
  }

  const { course, modules } = data;
  const totalLessons = modules.reduce((s, m) => s + m.lessons.length, 0);
  const moduleTree = buildCourseModuleTree(modules);

  const moveModule = (module: Module, direction: -1 | 1) => {
    const siblings = modules
      .filter((candidate) => candidate.parentModuleId === module.parentModuleId)
      .sort((left, right) => left.sortOrder - right.sortOrder);
    const currentIndex = siblings.findIndex((candidate) => candidate.id === module.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;
    const orderedIds = siblings.map((candidate) => candidate.id);
    [orderedIds[currentIndex], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[currentIndex]];
    reorderModules.mutate({ orderedIds, parentModuleId: module.parentModuleId });
  };

  const moveLesson = (moduleId: string, lessonId: string, lessons: Lesson[], direction: -1 | 1) => {
    const currentIndex = lessons.findIndex((lesson) => lesson.id === lessonId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= lessons.length) return;
    const orderedIds = lessons.map((lesson) => lesson.id);
    [orderedIds[currentIndex], orderedIds[targetIndex]] = [orderedIds[targetIndex], orderedIds[currentIndex]];
    reorderLessons.mutate({ moduleId, orderedIds });
  };

  const renderModule = (module: CourseModuleTree<Module>, depth = 0) => {
    const isOpen = expandedModules.has(module.id);
    const siblings = modules
      .filter((candidate) => candidate.parentModuleId === module.parentModuleId)
      .sort((left, right) => left.sortOrder - right.sortOrder);
    const siblingIndex = siblings.findIndex((candidate) => candidate.id === module.id);

    return (
      <div
        key={module.id}
        className={cn("rounded-lg border bg-card overflow-hidden", depth > 0 && "ml-5 border-l-4 border-l-violet-400/30")}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/40 group">
          <button
            onClick={() => moveModule(module, -1)}
            className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
            disabled={reorderModules.isPending || siblingIndex === 0}
            title="Move module up"
            aria-label={`Move ${module.title} up`}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => moveModule(module, 1)}
            className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-30"
            disabled={reorderModules.isPending || siblingIndex === siblings.length - 1}
            title="Move module down"
            aria-label={`Move ${module.title} down`}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => toggleModule(module.id)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={isOpen ? `Collapse ${module.title}` : `Expand ${module.title}`}
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div className="flex-1 min-w-0 font-medium text-sm">
            <InlineEdit
              value={module.title}
              onSave={(title) => updateModule.mutate({ moduleId: module.id, title })}
            />
          </div>
          <span className="text-xs text-muted-foreground shrink-0">
            {module.lessons.length} lesson{module.lessons.length !== 1 ? "s" : ""}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0 text-destructive hover:text-destructive"
            onClick={() => setModuleToDelete({ id: module.id, title: module.title })}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {isOpen && (
          <div className="divide-y">
            {module.lessons.map((lesson, lessonIndex) => (
              <div key={lesson.id} className="flex items-center gap-2 px-4 py-2 group hover:bg-muted/30 transition-colors">
                <div className="flex shrink-0 flex-col">
                  <button
                    onClick={() => moveLesson(module.id, lesson.id, module.lessons, -1)}
                    disabled={reorderLessons.isPending || lessonIndex === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    title="Move lesson up"
                    aria-label={`Move ${lesson.title} up`}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => moveLesson(module.id, lesson.id, module.lessons, 1)}
                    disabled={reorderLessons.isPending || lessonIndex === module.lessons.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    title="Move lesson down"
                    aria-label={`Move ${lesson.title} down`}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0 text-sm">
                  <InlineEdit value={lesson.title} onSave={(title) => updateLesson.mutate({ lessonId: lesson.id, title })} />
                </div>
                {lesson.videoUrl && (
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-sm"
                    title="Video added to this lesson"
                    aria-label="Video added to this lesson"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                  </span>
                )}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setLocation(`/admin/courses/${id}/lessons/${lesson.id}`)} title="Edit lesson">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setLessonToDelete({ id: lesson.id, title: lesson.title })}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}

            {addingLesson?.moduleId === module.id ? (
              <form className="flex items-center gap-2 px-4 py-2" onSubmit={(e) => {
                e.preventDefault();
                if (addingLesson.title.trim()) addLesson.mutate({ moduleId: module.id, title: addingLesson.title });
              }}>
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Input autoFocus placeholder="Lesson title…" value={addingLesson.title} onChange={(e) => setAddingLesson({ moduleId: module.id, title: e.target.value })} className="h-7 text-sm py-0" />
                <Button type="submit" size="icon" variant="ghost" className="h-7 w-7" disabled={addLesson.isPending}><Check className="h-3.5 w-3.5 text-green-500" /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAddingLesson(null)}><X className="h-3.5 w-3.5" /></Button>
              </form>
            ) : (
              <button className="flex items-center gap-2 w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors" onClick={() => setAddingLesson({ moduleId: module.id, title: "" })}>
                <Plus className="h-3.5 w-3.5" /> Add lesson
              </button>
            )}
            {module.children.map((child) => renderModule(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back + header */}
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/admin/courses")}
          className="h-8 w-8 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* Icon picker */}
        <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-violet-400 hover:text-violet-300"
              title="Change course icon"
            >
              <CourseIcon icon={course.icon} className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="max-h-96 overflow-y-auto p-3 space-y-4">
              {/* Icon groups */}
              {COURSE_ICON_GROUPS.map((group) => (
                <div key={group.category}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    {group.category}
                  </p>
                  <div className="grid grid-cols-8 gap-0.5">
                    {group.icons.map(({ name, icon: Icon }) => (
                      <button
                        key={name}
                        title={name}
                        onClick={() => { updateCourse.mutate({ icon: name }); setIconPickerOpen(false); }}
                        className={cn(
                          "flex items-center justify-center rounded h-8 w-8 hover:bg-muted transition-colors",
                          course.icon === name && "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/50",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Numbers */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Number
                </p>
                <div className="grid grid-cols-8 gap-0.5 mb-2">
                  {["1","2","3","4","5","6","7","8","9"].map((n) => (
                    <button
                      key={n}
                      onClick={() => { updateCourse.mutate({ icon: n }); setIconPickerOpen(false); }}
                      className={cn(
                        "flex items-center justify-center rounded h-8 w-8 text-sm font-semibold hover:bg-muted transition-colors",
                        course.icon === n && "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/50",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1">
                  <Input
                    placeholder="Custom number…"
                    value={customNumber}
                    onChange={(e) => setCustomNumber(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customNumber) {
                        updateCourse.mutate({ icon: customNumber });
                        setCustomNumber("");
                        setIconPickerOpen(false);
                      }
                    }}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    disabled={!customNumber}
                    onClick={() => { updateCourse.mutate({ icon: customNumber }); setCustomNumber(""); setIconPickerOpen(false); }}
                  >
                    Set
                  </Button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t p-2">
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
                onClick={() => { updateCourse.mutate({ icon: null }); setIconPickerOpen(false); }}
              >
                Remove icon
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex-1 min-w-0">
          <InlineEdit
            value={course.title}
            onSave={(title) => title.trim() && updateCourse.mutate({ title: title.trim() })}
            className="text-xl font-semibold"
          />
          <p className="text-xs text-muted-foreground mt-0.5">
            {modules.length} module{modules.length !== 1 ? "s" : ""} · {totalLessons} lesson{totalLessons !== 1 ? "s" : ""}
          </p>
        </div>
        <Button
          size="sm"
          variant={course.status === "published" ? "outline" : "default"}
          onClick={() => togglePublishCourse.mutate()}
          disabled={togglePublishCourse.isPending}
        >
          {course.status === "published" ? (
            <><EyeOff className="h-3.5 w-3.5 mr-1.5" /> Unpublish</>
          ) : (
            <><Eye className="h-3.5 w-3.5 mr-1.5" /> Publish</>
          )}
        </Button>
      </div>

      {/* Module list */}
      <div className="space-y-3">
        {moduleTree.map((module) => renderModule(module))}

        {/* Add module */}
        {showAddModule ? (
          <form
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (addingModuleTitle.trim()) {
                addModule.mutate(addingModuleTitle.trim());
              }
            }}
          >
            <Input
              autoFocus
              placeholder="Module title…"
              value={addingModuleTitle}
              onChange={(e) => setAddingModuleTitle(e.target.value)}
              className="h-8 text-sm"
            />
            <Button type="submit" size="sm" disabled={addModule.isPending || !addingModuleTitle.trim()}>
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => { setShowAddModule(false); setAddingModuleTitle(""); }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowAddModule(true)}
          >
            <Plus className="h-4 w-4 mr-2" /> Add Module
          </Button>
        )}
      </div>

      {/* Delete module dialog */}
      <Dialog open={!!moduleToDelete} onOpenChange={(open) => { if (!open) setModuleToDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete module?</DialogTitle>
            <DialogDescription>
              <strong>"{moduleToDelete?.title}"</strong> and all its lessons will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModuleToDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { moduleToDelete && deleteModule.mutate(moduleToDelete.id); setModuleToDelete(null); }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete lesson dialog */}
      <Dialog open={!!lessonToDelete} onOpenChange={(open) => { if (!open) setLessonToDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete lesson?</DialogTitle>
            <DialogDescription>
              <strong>"{lessonToDelete?.title}"</strong> will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLessonToDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { lessonToDelete && deleteLesson.mutate(lessonToDelete.id); setLessonToDelete(null); }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
