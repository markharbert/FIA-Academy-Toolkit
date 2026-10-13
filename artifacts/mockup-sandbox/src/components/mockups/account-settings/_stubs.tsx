import { useEffect, useState, type LabelHTMLAttributes } from "react";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type MockNotificationPreferences = Record<string, { enabled: boolean }>;

const accountFixture = {
  id: "preview-member-104",
  email: "mara.ellison@example.test",
  displayName: "Mara Ellison",
  firstName: "Mara",
  lastName: "Ellison",
  emailVerifiedAt: "2024-02-12T16:10:00.000Z",
  emailConsentAt: "2024-02-12T16:10:00.000Z",
  createdAt: "2024-02-12T16:10:00.000Z",
  connectedProviders: ["google"],
  hasPassword: true,
  cfEnrolled: true,
  cfEnrolledAt: "2024-02-12T16:10:00.000Z",
  cfRevokedAt: null,
  lastLoginAt: "2025-05-28T16:42:00.000Z",
  gravatarHash: null,
  timezone: "America/Los_Angeles",
};

const activityFixture = {
  items: [
    { id: "preview-activity-1", actionType: "login_success", actionLabel: "Signed in to Academy Toolkit", createdAt: "2025-05-28T16:42:00.000Z", ip: "192.0.2.18", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36" },
    { id: "preview-activity-2", actionType: "account_updated", actionLabel: "Updated your profile", createdAt: "2025-05-27T18:10:00.000Z", ip: null, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36" },
    { id: "preview-activity-3", actionType: "session_created", actionLabel: "Created a new planning session", createdAt: "2025-05-25T14:20:00.000Z", ip: "192.0.2.18", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36" },
  ],
};

const notificationKeys = [
  "taskDueReminders", "overdueAlerts", "projectDueReminders", "weeklyProjectDigest",
  "dmoStreakAtRisk", "dmoMilestone", "weeklyDmoSummary", "reputationDropAlert",
  "weeklyInboxReport", "inboxReportReady", "featureRequestReceived", "bugReportReceived",
  "featureRequestComment", "bugReportComment", "feedbackStatusChanged",
];

const notificationsFixture = {
  allEnabled: true,
  preferences: Object.fromEntries(notificationKeys.map((key, index) => [key, { enabled: index % 3 !== 1 }])),
};

const apiKeyFixture = {
  accessEnabled: true,
  record: { id: "preview-api-key-1", keyPrefix: "fia_live_pv_", label: "Preview key", createdAt: "2025-05-09T15:00:00.000Z", lastUsedAt: "2025-05-28T14:30:00.000Z" },
};

const teamFixture = [{
  id: "preview-invite-1",
  inviteEmail: "casey.rowan@example.test",
  status: "accepted",
  createdAt: "2025-05-10T12:00:00.000Z",
  acceptedAt: "2025-05-11T08:30:00.000Z",
  memberId: "preview-collaborator-1",
  memberDisplayName: "Casey Rowan",
  memberEmail: "casey.rowan@example.test",
}];

function fixtureFor(key: unknown) {
  const path = Array.isArray(key) ? key[0] : "";
  if (path === "/api/account") return accountFixture;
  if (path === "/api/account/activity") return activityFixture;
  if (path === "/api/account/notification-preferences") return notificationsFixture;
  if (path === "/api/account/api-key") return apiKeyFixture;
  if (path === "/api/workspace/team") return teamFixture;
  return null;
}

export const queryClient = {
  invalidateQueries: async (_options?: unknown) => undefined,
};

export function useQuery<T>(options: { queryKey: unknown[]; enabled?: boolean }) {
  const serializedKey = JSON.stringify(options.queryKey);
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(Boolean(options.enabled));
  useEffect(() => {
    if (!options.enabled) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const timer = window.setTimeout(() => {
      setData(fixtureFor(JSON.parse(serializedKey)) as T);
      setIsLoading(false);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [serializedKey, options.enabled]);
  return { data, isLoading };
}

interface MutationCallbacks<TData> {
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
}

export function useMutation<TData, TVariables = void>(options: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
}) {
  const [isPending, setIsPending] = useState(false);
  function mutate(variables: TVariables, callbacks?: MutationCallbacks<TData>) {
    setIsPending(true);
    Promise.resolve(options.mutationFn(variables)).then((data) => {
      setIsPending(false);
      options.onSuccess?.(data);
      callbacks?.onSuccess?.(data);
    }).catch((error: Error) => {
      setIsPending(false);
      options.onError?.(error);
      callbacks?.onError?.(error);
    });
  }
  return { isPending, mutate };
}

export function useAuth() {
  return {
    user: {
      id: accountFixture.id,
      email: accountFixture.email,
      displayName: accountFixture.displayName,
      firstName: accountFixture.firstName,
      cfEnrolled: true,
      cfEnrolledAt: accountFixture.cfEnrolledAt,
      cfRevokedAt: null,
      isCollaborator: false,
      impersonating: null,
    },
  };
}

export function useToast() {
  return { toast: (_message: { title?: string; description?: string; variant?: string }) => undefined };
}

export function PreviewFormLabel(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...props} className={`text-sm font-medium leading-none ${props.className ?? ""}`} />;
}

export async function apiRequest(_method: string, path: string, _payload?: unknown) {
  if (path === "/api/account/api-key") {
    return { json: async () => ({ rawKey: "fia_live_preview_key_only_for_mock", record: apiKeyFixture.record }) };
  }
  return { json: async () => ({ ok: true }) };
}

export function getCommonTimezones() {
  return [
    { value: "America/Los_Angeles", label: "(UTC−08:00) Pacific Time" },
    { value: "America/Denver", label: "(UTC−07:00) Mountain Time" },
    { value: "America/Chicago", label: "(UTC−06:00) Central Time" },
    { value: "America/New_York", label: "(UTC−05:00) Eastern Time" },
    { value: "Europe/London", label: "(UTC+00:00) London" },
  ];
}

export type NotificationPreferences = MockNotificationPreferences;

export function ExtensionSessionsCard() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-muted/25">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <CardTitle>Browser extension sessions</CardTitle>
            <CardDescription className="mt-1">Devices currently signed in through your Academy Toolkit extension.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-6 py-5">
        <div className="flex items-center gap-3 rounded-xl border border-border/70 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">Chrome</div>
          <div>
            <p className="text-sm font-semibold">Chrome on Mara’s MacBook</p>
            <p className="mt-1 text-xs text-muted-foreground">Connected May 21, 2025 · Last used today at 9:42 AM</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
