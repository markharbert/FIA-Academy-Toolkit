import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps, useReactFlow } from "@xyflow/react";
import { useState } from "react";
import { X } from "lucide-react";

export function CustomEdge({
  id,
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
  markerEnd,
}: EdgeProps) {
  const { deleteElements, setEdges, getNode } = useReactFlow();
  const [hovered, setHovered] = useState(false);

  const edgeData = data as { pathType?: "yes" | "no" } | undefined;
  const pathType = edgeData?.pathType;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const strokeColor =
    pathType === "yes" ? "#22c55e" : pathType === "no" ? "#ef4444" : selected ? "#818cf8" : "#94a3b8";
  const strokeWidth = selected ? 2.5 : 2;

  const visible = selected || hovered;

  const sourceNode = getNode(source);
  const isTrafficEdge = sourceNode?.type === "trafficSource";

  function setPathType(next: "yes" | "no" | undefined) {
    setEdges((eds) =>
      eds.map((e) =>
        e.id === id ? { ...e, data: { ...e.data, pathType: next } } : e
      )
    );
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ stroke: strokeColor, strokeWidth }}
      />

      {/* Animated traffic flow — only on edges coming from a traffic source node */}
      {isTrafficEdge && (
        <>
          {/* Soft glow base */}
          <path
            d={edgePath}
            stroke="rgba(74,222,128,0.22)"
            strokeWidth={10}
            fill="none"
            strokeLinecap="round"
          />
          {/* Flowing dashes — stream 1 */}
          <path
            d={edgePath}
            stroke="rgba(74,222,128,0.95)"
            strokeWidth={5}
            fill="none"
            strokeLinecap="round"
            strokeDasharray="10 16"
            style={{ animation: "traffic-flow 1.8s linear infinite" }}
          />
          {/* Flowing dashes — stream 2 (offset by half a cycle for density) */}
          <path
            d={edgePath}
            stroke="rgba(134,239,172,0.55)"
            strokeWidth={5}
            fill="none"
            strokeLinecap="round"
            strokeDasharray="10 16"
            style={{ animation: "traffic-flow 1.8s linear infinite", animationDelay: "-0.9s" }}
          />
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
              className="flex items-center gap-1 px-1.5 py-1 rounded-lg bg-[hsl(230,45%,11%)] border border-white/15 shadow-lg"
              style={{ transition: "opacity 150ms" }}
            >
              {/* Yes toggle */}
              <button
                onClick={(e) => { e.stopPropagation(); setPathType(pathType === "yes" ? undefined : "yes"); }}
                title="Mark as Yes path"
                data-testid={`button-edge-yes-${id}`}
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                  pathType === "yes"
                    ? "bg-green-600 text-white"
                    : "bg-white/10 text-white/50 hover:bg-green-600/50 hover:text-white"
                }`}
              >
                Yes
              </button>

              {/* No toggle */}
              <button
                onClick={(e) => { e.stopPropagation(); setPathType(pathType === "no" ? undefined : "no"); }}
                title="Mark as No path"
                data-testid={`button-edge-no-${id}`}
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors cursor-pointer ${
                  pathType === "no"
                    ? "bg-red-600 text-white"
                    : "bg-white/10 text-white/50 hover:bg-red-600/50 hover:text-white"
                }`}
              >
                No
              </button>

              {/* Divider */}
              <div className="w-px h-3 bg-white/15 mx-0.5" />

              {/* Delete */}
              <button
                onClick={(e) => { e.stopPropagation(); deleteElements({ edges: [{ id }] }); }}
                title="Delete connection"
                data-testid={`button-delete-edge-${id}`}
                className="flex items-center justify-center w-4 h-4 rounded text-white/40 hover:bg-red-500/80 hover:text-white transition-colors cursor-pointer"
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
