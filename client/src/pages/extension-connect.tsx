import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { AlertTriangle, ArrowUpRight, Check, Clock3, Loader2, ShieldCheck, X } from "lucide-react";

interface ExtensionRequest {
  userCode: string;
  deviceLabel: string;
  expiresAt: string;
  status: string;
  csrfToken: string;
}

type Outcome = "approved" | "denied" | null;

function formatExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "an unknown time";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function ExtensionConnectPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [request, setRequest] = useState<ExtensionRequest | null>(null);
  const [requestLoading, setRequestLoading] = useState(true);
  const [requestError, setRequestError] = useState("");
  const [actionError, setActionError] = useState("");
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requestId = useMemo(() => new URLSearchParams(window.location.search).get("request")?.trim() ?? "", []);

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      window.location.replace(`/?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    if (!requestId) {
      setRequestError("This connection link is missing its request ID. Start again from the extension.");
      setRequestLoading(false);
      return;
    }

    const controller = new AbortController();
    setRequestLoading(true);
    fetch(`/api/extension/auth/request/${encodeURIComponent(requestId)}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          if (response.status === 404 || response.status === 410) {
            throw new Error("This connection request has expired or is no longer available. Start a new request in the extension.");
          }
          throw new Error("We couldn't load this connection request. Please try again.");
        }
        return response.json() as Promise<ExtensionRequest>;
      })
      .then((data) => {
        if (
          typeof data?.userCode !== "string" ||
          !data.userCode.trim() ||
          typeof data?.deviceLabel !== "string" ||
          !data.deviceLabel.trim() ||
          typeof data?.expiresAt !== "string" ||
          typeof data?.status !== "string" ||
          typeof data?.csrfToken !== "string" ||
          !data.csrfToken
        ) {
          throw new Error("The connection request could not be verified. Start a new request in the extension.");
        }
        setRequest(data);
        setRequestError("");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRequest(null);
        setRequestError(error instanceof Error ? error.message : "We couldn't load this connection request.");
      })
      .finally(() => setRequestLoading(false));

    return () => controller.abort();
  }, [isAuthLoading, user, requestId]);

  const expiration = request ? new Date(request.expiresAt).getTime() : Number.NaN;
  const expired = request ? !Number.isFinite(expiration) || expiration <= Date.now() : false;
  const canRespond = Boolean(request && request.status.toLowerCase() === "pending" && !expired && !outcome);

  async function respond(decision: "approve" | "deny") {
    const stillPending = request?.status.toLowerCase() === "pending";
    const stillValid = request && Number.isFinite(new Date(request.expiresAt).getTime()) && new Date(request.expiresAt).getTime() > Date.now();
    if (!request || !stillPending || !stillValid || outcome || isSubmitting) return;
    setIsSubmitting(true);
    setActionError("");
    try {
      const response = await fetch("/api/extension/auth/approve", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, csrfToken: request.csrfToken, decision }),
      });
      if (!response.ok) {
        if (response.status === 404 || response.status === 410 || response.status === 409) {
          setRequest((current) => current ? { ...current, status: "expired" } : current);
          throw new Error("This request has expired or was already handled. Start a new request in the extension.");
        }
        throw new Error("Your choice couldn't be saved. Please try again.");
      }
      setOutcome(decision === "approve" ? "approved" : "denied");
      setRequest((current) => current ? { ...current, status: decision === "approve" ? "approved" : "denied" } : current);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Your choice couldn't be saved. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isAuthLoading || (!user && !requestError)) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[hsl(230,75%,10%)] px-5 text-white" aria-label="Loading account">
        <div className="flex items-center gap-3 text-sm text-white/65" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-[hsl(203,54%,53%)]" />
          Checking your account…
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[hsl(230,75%,10%)] px-5 py-12 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,hsl(203_54%_53%_/_0.16),transparent_68%)]" />
      <section className="relative w-full max-w-xl">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-[hsl(203,54%,53%/0.3)] bg-[hsl(203,54%,53%/0.12)] text-[hsl(203,70%,72%)]">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(203,65%,68%)]">Academy Toolkit</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Connect your extension</h1>
          <p className="mt-3 text-sm leading-6 text-white/60">Approve a secure browser session for your member account.</p>
          <p className="mt-2 text-sm text-white/80">Signed in as {user?.email || user?.displayName}.</p>
        </header>

        <div className="rounded-2xl border border-white/10 bg-[hsl(230,75%,14%)] p-6 shadow-[0_24px_80px_-36px_hsl(230_75%_3%_/_0.85)] sm:p-8">
          {requestLoading ? (
            <div className="space-y-5" role="status" aria-label="Loading connection request">
              <div className="h-4 w-36 animate-pulse rounded bg-white/10" />
              <div className="h-24 animate-pulse rounded-xl bg-white/5" />
              <div className="h-10 animate-pulse rounded-lg bg-white/5" />
            </div>
          ) : requestError ? (
            <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-5" role="alert">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" aria-hidden="true" />
                <div>
                  <h2 className="font-medium text-amber-100">Request unavailable</h2>
                  <p className="mt-2 text-sm leading-6 text-white/65">{requestError}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-5 rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/85 transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-[hsl(203,54%,53%)]"
              >
                Try again
              </button>
            </div>
          ) : request ? (
            <>
              {outcome ? (
                <div className={`rounded-xl border p-5 ${outcome === "approved" ? "border-emerald-300/20 bg-emerald-300/5" : "border-white/10 bg-white/[0.03]"}`} role="status">
                  <div className="flex items-start gap-3">
                    {outcome === "approved" ? <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" /> : <X className="mt-0.5 h-5 w-5 shrink-0 text-white/60" aria-hidden="true" />}
                    <div>
                      <h2 className="font-semibold">{outcome === "approved" ? "Connection approved" : "Not connected"}</h2>
                      <p className="mt-1 text-sm leading-6 text-white/65">
                        {outcome === "approved" ? "Open the browser extension to finish setting up your session." : "The extension was not connected. You can close this page."}
                      </p>
                    </div>
                  </div>
                </div>
              ) : expired || request.status.toLowerCase() !== "pending" ? (
                <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-5" role="alert">
                  <div className="flex gap-3">
                    <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" aria-hidden="true" />
                    <div>
                      <h2 className="font-semibold text-amber-100">This request can’t be approved</h2>
                      <p className="mt-1 text-sm leading-6 text-white/65">It may have expired or already been handled. Start a new connection request from the extension.</p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-6">
                    <p className="text-sm text-white/60">A browser extension is requesting access from</p>
                    <h2 className="mt-1 text-lg font-semibold">{request.deviceLabel}</h2>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[hsl(230,75%,10%)] px-5 py-5 text-center">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/45">Compare this code with your extension</p>
                    <p className="mt-3 font-mono text-3xl font-semibold tracking-[0.18em] text-[hsl(203,75%,76%)] sm:text-4xl" aria-label={`Verification code ${request.userCode}`}>
                      {request.userCode}
                    </p>
                    <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-white/45">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      Expires {formatExpiry(request.expiresAt)}
                    </p>
                  </div>

                  <div className="mt-5 rounded-lg border border-amber-200/20 bg-amber-200/[0.06] p-4" role="note">
                    <div className="flex gap-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />
                      <p className="text-sm leading-5 text-amber-50/80">
                        Only approve if you started this request yourself and the code above matches the code shown by your extension. If you didn’t start it, choose “Deny” and close this page.
                      </p>
                    </div>
                  </div>

                  {actionError && <p className="mt-4 text-sm text-red-200" role="alert">{actionError}</p>}
                  <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={() => respond("deny")}
                      disabled={isSubmitting}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/15 px-5 text-sm font-semibold text-white/80 transition hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-white/40 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}
                      Deny
                    </button>
                    <button
                      type="button"
                      onClick={() => respond("approve")}
                      data-testid="button-approve-extension"
                      disabled={isSubmitting}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[hsl(203,54%,53%)] px-5 text-sm font-semibold text-[hsl(230,75%,10%)] transition hover:bg-[hsl(203,62%,63%)] focus:outline-none focus:ring-2 focus:ring-[hsl(203,70%,75%)] focus:ring-offset-2 focus:ring-offset-[hsl(230,75%,14%)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                      Approve connection
                    </button>
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-white/35">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Your approval creates a persistent session on this device.
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </p>
      </section>
    </main>
  );
}
