// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import Page from "./workspace-invite-accept";
const mocks = vi.hoisted(() => ({
  user: null as any, refetch: vi.fn(), cancel: vi.fn(), clear: vi.fn(), announce: vi.fn(), reload: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: mocks.user, refetch: mocks.refetch, isLoading: false }) }));
vi.mock("@/lib/queryClient", () => ({ queryClient: { cancelQueries: mocks.cancel, clear: mocks.clear } }));
vi.mock("@/lib/workspace-navigation", () => ({ announceWorkspaceChange: mocks.announce, reloadWorkspace: mocks.reload }));
const token = "a".repeat(64);
let info: any;
let fetchMock: any;
beforeEach(() => {
  vi.clearAllMocks(); mocks.user = null;
  mocks.refetch.mockResolvedValue(undefined); mocks.cancel.mockResolvedValue(undefined);
  history.replaceState({}, "", `/workspace/accept?token=${token}`);
  info = { ownerName: "Test Owner", inviteEmail: "member@example.invalid", accountExists: true, hasPassword: true };
  fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("/info") ? info : { ok: true } }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("workspace invitation personal login", () => {
  it("asks existing users for their existing password, not a new one", async () => {
    render(<Page />);
    await screen.findByLabelText("Your existing FIA password");
    expect(screen.queryByTestId("input-invite-password-confirm")).toBeNull();
    expect(screen.getByTestId("button-invite-reset-password").textContent).toBe("Forgot password?");
    expect(screen.getByTestId("link-invite-google").getAttribute("href")).toContain(encodeURIComponent(`/workspace/accept?token=${token}`));
    fireEvent.change(screen.getByTestId("input-invite-password"), { target: { value: "Existing-password" } });
    fireEvent.click(screen.getByTestId("button-accept-invite"));
    await waitFor(() => expect(mocks.clear).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls.find(([url]: [string]) => url.endsWith("/accept"))[1].body)).toEqual({ token, password: "Existing-password" });
    expect(mocks.refetch).toHaveBeenCalledOnce();
    expect(mocks.announce).toHaveBeenCalledOnce();
  });
  it("new users confirm their personal password before creating an account", async () => {
    info.accountExists = false; info.hasPassword = false;
    render(<Page />);
    await screen.findByLabelText("Create your personal FIA password");
    fireEvent.change(screen.getByTestId("input-invite-password"), { target: { value: "New-password" } });
    fireEvent.change(screen.getByTestId("input-invite-password-confirm"), { target: { value: "Different-password" } });
    fireEvent.click(screen.getByTestId("button-accept-invite"));
    expect(await screen.findByText(/passwords don't match/)).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([url]: [string]) => url.endsWith("/accept"))).toHaveLength(0);
    fireEvent.change(screen.getByTestId("input-invite-password-confirm"), { target: { value: "New-password" } });
    fireEvent.click(screen.getByTestId("button-accept-invite"));
    await waitFor(() => expect(mocks.clear).toHaveBeenCalledOnce());
  });
  it("password recovery preserves the invitation in the email request", async () => {
    render(<Page />);
    fireEvent.click(await screen.findByTestId("button-invite-reset-password"));
    expect(await screen.findByRole("status")).toBeTruthy();
    const request = fetchMock.mock.calls.find(([url]: [string]) => url === "/api/auth/forgot-password");
    expect(JSON.parse(request[1].body)).toEqual({ email: info.inviteEmail, workspaceInviteToken: token });
  });
  it("Google-only users get Google or password setup, not an unusable password field", async () => {
    info.hasPassword = false; render(<Page />);
    await screen.findByTestId("link-invite-google");
    expect(screen.queryByTestId("input-invite-password")).toBeNull();
    expect(screen.queryByTestId("button-accept-invite")).toBeNull();
    expect(screen.getByTestId("button-invite-reset-password").textContent).toContain("set my password");
  });
  it("signed-in matching users explicitly accept, with no automatic join", async () => {
    mocks.user = { id: "member", email: info.inviteEmail };
    render(<Page />);
    const button = await screen.findByTestId("button-accept-invite");
    expect(fetchMock.mock.calls.filter(([url]: [string]) => url.endsWith("/accept"))).toHaveLength(0);
    fireEvent.click(button);
    await waitFor(() => expect(mocks.clear).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls.find(([url]: [string]) => url.endsWith("/accept"))[1].body)).toEqual({ token });
  });
  it("an error remains visible without clearing the current workspace", async () => {
    fetchMock.mockImplementation(async (url: string) => ({ ok: !url.endsWith("/accept"),
      json: async () => url.includes("/info") ? info : { message: "Use your existing password." } }));
    render(<Page />);
    fireEvent.change(await screen.findByTestId("input-invite-password"), { target: { value: "Wrong-password" } });
    fireEvent.click(screen.getByTestId("button-accept-invite"));
    expect(await screen.findByText("Use your existing password.")).toBeTruthy();
    expect(mocks.clear).not.toHaveBeenCalled();
  });
});
