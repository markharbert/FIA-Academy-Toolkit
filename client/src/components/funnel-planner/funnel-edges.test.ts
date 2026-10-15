import { describe, expect, it } from "vitest";
import { editableFunnelEdge, normalizeFunnelEdges } from "@shared/funnel-edges";

describe("editable Funnel Grid connections", () => {
  it("creates connections using the editor's animated, deletable renderer", () => {
    expect(editableFunnelEdge({ id: "new", source: "optin", target: "email" }))
      .toEqual({ id: "new", source: "optin", target: "email", type: "custom", data: {} });
  });

  it("upgrades existing AI connections without dropping their properties or mutating the map", () => {
    const legacy = { id: "old", source: "optin", target: "email", type: "smoothstep",
      sourceHandle: "bottom", targetHandle: "top", label: "Registered", data: { pathType: "yes" } };
    const [upgraded] = normalizeFunnelEdges([legacy]);
    expect(upgraded).toEqual({ ...legacy, type: "custom" });
    expect(legacy.type).toBe("smoothstep");
    expect(normalizeFunnelEdges([upgraded])).toEqual([upgraded]);
  });

  it("keeps existing editor connections unchanged", () => {
    const custom = { id: "native", type: "custom", data: { pathType: "no" } };
    expect(normalizeFunnelEdges([custom])[0]).toBe(custom);
    expect(normalizeFunnelEdges([])).toEqual([]);
  });
});
