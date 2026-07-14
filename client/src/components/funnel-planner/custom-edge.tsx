import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps, useReactFlow } from "@xyflow/react";
import { useState } from "react";
import { X } from "lucide-react";

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
}: EdgeProps) {
  const { deleteElements } = useReactFlow();
  const [hovered, setHovered] = useState(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const visible = selected || hovered;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? "#818cf8" : "#94a3b8",
          strokeWidth: selected ? 2.5 : 2,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          className="nodrag nopan"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteElements({ edges: [{ id }] });
            }}
            title="Delete connection"
            data-testid={`button-delete-edge-${id}`}
            className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 border border-white/20 text-white/50 cursor-pointer hover:bg-red-500/90 hover:border-red-400/60 hover:text-white"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "scale(1)" : "scale(0.7)",
              transition: "opacity 150ms, transform 150ms",
              pointerEvents: visible ? "all" : "none",
            }}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const edgeTypes = {
  custom: CustomEdge,
};
