import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      await login(data.email, data.password);
      setLocation("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 bg-sidebar">
      <div className="flex flex-col items-center gap-6 w-full max-w-md">
        <img src={logoImage} alt="Academy Toolkit" className="h-14" />
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl" data-testid="text-login-title">Admin Login</CardTitle>
          <CardDescription>
            Members access this app through the Fearless Influencer Academy portal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2" data-testid="text-login-error">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {notice && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-sm text-blue-800 dark:text-blue-300 flex items-start gap-2" data-testid="text-login-notice">
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
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        data-testid="input-email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        data-testid="input-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-end">
                <Link
                  href="/forgot-password"
                  className="text-sm text-muted-foreground hover:text-foreground"
                  data-testid="link-forgot-password"
                >
                  Forgot password?
                </Link>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-login-submit">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Logging in...
                  </>
                ) : (
                  "Log in"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
