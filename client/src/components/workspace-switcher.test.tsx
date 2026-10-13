// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkspaceSwitcher } from "./workspace-switcher";
const mocks = vi.hoisted(() => ({
  user: { id: "member", impersonating: false }, api: vi.fn(), toast: vi.fn(), auth: vi.fn(),
  cancel: vi.fn(), clear: vi.fn(), mutating: vi.fn(), announce: vi.fn(), reload: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: mocks.user, refetch: mocks.auth }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.api, queryClient: {
  cancelQueries: mocks.cancel, clear: mocks.clear, isMutating: mocks.mutating,
} }));
vi.mock("@/lib/workspace-navigation", () => ({ announceWorkspaceChange: mocks.announce, reloadWorkspace: mocks.reload }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/ui/sidebar", () => ({ useSidebar: () => ({ state: "expanded", isMobile: false }) }));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => children,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect, disabled, "data-testid": testId }: any) =>
    <button data-testid={testId} disabled={disabled} onClick={onSelect}>{children}</button>,
  DropdownMenuLabel: ({ children }: any) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));
let data: any;
let client: QueryClient;
function view() { return render(<QueryClientProvider client={client}><WorkspaceSwitcher /></QueryClientProvider>); }
beforeEach(() => {
  vi.clearAllMocks(); mocks.user.impersonating = false;
  mocks.mutating.mockReturnValue(0); mocks.cancel.mockResolvedValue(undefined); mocks.auth.mockResolvedValue(undefined);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  data = { activeWorkspaceId: "member", workspaces: [
    { id: "member", name: "My workspace", isOwn: true }, { id: "owner", name: "Owner's workspace", isOwn: false },
  ] };
  mocks.api.mockImplementation(async (method: string) => ({ json: async () => method === "GET" ? data : { ok: true } }));
});
afterEach(() => { cleanup(); client.clear(); });
describe("workspace chooser", () => {
  it("lists both workspaces and reloads only after clearing the previous cache and refreshing identity", async () => {
    view(); fireEvent.click(await screen.findByTestId("workspace-option-owner"));
    await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce());
    expect(mocks.api).toHaveBeenCalledWith("POST", "/api/workspaces/active", { workspaceId: "owner" });
    expect(mocks.cancel).toHaveBeenCalledOnce(); expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.auth).toHaveBeenCalledOnce(); expect(mocks.announce).toHaveBeenCalledOnce();
    expect(mocks.cancel.mock.invocationCallOrder[0]).toBeLessThan(mocks.clear.mock.invocationCallOrder[0]);
    expect(mocks.clear.mock.invocationCallOrder[0]).toBeLessThan(mocks.reload.mock.invocationCallOrder[0]);
  });
  it("blocks switching while a change is being saved", async () => {
    mocks.mutating.mockReturnValue(1); view();
    fireEvent.click(await screen.findByTestId("workspace-option-owner"));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Finish saving before switching" }));
    expect(mocks.api.mock.calls.some(([method]) => method === "POST")).toBe(false);
  });
  it("keeps the current view and shows errors if the server rejects a switch", async () => {
    mocks.api.mockImplementation(async (method: string) => {
      if (method === "POST") throw new Error("Access revoked");
      return { json: async () => data };
    });
    view(); fireEvent.click(await screen.findByTestId("workspace-option-owner"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Access revoked" })));
    expect(mocks.clear).not.toHaveBeenCalled(); expect(mocks.reload).not.toHaveBeenCalled();
  });
  it("allows recovery into the remaining workspace when the selected one was revoked", async () => {
    data.activeWorkspaceId = "revoked"; data.workspaces = [data.workspaces[0]];
    view(); fireEvent.click(await screen.findByTestId("workspace-option-member"));
    await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce());
  });
  it("hides a redundant chooser for a single current workspace or impersonation", async () => {
    data.workspaces = [data.workspaces[0]]; view();
    await waitFor(() => expect(screen.queryByTestId("workspace-switcher")).toBeNull());
    cleanup(); mocks.user.impersonating = true; view();
    expect(screen.queryByTestId("workspace-switcher")).toBeNull();
  });
});
