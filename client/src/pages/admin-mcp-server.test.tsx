// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminMcpServerPage from "./admin-mcp-server";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

const mocks = vi.hoisted(() => ({ query: vi.fn(), toast: vi.fn(), writeText: vi.fn(),
  user: { id: "fixture", firstName: "Demo", lastName: "Admin", email: "fixture@example.invalid", isAdmin: true, isCollaborator: false } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: mocks.user, logout: vi.fn() }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

const reference = {
  endpoint: "https://dev.example.invalid/mcp/projects",
  productionEndpoint: "https://live.example.invalid/mcp/projects",
  scopes: ["projects:read", "projects:write"], transport: "Streamable HTTP", auth: "OAuth with S256 PKCE",
  endpoints: [
    { method: "POST", path: "/mcp/projects", category: "MCP transport", access: "OAuth", description: "Single connection endpoint" },
    { method: "POST", path: "/api/mcp/oauth/register", category: "OAuth flow", access: "Public", description: "Dynamic registration" },
  ],
  tools: [
    { name: "list_projects", description: "Read projects", write: false, destructive: false, parameters: [] },
    { name: "update_task", description: "Edit a task", write: true, destructive: false,
      parameters: [{ name: "expected_version", required: true, description: "Copy the exact version" }] },
  ],
};
const clients: QueryClient[] = [];
function view(content: React.ReactNode = <AdminMcpServerPage />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: mocks.query } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{content}</QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.isAdmin = true;
  mocks.query.mockResolvedValue(reference);
  mocks.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.writeText } });
  window.history.replaceState({}, "", "/admin/mcp-server");
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });

describe("Admin MCP server guide", () => {
  it("provides current connection URLs, provider guides and live registries", async () => {
    view();
    expect(await screen.findByText(reference.productionEndpoint)).toBeTruthy();
    expect(screen.getByText(reference.endpoint)).toBeTruthy();
    expect(screen.getByText("Claude custom connector")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /ChatGPT/ })).toBeTruthy();
    expect(screen.getAllByText("Register automatically").length).toBeGreaterThan(0);
    expect(screen.getByText("list_projects")).toBeTruthy();
    expect(screen.getByText("/api/mcp/oauth/register")).toBeTruthy();
    expect(mocks.query.mock.calls[0][0].queryKey).toEqual(["/api/admin/mcp/reference"]);
  });
  it("copies the published endpoint rather than an OAuth URL", async () => {
    view();
    fireEvent.click(await screen.findByRole("button", { name: "Copy Published production URL" }));
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith(reference.productionEndpoint));
  });
  it("filters endpoint and tool references and shows required edit inputs", async () => {
    view();
    await screen.findByText("update_task");
    fireEvent.change(screen.getByRole("textbox", { name: "Search MCP endpoints and tools" }), { target: { value: "expected_version" } });
    expect(screen.getByText("update_task")).toBeTruthy();
    expect(screen.queryByText("list_projects")).toBeNull();
    expect(screen.getAllByText("expected_version").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByRole("textbox", { name: "Search MCP endpoints and tools" }), { target: { value: "nothing-matches" } });
    expect(screen.getByText("No tools match this search.")).toBeTruthy();
  });
  it("shows a clear error instead of pretending the reference loaded", async () => {
    mocks.query.mockRejectedValue(new Error("Request denied"));
    view();
    expect(await screen.findByText("Server reference unavailable")).toBeTruthy();
    expect(screen.queryByText(reference.productionEndpoint)).toBeNull();
  });
  it("shows the MCP server navigation item only to administrators", () => {
    view(<SidebarProvider><AppSidebar /></SidebarProvider>);
    expect(screen.getByText("MCP server")).toBeTruthy();
    cleanup();
    mocks.user.isAdmin = false;
    view(<SidebarProvider><AppSidebar /></SidebarProvider>);
    expect(screen.queryByText("MCP server")).toBeNull();
  });
});
