import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
  useReactFlow,
} from "@xyflow/react";
import { useState, useMemo } from "react";
import { X } from "lucide-react";
import { useCanvasTheme } from "./canvas-theme-context";

/* ── Email-sequence edge: manual dash + envelope rendering ─────
   Instead of a CSS strokeDasharray (which can't be interrupted),
   we draw every dash as an individual <line> element and swap one
   every ENVELOPE_EVERY positions for a tiny envelope icon.
   The envelope is never rotated so it always stays upright.
──────────────────────────────────────────────────────────────── */
const DASH_LEN = 9;
const GAP_LEN  = 6;
const ENVELOPE_EVERY = 6; // every 6th dash slot → envelope

type SeqItem =
  | { kind: "dash";     x1: number; y1: number; x2: number; y2: number }
  | { kind: "envelope"; x:  number; y:  number };

function buildEmailItems(pathStr: string): SeqItem[] {
  try {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
    el.setAttribute("d", pathStr);
    const totalLen = el.getTotalLength();
    if (totalLen < 1) return [];

    const items: SeqItem[] = [];
    let pos = 0;
    let idx = 0;

    while (pos < totalLen) {
      const end   = Math.min(pos + DASH_LEN, totalLen);
      const isEnv = idx > 0 && idx % ENVELOPE_EVERY === 0;

      if (isEnv) {
        const cp = (pos + end) / 2;
        const c  = el.getPointAtLength(cp);
        items.push({ kind: "envelope", x: c.x, y: c.y });
      } else {
        const p1 = el.getPointAtLength(pos);
        const p2 = el.getPointAtLength(end);
        items.push({ kind: "dash", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      }

      pos += DASH_LEN + GAP_LEN;
      idx++;
    }
    return items;
  } catch {
    return [];
  }
}

/* Tiny envelope centered at (0,0), 12×8 px — always upright. */
function EnvelopeIcon({ color }: { color: string }) {
  return (
    <g>
      <rect x="-6" y="-4" width="12" height="8" rx="1"
        fill="none" stroke={color} strokeWidth="0.9" />
      <polyline points="-6,-4 0,1.5 6,-4"
        fill="none" stroke={color} strokeWidth="0.9" strokeLinejoin="round" />
    </g>
  );
}

/* ── Email-traffic edge: manual dash + directional arrow rendering ─
   Same rhythm as the envelope edges but every ARROW_EVERY positions
   a small chevron arrow replaces a dash. The arrow is rotated to
   match the local path direction so it always points the right way.
──────────────────────────────────────────────────────────────────── */
const ARROW_EVERY = 5; // every 5th dash slot → arrow

type TrafficItem =
  | { kind: "dash";  x1: number; y1: number; x2: number; y2: number }
  | { kind: "arrow"; x:  number; y:  number; angle: number };

function buildArrowItems(pathStr: string): TrafficItem[] {
  try {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
    el.setAttribute("d", pathStr);
    const totalLen = el.getTotalLength();
    if (totalLen < 1) return [];

    const items: TrafficItem[] = [];
    let pos = 0;
    let idx = 0;

    while (pos < totalLen) {
      const end     = Math.min(pos + DASH_LEN, totalLen);
      const isArrow = idx > 0 && idx % ARROW_EVERY === 0;

      if (isArrow) {
        const cp  = (pos + end) / 2;
        const c   = el.getPointAtLength(cp);
        // Sample two nearby points to get local tangent angle
        const d   = Math.min(4, totalLen - cp);
        const p1  = el.getPointAtLength(Math.max(0, cp - d));
        const p2  = el.getPointAtLength(Math.min(totalLen, cp + d));
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
        items.push({ kind: "arrow", x: c.x, y: c.y, angle });
      } else {
        const p1 = el.getPointAtLength(pos);
        const p2 = el.getPointAtLength(end);
        items.push({ kind: "dash", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      }

      pos += DASH_LEN + GAP_LEN;
      idx++;
    }
    return items;
  } catch {
    return [];
  }
}

/* Small chevron arrow centered at (0,0), pointing right → rotate to path angle */
function ArrowIcon({ color }: { color: string }) {
  return (
    <g>
      <polyline
        points="-5,-4 1,0 -5,4"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/* ─────────────────────────────────────────────────────────────
   EDGE BUNDLING — clean fan arrival

   When multiple edges converge on the same target node they all
   land at the exact same pixel, creating spaghetti. The fix:

   1. getSmoothStepPath (right-angle routing) never crosses when
      edges are ordered consistently — unlike bezier curves.

   2. A small offset is applied perpendicular to the handle face:
      • top/bottom handles  → offset X  (horizontal spread)
      • left/right handles  → offset Y  (vertical spread)
      Spacing: 5 px per edge, capped at 28 px total.

   3. Same logic on the source side for one → many fan-outs.
───────────────────────────────────────────────────────────── */

const BUNDLE_SPACING = 5;   // px between adjacent bundled edges
const BUNDLE_MAX_SPAN = 28; // cap total spread

function bundleOffset(rank: number, count: number): number {
  if (count <= 1) return 0;
  const span = Math.min((count - 1) * BUNDLE_SPACING, BUNDLE_MAX_SPAN);
  const step = span / (count - 1);
  return rank * step - span / 2;
}

export function CustomEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandle,
  targetHandle,
  selected,
  data,
  markerEnd,
}: EdgeProps) {
  const { deleteElements, setEdges, getNode, getEdges } = useReactFlow();
  const [hovered, setHovered] = useState(false);
  const theme = useCanvasTheme();

  const edgeData = data as { pathType?: "yes" | "no" } | undefined;
  const pathType = edgeData?.pathType;

  // ── Gather siblings ───────────────────────────────────────
  // Only bundle edges that share the SAME target node AND the same
  // target handle — e.g. emails→bottom and thank-you→left are
  // separate groups even though they hit the same node.
  const allEdges = getEdges();

  // Many → one: same target node + same target handle
  const targetSiblings = allEdges
    .filter((e) => e.target === target && e.targetHandle === targetHandle)
    .sort((a, b) => a.id.localeCompare(b.id));
  const targetRank = targetSiblings.findIndex((e) => e.id === id);
  const targetCount = targetSiblings.length;

  // One → many: same source node + same source handle
  const sourceSiblings = allEdges
    .filter((e) => e.source === source && e.sourceHandle === sourceHandle)
    .sort((a, b) => a.id.localeCompare(b.id));
  const sourceRank = sourceSiblings.findIndex((e) => e.id === id);
  const sourceCount = sourceSiblings.length;

  // ── Axis selection ────────────────────────────────────────
  // top/bottom handles are entered vertically → spread horizontally (X)
  // left/right handles are entered horizontally → spread vertically (Y)
  const targetOffsetOnX = targetPosition === "top" || targetPosition === "bottom";
  const sourceOffsetOnX = sourcePosition === "top" || sourcePosition === "bottom";

  const tOff = bundleOffset(targetRank, targetCount);
  const sOff = bundleOffset(sourceRank, sourceCount);

  const adjTargetX = targetOffsetOnX ? targetX + tOff : targetX;
  const adjTargetY = targetOffsetOnX ? targetY : targetY + tOff;
  const adjSourceX = sourceOffsetOnX ? sourceX + sOff : sourceX;
  const adjSourceY = sourceOffsetOnX ? sourceY : sourceY + sOff;

  // ── Path computation ──────────────────────────────────────
  // Special case: "backward" bottom→top edge where the source is
  // meaningfully to the RIGHT of the target (e.g. Capture Page bottom
  // → Email 1 top when the capture page sits further right on canvas).
  // Routing this through the normal smoothstep corridor puts it right
  // on top of the email→sales-page bundle going through the same space.
  // Fix: route it BELOW the target node's row so it bypasses the bundle.

  // U-route: only when source is at the SAME level or BELOW the target
  // (source bottom ≥ target top). When the source is naturally ABOVE the
  // target (normal funnel layout), standard smoothstep handles it cleanly
  // without creating a long detour that sweeps behind other nodes.
  const isBackwardBottomTop =
    sourcePosition === "bottom" &&
    targetPosition === "top" &&
    adjSourceX > adjTargetX + 30 &&
    adjSourceY >= adjTargetY;

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  const targetNode = getNode(target);

  if (isBackwardBottomTop) {
    const targetNodeBottom =
      (targetNode?.position?.y ?? adjTargetY) +
      (targetNode?.measured?.height ?? 160);
    const underY = targetNodeBottom + 30; // route below the target node row
    const r = 10;

    edgePath = [
      `M ${adjSourceX},${adjSourceY}`,
      `L ${adjSourceX},${underY - r}`,
      `Q ${adjSourceX},${underY} ${adjSourceX - r},${underY}`,
      `L ${adjTargetX + r},${underY}`,
      `Q ${adjTargetX},${underY} ${adjTargetX},${underY - r}`,
      `L ${adjTargetX},${adjTargetY}`,
    ].join(" ");

    labelX = (adjSourceX + adjTargetX) / 2;
    labelY = underY;
  } else {
    // Right-angle routing with rounded corners — never crosses sibling edges
    [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX: adjSourceX,
      sourceY: adjSourceY,
      sourcePosition,
      targetX: adjTargetX,
      targetY: adjTargetY,
      targetPosition,
      borderRadius: 10,
    });
  }

  const defaultColor = theme === "light" ? "#64748b" : "#94a3b8";
  const selectedColor = theme === "light" ? "#6366f1" : "#818cf8";

  const sourceNode = getNode(source);
  const isTrafficEdge = sourceNode?.type === "trafficSource";

  // Page node types (anything that isn't a source or an email step)
  const PAGE_TYPES = new Set([
    "capturePage","thankYouPage","salesPage","videoPage",
    "webinar","orderForm","upsell","downsell","externalLink",
  ]);

  // Purple "sequence" treatment:
  // • email → email  (chain between sequence steps)
  // • capturePage → email  (entry point into the sequence)
  const isEmailSequence =
    (sourceNode?.type === "emailNode" && targetNode?.type === "emailNode") ||
    (sourceNode?.type === "capturePage" && targetNode?.type === "emailNode");

  // Amber "email traffic" treatment:
  // • email → any page  (sending your list to a destination)
  const isEmailTrafficEdge =
    sourceNode?.type === "emailNode" && PAGE_TYPES.has(targetNode?.type ?? "");

  // Email→email sequence edges: violet to signal "chain"
  const sequenceColor = theme === "light" ? "#8b5cf6" : "#a78bfa";

  // Email→page traffic edges: amber to signal "warm list traffic"
  const emailTrafficColor = theme === "light" ? "#d97706" : "#fbbf24";

  // Build manual dash+envelope items for email-sequence edges (only when no yes/no override)
  const emailSeqItems = useMemo(
    () => (isEmailSequence && !pathType ? buildEmailItems(edgePath) : []),
    [edgePath, isEmailSequence, pathType]
  );

  // Build manual dash+arrow items for email-traffic edges (only when no yes/no override)
  const emailTrafficItems = useMemo(
    () => (isEmailTrafficEdge && !pathType ? buildArrowItems(edgePath) : []),
    [edgePath, isEmailTrafficEdge, pathType]
  );

  const strokeColor =
    pathType === "yes"
      ? "#22c55e"
      : pathType === "no"
      ? "#ef4444"
      : selected
      ? selectedColor
      : isEmailSequence
      ? sequenceColor
      : isEmailTrafficEdge
      ? emailTrafficColor
      : defaultColor;

  const strokeWidth = selected ? 3 : (isEmailSequence || isEmailTrafficEdge) ? 2.5 : 1.5;
  // Email sequence dashes are rendered manually; no dasharray needed here
  const strokeDasharray = undefined;

  const visible = selected || hovered;

  function setPathType(next: "yes" | "no" | undefined) {
    setEdges((eds) =>
      eds.map((e) =>
        e.id === id ? { ...e, data: { ...e.data, pathType: next } } : e
      )
    );
  }

  const popupBg = theme === "light"
    ? "bg-white border-gray-200 shadow-md"
    : "bg-[hsl(230,45%,11%)] border-white/15 shadow-lg";

  const dividerCls = theme === "light" ? "bg-gray-200" : "bg-white/15";

  const btnBase = theme === "light"
    ? "bg-gray-100 text-gray-500 hover:bg-gray-200"
    : "bg-white/10 text-white/50";

  return (
    <>
      {/* Email-sequence: manual dashes + envelope icons */}
      {isEmailSequence && !pathType ? (
        emailSeqItems.map((item, i) =>
          item.kind === "envelope" ? (
            <g key={i} style={{ pointerEvents: "none" }}
               transform={`translate(${item.x},${item.y})`}>
              <EnvelopeIcon color={sequenceColor} />
            </g>
          ) : (
            <line
              key={i}
              x1={item.x1} y1={item.y1}
              x2={item.x2} y2={item.y2}
              stroke={selected ? selectedColor : sequenceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          )
        )
      ) : (
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={{ stroke: strokeColor, strokeWidth, strokeDasharray }}
        />
      )}

      {/* Animated traffic flow — edges from a traffic source node (green) */}
      {isTrafficEdge && (
        <>
          <path
            d={edgePath}
            stroke="rgba(74,222,128,0.22)"
            strokeWidth={8}
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={edgePath}
            stroke="rgba(74,222,128,0.95)"
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            strokeDasharray="10 16"
            style={{ animation: "traffic-flow 1.8s linear infinite" }}
          />
          <path
            d={edgePath}
            stroke="rgba(134,239,172,0.55)"
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            strokeDasharray="10 16"
            style={{ animation: "traffic-flow 1.8s linear infinite", animationDelay: "-0.9s" }}
          />
        </>
      )}

      {/* Animated email traffic flow — email → page (amber) with travelling arrows */}
      {isEmailTrafficEdge && !pathType && (
        <>
          {/* Soft amber glow halo */}
          <path
            d={edgePath}
            stroke="rgba(251,191,36,0.18)"
            strokeWidth={8}
            fill="none"
            strokeLinecap="round"
          />
          {/* Flowing amber dashes */}
          <path
            d={edgePath}
            stroke="rgba(217,119,6,0.9)"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeDasharray="10 22"
            style={{ animation: "traffic-flow 2.2s linear infinite" }}
          />
          <path
            d={edgePath}
            stroke="rgba(251,191,36,0.5)"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeDasharray="10 22"
            style={{ animation: "traffic-flow 2.2s linear infinite", animationDelay: "-1.1s" }}
          />
          {/* Arrows travelling along the path — 3 evenly staggered */}
          {([-2.2 * 0, -2.2 / 3, -2.2 * 2 / 3] as number[]).map((delay, i) => (
            <g key={i} style={{ pointerEvents: "none" }}>
              <animateMotion
                dur="2.2s"
                repeatCount="indefinite"
                begin={`${delay.toFixed(2)}s`}
                rotate="auto"
              >
                <mpath href={`#${id}`} />
              </animateMotion>
              <ArrowIcon color="rgba(251,191,36,0.95)" />
            </g>
          ))}
        </>
      )}

      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Always-visible path type pill (when set) */}
          {pathType && !visible && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded select-none"
              style={{
                background: pathType === "yes" ? "#15803d" : "#b91c1c",
                color: "#fff",
              }}
            >
              {pathType === "yes" ? "Yes" : "No"}
            </span>
          )}

          {/* Hover / selected controls */}
          {visible && (
            <div
              className={`flex items-center gap-1 px-1.5 py-1 rounded-lg border ${popupBg}`}
              style={{ transition: "opacity 150ms" }}
            >
              <button
                onClick={(e) => { e.stopPropagation(); setPathType(pathType === "yes" ? undefined : "yes"); }}
                title="Mark as Yes path"
                data-testid={`button-edge-yes-${id}`}
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                  pathType === "yes"
                    ? "bg-green-600 text-white"
                    : `${btnBase} hover:bg-green-600/50 hover:text-white`
                }`}
              >
                Yes
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); setPathType(pathType === "no" ? undefined : "no"); }}
                title="Mark as No path"
                data-testid={`button-edge-no-${id}`}
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                  pathType === "no"
                    ? "bg-red-600 text-white"
                    : `${btnBase} hover:bg-red-600/50 hover:text-white`
                }`}
              >
                No
              </button>

              <div className={`w-px h-3 mx-0.5 ${dividerCls}`} />

              <button
                onClick={(e) => { e.stopPropagation(); deleteElements({ edges: [{ id }] }); }}
                title="Delete connection"
                data-testid={`button-delete-edge-${id}`}
                className={`flex items-center justify-center w-4 h-4 rounded transition-colors cursor-pointer hover:bg-red-500/80 hover:text-white ${
                  theme === "light" ? "text-gray-400" : "text-white/40"
                }`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const edgeTypes = {
  custom: CustomEdge,
};
