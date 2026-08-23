import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Plus, BookOpen, Layout, MoreHorizontal, Eye, EyeOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const GRADIENTS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
];

type CourseWithStats = {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  coverGradient: string | null;
  status: string;
  sortOrder: number;
  createdAt: string;
  moduleCount: number;
  lessonCount: number;
};

async function apiFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || res.statusText);
  }
  return res.json();
}

export default function AdminCoursesPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "" });

  const { data: courses = [], isLoading } = useQuery<CourseWithStats[]>({
    queryKey: ["/api/admin/courses"],
    queryFn: () => apiFetch("/api/admin/courses"),
  });

  const createMutation = useMutation({
    mutationFn: (data: { title: string; description: string }) =>
      apiFetch("/api/admin/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/courses"] });
      setCreateOpen(false);
      setForm({ title: "", description: "" });
      toast({ title: "Course created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const togglePublishMutation = useMutation({
    mutationFn: (course: CourseWithStats) =>
      apiFetch(`/api/admin/courses/${course.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: course.status === "published" ? "draft" : "published" }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/courses"] }),
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const [courseToDelete, setCourseToDelete] = useState<{ id: string; title: string } | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/courses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/courses"] });
      setCourseToDelete(null);
      toast({ title: "Course deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = courses.filter((c) =>
    filter === "all" ? true : c.status === filter
  );

  const tabs = [
    { id: "all" as const, label: "All" },
    { id: "published" as const, label: "Published" },
    { id: "draft" as const, label: "Draft" },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Courses</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create and manage training courses for your members.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="btn-new-course">
          <Plus className="h-4 w-4 mr-2" />
          New Course
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              filter === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-xs bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
              {t.id === "all"
                ? courses.length
                : courses.filter((c) => c.status === t.id).length}
            </span>
          </button>
        ))}
      </div>

      {/* Course grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-medium text-lg mb-1">No courses yet</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Create your first course to get started.
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Course
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((course, i) => (
            <div
              key={course.id}
              className="rounded-xl border bg-card overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Cover */}
              <div
                className="h-28 flex items-end p-3"
                style={{
                  background:
                    course.coverGradient || GRADIENTS[i % GRADIENTS.length],
                }}
              >
                <Badge
                  variant={course.status === "published" ? "default" : "secondary"}
                  className="capitalize"
                >
                  {course.status}
                </Badge>
              </div>

              {/* Body */}
              <div className="p-4">
                <h3 className="font-semibold text-sm leading-snug mb-1 line-clamp-2">
                  {course.title}
                </h3>
                {course.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                    {course.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mb-3">
                  {course.moduleCount} module{course.moduleCount !== 1 ? "s" : ""} ·{" "}
                  {course.lessonCount} lesson{course.lessonCount !== 1 ? "s" : ""}
                </p>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs"
                    onClick={() =>
                      setLocation(`/admin/courses/${course.id}/outline`)
                    }
                    data-testid={`btn-outline-${course.id}`}
                  >
                    <Layout className="h-3.5 w-3.5 mr-1" />
                    Edit Outline
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => togglePublishMutation.mutate(course)}
                      >
                        {course.status === "published" ? (
                          <>
                            <EyeOff className="h-4 w-4 mr-2" /> Unpublish
                          </>
                        ) : (
                          <>
                            <Eye className="h-4 w-4 mr-2" /> Publish
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setCourseToDelete({ id: course.id, title: course.title })}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={!!courseToDelete} onOpenChange={(open) => { if (!open) setCourseToDelete(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete course?</DialogTitle>
            <DialogDescription>
              <strong>"{courseToDelete?.title}"</strong> and all its modules and
              lessons will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCourseToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => courseToDelete && deleteMutation.mutate(courseToDelete.id)}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete Course"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Course</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="course-title">Title</Label>
              <Input
                id="course-title"
                placeholder="e.g. Fearless Influencer Academy"
                value={form.title}
                onChange={(e) =>
                  setForm((p) => ({ ...p, title: e.target.value }))
                }
                data-testid="input-course-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-desc">
                Description{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="course-desc"
                placeholder="Brief overview of what members will learn…"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.title.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "Creating…" : "Create Course"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
