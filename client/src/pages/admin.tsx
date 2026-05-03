import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, CheckCircle, AlertCircle,
  Users, ChevronLeft, ChevronRight, Shield, ShieldOff, Ban, Video,
  CheckCircle2, LogOut, LogIn, RefreshCw, Search, Mail, Eye, EyeOff, Info, Clock,
  Copy, ExternalLink, Webhook, UserCheck, UserX, UserMinus, Filter, Zap,
  Key, Youtube, MessageSquare, XCircle, Trash2,
  Upload, FolderPlus, FolderEdit, FolderMinus, FilePenLine, FileVideo,
  CircleAlert, RotateCw, UserCog, Activity
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface AdminStats {
  totalUsers: number;
  newUsersLast7Days: number;
  totalSessions: number;
  sessionsLast7Days: number;
}

interface OverviewStats {
  totalUsers: number;
  sessionsLast7Days: number;
  newUsersLast30Days: number;
}

interface ActivityItem {
  id: string;
  actionType: string;
  actionLabel: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  ip: string | null;
  userAgent: string | null;
  user: {
    id: string;
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
}

const ACTION_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All actions" },
  { value: "login_success", label: "Login" },
  { value: "logout", label: "Logout" },
  { value: "account_updated", label: "Profile updated" },
  { value: "video_uploaded", label: "Video uploaded" },
  { value: "session_created", label: "Session created" },
  { value: "session_deleted", label: "Session deleted" },
  { value: "sessions_bulk_deleted", label: "Sessions bulk deleted" },
  { value: "session_title_updated", label: "Session renamed" },
  { value: "session_moved_to_folder", label: "Session moved" },
  { value: "transcript_regenerated", label: "Transcript regenerated" },
  { value: "processing_started", label: "Processing started" },
  { value: "processing_completed", label: "Processing completed" },
  { value: "processing_failed", label: "Processing failed" },
  { value: "upload_failed", label: "Upload failed" },
  { value: "file_validation_failed", label: "File validation failed" },
  { value: "folder_created", label: "Folder created" },
  { value: "folder_renamed", label: "Folder renamed" },
  { value: "folder_deleted", label: "Folder deleted" },
];

function getActionVisual(actionType: string): { Icon: any; tone: string } {
  const map: Record<string, { Icon: any; tone: string }> = {
    login_success: { Icon: LogIn, tone: "text-blue-500" },
    logout: { Icon: LogOut, tone: "text-muted-foreground" },
    account_updated: { Icon: UserCog, tone: "text-violet-500" },
    video_uploaded: { Icon: Upload, tone: "text-amber-500" },
    upload_failed: { Icon: CircleAlert, tone: "text-red-500" },
    session_created: { Icon: FileVideo, tone: "text-emerald-500" },
    session_deleted: { Icon: Trash2, tone: "text-red-500" },
    sessions_bulk_deleted: { Icon: Trash2, tone: "text-red-500" },
    session_title_updated: { Icon: FilePenLine, tone: "text-sky-500" },
    session_moved_to_folder: { Icon: FolderEdit, tone: "text-sky-500" },
    transcript_regenerated: { Icon: RotateCw, tone: "text-indigo-500" },
    processing_started: { Icon: Activity, tone: "text-cyan-500" },
    processing_completed: { Icon: CheckCircle2, tone: "text-green-500" },
    processing_failed: { Icon: XCircle, tone: "text-red-500" },
    file_validation_failed: { Icon: CircleAlert, tone: "text-orange-500" },
    folder_created: { Icon: FolderPlus, tone: "text-teal-500" },
    folder_renamed: { Icon: FolderEdit, tone: "text-teal-500" },
    folder_deleted: { Icon: FolderMinus, tone: "text-rose-500" },
  };
  return map[actionType] || { Icon: Activity, tone: "text-muted-foreground" };
}

interface AdminUser {
  id: string;
  email: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
  isAdmin: boolean;
  isDisabled: boolean;
  disabledAt: string | null;
  disabledReason: string | null;
  emailConsentAt: string | null;
  lastLoginAt: string | null;
  providers: string[];
  totalVideos: number;
  keywordsCreditsThisMonth: number;
  keywordsCreditsTotalUsed: number;
  cfEnrolled: boolean | null;
  cfEnrolledAt: string | null;
  cfRevokedAt: string | null;
}

