import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, AlertTriangle, Info } from "lucide-react";
import logoImage from "@assets/academy_toolkit_logo_1776551500119.png";

const SUPPORT_EMAIL = "support@markharbert.com";

const SupportLink = () => (
  <a href={`mailto:${SUPPORT_EMAIL}`} className="underline text-red-200 hover:text-white transition-colors">
    {SUPPORT_EMAIL}
  </a>
);

const CF_ERROR_MESSAGES: Record<string, { type: "error" | "info"; message: React.ReactNode }> = {
  cf_no_account: {
    type: "info",
    message: "No Academy Toolkit account found for this email. Create one below using your ClickFunnels email address.",
  },
  cf_not_enrolled: {
    type: "error",
    message: <>Your Fearless Influencer Academy membership is not active. Please contact support at <SupportLink />.</>,
  },
  cf_revoked: {
    type: "error",
    message: <>Your Fearless Influencer Academy membership has been revoked. Please contact support at <SupportLink />.</>,
  },
  account_disabled: {
    type: "error",
    message: <>Your account has been disabled. Please contact support at <SupportLink />.</>,
  },
  missing_email: {
    type: "error",
    message: "No email address was passed from ClickFunnels. Please try again or log in manually below.",
  },
  cf_api_error: {
    type: "error",
    message: "We couldn't verify your membership right now. Please log in manually below or try the button again in a moment.",
  },
  rate_limited: {
    type: "error",
    message: "Too many login attempts from your location. Please wait a few minutes and try again.",
  },
  session_error: {
    type: "error",
    message: "A session error occurred. Please try again.",
  },
  server_error: {
    type: "error",
    message: "Something went wrong. Please log in manually below.",
  },
};

export default function LoginPage() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [notice, setNotice] = useState<React.ReactNode | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const errorParam = params.get("error");
  const emailParam = params.get("email") || "";
  const rawRedirect = params.get("redirect") || "";
  // Only allow internal redirects (must start with /) to prevent open-redirect attacks
  const redirectTo = rawRedirect.startsWith("/") ? rawRedirect : "/dashboard";

  useEffect(() => {
    if (errorParam && CF_ERROR_MESSAGES[errorParam]) {
      const { type, message } = CF_ERROR_MESSAGES[errorParam];
      if (type === "error") setError(message);
      else setNotice(message);
    } else if (!errorParam && rawRedirect.startsWith("/")) {
      setNotice("Please sign in to continue.");
    }
  }, [errorParam]);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: emailParam,
      password: "",
    },
  });

  const onSubmit = async (data: LoginInput) => {
    setError(null);
    setNotice(null);
    setIsLoading(true);
    try {
      const loggedInUser = await login(data.email, data.password);
      // Collaborators default to Projects; everyone else honours the redirect param
      if (loggedInUser?.isCollaborator && redirectTo === "/dashboard") {
        setLocation("/projects");
      } else {
        setLocation(redirectTo);
      }
    } catch (err: any) {
      const code = err?.code;
      if (code === "cf_not_enrolled" || code === "cf_revoked") {
        setError(<>Your Fearless Influencer Academy membership is not active. Please contact support at <SupportLink />.</>);
      } else {
        setError(err instanceof Error ? err.message : "Login failed");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12" style={{ background: "hsl(230,75%,10%)" }}>
      <div className="flex flex-col items-center gap-8 w-full max-w-sm">
        <img src={logoImage} alt="Academy Toolkit" className="h-14 w-auto" />

        <div className="w-full rounded-2xl border border-white/10 p-8 space-y-6" style={{ background: "hsl(230,75%,14%)" }}>
          <div className="text-center space-y-2">
            <h1 className="text-xl font-semibold text-white" data-testid="text-login-title">Sign In</h1>
            <p className="text-sm text-white/50">Sign in to your Academy Toolkit account.</p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-300 flex items-start gap-2" data-testid="text-login-error">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3 text-sm text-blue-300 flex items-start gap-2" data-testid="text-login-notice">
              <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
              {notice}
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/80 text-sm">Email</FormLabel>
                    <FormControl>
                      <input
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        data-testid="input-email"
                        className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 border border-white/15 focus:outline-none focus:border-[hsl(203,54%,53%)] focus:ring-1 focus:ring-[hsl(203,54%,53%)] transition-colors"
                        style={{ background: "hsl(230,75%,10%)" }}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-white/80 text-sm">Password</FormLabel>
                    <FormControl>
                      <input
                        type="password"
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        data-testid="input-password"
                        className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 border border-white/15 focus:outline-none focus:border-[hsl(203,54%,53%)] focus:ring-1 focus:ring-[hsl(203,54%,53%)] transition-colors"
                        style={{ background: "hsl(230,75%,10%)" }}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              <button
                type="submit"
                disabled={isLoading}
                data-testid="button-login-submit"
                className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: "hsl(358,100%,43%)" }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  "Log in"
                )}
              </button>
            </form>
          </Form>

          <div className="flex flex-col items-center gap-2 pt-1">
            <Link
              href="/forgot-password"
              className="text-sm text-white/40 hover:text-white/70 transition-colors"
              data-testid="link-forgot-password"
            >
              Forgot your password?
            </Link>
            <Link
              href="/forgot-password?firsttime=1"
              className="text-sm text-white/40 hover:text-white/70 transition-colors"
              data-testid="link-first-time"
            >
              First time signing in? Set your password →
            </Link>
          </div>
        </div>

        <div className="text-center">
          <span className="text-sm text-white/30">Not a member? </span>
          <a
            href="https://www.fearlessinfluencer.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-white/50 hover:text-white/80 transition-colors"
            data-testid="link-not-a-member"
          >
            Learn how to join →
          </a>
        </div>
      </div>
    </div>
  );
}
