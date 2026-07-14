import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
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
    pathType === "yes" ? "#22c55e" : pathType === "no" ? "#ef4444" : "#94a3b8";
  const labelBg =
    pathType === "yes" ? "#15803d" : pathType === "no" ? "#b91c1c" : "#334155";
  const labelText = pathType === "yes" ? "Yes" : pathType === "no" ? "No" : null;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ stroke: strokeColor, strokeWidth: 2 }}
      />
      {labelText && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan"
          >
            <span
              className="text-[11px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: labelBg, color: "#fff" }}
            >
              {labelText}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = {
  custom: CustomEdge,
};
