import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, Plus, ChevronDown, ChevronRight, Pencil, Trash2,
  FileText, Eye, EyeOff, GripVertical, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
    mutationFn: (title: string) =>
      apiFetch(`/api/admin/courses/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
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
        <div className="flex-1 min-w-0">
          <InlineEdit
            value={course.title}
            onSave={(title) => title.trim() && updateCourse.mutate(title.trim())}
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
        {modules.map((module, mi) => {
          const isOpen = expandedModules.has(module.id);
          return (
            <div key={module.id} className="rounded-lg border bg-card overflow-hidden">
              {/* Module header */}
              <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/40 group">
                <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                <button
                  onClick={() => toggleModule(module.id)}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
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
                  onClick={() => {
                    if (confirm(`Delete module "${module.title}" and all its lessons?`)) {
                      deleteModule.mutate(module.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Lessons */}
              {isOpen && (
                <div className="divide-y">
                  {module.lessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      className="flex items-center gap-2 px-4 py-2 group hover:bg-muted/30 transition-colors"
                    >
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0 text-sm">
                        <InlineEdit
                          value={lesson.title}
                          onSave={(title) => updateLesson.mutate({ lessonId: lesson.id, title })}
                        />
                      </div>
                      {lesson.videoUrl && (
                        <span className="text-xs text-muted-foreground shrink-0">video</span>
                      )}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() =>
                            setLocation(`/admin/courses/${id}/lessons/${lesson.id}`)
                          }
                          title="Edit lesson"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Delete lesson "${lesson.title}"?`)) {
                              deleteLesson.mutate(lesson.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* Add lesson row */}
                  {addingLesson?.moduleId === module.id ? (
                    <form
                      className="flex items-center gap-2 px-4 py-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (addingLesson.title.trim()) {
                          addLesson.mutate({ moduleId: module.id, title: addingLesson.title });
                        }
                      }}
                    >
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Input
                        autoFocus
                        placeholder="Lesson title…"
                        value={addingLesson.title}
                        onChange={(e) =>
                          setAddingLesson({ moduleId: module.id, title: e.target.value })
                        }
                        className="h-7 text-sm py-0"
                      />
                      <Button type="submit" size="icon" variant="ghost" className="h-7 w-7" disabled={addLesson.isPending}>
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAddingLesson(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  ) : (
                    <button
                      className="flex items-center gap-2 w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                      onClick={() => setAddingLesson({ moduleId: module.id, title: "" })}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add lesson
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

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
    </div>
  );
}
