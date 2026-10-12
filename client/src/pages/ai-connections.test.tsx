// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AiConnectionsPage, { McpAuthorizePage } from "./ai-connections";

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn(), invalidateQueries: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.apiRequest, queryClient: { invalidateQueries: mocks.invalidateQueries } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
const requestId = "10000000-0000-4000-8000-000000000001";
const connectionId = "10000000-0000-4000-8000-000000000002";
const approvalId = "10000000-0000-4000-8000-000000000003";
let responses: Record<string, unknown>;
const clients: QueryClient[] = [];

function view(component: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: {
    retry: false, queryFn: async ({ queryKey }) => responses[String(queryKey[0])],
  } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", `/mcp/authorize?request=${requestId}`);
  responses = {
    "/api/mcp/config": { endpoint: "https://site.example.invalid/mcp/agent", productionEndpoint: "https://live.example.invalid/mcp/agent",
      ready: true, scopes: ["projects:read", "projects:write"], capabilities: ["Manage projects and tasks"] },
    "/api/mcp/connections": { connections: [], approvals: [] },
    [`/api/mcp/consent/${requestId}`]: { requestId, clientName: "Test assistant", redirectUri: "https://ai.example.invalid/callback",
      scopes: ["projects:read", "projects:write"], csrfToken: "fixture-only-nonce", expiresAt: "2099-10-12T17:00:00Z" },
  };
  mocks.apiRequest.mockResolvedValue({ json: async () => ({ ok: true, status: "approved", redirectTo: "" }) });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe("Projects AI connections", () => {
  it("shows both endpoint choices and an understandable empty state", async () => {
    view(<AiConnectionsPage />);
    expect(await screen.findByText("https://live.example.invalid/mcp/agent")).toBeTruthy();
    expect(screen.getByText("FIA Toolkit")).toBeTruthy();
    expect(screen.queryByText("https://site.example.invalid/mcp/agent")).toBeNull();
    expect(screen.getByText("No assistants connected")).toBeTruthy();
    expect(screen.getByText("Deletions require your approval")).toBeTruthy();
    expect(screen.getByText(/Confirm deletions directly in your AI conversation/)).toBeTruthy();
  });
  it("defaults consent to read-only and submits write access only when selected", async () => {
    view(<McpAuthorizePage />);
    const button = await screen.findByRole("button", { name: /Approve selected access/ });
    const checkbox = screen.getByRole("checkbox", { name: "Include write access" });
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(button);
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("POST", `/api/mcp/consent/${requestId}`, {
      csrfToken: "fixture-only-nonce", decision: "approve", scopes: ["projects:read"],
    }));
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(checkbox);
    fireEvent.click(button);
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenLastCalledWith("POST", `/api/mcp/consent/${requestId}`, {
      csrfToken: "fixture-only-nonce", decision: "approve", scopes: ["projects:read", "projects:write"],
    }));
  });
  it("requires confirmation before disconnecting an assistant", async () => {
    responses["/api/mcp/connections"] = { connections: [{ id: connectionId, clientName: "Test assistant",
      scopes: ["projects:read"], createdAt: "2026-10-12T17:00:00Z", lastUsedAt: null, revokedAt: null }], approvals: [] };
    view(<AiConnectionsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove access" }));
    expect(mocks.apiRequest).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove access" }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("DELETE", `/api/mcp/connections/${connectionId}`));
  });
  it("shows request status without website approval or denial controls", async () => {
    responses["/api/mcp/connections"] = { connections: [], approvals: [{ id: approvalId, connectionId,
      clientName: "Test assistant", toolName: "delete_project", summary: "Delete the Launch project and its tasks.",
      status: "pending", createdAt: "2026-10-12T17:00:00Z", expiresAt: "2099-10-12T17:00:00Z" }] };
    view(<AiConnectionsPage />);
    expect(await screen.findByText("Delete the Launch project and its tasks.")).toBeTruthy();
    expect(screen.getByText("Return to Test assistant to confirm or cancel this request.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Deny" })).toBeNull();
    expect(mocks.apiRequest).not.toHaveBeenCalled();
  });
});
