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
  endpoint: "https://dev.example.invalid/mcp/agent",
  productionEndpoint: "https://live.example.invalid/mcp/agent",
  scopes: ["projects:read", "projects:write"], transport: "Streamable HTTP", auth: "OAuth with S256 PKCE",
  endpoints: [
    { method: "POST", path: "/mcp/agent", category: "MCP transport", access: "OAuth", description: "Single connection endpoint" },
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
function expandSection(label: string) {
  const summary = screen.getByText(label);
  const section = summary.closest("details");
  if (!section) throw new Error(`Missing expandable section: ${label}`);
  if (!section.open) fireEvent.click(summary);
  return section;
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
  it("provides the connection name and published URL without showing the development URL", async () => {
    view();
    expect(await screen.findByText(reference.productionEndpoint)).toBeTruthy();
    expect(screen.queryByText(reference.endpoint)).toBeNull();
    expect(screen.getAllByText("FIA Toolkit").length).toBeGreaterThan(0);
    expect(screen.queryByText("Current environment URL")).toBeNull();
    const claude = screen.getByText("Claude setup instructions").closest("details");
    const chatgpt = screen.getByText("ChatGPT setup instructions").closest("details");
    const registry = screen.getByText("Live endpoint and tool registry").closest("details");
    expect(claude?.open).toBe(false);
    expect(chatgpt?.open).toBe(false);
    expect(registry?.open).toBe(false);
    expandSection("Claude setup instructions");
    expect(screen.getByText("Claude custom connector")).toBeTruthy();
    expect(claude?.open).toBe(true);
    expect(chatgpt?.open).toBe(false);
    expandSection("ChatGPT setup instructions");
    expect(screen.getByRole("heading", { name: /ChatGPT/ })).toBeTruthy();
    expect(claude?.open).toBe(true);
    expect(chatgpt?.open).toBe(true);
    expect(screen.getAllByText("Register automatically").length).toBeGreaterThan(0);
    expandSection("Live endpoint and tool registry");
    expect(screen.getByText("list_projects")).toBeTruthy();
    expect(screen.getByText("/api/mcp/oauth/register")).toBeTruthy();
    expect(mocks.query.mock.calls[0][0].queryKey).toEqual(["/api/admin/mcp/reference"]);
  });
  it("keeps advanced guidance collapsed initially and allows sections to toggle", async () => {
    view();
    await screen.findByText(reference.productionEndpoint);
    expect(Array.from(document.querySelectorAll("summary")).slice(0, 2)
      .map((summary) => summary.textContent?.replace("＋", "").trim()))
      .toEqual(["Claude setup instructions", "ChatGPT setup instructions"]);
    const details = screen.getByText("Permissions, safety, and member approvals").closest("details");
    expect(details?.open).toBe(false);
    expect(screen.getByText("Claude setup instructions").closest("details")?.open).toBe(false);
    expect(screen.getByText("ChatGPT setup instructions").closest("details")?.open).toBe(false);
    expect(screen.getByText("Compatibility testing, other clients, and troubleshooting").closest("details")?.open).toBe(false);
    const summary = screen.getByText("Permissions, safety, and member approvals");
    fireEvent.click(summary);
    expect(details?.open).toBe(true);
    expect(screen.getByText(/Confirm there—no website visit is required/)).toBeTruthy();
    expect(screen.queryByText(/require a separate website member approval/)).toBeNull();
    fireEvent.click(summary);
    expect(details?.open).toBe(false);
  });
  it("copies the published endpoint rather than an OAuth URL", async () => {
    view();
    fireEvent.click(await screen.findByRole("button", { name: "Copy Published production URL" }));
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith(reference.productionEndpoint));
  });
  it("copies FIA Toolkit as the connection name", async () => {
    view();
    fireEvent.click(await screen.findByRole("button", { name: "Copy Connection name" }));
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith("FIA Toolkit"));
  });
  it("filters endpoint and tool references and shows required edit inputs", async () => {
    view();
    await screen.findByText(reference.productionEndpoint);
    expandSection("Live endpoint and tool registry");
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
