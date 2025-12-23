import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Settings, Link2, Unlink, TestTube, Loader2, CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface KeapStatus {
  connected: boolean;
  connectedAt: string | null;
}

export default function AdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [keapStatus, setKeapStatus] = useState<KeapStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
      fetchKeapStatus();
    }
  }, [user, authLoading, setLocation]);

  const fetchKeapStatus = async () => {
    try {
      setStatusLoading(true);
      const res = await fetch("/api/admin/keap/status", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setKeapStatus(data);
      }
    } catch (err) {
      console.error("Failed to fetch Keap status:", err);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      setActionLoading("connect");
      const res = await fetch("/api/admin/keap/auth-url", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        window.location.href = data.authUrl;
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
        setKeapStatus({ connected: false, connectedAt: null });
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
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold" data-testid="text-admin-title">Admin Settings</h1>
        <p className="mt-2 text-muted-foreground">Manage integrations and system settings</p>
      </div>

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
              {statusLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : keapStatus?.connected ? (
                <Badge variant="default" className="gap-1">
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
                Connected {new Date(keapStatus.connectedAt).toLocaleDateString()}
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

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/50">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">Setup Requirements</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-amber-700 dark:text-amber-300">
                  <li>Set KEAP_CLIENT_ID and KEAP_CLIENT_SECRET in environment</li>
                  <li>Set KEAP_REDIRECT_URI to your callback URL (e.g., https://yourapp.com/api/admin/keap/callback)</li>
                  <li>Optionally set KEAP_TAG_ID to auto-apply a tag to new contacts</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
