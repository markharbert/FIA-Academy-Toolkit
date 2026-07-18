import { useEffect, useState, useCallback, useRef } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { 
  Loader2, CheckCircle, AlertCircle,
  Users, ChevronLeft, ChevronRight, ChevronUp, Shield, ShieldOff, Ban, Video,
  CheckCircle2, LogOut, LogIn, RefreshCw, Search, Mail, Eye, EyeOff, Info, Clock,
  Copy, ExternalLink, Webhook, UserCheck, UserX, UserMinus, Filter, Zap,
  Key, Youtube, MessageSquare, XCircle, Trash2, Bug, Lightbulb, X,
  Upload, FolderPlus, FolderEdit, FolderMinus, FilePenLine, FileVideo,
  CircleAlert, RotateCw, UserCog, Activity, Workflow, Send, Plus, Pencil, Link, Smartphone, Megaphone, GripVertical,
  Bell, AlertTriangle, Star, Gift, Rocket, Sparkles, PartyPopper, Trophy, Heart, Flame, Tag, Calendar,

  type LucideIcon,
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
  projectCount: number;
  taskCount: number;
  tasksDoneCount: number;
  dmoLast30Days: number;
  cfEnrolled: boolean | null;
  cfEnrolledAt: string | null;
  cfRevokedAt: string | null;
  cfContactId?: string | null;
  role?: string | null;
  themePreference?: string | null;
  emailVerifiedAt?: string | null;
}

interface UserAction {
  id: string;
  actionType: string;
  actionLabel: string;
  entityType: string | null;
  entityId: string | null;
  metadata?: Record<string, any> | null;
  metadataJson?: Record<string, any> | null;
  createdAt: string;
  ip?: string | null;
  userAgent?: string | null;
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

function EmailSenderCard() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ fromName: string; fromEmail: string }>({
    queryKey: ["/api/admin/settings/email-sender"],
  });
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [edited, setEdited] = useState(false);

  useEffect(() => {
    if (data && !edited) {
      setNameInput(data.fromName);
      setEmailInput(data.fromEmail);
    }
  }, [data, edited]);

  const save = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/admin/settings/email-sender", {
        fromName: nameInput.trim(),
        fromEmail: emailInput.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/email-sender"] });
      setEdited(false);
      toast({ title: "Email sender settings saved" });
    },
    onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
  });

  return (
    <Card data-testid="card-email-sender">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <div>
            <CardTitle className="text-base">Notification Email Sender</CardTitle>
            <CardDescription className="text-sm mt-0.5">
              The "From" name and address that appears in all notification emails sent by the app.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">From name</label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => { setNameInput(e.target.value); setEdited(true); }}
                  placeholder="Fearless Marketing Lab"
                  className="w-full text-sm border rounded-md px-3 py-2 bg-background"
                  data-testid="input-email-from-name"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">From email</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => { setEmailInput(e.target.value); setEdited(true); }}
                  placeholder="notifications@fearlesspromo.com"
                  className="w-full text-sm border rounded-md px-3 py-2 bg-background"
                  data-testid="input-email-from-address"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => save.mutate()}
                disabled={save.isPending || !nameInput.trim() || !emailInput.trim()}
                data-testid="button-save-email-sender"
              >
                {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Save
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ApiAccessToggleCard() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/admin/settings/api-access"],
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("PUT", "/api/admin/settings/api-access", { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/api-access"] });
      toast({ title: "Setting saved" });
    },
    onError: () => toast({ title: "Failed to update setting", variant: "destructive" }),
  });

  return (
    <Card data-testid="card-api-access-toggle">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">API Access for Members</CardTitle>
              <CardDescription className="text-sm mt-0.5">
                When enabled, members can generate API keys from their Account page to use with the mobile / companion app.
              </CardDescription>
            </div>
          </div>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Switch
              checked={data?.enabled ?? false}
              onCheckedChange={(v) => toggle.mutate(v)}
              disabled={toggle.isPending}
              data-testid="toggle-api-access"
            />
          )}
        </div>
      </CardHeader>
    </Card>
  );
}


