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
  /** Repeating size pattern applied to all widgets in order */
  pattern: WidgetSize[];
  /**
   * When true the FIRST item in `pattern` is "pinned" to the first widget
   * and the REMAINING items form the repeating body pattern for every other
   * widget (position 1…n). Perfect for "full-width header + columns" layouts.
   */
  anchorFirst?: boolean;
  thumbnail: React.ReactNode;
};

const PRESETS: LayoutPreset[] = [
  // ── Simple column presets ────────────────────────────────────────────────
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

  // ── Header + column presets ─────────────────────────────────────────────
  {
    id: "full-then-halves",
    label: "Banner + Two Columns",
    description: "Full-width hero widget, then equal halves below",
    pattern: ["full", "half"],
    anchorFirst: true,
    thumbnail: (
      <div className="flex flex-col gap-1.5 h-9">
        <div className="rounded-md bg-violet-400/30 flex-[0_0_40%]" />
        <div className="flex gap-1.5 flex-1">
          <div className="flex-1 rounded-md bg-violet-400/25" />
          <div className="flex-1 rounded-md bg-violet-400/25" />
        </div>
      </div>
    ),
  },
  {
    id: "full-then-wide-left",
    label: "Banner + Wide Left",
    description: "Full-width hero, then two-thirds / third below",
    pattern: ["full", "two-thirds", "third"],
    anchorFirst: true,
    thumbnail: (
      <div className="flex flex-col gap-1.5 h-9">
        <div className="rounded-md bg-violet-400/30 flex-[0_0_40%]" />
        <div className="flex gap-1.5 flex-1">
          <div className="flex-[2] rounded-md bg-violet-400/25" />
          <div className="flex-1 rounded-md bg-violet-400/15" />
        </div>
      </div>
    ),
  },
  {
    id: "full-then-wide-right",
    label: "Banner + Wide Right",
    description: "Full-width hero, then third / two-thirds below",
    pattern: ["full", "third", "two-thirds"],
    anchorFirst: true,
    thumbnail: (
      <div className="flex flex-col gap-1.5 h-9">
        <div className="rounded-md bg-violet-400/30 flex-[0_0_40%]" />
        <div className="flex gap-1.5 flex-1">
          <div className="flex-1 rounded-md bg-violet-400/15" />
          <div className="flex-[2] rounded-md bg-violet-400/25" />
        </div>
      </div>
    ),
  },
];

// ─── Apply helpers ─────────────────────────────────────────────────────────────

function applyPreset(layout: WidgetConfig[], preset: LayoutPreset): WidgetConfig[] {
  const { pattern, anchorFirst } = preset;

  if (anchorFirst && pattern.length > 1) {
    const [firstSize, ...bodyPattern] = pattern;
    return layout.map((w, i) => ({
      ...w,
      size: i === 0 ? firstSize : bodyPattern[(i - 1) % bodyPattern.length],
    }));
  }

  return layout.map((w, i) => ({
    ...w,
    size: pattern[i % pattern.length],
  }));
}

// ─── Divider helper ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/70 px-1 pt-2 pb-0.5">
      {children}
    </p>
  );
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
  const simple = PRESETS.filter((p) => !p.anchorFirst);
  const withHeader = PRESETS.filter((p) => p.anchorFirst);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-sm flex flex-col gap-0 p-0 overflow-hidden">
        <SheetHeader className="p-6 pb-4 border-b border-border shrink-0">
          <SheetTitle>Change Layout</SheetTitle>
          <SheetDescription>
            Choose how your widgets are arranged across the dashboard.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-2 min-h-0">
          <SectionLabel>Column layouts</SectionLabel>
          {simple.map((preset) => (
            <PresetButton
              key={preset.id}
              preset={preset}
              disabled={isSaving}
              onApply={() => {
                onApply(applyPreset(layout, preset));
                onOpenChange(false);
              }}
            />
          ))}

          <SectionLabel>Banner + columns</SectionLabel>
          {withHeader.map((preset) => (
            <PresetButton
              key={preset.id}
              preset={preset}
              disabled={isSaving}
              onApply={() => {
                onApply(applyPreset(layout, preset));
                onOpenChange(false);
              }}
            />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PresetButton({
  preset,
  disabled,
  onApply,
}: {
  preset: LayoutPreset;
  disabled?: boolean;
  onApply: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onApply}
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
  );
}
