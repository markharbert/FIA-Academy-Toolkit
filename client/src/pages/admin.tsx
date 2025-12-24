import { useEffect, useState, useCallback } from "react";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { 
  Settings, Link2, Unlink, Loader2, CheckCircle, XCircle, AlertCircle,
  Users, ChevronLeft, ChevronRight, Shield, ShieldOff, Ban, Video,
  CheckCircle2, LogOut, RefreshCw, Tag, Check, ChevronsUpDown, Search, Mail, Eye, Info, Clock
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface AdminStats {
  totalUsers: number;
  newUsersLast7Days: number;
  totalSessions: number;
  sessionsLast7Days: number;
  keapStatus: string;
  keapTokenExpiresAt: string | null;
  keapLastError: string | null;
}

interface OverviewStats {
  totalUsers: number;
  sessionsLast7Days: number;
  newUsersLast30Days: number;
}

interface ActivityItem {
  id: string;
  type: "session_created";
  sessionId: string;
  sessionTitle: string | null;
  sessionCreatedAt: string;
  scoreTotal: number | null;
  user: {
    id: string;
    displayName: string | null;
    email: string | null;
  };
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
  keapSyncStatus: string | null;
  keapContactId: string | null;
  lastLoginAt: string | null;
  providers: string[];
  totalVideos: number;
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

interface KeapStatus {
  connected: boolean;
  connectedAt: string | null;
  lastError: string | null;
  tokenExpiresAt: string | null;
  defaultTag: { id: number; name: string } | null;
  lastTagSyncAt: string | null;
}

interface KeapTag {
  id: number;
  name: string;
  description?: string;
}

interface TagCacheInfo {
  source: "cache" | "keap";
  cachedAt: string | null;
  expiresAt: string | null;
  warning?: string;
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

export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [overviewStats, setOverviewStats] = useState<OverviewStats | null>(null);
  const [overviewStatsLoading, setOverviewStatsLoading] = useState(true);
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityNextCursor, setActivityNextCursor] = useState<string | null>(null);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [keapStatus, setKeapStatus] = useState<KeapStatus | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [keapTags, setKeapTags] = useState<KeapTag[]>([]);
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  
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

  // Tag cache info
  const [tagCacheInfo, setTagCacheInfo] = useState<TagCacheInfo | null>(null);
  
  // Tag combobox state
  const [tagComboOpen, setTagComboOpen] = useState(false);
  const [tagSearchValue, setTagSearchValue] = useState("");
  
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
    const params = new URLSearchParams(window.location.search);
    const keapSuccess = params.get("keap_success");
    const keapError = params.get("keap_error");
    
    if (keapSuccess === "connected") {
      toast({
        title: "Keap Connected",
        description: "Your Keap account has been successfully connected.",
      });
      window.history.replaceState({}, "", "/admin");
      fetchStats();
      fetchKeapStatus();
    } else if (keapError) {
      const errorMessages: Record<string, string> = {
        oauth_denied: "You denied access to Keap. Please try again.",
        no_code: "No authorization code received from Keap.",
        token_exchange: "Failed to complete Keap connection. Please try again.",
      };
      toast({
        title: "Connection Failed",
        description: errorMessages[keapError] || "An error occurred connecting to Keap.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/admin");
    }
  }, [toast]);

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      setLocation("/dashboard");
      return;
    }
    
    if (user?.isAdmin) {
      fetchStats();
      fetchKeapStatus();
      fetchOverviewStats();
      fetchActivityFeed();
    }
  }, [user, authLoading, setLocation]);

  // Auto-load tags when Keap is connected
  useEffect(() => {
    if (keapStatus?.connected && keapTags.length === 0) {
      // Silently load tags from cache when page loads
      (async () => {
        try {
          const res = await fetch("/api/admin/keap/tags", { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setKeapTags(data.tags || []);
            setTagCacheInfo({
              source: data.source,
              cachedAt: data.cachedAt,
              expiresAt: data.expiresAt,
              warning: data.warning,
            });
          }
        } catch (err) {
          console.error("Failed to auto-load tags:", err);
        }
      })();
    }
  }, [keapStatus?.connected]);

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

  const fetchActivityFeed = async (cursor?: string, append = false) => {
    try {
      if (append) {
        setActivityLoadingMore(true);
      } else {
        setActivityLoading(true);
      }
      
      const params = new URLSearchParams({ limit: "20" });
      if (cursor) params.set("cursor", cursor);
      
      const res = await fetch(`/api/admin/overview/activity?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (append) {
          setActivityFeed(prev => [...prev, ...data.items]);
        } else {
          setActivityFeed(data.items);
        }
        setActivityNextCursor(data.nextCursor);
      }
    } catch (err) {
      console.error("Failed to fetch activity feed:", err);
    } finally {
      setActivityLoading(false);
      setActivityLoadingMore(false);
    }
  };

  const loadMoreActivity = () => {
    if (activityNextCursor && !activityLoadingMore) {
      fetchActivityFeed(activityNextCursor, true);
    }
  };

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

  const fetchKeapStatus = async () => {
    try {
      const res = await fetch("/api/admin/keap/status", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setKeapStatus(data);
      }
    } catch (err) {
      console.error("Failed to fetch Keap status:", err);
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
  }, [currentPage, pageSize, searchQuery, roleFilter, statusFilter, providerFilter, consentFilter, sortBy]);

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

  const handleConnect = async () => {
    try {
      setActionLoading("connect");
      const res = await fetch("/api/admin/keap/auth-url", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        // Use window.open for external OAuth - works better in iframes/webviews
        const authWindow = window.open(data.authUrl, "_blank");
        if (!authWindow) {
          // Fallback if popup was blocked
          window.location.href = data.authUrl;
        }
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.message || "Failed to get Keap auth URL",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to connect to Keap",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async () => {
    try {
      setActionLoading("disconnect");
      const res = await fetch("/api/admin/keap/disconnect", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        toast({
          title: "Disconnected",
          description: "Keap has been disconnected.",
        });
        setKeapStatus({ connected: false, connectedAt: null, lastError: null, tokenExpiresAt: null, defaultTag: null, lastTagSyncAt: null });
        setKeapTags([]);
        fetchStats();
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to disconnect Keap",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefreshTags = async () => {
    try {
      setActionLoading("refresh-tags");
      const res = await fetch("/api/admin/keap/tags/refresh", { 
        method: "POST",
        credentials: "include" 
      });
      
      if (res.ok) {
        const data = await res.json();
        setKeapTags(data.tags || []);
        setTagCacheInfo({
          source: data.source,
          cachedAt: data.cachedAt,
          expiresAt: data.expiresAt,
          warning: data.warning,
        });
        
        toast({
          title: "Tags Refreshed",
          description: `Loaded ${data.tags?.length || 0} tags from Keap.`,
        });
        fetchKeapStatus();
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.message || "Failed to refresh tags",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to refresh tags from Keap",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetDefaultTag = async () => {
    if (!selectedTagId) {
      toast({
        title: "Error",
        description: "Please select a tag first",
        variant: "destructive",
      });
      return;
    }
    
    const tag = keapTags.find(t => t.id === selectedTagId);
    if (!tag) return;
    
    try {
      setActionLoading("set-tag");
      const res = await fetch("/api/admin/keap/default-tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId: tag.id, tagName: tag.name }),
        credentials: "include",
      });
      
      if (res.ok) {
        toast({
          title: "Default Tag Set",
          description: `"${tag.name}" will be applied to new signups.`,
        });
        fetchKeapStatus();
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.message || "Failed to set default tag",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to set default tag",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
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

  const handleKeapSync = async (userId: string) => {
    try {
      setActionLoading(`keap-${userId}`);
      const res = await fetch(`/api/admin/users/${userId}/keap-sync`, {
        method: "POST",
        credentials: "include",
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: "Synced to Keap",
          description: `Contact ID: ${data.contactId}`,
        });
        if (selectedUserId === userId) {
          fetchUserDetails(userId);
        }
      } else {
        toast({
          title: "Sync Failed",
          description: data.message || "Failed to sync to Keap",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to sync user to Keap",
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
          <TabsTrigger value="keap" data-testid="tab-keap">Keap Integration</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
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

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>See what users are creating</CardDescription>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : activityFeed.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No activity yet. Once users create sessions, you'll see them here.
                </div>
              ) : (
                <div className="space-y-4">
                  {activityFeed.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-4 border-b pb-4 last:border-0 last:pb-0"
                      data-testid={`activity-item-${item.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{getActivityUserName(item.user)}</span>
                          <span className="text-muted-foreground">created</span>
                          <span className="font-medium truncate">
                            {item.sessionTitle || "Practice Session"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span title={format(new Date(item.sessionCreatedAt), "MMM d, yyyy h:mm a")}>
                            {formatRelativeTime(item.sessionCreatedAt)}
                          </span>
                          {item.scoreTotal !== null && (
                            <Badge variant="secondary" className="text-xs">
                              Score: {item.scoreTotal}/100
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedSessionId(item.sessionId);
                        }}
                        data-testid={`button-view-activity-session-${item.id}`}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </div>
                  ))}
                  
                  {activityNextCursor && (
                    <div className="flex justify-center pt-4">
                      <Button
                        variant="outline"
                        onClick={loadMoreActivity}
                        disabled={activityLoadingMore}
                        data-testid="button-load-more-activity"
                      >
                        {activityLoadingMore ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
                <Select value={providerFilter} onValueChange={(v) => { setProviderFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[140px]" data-testid="select-provider-filter">
                    <SelectValue placeholder="Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Providers</SelectItem>
                    <SelectItem value="local">Email</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="apple">Apple</SelectItem>
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
                          <TableHead>Total Videos</TableHead>
                          <TableHead>Sign-up Method</TableHead>
                          <TableHead>Consent</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
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
                              <TableCell className="text-center font-medium">
                                {u.totalVideos || 0}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {getProviderBadges(u.providers)}
                                </div>
                              </TableCell>
                              <TableCell>
                                {u.emailConsentAt ? (
                                  <Badge variant="outline" className="gap-1">
                                    <Mail className="h-3 w-3" />
                                    Yes
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">No</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {u.isDisabled ? (
                                  <Badge variant="destructive">Disabled</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-green-600 border-green-600">Active</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {format(new Date(u.createdAt), "MMM d, yyyy")}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
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

        <TabsContent value="keap">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${keapStatus?.connected ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                  <Settings className={`h-5 w-5 ${keapStatus?.connected ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500"}`} />
                </div>
                <div>
                  <CardTitle>Keap Integration</CardTitle>
                  <CardDescription>
                    Connect to Keap to automatically add new users to your email list
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <span className="font-medium">Connection Status:</span>
                  {keapStatus?.connected ? (
                    <Badge className="gap-1 bg-green-600 text-white dark:bg-green-600">
                      <CheckCircle className="h-3 w-3" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      Not Connected
                    </Badge>
                  )}
                </div>
                {keapStatus?.connectedAt && (
                  <span className="text-sm text-muted-foreground">
                    Connected {format(new Date(keapStatus.connectedAt), "MMM d, yyyy")}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-3">
                {!keapStatus?.connected ? (
                  <Button
                    onClick={handleConnect}
                    disabled={actionLoading === "connect"}
                    data-testid="button-connect-keap"
                  >
                    {actionLoading === "connect" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="mr-2 h-4 w-4" />
                    )}
                    Connect Keap
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={handleDisconnect}
                    disabled={!!actionLoading}
                    data-testid="button-disconnect-keap"
                  >
                    {actionLoading === "disconnect" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Unlink className="mr-2 h-4 w-4" />
                    )}
                    Disconnect Keap
                  </Button>
                )}
              </div>

              {keapStatus?.lastError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/50">
                  <div className="flex gap-3">
                    <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-500" />
                    <div className="text-sm">
                      <p className="font-medium text-red-800 dark:text-red-200">Last Error</p>
                      <p className="mt-1 text-red-700 dark:text-red-300">{keapStatus.lastError}</p>
                    </div>
                  </div>
                </div>
              )}

              {keapStatus?.connected && (
                <div className="space-y-4 border-t pt-4">
                  <h4 className="font-medium">Default Tag for New Signups</h4>
                  <div className="flex flex-wrap items-center gap-3">
                    <Popover open={tagComboOpen} onOpenChange={(open) => {
                      setTagComboOpen(open);
                      if (!open) setTagSearchValue("");
                    }}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={tagComboOpen}
                          className="w-72 justify-between"
                          data-testid="select-keap-tag"
                          disabled={keapTags.length === 0}
                        >
                          {selectedTagId || keapStatus.defaultTag?.id
                            ? keapTags.find((tag) => tag.id === (selectedTagId || keapStatus.defaultTag?.id))?.name || "Select a tag..."
                            : "Select a tag..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput 
                            placeholder="Search tags..." 
                            value={tagSearchValue}
                            onValueChange={setTagSearchValue}
                            data-testid="input-tag-search"
                          />
                          <CommandList>
                            <CommandEmpty>No tags found.</CommandEmpty>
                            <CommandGroup>
                              {keapTags
                                .filter((tag) => 
                                  tag.name.toLowerCase().includes(tagSearchValue.toLowerCase())
                                )
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map((tag) => (
                                  <CommandItem
                                    key={tag.id}
                                    value={tag.id.toString()}
                                    onSelect={() => {
                                      setSelectedTagId(tag.id);
                                      setTagComboOpen(false);
                                      setTagSearchValue("");
                                    }}
                                    data-testid={`tag-option-${tag.id}`}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        (selectedTagId || keapStatus.defaultTag?.id) === tag.id 
                                          ? "opacity-100" 
                                          : "opacity-0"
                                      )}
                                    />
                                    {tag.name}
                                  </CommandItem>
                                ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    <Button
                      variant="outline"
                      onClick={handleRefreshTags}
                      disabled={!!actionLoading}
                      data-testid="button-refresh-tags"
                    >
                      {actionLoading === "refresh-tags" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Refresh from Keap
                    </Button>
                    <Button
                      onClick={handleSetDefaultTag}
                      disabled={!!actionLoading || !selectedTagId}
                      data-testid="button-set-default-tag"
                    >
                      {actionLoading === "set-tag" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Tag className="mr-2 h-4 w-4" />
                      )}
                      Set Default Tag
                    </Button>
                  </div>
                  {keapStatus.defaultTag && (
                    <p className="text-sm text-muted-foreground">
                      Current default: <span className="font-medium">{keapStatus.defaultTag.name}</span>
                    </p>
                  )}
                  {tagCacheInfo && (
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>
                        Tags loaded from: <span className="font-medium">{tagCacheInfo.source === "cache" ? "cached data" : "Keap API"}</span>
                        {tagCacheInfo.cachedAt && ` (cached ${format(new Date(tagCacheInfo.cachedAt), "MMM d, yyyy 'at' h:mm a")})`}
                      </p>
                      {tagCacheInfo.warning && (
                        <p className="text-amber-600 dark:text-amber-400">{tagCacheInfo.warning}</p>
                      )}
                    </div>
                  )}
                  {!tagCacheInfo && keapStatus.lastTagSyncAt && (
                    <p className="text-sm text-muted-foreground">
                      Tags last synced: {format(new Date(keapStatus.lastTagSyncAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  )}
                </div>
              )}

              {!keapStatus?.connected && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/50">
                  <div className="flex gap-3">
                    <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-800 dark:text-amber-200">Setup Requirements</p>
                      <ul className="mt-2 list-inside list-disc space-y-1 text-amber-700 dark:text-amber-300">
                        <li>Set KEAP_CLIENT_ID and KEAP_CLIENT_SECRET in environment</li>
                        <li>Set KEAP_REDIRECT_URI to your callback URL</li>
                        <li>After connecting, set a default tag for new signups</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
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
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Keap Contact ID:</span>
                    <span>{userDetails.user.keapContactId || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Keap Sync Status:</span>
                    <span>{userDetails.user.keapSyncStatus || "-"}</span>
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
                  
                  {userDetails.user.email && userDetails.user.emailConsentAt && keapStatus?.connected && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDialog({
                        open: true,
                        title: "Sync to Keap",
                        description: "This will create or update this user's contact in Keap.",
                        action: () => handleKeapSync(userDetails.user.id),
                      })}
                      disabled={actionLoading?.startsWith("keap")}
                      data-testid="button-keap-sync"
                    >
                      {actionLoading === `keap-${userDetails.user.id}` ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Sync to Keap
                    </Button>
                  )}
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
