// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AccountPage from "./account";

const mocks = vi.hoisted(() => ({
  user: { id: "fixture-member", isCollaborator: false, impersonating: false },
  apiRequest: vi.fn(), invalidateQueries: vi.fn(), toast: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/lib/queryClient", () => ({
  apiRequest: mocks.apiRequest, queryClient: { invalidateQueries: mocks.invalidateQueries },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/extension-sessions-card", () => ({
  default: () => <div data-testid="extension-sessions-fixture">Connected browser devices</div>,
}));

let responses: Record<string, any>;
const clients: QueryClient[] = [];
function view() {
  const client = new QueryClient({ defaultOptions: { queries: {
    retry: false, queryFn: async ({ queryKey }) => responses[String(queryKey[0])],
  } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><AccountPage /></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.isCollaborator = false;
  mocks.user.impersonating = false;
  responses = {
    "/api/account": {
      id: "fixture-member", email: "member@example.invalid", displayName: "Demo Member",
      firstName: "Demo", lastName: "Member", createdAt: "2026-01-01T12:00:00Z",
      connectedProviders: ["google"], hasPassword: true, cfEnrolled: true,
      cfEnrolledAt: "2026-01-01T12:00:00Z", cfRevokedAt: null,
      gravatarHash: null, timezone: "Pacific/Honolulu",
    },
    "/api/account/activity": { items: [] },
    "/api/account/api-key": { accessEnabled: false, record: null },
    "/api/workspace/team": [],
    "/api/account/notification-preferences": {
      allEnabled: true, preferences: {
        taskDueReminders: { enabled: true }, overdueAlerts: { enabled: true },
        projectDueReminders: { enabled: true }, dailyDmoReminder: { enabled: true },
        weeklyDmoSummary: { enabled: true },
      },
    },
  };
  mocks.apiRequest.mockResolvedValue({ json: async () => ({ ok: true }) });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
});

describe("Account settings redesign", () => {
  it("preserves profile editing, protected email, Gravatar links, and device settings", async () => {
    view();
    const display = await screen.findByTestId("input-display-name");
    const email = screen.getByTestId("input-email-readonly") as HTMLInputElement;
    expect(email.disabled && email.readOnly).toBe(true);
    expect(email.value).toBe("member@example.invalid");
    expect(screen.getByTestId("extension-sessions-fixture")).toBeTruthy();
    expect(screen.getByTestId("link-gravatar").closest("a")?.href).toBe("https://gravatar.com/");
    fireEvent.click(screen.getByTestId("button-refresh-gravatar"));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Image refreshed" }));
    fireEvent.change(display, { target: { value: "Updated Member" } });
    fireEvent.click(screen.getByTestId("button-save-profile"));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("PATCH", "/api/account", {
      displayName: "Updated Member", firstName: "Demo", lastName: "Member",
    }));
    await waitFor(() => expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["/api/auth/me"] }));
  });

  it("still validates profile fields before saving", async () => {
    view();
    fireEvent.change(await screen.findByTestId("input-display-name"), { target: { value: "x".repeat(41) } });
    fireEvent.click(screen.getByTestId("button-save-profile"));
    expect(await screen.findByText("Display name must be 40 characters or less")).toBeTruthy();
    expect(mocks.apiRequest).not.toHaveBeenCalled();
  });

  it("reports a failed save without pretending it succeeded", async () => {
    mocks.apiRequest.mockRejectedValue(new Error("Unable to save fixture"));
    view();
    fireEvent.click(await screen.findByTestId("button-save-profile"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Couldn't save", variant: "destructive",
    })));
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
  });

  it("navigates settings with accessible keyboard tabs", async () => {
    view();
    const profile = await screen.findByTestId("tab-profile");
    expect(profile.getAttribute("role")).toBe("tab");
    profile.focus();
    fireEvent.keyDown(profile, { key: "ArrowDown" });
    const timezone = screen.getByTestId("tab-timezone");
    expect(timezone.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(timezone);
    expect(screen.getByTestId("select-timezone")).toBeTruthy();
  });

  it("keeps time-zone updates wired to the existing account endpoint", async () => {
    view();
    fireEvent.click(await screen.findByTestId("tab-timezone"));
    fireEvent.click(screen.getByTestId("button-use-browser-tz"));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("PATCH", "/api/account", {
      timezone: expect.any(String),
    }));
  });

  it("preserves master notification preference updates", async () => {
    view();
    fireEvent.click(await screen.findByTestId("tab-notifications"));
    fireEvent.click(screen.getByTestId("switch-all-notifications"));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("PUT", "/api/account/notification-preferences", {
      allEnabled: false, preferences: responses["/api/account/notification-preferences"].preferences,
    }));
  });

  it("preserves invitation submission for workspace owners", async () => {
    view();
    fireEvent.click(await screen.findByTestId("tab-team"));
    fireEvent.change(screen.getByTestId("input-invite-first-name"), { target: { value: "Demo" } });
    fireEvent.change(screen.getByTestId("input-invite-last-name"), { target: { value: "Teammate" } });
    fireEvent.change(screen.getByTestId("input-invite-email"), { target: { value: "teammate@example.invalid" } });
    fireEvent.click(screen.getByTestId("button-send-invite"));
    await waitFor(() => expect(mocks.apiRequest).toHaveBeenCalledWith("POST", "/api/workspace/invite", {
      email: "teammate@example.invalid", firstName: "Demo", lastName: "Teammate",
    }));
  });

  it("keeps collaborator, impersonation, and API-access visibility restrictions", async () => {
    mocks.user.isCollaborator = true;
    mocks.user.impersonating = true;
    view();
    await screen.findByTestId("input-display-name");
    expect(screen.queryByTestId("tab-team")).toBeNull();
    expect(screen.queryByTestId("tab-api")).toBeNull();
    expect(screen.queryByTestId("extension-sessions-fixture")).toBeNull();
  });
});
