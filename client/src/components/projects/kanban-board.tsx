import { useState, useMemo, useRef, useEffect } from "react";
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCenter,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ProjectTask, ProjectColumn } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, MoreHorizontal, Pencil, Trash2,
  CalendarClock, Flag, ListChecks, CheckCircle2, Loader2, GripVertical,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { dayDiffInTz, formatInTz } from "@shared/datetime";

// ── helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_TONE: Record<string, string> = {
  none:   "",
  low:    "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  high:   "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  urgent: "bg-rose-600 text-white ring-1 ring-rose-300/60",
};

function dueDateTone(due: Date | null, status: string, tz: string) {
  if (!due || status === "done") return "text-muted-foreground bg-muted";
  const d = dayDiffInTz(due, tz);
  if (d < 0) return "text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-900/40";
  if (d <= 1) return "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40";
  return "text-sky-700 bg-sky-100 dark:text-sky-300 dark:bg-sky-900/40";
}

function dueDateLabel(due: Date, tz: string) {
  const d = dayDiffInTz(due, tz);
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  if (d < 0) return `${-d}d overdue`;
  if (d <= 6) return formatInTz(due, tz, "EEE");
  return formatInTz(due, tz, "MMM d");
}

// ── Task Card ─────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: ProjectTask;
  subtaskCount: number;
  doneSubtaskCount: number;
  tz: string;
  onOpen: (id: string) => void;
  isDragOverlay?: boolean;
}

