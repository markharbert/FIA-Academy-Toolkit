import { useState, useEffect } from "react";
import { RotateCcw } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  type WidgetConfig,
  type WidgetId,
  WIDGET_META,
  DEFAULT_LAYOUT,
} from "./widget-registry";

export function CustomizePanel({
  layout,
  open,
  onOpenChange,
  onSave,
  isSaving,
}: {
  layout: WidgetConfig[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (layout: WidgetConfig[]) => void;
  isSaving?: boolean;
}) {
  const [draft, setDraft] = useState<WidgetConfig[]>([]);

  useEffect(() => {
    if (open) setDraft([...layout]);
  }, [open]);

  function toggleVisible(id: WidgetId) {
    setDraft((prev) =>
      prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w))
    );
  }

  function handleReset() {
    setDraft(DEFAULT_LAYOUT.map((d) => ({ ...d })));
  }

  function handleCancel() {
    setDraft([...layout]);
    onOpenChange(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) handleCancel();
        else onOpenChange(true);
      }}
    >
      <SheetContent className="w-full sm:max-w-sm flex flex-col gap-0 p-0 overflow-hidden">
        <SheetHeader className="p-6 pb-4 border-b border-border shrink-0">
          <SheetTitle>Add / Remove Widgets</SheetTitle>
          <SheetDescription>
            Toggle which widgets appear on your dashboard.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-2 min-h-0">
          {draft.map((item) => {
            const meta = WIDGET_META[item.id];
            return (
              <div
                key={item.id}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                  item.visible
                    ? "border-border bg-card"
                    : "border-border/40 bg-muted/30 opacity-60"
                }`}
                data-testid={`widget-toggle-row-${item.id}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{meta.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {meta.description}
                  </p>
                </div>
                <Switch
                  checked={item.visible}
                  onCheckedChange={() => toggleVisible(item.id)}
                  data-testid={`switch-widget-${item.id}`}
                  aria-label={`${item.visible ? "Hide" : "Show"} ${meta.title}`}
                />
              </div>
            );
          })}
        </div>

        <SheetFooter className="p-5 pt-4 border-t border-border shrink-0 flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="mr-auto gap-1.5 text-muted-foreground"
            data-testid="button-reset-widgets"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            data-testid="button-cancel-widgets"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => onSave(draft)}
            disabled={isSaving}
            className="bg-violet-600 hover:bg-violet-700 text-white"
            data-testid="button-save-widgets"
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
