import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, AlertTriangle, Info } from "lucide-react";
import logoImage from "@assets/academy_toolkit_logo_1776551500119.png";

const CF_ERROR_MESSAGES: Record<string, { type: "error" | "info"; message: string }> = {
  cf_no_account: {
    type: "info",
    message: "No Academy Toolkit account found for this email. Create one below using your ClickFunnels email address.",
  },
  cf_not_enrolled: {
    type: "error",
    message: "Your membership doesn't include access to the Academy Toolkit. Please contact support if you believe this is an error.",
  },
  cf_revoked: {
    type: "error",
    message: "Your ClickFunnels membership has been revoked. Please reactivate your membership to continue.",
  },
  account_disabled: {
    type: "error",
    message: "Your account has been disabled. Please contact support.",
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
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const params = new URLSearchParams(window.location.search);
  const errorParam = params.get("error");
  const emailParam = params.get("email") || "";

  useEffect(() => {
    if (errorParam && CF_ERROR_MESSAGES[errorParam]) {
      const { type, message } = CF_ERROR_MESSAGES[errorParam];
      if (type === "error") setError(message);
      else setNotice(message);
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
      // Collaborators go straight to Projects — that's their workspace
      if (loggedInUser?.isCollaborator) {
        setLocation("/projects");
      } else {
        setLocation("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
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
            <h1 className="text-xl font-semibold text-white" data-testid="text-login-title">Admins &amp; Collaborators</h1>
            <p className="text-sm text-white/50">This login is for admins and invited workspace collaborators only.</p>
            <p className="text-xs text-white/30">Academy members access the Toolkit through the Fearless Influencer Academy portal.</p>
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

              <div className="flex items-center justify-end">
                <Link
                  href="/forgot-password"
                  className="text-sm text-white/40 hover:text-white/70 transition-colors"
                  data-testid="link-forgot-password"
                >
                  Forgot password?
                </Link>
              </div>

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
        </div>
      </div>
    </div>
  );
}
