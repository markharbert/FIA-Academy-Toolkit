import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  User,
  RefreshCw,
  ExternalLink,
  Crown,
  Activity,
  LogIn,
  LogOut,
  Upload,
  FileText,
  FolderPlus,
  Folder,
  Pencil,
  Key,
  Copy,
  Eye,
  EyeOff,
  Smartphone,
  Trash2,
  CheckCircle2,
  XCircle,
  Settings as SettingsIcon,
  Globe2,
  Bell,
  BellOff,
  Users,
  UserPlus,
  Mail,
  Clock,
  Ban,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { getCommonTimezones } from "@shared/datetime";
import { useMemo } from "react";
import type { NotificationPreferences } from "@shared/schema";

interface AccountData {
  id: string;
  email: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  emailVerifiedAt: string | null;
  emailConsentAt: string | null;
  createdAt: string;
  connectedProviders: string[];
  hasPassword: boolean;
  cfEnrolled: boolean;
  cfEnrolledAt: string | null;
  cfRevokedAt: string | null;
  lastLoginAt: string | null;
  gravatarHash: string | null;
  timezone?: string | null;
}

interface ActivityItem {
  id: string;
  actionType: string;
  actionLabel: string;
  createdAt: string;
  ip: string | null;
  userAgent: string | null;
}

const profileFormSchema = z.object({
  displayName: z.string().max(40, "Display name must be 40 characters or less").optional(),
  firstName: z.string().max(40, "First name must be 40 characters or less").optional(),
  lastName: z.string().max(40, "Last name must be 40 characters or less").optional(),
});

type ProfileFormInput = z.infer<typeof profileFormSchema>;

function getGravatarUrl(hash: string | null, size = 200): string {
  if (!hash) return `https://www.gravatar.com/avatar/?s=${size}&d=identicon`;
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });
}

