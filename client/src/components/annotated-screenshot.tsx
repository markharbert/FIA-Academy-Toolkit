type AnnotationColor = "red" | "orange" | "green" | "amber" | "blue" | "violet";

export type Annotation = {
  x: number;
  y: number;
  w: number;
  h: number;
  color?: AnnotationColor;
  label?: string;
  labelPos?: "tl" | "tr" | "bl" | "br" | "outside-top" | "outside-bottom";
};

const COLOR_CLASSES: Record<AnnotationColor, { box: string; chip: string }> = {
  red: {
    box: "border-red-500 ring-1 ring-red-500/40 shadow-[0_0_0_1px_rgba(239,68,68,0.25)]",
    chip: "bg-red-500 text-white",
  },
  orange: {
    box: "border-orange-500 ring-1 ring-orange-500/40 shadow-[0_0_0_1px_rgba(249,115,22,0.25)]",
    chip: "bg-orange-500 text-white",
  },
  amber: {
    box: "border-amber-500 ring-1 ring-amber-500/40 shadow-[0_0_0_1px_rgba(245,158,11,0.25)]",
    chip: "bg-amber-500 text-black",
  },
  green: {
    box: "border-emerald-500 ring-1 ring-emerald-500/40 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]",
    chip: "bg-emerald-500 text-white",
  },
  blue: {
    box: "border-sky-500 ring-1 ring-sky-500/40 shadow-[0_0_0_1px_rgba(14,165,233,0.25)]",
    chip: "bg-sky-500 text-white",
  },
  violet: {
    box: "border-violet-500 ring-1 ring-violet-500/40 shadow-[0_0_0_1px_rgba(139,92,246,0.25)]",
    chip: "bg-violet-500 text-white",
  },
};

function chipPosClasses(pos: Annotation["labelPos"]) {
  switch (pos) {
    case "tr":
      return "top-0 right-0 -translate-y-1/2 translate-x-1/4";
    case "bl":
      return "bottom-0 left-0 translate-y-1/2 -translate-x-1/4";
    case "br":
      return "bottom-0 right-0 translate-y-1/2 translate-x-1/4";
    case "outside-top":
      return "top-0 left-1/2 -translate-x-1/2 -translate-y-[120%]";
    case "outside-bottom":
      return "bottom-0 left-1/2 -translate-x-1/2 translate-y-[120%]";
    case "tl":
    default:
      return "top-0 left-0 -translate-y-1/2 -translate-x-1/4";
  }
}

export function AnnotatedScreenshot({
  src,
  alt,
  annotations = [],
}: {
  src: string;
  alt: string;
  annotations?: Annotation[];
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-sm bg-background">
      <div className="relative">
        <img
          src={src}
          alt={alt}
          className="w-full h-auto block"
          loading="lazy"
        />
        {annotations.length > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            {annotations.map((a, i) => {
              const color = a.color ?? "red";
              const classes = COLOR_CLASSES[color];
              return (
                <div
                  key={i}
                  className={`absolute rounded-md border-2 ${classes.box}`}
                  style={{
                    left: `${a.x}%`,
                    top: `${a.y}%`,
                    width: `${a.w}%`,
                    height: `${a.h}%`,
                  }}
                  data-testid={`annotation-${i}`}
                >
                  {a.label && (
                    <span
                      className={`absolute ${chipPosClasses(a.labelPos)} text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded-md shadow-sm whitespace-nowrap ${classes.chip}`}
                    >
                      {a.label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
