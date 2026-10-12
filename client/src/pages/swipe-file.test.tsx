// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import sidebarSource from "@/components/app-sidebar.tsx?raw";
import SwipeFilePage from "./swipe-file";

const auth = vi.hoisted(() => ({ user: null as null | { id: string; isAdmin: boolean }, isLoading: false }));
vi.mock("@/lib/auth", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("wouter", () => ({ Redirect: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div> }));

const list = {
  items: [],
  total: 0,
  counts: { all: 0, upload: 0, snippet: 0, palette: 0, shared: 0, favorites: 0 },
};

function openPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><SwipeFilePage /></QueryClientProvider>);
  return client;
}

describe("Swipe File membership access", () => {
  beforeEach(() => {
    auth.user = { id: "member-a", isAdmin: false };
    auth.isLoading = false;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(list), {
      headers: { "Content-Type": "application/json" },
    })));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  test.each([false, true])("loads the authenticated member's collection (admin: %s)", async (isAdmin) => {
    auth.user!.isAdmin = isAdmin;
    const client = openPage();
    await waitFor(() => expect(client.getQueryData(["/api/swipe", "", "all", "swipe"])).toEqual({ pages: [list], pageParams: [0] }));
    expect(screen.getByRole("heading", { name: "Swipe File" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Item" })).toBeTruthy();
    expect(screen.queryByTestId("redirect")).toBeNull();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/swipe?"), expect.objectContaining({ credentials: "include" }));
    client.clear();
  });

  test("does not load member data for a signed-out visitor", () => {
    auth.user = null;
    const client = openPage();
    expect(screen.getByTestId("redirect").textContent).toBe("/");
    expect(fetch).not.toHaveBeenCalled();
    client.clear();
  });

  test("waits for authentication before showing member content", () => {
    auth.user = null;
    auth.isLoading = true;
    const client = openPage();
    expect(screen.queryByRole("heading", { name: "Swipe File" })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    client.clear();
  });

  test("keeps the Library Swipe File link available to non-admin members", () => {
    const swipeEntry = sidebarSource.match(/title: "Swipe File",([\s\S]*?)\n\s*\}/)?.[1];
    expect(swipeEntry).toContain('url: "/swipe-file"');
    expect(swipeEntry).not.toContain("adminOnly");
  });
});
