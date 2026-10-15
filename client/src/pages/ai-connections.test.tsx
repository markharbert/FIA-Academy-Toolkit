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
const ownWorkspace = { id: "workspace-own", name: "Maya’s Workspace", kind: "own" as const, accessAvailable: true };
const sharedWorkspace = { id: "workspace-shared", name: "Studio Workspace", kind: "shared" as const, accessAvailable: true };
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
      scopes: ["projects:read", "projects:write"], csrfToken: "fixture-only-nonce", expiresAt: "2099-10-12T17:00:00Z",
      workspace: ownWorkspace },
  };
  mocks.apiRequest.mockResolvedValue({ json: async () => ({ ok: true, status: "approved", redirectTo: "" }) });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe("Projects AI connections", () => {
  it("requires separate opt-in for Scripts and Link Vault, with matching reading before changes", async () => {
    responses[`/api/mcp/consent/${requestId}`] = {
      ...(responses[`/api/mcp/consent/${requestId}`] as object),
      scopes: ["scripts:read", "scripts:write", "links:read", "links:write"],
    };
    view(<McpAuthorizePage />);
    const scriptRead = await screen.findByRole("checkbox", { name: "Allow Scripts reading" });
    const scriptWrite = screen.getByRole("checkbox", { name: "Allow Scripts changes" });
    const linkRead = screen.getByRole("checkbox", { name: "Allow Link Vault reading" });
    const linkWrite = screen.getByRole("checkbox", { name: "Allow Link Vault changes" });
    for (const reading of [scriptRead, linkRead]) expect(reading.getAttribute("aria-checked")).toBe("false");
    for (const writing of [scriptWrite, linkWrite]) expect(writing.hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Approve selected access" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(scriptRead);
    fireEvent.click(scriptWrite);
    fireEvent.click(linkRead);
    fireEvent.click(screen.getByRole("button", { name: "Approve selected access" }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("POST", `/api/mcp/consent/${requestId}`, {
      csrfToken: "fixture-only-nonce", decision: "approve", scopes: ["scripts:read", "scripts:write", "links:read"],
    }));
  });

  it("clears Scripts editing consent when its reading permission is unchecked", async () => {
    responses[`/api/mcp/consent/${requestId}`] = {
      ...(responses[`/api/mcp/consent/${requestId}`] as object), scopes: ["scripts:read", "scripts:write", "links:read"],
    };
    view(<McpAuthorizePage />);
    const read = await screen.findByRole("checkbox", { name: "Allow Scripts reading" });
    const write = screen.getByRole("checkbox", { name: "Allow Scripts changes" });
    fireEvent.click(read); fireEvent.click(write); fireEvent.click(read);
    expect(write.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("checkbox", { name: "Allow Link Vault reading" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve selected access" }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("POST", `/api/mcp/consent/${requestId}`, {
      csrfToken: "fixture-only-nonce", decision: "approve", scopes: ["links:read"],
    }));
  });

  it("requires explicit Funnel Grid consent and separately approved changes", async () => {
    responses[`/api/mcp/consent/${requestId}`] = {
      ...(responses[`/api/mcp/consent/${requestId}`] as object),
      scopes: ["projects:read", "projects:write", "funnels:read", "funnels:write"],
    };
    view(<McpAuthorizePage />);
    const reading = await screen.findByRole("checkbox", { name: "Allow Funnel Grid reading" });
    const writing = screen.getByRole("checkbox", { name: "Allow Funnel Grid changes" });
    expect(reading.getAttribute("aria-checked")).toBe("false");
    expect(writing.hasAttribute("disabled")).toBe(true);
    fireEvent.click(reading);
    fireEvent.click(writing);
    fireEvent.click(screen.getByRole("button", { name: "Approve selected access" }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("POST", `/api/mcp/consent/${requestId}`, {
      csrfToken: "fixture-only-nonce", decision: "approve", scopes: ["projects:read", "funnels:read", "funnels:write"],
    }));
  });

  it("supports a Funnel Grid-only authorization without Projects permission", async () => {
    responses[`/api/mcp/consent/${requestId}`] = {
      ...(responses[`/api/mcp/consent/${requestId}`] as object), scopes: ["funnels:read", "funnels:write"],
    };
    view(<McpAuthorizePage />);
    const reading = await screen.findByRole("checkbox", { name: "Allow Funnel Grid reading" });
    expect(screen.getByRole("button", { name: "Approve selected access" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(reading);
    fireEvent.click(screen.getByRole("button", { name: "Approve selected access" }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("POST", `/api/mcp/consent/${requestId}`, {
      csrfToken: "fixture-only-nonce", decision: "approve", scopes: ["funnels:read"],
    }));
  });

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
      scopes: ["projects:read"], createdAt: "2026-10-12T17:00:00Z", lastUsedAt: null, revokedAt: null,
      workspace: ownWorkspace }], approvals: [] };
    view(<AiConnectionsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove access" }));
    expect(mocks.apiRequest).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Maya’s Workspace")).toBeTruthy();
    expect(dialog.textContent).toContain("Own workspace");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove access" }));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("DELETE", `/api/mcp/connections/${connectionId}`));
  });
  it("lists the same assistant separately for its own and shared workspace grants", async () => {
    responses["/api/mcp/connections"] = { connections: [
      { id: connectionId, clientName: "Test assistant", scopes: ["projects:read"], createdAt: "2026-10-12T17:00:00Z",
        lastUsedAt: null, revokedAt: null, workspace: ownWorkspace },
      { id: approvalId, clientName: "Test assistant", scopes: ["projects:write"], createdAt: "2026-10-13T17:00:00Z",
        lastUsedAt: null, revokedAt: null, workspace: sharedWorkspace },
    ], approvals: [] };
    view(<AiConnectionsPage />);

    expect(await screen.findAllByRole("heading", { name: "Test assistant" })).toHaveLength(2);
    expect(screen.getByText("Maya’s Workspace")).toBeTruthy();
    expect(screen.getByText("Studio Workspace")).toBeTruthy();
    expect(screen.getByText("Own workspace")).toBeTruthy();
    expect(screen.getByText("Shared workspace")).toBeTruthy();
    expect(screen.getByText("2 active")).toBeTruthy();
    expect(screen.getByText(/Switching workspaces on this website does not change an existing AI connection/)).toBeTruthy();
  });
  it("redacts an unavailable shared workspace name and excludes its grant from active count", async () => {
    responses["/api/mcp/connections"] = { connections: [{
      id: connectionId, clientName: "Test assistant", scopes: ["projects:read"], createdAt: "2026-10-12T17:00:00Z",
      lastUsedAt: null, revokedAt: null,
      workspace: { id: "workspace-shared", name: "Private client workspace name", kind: "shared", accessAvailable: false },
    }], approvals: [] };
    view(<AiConnectionsPage />);

    expect(await screen.findByText("Workspace unavailable")).toBeTruthy();
    expect(screen.queryByText("Private client workspace name")).toBeNull();
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText("Shared workspace")).toBeTruthy();
    expect(screen.getByText("0 active")).toBeTruthy();
    expect(screen.getByText("Access to this workspace is no longer available.")).toBeTruthy();
  });
  it("shows consent for its pinned workspace and explains how to authorize another", async () => {
    view(<McpAuthorizePage />);

    expect(await screen.findByText("Maya’s Workspace")).toBeTruthy();
    expect(screen.getByText("Own workspace")).toBeTruthy();
    expect(screen.getByText(/Switching workspaces on this website does not change an existing agent connection/)).toBeTruthy();
    expect(screen.getByText(/To connect another workspace, start a new authorization from your AI assistant/)).toBeTruthy();
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
