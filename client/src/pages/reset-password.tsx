import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import logoImage from "@assets/image_1788559097620.png";

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export default function ResetPassword() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const token = params.get("token");
  const [success, setSuccess] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (data: ResetPasswordInput) => {
      const res = await apiRequest("POST", "/api/auth/reset-password", {
        token,
        newPassword: data.newPassword,
      });
      return res.json();
    },
    onSuccess: () => {
      setSuccess(true);
      toast({ title: "Password Reset", description: "Your password has been reset successfully." });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reset password. The link may be invalid or expired.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ResetPasswordInput) => {
    resetPasswordMutation.mutate(data);
  };

  const EyeIcon = ({ open }: { open: boolean }) => open ? (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "hsl(230,75%,10%)" }}
      data-testid="container-reset-password"
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <img src={logoImage} alt="Academy Toolkit" className="h-14 w-auto" data-testid="img-logo" />

        {/* Invalid token */}
        {!token && (
          <div
            className="w-full rounded-2xl border border-white/10 p-8 space-y-6 text-center"
            style={{ background: "hsl(230,75%,14%)" }}
            data-testid="container-invalid-link"
          >
            <div className="flex flex-col items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="space-y-1">
                <p className="text-white font-semibold text-lg" data-testid="text-invalid-title">Invalid Link</p>
                <p className="text-white/50 text-sm leading-relaxed" data-testid="text-invalid-description">
                  This password reset link is invalid. Please request a new one.
                </p>
              </div>
            </div>
            <Link
              href="/forgot-password"
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white flex items-center justify-center transition-opacity hover:opacity-80"
              style={{ background: "hsl(358,100%,43%)" }}
              data-testid="button-request-new-link"
            >
              Request New Link
            </Link>
          </div>
        )}

        {/* Success */}
        {token && success && (
          <div className="w-full flex flex-col items-center gap-6 text-center" data-testid="container-reset-success">
            <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="space-y-2">
              <p className="text-white text-lg font-semibold" data-testid="text-success-title">Password Reset</p>
              <p className="text-white/60 text-sm leading-relaxed" data-testid="text-success-description">
                Your password has been reset successfully. You can now log in with your new password.
              </p>
            </div>
            <Link
              href="/"
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white text-center flex items-center justify-center transition-opacity hover:opacity-80"
              style={{ background: "hsl(358,100%,43%)" }}
              data-testid="button-go-to-login"
            >
              Go to Login
            </Link>
          </div>
        )}

        {/* Form */}
        {token && !success && (
          <div
            className="w-full rounded-2xl border border-white/10 p-8 space-y-6"
            style={{ background: "hsl(230,75%,14%)" }}
            data-testid="card-reset-password"
          >
            <div className="text-center space-y-2">
              <h1 className="text-xl font-semibold text-white" data-testid="text-page-title">Set New Password</h1>
              <p className="text-sm text-white/50 leading-relaxed" data-testid="text-page-description">
                Enter your new password below.
              </p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white/80 text-sm">New password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <input
                            type={showNew ? "text" : "password"}
                            placeholder="At least 8 characters"
                            autoComplete="new-password"
                            data-testid="input-new-password"
                            className="w-full rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder-white/30 border border-white/15 focus:outline-none focus:border-[hsl(203,54%,53%)] focus:ring-1 focus:ring-[hsl(203,54%,53%)] transition-colors"
                            style={{ background: "hsl(230,75%,10%)" }}
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowNew((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                            tabIndex={-1}
                          >
                            <EyeIcon open={showNew} />
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white/80 text-sm">Confirm password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <input
                            type={showConfirm ? "text" : "password"}
                            placeholder="Repeat your new password"
                            autoComplete="new-password"
                            data-testid="input-confirm-password"
                            className="w-full rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder-white/30 border border-white/15 focus:outline-none focus:border-[hsl(203,54%,53%)] focus:ring-1 focus:ring-[hsl(203,54%,53%)] transition-colors"
                            style={{ background: "hsl(230,75%,10%)" }}
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirm((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                            tabIndex={-1}
                          >
                            <EyeIcon open={showConfirm} />
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />

                <button
                  type="submit"
                  disabled={resetPasswordMutation.isPending}
                  data-testid="button-submit"
                  className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: "hsl(358,100%,43%)" }}
                >
                  {resetPasswordMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Set Password"
                  )}
                </button>
              </form>
            </Form>

            <div className="text-center">
              <Link
                href="/forgot-password"
                className="text-sm text-white/40 hover:text-white/70 transition-colors inline-flex items-center gap-1"
                data-testid="link-forgot-password"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Request a new link
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
