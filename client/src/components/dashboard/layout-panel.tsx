import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { type WidgetConfig, type WidgetSize } from "./widget-registry";

// ─── Preset definitions ────────────────────────────────────────────────────────

type LayoutPreset = {
  id: string;
  label: string;
  description: string;
  pattern: WidgetSize[];
  thumbnail: React.ReactNode;
};

const PRESETS: LayoutPreset[] = [
  {
    id: "three-col",
    label: "Three Columns",
    description: "Equal thirds — great for a quick overview",
    pattern: ["third"],
    thumbnail: (
      <div className="flex gap-1.5 h-9">
        <div className="flex-1 rounded-md bg-violet-400/30" />
        <div className="flex-1 rounded-md bg-violet-400/30" />
        <div className="flex-1 rounded-md bg-violet-400/30" />
      </div>
    ),
  },
  {
    id: "two-col",
    label: "Two Columns",
    description: "Side-by-side halves — roomier cards",
    pattern: ["half"],
    thumbnail: (
      <div className="flex gap-1.5 h-9">
        <div className="flex-1 rounded-md bg-violet-400/30" />
        <div className="flex-1 rounded-md bg-violet-400/30" />
      </div>
    ),
  },
  {
    id: "wide-left",
    label: "Wide Left",
    description: "Large featured card on the left",
    pattern: ["two-thirds", "third"],
    thumbnail: (
      <div className="flex gap-1.5 h-9">
        <div className="flex-[2] rounded-md bg-violet-400/30" />
        <div className="flex-1 rounded-md bg-violet-400/20" />
      </div>
    ),
  },
  {
    id: "wide-right",
    label: "Wide Right",
    description: "Compact sidebar left, large card right",
    pattern: ["third", "two-thirds"],
    thumbnail: (
      <div className="flex gap-1.5 h-9">
        <div className="flex-1 rounded-md bg-violet-400/20" />
        <div className="flex-[2] rounded-md bg-violet-400/30" />
      </div>
    ),
  },
  {
    id: "full-width",
    label: "Full Width",
    description: "All widgets span the full row",
    pattern: ["full"],
    thumbnail: (
      <div className="flex gap-1.5 h-9">
        <div className="flex-1 rounded-md bg-violet-400/30" />
      </div>
    ),
  },
];

function applyPreset(layout: WidgetConfig[], pattern: WidgetSize[]): WidgetConfig[] {
  return layout.map((w, i) => ({
    ...w,
    size: pattern[i % pattern.length],
  }));
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function LayoutPanel({
  layout,
  open,
  onOpenChange,
  onApply,
  isSaving,
}: {
  layout: WidgetConfig[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (newLayout: WidgetConfig[]) => void;
  isSaving?: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-sm flex flex-col gap-0 p-0 overflow-hidden">
        <SheetHeader className="p-6 pb-4 border-b border-border shrink-0">
          <SheetTitle>Change Layout</SheetTitle>
          <SheetDescription>
            Choose how your widgets are arranged across the dashboard.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              disabled={isSaving}
              onClick={() => {
                onApply(applyPreset(layout, preset.pattern));
                onOpenChange(false);
              }}
              className="w-full text-left p-4 rounded-xl border border-border bg-card hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-all group disabled:opacity-50"
              data-testid={`layout-preset-${preset.id}`}
            >
              {preset.thumbnail}
              <div className="mt-2.5">
                <p className="text-sm font-semibold group-hover:text-violet-700 dark:group-hover:text-violet-300 transition-colors">
                  {preset.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
              </div>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
