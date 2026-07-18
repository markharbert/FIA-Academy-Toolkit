import { useEffect, useRef, useState } from "react";
import logoImage from "@assets/academy_toolkit_logo_1776551500119.png";

type Stage = "verifying" | "success" | "error";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_token: "This login link is invalid or has already been used.",
  expired: "This login link has expired. Please return to the members area and click the button again.",
  already_used: "This login link has already been used. Please click the button in your members area to get a new one.",
  rate_limited: "Too many login attempts. Please wait a few minutes and try again.",
  cf_not_enrolled: "We couldn't verify an active membership for this account. Please contact support if you believe this is an error.",
  account_disabled: "This account has been disabled. Please contact support.",
  cf_api_error: "We had trouble reaching our membership system. Please try again in a moment.",
  missing_token: "No login token was provided. Please use the button inside your members area.",
  server_error: "Something went wrong on our end. Please try again.",
};

export default function CfMagicLoginPage() {
  const [stage, setStage] = useState<Stage>("verifying");
  const [errorKey, setErrorKey] = useState<string>("server_error");
  const minWaitDone = useRef(false);
  const apiFetchDone = useRef<{ success: boolean; error?: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("t") || "";
    const immediateError = params.get("error");

    const handleResult = (result: { success: boolean; error?: string }) => {
      apiFetchDone.current = result;
      if (minWaitDone.current) {
        if (result.success) {
          setStage("success");
          setTimeout(() => { window.location.href = "/dashboard"; }, 400);
        } else {
          setErrorKey(result.error || "server_error");
          setStage("error");
        }
      }
    };

    const timer = setTimeout(() => {
      minWaitDone.current = true;
      if (apiFetchDone.current !== null) {
        if (apiFetchDone.current.success) {
          setStage("success");
          setTimeout(() => { window.location.href = "/dashboard"; }, 400);
        } else {
          setErrorKey(apiFetchDone.current.error || "server_error");
          setStage("error");
        }
      }
    }, 3000);

    if (params.get("loading") === "1") {
      // Parent window will navigate us to the real token URL once it's ready — stay in spinner state.
      return () => clearTimeout(timer);
    } else if (immediateError) {
      handleResult({ success: false, error: immediateError });
    } else if (!token) {
      handleResult({ success: false, error: "missing_token" });
    } else {
      fetch("/api/auth/cf-magic-redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          handleResult({ success: data.success === true, error: data.error });
        })
        .catch(() => {
          handleResult({ success: false, error: "server_error" });
        });
    }

    return () => clearTimeout(timer);
  }, []);

  const errorMessage = ERROR_MESSAGES[errorKey] || ERROR_MESSAGES.server_error;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "hsl(230,75%,10%)" }}>
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <img src={logoImage} alt="Academy Toolkit" className="h-16 w-auto" />

        {stage === "verifying" && (
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="relative h-16 w-16">
              <div className="absolute inset-0 rounded-full border-4 border-white/10" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[hsl(203,54%,53%)] animate-spin" />
            </div>
            <div className="space-y-2">
              <p className="text-white text-lg font-semibold">Verifying Your Enrollment</p>
              <p className="text-white/60 text-sm leading-relaxed">
                Please wait while we confirm your membership&hellip;
              </p>
            </div>
          </div>
        )}

        {stage === "success" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="text-white text-lg font-semibold">You&rsquo;re in!</p>
              <p className="text-white/60 text-sm">Taking you to your dashboard&hellip;</p>
            </div>
          </div>
        )}

        {stage === "error" && (
          <div className="w-full flex flex-col items-center gap-6 text-center">
            <div className="h-16 w-16 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div className="space-y-2">
              <p className="text-white text-lg font-semibold">Login Failed</p>
              <p className="text-white/70 text-sm leading-relaxed">{errorMessage}</p>
            </div>
            <a
              data-testid="link-member-login"
              href="/member-login"
              className="w-full rounded-lg bg-[hsl(203,54%,53%)] hover:bg-[hsl(203,54%,45%)] text-white text-sm font-semibold py-3 px-4 text-center transition-colors"
            >
              Sign In with Email Link
            </a>
            <div className="w-full rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/70 leading-relaxed">
              <p className="font-medium text-white mb-1">Need help?</p>
              <p>
                Please reach out to{" "}
                <a
                  href="mailto:support@markharbert.com"
                  className="text-[hsl(203,54%,65%)] underline underline-offset-2 hover:text-[hsl(203,54%,80%)]"
                >
                  support@markharbert.com
                </a>{" "}
                and we&rsquo;ll get this sorted out for you.
              </p>
            </div>
            <button
              data-testid="button-cf-magic-retry"
              onClick={() => window.history.back()}
              className="text-sm text-white/50 hover:text-white/80 underline underline-offset-2 transition-colors"
            >
              &larr; Go back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
