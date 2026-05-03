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
  Trash2,
  CheckCircle2,
  XCircle,
  Settings as SettingsIcon,
} from "lucide-react";

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

function GradientCard({
  children,
  accentClass,
}: {
  children: React.ReactNode;
  accentClass: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-1 ${accentClass}`} />
      {children}
    </Card>
  );
}

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
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-8" data-testid="text-account-title">Account</h1>

      <div className="space-y-6">
        {/* ─── Profile ───────────────────────────────────────── */}
        <GradientCard accentClass="bg-gradient-to-r from-violet-500 via-fuchsia-500 to-rose-500">
          <CardHeader className="flex flex-row items-start gap-4 pb-4">
            <Avatar className="h-20 w-20">
              <AvatarImage
                src={`${getGravatarUrl(account.gravatarHash)}&v=${gravatarKey}`}
                alt={account.displayName || "Profile"}
              />
              <AvatarFallback>
                <User className="h-8 w-8" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <CardTitle data-testid="text-profile-name" className="truncate">
                {account.displayName || account.firstName || "Your Profile"}
              </CardTitle>
              <CardDescription className="mt-1 truncate" data-testid="text-profile-email">
                {account.email || "No email on file"}
              </CardDescription>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshGravatar}
                  data-testid="button-refresh-gravatar"
                >
                  <RefreshCw className="h-3 w-3 mr-2" />
                  Refresh image
                </Button>
                <a
                  href="https://gravatar.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex"
                >
                  <Button variant="ghost" size="sm" data-testid="link-gravatar">
                    Change on Gravatar
                    <ExternalLink className="h-3 w-3 ml-2" />
                  </Button>
                </a>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Your avatar comes from gravatar.com — sign up there with this email to change it.
              </p>
            </div>
          </CardHeader>
          <CardContent>
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
        </GradientCard>

        {/* ─── Membership ────────────────────────────────────── */}
        <GradientCard accentClass="bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              Membership
            </CardTitle>
            <CardDescription>Fearless Influencer Academy</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
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
              <a
                href="https://academy.fearlessinfluencer.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex"
              >
                <Button variant="outline" size="sm" data-testid="link-manage-membership">
                  Manage on ClickFunnels
                  <ExternalLink className="h-3 w-3 ml-2" />
                </Button>
              </a>
            </div>
            {!isMember && (
              <p className="text-sm text-muted-foreground">
                Your membership isn't active. If you believe this is a mistake, please contact support.
              </p>
            )}
          </CardContent>
        </GradientCard>

        {/* ─── Recent Activity ──────────────────────────────── */}
        <GradientCard accentClass="bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-sky-500" />
              Recent activity
            </CardTitle>
            <CardDescription>Your last 10 actions inside the toolkit</CardDescription>
          </CardHeader>
          <CardContent>
            {isActivityLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center" data-testid="text-no-activity">
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
                        <p className="text-sm font-medium truncate" data-testid={`activity-label-${item.id}`}>
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
        </GradientCard>
      </div>
    </div>
  );
}