function formatRelative(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function shortDevice(userAgent: string | null): string {
  if (!userAgent) return "";
  const ua = userAgent.toLowerCase();
  let browser = "Browser";
  if (ua.includes("edg/")) browser = "Edge";
  else if (ua.includes("chrome/")) browser = "Chrome";
  else if (ua.includes("firefox/")) browser = "Firefox";
  else if (ua.includes("safari/")) browser = "Safari";
  let os = "";
  if (ua.includes("windows")) os = "Windows";
  else if (ua.includes("mac os") || ua.includes("macintosh")) os = "macOS";
  else if (ua.includes("iphone") || ua.includes("ipad")) os = "iOS";
  else if (ua.includes("android")) os = "Android";
  else if (ua.includes("linux")) os = "Linux";
  return os ? `${browser} on ${os}` : browser;
}

const ACTION_ICONS: Record<string, { Icon: typeof Activity; tone: string }> = {
  login_success: { Icon: LogIn, tone: "text-emerald-500" },
  logout: { Icon: LogOut, tone: "text-muted-foreground" },
  account_updated: { Icon: SettingsIcon, tone: "text-blue-500" },
  session_created: { Icon: FileText, tone: "text-violet-500" },
  session_deleted: { Icon: Trash2, tone: "text-red-500" },
  sessions_bulk_deleted: { Icon: Trash2, tone: "text-red-500" },
  session_title_updated: { Icon: Pencil, tone: "text-blue-500" },
  session_moved_to_folder: { Icon: Folder, tone: "text-amber-500" },
  transcript_regenerated: { Icon: RefreshCw, tone: "text-sky-500" },
  video_uploaded: { Icon: Upload, tone: "text-violet-500" },
  upload_failed: { Icon: XCircle, tone: "text-red-500" },
  processing_started: { Icon: Loader2, tone: "text-sky-500" },
  processing_completed: { Icon: CheckCircle2, tone: "text-emerald-500" },
  processing_failed: { Icon: XCircle, tone: "text-red-500" },
  file_validation_failed: { Icon: XCircle, tone: "text-red-500" },
  folder_created: { Icon: FolderPlus, tone: "text-amber-500" },
  folder_renamed: { Icon: Pencil, tone: "text-amber-500" },
  folder_deleted: { Icon: Trash2, tone: "text-red-500" },
};

export default function AccountPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [gravatarKey, setGravatarKey] = useState(Date.now());

  const { data: account, isLoading } = useQuery<AccountData>({
    queryKey: ["/api/account"],
    enabled: !!user,
  });

  const { data: activity, isLoading: isActivityLoading } = useQuery<{ items: ActivityItem[] }>({
    queryKey: ["/api/account/activity"],
    enabled: !!user,
  });

  const profileForm = useForm<ProfileFormInput>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { displayName: "", firstName: "", lastName: "" },
    values: account
      ? {
          displayName: account.displayName || "",
          firstName: account.firstName || "",
          lastName: account.lastName || "",
        }
      : undefined,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormInput) => {
      const response = await apiRequest("PATCH", "/api/account", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/account"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/account/activity"] });
      toast({ title: "Profile updated", description: "Your profile has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    },
  });

  const timezoneOptions = useMemo(() => getCommonTimezones(), []);
  const browserTz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; }
  }, []);

  const updateTimezoneMutation = useMutation({
    mutationFn: async (timezone: string) => {
      const response = await apiRequest("PATCH", "/api/account", { timezone });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/account"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dmo/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dmo/streak"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/projects"] });
      toast({ title: "Time zone saved", description: "Your dates and streaks now use this zone." });
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't save time zone", description: error.message, variant: "destructive" });
    },
  });

  const { data: notifPrefs, isLoading: isNotifLoading } = useQuery<{ allEnabled: boolean; preferences: NotificationPreferences }>({
    queryKey: ["/api/account/notification-preferences"],
    enabled: !!user,
  });

  const { data: apiKeyData, isLoading: isApiKeyLoading } = useQuery<{
    accessEnabled: boolean;
    record: { id: string; keyPrefix: string; label: string | null; createdAt: string; lastUsedAt: string | null } | null;
  }>({
    queryKey: ["/api/account/api-key"],
    enabled: !!user,
  });

  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [keyVisible, setKeyVisible] = useState(false);

  // ── Workspace Team ─────────────────────────────────────────────────────────
  const isCollaborator = !!user?.isCollaborator;

  const { data: teamData, isLoading: isTeamLoading } = useQuery<Array<{
    id: string;
    inviteEmail: string;
    status: string;
    createdAt: string;
    acceptedAt: string | null;
    memberId: string | null;
    memberDisplayName: string | null;
    memberEmail: string | null;
  }>>({
    queryKey: ["/api/workspace/team"],
    enabled: !!user && !isCollaborator,
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [activeTab, setActiveTab] = useState("profile");

  const sendInviteMutation = useMutation({
    mutationFn: async ({ email, firstName, lastName }: { email: string; firstName: string; lastName: string }) => {
      const res = await apiRequest("POST", "/api/workspace/invite", { email, firstName, lastName });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/team"] });
      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
      toast({ title: "Invitation sent", description: "Your team member will receive an email with instructions." });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't send invite", description: err.message, variant: "destructive" });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      await apiRequest("DELETE", `/api/workspace/invite/${inviteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspace/team"] });
      toast({ title: "Access revoked" });
    },
    onError: () => {
      toast({ title: "Couldn't revoke access", variant: "destructive" });
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      await apiRequest("POST", `/api/workspace/invite/${inviteId}/resend`, {});
    },
    onSuccess: () => {
      toast({ title: "Invitation resent", description: "A fresh invite email has been sent." });
    },
    onError: () => {
      toast({ title: "Couldn't resend invite", variant: "destructive" });
    },
  });

  const generateKeyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/account/api-key", {});
      return res.json() as Promise<{ rawKey: string; record: { id: string; keyPrefix: string; label: string | null; createdAt: string; lastUsedAt: string | null } }>;
    },
    onSuccess: (data) => {
      setRevealedKey(data.rawKey);
      setKeyVisible(true);
      queryClient.invalidateQueries({ queryKey: ["/api/account/api-key"] });
      toast({ title: "API key generated", description: "Copy it now — it won't be shown again." });
    },
    onError: (error: Error) => {
      toast({ title: "Couldn't generate key", description: error.message, variant: "destructive" });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/account/api-key");
    },
    onSuccess: () => {
      setRevealedKey(null);
      setKeyVisible(false);
      queryClient.invalidateQueries({ queryKey: ["/api/account/api-key"] });
      toast({ title: "API key revoked" });
    },
    onError: () => {
      toast({ title: "Couldn't revoke key", variant: "destructive" });
    },
  });

  const saveNotifMutation = useMutation({
    mutationFn: async (payload: { allEnabled: boolean; preferences: NotificationPreferences }) => {
      const res = await apiRequest("PUT", "/api/account/notification-preferences", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/account/notification-preferences"] });
      toast({ title: "Notification preferences saved" });
    },
    onError: () => {
      toast({ title: "Couldn't save preferences", variant: "destructive" });
    },
  });

  function toggleAllEnabled(value: boolean) {
    if (!notifPrefs) return;
    saveNotifMutation.mutate({ allEnabled: value, preferences: notifPrefs.preferences });
  }

  function togglePref<K extends keyof NotificationPreferences>(key: K, value: boolean) {
    if (!notifPrefs) return;
    saveNotifMutation.mutate({
      allEnabled: notifPrefs.allEnabled,
      preferences: {
        ...notifPrefs.preferences,
        [key]: { ...(notifPrefs.preferences[key] as any), enabled: value },
      },
    });
  }

  const refreshGravatar = () => {
    setGravatarKey(Date.now());
    toast({ title: "Image refreshed", description: "Pulled the latest Gravatar." });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Unable to load account information.</p>
      </div>
    );
  }

  const isMember = account.cfEnrolled && !account.cfRevokedAt;
  const items = activity?.items ?? [];

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      {/* Page header with avatar */}
      <div className="flex items-center gap-4 mb-8">
        <Avatar className="h-14 w-14 shrink-0">
          <AvatarImage
            src={`${getGravatarUrl(account.gravatarHash)}&v=${gravatarKey}`}
            alt={account.displayName || "Profile"}
          />
          <AvatarFallback>
            <User className="h-6 w-6" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight truncate" data-testid="text-account-title">
            {account.displayName || account.firstName || "Account"}
          </h1>
          <p className="text-sm text-muted-foreground truncate" data-testid="text-profile-email">
            {account.email || "No email on file"}
          </p>
        </div>
        {isMember && (
          <Badge
            variant="secondary"
            className="ml-auto shrink-0 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1"
            data-testid="badge-membership-status"
          >
            <CheckCircle2 className="h-3 w-3" />
            Active member
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex gap-8 items-start">
          {/* ── Left nav ───────────────────────────────────────── */}
          <nav className="w-52 shrink-0 sticky top-6 rounded-xl border border-border/60 bg-card p-2 space-y-0.5" data-testid="tabs-account">
            {(
              [
                { value: "profile",       label: "Profile",       icon: User },
                { value: "timezone",      label: "Time Zone",     icon: Globe2 },
                { value: "membership",    label: "Membership",    icon: Crown },
                { value: "notifications", label: "Notifications", icon: Bell },
                { value: "activity",      label: "Activity",      icon: Activity },
                ...(!isCollaborator ? [{ value: "team", label: "Team", icon: Users }] : []),
                ...(apiKeyData?.accessEnabled ? [{ value: "api", label: "API", icon: Key }] : []),
              ] satisfies { value: string; label: string; icon: ({ className }: { className?: string }) => JSX.Element | null }[]
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setActiveTab(value)}
                data-testid={`tab-${value}`}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  activeTab === value
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>

          {/* ── Right content ──────────────────────────────────── */}
          <div className="flex-1 min-w-0">

        {/* ─── Profile Tab ─────────────────────────────────────── */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Your name and avatar displayed across the toolkit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar section */}
              <div className="flex items-start gap-4 p-4 rounded-lg bg-muted/30 border border-border">
                <Avatar className="h-16 w-16 shrink-0">
                  <AvatarImage
                    src={`${getGravatarUrl(account.gravatarHash)}&v=${gravatarKey}`}
                    alt={account.displayName || "Profile"}
                  />
                  <AvatarFallback>
                    <User className="h-7 w-7" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium mb-1">Profile photo</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Powered by Gravatar — sign up at gravatar.com with your email to set a photo.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={refreshGravatar}
                      data-testid="button-refresh-gravatar"
                    >
                      <RefreshCw className="h-3 w-3 mr-2" />
                      Refresh
                    </Button>
                    <a href="https://gravatar.com" target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="sm" data-testid="link-gravatar">
                        gravatar.com
                        <ExternalLink className="h-3 w-3 ml-1.5" />
                      </Button>
                    </a>
                  </div>
                </div>
              </div>

              {/* Profile form */}
              <Form {...profileForm}>
                <form
                  onSubmit={profileForm.handleSubmit((data) => updateProfileMutation.mutate(data))}
                  className="space-y-4"
                >
                  <FormField
                    control={profileForm.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="How you want to be called"
                            data-testid="input-display-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={profileForm.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First name</FormLabel>
                          <FormControl>
                            <Input placeholder="John" data-testid="input-first-name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={profileForm.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last name</FormLabel>
                          <FormControl>
                            <Input placeholder="Doe" data-testid="input-last-name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="space-y-1">
                    <FormLabel>Email</FormLabel>
                    <Input
                      value={account.email || ""}
                      readOnly
                      disabled
                      data-testid="input-email-readonly"
                      className="bg-muted/40"
                    />
                    <p className="text-xs text-muted-foreground">
                      Tied to your Fearless Influencer Academy membership — contact support to change.
                    </p>
                  </div>
                  <Button
                    type="submit"
                    disabled={updateProfileMutation.isPending}
                    data-testid="button-save-profile"
                  >
                    {updateProfileMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Time Zone Tab ───────────────────────────────────── */}
        <TabsContent value="timezone">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe2 className="h-5 w-5 text-emerald-500" />
                Time zone
              </CardTitle>
              <CardDescription>
                Controls "today / this week" across the entire app — DMO streaks, task due dates, and dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="select-timezone-trigger">Your time zone</Label>
                <Select
                  value={account.timezone || "America/New_York"}
                  onValueChange={(value) => updateTimezoneMutation.mutate(value)}
                  disabled={updateTimezoneMutation.isPending}
                >
                  <SelectTrigger id="select-timezone-trigger" data-testid="select-timezone" className="w-full">
                    <SelectValue placeholder="Select your time zone" />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {timezoneOptions.map((opt) => (
                      <SelectItem
                        key={opt.value}
                        value={opt.value}
                        data-testid={`option-timezone-${opt.value}`}
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {browserTz && browserTz !== (account.timezone || "America/New_York") && (
                <button
                  type="button"
                  className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                  onClick={() => updateTimezoneMutation.mutate(browserTz)}
                  disabled={updateTimezoneMutation.isPending}
                  data-testid="button-use-browser-tz"
                >
                  Use my browser time zone ({browserTz})
                </button>
              )}
              <p className="text-xs text-muted-foreground">
                Currently set to{" "}
                <span className="font-mono" data-testid="text-current-timezone">
                  {account.timezone || "America/New_York"}
                </span>.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Membership Tab ──────────────────────────────────── */}
        <TabsContent value="membership">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-500" />
                Membership
              </CardTitle>
              <CardDescription>Fearless Influencer Academy</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                {isMember ? (
                  <Badge
                    variant="secondary"
                    className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1"
                    data-testid="badge-membership-status"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Active member
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30 gap-1"
                    data-testid="badge-membership-status"
                  >
                    <XCircle className="h-3 w-3" />
                    Inactive
                  </Badge>
                )}
                <span className="text-sm text-muted-foreground" data-testid="text-member-since">
                  Member since {formatDate(account.cfEnrolledAt || account.createdAt)}
                </span>
              </div>
              {isMember ? (
                <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-4 py-3">
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">
                    Your membership is active and in good standing. You have full access to all Academy Toolkit features.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg bg-red-500/5 border border-red-500/20 px-4 py-3">
                  <p className="text-sm text-red-700 dark:text-red-400">
                    Your membership isn't active. If you believe this is a mistake, please contact support.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Notifications Tab ───────────────────────────────── */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-violet-500" />
                Email notifications
              </CardTitle>
              <CardDescription>
                Choose which emails you receive. All notifications go to{" "}
                <span className="font-medium text-foreground">{account.email}</span>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {isNotifLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : notifPrefs ? (
                <>
                  {/* Master toggle */}
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                    <div className="flex items-center gap-2">
                      {notifPrefs.allEnabled ? (
                        <Bell className="h-4 w-4 text-violet-500" />
                      ) : (
                        <BellOff className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-semibold">
                        {notifPrefs.allEnabled ? "All notifications on" : "All notifications off"}
                      </span>
                    </div>
                    <Switch
                      checked={notifPrefs.allEnabled}
                      onCheckedChange={toggleAllEnabled}
                      disabled={saveNotifMutation.isPending}
                      data-testid="switch-all-notifications"
                    />
                  </div>

                  {/* Individual toggles */}
                  <div className={notifPrefs.allEnabled ? "" : "pointer-events-none opacity-40"}>
                    {[
                      {
                        group: "Projects & Tasks",
                        items: [
                          { key: "taskDueReminders" as const, label: "Task due reminders", desc: "Sent when tasks are due within your lead time." },
                          { key: "overdueAlerts" as const, label: "Overdue task alerts", desc: "Daily reminder when you have tasks past their due date." },
                          { key: "projectDueReminders" as const, label: "Project due reminders", desc: "Alerts 3 days and 1 day before a project's due date." },
                          { key: "weeklyProjectDigest" as const, label: "Weekly project digest", desc: "A summary of open tasks and project status each week." },
                        ],
                      },
                      {
                        group: "Daily Method of Operation",
                        items: [
                          { key: "dmoStreakAtRisk" as const, label: "Streak at-risk reminder", desc: "Evening nudge when you haven't logged your DMO yet today." },
                          { key: "dmoMilestone" as const, label: "Streak milestone celebrations", desc: "Email when you hit a streak milestone (7, 30, 60, 90 days…)." },
                          { key: "weeklyDmoSummary" as const, label: "Weekly DMO summary", desc: "Your weekly points, streak, and activity recap." },
                        ],
                      },
                      {
                        group: "Video Coaching",
                        items: [
                          { key: "videoScoringComplete" as const, label: "Video scoring complete", desc: "Notified as soon as your video analysis finishes." },
                          { key: "videoPracticeReminder" as const, label: "Weekly practice reminder", desc: "Friday nudge if you haven't uploaded a practice video this week." },
                        ],
                      },
                      {
                        group: "Email Health",
                        items: [
                          { key: "reputationDropAlert" as const, label: "Sender reputation drop", desc: "Instant alert when your Google Postmaster reputation drops." },
                          { key: "weeklyInboxReport" as const, label: "Weekly inbox report", desc: "Inbox placement rate and spam rate summary for the week." },
                          { key: "inboxReportReady" as const, label: "Inbox Analyzer report ready", desc: "Full deliverability report emailed when both analysis and placement monitoring complete." },
                        ],
                      },
                      {
                        group: "Bug & Feature Feedback",
                        items: [
                          { key: "featureRequestReceived" as const, label: "Feature request received", desc: "Confirmation email when you submit a feature request." },
                          { key: "bugReportReceived" as const, label: "Bug report received", desc: "Confirmation when you file a bug report. Admins also get an alert for every new bug." },
                          { key: "featureRequestComment" as const, label: "Feature request comments", desc: "Notify you (and admins) when someone comments on a feature request." },
                          { key: "bugReportComment" as const, label: "Bug report comments", desc: "Notify you (and admins) when someone comments on a bug report." },
                          { key: "feedbackStatusChanged" as const, label: "Status updates", desc: "Email when an admin changes the status of your feature request or bug report." },
                        ],
                      },
                    ].map(({ group, items }) => (
                      <div key={group} className="mb-5">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {group}
                        </p>
                        <div className="rounded-lg border border-border divide-y divide-border">
                          {items.map(({ key, label, desc }) => (
                            <div key={key} className="flex items-center justify-between px-4 py-3 gap-4">
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{label}</p>
                                <p className="text-xs text-muted-foreground">{desc}</p>
                              </div>
                              <Switch
                                checked={notifPrefs.preferences[key]?.enabled ?? false}
                                onCheckedChange={(v) => togglePref(key, v)}
                                disabled={saveNotifMutation.isPending}
                                data-testid={`switch-notif-${key}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Could not load notification preferences.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Activity Tab ────────────────────────────────────── */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-sky-500" />
                Recent activity
              </CardTitle>
              <CardDescription>Your last 10 actions inside the toolkit.</CardDescription>
            </CardHeader>
            <CardContent>
              {isActivityLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : items.length === 0 ? (
                <p
                  className="text-sm text-muted-foreground py-8 text-center"
                  data-testid="text-no-activity"
                >
                  No recent activity yet — start by scoring your first video.
                </p>
              ) : (
                <ul className="divide-y divide-border" data-testid="list-activity">
                  {items.map((item) => {
                    const meta = ACTION_ICONS[item.actionType] ?? {
                      Icon: Activity,
                      tone: "text-muted-foreground",
                    };
                    const Icon = meta.Icon;
                    const device = shortDevice(item.userAgent);
                    return (
                      <li
                        key={item.id}
                        className="flex items-start gap-3 py-3"
                        data-testid={`activity-row-${item.id}`}
                      >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                          <Icon className={`h-4 w-4 ${meta.tone}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-medium truncate"
                            data-testid={`activity-label-${item.id}`}
                          >
                            {item.actionLabel}
                          </p>
                          {(device || item.ip) && (
                            <p className="text-xs text-muted-foreground truncate">
                              {[device, item.ip].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <span
                          className="text-xs text-muted-foreground shrink-0 whitespace-nowrap"
                          data-testid={`activity-time-${item.id}`}
                        >
                          {formatRelative(item.createdAt)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Team Tab ────────────────────────────────────────── */}
        {!isCollaborator && (
          <TabsContent value="team">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Workspace Collaborators
                </CardTitle>
                <CardDescription>
                  Invite a VA or team member to access your Project Manager. They get their own login and can only see your projects.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Invite form */}
                {(!teamData || teamData.filter(i => i.status !== "revoked").length < 1) ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="invite-first-name">First name</Label>
                        <Input
                          id="invite-first-name"
                          type="text"
                          placeholder="Jane"
                          value={inviteFirstName}
                          onChange={(e) => setInviteFirstName(e.target.value)}
                          data-testid="input-invite-first-name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="invite-last-name">Last name</Label>
                        <Input
                          id="invite-last-name"
                          type="text"
                          placeholder="Smith"
                          value={inviteLastName}
                          onChange={(e) => setInviteLastName(e.target.value)}
                          data-testid="input-invite-last-name"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="invite-email">Email address</Label>
                      <div className="flex gap-2">
                        <Input
                          id="invite-email"
                          type="email"
                          placeholder="va@example.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && inviteEmail)
                              sendInviteMutation.mutate({ email: inviteEmail, firstName: inviteFirstName, lastName: inviteLastName });
                          }}
                          data-testid="input-invite-email"
                        />
                        <Button
                          onClick={() => sendInviteMutation.mutate({ email: inviteEmail, firstName: inviteFirstName, lastName: inviteLastName })}
                          disabled={sendInviteMutation.isPending || !inviteEmail}
                          data-testid="button-send-invite"
                        >
                          {sendInviteMutation.isPending
                            ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                            : <UserPlus className="h-4 w-4 mr-1.5" />}
                          Send Invite
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Their name will be shown on tasks and comments. They'll receive an email with a link to set up their account.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-muted/40 border px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4 shrink-0" />
                    You've reached the collaborator limit (1). Revoke the current invite to send a new one.
                  </div>
                )}

                {/* Current invites */}
                {isTeamLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : teamData && teamData.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide text-xs">Current invites</p>
                    {teamData.map((invite) => (
                      <div
                        key={invite.id}
                        className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                        data-testid={`row-invite-${invite.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-1.5 rounded-full bg-muted">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate" data-testid={`text-invite-email-${invite.id}`}>
                              {invite.memberDisplayName || invite.memberEmail || invite.inviteEmail}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{invite.inviteEmail}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {invite.status === "accepted" ? (
                            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Active
                            </Badge>
                          ) : invite.status === "pending" ? (
                            <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1">
                              <Clock className="h-3 w-3" />
                              Pending
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <Ban className="h-3 w-3" />
                              Revoked
                            </Badge>
                          )}
                          {invite.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-muted-foreground hover:text-foreground gap-1 text-xs"
                              onClick={() => resendInviteMutation.mutate(invite.id)}
                              disabled={resendInviteMutation.isPending}
                              data-testid={`button-resend-invite-${invite.id}`}
                            >
                              {resendInviteMutation.isPending
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <RefreshCw className="h-3.5 w-3.5" />}
                              Resend
                            </Button>
                          )}
                          {invite.status !== "revoked" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive h-7 px-2"
                              onClick={() => revokeInviteMutation.mutate(invite.id)}
                              disabled={revokeInviteMutation.isPending}
                              data-testid={`button-revoke-invite-${invite.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {apiKeyData?.accessEnabled && (
          <TabsContent value="api">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <CardTitle>API Access</CardTitle>
                    <CardDescription>
                      Generate a personal API key to connect the Academy Toolkit mobile app or any companion dashboard to your account.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {isApiKeyLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : (
                  <>
                    {/* Current key or revealed key */}
                    {(revealedKey || apiKeyData?.record) && (
                      <div className="space-y-3">
                        <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Your API Key</p>
                            <div className="flex items-center gap-1">
                              {revealedKey && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setKeyVisible(v => !v)}
                                    data-testid="button-toggle-key-visibility"
                                  >
                                    {keyVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      navigator.clipboard.writeText(revealedKey);
                                      toast({ title: "Copied to clipboard" });
                                    }}
                                    data-testid="button-copy-api-key"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                          <code className="block text-sm font-mono break-all text-foreground" data-testid="text-api-key">
                            {revealedKey
                              ? (keyVisible ? revealedKey : revealedKey.slice(0, 12) + "•".repeat(revealedKey.length - 12))
                              : (apiKeyData?.record?.keyPrefix + "••••••••••••••••••••••••••••••••••••••••••••••••••••")}
                          </code>
                          {revealedKey && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <Key className="h-3 w-3" /> Save this key now — it won't be shown again once you leave this page.
                            </p>
                          )}
                          {!revealedKey && apiKeyData?.record && (
                            <p className="text-[11px] text-muted-foreground">
                              Created {formatDate(apiKeyData.record.createdAt)}
                              {apiKeyData.record.lastUsedAt && ` · Last used ${formatRelative(apiKeyData.record.lastUsedAt)}`}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generateKeyMutation.mutate()}
                            disabled={generateKeyMutation.isPending}
                            data-testid="button-regenerate-api-key"
                          >
                            {generateKeyMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                            Regenerate key
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => revokeKeyMutation.mutate()}
                            disabled={revokeKeyMutation.isPending}
                            data-testid="button-revoke-api-key"
                          >
                            {revokeKeyMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                            Revoke
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* No key yet */}
                    {!revealedKey && !apiKeyData?.record && (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          You don't have an API key yet. Generate one to connect your account to the mobile app or a companion dashboard.
                        </p>
                        <Button
                          size="sm"
                          onClick={() => generateKeyMutation.mutate()}
                          disabled={generateKeyMutation.isPending}
                          data-testid="button-generate-api-key"
                        >
                          {generateKeyMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Key className="h-3.5 w-3.5 mr-1.5" />}
                          Generate API key
                        </Button>
                      </div>
                    )}

                    {/* Endpoints reference */}
                    <div className="rounded-lg border p-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Available endpoints (read-only)</p>
                      <ul className="space-y-1 text-xs font-mono text-muted-foreground">
                        <li><span className="text-emerald-600 dark:text-emerald-400 font-bold">GET</span> /api/v1/me</li>
                        <li><span className="text-emerald-600 dark:text-emerald-400 font-bold">GET</span> /api/v1/dashboard</li>
                        <li><span className="text-emerald-600 dark:text-emerald-400 font-bold">GET</span> /api/v1/tasks</li>
                        <li><span className="text-emerald-600 dark:text-emerald-400 font-bold">GET</span> /api/v1/dmo</li>
                      </ul>
                      <p className="text-[11px] text-muted-foreground pt-1">
                        Pass your key as <code className="bg-muted px-1 rounded">Authorization: Bearer &lt;key&gt;</code> or <code className="bg-muted px-1 rounded">X-API-Key: &lt;key&gt;</code>
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
          </div>{/* /right content */}
        </div>{/* /flex wrapper */}
      </Tabs>
    </div>
  );
}
