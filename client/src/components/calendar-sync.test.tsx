// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CalendarSync } from "./calendar-sync";

const mocks = vi.hoisted(() => ({
  user: { id: "actor", workspaceOwnerId: null as string | null },
  api: vi.fn(), toast: vi.fn(), copy: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/lib/queryClient", () => ({ apiRequest: mocks.api }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

let client: QueryClient;
let urls: Record<string, string>;
function view() { return <QueryClientProvider client={client}><CalendarSync /></QueryClientProvider>; }
function input() { return screen.getByTestId("input-ical-url") as HTMLInputElement; }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.workspaceOwnerId = null;
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  urls = { actor: "https://example.invalid/actor.ics", a: "https://example.invalid/a.ics", b: "https://example.invalid/b.ics" };
  mocks.api.mockImplementation(async (method: string, path: string, body?: { workspaceId: string }) => {
    const id = body?.workspaceId || new URL(path, "https://example.invalid").searchParams.get("workspaceId")!;
    if (method === "DELETE") return { json: async () => ({ ok: true }) };
    if (method === "POST") urls[id] = `https://example.invalid/new-${id}.ics`;
    return { json: async () => ({ url: urls[id], workspaceId: id, scope: id === "actor" ? "personal" : "projects" }) };
  });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.copy } });
  mocks.copy.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); client.clear(); });

describe("workspace calendar subscription controls", () => {
  it("uses separate queries and never copies a previous workspace's link after switching", async () => {
    const result = render(view());
    await waitFor(() => expect(input().value).toBe(urls.actor));
    mocks.user.workspaceOwnerId = "a"; result.rerender(view());
    expect(input().value).not.toBe(urls.actor);
    await waitFor(() => expect(input().value).toBe(urls.a));
    expect(screen.getByText(/selected shared workspace/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-copy-ical-url"));
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith(urls.a));
    mocks.user.workspaceOwnerId = "b"; result.rerender(view());
    expect(input().value).not.toBe(urls.a);
    await waitFor(() => expect(input().value).toBe(urls.b));
    expect(mocks.api).toHaveBeenCalledWith("GET", "/api/calendar/ical-url?workspaceId=b");
    mocks.user.workspaceOwnerId = null; result.rerender(view());
    await waitFor(() => expect(input().value).toBe(urls.actor));
  });
  it("requires confirmation to rotate, sends the workspace, and replaces only that cached link", async () => {
    mocks.user.workspaceOwnerId = "a"; render(view());
    await waitFor(() => expect(input().value).toBe(urls.a));
    fireEvent.click(screen.getByTestId("button-rotate-ical-url"));
    expect(screen.getByText("Replace this subscription link?")).toBeTruthy();
    expect(mocks.api.mock.calls.some(call => call[0] === "POST")).toBe(false);
    fireEvent.click(screen.getByTestId("button-confirm-calendar-change"));
    await waitFor(() => expect(input().value).toBe("https://example.invalid/new-a.ics"));
    expect(mocks.api).toHaveBeenCalledWith("POST", "/api/calendar/rotate-ical-token", { workspaceId: "a" });
  });
  it("revokes without immediately recreating the feed and lets the member generate a new link", async () => {
    mocks.user.workspaceOwnerId = "b"; render(view());
    await waitFor(() => expect(input().value).toBe(urls.b));
    fireEvent.click(screen.getByTestId("button-revoke-ical-url"));
    fireEvent.click(screen.getByTestId("button-confirm-calendar-change"));
    await waitFor(() => expect(input().value).toBe("Link revoked"));
    expect(mocks.api).toHaveBeenCalledWith("DELETE", "/api/calendar/ical-url", { workspaceId: "b" });
    expect((screen.getByTestId("button-copy-ical-url") as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.api.mock.calls.filter(call => call[0] === "GET")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("button-rotate-ical-url"));
    await waitFor(() => expect(input().value).toBe("https://example.invalid/new-b.ics"));
  });
  it("closes an old confirmation on workspace switch rather than acting on the new workspace", async () => {
    mocks.user.workspaceOwnerId = "a"; const result = render(view());
    await waitFor(() => expect(input().value).toBe(urls.a));
    fireEvent.click(screen.getByTestId("button-revoke-ical-url"));
    expect(screen.getByTestId("button-confirm-calendar-change")).toBeTruthy();
    mocks.user.workspaceOwnerId = "b"; result.rerender(view());
    expect(screen.queryByTestId("button-confirm-calendar-change")).toBeNull();
    await waitFor(() => expect(input().value).toBe(urls.b));
    expect(mocks.api.mock.calls.every(call => call[0] === "GET")).toBe(true);
  });
  it("shows failed requests and disables copy without a valid URL", async () => {
    mocks.api.mockRejectedValue(new Error("Access revoked"));
    render(view());
    await waitFor(() => expect(input().value).toBe("Unable to load subscription"));
    expect((screen.getByTestId("button-copy-ical-url") as HTMLButtonElement).disabled).toBe(true);
  });
});
