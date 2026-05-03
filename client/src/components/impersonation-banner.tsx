import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeftFromLine, Eye, Loader2 } from "lucide-react";
import { useState } from "react";
import { queryClient } from "@/lib/queryClient";

export function ImpersonationBanner() {
  const { user, endImpersonation } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  if (!user?.impersonating) return null;

  const { adminDisplayName, adminEmail } = user.impersonating;
  const adminName = adminDisplayName || adminEmail || "Admin";

  const handleReturn = async () => {
    setLoading(true);
    try {
      await endImpersonation();
      queryClient.clear();
      setLocation("/admin");
      toast({ title: "Back to your account", description: `Welcome back, ${adminName}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to end impersonation", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const viewedName = user.displayName || user.email || "this user";

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-500 text-amber-950 text-sm font-medium"
      data-testid="impersonation-banner"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="truncate">
          Viewing as <strong>{viewedName}</strong>
          {user.email && user.displayName ? <span className="font-normal opacity-75"> ({user.email})</span> : null}
          <span className="font-normal"> — you are logged in as </span>
          <strong>{adminName}</strong>
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 h-7 border-amber-800 text-amber-950 bg-amber-100 hover:bg-amber-200 hover:border-amber-900"
        onClick={handleReturn}
        disabled={loading}
        data-testid="button-end-impersonation"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
        ) : (
          <ArrowLeftFromLine className="h-3.5 w-3.5 mr-1.5" />
        )}
        Return to my account
      </Button>
    </div>
  );
}
