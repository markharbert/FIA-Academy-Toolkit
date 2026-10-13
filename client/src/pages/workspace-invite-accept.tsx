import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Users, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import logoImage from "@assets/image_1788559097620.png";
import { queryClient } from "@/lib/queryClient";
import { announceWorkspaceChange, reloadWorkspace } from "@/lib/workspace-navigation";

interface InviteInfo {
  ownerName: string;
  ownerEmail: string;
  inviteEmail: string;
  status: string;
  accountExists: boolean;
  hasPassword: boolean;
}

export default function WorkspaceInviteAcceptPage() {
  const [, setLocation] = useLocation();
  const { user, refetch, isLoading: loadingAuth } = useAuth();
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  useEffect(() => {
    if (!token) {
      setInviteError("Invalid invite link — no token found.");
      setLoadingInvite(false);
      return;
    }
    fetch(`/api/workspace/invite/info?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || "Invite not found or already used.");
        }
        return res.json();
      })
      .then((data) => {
        setInviteInfo(data);
        setLoadingInvite(false);
      })
      .catch((err) => {
        setInviteError(err.message);
        setLoadingInvite(false);
      });
  }, [token]);

  const matchesSignedInUser = !!user && user.email?.trim().toLowerCase() === inviteInfo?.inviteEmail.trim().toLowerCase();
  const returnPath = `/workspace/accept?token=${encodeURIComponent(token)}`;

  async function requestPasswordReset() {
    if (resetBusy) return;
    setResetBusy(true);
    setSubmitError(null);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteInfo?.inviteEmail, workspaceInviteToken: token }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to request a reset link.");
      setResetSent(true);
    } catch (error: any) { setSubmitError(error.message); }
    finally { setResetBusy(false); }
  }

  async function handleAccept(pw?: string) {
    if (submitting) return;
    if (!matchesSignedInUser && !inviteInfo?.accountExists && pw !== confirmPassword) {
      setSubmitError("Your passwords don't match. Please enter the same password twice.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/workspace/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password: pw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to accept invite");
      await queryClient.cancelQueries();
      queryClient.clear();
      await refetch();
      announceWorkspaceChange();
      setDone(true);
      // Acceptance may also switch identity/workspace; discard old mounted state.
      setTimeout(reloadWorkspace, 1500);
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(230,45%,8%)] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <img src={logoImage} alt="Academy Toolkit" className="h-12 w-auto" />
        </div>

        {loadingInvite || loadingAuth ? (
          <Card className="border-[hsl(230,45%,18%)] bg-[hsl(230,45%,12%)]">
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </CardContent>
          </Card>
        ) : inviteError ? (
          <Card className="border-red-500/30 bg-[hsl(230,45%,12%)]">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertCircle className="h-10 w-10 text-red-400" />
              <p className="text-white font-medium">Invite Not Found</p>
              <p className="text-sm text-muted-foreground">{inviteError}</p>
              <Button variant="outline" onClick={() => setLocation("/")} className="mt-2">
                Go to Home
              </Button>
            </CardContent>
          </Card>
        ) : done ? (
          <Card className="border-green-500/30 bg-[hsl(230,45%,12%)]">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-400" />
              <p className="text-white font-medium">Invitation Accepted!</p>
              <p className="text-sm text-muted-foreground">Taking you to the Projects page…</p>
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : (
          <Card className="border-[hsl(230,45%,18%)] bg-[hsl(230,45%,12%)]">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-2">
                <div className="p-3 rounded-full bg-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
              </div>
              <CardTitle className="text-white">Workspace Invitation</CardTitle>
              <CardDescription className="text-white/70">
                <strong className="text-white/80">{inviteInfo?.ownerName || inviteInfo?.ownerEmail}</strong> has invited
                you to collaborate on their Academy Toolkit workspace. You'll have access to their Project Manager.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {submitError && (
                <div className="flex items-center gap-2 rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {submitError}
                </div>
              )}

              {matchesSignedInUser ? (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-muted-foreground">
                    You're logged in as <span className="text-white">{user.email}</span>. Click below to accept.
                  </p>
                  <Button
                    className="w-full"
                    onClick={() => handleAccept()}
                    disabled={submitting}
                    data-testid="button-accept-invite"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Accept & Open Workspace
                  </Button>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void handleAccept(password); }}>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-email" className="text-white/80">Email (invitation sent to)</Label>
                    <Input
                      value={inviteInfo?.inviteEmail ?? ""}
                      id="invite-email"
                      name="username"
                      autoComplete="username"
                      readOnly
                      className="bg-[hsl(230,45%,8%)] border-[hsl(230,45%,20%)] text-white/60"
                      data-testid="input-invite-email"
                    />
                  </div>
                  {(!inviteInfo?.accountExists || inviteInfo.hasPassword) && <div className="space-y-1.5">
                    <Label htmlFor="invite-password" className="text-white/80">
                      {inviteInfo?.accountExists ? "Your existing FIA password" : "Create your personal FIA password"}
                    </Label>
                    <Input
                      type="password"
                      id="invite-password"
                      name="password"
                      autoComplete={inviteInfo?.accountExists ? "current-password" : "new-password"}
                      placeholder={inviteInfo?.accountExists ? "Enter your current password" : "At least 8 characters"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-[hsl(230,45%,8%)] border-[hsl(230,45%,20%)] text-white"
                      data-testid="input-invite-password"
                    />
                    <p className="text-xs text-white/70">
                      {inviteInfo?.accountExists
                        ? "You already have an FIA account. Use your existing login—joining this workspace won't change your password or replace your own workspace."
                        : "This is your own login, separate from the workspace owner's. You can use it for any workspace you're invited to."}
                    </p>
                  </div>}
                  {!inviteInfo?.accountExists && (
                    <div className="space-y-1.5">
                      <Label htmlFor="invite-password-confirm" className="text-white/80">Confirm your password</Label>
                      <Input id="invite-password-confirm" name="password-confirm" type="password" autoComplete="new-password"
                        value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                        className="bg-[hsl(230,45%,8%)] border-[hsl(230,45%,20%)] text-white"
                        data-testid="input-invite-password-confirm" />
                    </div>
                  )}
                  {user && !matchesSignedInUser && (
                    <p className="text-xs text-amber-200">
                      You're currently signed in with a different email. Use the invited email's login below, not the workspace owner's password.
                    </p>
                  )}
                  {inviteInfo?.accountExists && (
                    <div className="space-y-3">
                      {!inviteInfo.hasPassword && <p className="text-sm text-white/80">This account doesn't have a password yet. Sign in with Google or request a link to set one.</p>}
                      <button type="button" onClick={requestPasswordReset} disabled={resetBusy}
                        className="text-sm text-white underline underline-offset-4 disabled:opacity-50"
                        data-testid="button-invite-reset-password">
                        {resetBusy ? "Sending…" : inviteInfo.hasPassword ? "Forgot password?" : "Send a link to set my password"}
                      </button>
                      {resetSent && <p role="status" className="text-sm text-green-300">
                        Check your email for a reset link. After setting your password, select “Return to Your Invitation.”
                      </p>}
                      <a className="block text-sm text-white underline underline-offset-4"
                        href={`/api/auth/oauth/google?redirect=${encodeURIComponent(returnPath)}`} data-testid="link-invite-google">
                        Sign in with Google
                      </a>
                    </div>
                  )}
                  {(!inviteInfo?.accountExists || inviteInfo.hasPassword) && <Button
                    className="w-full"
                    type="submit"
                    disabled={submitting || !password || (!!inviteInfo?.accountExists && !inviteInfo.hasPassword) || (!inviteInfo?.accountExists && (!confirmPassword || password.length < 8))}
                    data-testid="button-accept-invite"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    {inviteInfo?.accountExists ? "Sign In & Join Workspace" : "Create Account & Join Workspace"}
                  </Button>}
                </form>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
