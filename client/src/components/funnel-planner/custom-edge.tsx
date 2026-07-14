import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps, useReactFlow } from "@xyflow/react";
import { useState } from "react";
import { X } from "lucide-react";
import { useCanvasTheme } from "./canvas-theme-context";

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
  const theme = useCanvasTheme();

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

  const defaultColor = theme === "light" ? "#64748b" : "#94a3b8";
  const selectedColor = theme === "light" ? "#6366f1" : "#818cf8";

  const strokeColor =
    pathType === "yes" ? "#22c55e" : pathType === "no" ? "#ef4444" : selected ? selectedColor : defaultColor;
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

  const popupBg = theme === "light"
    ? "bg-white border-gray-200 shadow-md"
    : "bg-[hsl(230,45%,11%)] border-white/15 shadow-lg";

  const dividerCls = theme === "light" ? "bg-gray-200" : "bg-white/15";

  const btnBase = theme === "light"
    ? "bg-gray-100 text-gray-500 hover:bg-gray-200"
    : "bg-white/10 text-white/50";

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
          <path
            d={edgePath}
            stroke="rgba(74,222,128,0.22)"
            strokeWidth={10}
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={edgePath}
            stroke="rgba(74,222,128,0.95)"
            strokeWidth={5}
            fill="none"
            strokeLinecap="round"
            strokeDasharray="10 16"
            style={{ animation: "traffic-flow 1.8s linear infinite" }}
          />
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
