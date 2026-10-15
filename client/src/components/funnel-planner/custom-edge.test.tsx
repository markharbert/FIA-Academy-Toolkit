// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Position } from "@xyflow/react";
import { CustomEdge } from "./custom-edge";
import { normalizeFunnelEdges } from "@shared/funnel-edges";

const mocks = vi.hoisted(() => ({
  deleteElements: vi.fn(),
  setEdges: vi.fn(),
  nodes: [
    { id: "optin", type: "capturePage", position: { x: 0, y: 0 } },
    { id: "email", type: "emailNode", position: { x: 350, y: 0 } },
  ],
  edges: [{ id: "flow", source: "optin", target: "email", type: "smoothstep" }],
}));
vi.mock("@xyflow/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@xyflow/react")>();
  return {
    ...actual,
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useReactFlow: () => ({
      deleteElements: mocks.deleteElements, setEdges: mocks.setEdges,
      getNode: (id: string) => mocks.nodes.find((node) => node.id === id),
      getEdges: () => mocks.edges,
    }),
  };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AI-created connections in the normal editor", () => {
  function view() {
    const [edge] = normalizeFunnelEdges(mocks.edges);
    expect(edge.type).toBe("custom");
    return render(<CustomEdge {...({
      ...edge, data: {}, selected: true, sourceX: 0, sourceY: 0,
      targetX: 350, targetY: 0, sourcePosition: Position.Right,
      targetPosition: Position.Left,
    } as React.ComponentProps<typeof CustomEdge>)} />);
  }

  it("uses the existing animated envelopes for opt-in to email connections", () => {
    const { container } = view();
    expect(container.querySelectorAll("animateMotion").length).toBeGreaterThan(0);
    expect(container.querySelector('mpath[href="#seq-flow"]')).not.toBeNull();
  });

  it("lets the member delete the connection with the normal editor control", () => {
    view();
    fireEvent.click(screen.getByTitle("Delete connection"));
    expect(mocks.deleteElements).toHaveBeenCalledWith({ edges: [{ id: "flow" }] });
  });
});