interface UserAction {
  id: string;
  actionType: string;
  actionLabel: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

interface UserDetails {
  user: AdminUser;
  identities: Array<{
    id: string;
    provider: string;
    providerUserId: string;
    emailFromProvider: string | null;
    createdAt: string;
  }>;
  sessions: Array<{
    id: string;
    title: string | null;
    createdAt: string;
    scoreJson: { totalScore: number } | null;
    videoPath: string | null;
    videoDeletedAt: string | null;
    expiresAt: string | null;
    transcriptText: string | null;
  }>;
  sessionCount: number;
  hasLocalPassword: boolean;
  providers: string[];
}

interface KeywordsEverywhereStatus {
  apiConfigured: boolean;
  accountCredits: number | null;
  accountError: string | null;
  totalCreditsUsedAllTime: number;
  totalCreditsUsedThisMonth: number;
  activeUsersThisMonth: number;
  topUsers: Array<{
    userId: string;
    email: string | null;
    displayName: string | null;
    creditsThisMonth: number;
    creditsTotal: number;
  }>;
}

interface SessionDetail {
  session: {
    id: string;
    title: string | null;
    createdAt: string;
    expiresAt: string | null;
    status: "available" | "expired";
    videoUrl: string | null;
    thumbnailUrl: string | null;
    transcriptText: string | null;
    goalType: string;
    score: {
      total: number;
      breakdown: {
        hook: number;
        setHook: number;
        firstCTA: number;
        content: number;
        finalCTA: number;
      };
    } | null;
    recommendationsJson: {
      summary: {
        strengths: string[];
        topImprovements: string[];
      };
      parts: Record<string, {
        whatWorked: string[];
        whatMissing: string[];
        suggestions: string[];
        exampleLines: string[];
      }>;
      delivery: {
        wordsPerMinute: number;
        fillerWords: { count: number; examples: string[] };
        clarityNotes: string[];
      };
    } | null;
    rawScoreJson: any;
    fileMeta: {
      durationSeconds: number;
      sizeBytes: number;
      format: string;
    };
  };
  user: {
    id: string;
    displayName: string | null;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  };
}

// ==================== CLICKFUNNELS INTEGRATION TAB ====================

interface CfStatus {
  configured: { apiToken: boolean; workspaceDomain: boolean; courseId: boolean; webhookSecret: boolean };
  allConfigured: boolean;
  workspaceDomain: string;
  courseId: string;
  enrolledCount: number;
  revokedCount: number;
}

interface CfUser {
  id: string;
  email: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  cfEnrolled: boolean | null;
  cfEnrolledAt: string | null;
  cfRevokedAt: string | null;
  cfContactId: string | null;
}

function CfIntegrationTab() {
  const { toast } = useToast();
  const [testEmail, setTestEmail] = useState("");
  const [testEvent, setTestEvent] = useState("courses/enrollment.created");
  const [testResult, setTestResult] = useState<{ action: string; email: string | null } | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const { data: cfStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery<CfStatus>({
    queryKey: ["/api/admin/cf/status"],
  });

  const webhookUrl = `${window.location.protocol}//${window.location.host}/api/webhooks/clickfunnels`;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: `${label} copied!` });
    });
  };

  const handleTestWebhook = async () => {
    if (!testEmail.trim()) {
      toast({ title: "Enter an email address first", variant: "destructive" });
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/cf/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: testEmail.trim(), eventType: testEvent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      setTestResult({ action: data.action, email: data.email });
      refetchStatus();
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    } finally {
      setTestLoading(false);
    }
  };

  const configItems = [
    { key: "apiToken", label: "CF API Token", desc: "Secret: CF_API_TOKEN" },
    { key: "workspaceDomain", label: "Workspace Domain", desc: "Secret: CF_WORKSPACE_DOMAIN" },
    { key: "courseId", label: "Course ID", desc: "Secret: CF_COURSE_ID" },
    { key: "webhookSecret", label: "Webhook Secret", desc: "Secret: CF_WEBHOOK_SECRET" },
  ] as const;

  const webhookEvents = [
    { event: "courses/enrollment.created", action: "Grants access", icon: <UserCheck className="h-4 w-4 text-green-500" /> },
    { event: "courses/enrollment.suspended", action: "Revokes access", icon: <UserX className="h-4 w-4 text-red-500" /> },
    { event: "courses/enrollment.deleted", action: "Revokes access", icon: <UserX className="h-4 w-4 text-red-500" /> },
    { event: "subscription.cancelled", action: "Revokes access", icon: <UserX className="h-4 w-4 text-red-500" /> },
    { event: "subscription.churned", action: "Revokes access", icon: <UserX className="h-4 w-4 text-red-500" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold">ClickFunnels Integration</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage membership access synced with your ClickFunnels course enrollment.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Integration Status</CardTitle>
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : cfStatus?.allConfigured ? (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="font-semibold text-green-600 dark:text-green-400">Configured</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                <span className="font-semibold text-amber-600 dark:text-amber-400">Incomplete Setup</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Enrolled Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statusLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : cfStatus?.enrolledCount ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Active CF access</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Revoked / Cancelled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statusLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : cfStatus?.revokedCount ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Access removed</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Configuration Health */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configuration Secrets</CardTitle>
            <CardDescription>
              These secrets must be set in the Replit Secrets panel for the integration to work.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {configItems.map(({ key, label, desc }) => {
              const isSet = cfStatus?.configured[key] ?? false;
              return (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground font-mono">{desc}</p>
                  </div>
                  {statusLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : isSet ? (
                    <Badge variant="outline" className="text-green-600 border-green-300 dark:text-green-400">
                      <CheckCircle className="h-3 w-3 mr-1" /> Set
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-red-600 border-red-300 dark:text-red-400">
                      <AlertCircle className="h-3 w-3 mr-1" /> Missing
                    </Badge>
                  )}
                </div>
              );
            })}
            {cfStatus?.workspaceDomain && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">Workspace</p>
                <p className="text-sm font-mono">{cfStatus.workspaceDomain}</p>
              </div>
            )}
            {cfStatus?.courseId && (
              <div>
                <p className="text-xs text-muted-foreground">Course ID</p>
                <p className="text-sm font-mono">{cfStatus.courseId}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Webhook Setup */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              Webhook Setup
            </CardTitle>
            <CardDescription>
              Add this endpoint in ClickFunnels to sync enrollment events automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Webhook URL</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono break-all">
                  {webhookUrl}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(webhookUrl, "Webhook URL")}
                  data-testid="button-copy-webhook-url"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Subscribe to these events</p>
              <div className="space-y-2">
                {webhookEvents.map(({ event, action, icon }) => (
                  <div key={event} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {icon}
                      <code className="text-xs font-mono">{event}</code>
                    </div>
                    <span className="text-xs text-muted-foreground">{action}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
              <p className="font-medium">How to set it up in ClickFunnels:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Go to <strong>Workspace Settings → Webhooks</strong></li>
                <li>Click <strong>Add New Endpoint</strong></li>
                <li>Paste the webhook URL above</li>
                <li>Select all 5 events listed above</li>
                <li>Set the signing secret to your <code className="font-mono">CF_WEBHOOK_SECRET</code> value</li>
              </ol>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => window.open("https://app.myclickfunnels.com/settings/webhooks", "_blank")}
              data-testid="button-open-cf-webhooks"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-2" />
              Open ClickFunnels Webhooks
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Webhook Tester */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Webhook Tester
          </CardTitle>
          <CardDescription>
            Simulate a ClickFunnels event to verify your integration is working correctly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              placeholder="user@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="flex-1 text-sm border rounded-md px-3 py-2 bg-background"
              data-testid="input-test-webhook-email"
            />
            <select
              value={testEvent}
              onChange={(e) => setTestEvent(e.target.value)}
              className="text-sm border rounded-md px-3 py-2 bg-background"
              data-testid="select-test-webhook-event"
            >
              <option value="courses/enrollment.created">courses/enrollment.created</option>
              <option value="courses/enrollment.suspended">courses/enrollment.suspended</option>
              <option value="courses/enrollment.deleted">courses/enrollment.deleted</option>
              <option value="subscription.cancelled">subscription.cancelled</option>
              <option value="subscription.churned">subscription.churned</option>
            </select>
            <Button
              onClick={handleTestWebhook}
              disabled={testLoading}
              size="sm"
              data-testid="button-run-test-webhook"
            >
              {testLoading ? "Running..." : "Run Test"}
            </Button>
          </div>

          {testResult && (
            <div className={`flex items-center gap-3 rounded-md border px-4 py-3 text-sm ${
              testResult.action === "granted" ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400" :
              testResult.action === "revoked" ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400" :
              "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
            }`} data-testid="text-test-webhook-result">
              {testResult.action === "granted" && <UserCheck className="h-4 w-4 flex-shrink-0" />}
              {testResult.action === "revoked" && <UserX className="h-4 w-4 flex-shrink-0" />}
              {!["granted", "revoked"].includes(testResult.action) && <AlertCircle className="h-4 w-4 flex-shrink-0" />}
              <div>
                <span className="font-medium capitalize">{testResult.action.replace(/_/g, " ")}</span>
                {testResult.email && <span className="ml-2 opacity-70">for {testResult.email}</span>}
                {testResult.action === "no_local_user" && (
                  <p className="text-xs mt-0.5 opacity-70">No account found with that email in this app.</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null);
  const [overviewStatsLoading, setOverviewStatsLoading] = useState(true);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityPage, setActivityPage] = useState(1);
  const [activityTotalPages, setActivityTotalPages] = useState(1);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityActionFilter, setActivityActionFilter] = useState("all");
  const [activitySinceFilter, setActivitySinceFilter] = useState("all");
  const ACTIVITY_PAGE_SIZE = 20;
  const [keStatus, setKeStatus] = useState<KeywordsEverywhereStatus | null>(null);
  const [keStatusLoading, setKeStatusLoading] = useState(true);
  const [cfStatus, setCfStatus] = useState<CfStatus | null>(null);
  const [cfStatusLoading, setCfStatusLoading] = useState(true);
  const [creditLimitInput, setCreditLimitInput] = useState<string>("");
  const [creditLimitSaving, setCreditLimitSaving] = useState(false);
  const [keApiKeyData, setKeApiKeyData] = useState<{ configured: boolean; keyLastFour: string | null; updatedAt: string | null } | null>(null);
  const [keApiKeyDataLoading, setKeApiKeyDataLoading] = useState(true);
  const [keApiKeyInput, setKeApiKeyInput] = useState("");
  const [keApiKeyShowInput, setKeApiKeyShowInput] = useState(false);
  const [topicApiStatus, setTopicApiStatus] = useState<{ youtube: boolean; openai: boolean; reddit: boolean; keywordsEverywhere: boolean } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // User management state
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [totalUsers, setTotalUsers] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [consentFilter, setConsentFilter] = useState("all");
  const [membershipFilter, setMembershipFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  
  // User drawer
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [userDetailsLoading, setUserDetailsLoading] = useState(false);
  
  // Confirm dialogs
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => Promise<void>;
  } | null>(null);

  // Session detail drawer
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [sessionDetailLoading, setSessionDetailLoading] = useState(false);
  
  // User actions drawer
  const [actionsUserId, setActionsUserId] = useState<string | null>(null);
  const [actionsUser, setActionsUser] = useState<AdminUser | null>(null);
  const [userActions, setUserActions] = useState<UserAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [actionsNextCursor, setActionsNextCursor] = useState<string | null>(null);
  const [actionsLoadingMore, setActionsLoadingMore] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      setLocation("/dashboard");
      return;
    }
    
    if (user?.isAdmin) {
      fetchStats();
      fetchKeStatus();
      fetchCfStatus();
      fetchOverviewStats();
      fetchKeApiKeyData();
    }
  }, [user, authLoading, setLocation]);

  const fetchStats = async () => {
    try {
      setStatsLoading(true);
      const res = await fetch("/api/admin/stats", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch admin stats:", err);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchOverviewStats = async () => {
    try {
      setOverviewStatsLoading(true);
      const res = await fetch("/api/admin/overview/stats", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setOverviewStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch overview stats:", err);
    } finally {
      setOverviewStatsLoading(false);
    }
  };

  const fetchActivityFeed = useCallback(async () => {
    try {
      setActivityLoading(true);
      const params = new URLSearchParams({
        page: String(activityPage),
        pageSize: String(ACTIVITY_PAGE_SIZE),
      });
      if (activityActionFilter !== "all") params.set("actionType", activityActionFilter);
      if (activitySinceFilter !== "all") params.set("since", activitySinceFilter);

      const res = await fetch(`/api/admin/overview/activity?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setActivityFeed(data.items || []);
        setActivityTotalPages(data.totalPages || 1);
        setActivityTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to fetch activity feed:", err);
    } finally {
      setActivityLoading(false);
    }
  }, [activityPage, activityActionFilter, activitySinceFilter]);

  useEffect(() => {
    if (user?.isAdmin) {
      fetchActivityFeed();
    }
  }, [user, fetchActivityFeed]);

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
    return format(date, "MMM d, yyyy");
  };

  const getActivityUserName = (user: ActivityItem["user"]) => {
    if (user.displayName) return user.displayName;
    if (user.email) return user.email.split("@")[0];
    return "Unknown User";
  };

  const fetchSessionDetail = async (sessionId: string) => {
    try {
      setSessionDetailLoading(true);
      const res = await fetch(`/api/admin/sessions/${sessionId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSessionDetail(data);
      } else {
        toast({ title: "Error", description: "Failed to load session details", variant: "destructive" });
        setSessionDetail(null);
      }
    } catch (err) {
      console.error("Failed to fetch session detail:", err);
      toast({ title: "Error", description: "Failed to load session details", variant: "destructive" });
      setSessionDetail(null);
    } finally {
      setSessionDetailLoading(false);
    }
  };

  // Effect to fetch session detail when selectedSessionId changes
  useEffect(() => {
    if (selectedSessionId) {
      fetchSessionDetail(selectedSessionId);
    } else {
      setSessionDetail(null);
    }
  }, [selectedSessionId]);

  const fetchKeStatus = async () => {
    try {
      setKeStatusLoading(true);
      const [statusRes, limitRes] = await Promise.all([
        fetch("/api/admin/keywords-everywhere/status", { credentials: "include" }),
        fetch("/api/admin/ke/monthly-limit", { credentials: "include" }),
      ]);
      if (statusRes.ok) {
        const data = await statusRes.json();
        setKeStatus(data);
      }
      if (limitRes.ok) {
        const { limit } = await limitRes.json();
        setCreditLimitInput(String(limit));
      }
    } catch (err) {
      console.error("Failed to fetch Keywords Everywhere status:", err);
    } finally {
      setKeStatusLoading(false);
    }
  };

  const fetchCfStatus = async () => {
    try {
      setCfStatusLoading(true);
      const res = await fetch("/api/admin/cf/status", { credentials: "include" });
      if (res.ok) setCfStatus(await res.json());
    } catch (err) {
      console.error("Failed to fetch CF status:", err);
    } finally {
      setCfStatusLoading(false);
    }
  };

  const fetchKeApiKeyData = async () => {
    try {
      setKeApiKeyDataLoading(true);
      const [keyRes, statusRes] = await Promise.all([
        fetch("/api/topic-pulse/api-keys/keywords-everywhere", { credentials: "include" }),
        fetch("/api/topic-pulse/status", { credentials: "include" }),
      ]);
      if (keyRes.ok) setKeApiKeyData(await keyRes.json());
      if (statusRes.ok) setTopicApiStatus(await statusRes.json());
    } catch (err) {
      console.error("Failed to fetch KE API key data:", err);
    } finally {
      setKeApiKeyDataLoading(false);
    }
  };

  const saveKeApiKeyMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      const res = await apiRequest("POST", "/api/topic-pulse/api-keys/keywords-everywhere", { apiKey });
      return res;
    },
    onSuccess: () => {
      setKeApiKeyInput("");
      fetchKeApiKeyData();
      toast({ title: "API key saved", description: "Keywords Everywhere API key has been securely stored." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to save API key", variant: "destructive" });
    },
  });

  const deleteKeApiKeyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/topic-pulse/api-keys/keywords-everywhere");
    },
    onSuccess: () => {
      fetchKeApiKeyData();
      toast({ title: "API key removed", description: "Keywords Everywhere API key has been deleted." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to remove API key", variant: "destructive" });
    },
  });

  const handleSaveKeApiKey = () => {
    if (keApiKeyInput.trim().length < 10) {
      toast({ title: "Invalid key", description: "Please enter a valid API key", variant: "destructive" });
      return;
    }
    saveKeApiKeyMutation.mutate(keApiKeyInput.trim());
  };

  const handleSaveCreditLimit = async () => {
    const parsed = parseInt(creditLimitInput, 10);
    if (isNaN(parsed) || parsed < 1) {
      toast({ title: "Enter a valid number greater than 0", variant: "destructive" });
      return;
    }
    setCreditLimitSaving(true);
    try {
      const res = await fetch("/api/admin/ke/monthly-limit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ limit: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      setCreditLimitInput(String(data.limit));
      toast({ title: `Monthly credits limit updated to ${data.limit.toLocaleString()}` });
      fetchKeStatus();
    } catch (err: any) {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    } finally {
      setCreditLimitSaving(false);
    }
  };

  const fetchUsers = useCallback(async () => {
    try {
      setUsersLoading(true);
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(pageSize),
        sort: sortBy,
      });
      if (searchQuery) params.set("search", searchQuery);
      if (roleFilter !== "all") params.set("role", roleFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (providerFilter !== "all") params.set("provider", providerFilter);
      if (consentFilter !== "all") params.set("consent", consentFilter);
      if (membershipFilter !== "all") params.set("membership", membershipFilter);
      
      const res = await fetch(`/api/admin/users?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        setTotalUsers(data.total);
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setUsersLoading(false);
    }
  }, [currentPage, pageSize, searchQuery, roleFilter, statusFilter, providerFilter, consentFilter, membershipFilter, sortBy]);

  useEffect(() => {
    if (user?.isAdmin) {
      fetchUsers();
    }
  }, [user, fetchUsers]);

  const fetchUserDetails = async (userId: string) => {
    try {
      setUserDetailsLoading(true);
      const res = await fetch(`/api/admin/users/${userId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUserDetails(data);
      }
    } catch (err) {
      console.error("Failed to fetch user details:", err);
    } finally {
      setUserDetailsLoading(false);
    }
  };

  const handleUserClick = (userId: string) => {
    setSelectedUserId(userId);
    fetchUserDetails(userId);
  };
  
  const fetchUserActions = async (userId: string, cursor?: string) => {
    if (cursor) {
      setActionsLoadingMore(true);
    } else {
      setActionsLoading(true);
      setUserActions([]);
    }
    
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (cursor) params.append("cursor", cursor);
      
      const res = await fetch(`/api/admin/users/${userId}/actions?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (cursor) {
          setUserActions(prev => [...prev, ...data.items]);
        } else {
          setUserActions(data.items);
        }
        setActionsNextCursor(data.nextCursor);
      }
    } catch (err) {
      console.error("Failed to fetch user actions:", err);
    } finally {
      setActionsLoading(false);
      setActionsLoadingMore(false);
    }
  };
  
  const handleActionsClick = (user: AdminUser) => {
    setActionsUserId(user.id);
    setActionsUser(user);
    fetchUserActions(user.id);
  };

  const handleUpdateUserRole = async (userId: string, newRole: "user" | "admin") => {
    try {
      setActionLoading(`role-${userId}`);
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
        credentials: "include",
      });
      
      if (res.ok) {
        toast({
          title: "Role Updated",
          description: `User has been ${newRole === "admin" ? "promoted to admin" : "demoted to user"}.`,
        });
        fetchUsers();
        if (selectedUserId === userId) {
          fetchUserDetails(userId);
        }
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.message || "Failed to update user role",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to update user role",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleCfAccess = async (userId: string, grant: boolean) => {
    try {
      setActionLoading(`cf-${userId}`);
      const res = await fetch(`/api/admin/users/${userId}/cf-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant }),
        credentials: "include",
      });
      if (res.ok) {
        toast({
          title: grant ? "CF Access Granted" : "CF Access Revoked",
          description: grant
            ? "User now has ClickFunnels enrollment access."
            : "ClickFunnels access has been revoked.",
        });
        fetchUsers();
        if (selectedUserId === userId) fetchUserDetails(userId);
      } else {
        const error = await res.json();
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update CF access", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleDisabled = async (userId: string, disable: boolean, reason?: string) => {
    try {
      setActionLoading(`disable-${userId}`);
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDisabled: disable, disabledReason: reason }),
        credentials: "include",
      });
      
      if (res.ok) {
        toast({
          title: disable ? "User Disabled" : "User Enabled",
          description: disable ? "User account has been disabled." : "User account has been re-enabled.",
        });
        fetchUsers();
        if (selectedUserId === userId) {
          fetchUserDetails(userId);
        }
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.message || "Failed to update user status",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to update user status",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleForceLogout = async (userId: string) => {
    try {
      setActionLoading(`logout-${userId}`);
      const res = await fetch(`/api/admin/users/${userId}/force-logout`, {
        method: "POST",
        credentials: "include",
      });
      
      if (res.ok) {
        toast({
          title: "Sessions Invalidated",
          description: "All user sessions have been terminated.",
        });
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.message || "Failed to force logout",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to force logout user",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const getUserDisplayName = (u: AdminUser) => {
    if (u.displayName) return u.displayName;
    if (u.firstName || u.lastName) return `${u.firstName || ""} ${u.lastName || ""}`.trim();
    return u.email || "No name";
  };

  const getProviderBadges = (providers: string[]) => {
    return providers.map((p) => (
      <Badge key={p} variant="outline" className="text-xs">
        {p === "local" ? "Email" : p.charAt(0).toUpperCase() + p.slice(1)}
      </Badge>
    ));
  };

  const totalPages = Math.ceil(totalUsers / pageSize);

  if (authLoading) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user?.isAdmin) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold" data-testid="text-admin-title">Admin Dashboard</h1>
        <p className="mt-2 text-muted-foreground">Manage users, integrations, and system settings</p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
          <TabsTrigger value="integrations" data-testid="tab-integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {overviewStatsLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="stat-total-users">{overviewStats?.totalUsers || 0}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Members</CardTitle>
                <UserCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {cfStatusLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="stat-active-members">{cfStatus?.enrolledCount ?? 0}</div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Enrolled in ClickFunnels</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Sessions (Last 7 Days)</CardTitle>
                <Video className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {overviewStatsLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="stat-sessions-7d">{overviewStats?.sessionsLast7Days || 0}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">New Users (Last 30 Days)</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {overviewStatsLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="stat-new-users-30d">{overviewStats?.newUsersLast30Days || 0}</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Integration health strip */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card data-testid="health-clickfunnels">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Webhook className="h-4 w-4 text-muted-foreground" />
                    ClickFunnels
                  </CardTitle>
                  {cfStatusLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : cfStatus?.allConfigured ? (
                    <Badge variant="outline" className="text-green-600 border-green-300 dark:text-green-400">
                      <CheckCircle className="h-3 w-3 mr-1" /> Healthy
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400">
                      <AlertCircle className="h-3 w-3 mr-1" /> Setup Incomplete
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Enrolled members</span>
                  <span className="font-medium">{cfStatus?.enrolledCount ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Revoked / cancelled</span>
                  <span className="font-medium">{cfStatus?.revokedCount ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Secrets configured</span>
                  <span className="font-medium">
                    {cfStatus
                      ? `${Object.values(cfStatus.configured).filter(Boolean).length}/4`
                      : "—"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card data-testid="health-keywords-everywhere">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    Keywords Everywhere
                  </CardTitle>
                  {keStatusLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : keStatus?.apiConfigured ? (
                    <Badge variant="outline" className="text-green-600 border-green-300 dark:text-green-400">
                      <CheckCircle className="h-3 w-3 mr-1" /> Connected
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400">
                      <AlertCircle className="h-3 w-3 mr-1" /> Not Configured
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">API credits remaining</span>
                  <span className="font-medium">
                    {keStatus?.accountCredits !== null && keStatus?.accountCredits !== undefined
                      ? keStatus.accountCredits.toLocaleString()
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Used (active windows)</span>
                  <span className="font-medium">{keStatus?.totalCreditsUsedThisMonth?.toLocaleString() ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Active users</span>
                  <span className="font-medium">{keStatus?.activeUsersThisMonth ?? "—"}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>
                    Everything members do across the platform — login, uploads, scoring, folders, profile edits, and more.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={activityActionFilter}
                    onValueChange={(v) => { setActivityActionFilter(v); setActivityPage(1); }}
                  >
                    <SelectTrigger className="w-[180px] h-9" data-testid="select-activity-action">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={activitySinceFilter}
                    onValueChange={(v) => { setActivitySinceFilter(v); setActivityPage(1); }}
                  >
                    <SelectTrigger className="w-[130px] h-9" data-testid="select-activity-since">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All time</SelectItem>
                      <SelectItem value="24h">Last 24h</SelectItem>
                      <SelectItem value="7d">Last 7 days</SelectItem>
                      <SelectItem value="30d">Last 30 days</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => fetchActivityFeed()}
                    title="Refresh"
                    data-testid="button-refresh-activity"
                  >
                    <RefreshCw className={cn("h-4 w-4", activityLoading && "animate-spin")} />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : activityFeed.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No activity matches the current filters.
                </div>
              ) : (
                <div className="divide-y">
                  {activityFeed.map((item) => {
                    const { Icon, tone } = getActionVisual(item.actionType);
                    const userName = item.user.displayName
                      || [item.user.firstName, item.user.lastName].filter(Boolean).join(" ").trim()
                      || item.user.email?.split("@")[0]
                      || "Unknown user";
                    return (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                        data-testid={`activity-item-${item.id}`}
                      >
                        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted", tone)}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <button
                              type="button"
                              className="font-medium text-sm hover:underline"
                              onClick={() => handleUserClick(item.user.id)}
                              data-testid={`button-activity-user-${item.id}`}
                            >
                              {userName}
                            </button>
                            <span className="text-sm text-muted-foreground truncate">{item.actionLabel}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                            <span title={format(new Date(item.createdAt), "MMM d, yyyy h:mm:ss a")}>
                              {formatRelativeTime(item.createdAt)}
                            </span>
                            {item.user.email && <span className="truncate">{item.user.email}</span>}
                            {item.ip && <span className="font-mono">{item.ip}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activityTotal > 0 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Page {activityPage} of {activityTotalPages} · {activityTotal.toLocaleString()} {activityTotal === 1 ? "event" : "events"}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                      disabled={activityPage <= 1 || activityLoading}
                      data-testid="button-activity-prev"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setActivityPage((p) => Math.min(activityTotalPages, p + 1))}
                      disabled={activityPage >= activityTotalPages || activityLoading}
                      data-testid="button-activity-next"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>View and manage all registered users</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-9"
                    data-testid="input-search-users"
                  />
                </div>
                <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[130px]" data-testid="select-role-filter">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[130px]" data-testid="select-status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={membershipFilter} onValueChange={(v) => { setMembershipFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[150px]" data-testid="select-membership-filter">
                    <SelectValue placeholder="Membership" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Memberships</SelectItem>
                    <SelectItem value="enrolled">Enrolled</SelectItem>
                    <SelectItem value="revoked">Revoked</SelectItem>
                    <SelectItem value="never">Never enrolled</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[140px]" data-testid="select-sort">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="last_login">Last Login</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {usersLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Membership</TableHead>
                          <TableHead className="text-center">Scores</TableHead>
                          <TableHead className="text-center">KW Credits</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                              No users found
                            </TableCell>
                          </TableRow>
                        ) : (
                          users.map((u) => (
                            <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{getUserDisplayName(u)}</div>
                                  <div className="text-sm text-muted-foreground">{u.email || "No email"}</div>
                                </div>
                              </TableCell>
                              <TableCell>
                                {u.isAdmin ? (
                                  <Badge className="bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700">
                                    Admin
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-700">
                                    User
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {u.cfEnrolled ? (
                                  <Badge variant="outline" className="text-green-600 border-green-300 dark:text-green-400 gap-1" title={u.cfEnrolledAt ? `Enrolled ${format(new Date(u.cfEnrolledAt), "MMM d, yyyy")}` : undefined}>
                                    <UserCheck className="h-3 w-3" />
                                    Enrolled
                                  </Badge>
                                ) : u.cfRevokedAt ? (
                                  <Badge variant="outline" className="text-red-600 border-red-300 dark:text-red-400 gap-1" title={`Revoked ${format(new Date(u.cfRevokedAt), "MMM d, yyyy")}`}>
                                    <UserX className="h-3 w-3" />
                                    Revoked
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-muted-foreground gap-1">
                                    <UserMinus className="h-3 w-3" />
                                    Never
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-center font-medium">
                                {u.totalVideos || 0}
                              </TableCell>
                              <TableCell className="text-center text-sm font-medium">
                                {u.keywordsCreditsThisMonth || 0}/{u.keywordsCreditsTotalUsed || 0}
                              </TableCell>
                              <TableCell>
                                {u.isDisabled ? (
                                  <Badge variant="destructive">Disabled</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-green-600 border-green-600">Active</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-end gap-1">
                                  {u.cfEnrolled ? (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Revoke ClickFunnels access"
                                      onClick={() => setConfirmDialog({
                                        open: true,
                                        title: "Revoke CF Access",
                                        description: `Remove ClickFunnels access for ${u.email}?`,
                                        action: () => handleToggleCfAccess(u.id, false),
                                      })}
                                      disabled={actionLoading === `cf-${u.id}`}
                                      data-testid={`button-revoke-cf-${u.id}`}
                                    >
                                      {actionLoading === `cf-${u.id}` ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <ShieldOff className="h-4 w-4 text-red-500" />
                                      )}
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      title="Grant ClickFunnels access"
                                      onClick={() => setConfirmDialog({
                                        open: true,
                                        title: "Grant CF Access",
                                        description: `Grant ClickFunnels enrollment access to ${u.email}?`,
                                        action: () => handleToggleCfAccess(u.id, true),
                                      })}
                                      disabled={actionLoading === `cf-${u.id}`}
                                      data-testid={`button-grant-cf-${u.id}`}
                                    >
                                      {actionLoading === `cf-${u.id}` ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Shield className="h-4 w-4 text-green-600" />
                                      )}
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleActionsClick(u)}
                                    title="View action history"
                                    data-testid={`button-actions-user-${u.id}`}
                                  >
                                    <Info className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleUserClick(u.id)}
                                    title="View user details"
                                    data-testid={`button-view-user-${u.id}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Showing {users.length} of {totalUsers} users
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">
                        Page {currentPage} of {totalPages || 1}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                        data-testid="button-next-page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${keStatus?.apiConfigured ? "bg-green-100 dark:bg-green-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}>
                  <Search className={`h-5 w-5 ${keStatus?.apiConfigured ? "text-green-600 dark:text-green-500" : "text-amber-600 dark:text-amber-500"}`} />
                </div>
                <div>
                  <CardTitle>Keywords Everywhere</CardTitle>
                  <CardDescription>
                    API credits and user usage for Video Trends feature
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Monthly Credit Limit Setting */}
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium">Monthly Credits Per User</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      How many Keywords Everywhere credits each user gets per 30-day window. Applies immediately to all users.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={1000000}
                      value={creditLimitInput}
                      onChange={(e) => setCreditLimitInput(e.target.value)}
                      className="w-28 text-sm border rounded-md px-3 py-1.5 bg-background text-right font-mono"
                      data-testid="input-credit-limit"
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveCreditLimit}
                      disabled={creditLimitSaving}
                      data-testid="button-save-credit-limit"
                    >
                      {creditLimitSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                    </Button>
                  </div>
                </div>
              </div>

              {keStatusLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : keStatus ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">API Credits Remaining</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {keStatus.accountCredits !== null ? (
                          <div className="text-2xl font-bold" data-testid="stat-ke-credits">
                            {keStatus.accountCredits.toLocaleString()}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            {keStatus.accountError || "Not configured"}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Used (Active Windows)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold" data-testid="stat-ke-monthly">
                          {keStatus.totalCreditsUsedThisMonth.toLocaleString()}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Used All Time</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold" data-testid="stat-ke-alltime">
                          {keStatus.totalCreditsUsedAllTime.toLocaleString()}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold" data-testid="stat-ke-active-users">
                          {keStatus.activeUsersThisMonth}
                        </div>
                        <p className="text-xs text-muted-foreground">With active 30-day window</p>
                      </CardContent>
                    </Card>
                  </div>

                  {keStatus.topUsers.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-4">Top Users by Credit Usage</h3>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead className="text-right">Active Window</TableHead>
                            <TableHead className="text-right">All Time</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {keStatus.topUsers.map((u) => (
                            <TableRow key={u.userId} data-testid={`ke-user-row-${u.userId}`}>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{u.displayName || "Unknown"}</p>
                                  <p className="text-sm text-muted-foreground">{u.email || "-"}</p>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">{u.creditsThisMonth.toLocaleString()}</TableCell>
                              <TableCell className="text-right">{u.creditsTotal.toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {!keStatus.apiConfigured && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/50">
                      <div className="flex gap-3">
                        <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500" />
                        <div className="text-sm">
                          <p className="font-medium text-amber-800 dark:text-amber-200">API Not Configured</p>
                          <p className="mt-1 text-amber-700 dark:text-amber-300">
                            Set KEYWORDS_EVERYWHERE_API_KEY in environment to enable Video Trends.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Failed to load Keywords Everywhere status
                </div>
              )}
            </CardContent>
          </Card>

          {/* KE API Key + System Status */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Keywords Everywhere Personal API Key */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Keywords Everywhere API Key
                </CardTitle>
                <CardDescription>
                  Personal API key for keyword search volume, CPC, and competition data.{" "}
                  <a
                    href="https://keywordseverywhere.com/ke/pricing.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                    data-testid="link-ke-pricing"
                  >
                    Get a key
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {keApiKeyDataLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading...
                  </div>
                ) : keApiKeyData?.configured ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Key className="h-5 w-5 text-green-500" />
                        <div>
                          <p className="font-medium">API Key Configured</p>
                          <p className="text-sm text-muted-foreground">Ending in ...{keApiKeyData.keyLastFour}</p>
                        </div>
                      </div>
                      <Badge variant="default" className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Active
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteKeApiKeyMutation.mutate()}
                      disabled={deleteKeApiKeyMutation.isPending || saveKeApiKeyMutation.isPending}
                      data-testid="button-delete-ke-api-key"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {deleteKeApiKeyMutation.isPending ? "Removing..." : "Remove Key"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Key className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">No API Key Configured</p>
                          <p className="text-sm text-muted-foreground">Add your key to enable keyword metrics</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <XCircle className="h-3 w-3" />
                        Not Set
                      </Badge>
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={keApiKeyShowInput ? "text" : "password"}
                          placeholder="Enter your Keywords Everywhere API key"
                          value={keApiKeyInput}
                          onChange={(e) => setKeApiKeyInput(e.target.value)}
                          disabled={saveKeApiKeyMutation.isPending}
                          className="pr-10"
                          data-testid="input-ke-api-key"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full"
                          onClick={() => setKeApiKeyShowInput(!keApiKeyShowInput)}
                          disabled={saveKeApiKeyMutation.isPending}
                          data-testid="button-ke-toggle-visibility"
                        >
                          {keApiKeyShowInput ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <Button
                        onClick={handleSaveKeApiKey}
                        disabled={saveKeApiKeyMutation.isPending || !keApiKeyInput.trim()}
                        data-testid="button-save-ke-api-key"
                      >
                        {saveKeApiKeyMutation.isPending ? "Saving..." : "Save Key"}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* System API Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  System API Status
                </CardTitle>
                <CardDescription>
                  Services powering Video Trends. Keys are managed via environment variables.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Youtube className="h-5 w-5 text-red-500" />
                    <div>
                      <p className="font-medium">YouTube Data API</p>
                      <p className="text-sm text-muted-foreground">Enhanced topic metrics</p>
                    </div>
                  </div>
                  {topicApiStatus?.youtube ? (
                    <Badge variant="default" className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <XCircle className="h-3 w-3" />
                      Optional
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-5 flex items-center justify-center text-green-500 font-bold text-xs">AI</div>
                    <div>
                      <p className="font-medium">OpenAI API</p>
                      <p className="text-sm text-muted-foreground">Script generation</p>
                    </div>
                  </div>
                  {topicApiStatus?.openai ? (
                    <Badge variant="default" className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <XCircle className="h-3 w-3" />
                      Required
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-5 w-5 text-orange-500" />
                    <div>
                      <p className="font-medium">Reddit API</p>
                      <p className="text-sm text-muted-foreground">Community question mining</p>
                    </div>
                  </div>
                  {topicApiStatus?.reddit ? (
                    <Badge variant="default" className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="flex items-center gap-1">
                      <XCircle className="h-3 w-3" />
                      Optional
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <CfIntegrationTab />
        </TabsContent>

      </Tabs>

      {/* Session Detail Sheet */}
      <Sheet open={!!selectedSessionId} onOpenChange={(open) => !open && setSelectedSessionId(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Session Details</SheetTitle>
            <SheetDescription>
              View session recording, scores, and feedback
            </SheetDescription>
          </SheetHeader>
          
          {sessionDetailLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sessionDetail ? (
            <div className="mt-6 space-y-6">
              {/* Header Info */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">{sessionDetail.session.title || "Practice Session"}</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">User:</span>
                    <span>{sessionDetail.user.displayName || sessionDetail.user.email || "Unknown"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email:</span>
                    <span>{sessionDetail.user.email || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created:</span>
                    <span>{format(new Date(sessionDetail.session.createdAt), "MMM d, yyyy 'at' h:mm a")}</span>
                  </div>
                  {sessionDetail.session.expiresAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expires:</span>
                      <span>{format(new Date(sessionDetail.session.expiresAt), "MMM d, yyyy 'at' h:mm a")}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    {sessionDetail.session.status === "available" ? (
                      <Badge variant="outline" className="text-green-600 border-green-600">Available</Badge>
                    ) : (
                      <Badge variant="destructive">Expired</Badge>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Goal Type:</span>
                    <Badge variant="secondary">{sessionDetail.session.goalType}</Badge>
                  </div>
                </div>
              </div>

              {/* Video Player */}
              <div className="space-y-3">
                <h3 className="font-semibold">Recording</h3>
                {sessionDetail.session.videoUrl && sessionDetail.session.status === "available" ? (
                  <video
                    src={sessionDetail.session.videoUrl}
                    controls
                    className="w-full rounded-lg bg-black aspect-video"
                    data-testid="admin-session-video"
                  />
                ) : (
                  <div className="flex items-center justify-center rounded-lg bg-muted aspect-video">
                    <div className="text-center text-muted-foreground">
                      <Video className="mx-auto h-12 w-12 mb-2" />
                      <p className="font-medium">Video {sessionDetail.session.status === "expired" ? "Expired" : "Unavailable"}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Score Summary */}
              {sessionDetail.session.score && (
                <div className="space-y-3">
                  <h3 className="font-semibold">Score Summary</h3>
                  <div className="flex items-center gap-4">
                    <div className="relative h-20 w-20">
                      <svg className="h-20 w-20 -rotate-90">
                        <circle
                          className="text-muted"
                          strokeWidth="6"
                          stroke="currentColor"
                          fill="transparent"
                          r={32}
                          cx={40}
                          cy={40}
                        />
                        <circle
                          className={sessionDetail.session.score.total >= 70 ? "text-green-500" : sessionDetail.session.score.total >= 40 ? "text-yellow-500" : "text-red-500"}
                          strokeWidth="6"
                          strokeDasharray={2 * Math.PI * 32}
                          strokeDashoffset={2 * Math.PI * 32 - (sessionDetail.session.score.total / 100) * 2 * Math.PI * 32}
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="transparent"
                          r={32}
                          cx={40}
                          cy={40}
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-lg font-bold">
                        {sessionDetail.session.score.total}
                      </span>
                    </div>
                    <div className="flex-1 text-sm text-muted-foreground">
                      Overall Score: {sessionDetail.session.score.total}/100
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    {[
                      { key: "hook", label: "Hook", score: sessionDetail.session.score.breakdown.hook },
                      { key: "setHook", label: "Set the Hook", score: sessionDetail.session.score.breakdown.setHook },
                      { key: "firstCTA", label: "First Call to Action", score: sessionDetail.session.score.breakdown.firstCTA },
                      { key: "content", label: "Content", score: sessionDetail.session.score.breakdown.content },
                      { key: "finalCTA", label: "Final Call to Action", score: sessionDetail.session.score.breakdown.finalCTA },
                    ].map((part) => (
                      <div key={part.key} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{part.label}</span>
                          <span className="font-medium">{part.score}/20</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div 
                            className={part.score >= 14 ? "bg-green-500" : part.score >= 8 ? "bg-yellow-500" : "bg-red-500"} 
                            style={{ width: `${(part.score / 20) * 100}%`, height: "100%" }} 
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Transcript */}
              <div className="space-y-3">
                <h3 className="font-semibold">Transcript</h3>
                {sessionDetail.session.transcriptText ? (
                  <div className="rounded-lg bg-muted p-4 text-sm max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {sessionDetail.session.transcriptText}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Transcript not available</p>
                )}
              </div>

              {/* Recommendations */}
              {sessionDetail.session.recommendationsJson && (
                <div className="space-y-3">
                  <h3 className="font-semibold">AI Feedback</h3>
                  
                  {/* Strengths */}
                  {sessionDetail.session.recommendationsJson.summary?.strengths?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-green-600 dark:text-green-400 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        Strengths
                      </p>
                      <ul className="space-y-1 pl-6 text-sm text-muted-foreground">
                        {sessionDetail.session.recommendationsJson.summary.strengths.map((s, i) => (
                          <li key={i} className="list-disc">{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Areas to Improve */}
                  {sessionDetail.session.recommendationsJson.summary?.topImprovements?.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-amber-600 dark:text-amber-400 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Areas to Improve
                      </p>
                      <ul className="space-y-1 pl-6 text-sm text-muted-foreground">
                        {sessionDetail.session.recommendationsJson.summary.topImprovements.map((s, i) => (
                          <li key={i} className="list-disc">{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Delivery Stats */}
                  {sessionDetail.session.recommendationsJson.delivery && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Delivery Analysis</p>
                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                        <div>Words per minute: {sessionDetail.session.recommendationsJson.delivery.wordsPerMinute ?? "-"}</div>
                        <div>Filler words: {sessionDetail.session.recommendationsJson.delivery.fillerWords?.count ?? 0}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Metadata */}
              <div className="space-y-3 border-t pt-4">
                <h3 className="font-semibold text-sm text-muted-foreground">Session Metadata</h3>
                <div className="space-y-1 text-xs text-muted-foreground font-mono">
                  <div>Session ID: {sessionDetail.session.id}</div>
                  {sessionDetail.session.fileMeta?.durationSeconds > 0 && (
                    <div>Duration: {Math.floor(sessionDetail.session.fileMeta.durationSeconds / 60)}:{String(sessionDetail.session.fileMeta.durationSeconds % 60).padStart(2, "0")}</div>
                  )}
                  {sessionDetail.session.fileMeta?.sizeBytes > 0 && (
                    <div>File size: {(sessionDetail.session.fileMeta.sizeBytes / 1024 / 1024).toFixed(2)} MB</div>
                  )}
                  {sessionDetail.session.fileMeta?.format && (
                    <div>Format: {sessionDetail.session.fileMeta.format}</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-muted-foreground">Session not found</p>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!selectedUserId} onOpenChange={(open) => !open && setSelectedUserId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>User Details</SheetTitle>
            <SheetDescription>
              View and manage user account
            </SheetDescription>
          </SheetHeader>
          
          {userDetailsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : userDetails ? (
            <div className="mt-6 space-y-6">
              <div className="space-y-3">
                <h3 className="font-semibold">Basic Info</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">User ID:</span>
                    <span className="font-mono text-xs">{userDetails.user.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Display Name:</span>
                    <span>{userDetails.user.displayName || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">First Name:</span>
                    <span>{userDetails.user.firstName || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Name:</span>
                    <span>{userDetails.user.lastName || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email:</span>
                    <span>{userDetails.user.email || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Role:</span>
                    <Badge variant={userDetails.user.isAdmin ? "default" : "secondary"}>
                      {userDetails.user.isAdmin ? "Admin" : "User"}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    {userDetails.user.isDisabled ? (
                      <Badge variant="destructive">Disabled</Badge>
                    ) : (
                      <Badge variant="outline" className="text-green-600 border-green-600">Active</Badge>
                    )}
                  </div>
                  {userDetails.user.disabledReason && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Disabled Reason:</span>
                      <span>{userDetails.user.disabledReason}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold">Auth Identities</h3>
                <div className="space-y-2">
                  {userDetails.hasLocalPassword && (
                    <div className="flex items-center justify-between rounded-lg border p-2">
                      <span className="text-sm">Email/Password</span>
                      <Badge variant="outline">Local</Badge>
                    </div>
                  )}
                  {userDetails.identities.map((id) => (
                    <div key={id.id} className="flex items-center justify-between rounded-lg border p-2">
                      <div className="text-sm">
                        <div>{id.provider.charAt(0).toUpperCase() + id.provider.slice(1)}</div>
                        <div className="text-xs text-muted-foreground">{id.emailFromProvider || id.providerUserId}</div>
                      </div>
                      <Badge variant="outline">{format(new Date(id.createdAt), "MMM d, yyyy")}</Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold">Consent & Marketing</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email Consent:</span>
                    <span>{userDetails.user.emailConsentAt ? format(new Date(userDetails.user.emailConsentAt), "MMM d, yyyy") : "No"}</span>
                  </div>

                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold">Sessions ({userDetails.sessionCount})</h3>
                {userDetails.sessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sessions yet</p>
                ) : (
                  <div className="space-y-2">
                    {userDetails.sessions.slice(0, 5).map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                        <div>
                          <div>{s.title || "Untitled"}</div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(s.createdAt), "MMM d, yyyy")}
                          </div>
                        </div>
                        <div className="text-right">
                          <div>{s.scoreJson?.totalScore ? `${s.scoreJson.totalScore}/100` : "-"}</div>
                          <div className="text-xs text-muted-foreground">
                            {s.videoDeletedAt ? "Expired" : "Available"}
                          </div>
                        </div>
                      </div>
                    ))}
                    {userDetails.sessionCount > 5 && (
                      <p className="text-sm text-muted-foreground">
                        ...and {userDetails.sessionCount - 5} more
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t pt-4">
                <h3 className="font-semibold">Admin Actions</h3>
                <div className="flex flex-wrap gap-2">
                  {userDetails.user.isAdmin ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDialog({
                        open: true,
                        title: "Demote to User",
                        description: "Are you sure you want to remove admin privileges from this user?",
                        action: () => handleUpdateUserRole(userDetails.user.id, "user"),
                      })}
                      disabled={actionLoading?.startsWith("role")}
                      data-testid="button-demote-user"
                    >
                      <ShieldOff className="mr-2 h-4 w-4" />
                      Demote to User
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDialog({
                        open: true,
                        title: "Promote to Admin",
                        description: "Are you sure you want to grant admin privileges to this user?",
                        action: () => handleUpdateUserRole(userDetails.user.id, "admin"),
                      })}
                      disabled={actionLoading?.startsWith("role")}
                      data-testid="button-promote-user"
                    >
                      <Shield className="mr-2 h-4 w-4" />
                      Promote to Admin
                    </Button>
                  )}
                  
                  {userDetails.user.isDisabled ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDialog({
                        open: true,
                        title: "Enable User",
                        description: "Are you sure you want to re-enable this user account?",
                        action: () => handleToggleDisabled(userDetails.user.id, false),
                      })}
                      disabled={actionLoading?.startsWith("disable")}
                      data-testid="button-enable-user"
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Enable Account
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDialog({
                        open: true,
                        title: "Disable User",
                        description: "Are you sure you want to disable this user account? They will not be able to log in.",
                        action: () => handleToggleDisabled(userDetails.user.id, true, "Disabled by admin"),
                      })}
                      disabled={actionLoading?.startsWith("disable")}
                      data-testid="button-disable-user"
                    >
                      <Ban className="mr-2 h-4 w-4" />
                      Disable Account
                    </Button>
                  )}
                  
                  {userDetails.user.cfEnrolled ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDialog({
                        open: true,
                        title: "Revoke CF Access",
                        description: "This will revoke the user's ClickFunnels enrollment access. They will still be able to log in but won't be counted as enrolled.",
                        action: () => handleToggleCfAccess(userDetails.user.id, false),
                      })}
                      disabled={actionLoading?.startsWith("cf")}
                      data-testid="button-revoke-cf-access"
                    >
                      <ShieldOff className="mr-2 h-4 w-4" />
                      Revoke CF Access
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDialog({
                        open: true,
                        title: "Grant CF Access",
                        description: "Manually grant this user ClickFunnels enrollment access.",
                        action: () => handleToggleCfAccess(userDetails.user.id, true),
                      })}
                      disabled={actionLoading?.startsWith("cf")}
                      data-testid="button-grant-cf-access"
                    >
                      <Shield className="mr-2 h-4 w-4" />
                      Grant CF Access
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDialog({
                      open: true,
                      title: "Force Logout",
                      description: "This will terminate all active sessions for this user. They will need to log in again.",
                      action: () => handleForceLogout(userDetails.user.id),
                    })}
                    disabled={actionLoading?.startsWith("logout")}
                    data-testid="button-force-logout"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Force Logout
                  </Button>
                  

                </div>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-muted-foreground">User not found</p>
          )}
        </SheetContent>
      </Sheet>

      {/* User Actions History Sheet */}
      <Sheet open={!!actionsUserId} onOpenChange={(open) => !open && setActionsUserId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Action History</SheetTitle>
            <SheetDescription>
              {actionsUser ? (
                <span>Activity log for {actionsUser.displayName || actionsUser.email || "Unknown User"}</span>
              ) : (
                <span>View user action history</span>
              )}
            </SheetDescription>
          </SheetHeader>

          {actionsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : userActions.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No actions recorded for this user</p>
          ) : (
            <div className="mt-6 space-y-4">
              {userActions.map((action) => (
                <div 
                  key={action.id} 
                  className="flex items-start gap-3 border-b pb-3 last:border-b-0"
                  data-testid={`action-item-${action.id}`}
                >
                  <div className="mt-0.5">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{action.actionLabel}</span>
                      <Badge variant="outline" className="text-xs">
                        {action.actionType.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    {action.entityType && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {action.entityType}: {action.entityId?.slice(0, 8)}...
                      </div>
                    )}
                    {action.metadata && Object.keys(action.metadata).length > 0 && (
                      <div className="text-xs text-muted-foreground mt-1 font-mono bg-muted rounded px-2 py-1 overflow-x-auto">
                        {JSON.stringify(action.metadata)}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {format(new Date(action.createdAt), "MMM d, yyyy 'at' h:mm a")}
                    </div>
                  </div>
                </div>
              ))}
              
              {actionsNextCursor && (
                <div className="pt-4 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => actionsUserId && fetchUserActions(actionsUserId, actionsNextCursor)}
                    disabled={actionsLoadingMore}
                    data-testid="button-load-more-actions"
                  >
                    {actionsLoadingMore ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      "Load More"
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDialog?.open} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (confirmDialog?.action) {
                  await confirmDialog.action();
                }
                setConfirmDialog(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