function ImportAllMembersButton() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ message: string; created: number; contactIdUpdated: number; skipped: number; inactive: number; errors: number } | null>(null);

  const handleImport = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/cf/import-all-members", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Import failed");
      setResult(data);
      toast({ title: "Import complete", description: data.message });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={handleImport} disabled={running} data-testid="button-import-all-members">
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Users className="h-3.5 w-3.5 mr-2" />}
        {running ? "Importing… (this may take a minute)" : "Import All Members from ClickFunnels"}
      </Button>
      {result && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-1">
          <p className="font-medium">{result.message}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
            {result.created > 0 && <span className="text-green-700 dark:text-green-400">✓ {result.created} new accounts created</span>}
            {result.contactIdUpdated > 0 && <span className="text-blue-700 dark:text-blue-400">✓ {result.contactIdUpdated} contact IDs updated</span>}
            {result.skipped > 0 && <span>{result.skipped} already up-to-date</span>}
            {result.inactive > 0 && <span>{result.inactive} inactive/revoked skipped</span>}
            {result.errors > 0 && <span className="text-destructive">{result.errors} errors</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function SyncContactIdsButton() {
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/cf/sync-contact-ids", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Sync failed");
      setResult(data.message);
      toast({ title: "Sync complete", description: data.message });
    } catch (err: any) {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} data-testid="button-sync-contact-ids">
        {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <RotateCw className="h-3.5 w-3.5 mr-2" />}
        {syncing ? "Syncing…" : "Sync Contact IDs from ClickFunnels"}
      </Button>
      {result && <p className="text-xs text-muted-foreground">{result}</p>}
    </div>
  );
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

  const [memberFilter, setMemberFilter] = useState<"enrolled" | "revoked" | "never">("enrolled");
  const { data: cfUsersData, isLoading: cfUsersLoading } = useQuery<{ users: CfUser[] }>({
    queryKey: [`/api/admin/cf/users?filter=${memberFilter}`],
  });
  const cfUsers = cfUsersData?.users ?? [];

  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<{ enrolled: boolean; contactId?: string | null; email?: string | null; error?: string } | null>(null);

  const handleLookup = async () => {
    if (!lookupEmail.trim()) return;
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const res = await fetch(`/api/admin/cf/test-lookup?email=${encodeURIComponent(lookupEmail.trim())}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      const er = data.enrollmentResult;
      setLookupResult({ enrolled: !!er?.enrolled, contactId: er?.contactId, email: er?.email, error: er?.error });
    } catch (err: any) {
      toast({ title: "Lookup failed", description: err.message, variant: "destructive" });
    } finally {
      setLookupLoading(false);
    }
  };

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

      {/* One-Click Login URL */}
      <Card className="overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-violet-500 to-indigo-400" />
        <CardHeader className="pt-4 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link className="h-4 w-4 text-violet-500" />
            ClickFunnels One-Click Login
          </CardTitle>
          <CardDescription>
            Paste this URL into any ClickFunnels button. CF automatically fills in each member's email address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted px-3 py-2.5 rounded font-mono break-all">
              {`${window.location.origin}/api/auth/cf-magic?email={{contact.email_address}}`}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy(`${window.location.origin}/api/auth/cf-magic?email={{contact.email_address}}`, "Login URL")}
              data-testid="button-copy-cf-login-url"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10">
                <Zap className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              Integration Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : cfStatus?.allConfigured ? (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Configured</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                <span className="font-semibold text-amber-600 dark:text-amber-400">Incomplete Setup</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-indigo-500 to-violet-400" />
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/10">
                <UserCheck className="h-3.5 w-3.5 text-indigo-500" />
              </div>
              Enrolled Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {statusLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : cfStatus?.enrolledCount ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Active CF access</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-rose-500 to-red-400" />
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-500/10">
                <UserX className="h-3.5 w-3.5 text-rose-500" />
              </div>
              Revoked / Cancelled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              {statusLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : cfStatus?.revokedCount ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Access removed</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Configuration Health */}
        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-violet-500 to-indigo-400" />
          <CardHeader className="pt-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4 text-violet-500" />
              Configuration Secrets
            </CardTitle>
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
        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
          <CardHeader className="pt-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Webhook className="h-4 w-4 text-emerald-500" />
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

      {/* Webhook Tester + CF Contact Lookup — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Webhook Tester */}
        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-amber-500 to-orange-400" />
          <CardHeader className="pt-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Webhook Tester
            </CardTitle>
            <CardDescription>
              Simulate a ClickFunnels event to verify your integration is working correctly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3">
              <input
                type="email"
                placeholder="user@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="flex-1 text-sm border rounded-md px-3 py-2 bg-background"
                data-testid="input-test-webhook-email"
              />
              <div className="flex gap-2">
                <select
                  value={testEvent}
                  onChange={(e) => setTestEvent(e.target.value)}
                  className="flex-1 text-sm border rounded-md px-3 py-2 bg-background"
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
            </div>

            {testResult && (
              <div className={`flex items-center gap-3 rounded-md border px-4 py-3 text-sm ${
                ["granted", "created"].includes(testResult.action) ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400" :
                testResult.action === "revoked" ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400" :
                "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
              }`} data-testid="text-test-webhook-result">
                {["granted", "created"].includes(testResult.action) && <UserCheck className="h-4 w-4 flex-shrink-0" />}
                {testResult.action === "revoked" && <UserX className="h-4 w-4 flex-shrink-0" />}
                {!["granted", "created", "revoked"].includes(testResult.action) && <AlertCircle className="h-4 w-4 flex-shrink-0" />}
                <div>
                  <span className="font-medium capitalize">{testResult.action.replace(/_/g, " ")}</span>
                  {testResult.email && <span className="ml-2 opacity-70">for {testResult.email}</span>}
                  {testResult.action === "created" && (
                    <p className="text-xs mt-0.5 opacity-70">New account auto-provisioned for this enrollee.</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* CF Contact Lookup */}
        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-sky-500 to-cyan-400" />
          <CardHeader className="pt-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4 text-sky-500" />
              CF Contact Lookup
            </CardTitle>
            <CardDescription>
              Check a member's enrollment status directly against the ClickFunnels API.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="user@example.com"
                value={lookupEmail}
                onChange={(e) => setLookupEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                className="flex-1 text-sm border rounded-md px-3 py-2 bg-background"
                data-testid="input-cf-lookup-email"
              />
              <Button onClick={handleLookup} disabled={lookupLoading} size="sm" data-testid="button-cf-lookup">
                {lookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Look Up"}
              </Button>
            </div>
            {lookupResult && (
              <div className={`rounded-md border px-4 py-3 text-sm space-y-1 ${
                lookupResult.error ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30" :
                lookupResult.enrolled ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30" :
                "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
              }`} data-testid="text-cf-lookup-result">
                {lookupResult.error ? (
                  <p className="text-red-700 dark:text-red-400"><span className="font-medium">Error:</span> {lookupResult.error}</p>
                ) : (
                  <>
                    <p className={lookupResult.enrolled ? "text-green-700 dark:text-green-400 font-medium" : "text-amber-700 dark:text-amber-400 font-medium"}>
                      {lookupResult.enrolled ? "✓ Active enrollment found" : "✗ Not enrolled / not found"}
                    </p>
                    {lookupResult.contactId && <p className="text-muted-foreground text-xs">Contact ID: <code className="font-mono">{lookupResult.contactId}</code></p>}
                    {lookupResult.email && <p className="text-muted-foreground text-xs">Email: {lookupResult.email}</p>}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bulk Member Sync */}
        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
          <CardHeader className="pt-4 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-500" />
              Bulk Member Sync
            </CardTitle>
            <CardDescription>
              Pull every active CF enrollee into the Users tab at once — including members who haven't clicked the login link yet. Safe to run anytime; existing accounts are not overwritten.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ImportAllMembersButton />
          </CardContent>
        </Card>
      </div>


    </div>
  );
}

// ─── Email Templates Tab ─────────────────────────────────────────────────────

const EMAIL_TEMPLATES = [
  { key: "welcome", label: "Welcome", group: "General" },
  { key: "workspaceInvite", label: "Workspace collaborator invite", group: "General" },
  { key: "magicLink", label: "Magic link sign-in", group: "General" },
  { key: "taskDueReminders", label: "Task due reminders", group: "Projects & Tasks" },
  { key: "overdueAlerts", label: "Overdue task alerts", group: "Projects & Tasks" },
  { key: "projectDueReminders", label: "Project due reminders", group: "Projects & Tasks" },
  { key: "weeklyProjectDigest", label: "Weekly project digest", group: "Projects & Tasks" },
  { key: "dmoStreakAtRisk", label: "Streak at-risk reminder", group: "DMO" },
  { key: "dmoMilestone", label: "Streak milestone", group: "DMO" },
  { key: "dmoBroken", label: "Streak broken", group: "DMO" },
  { key: "weeklyDmoSummary", label: "Weekly DMO summary", group: "DMO" },
  { key: "videoScoringComplete", label: "Video scoring complete", group: "Video" },
  { key: "videoPracticeReminder", label: "Practice reminder", group: "Video" },
  { key: "reputationDropAlert", label: "Reputation drop alert", group: "Email Health" },
  { key: "weeklyInboxReport", label: "Weekly inbox report", group: "Email Health" },
  { key: "feedbackSubmittedFeature", label: "Feature request received", group: "Feedback" },
  { key: "feedbackSubmittedBug", label: "Bug report received (submitter)", group: "Feedback" },
  { key: "newBugAdminAlert", label: "Bug report alert (admin)", group: "Feedback" },
  { key: "feedbackCommentFeature", label: "Feature request comment", group: "Feedback" },
  { key: "feedbackCommentBug", label: "Bug report comment", group: "Feedback" },
  { key: "feedbackStatusChanged", label: "Status update notification", group: "Feedback" },
];

const EMAIL_TEMPLATE_GROUPS = ["General", "Projects & Tasks", "DMO", "Video", "Email Health", "Feedback"];

function EmailTemplatesTab() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedKey, setSelectedKey] = useState("welcome");
  const [isEditing, setIsEditing] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [htmlDraft, setHtmlDraft] = useState("");
  const [previewVersion, setPreviewVersion] = useState(0);

  // Visual editor state
  const [editorMode, setEditorMode] = useState<"visual" | "html">("visual");
  const [visualSrcdoc, setVisualSrcdoc] = useState("");
  const [visualFrameKey, setVisualFrameKey] = useState(0);
  const visualIframeRef = useRef<HTMLIFrameElement>(null);

  // Send-test dialog
  const [sendTestOpen, setSendTestOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendTestPending, setSendTestPending] = useState(false);

  // Main tab: templates or resources
  const [mainTab, setMainTab] = useState<"templates" | "resources">("templates");

  // Resource link dialog
  const [resDialogOpen, setResDialogOpen] = useState(false);
  const [editingRes, setEditingRes] = useState<{ id: string; description: string; url: string; anchorText: string; sortOrder: number; isActive: boolean } | null>(null);
  const [resDesc, setResDesc] = useState("");
  const [resUrl, setResUrl] = useState("");
  const [resAnchor, setResAnchor] = useState("");

  const { data: overridesData } = useQuery<{ overrides: Array<{ templateKey: string; subjectOverride: string | null; updatedAt: string }> }>({
    queryKey: ["/api/admin/email-templates"],
  });
  const overrideKeys = new Set((overridesData?.overrides ?? []).map((o) => o.templateKey));

  const { data: source, isLoading: sourceLoading } = useQuery<{
    subject: string; html: string; defaultSubject: string; defaultHtml: string; hasOverride: boolean;
  }>({
    queryKey: ["/api/admin/email-templates", selectedKey, "source"],
  });

  useEffect(() => {
    if (source) {
      setSubjectDraft(source.subject);
      setHtmlDraft(source.html);
    }
  }, [source, selectedKey]);

  // Extract current HTML from the visual iframe (or fall back to htmlDraft)
  function getIframeHtml(): string {
    const doc = visualIframeRef.current?.contentDocument;
    if (doc) return "<!DOCTYPE html>" + doc.documentElement.outerHTML;
    return htmlDraft;
  }

  function switchToHtml() {
    if (editorMode === "visual") setHtmlDraft(getIframeHtml());
    setEditorMode("html");
  }

  function switchToVisual() {
    const html = editorMode === "html" ? htmlDraft : visualSrcdoc;
    setVisualSrcdoc(html);
    setVisualFrameKey((k) => k + 1);
    setEditorMode("visual");
  }

  const saveMutation = useMutation({
    mutationFn: async ({ subject, html }: { subject: string; html: string }) => {
      const res = await apiRequest("PUT", `/api/admin/email-templates/${selectedKey}`, { subject, html });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-templates", selectedKey, "source"] });
      setPreviewVersion((v) => v + 1);
      setIsEditing(false);
      toast({ title: "Template saved" });
    },
    onError: () => toast({ title: "Failed to save template", variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/admin/email-templates/${selectedKey}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/email-templates", selectedKey, "source"] });
      setPreviewVersion((v) => v + 1);
      setIsEditing(false);
      toast({ title: "Template reset to default" });
    },
    onError: () => toast({ title: "Failed to reset template", variant: "destructive" }),
  });

  // Resource links queries + mutations
  type ResLink = { id: string; description: string; url: string; anchorText: string; sortOrder: number; isActive: boolean };
  const { data: resLinks = [], isLoading: resLoading } = useQuery<ResLink[]>({
    queryKey: ["/api/admin/email-resources"],
  });

  const createResMutation = useMutation({
    mutationFn: async (data: { description: string; url: string; anchorText: string; sortOrder: number }) => {
      const res = await apiRequest("POST", "/api/admin/email-resources", data);
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/email-resources"] }); setResDialogOpen(false); toast({ title: "Resource added" }); },
    onError: () => toast({ title: "Failed to add resource", variant: "destructive" }),
  });

  const updateResMutation = useMutation({
    mutationFn: async ({ id, ...data }: Partial<ResLink> & { id: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/email-resources/${id}`, data);
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/email-resources"] }); setResDialogOpen(false); toast({ title: "Resource updated" }); },
    onError: () => toast({ title: "Failed to update resource", variant: "destructive" }),
  });

  const deleteResMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/email-resources/${id}`);
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/email-resources"] }); toast({ title: "Resource deleted" }); },
    onError: () => toast({ title: "Failed to delete resource", variant: "destructive" }),
  });

  function openAddRes() {
    setEditingRes(null);
    setResDesc(""); setResUrl(""); setResAnchor("");
    setResDialogOpen(true);
  }

  function openEditRes(r: ResLink) {
    setEditingRes(r);
    setResDesc(r.description); setResUrl(r.url); setResAnchor(r.anchorText);
    setResDialogOpen(true);
  }

  function saveRes() {
    if (!resDesc.trim() || !resUrl.trim() || !resAnchor.trim()) return;
    if (editingRes) {
      updateResMutation.mutate({ id: editingRes.id, description: resDesc.trim(), url: resUrl.trim(), anchorText: resAnchor.trim() });
    } else {
      createResMutation.mutate({ description: resDesc.trim(), url: resUrl.trim(), anchorText: resAnchor.trim(), sortOrder: resLinks.length });
    }
  }

  const selectedTemplate = EMAIL_TEMPLATES.find((t) => t.key === selectedKey);
  const hasOverride = overrideKeys.has(selectedKey);

  function handleSave() {
    const html = editorMode === "visual" ? getIframeHtml() : htmlDraft;
    saveMutation.mutate({ subject: subjectDraft, html });
  }

  function openSendTestDialog() {
    setTestEmail(user?.email ?? "");
    setSendTestOpen(true);
  }

  async function sendTestEmail() {
    if (!testEmail.trim()) return;
    setSendTestPending(true);
    try {
      const res = await apiRequest("POST", `/api/admin/email-templates/${selectedKey}/send-test`, { email: testEmail.trim() });
      const data = await res.json();
      toast({ title: "Test email sent", description: `Delivered to ${data.to}` });
      setSendTestOpen(false);
    } catch {
      toast({ title: "Failed to send test email", variant: "destructive" });
    } finally {
      setSendTestPending(false);
    }
  }

  function selectTemplate(key: string) {
    setSelectedKey(key);
    setIsEditing(false);
  }

  function startEditing() {
    if (source) {
      setSubjectDraft(source.subject);
      setHtmlDraft(source.html);
      setVisualSrcdoc(source.html);
      setVisualFrameKey((k) => k + 1);
    }
    setEditorMode("visual");
    setIsEditing(true);
  }

  function restoreDefault() {
    if (source) {
      const h = source.defaultHtml;
      setSubjectDraft(source.defaultSubject);
      setHtmlDraft(h);
      setVisualSrcdoc(h);
      setVisualFrameKey((k) => k + 1);
    }
  }

  return (
    <>
      {/* ── Send-test dialog ── */}
      <Dialog open={sendTestOpen} onOpenChange={setSendTestOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send test email</DialogTitle>
            <DialogDescription>
              Send a copy of the <strong>{selectedTemplate?.label}</strong> template to any address.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Recipient email address</label>
            <Input
              type="email"
              placeholder="you@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendTestEmail()}
              autoFocus
              data-testid="input-test-email"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendTestOpen(false)}>Cancel</Button>
            <Button
              onClick={sendTestEmail}
              disabled={sendTestPending || !testEmail.trim()}
              data-testid="button-confirm-send-test"
            >
              {sendTestPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Resource add/edit dialog ── */}
      <Dialog open={resDialogOpen} onOpenChange={setResDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRes ? "Edit resource link" : "Add resource link"}</DialogTitle>
            <DialogDescription>
              This link will appear in the "Recommended Resources" section of every notification email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="e.g. Learn how to grow your practice fast"
                value={resDesc}
                onChange={(e) => setResDesc(e.target.value)}
                data-testid="input-res-description"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">URL</label>
              <Input
                placeholder="https://example.com/resource"
                value={resUrl}
                onChange={(e) => setResUrl(e.target.value)}
                data-testid="input-res-url"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Anchor text (link label)</label>
              <Input
                placeholder="e.g. Read the guide →"
                value={resAnchor}
                onChange={(e) => setResAnchor(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveRes()}
                data-testid="input-res-anchor"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={saveRes}
              disabled={!resDesc.trim() || !resUrl.trim() || !resAnchor.trim() || createResMutation.isPending || updateResMutation.isPending}
              data-testid="button-save-resource"
            >
              {(createResMutation.isPending || updateResMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingRes ? "Save changes" : "Add resource"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-teal-500 via-violet-500 to-indigo-400" />
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-teal-500" />
                Email Templates
              </CardTitle>
              <CardDescription className="mt-1">
                {mainTab === "templates"
                  ? "Preview and customise the notification emails sent to members. Edits take effect immediately for future sends."
                  : "Manage resource links that appear in every email below the main message."}
              </CardDescription>
            </div>
            <div className="flex rounded-md border overflow-hidden text-xs shrink-0">
              <button
                onClick={() => setMainTab("templates")}
                className={cn(
                  "px-3 py-1.5 font-medium transition-colors",
                  mainTab === "templates" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted text-muted-foreground"
                )}
                data-testid="tab-email-templates"
              >
                Templates
              </button>
              <button
                onClick={() => setMainTab("resources")}
                className={cn(
                  "px-3 py-1.5 font-medium transition-colors",
                  mainTab === "resources" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted text-muted-foreground"
                )}
                data-testid="tab-email-resources"
              >
                Resources
              </button>
            </div>
          </div>
        </CardHeader>

        {mainTab === "resources" ? (
          <div className="p-6" style={{ minHeight: "640px" }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                {resLinks.length === 0 ? "No resources yet." : `${resLinks.length} resource${resLinks.length !== 1 ? "s" : ""} — active ones appear in every email.`}
              </p>
              <Button size="sm" onClick={openAddRes} data-testid="button-add-resource">
                <Plus className="h-4 w-4 mr-1.5" />
                Add resource
              </Button>
            </div>

            {resLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : resLinks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
                <Link className="h-10 w-10 opacity-20" />
                <p className="text-sm">Add resource links to include them in all notification emails.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {resLinks.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                    data-testid={`resource-row-${r.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{r.description}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-primary font-medium truncate">{r.anchorText}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-muted-foreground hover:text-foreground truncate max-w-[260px]"
                          data-testid={`link-res-url-${r.id}`}
                        >
                          {r.url}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => updateResMutation.mutate({ id: r.id, isActive: !r.isActive })}
                        className={cn(
                          "text-[10px] font-bold px-2 py-1 rounded-full border transition-colors",
                          r.isActive
                            ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800"
                            : "bg-muted text-muted-foreground border-border"
                        )}
                        data-testid={`toggle-res-active-${r.id}`}
                      >
                        {r.isActive ? "Active" : "Inactive"}
                      </button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openEditRes(r)}
                        data-testid={`button-edit-res-${r.id}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteResMutation.mutate(r.id)}
                        disabled={deleteResMutation.isPending}
                        data-testid={`button-delete-res-${r.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
        <div className="flex" style={{ height: "860px" }}>
          {/* ── Sidebar ── */}
          <div className="w-72 shrink-0 border-r overflow-y-auto p-2 space-y-3">
            {EMAIL_TEMPLATE_GROUPS.map((group) => (
              <div key={group}>
                <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {group}
                </p>
                {EMAIL_TEMPLATES.filter((t) => t.group === group).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => selectTemplate(t.key)}
                    className={cn(
                      "w-full text-left px-2.5 py-1.5 rounded-md text-sm flex items-center justify-between gap-1 transition-colors",
                      selectedKey === t.key
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-foreground"
                    )}
                    data-testid={`btn-template-${t.key}`}
                  >
                    <span className="truncate">{t.label}</span>
                    {overrideKeys.has(t.key) && (
                      <span className={cn(
                        "shrink-0 text-[9px] font-bold px-1 py-0.5 rounded",
                        selectedKey === t.key
                          ? "bg-white/20 text-white"
                          : "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                      )}>
                        CUSTOM
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* ── Right panel ── */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/20 gap-3 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-sm truncate">{selectedTemplate?.label}</span>
                {hasOverride && !isEditing && (
                  <Badge variant="secondary" className="text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                    Custom
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isEditing ? (
                  <>
                    {source?.hasOverride && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs text-muted-foreground"
                        onClick={() => resetMutation.mutate()}
                        disabled={resetMutation.isPending}
                        data-testid="button-reset-template"
                      >
                        {resetMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        Reset to default
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={restoreDefault}
                      disabled={saveMutation.isPending}
                    >
                      Restore original text
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => setIsEditing(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="text-xs"
                      onClick={handleSave}
                      disabled={saveMutation.isPending}
                      data-testid="button-save-template"
                    >
                      {saveMutation.isPending && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                      Save template
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs"
                      onClick={() => setPreviewVersion((v) => v + 1)}
                      data-testid="button-refresh-preview"
                    >
                      <RefreshCw className="h-3 w-3 mr-1.5" />
                      Refresh
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={openSendTestDialog}
                      data-testid="button-send-test-email"
                    >
                      <Send className="h-3 w-3 mr-1.5" />
                      Send test email
                    </Button>
                    <Button
                      size="sm"
                      className="text-xs"
                      onClick={startEditing}
                      data-testid="button-edit-template"
                    >
                      Edit template
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Content area */}
            {isEditing ? (
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Subject + mode toggle */}
                <div className="px-4 py-3 border-b space-y-3 shrink-0 bg-background">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Subject line
                    </label>
                    <Input
                      value={subjectDraft}
                      onChange={(e) => setSubjectDraft(e.target.value)}
                      className="text-sm"
                      placeholder="Email subject"
                      data-testid="input-template-subject"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Body
                    </label>
                    <div className="flex rounded-md border overflow-hidden text-xs">
                      <button
                        onClick={switchToVisual}
                        className={cn(
                          "px-3 py-1.5 font-medium transition-colors",
                          editorMode === "visual"
                            ? "bg-primary text-primary-foreground"
                            : "bg-background hover:bg-muted text-muted-foreground"
                        )}
                        data-testid="button-editor-visual"
                      >
                        Visual
                      </button>
                      <button
                        onClick={switchToHtml}
                        className={cn(
                          "px-3 py-1.5 font-medium transition-colors border-l",
                          editorMode === "html"
                            ? "bg-primary text-primary-foreground"
                            : "bg-background hover:bg-muted text-muted-foreground"
                        )}
                        data-testid="button-editor-html"
                      >
                        HTML
                      </button>
                    </div>
                  </div>
                </div>

                {/* Editor body */}
                <div className="flex-1 overflow-hidden relative">
                  {editorMode === "visual" ? (
                    <>
                      <iframe
                        key={visualFrameKey}
                        ref={visualIframeRef}
                        srcDoc={visualSrcdoc}
                        className="absolute inset-0 w-full h-full border-0 bg-slate-100 dark:bg-slate-900"
                        title="Visual email editor"
                        onLoad={() => {
                          const doc = visualIframeRef.current?.contentDocument;
                          if (doc) {
                            doc.designMode = "on";
                            doc.body.style.outline = "none";
                          }
                        }}
                        data-testid="iframe-visual-editor"
                      />
                      <div className="absolute bottom-3 right-3 pointer-events-none">
                        <span className="text-[10px] bg-black/50 text-white px-2 py-1 rounded-full">
                          Click any text to edit
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 overflow-y-auto p-4">
                      <Textarea
                        value={htmlDraft}
                        onChange={(e) => setHtmlDraft(e.target.value)}
                        className="font-mono text-xs leading-relaxed resize-none w-full h-full min-h-[340px]"
                        spellCheck={false}
                        data-testid="textarea-template-html"
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        Edit the raw HTML. Switch to Visual to preview your changes.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 relative bg-slate-100 dark:bg-slate-900">
                {sourceLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <iframe
                    key={`${selectedKey}-${previewVersion}`}
                    src={`/api/admin/email-preview/${selectedKey}`}
                    className="absolute inset-0 w-full h-full border-0"
                    title={`Email preview: ${selectedTemplate?.label}`}
                    data-testid="iframe-template-preview"
                  />
                )}
              </div>
            )}
          </div>
        </div>
        )}
      </Card>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type AdminFeedbackPost = {
  id: string;
  userId: string;
  type: string;
  title: string;
  description: string;
  status: string;
  adminResponse: string | null;
  createdAt: string;
  updatedAt: string;
  voteCount: number;
  hasVoted: boolean;
  commentCount: number;
  userName: string;
  userEmail: string;
};

type AdminFeedbackDetail = AdminFeedbackPost & {
  comments: Array<{
    id: string;
    postId: string;
    userId: string;
    body: string;
    isAdminNote: boolean;
    createdAt: string;
    userName: string;
    userEmail: string;
  }>;
};

const FEEDBACK_STATUS_OPTIONS: Record<string, string[]> = {
  feature: ["open", "under_review", "planned", "in_progress", "completed", "closed"],
  bug: ["open", "under_review", "resolved", "closed"],
};

const FEEDBACK_STATUS_LABELS: Record<string, string> = {
  open: "Open",
  under_review: "Under Review",
  planned: "Planned",
  in_progress: "In Progress",
  completed: "Completed",
  resolved: "Resolved",
  closed: "Closed",
};

const FEEDBACK_STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  under_review: "bg-yellow-100 text-yellow-700",
  planned: "bg-purple-100 text-purple-700",
  in_progress: "bg-orange-100 text-orange-700",
  completed: "bg-green-100 text-green-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
};

function AdminFeedbackPostRow({
  post,
  onSelect,
}: {
  post: AdminFeedbackPost;
  onSelect: (p: AdminFeedbackPost) => void;
}) {
  return (
    <div
      className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
      onClick={() => onSelect(post)}
      data-testid={`admin-feedback-row-${post.id}`}
    >
      <div className="flex flex-col items-center justify-center w-12 shrink-0">
        {post.type === "feature" ? (
          <>
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-bold">{post.voteCount}</span>
          </>
        ) : (
          <Bug className="h-5 w-5 text-red-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{post.title}</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${FEEDBACK_STATUS_COLORS[post.status] ?? "bg-gray-100 text-gray-600"}`}>
            {FEEDBACK_STATUS_LABELS[post.status] ?? post.status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{post.description}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {post.userName} · {format(new Date(post.createdAt), "MMM d, yyyy")}
          {post.commentCount > 0 && ` · ${post.commentCount} comment${post.commentCount !== 1 ? "s" : ""}`}
        </p>
      </div>
    </div>
  );
}

function AdminFeedbackDetailPanel({
  postId,
  onClose,
}: {
  postId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState("");
  const [adminResponse, setAdminResponse] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [isAdminNote, setIsAdminNote] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const { data: post, isLoading } = useQuery<AdminFeedbackDetail>({
    queryKey: ["/api/feedback", postId],
    queryFn: () => fetch(`/api/feedback/${postId}`, { credentials: "include" }).then((r) => r.json()),
  });

  useEffect(() => {
    if (post) {
      setStatus(post.status);
      setAdminResponse(post.adminResponse ?? "");
    }
  }, [post?.id]);

  const updateMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/feedback/${postId}`, {
        status: status || post?.status,
        adminResponse: adminResponse || undefined,
      }),
    onSuccess: () => {
      toast({ title: "Updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feedback", postId] });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const commentMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/feedback/${postId}/comments`, { body: commentBody, isAdminNote }),
    onSuccess: () => {
      setCommentBody("");
      setIsAdminNote(false);
      queryClient.invalidateQueries({ queryKey: ["/api/feedback", postId] });
    },
    onError: () => toast({ title: "Failed to post comment", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/feedback/${postId}`),
    onSuccess: () => {
      toast({ title: "Deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
      onClose();
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  if (isLoading || !post) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusOptions = FEEDBACK_STATUS_OPTIONS[post.type] ?? ["open", "closed"];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-base">{post.title}</h3>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${FEEDBACK_STATUS_COLORS[post.status] ?? "bg-gray-100 text-gray-600"}`}>
              {FEEDBACK_STATUS_LABELS[post.status] ?? post.status}
            </span>
            <span className="text-xs text-muted-foreground">{post.type === "feature" ? "Feature Request" : "Bug Report"}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            By {post.userName} ({post.userEmail}) · {format(new Date(post.createdAt), "MMM d, yyyy 'at' h:mm a")}
            {post.type === "feature" && ` · ${post.voteCount} vote${post.voteCount !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-detail">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-sm whitespace-pre-wrap border rounded-lg p-3 bg-muted">{post.description}</p>

      {post.screenshotPath && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Attached Screenshot</p>
          <a
            href={`/api/feedback-screenshots/${post.screenshotPath.replace("feedback-screenshots/", "")}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-admin-screenshot"
          >
            <img
              src={`/api/feedback-screenshots/${post.screenshotPath.replace("feedback-screenshots/", "")}`}
              alt="Bug report screenshot"
              className="rounded-lg border max-h-72 object-contain cursor-pointer hover:opacity-90 transition-opacity"
            />
          </a>
        </div>
      )}

      <div className="space-y-3 border rounded-lg p-4">
        <p className="text-sm font-semibold">Admin Controls</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select
              value={status || post.status}
              onValueChange={setStatus}
            >
              <SelectTrigger className="h-8 text-sm" data-testid="select-feedback-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>{FEEDBACK_STATUS_LABELS[s] ?? s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Public Response (visible to submitter)</label>
          <Textarea
            value={adminResponse}
            onChange={(e) => setAdminResponse(e.target.value)}
            placeholder="Write an official response visible to the member..."
            className="min-h-[80px] text-sm"
            data-testid="input-admin-response"
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            data-testid="button-save-feedback"
          >
            {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Changes"}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={deleteMutation.isPending}
            data-testid="button-delete-feedback"
          >
            {deleteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Trash2 className="h-3.5 w-3.5 mr-1" />Delete</>}
          </Button>

          <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this post?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>"{post.title}"</strong> along with all its votes and comments. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate()}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-confirm-delete"
                >
                  Yes, delete it
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold">Comments ({post.comments.length})</p>
        {post.comments.length === 0 && (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        )}
        {post.comments.map((c) => (
          <div
            key={c.id}
            className={`rounded-lg p-3 text-sm ${c.isAdminNote ? "bg-yellow-50 border border-yellow-200" : "bg-muted"}`}
          >
            {c.isAdminNote && (
              <p className="text-xs font-semibold text-yellow-700 mb-1">Admin Note (private)</p>
            )}
            <p className="whitespace-pre-wrap">{c.body}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {c.userName} · {format(new Date(c.createdAt), "MMM d 'at' h:mm a")}
            </p>
          </div>
        ))}
        <div className="space-y-2">
          <Textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Post a comment..."
            className="min-h-[72px] text-sm"
            data-testid="input-admin-comment"
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={isAdminNote}
                onChange={(e) => setIsAdminNote(e.target.checked)}
                data-testid="checkbox-admin-note-panel"
              />
              Private admin note
            </label>
            <Button
              size="sm"
              onClick={() => commentMutation.mutate()}
              disabled={!commentBody.trim() || commentMutation.isPending}
              data-testid="button-post-admin-comment"
            >
              {commentMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Post"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminFeedbackTab() {
  const { toast } = useToast();
  const [feedbackType, setFeedbackType] = useState("feature");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  const { data: posts = [], isLoading } = useQuery<AdminFeedbackPost[]>({
    queryKey: ["/api/feedback", feedbackType, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ type: feedbackType });
      if (statusFilter !== "all") params.set("status", statusFilter);
      return fetch(`/api/feedback?${params}`, { credentials: "include" }).then((r) => r.json());
    },
  });

  const featureCount = posts.filter((p) => p.type === "feature").length;
  const bugCount = posts.filter((p) => p.type === "bug").length;

  const statusOptions = feedbackType === "feature"
    ? ["all", "open", "under_review", "planned", "in_progress", "completed", "closed"]
    : ["all", "open", "under_review", "resolved", "closed"];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-amber-500 via-orange-400 to-rose-400" />
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-amber-500" />
              All Feedback
            </CardTitle>
            <CardDescription>
              Review and manage bug reports and feature requests from members.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={feedbackType === "feature" ? "default" : "outline"}
                  onClick={() => { setFeedbackType("feature"); setStatusFilter("all"); setSelectedPostId(null); }}
                  data-testid="admin-tab-features"
                >
                  <Lightbulb className="h-3.5 w-3.5 mr-1" /> Features
                </Button>
                <Button
                  size="sm"
                  variant={feedbackType === "bug" ? "default" : "outline"}
                  onClick={() => { setFeedbackType("bug"); setStatusFilter("all"); setSelectedPostId(null); }}
                  data-testid="admin-tab-bugs"
                >
                  <Bug className="h-3.5 w-3.5 mr-1" /> Bugs
                </Button>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-sm w-36" data-testid="admin-select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s === "all" ? "All Statuses" : FEEDBACK_STATUS_LABELS[s] ?? s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : posts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No submissions yet.</p>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {posts.map((post) => (
                  <AdminFeedbackPostRow
                    key={post.id}
                    post={post}
                    onSelect={(p) => setSelectedPostId(p.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        {selectedPostId ? (
          <Card>
            <CardContent className="pt-4">
              <AdminFeedbackDetailPanel
                postId={selectedPostId}
                onClose={() => setSelectedPostId(null)}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-center text-muted-foreground border-2 border-dashed rounded-lg">
            <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Select a submission to review and manage it</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ── Announcements ─────────────────────────────────────────────────────────────

function hexTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 145 ? "#1a1a1a" : "#ffffff";
}

const ANNOUNCEMENT_COLORS = [
  { key: "violet", label: "Violet",  swatch: "bg-violet-600" },
  { key: "indigo", label: "Indigo",  swatch: "bg-indigo-600" },
  { key: "teal",   label: "Teal",    swatch: "bg-teal-600"   },
  { key: "amber",  label: "Amber",   swatch: "bg-amber-500"  },
  { key: "yellow", label: "Yellow",  swatch: "bg-yellow-400" },
  { key: "rose",   label: "Rose",    swatch: "bg-rose-600"   },
  { key: "red",    label: "Red",     swatch: "bg-red-600"    },
  { key: "slate",  label: "Slate",   swatch: "bg-slate-700"  },
] as const;

type AnnouncementColorKey = typeof ANNOUNCEMENT_COLORS[number]["key"];

const ANNOUNCEMENT_PREVIEW_MAP: Record<string, { bar: string; text: string; button: string }> = {
  violet: { bar: "bg-violet-600",  text: "text-white",      button: "bg-white/20 hover:bg-white/30 text-white border-white/30"                                 },
  indigo: { bar: "bg-indigo-600",  text: "text-white",      button: "bg-white/20 hover:bg-white/30 text-white border-white/30"                                 },
  teal:   { bar: "bg-teal-600",    text: "text-white",      button: "bg-white/20 hover:bg-white/30 text-white border-white/30"                                 },
  amber:  { bar: "bg-amber-500",   text: "text-amber-950",  button: "bg-amber-950/15 hover:bg-amber-950/25 text-amber-950 border-amber-950/25"                 },
  yellow: { bar: "bg-yellow-400",  text: "text-yellow-950", button: "bg-yellow-950/10 hover:bg-yellow-950/20 text-yellow-950 border-yellow-950/20"             },
  rose:   { bar: "bg-rose-600",    text: "text-white",      button: "bg-white/20 hover:bg-white/30 text-white border-white/30"                                 },
  red:    { bar: "bg-red-600",     text: "text-white",      button: "bg-white/20 hover:bg-white/30 text-white border-white/30"                                 },
  slate:  { bar: "bg-slate-700",   text: "text-white",      button: "bg-white/20 hover:bg-white/30 text-white border-white/30"                                 },
};

const ANNOUNCEMENT_ICON_LIST: { name: string; component: LucideIcon }[] = [
  { name: "Bell",          component: Bell },
  { name: "Megaphone",     component: Megaphone },
  { name: "Info",          component: Info },
  { name: "AlertTriangle", component: AlertTriangle },
  { name: "AlertCircle",   component: AlertCircle },
  { name: "Star",          component: Star },
  { name: "Gift",          component: Gift },
  { name: "Zap",           component: Zap },
  { name: "Rocket",        component: Rocket },
  { name: "Sparkles",      component: Sparkles },
  { name: "PartyPopper",   component: PartyPopper },
  { name: "Trophy",        component: Trophy },
  { name: "Heart",         component: Heart },
  { name: "Lightbulb",     component: Lightbulb },
  { name: "Flame",         component: Flame },
  { name: "CheckCircle2",  component: CheckCircle2 },
  { name: "Tag",           component: Tag },
  { name: "Calendar",      component: Calendar },
];

const ANNOUNCEMENT_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  ANNOUNCEMENT_ICON_LIST.map(ic => [ic.name, ic.component])
);

type AnnouncementRow = {
  id: number;
  callout: string;
  body: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  bgColor: string;
  icon: string | null;
  iconColor: string | null;
  isActive: boolean;
  version: number;
  createdAt: string;
};

const emptyAnnouncementForm = {
  callout: "",
  body: "",
  ctaLabel: "",
  ctaUrl: "",
  bgColor: "violet" as string,
  icon: "",
  iconColor: "auto",
  isActive: false,
};

function AnnouncementsTab() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyAnnouncementForm });
  const [orderedList, setOrderedList] = useState<AnnouncementRow[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const { data, isLoading } = useQuery<{ announcements: AnnouncementRow[] }>({
    queryKey: ["/api/admin/announcements"],
  });

  useEffect(() => {
    if (data?.announcements) setOrderedList(data.announcements);
  }, [data]);

  const createMutation = useMutation({
    mutationFn: (d: typeof emptyAnnouncementForm) => apiRequest("POST", "/api/admin/announcements", d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements/active"] });
      setShowForm(false);
      setForm({ ...emptyAnnouncementForm });
      toast({ title: "Announcement created" });
    },
    onError: () => toast({ title: "Failed to create announcement", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, d }: { id: number; d: Partial<typeof emptyAnnouncementForm> }) =>
      apiRequest("PATCH", `/api/admin/announcements/${id}`, d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements/active"] });
      setEditId(null);
      setShowForm(false);
      setForm({ ...emptyAnnouncementForm });
      toast({ title: "Announcement saved" });
    },
    onError: () => toast({ title: "Failed to update announcement", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/announcements/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements/active"] });
      toast({ title: "Announcement deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const activateMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/admin/announcements/${id}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements/active"] });
      toast({ title: "Announcement is now live" });
    },
    onError: () => toast({ title: "Failed to activate", variant: "destructive" }),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/admin/announcements/${id}/deactivate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements/active"] });
      toast({ title: "Announcement hidden" });
    },
    onError: () => toast({ title: "Failed to deactivate", variant: "destructive" }),
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: number[]) =>
      apiRequest("POST", "/api/admin/announcements/reorder", { orderedIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements/active"] });
    },
    onError: () => {
      toast({ title: "Failed to save order", variant: "destructive" });
      if (data?.announcements) setOrderedList(data.announcements);
    },
  });

  const resetDismissalsMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/admin/announcements/${id}/reset-dismissals`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/announcements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/announcements/active"] });
      toast({ title: "Dismissals reset — all members will see this banner again" });
    },
    onError: () => toast({ title: "Failed to reset dismissals", variant: "destructive" }),
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrderedList(prev => {
      const oldIdx = prev.findIndex(a => a.id === active.id);
      const newIdx = prev.findIndex(a => a.id === over.id);
      const next = arrayMove(prev, oldIdx, newIdx);
      reorderMutation.mutate(next.map(a => a.id));
      return next;
    });
  }

  function openCreate() {
    setEditId(null);
    setForm({ ...emptyAnnouncementForm });
    setShowForm(true);
  }

  function openEdit(a: AnnouncementRow) {
    setEditId(a.id);
    setForm({
      callout: a.callout,
      body: a.body ?? "",
      ctaLabel: a.ctaLabel ?? "",
      ctaUrl: a.ctaUrl ?? "",
      bgColor: a.bgColor || "violet",
      icon: a.icon ?? "",
      iconColor: a.iconColor ?? "auto",
      isActive: a.isActive,
    });
    setShowForm(true);
  }

  function handleSubmit() {
    const payload = {
      callout: form.callout.trim(),
      body: form.body.trim() || null,
      ctaLabel: form.ctaLabel.trim() || null,
      ctaUrl: form.ctaUrl.trim() || null,
      bgColor: form.bgColor,
      icon: form.icon || null,
      iconColor: form.iconColor || "auto",
      isActive: form.isActive,
    };
    if (editId !== null) {
      updateMutation.mutate({ id: editId, d: payload });
    } else {
      createMutation.mutate({ ...emptyAnnouncementForm, ...payload });
    }
  }

  const isBusy = createMutation.isPending || updateMutation.isPending;
  const isCustomColor = form.bgColor.startsWith("#");
  const previewStyles = isCustomColor ? null : (ANNOUNCEMENT_PREVIEW_MAP[form.bgColor] ?? ANNOUNCEMENT_PREVIEW_MAP.violet);
  const customText = isCustomColor ? hexTextColor(form.bgColor) : null;
  const PreviewIcon: LucideIcon | null = form.icon ? (ANNOUNCEMENT_ICON_MAP[form.icon] ?? null) : null;
  const previewIconStyle = form.iconColor?.startsWith("#")
    ? { color: form.iconColor }
    : isCustomColor ? { color: customText! }
    : undefined;
  const previewIconClass = (!form.iconColor?.startsWith("#") && !isCustomColor && previewStyles) ? previewStyles.text : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Announcements</h2>
          <p className="text-sm text-muted-foreground">
            Create banners that appear on the dashboard. Multiple can be active at once — drag to set the order they appear.
          </p>
        </div>
        {!showForm && (
          <Button onClick={openCreate} size="sm" className="gap-1.5" data-testid="button-new-announcement">
            <Plus className="h-3.5 w-3.5" />
            New Announcement
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-orange-500 to-rose-500" />
          <CardHeader className="pb-4">
            <CardTitle className="text-base">
              {editId !== null ? "Edit Announcement" : "New Announcement"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div
              className={`${isCustomColor ? "" : previewStyles!.bar} rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap`}
              style={isCustomColor ? { backgroundColor: form.bgColor } : undefined}
            >
              {PreviewIcon && (
                <PreviewIcon className={`h-4 w-4 shrink-0 ${previewIconClass}`} style={previewIconStyle} />
              )}
              <span
                className={`font-bold text-sm shrink-0 ${isCustomColor ? "" : previewStyles!.text}`}
                style={isCustomColor ? { color: customText! } : undefined}
              >
                {form.callout || "Your callout here"}
              </span>
              {form.body && (
                <span
                  className={`text-sm opacity-90 ${isCustomColor ? "" : previewStyles!.text}`}
                  style={isCustomColor ? { color: customText! } : undefined}
                >
                  {form.body}
                </span>
              )}
              <div className="flex-1" />
              {form.ctaLabel && (
                <span
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-default ${isCustomColor ? "" : previewStyles!.button}`}
                  style={isCustomColor ? { color: customText!, borderColor: `${customText}50`, backgroundColor: `${customText}18` } : undefined}
                >
                  {form.ctaLabel}
                </span>
              )}
              <X className={`h-4 w-4 opacity-50 ${isCustomColor ? "" : previewStyles!.text}`} style={isCustomColor ? { color: customText! } : undefined} />
            </div>
            <p className="text-[11px] text-muted-foreground -mt-3 pl-1">↑ Live preview</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
                  Callout <span className="text-rose-500">*</span>
                </label>
                <Input
                  placeholder="e.g. New Feature Alert!"
                  value={form.callout}
                  onChange={e => setForm(f => ({ ...f, callout: e.target.value }))}
                  data-testid="input-announcement-callout"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
                  Body Text <span className="text-muted-foreground/50">(optional)</span>
                </label>
                <Input
                  placeholder="A short supporting sentence."
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  data-testid="input-announcement-body"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
                    Button Label <span className="text-muted-foreground/50">(optional)</span>
                  </label>
                  <Input
                    placeholder="e.g. Check it out"
                    value={form.ctaLabel}
                    onChange={e => setForm(f => ({ ...f, ctaLabel: e.target.value }))}
                    data-testid="input-announcement-cta-label"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
                    Button URL <span className="text-muted-foreground/50">(optional)</span>
                  </label>
                  <Input
                    placeholder="/projects or https://..."
                    value={form.ctaUrl}
                    onChange={e => setForm(f => ({ ...f, ctaUrl: e.target.value }))}
                    data-testid="input-announcement-cta-url"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
                  Background Color
                </label>
                <div className="flex gap-2 flex-wrap items-center">
                  {ANNOUNCEMENT_COLORS.map(c => (
                    <button
                      key={c.key}
                      type="button"
                      title={c.label}
                      onClick={() => setForm(f => ({ ...f, bgColor: c.key }))}
                      className={`h-8 w-8 rounded-full transition-all ${c.swatch} ${
                        form.bgColor === c.key
                          ? "ring-2 ring-offset-2 ring-foreground scale-110"
                          : "opacity-60 hover:opacity-90 hover:scale-105"
                      }`}
                      data-testid={`color-swatch-${c.key}`}
                    />
                  ))}
                  {/* Custom hex color picker */}
                  <div className="relative" title="Custom color">
                    <input
                      type="color"
                      id="custom-color-picker"
                      value={form.bgColor.startsWith("#") ? form.bgColor : "#a855f7"}
                      onChange={e => setForm(f => ({ ...f, bgColor: e.target.value }))}
                      className="sr-only"
                      data-testid="color-picker-custom"
                    />
                    <label
                      htmlFor="custom-color-picker"
                      title="Custom color"
                      className={`h-8 w-8 rounded-full cursor-pointer flex items-center justify-center transition-all border-2 ${
                        form.bgColor.startsWith("#")
                          ? "border-foreground ring-2 ring-offset-2 ring-foreground scale-110"
                          : "border-dashed border-muted-foreground/40 hover:border-muted-foreground/70 hover:scale-105"
                      }`}
                      style={form.bgColor.startsWith("#") ? { backgroundColor: form.bgColor } : undefined}
                    >
                      {!form.bgColor.startsWith("#") && (
                        <span className="text-[11px] font-bold text-muted-foreground/50 leading-none">+</span>
                      )}
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-2">
                  Icon <span className="text-muted-foreground/50">(optional)</span>
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    type="button"
                    title="No icon"
                    onClick={() => setForm(f => ({ ...f, icon: "" }))}
                    className={`h-8 w-8 rounded-lg border-2 flex items-center justify-center text-sm font-medium transition-all ${
                      !form.icon
                        ? "border-foreground ring-2 ring-offset-2 ring-foreground bg-muted"
                        : "border-muted-foreground/25 text-muted-foreground/40 hover:border-muted-foreground/50 hover:bg-muted/50"
                    }`}
                    data-testid="icon-swatch-none"
                  >
                    –
                  </button>
                  {ANNOUNCEMENT_ICON_LIST.map(ic => {
                    const IconComp = ic.component;
                    return (
                      <button
                        key={ic.name}
                        type="button"
                        title={ic.name}
                        onClick={() => setForm(f => ({ ...f, icon: ic.name }))}
                        className={`h-8 w-8 rounded-lg border-2 flex items-center justify-center transition-all ${
                          form.icon === ic.name
                            ? "border-foreground ring-2 ring-offset-2 ring-foreground bg-muted text-foreground"
                            : "border-muted-foreground/25 text-muted-foreground/50 hover:border-muted-foreground/50 hover:bg-muted/50 hover:text-foreground"
                        }`}
                        data-testid={`icon-swatch-${ic.name}`}
                      >
                        <IconComp className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
                {form.icon && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">Icon color:</span>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, iconColor: "auto" }))}
                      className={`h-6 px-2 rounded border text-[11px] transition-all ${
                        form.iconColor === "auto"
                          ? "border-foreground ring-1 ring-offset-1 ring-foreground bg-muted font-medium"
                          : "border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60"
                      }`}
                      data-testid="icon-color-auto"
                    >
                      Auto
                    </button>
                    <div className="relative" title="Custom icon color">
                      <input
                        type="color"
                        id="icon-color-picker"
                        value={form.iconColor?.startsWith("#") ? form.iconColor : "#ffffff"}
                        onChange={e => setForm(f => ({ ...f, iconColor: e.target.value }))}
                        className="sr-only"
                        data-testid="icon-color-picker-custom"
                      />
                      <label
                        htmlFor="icon-color-picker"
                        className={`h-6 w-6 rounded cursor-pointer flex items-center justify-center border-2 transition-all ${
                          form.iconColor?.startsWith("#")
                            ? "border-foreground ring-1 ring-offset-1 ring-foreground scale-110"
                            : "border-dashed border-muted-foreground/40 hover:border-muted-foreground/70"
                        }`}
                        style={form.iconColor?.startsWith("#") ? { backgroundColor: form.iconColor } : undefined}
                      >
                        {!form.iconColor?.startsWith("#") && (
                          <span className="text-[9px] font-bold text-muted-foreground/50">+</span>
                        )}
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-1">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))}
                  id="announcement-active-switch"
                  data-testid="switch-announcement-active"
                />
                <label htmlFor="announcement-active-switch" className="text-sm cursor-pointer select-none">
                  Show this announcement on the dashboard
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button
                onClick={handleSubmit}
                disabled={isBusy || !form.callout.trim()}
                size="sm"
                className="gap-1.5"
                data-testid="button-save-announcement"
              >
                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {editId !== null ? "Save Changes" : "Create"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowForm(false); setEditId(null); setForm({ ...emptyAnnouncementForm }); }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : orderedList.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <Megaphone className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">No announcements yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create one to show a banner on the dashboard for all members.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedList.map(a => a.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {orderedList.map(a => (
                <AnnouncementCard
                  key={a.id}
                  announcement={a}
                  onEdit={() => openEdit(a)}
                  onDelete={() => deleteMutation.mutate(a.id)}
                  onActivate={() => activateMutation.mutate(a.id)}
                  onDeactivate={() => deactivateMutation.mutate(a.id)}
                  onReset={() => resetDismissalsMutation.mutate(a.id)}
                  isDeleting={deleteMutation.isPending}
                  isToggling={activateMutation.isPending || deactivateMutation.isPending}
                  isResetting={resetDismissalsMutation.isPending && resetDismissalsMutation.variables === a.id}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function AnnouncementCard({
  announcement,
  onEdit,
  onDelete,
  onActivate,
  onDeactivate,
  onReset,
  isDeleting,
  isToggling,
  isResetting,
}: {
  announcement: AnnouncementRow;
  onEdit: () => void;
  onDelete: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onReset: () => void;
  isDeleting: boolean;
  isToggling: boolean;
  isResetting: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: announcement.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const color = ANNOUNCEMENT_COLORS.find(c => c.key === announcement.bgColor);
  const isCustomBg = announcement.bgColor.startsWith("#");
  const CardIcon = announcement.icon ? (ANNOUNCEMENT_ICON_MAP[announcement.icon] ?? null) : null;
  return (
    <div ref={setNodeRef} style={style}>
      <Card className={`overflow-hidden transition-shadow ${announcement.isActive ? "ring-2 ring-emerald-400/50 ring-offset-1" : ""} ${isDragging ? "shadow-xl" : ""}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <button
              {...attributes}
              {...listeners}
              className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none p-0.5 -ml-1"
              title="Drag to reorder"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div
              className={`h-3 w-3 rounded-full shrink-0 ${isCustomBg ? "" : (color?.swatch ?? "bg-violet-600")}`}
              style={isCustomBg ? { backgroundColor: announcement.bgColor } : undefined}
            />
            {CardIcon && (
              <CardIcon
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60"
                style={announcement.iconColor?.startsWith("#") ? { color: announcement.iconColor } : undefined}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm truncate">{announcement.callout}</span>
                {announcement.isActive ? (
                  <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                    Live
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Inactive
                  </Badge>
                )}
              </div>
              {announcement.body && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{announcement.body}</p>
              )}
              {announcement.ctaLabel && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Button: <span className="text-foreground">{announcement.ctaLabel}</span>
                  {announcement.ctaUrl && <span className="opacity-70"> → {announcement.ctaUrl}</span>}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {announcement.isActive ? (
                <Button variant="ghost" size="sm" onClick={onDeactivate} disabled={isToggling}
                  className="h-7 px-2 text-muted-foreground" title="Hide banner"
                  data-testid={`button-deactivate-${announcement.id}`}>
                  {isToggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={onActivate} disabled={isToggling}
                  className="h-7 px-2 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700" title="Make live"
                  data-testid={`button-activate-${announcement.id}`}>
                  {isToggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onReset} disabled={isResetting}
                className="h-7 px-2 text-muted-foreground hover:text-blue-500" title="Re-show to all members who dismissed it"
                data-testid={`button-reset-announcement-${announcement.id}`}>
                {isResetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 px-2" title="Edit"
                data-testid={`button-edit-announcement-${announcement.id}`}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" onClick={onDelete} disabled={isDeleting}
                className="h-7 px-2 text-muted-foreground hover:text-rose-500" title="Delete"
                data-testid={`button-delete-announcement-${announcement.id}`}>
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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
  const [providerFilter, setProviderFilter] = useState("all");
  const [consentFilter, setConsentFilter] = useState("all");
  const [membershipFilter, setMembershipFilter] = useState("all");
  const [loginFilter, setLoginFilter] = useState("all");
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
  const [actionsTypeFilter, setActionsTypeFilter] = useState<string>("all");
  const [expandedActionMeta, setExpandedActionMeta] = useState<Set<string>>(new Set());

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
      fetchTopicApiStatus();
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

  const fetchTopicApiStatus = async () => {
    try {
      const statusRes = await fetch("/api/topic-pulse/status", { credentials: "include" });
      if (statusRes.ok) setTopicApiStatus(await statusRes.json());
    } catch (err) {
      console.error("Failed to fetch topic API status:", err);
    }
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
      if (providerFilter !== "all") params.set("provider", providerFilter);
      if (consentFilter !== "all") params.set("consent", consentFilter);
      if (membershipFilter !== "all") params.set("membership", membershipFilter);
      if (loginFilter !== "all") params.set("login", loginFilter);
      
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
  }, [currentPage, pageSize, searchQuery, roleFilter, providerFilter, consentFilter, membershipFilter, loginFilter, sortBy]);

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

  const handleImpersonate = async (userId: string) => {
    try {
      setActionLoading(`impersonate-${userId}`);
      const res = await fetch(`/api/admin/impersonate/${userId}`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        // Reload the full app so the auth context refreshes with the new session
        window.location.href = "/dashboard";
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.message || "Failed to impersonate user",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to impersonate user",
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
    <div className="flex-1 overflow-auto bg-background">
      {/* ── Admin hero banner ──────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220_70%_8%)] to-[hsl(262_55%_17%)]" />
        <div className="absolute -bottom-24 -right-12 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="absolute -top-16 -left-8 h-64 w-64 rounded-full bg-rose-500/10 blur-3xl" />
        <div className="absolute top-0 left-1/3 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-7">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 ring-1 ring-violet-400/30">
              <Shield className="h-5 w-5 text-violet-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white" data-testid="text-admin-title">Admin Dashboard</h1>
              <p className="text-sm text-white/60 mt-0.5">Manage users, integrations, and system settings</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview" data-testid="tab-overview" className="gap-1.5">
            <Activity className="h-3.5 w-3.5 text-indigo-400" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users" className="gap-1.5">
            <Users className="h-3.5 w-3.5 text-sky-400" />
            Users
          </TabsTrigger>
          <TabsTrigger value="clickfunnels" data-testid="tab-clickfunnels" className="gap-1.5">
            <Workflow className="h-3.5 w-3.5 text-purple-400" />
            ClickFunnels
          </TabsTrigger>
          <TabsTrigger value="integrations" data-testid="tab-integrations" className="gap-1.5">
            <Webhook className="h-3.5 w-3.5 text-emerald-400" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="email-templates" data-testid="tab-email-templates" className="gap-1.5">
            <Mail className="h-3.5 w-3.5 text-teal-400" />
            Email Templates
          </TabsTrigger>
          <TabsTrigger value="feedback" data-testid="tab-feedback" className="gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-amber-400" />
            Feedback
          </TabsTrigger>
          <TabsTrigger value="announcements" data-testid="tab-announcements" className="gap-1.5">
            <Megaphone className="h-3.5 w-3.5 text-orange-400" />
            Announcements
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-indigo-500 to-indigo-400" />
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 pt-4">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10">
                  <Users className="h-4 w-4 text-indigo-500" />
                </div>
              </CardHeader>
              <CardContent>
                {overviewStatsLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400" data-testid="stat-total-users">{overviewStats?.totalUsers || 0}</div>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 pt-4">
                <CardTitle className="text-sm font-medium">Active Members</CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                  <UserCheck className="h-4 w-4 text-emerald-500" />
                </div>
              </CardHeader>
              <CardContent>
                {cfStatusLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400" data-testid="stat-active-members">{cfStatus?.enrolledCount ?? 0}</div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Enrolled in ClickFunnels</p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-violet-500 to-purple-400" />
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 pt-4">
                <CardTitle className="text-sm font-medium">Sessions (Last 7 Days)</CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
                  <Video className="h-4 w-4 text-violet-500" />
                </div>
              </CardHeader>
              <CardContent>
                {overviewStatsLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <div className="text-2xl font-bold text-violet-600 dark:text-violet-400" data-testid="stat-sessions-7d">{overviewStats?.sessionsLast7Days || 0}</div>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-amber-500 to-orange-400" />
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 pt-4">
                <CardTitle className="text-sm font-medium">New Users (Last 30 Days)</CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                  <Users className="h-4 w-4 text-amber-500" />
                </div>
              </CardHeader>
              <CardContent>
                {overviewStatsLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400" data-testid="stat-new-users-30d">{overviewStats?.newUsersLast30Days || 0}</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* API Access toggle */}
          <ApiAccessToggleCard />

          {/* Integration health strip */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card data-testid="health-clickfunnels" className="overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
              <CardHeader className="pb-3 pt-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Webhook className="h-4 w-4 text-emerald-500" />
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

            <Card data-testid="health-keywords-everywhere" className="overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-sky-500 to-indigo-400" />
              <CardHeader className="pb-3 pt-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Search className="h-4 w-4 text-sky-500" />
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

          <Card className="overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500" />
            <CardHeader className="pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-indigo-500" />
                    Recent Activity
                  </CardTitle>
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
          <Card className="overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-sky-500 to-indigo-400" />
            <CardHeader className="pt-4">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-sky-500" />
                User Management
              </CardTitle>
              <CardDescription>All enrolled CF members plus any manually registered users. Includes members who haven't logged in yet.</CardDescription>
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
                <Select value={loginFilter} onValueChange={(v) => { setLoginFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[155px]" data-testid="select-login-filter">
                    <SelectValue placeholder="Toolkit Login" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Login Status</SelectItem>
                    <SelectItem value="logged_in">Has logged in</SelectItem>
                    <SelectItem value="never">Never logged in</SelectItem>
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
                    <SelectItem value="never_first">Never Logged In First</SelectItem>
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
                          <TableHead className="text-center">Videos</TableHead>
                          <TableHead className="text-center">KW Credits</TableHead>
                          <TableHead className="text-center">Projects</TableHead>
                          <TableHead className="text-center">Tasks</TableHead>
                          <TableHead className="text-center">DMO (30d)</TableHead>
                          <TableHead className="text-center">Toolkit Login</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
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
                              <TableCell className="text-center font-medium">
                                {u.projectCount ?? 0}
                              </TableCell>
                              <TableCell className="text-center text-sm font-medium">
                                <span title={`${u.tasksDoneCount ?? 0} completed out of ${u.taskCount ?? 0} total`}>
                                  {u.tasksDoneCount ?? 0}/{u.taskCount ?? 0}
                                </span>
                              </TableCell>
                              <TableCell className="text-center font-medium">
                                <span title="DMO days logged in the last 30 days">
                                  {u.dmoLast30Days ?? 0}/30
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                {u.lastLoginAt ? (
                                  <div className="flex flex-col items-center gap-0.5">
                                    <Badge variant="outline" className="text-xs text-green-700 border-green-300 dark:text-green-400 dark:border-green-700 gap-1">
                                      <LogIn className="h-3 w-3" />
                                      Active
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">{format(new Date(u.lastLoginAt), "MMM d, yyyy")}</span>
                                  </div>
                                ) : (
                                  <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-700 gap-1">
                                    <LogIn className="h-3 w-3 opacity-40" />
                                    Never
                                  </Badge>
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
                                    onClick={() => setConfirmDialog({
                                      open: true,
                                      title: "Log in as this user",
                                      description: `You will be switched into ${u.email || "this user"}'s account. A banner will appear letting you return to your admin account at any time.`,
                                      action: () => handleImpersonate(u.id),
                                    })}
                                    title="Log in as this user"
                                    disabled={actionLoading === `impersonate-${u.id}`}
                                    data-testid={`button-impersonate-${u.id}`}
                                  >
                                    {actionLoading === `impersonate-${u.id}` ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <LogIn className="h-4 w-4 text-violet-500" />
                                    )}
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

        <TabsContent value="clickfunnels" className="space-y-6">
          <CfIntegrationTab />
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
                    API credits and user usage for the Research feature
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
                            Set KEYWORDS_EVERYWHERE_API_KEY in environment to enable Research.
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

          {/* System API Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                System API Status
              </CardTitle>
              <CardDescription>
                Services powering Video Studio. Keys are managed via environment variables.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/50" data-testid="api-status-clickfunnels">
                <div className="flex items-center gap-3">
                  <Workflow className="h-5 w-5 text-purple-500" />
                  <div>
                    <p className="font-medium">ClickFunnels API</p>
                    <p className="text-sm text-muted-foreground">Membership enforcement & SSO</p>
                  </div>
                </div>
                {cfStatusLoading ? (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Checking
                  </Badge>
                ) : cfStatus?.allConfigured ? (
                  <Badge className="flex items-center gap-1 border-transparent bg-green-500/15 text-green-700 hover:bg-green-500/20 dark:text-green-400">
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
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/50" data-testid="api-status-youtube">
                <div className="flex items-center gap-3">
                  <Youtube className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="font-medium">YouTube Data API</p>
                    <p className="text-sm text-muted-foreground">Enhanced topic metrics</p>
                  </div>
                </div>
                {topicApiStatus?.youtube ? (
                  <Badge className="flex items-center gap-1 border-transparent bg-green-500/15 text-green-700 hover:bg-green-500/20 dark:text-green-400">
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
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/50" data-testid="api-status-openai">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-5 flex items-center justify-center text-green-500 font-bold text-xs">AI</div>
                  <div>
                    <p className="font-medium">OpenAI API</p>
                    <p className="text-sm text-muted-foreground">Script generation</p>
                  </div>
                </div>
                {topicApiStatus?.openai ? (
                  <Badge className="flex items-center gap-1 border-transparent bg-green-500/15 text-green-700 hover:bg-green-500/20 dark:text-green-400">
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
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/50" data-testid="api-status-keywords-everywhere">
                <div className="flex items-center gap-3">
                  <Search className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-medium">Keywords Everywhere API</p>
                    <p className="text-sm text-muted-foreground">Search volume, CPC & competition data</p>
                  </div>
                </div>
                {topicApiStatus?.keywordsEverywhere ? (
                  <Badge className="flex items-center gap-1 border-transparent bg-green-500/15 text-green-700 hover:bg-green-500/20 dark:text-green-400">
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
              <div className="flex items-center justify-between p-3 rounded-md bg-muted/50" data-testid="api-status-reddit">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-5 w-5 text-orange-500" />
                  <div>
                    <p className="font-medium">Reddit API</p>
                    <p className="text-sm text-muted-foreground">Community question mining</p>
                  </div>
                </div>
                {topicApiStatus?.reddit ? (
                  <Badge className="flex items-center gap-1 border-transparent bg-green-500/15 text-green-700 hover:bg-green-500/20 dark:text-green-400">
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

        </TabsContent>

        <TabsContent value="email-templates" className="space-y-6">
          <EmailSenderCard />
          <EmailTemplatesTab />
        </TabsContent>

        <TabsContent value="feedback" className="space-y-6">
          <AdminFeedbackTab />
        </TabsContent>

        <TabsContent value="announcements" className="space-y-6">
          <AnnouncementsTab />
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
          ) : !userDetails ? (
            <p className="py-8 text-center text-muted-foreground">User not found</p>
          ) : ((() => {
            const u = userDetails.user;
            const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
            const displayName = u.displayName || fullName || u.email?.split("@")[0] || "Unknown User";
            const initials = (fullName || u.displayName || u.email || "?")
              .split(/\s+|@/)
              .filter(Boolean)
              .slice(0, 2)
              .map((s) => s[0]?.toUpperCase())
              .join("") || "?";
            const membershipBadge = u.cfEnrolled
              ? { label: "Enrolled", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" }
              : u.cfRevokedAt
              ? { label: "Revoked", className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30" }
              : { label: "Never enrolled", className: "bg-muted text-muted-foreground border-muted-foreground/30" };
            return (
            <div className="mt-6 space-y-5">
              {/* HEADER CARD */}
              <div className="rounded-xl border bg-gradient-to-br from-muted/40 to-muted/10 p-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary text-primary-foreground text-lg font-semibold">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold truncate" data-testid="text-user-name">{displayName}</h3>
                      {u.isAdmin && (
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/15">
                          <Shield className="h-3 w-3 mr-1" /> Admin
                        </Badge>
                      )}
                      {u.isDisabled && (
                        <Badge variant="destructive">Disabled</Badge>
                      )}
                    </div>
                    {u.email && (
                      <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />
                        <span className="truncate">{u.email}</span>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <Badge variant="outline" className={cn("gap-1", membershipBadge.className)}>
                        <UserCheck className="h-3 w-3" /> {membershipBadge.label}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Joined {format(new Date(u.createdAt), "MMM yyyy")}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* STATS GRID */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FileVideo className="h-3.5 w-3.5" /> Video sessions
                  </div>
                  <div className="text-2xl font-semibold mt-1" data-testid="stat-sessions">{userDetails.sessionCount}</div>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Key className="h-3.5 w-3.5" /> KW credits (mo / total)
                  </div>
                  <div className="text-2xl font-semibold mt-1" data-testid="stat-kw-credits">
                    {u.keywordsCreditsThisMonth ?? 0}
                    <span className="text-sm text-muted-foreground font-normal"> / {u.keywordsCreditsTotalUsed ?? 0}</span>
                  </div>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <LogIn className="h-3.5 w-3.5" /> Last login
                  </div>
                  <div className="text-sm font-medium mt-1">
                    {u.lastLoginAt ? format(new Date(u.lastLoginAt), "MMM d, yyyy") : "Never"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {u.lastLoginAt ? format(new Date(u.lastLoginAt), "h:mm a") : "—"}
                  </div>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" /> Account age
                  </div>
                  <div className="text-sm font-medium mt-1">
                    {Math.floor((Date.now() - new Date(u.createdAt).getTime()) / (1000 * 60 * 60 * 24))} days
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Since {format(new Date(u.createdAt), "MMM d, yyyy")}
                  </div>
                </div>
              </div>

              {/* MEMBERSHIP CARD */}
              <div className="rounded-lg border p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-emerald-500" />
                  <h3 className="font-semibold text-sm">ClickFunnels Membership</h3>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant="outline" className={cn(membershipBadge.className)}>{membershipBadge.label}</Badge>
                  </div>
                  {u.cfEnrolledAt && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Enrolled</span>
                      <span>{format(new Date(u.cfEnrolledAt), "MMM d, yyyy h:mm a")}</span>
                    </div>
                  )}
                  {u.cfRevokedAt && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Revoked</span>
                      <span>{format(new Date(u.cfRevokedAt), "MMM d, yyyy h:mm a")}</span>
                    </div>
                  )}
                  {u.cfContactId && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">CF Contact ID</span>
                      <span className="font-mono text-xs">{u.cfContactId}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ACCOUNT IDENTITY CARD */}
              <div className="rounded-lg border p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <UserCog className="h-4 w-4 text-violet-500" />
                  <h3 className="font-semibold text-sm">Account & Sign-in</h3>
                </div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">User ID</span>
                    <button
                      type="button"
                      className="font-mono text-xs hover:underline truncate max-w-[200px]"
                      onClick={() => { navigator.clipboard.writeText(u.id); toast({ title: "User ID copied" }); }}
                      title={u.id}
                      data-testid="button-copy-user-id"
                    >
                      {u.id}
                    </button>
                  </div>
                  {u.firstName && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">First name</span>
                      <span>{u.firstName}</span>
                    </div>
                  )}
                  {u.lastName && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Last name</span>
                      <span>{u.lastName}</span>
                    </div>
                  )}
                  {u.themePreference && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Theme</span>
                      <span className="capitalize">{u.themePreference}</span>
                    </div>
                  )}
                  {u.disabledAt && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Disabled at</span>
                      <span>{format(new Date(u.disabledAt), "MMM d, yyyy")}</span>
                    </div>
                  )}
                  {u.disabledReason && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Reason</span>
                      <span className="text-right">{u.disabledReason}</span>
                    </div>
                  )}
                </div>
                <div className="pt-2 space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sign-in methods</div>
                  {userDetails.hasLocalPassword && (
                    <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                      <span className="flex items-center gap-2"><Key className="h-3.5 w-3.5" /> Email & password</span>
                      <Badge variant="outline" className="text-xs">Local</Badge>
                    </div>
                  )}
                  {userDetails.identities.map((id) => (
                    <div key={id.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                      <div>
                        <div className="capitalize flex items-center gap-2">
                          <UserCheck className="h-3.5 w-3.5" /> {id.provider}
                        </div>
                        {id.emailFromProvider && (
                          <div className="text-xs text-muted-foreground">{id.emailFromProvider}</div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">{format(new Date(id.createdAt), "MMM d, yyyy")}</Badge>
                    </div>
                  ))}
                  {!userDetails.hasLocalPassword && userDetails.identities.length === 0 && (
                    <div className="text-xs text-muted-foreground">No sign-in methods on file.</div>
                  )}
                </div>
              </div>

              {/* RECENT SESSIONS */}
              <div className="rounded-lg border p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileVideo className="h-4 w-4 text-emerald-500" />
                    <h3 className="font-semibold text-sm">Recent Video Sessions</h3>
                  </div>
                  <Badge variant="outline" className="text-xs">{userDetails.sessionCount} total</Badge>
                </div>
                {userDetails.sessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sessions yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {userDetails.sessions.slice(0, 5).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSessionId(s.id)}
                        className="flex w-full items-center justify-between rounded-md border p-2 text-sm text-left hover:bg-accent"
                        data-testid={`button-session-${s.id}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{s.title || "Untitled"}</div>
                          <div className="text-xs text-muted-foreground">{format(new Date(s.createdAt), "MMM d, yyyy h:mm a")}</div>
                        </div>
                        <div className="text-right ml-2 shrink-0">
                          <div className="font-medium">{s.scoreJson?.totalScore != null ? `${s.scoreJson.totalScore}/100` : "—"}</div>
                          <div className="text-xs text-muted-foreground">{s.videoDeletedAt ? "Expired" : "Available"}</div>
                        </div>
                      </button>
                    ))}
                    {userDetails.sessionCount > 5 && (
                      <p className="text-xs text-muted-foreground pt-1">...and {userDetails.sessionCount - 5} more</p>
                    )}
                  </div>
                )}
              </div>

              {/* ADMIN ACTIONS */}
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

                  <Button
                    variant="outline"
                    size="sm"
                    className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:hover:bg-violet-950"
                    onClick={() => setConfirmDialog({
                      open: true,
                      title: "Log in as this user",
                      description: `You will be switched into ${userDetails.user.email || "this user"}'s account. A banner will appear at the top of every page letting you return to your admin account instantly.`,
                      action: () => handleImpersonate(userDetails.user.id),
                    })}
                    disabled={actionLoading?.startsWith("impersonate")}
                    data-testid="button-impersonate-user"
                  >
                    <LogIn className="mr-2 h-4 w-4" />
                    Log in as this user
                  </Button>

                </div>
              </div>
            </div>
            );
          })())}
        </SheetContent>
      </Sheet>

      {/* User Actions History Sheet */}
      <Sheet
        open={!!actionsUserId}
        onOpenChange={(open) => {
          if (!open) {
            setActionsUserId(null);
            setActionsTypeFilter("all");
            setExpandedActionMeta(new Set());
          }
        }}
      >
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Action History</SheetTitle>
            <SheetDescription>
              Detailed activity timeline for this account
            </SheetDescription>
          </SheetHeader>

          {(() => {
            const a = actionsUser;
            const fullName = a ? [a.firstName, a.lastName].filter(Boolean).join(" ").trim() : "";
            const displayName = a ? (a.displayName || fullName || a.email?.split("@")[0] || "Unknown User") : "";
            const initials = a
              ? ((fullName || a.displayName || a.email || "?")
                  .split(/\s+|@/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((s) => s[0]?.toUpperCase())
                  .join("") || "?")
              : "?";
            const filtered = actionsTypeFilter === "all"
              ? userActions
              : userActions.filter((x) => x.actionType === actionsTypeFilter);
            // Group by day
            const groups = new Map<string, UserAction[]>();
            for (const ua of filtered) {
              const key = format(new Date(ua.createdAt), "yyyy-MM-dd");
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(ua);
            }
            const groupKeys = Array.from(groups.keys());
            const today = format(new Date(), "yyyy-MM-dd");
            const yesterday = format(new Date(Date.now() - 86400000), "yyyy-MM-dd");
            const dayLabel = (k: string) => {
              if (k === today) return "Today";
              if (k === yesterday) return "Yesterday";
              return format(new Date(k), "EEEE, MMM d, yyyy");
            };
            const toggleMeta = (id: string) => {
              setExpandedActionMeta((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            };
            const deviceFromUA = (ua?: string | null) => {
              if (!ua) return null;
              if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
              if (/Android/i.test(ua)) return "Android";
              if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
              if (/Windows/i.test(ua)) return "Windows";
              if (/Linux/i.test(ua)) return "Linux";
              return "Other";
            };
            return (
              <div className="mt-6 space-y-5">
                {/* HEADER CARD */}
                {a && (
                  <div className="rounded-xl border bg-gradient-to-br from-muted/40 to-muted/10 p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/80 to-violet-600 text-white text-base font-semibold">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold truncate" data-testid="text-actions-user-name">{displayName}</h3>
                          {a.isAdmin && (
                            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/15 text-xs">
                              <Shield className="h-3 w-3 mr-1" /> Admin
                            </Badge>
                          )}
                        </div>
                        {a.email && (
                          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            <span className="truncate">{a.email}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-2 text-xs">
                          <Badge variant="outline" className="gap-1">
                            <Activity className="h-3 w-3" />
                            {userActions.length}{actionsNextCursor ? "+" : ""} loaded
                          </Badge>
                          {actionsTypeFilter !== "all" && (
                            <Badge variant="outline" className="gap-1 bg-violet-500/10 border-violet-500/30 text-violet-700 dark:text-violet-300">
                              {filtered.length} matching
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* FILTER BAR */}
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select value={actionsTypeFilter} onValueChange={setActionsTypeFilter}>
                    <SelectTrigger className="h-9 text-sm" data-testid="select-actions-type-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* TIMELINE */}
                {actionsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : userActions.length === 0 ? (
                  <div className="rounded-lg border border-dashed py-10 text-center">
                    <Activity className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No actions recorded for this user yet.</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="rounded-lg border border-dashed py-8 text-center">
                    <p className="text-sm text-muted-foreground">No actions match this filter.</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-primary hover:text-primary/80 underline-offset-4 hover:underline"
                      onClick={() => setActionsTypeFilter("all")}
                      data-testid="button-clear-actions-filter"
                    >
                      Clear filter
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {groupKeys.map((dayKey) => {
                      const items = groups.get(dayKey)!;
                      return (
                        <div key={dayKey} className="space-y-2">
                          <div className="sticky top-0 -mx-1 px-1 py-1 bg-background/95 backdrop-blur-sm z-10">
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                              <span>{dayLabel(dayKey)}</span>
                              <span className="text-muted-foreground/50">·</span>
                              <span>{items.length} {items.length === 1 ? "action" : "actions"}</span>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            {items.map((action) => {
                              const visual = getActionVisual(action.actionType);
                              const meta = action.metadata || action.metadataJson;
                              const hasMeta = meta && Object.keys(meta).length > 0;
                              const isExpanded = expandedActionMeta.has(action.id);
                              const device = deviceFromUA(action.userAgent);
                              return (
                                <div
                                  key={action.id}
                                  className="flex items-start gap-3 rounded-lg border p-3 hover:bg-accent/40 transition-colors"
                                  data-testid={`action-item-${action.id}`}
                                >
                                  <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/60", visual.tone)}>
                                    <visual.Icon className="h-4 w-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0 flex-1">
                                        <div className="text-sm font-medium truncate">{action.actionLabel}</div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                          {format(new Date(action.createdAt), "h:mm a")}
                                          {action.entityType && (
                                            <>
                                              <span className="mx-1.5">·</span>
                                              <span className="capitalize">{action.entityType}</span>
                                              {action.entityId && (
                                                <span className="font-mono ml-1">{action.entityId.slice(0, 8)}</span>
                                              )}
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    {(device || action.ip) && (
                                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
                                        {device && (
                                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5">
                                            {device}
                                          </span>
                                        )}
                                        {action.ip && (
                                          <span className="font-mono">{action.ip}</span>
                                        )}
                                      </div>
                                    )}
                                    {hasMeta && (
                                      <div className="mt-2">
                                        <button
                                          type="button"
                                          onClick={() => toggleMeta(action.id)}
                                          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                                          data-testid={`button-toggle-meta-${action.id}`}
                                        >
                                          {isExpanded ? "Hide details" : "Show details"}
                                          <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
                                        </button>
                                        {isExpanded && (
                                          <pre className="mt-1.5 text-[11px] font-mono bg-muted/60 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
{JSON.stringify(meta, null, 2)}
                                          </pre>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {actionsNextCursor && (
                      <div className="pt-2 text-center">
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
                            "Load older actions"
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
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
    </div>
  );
}
