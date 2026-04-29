import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import logoImage from "@assets/academy_toolkit_logo_1776551500119.png";
import { apiRequest } from "@/lib/queryClient";

type Stage = "verifying" | "success" | "error";

const ERROR_MESSAGES: Record<string, string> = {
  cf_not_enrolled: "We weren't able to verify an active membership for this email address.",
  account_disabled: "This account has been disabled.",
  cf_api_error: "We had trouble reaching our membership system. Please try again in a moment.",
  rate_limited: "Too many login attempts. Please wait a few minutes and try again.",
  missing_email: "No email address was provided. Please use the login button inside the members area.",
  server_error: "Something went wrong on our end. Please try again.",
};

export default function CfLoginPage() {
  const [, setLocation] = useLocation();
  const [stage, setStage] = useState<Stage>("verifying");
  const [errorKey, setErrorKey] = useState<string>("server_error");
  const minWaitDone = useRef(false);
  const apiFetchDone = useRef<{ success: boolean; error?: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const email = params.get("email") || "";
    const immediateError = params.get("error");

    // If the GET redirect already put us in an error state, still show
    // the spinner for the minimum time before revealing the error.
    const handleResult = (result: { success: boolean; error?: string }) => {
      apiFetchDone.current = result;
      if (minWaitDone.current) {
        if (result.success) {
          setStage("success");
          // Short moment to let the success state render, then navigate
          setTimeout(() => setLocation("/dashboard"), 400);
        } else {
          setErrorKey(result.error || "server_error");
          setStage("error");
        }
      }
    };

    // Minimum display time: 5 seconds
    const timer = setTimeout(() => {
      minWaitDone.current = true;
      if (apiFetchDone.current !== null) {
        if (apiFetchDone.current.success) {
          setStage("success");
          setTimeout(() => setLocation("/dashboard"), 400);
        } else {
          setErrorKey(apiFetchDone.current.error || "server_error");
          setStage("error");
        }
      }
    }, 5000);

    if (immediateError) {
      // Already errored before reaching this page (e.g. missing email)
      handleResult({ success: false, error: immediateError });
    } else if (!email) {
      handleResult({ success: false, error: "missing_email" });
    } else {
      apiRequest("POST", "/api/auth/cf-login-ajax", { email })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          handleResult({ success: data.success === true, error: data.error });
        })
        .catch(() => {
          handleResult({ success: false, error: "server_error" });
        });
    }

    return () => clearTimeout(timer);
  }, [setLocation]);

  const errorMessage = ERROR_MESSAGES[errorKey] || ERROR_MESSAGES.server_error;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[hsl(230,45%,8%)] px-4">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <img src={logoImage} alt="Academy Toolkit" className="h-16 w-auto" />

        {stage === "verifying" && (
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="relative h-16 w-16">
              <div className="absolute inset-0 rounded-full border-4 border-white/10" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[hsl(262,83%,68%)] animate-spin" />
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
              <p className="text-white text-lg font-semibold">We Couldn&rsquo;t Verify Your Enrollment</p>
              <p className="text-white/70 text-sm leading-relaxed">{errorMessage}</p>
            </div>
            <div className="w-full rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/70 leading-relaxed">
              <p className="font-medium text-white mb-1">Need help?</p>
              <p>
                Please reach out to support at{" "}
                <a
                  href="https://markharbert.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[hsl(262,83%,78%)] underline underline-offset-2 hover:text-[hsl(262,83%,88%)]"
                >
                  markharbert.com
                </a>{" "}
                and we&rsquo;ll get this sorted out for you.
              </p>
            </div>
            <button
              data-testid="button-cf-retry"
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
