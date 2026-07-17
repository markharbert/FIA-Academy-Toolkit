import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Eye, EyeOff, RotateCcw } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type WidgetConfig,
  type WidgetId,
  type WidgetSize,
  WIDGET_META,
  SIZE_LABELS,
  DEFAULT_LAYOUT,
} from "./widget-registry";

function SortableRow({
  item,
  onToggleVisible,
  onChangeSize,
}: {
  item: WidgetConfig;
  onToggleVisible: (id: WidgetId) => void;
  onChangeSize: (id: WidgetId, size: WidgetSize) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const meta = WIDGET_META[item.id];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg border bg-card transition-colors ${
        item.visible ? "border-border" : "border-border/40 opacity-60"
      }`}
      data-testid={`customize-row-${item.id}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none shrink-0"
        aria-label={`Drag to reorder ${meta.title}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{meta.title}</p>
        <p className="text-xs text-muted-foreground truncate">{meta.description}</p>
      </div>
      <Select
        value={item.size}
        onValueChange={(v) => onChangeSize(item.id, v as WidgetSize)}
        disabled={!item.visible}
      >
        <SelectTrigger
          className="w-28 h-8 text-xs shrink-0"
          data-testid={`select-size-${item.id}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(["third", "half", "two-thirds", "full"] as WidgetSize[]).map((s) => (
            <SelectItem key={s} value={s} data-testid={`option-size-${item.id}-${s}`}>
              {SIZE_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        onClick={() => onToggleVisible(item.id)}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title={item.visible ? "Hide widget" : "Show widget"}
        data-testid={`button-toggle-widget-${item.id}`}
        aria-label={item.visible ? `Hide ${meta.title}` : `Show ${meta.title}`}
      >
        {item.visible ? (
          <Eye className="h-4 w-4" />
        ) : (
          <EyeOff className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

export function CustomizePanel({
  layout,
  onSave,
  isSaving,
  open,
  onOpenChange,
}: {
  layout: WidgetConfig[];
  onSave: (layout: WidgetConfig[]) => void;
  isSaving?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState<WidgetConfig[]>(layout);

  useEffect(() => {
    if (open) setDraft([...layout]);
  }, [open]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((prev) => {
      const oldIndex = prev.findIndex((w) => w.id === active.id);
      const newIndex = prev.findIndex((w) => w.id === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  function toggleVisible(id: WidgetId) {
    setDraft((prev) =>
      prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w))
    );
  }

  function changeSize(id: WidgetId, size: WidgetSize) {
    setDraft((prev) =>
      prev.map((w) => (w.id === id ? { ...w, size } : w))
    );
  }

  function handleReset() {
    setDraft([...DEFAULT_LAYOUT]);
  }

  function handleCancel() {
    setDraft([...layout]);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) handleCancel(); else onOpenChange(true); }}>
      <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0 overflow-hidden">
        <SheetHeader className="p-6 pb-4 border-b border-border shrink-0">
          <SheetTitle>Customize Dashboard</SheetTitle>
          <SheetDescription>
            Drag to reorder widgets, toggle visibility, or change each widget's width.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-2 min-h-0">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={draft.map((w) => w.id)}
              strategy={verticalListSortingStrategy}
            >
              {draft.map((item) => (
                <SortableRow
                  key={item.id}
                  item={item}
                  onToggleVisible={toggleVisible}
                  onChangeSize={changeSize}
                />
              ))}
            </SortableContext>
          </DndContext>

          <p className="text-xs text-muted-foreground pt-2 text-center">
            Hidden widgets won't appear on your dashboard.
          </p>
        </div>

        <SheetFooter className="p-6 pt-4 border-t border-border shrink-0 flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="mr-auto gap-1.5"
            data-testid="button-reset-layout"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            data-testid="button-cancel-customize"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => onSave(draft)}
            disabled={isSaving}
            className="bg-violet-600 hover:bg-violet-700 text-white"
            data-testid="button-save-layout"
          >
            {isSaving ? "Saving…" : "Save layout"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
