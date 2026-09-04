import { useState } from "react";
import logoImage from "@assets/image_1788559097620.png";

type Stage = "idle" | "loading" | "success" | "error";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_email: "Please enter a valid email address.",
  account_disabled: "This account has been disabled. Please contact support.",
  cf_not_enrolled: "We couldn't verify an active membership for this email. If you believe this is an error, please contact support@markharbert.com.",
  cf_api_error: "We couldn't verify your membership right now. Please try again in a moment.",
  rate_limited: "Too many login requests. Please wait 15 minutes and try again.",
  server_error: "Something went wrong. Please try again.",
  invalid_token: "This login link is invalid. Please request a new one.",
  expired: "This login link has expired. Please request a new one.",
  already_used: "This login link has already been used. Please request a new one.",
};

export default function MemberLoginPage() {
  const [stage, setStage] = useState<Stage>("idle");
  const [email, setEmail] = useState("");
  const [errorKey, setErrorKey] = useState("server_error");

  const errorParam = new URLSearchParams(window.location.search).get("error");
  const initialError = errorParam && ERROR_MESSAGES[errorParam] ? errorParam : null;

  const [tokenError] = useState<string | null>(initialError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStage("loading");
    try {
      const res = await fetch("/api/auth/request-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorKey(data.error || "server_error");
        setStage("error");
        return;
      }
      setStage("success");
    } catch {
      setErrorKey("server_error");
      setStage("error");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "hsl(230,75%,10%)" }}>
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <img src={logoImage} alt="Academy Toolkit" className="h-16 w-auto" />

        {tokenError && stage === "idle" && (
          <div className="w-full rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-300 text-center leading-relaxed">
            {ERROR_MESSAGES[tokenError]}
          </div>
        )}

        {stage !== "success" && (
          <div className="w-full rounded-2xl border border-white/10 p-8 space-y-6" style={{ background: "hsl(230,75%,14%)" }}>
            <div className="text-center space-y-2">
              <h1 className="text-xl font-semibold text-white" data-testid="text-member-login-title">
                Member Sign-In
              </h1>
              <p className="text-sm text-white/50 leading-relaxed">
                Enter your email and we'll send you a one-click login link — no password needed.
              </p>
            </div>

            {stage === "error" && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-300 text-center" data-testid="text-magic-link-error">
                {ERROR_MESSAGES[errorKey] || ERROR_MESSAGES.server_error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-white/80 mb-1.5">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                  disabled={stage === "loading"}
                  data-testid="input-member-email"
                  className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 border border-white/15 focus:outline-none focus:border-[hsl(203,54%,53%)] focus:ring-1 focus:ring-[hsl(203,54%,53%)] transition-colors disabled:opacity-50"
                  style={{ background: "hsl(230,75%,10%)" }}
                />
              </div>

              <button
                type="submit"
                disabled={stage === "loading" || !email.trim()}
                data-testid="button-send-magic-link"
                className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: "hsl(358,100%,43%)" }}
              >
                {stage === "loading" ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Sending link...
                  </>
                ) : (
                  "Send me a login link"
                )}
              </button>
            </form>
          </div>
        )}

        {stage === "success" && (
          <div className="w-full flex flex-col items-center gap-6 text-center" data-testid="text-magic-link-success">
            <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="space-y-2">
              <p className="text-white text-lg font-semibold">Check your inbox!</p>
              <p className="text-white/60 text-sm leading-relaxed">
                We sent a login link to <strong className="text-white/80">{email}</strong>.<br/>
                The link expires in 20 minutes and can only be used once.
              </p>
            </div>
            <div className="w-full rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/60 leading-relaxed">
              <p className="font-medium text-white/80 mb-1">Didn't get the email?</p>
              <p>Check your spam folder, or{" "}
                <button
                  onClick={() => { setStage("idle"); setEmail(""); }}
                  className="text-[hsl(203,54%,65%)] underline underline-offset-2 hover:text-[hsl(203,54%,80%)] transition-colors"
                  data-testid="button-try-again"
                >
                  try again
                </button>.
              </p>
            </div>
          </div>
        )}

        <p className="text-xs text-white/30 text-center">
          This login is for Academy members only.
        </p>
      </div>
    </div>
  );
}
