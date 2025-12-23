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
  Settings, Link2, Unlink, TestTube, Loader2, CheckCircle, XCircle, AlertCircle,
  Users, Video, Search, ChevronLeft, ChevronRight, Shield, ShieldOff, Ban, 
  CheckCircle2, LogOut, RefreshCw, Eye, Mail, Tag
} from "lucide-react";
import { format } from "date-fns";

interface AdminStats {
  totalUsers: number;
  newUsersLast7Days: number;
  totalSessions: number;
  sessionsLast7Days: number;
  keapStatus: string;
  keapTokenExpiresAt: string | null;
  keapLastError: string | null;
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

export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [stats, setStats] = useState<AdminStats | null>(null);
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

  const handleTestContact = async () => {
    try {
      setActionLoading("test");
      const res = await fetch("/api/admin/keap/test", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      
      if (data.success) {
        toast({
          title: "Test Successful",
          description: data.message,
        });
      } else {
        toast({
          title: "Test Failed",
          description: data.message,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to send test contact",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleFetchTags = async () => {
    try {
      setActionLoading("fetch-tags");
      const res = await fetch("/api/admin/keap/tags", { credentials: "include" });
      
      if (res.ok) {
        const data = await res.json();
        setKeapTags(data.tags || []);
        toast({
          title: "Tags Loaded",
          description: `Loaded ${data.tags?.length || 0} tags from Keap.`,
        });
        fetchKeapStatus();
      } else {
        const error = await res.json();
        toast({
          title: "Error",
          description: error.message || "Failed to fetch tags",
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to fetch tags from Keap",
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <div className="text-2xl font-bold" data-testid="stat-total-users">{stats?.totalUsers || 0}</div>
                    <p className="text-xs text-muted-foreground">
                      +{stats?.newUsersLast7Days || 0} in last 7 days
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
                <Video className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <div className="text-2xl font-bold" data-testid="stat-total-sessions">{stats?.totalSessions || 0}</div>
                    <p className="text-xs text-muted-foreground">
                      +{stats?.sessionsLast7Days || 0} in last 7 days
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">New Users (7d)</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <div className="text-2xl font-bold" data-testid="stat-new-users">{stats?.newUsersLast7Days || 0}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Keap Status</CardTitle>
                <Settings className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <div className="flex items-center gap-2">
                    {stats?.keapStatus === "connected" ? (
                      <Badge className="gap-1">
                        <CheckCircle className="h-3 w-3" />
                        Connected
                      </Badge>
                    ) : stats?.keapStatus === "token_expiring_soon" ? (
                      <Badge variant="secondary" className="gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Token Expiring
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        Not Connected
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
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
                                <Badge variant={u.isAdmin ? "default" : "secondary"}>
                                  {u.isAdmin ? "Admin" : "User"}
                                </Badge>
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
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleUserClick(u.id)}
                                  data-testid={`button-view-user-${u.id}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
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
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Settings className="h-5 w-5 text-primary" />
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
                  <>
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
                    <Button
                      variant="secondary"
                      onClick={handleTestContact}
                      disabled={!!actionLoading}
                      data-testid="button-test-keap"
                    >
                      {actionLoading === "test" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <TestTube className="mr-2 h-4 w-4" />
                      )}
                      Send Test Contact
                    </Button>
                  </>
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
                    <Select
                      value={selectedTagId?.toString() || keapStatus.defaultTag?.id?.toString() || ""}
                      onValueChange={(value) => setSelectedTagId(Number(value))}
                    >
                      <SelectTrigger className="w-64" data-testid="select-keap-tag">
                        <SelectValue placeholder="Select a tag..." />
                      </SelectTrigger>
                      <SelectContent>
                        {keapTags.map((tag) => (
                          <SelectItem key={tag.id} value={tag.id.toString()}>
                            {tag.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      onClick={handleFetchTags}
                      disabled={!!actionLoading}
                      data-testid="button-fetch-tags"
                    >
                      {actionLoading === "fetch-tags" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Fetch Tags
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
                  {keapStatus.lastTagSyncAt && (
                    <p className="text-sm text-muted-foreground">
                      Tags last synced: {format(new Date(keapStatus.lastTagSyncAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/50">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800 dark:text-amber-200">Setup Requirements</p>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-amber-700 dark:text-amber-300">
                      <li>Set KEAP_CLIENT_ID and KEAP_CLIENT_SECRET in environment</li>
                      <li>Set KEAP_REDIRECT_URI to your callback URL</li>
                      <li>Use "Fetch Tags" and set a default tag for new signups</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
