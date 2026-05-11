import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Users, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import logoImage from "@assets/academy_toolkit_logo_1776551500119.png";

interface InviteInfo {
  ownerName: string;
  ownerEmail: string;
  inviteEmail: string;
  status: string;
}

export default function WorkspaceInviteAcceptPage() {
  const [, setLocation] = useLocation();
  const { user, refetch } = useAuth();
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
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

  // If user is already logged in, try auto-accepting
  useEffect(() => {
    if (!user || !inviteInfo || done) return;
    if (user.email?.toLowerCase() !== inviteInfo.inviteEmail.toLowerCase()) return;
    handleAccept();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, inviteInfo]);

  async function handleAccept(pw?: string) {
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
      await refetch();
      setDone(true);
      setTimeout(() => setLocation("/projects"), 1500);
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

        {loadingInvite ? (
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
              <CardDescription>
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

              {user && user.email?.toLowerCase() === inviteInfo?.inviteEmail.toLowerCase() ? (
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
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-white/80">Email (invitation sent to)</Label>
                    <Input
                      value={inviteInfo?.inviteEmail ?? ""}
                      readOnly
                      className="bg-[hsl(230,45%,8%)] border-[hsl(230,45%,20%)] text-white/60"
                      data-testid="input-invite-email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-white/80">
                      {user ? "Your account email doesn't match — log in with the right account or enter a password to create one" : "Set a password for your collaborator account"}
                    </Label>
                    <Input
                      type="password"
                      placeholder="Create or enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAccept(password); }}
                      className="bg-[hsl(230,45%,8%)] border-[hsl(230,45%,20%)] text-white"
                      data-testid="input-invite-password"
                    />
                    <p className="text-xs text-muted-foreground">
                      If an account already exists for this email, this will log you in. Otherwise, a new account will be created.
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => handleAccept(password)}
                    disabled={submitting || !password}
                    data-testid="button-accept-invite"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Accept Invitation
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
