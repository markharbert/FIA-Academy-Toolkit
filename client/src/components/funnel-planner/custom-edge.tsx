import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
  useReactFlow,
} from "@xyflow/react";
import { useState } from "react";
import { X } from "lucide-react";
import { useCanvasTheme } from "./canvas-theme-context";

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
    "webinar","zoom","orderForm","upsell","downsell","externalLink",
  ]);

  // Purple "sequence" treatment:
  // • email → email  (chain between sequence steps)
  // • capturePage → email  (entry point into the sequence)
  // • webinar → email/sms  (webinar registrants enter the sequence)
  // • email/sms → delay  (when that delay also leads to an email/sms)
  // • delay → email/sms  (when that delay also receives from an email/sms)
  const SEQUENCE_TYPES = new Set(["emailNode", "smsNode"]);
  const delayHasSequenceNeighbour = (delayId: string, side: "incoming" | "outgoing") =>
    allEdges.some((e) => {
      if (side === "incoming") return e.target === delayId && SEQUENCE_TYPES.has(getNode(e.source)?.type ?? "");
      return e.source === delayId && SEQUENCE_TYPES.has(getNode(e.target)?.type ?? "");
    });

  const isEmailSequence =
    (SEQUENCE_TYPES.has(sourceNode?.type ?? "") && SEQUENCE_TYPES.has(targetNode?.type ?? "")) ||
    (sourceNode?.type === "capturePage" && SEQUENCE_TYPES.has(targetNode?.type ?? "")) ||
    (sourceNode?.type === "webinar" && SEQUENCE_TYPES.has(targetNode?.type ?? "")) ||
    (SEQUENCE_TYPES.has(sourceNode?.type ?? "") && targetNode?.type === "delay" && delayHasSequenceNeighbour(target, "outgoing")) ||
    (sourceNode?.type === "delay" && SEQUENCE_TYPES.has(targetNode?.type ?? "") && delayHasSequenceNeighbour(source, "incoming"));

  // Amber "email/sms traffic" treatment:
  // • email/sms → any page  (sending your list to a destination)
  const isEmailTrafficEdge =
    SEQUENCE_TYPES.has(sourceNode?.type ?? "") && PAGE_TYPES.has(targetNode?.type ?? "");

  // Email→email sequence edges: violet to signal "chain"
  const sequenceColor = theme === "light" ? "#8b5cf6" : "#a78bfa";

  // Email→page traffic edges: amber to signal "warm list traffic"
  const emailTrafficColor = theme === "light" ? "#d97706" : "#fbbf24";

  // (static builders no longer used for rendering — animation replaces them)

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
      {/* Email-sequence: solid violet line with envelope icons flowing along it */}
      {isEmailSequence && !pathType ? (
        <>
          {/* Hidden path for animateMotion mpath reference */}
          <path id={`seq-${id}`} d={edgePath} fill="none" stroke="none" />
          {/* Soft violet glow halo */}
          <path
            d={edgePath}
            stroke="rgba(167,139,250,0.18)"
            strokeWidth={8}
            fill="none"
            strokeLinecap="round"
          />
          {/* Solid violet line */}
          <path
            d={edgePath}
            stroke={selected ? selectedColor : sequenceColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
          />
          {/* 4 envelopes evenly spaced, flowing continuously */}
          {Array.from({ length: 4 }, (_, i) => {
            const delay = -(i * (3 / 4));
            const color = selected ? selectedColor : sequenceColor;
            return (
              <g key={i} style={{ pointerEvents: "none" }}>
                <animateMotion
                  dur="3s"
                  repeatCount="indefinite"
                  begin={`${delay.toFixed(3)}s`}
                >
                  <mpath href={`#seq-${id}`} />
                </animateMotion>
                <EnvelopeIcon color={color} />
              </g>
            );
          })}
        </>
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

      {/* Animated email traffic flow — email → page (amber).
          15 items flow along the path together: every 5th is an arrow,
          the rest are dashes — one unified stream, no secondary layer. */}
      {isEmailTrafficEdge && !pathType && (
        <>
          {/* Soft amber glow halo */}
          <path
            d={edgePath}
            stroke="rgba(251,191,36,0.15)"
            strokeWidth={8}
            fill="none"
            strokeLinecap="round"
          />
          {Array.from({ length: 15 }, (_, i) => {
            const isArrow = i % 5 === 4;
            const delay = -(i * (2.2 / 15));
            const color = selected ? selectedColor : "rgba(217,119,6,0.92)";
            return (
              <g key={i} style={{ pointerEvents: "none" }}>
                <animateMotion
                  dur="2.2s"
                  repeatCount="indefinite"
                  begin={`${delay.toFixed(3)}s`}
                  rotate="auto"
                >
                  <mpath href={`#${id}`} />
                </animateMotion>
                {isArrow ? (
                  <ArrowIcon color={color} />
                ) : (
                  <line
                    x1="-5" y1="0" x2="5" y2="0"
                    stroke={color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                )}
              </g>
            );
          })}
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
