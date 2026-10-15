// MCP and the browser must use the same renderer for editable connections.
export function editableFunnelEdge<T extends { type?: string; data?: unknown }>(edge: T) {
  return { ...edge, type: "custom", data: edge.data ?? {} };
}

// Older MCP maps used React Flow's plain smoothstep renderer. Upgrade those
// when loading, without losing labels, handles, IDs, or branch metadata.
export function normalizeFunnelEdges<T extends { type?: string; data?: unknown }>(edges: T[]) {
  return edges.map((edge) =>
    edge.type === "smoothstep" ? editableFunnelEdge(edge) : edge
  );
}