function TaskCard({ task, subtaskCount, doneSubtaskCount, tz, onOpen, isDragOverlay }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const due = task.dueDate ? new Date(task.dueDate) : null;

  const style = isDragOverlay
    ? {}
    : {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.18 : 1,
        touchAction: "none" as const,
      };

  return (
    <div
      ref={isDragOverlay ? undefined : setNodeRef}
      style={style}
      className={`rounded-lg border border-border bg-card shadow-sm select-none ${
        isDragOverlay
          ? "shadow-2xl ring-2 ring-primary/40 rotate-[1.5deg] scale-[1.04]"
          : "hover:shadow-md transition-shadow"
      } ${isDragging ? "cursor-grabbing" : ""}`}
      data-testid={`kanban-card-${task.id}`}
    >
      <div className="flex items-start gap-1.5 p-3">
        <button
          {...(isDragOverlay ? {} : listeners)}
          {...(isDragOverlay ? {} : attributes)}
          className="mt-0.5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0 touch-none"
          onClick={e => e.stopPropagation()}
          aria-label="Drag to reorder"
          data-testid={`drag-handle-${task.id}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => !isDragOverlay && onOpen(task.id)}>
          <p className={`text-sm leading-snug font-medium ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
            {task.title}
          </p>
          {(task.priority !== "none" || due || subtaskCount > 0 || task.status === "done") && (
            <div className="flex flex-wrap items-center gap-1 mt-2">
              {task.priority !== "none" && (
                <Badge className={`text-[10px] gap-0.5 px-1.5 py-0 ${PRIORITY_TONE[task.priority]}`} variant="secondary">
                  <Flag className="h-2.5 w-2.5" /> {task.priority}
                </Badge>
              )}
              {due && (
                <Badge className={`text-[10px] gap-0.5 px-1.5 py-0 ${dueDateTone(due, task.status, tz)}`} variant="secondary">
                  <CalendarClock className="h-2.5 w-2.5" /> {dueDateLabel(due, tz)}
                </Badge>
              )}
              {subtaskCount > 0 && (
                <Badge variant="outline" className="text-[10px] gap-0.5 px-1.5 py-0">
                  <ListChecks className="h-2.5 w-2.5" /> {doneSubtaskCount}/{subtaskCount}
                </Badge>
              )}
              {task.status === "done" && (
                <span className="flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="h-3 w-3" /> Done
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Kanban Column ─────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  column: ProjectColumn;
  tasks: ProjectTask[];
  subtasksByParent: Record<string, ProjectTask[]>;
  tz: string;
  projectId: string;
  onOpenTask: (id: string) => void;
  onRenameColumn: (id: string, name: string) => void;
  onDeleteColumn: (id: string) => void;
  isOnly: boolean;
}

function KanbanColumn({
  column, tasks, subtasksByParent, tz, projectId,
  onOpenTask, onRenameColumn, onDeleteColumn, isOnly,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(column.name);
  const [quickAdd, setQuickAdd] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const createTaskMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/tasks`, {
        title,
        status: "todo",
        columnId: column.id,
        sortOrder: tasks.length * 1000,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setQuickAdd("");
      setShowQuickAdd(false);
    },
    onError: (err: Error) => toast({ title: "Failed to add task", description: err.message, variant: "destructive" }),
  });

  const submitQuickAdd = () => {
    const t = quickAdd.trim();
    if (!t) { setShowQuickAdd(false); return; }
    createTaskMutation.mutate(t);
  };

  const finishEdit = () => {
    const name = editName.trim();
    if (name && name !== column.name) onRenameColumn(column.id, name);
    else setEditName(column.name);
    setEditing(false);
  };

  const startEdit = () => {
    setEditName(column.name);
    setEditing(true);
    setTimeout(() => editRef.current?.select(), 0);
  };

  return (
    <div
      className={`flex flex-col w-72 flex-shrink-0 rounded-xl border-2 transition-colors duration-150 ${
        isOver ? "border-primary/50 bg-primary/5" : "border-transparent bg-muted/40"
      }`}
      data-testid={`kanban-column-${column.id}`}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-t-xl">
        <div
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: column.color ?? "hsl(var(--muted-foreground) / 0.5)" }}
        />
        {editing ? (
          <input
            ref={editRef}
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={finishEdit}
            onKeyDown={e => {
              if (e.key === "Enter") finishEdit();
              if (e.key === "Escape") { setEditName(column.name); setEditing(false); }
            }}
            className="flex-1 text-sm font-semibold bg-transparent border-b border-primary outline-none min-w-0 text-foreground"
            data-testid={`input-column-rename-${column.id}`}
          />
        ) : (
          <span
            className="flex-1 text-sm font-semibold text-foreground min-w-0 truncate"
            onDoubleClick={startEdit}
            data-testid={`text-column-name-${column.id}`}
          >
            {column.name}
          </span>
        )}
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{tasks.length}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
              data-testid={`button-column-menu-${column.id}`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={startEdit} data-testid={`menu-rename-column-${column.id}`}>
              <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDeleteColumn(column.id)}
              disabled={isOnly}
              data-testid={`menu-delete-column-${column.id}`}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              {isOnly ? "Can't delete only column" : "Delete column"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tasks list with sortable context */}
      <div
        ref={setNodeRef}
        className="flex-1 px-2 pb-1 space-y-2 overflow-y-auto"
        style={{ maxHeight: "calc(100vh - 280px)", minHeight: 80 }}
      >
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 && (
            <p className="px-2 py-4 text-xs text-muted-foreground text-center italic">No tasks here</p>
          )}
          {tasks.map(task => {
            const subs = subtasksByParent[task.id] ?? [];
            return (
              <TaskCard
                key={task.id}
                task={task}
                subtaskCount={subs.length}
                doneSubtaskCount={subs.filter(s => s.status === "done").length}
                tz={tz}
                onOpen={onOpenTask}
              />
            );
          })}
        </SortableContext>
      </div>

      {/* Quick add */}
      <div className="px-2 pb-2 pt-1">
        {showQuickAdd ? (
          <div className="rounded-lg border border-border bg-card p-2 space-y-2 shadow-sm">
            <Input
              autoFocus
              value={quickAdd}
              onChange={e => setQuickAdd(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") submitQuickAdd();
                if (e.key === "Escape") { setQuickAdd(""); setShowQuickAdd(false); }
              }}
              placeholder="Task name…"
              className="h-7 text-sm"
              data-testid={`input-quick-add-column-${column.id}`}
            />
            <div className="flex gap-1.5">
              <Button
                size="sm"
                className="h-6 text-xs px-2"
                onClick={submitQuickAdd}
                disabled={createTaskMutation.isPending}
                data-testid={`button-confirm-quick-add-${column.id}`}
              >
                {createTaskMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs px-2"
                onClick={() => { setQuickAdd(""); setShowQuickAdd(false); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs text-muted-foreground justify-start gap-1.5 hover:text-foreground"
            onClick={() => setShowQuickAdd(true)}
            data-testid={`button-add-task-column-${column.id}`}
          >
            <Plus className="h-3.5 w-3.5" /> Add task
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Main Board ────────────────────────────────────────────────────────────────

export interface KanbanBoardProps {
  projectId: string;
  tasks: ProjectTask[];
  tz: string;
  onOpenTask: (id: string) => void;
}

export function KanbanBoard({ projectId, tasks, tz, onOpenTask }: KanbanBoardProps) {
  const { toast } = useToast();
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isDraggingActive, setIsDraggingActive] = useState(false);
  const [localOrder, setLocalOrder] = useState<Record<string, ProjectTask[]>>({});
  const [deleteColumnId, setDeleteColumnId] = useState<string | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  const { data: columns = [], isLoading: columnsLoading } = useQuery<ProjectColumn[]>({
    queryKey: ["/api/projects", projectId, "columns"],
  });

  const topLevelTasks = useMemo(() => tasks.filter(t => !t.parentTaskId), [tasks]);
  const subtasksByParent = useMemo(() => {
    const map: Record<string, ProjectTask[]> = {};
    tasks.filter(t => t.parentTaskId).forEach(t => {
      const arr = map[t.parentTaskId!] ?? [];
      arr.push(t);
      map[t.parentTaskId!] = arr;
    });
    return map;
  }, [tasks]);

  // Server-derived task-by-column map (source of truth when not dragging)
  const serverTasksByColumn = useMemo(() => {
    const map: Record<string, ProjectTask[]> = {};
    columns.forEach(c => { map[c.id] = []; });
    const firstColId = columns[0]?.id;
    topLevelTasks.forEach(t => {
      const colId = t.columnId ?? firstColId;
      if (colId && map[colId] !== undefined) {
        map[colId].push(t);
      } else if (firstColId) {
        map[firstColId].push(t);
      }
    });
    return map;
  }, [topLevelTasks, columns]);

  // Sync local order from server whenever we're not mid-drag
  useEffect(() => {
    if (!isDraggingActive) {
      setLocalOrder(serverTasksByColumn);
    }
  }, [serverTasksByColumn, isDraggingActive]);

  // Stable ref so drag handlers always see latest localOrder
  const localOrderRef = useRef(localOrder);
  localOrderRef.current = localOrder;

  // Find which column contains a given id (task id or column id)
  const findColId = (id: string): string | undefined => {
    if (localOrderRef.current[id] !== undefined) return id; // it IS a column id
    for (const [colId, colTasks] of Object.entries(localOrderRef.current)) {
      if (colTasks.some(t => t.id === id)) return colId;
    }
    return undefined;
  };

  const activeDragTask = activeDragId ? tasks.find(t => t.id === activeDragId) : null;

  // ── mutations ──────────────────────────────────────────────────────────────

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; columnId: string; sortOrder: number }[]) => {
      await apiRequest("POST", `/api/projects/${projectId}/tasks/reorder`, updates);
    },
    onSuccess: () => {
      // Tasks cache was already updated optimistically in handleDragEnd — no need to
      // invalidate it here (that would trigger a refetch → useEffect → re-render → jump).
      // Only invalidate aggregated queries used by other views.
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/all-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/urgent-tasks"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save order", description: err.message, variant: "destructive" });
      // Revert optimistic cache update and local state on failure
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      setLocalOrder(serverTasksByColumn);
    },
  });

  const renameColumnMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await apiRequest("PATCH", `/api/project-columns/${id}`, { name });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "columns"] }),
    onError: (err: Error) => toast({ title: "Failed to rename column", description: err.message, variant: "destructive" }),
  });

  const deleteColumnMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/project-columns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "columns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      setDeleteColumnId(null);
    },
    onError: (err: Error) => toast({ title: "Failed to delete column", description: err.message, variant: "destructive" }),
  });

  const createColumnMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/columns`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "columns"] });
      setAddingColumn(false);
      setNewColumnName("");
    },
    onError: (err: Error) => toast({ title: "Failed to create column", description: err.message, variant: "destructive" }),
  });

  // ── drag handlers ──────────────────────────────────────────────────────────

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
    setIsDraggingActive(true);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    const activeColId = findColId(activeId);
    const overColId = findColId(overId);

    if (!activeColId || !overColId || activeColId === overColId) return;

    // Move item between columns in local state for live preview
    setLocalOrder(prev => {
      const sourceItems = [...(prev[activeColId] ?? [])];
      const destItems = [...(prev[overColId] ?? [])];

      const activeIdx = sourceItems.findIndex(t => t.id === activeId);
      if (activeIdx === -1) return prev;

      const [movedTask] = sourceItems.splice(activeIdx, 1);

      const overIdx = destItems.findIndex(t => t.id === overId);
      if (overIdx === -1) {
        destItems.push(movedTask);
      } else {
        destItems.splice(overIdx, 0, movedTask);
      }

      return { ...prev, [activeColId]: sourceItems, [overColId]: destItems };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (!over) {
      // Cancelled — reset to server state
      setIsDraggingActive(false);
      setLocalOrder(serverTasksByColumn);
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    const colId = findColId(activeId);
    if (!colId) { setIsDraggingActive(false); return; }

    // Handle within-column reorder (dragOver doesn't fire for same-column moves)
    const colTasks = localOrderRef.current[colId] ?? [];
    const activeIdx = colTasks.findIndex(t => t.id === activeId);
    const overIdx = colTasks.findIndex(t => t.id === overId);

    let finalOrder = localOrderRef.current;
    if (activeIdx !== -1 && overIdx !== -1 && activeIdx !== overIdx) {
      finalOrder = { ...finalOrder, [colId]: arrayMove(colTasks, activeIdx, overIdx) };
    }

    // Persist — send all tasks in all columns with new sortOrders
    const updates: { id: string; columnId: string; sortOrder: number }[] = [];
    Object.entries(finalOrder).forEach(([cId, cTasks]) => {
      cTasks.forEach((t, idx) => {
        updates.push({ id: t.id, columnId: cId, sortOrder: idx * 1000 });
      });
    });

    // ── Optimistic cache update ────────────────────────────────────────────────
    // Update the query cache immediately so that when isDraggingActive goes false
    // (which triggers the useEffect that syncs localOrder from serverTasksByColumn),
    // serverTasksByColumn already reflects the new positions — no flash.
    const updateMap = new Map(updates.map(u => [u.id, u]));
    queryClient.setQueryData<ProjectTask[]>(
      ["/api/projects", projectId, "tasks"],
      (old) => old
        ? old.map(t => {
            const u = updateMap.get(t.id);
            return u ? { ...t, columnId: u.columnId, sortOrder: u.sortOrder } : t;
          })
        : old,
    );

    // Now safe to end the drag — serverTasksByColumn is already updated above
    setIsDraggingActive(false);

    reorderMutation.mutate(updates);
  };

  // ── render ─────────────────────────────────────────────────────────────────

  if (columnsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin mr-2 text-muted-foreground" />
        <span className="text-muted-foreground text-sm">Loading board…</span>
      </div>
    );
  }

  const colToDelete = columns.find(c => c.id === deleteColumnId);

  return (
    <div className="flex-1 overflow-auto min-h-0">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 p-4 pb-10 items-start min-h-[400px]">
          {columns.map(col => (
            <KanbanColumn
              key={col.id}
              column={col}
              tasks={localOrder[col.id] ?? []}
              subtasksByParent={subtasksByParent}
              tz={tz}
              projectId={projectId}
              onOpenTask={onOpenTask}
              onRenameColumn={(id, name) => renameColumnMutation.mutate({ id, name })}
              onDeleteColumn={(id) => setDeleteColumnId(id)}
              isOnly={columns.length === 1}
            />
          ))}

          {/* Add column */}
          <div className="flex-shrink-0 w-60">
            {addingColumn ? (
              <div className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-3 space-y-2">
                <Input
                  autoFocus
                  value={newColumnName}
                  onChange={e => setNewColumnName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newColumnName.trim()) createColumnMutation.mutate(newColumnName.trim());
                    if (e.key === "Escape") { setAddingColumn(false); setNewColumnName(""); }
                  }}
                  placeholder="Column name…"
                  className="h-7 text-sm"
                  data-testid="input-new-column-name"
                />
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => newColumnName.trim() && createColumnMutation.mutate(newColumnName.trim())}
                    disabled={createColumnMutation.isPending}
                    data-testid="button-confirm-new-column"
                  >
                    {createColumnMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add column"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => { setAddingColumn(false); setNewColumnName(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs text-muted-foreground border-dashed"
                onClick={() => setAddingColumn(true)}
                data-testid="button-add-column"
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add column
              </Button>
            )}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeDragTask && (() => {
            const subs = subtasksByParent[activeDragTask.id] ?? [];
            return (
              <TaskCard
                task={activeDragTask}
                subtaskCount={subs.length}
                doneSubtaskCount={subs.filter(s => s.status === "done").length}
                tz={tz}
                onOpen={() => {}}
                isDragOverlay
              />
            );
          })()}
        </DragOverlay>
      </DndContext>

      <AlertDialog open={!!deleteColumnId} onOpenChange={o => !o && setDeleteColumnId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete "{colToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>All tasks in this column will be moved to the first remaining column, then the column will be permanently deleted.</p>
                <p className="font-semibold text-destructive">This is permanent. There is no way to get it back.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteColumnId && deleteColumnMutation.mutate(deleteColumnId)}
              disabled={deleteColumnMutation.isPending}
            >
              {deleteColumnMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Delete column
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
