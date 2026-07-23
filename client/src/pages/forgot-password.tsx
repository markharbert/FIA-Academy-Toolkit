import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import logoImage from "@assets/academy_toolkit_logo_1776551500119.png";

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPassword() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (data: ForgotPasswordInput) => {
      const res = await apiRequest("POST", "/api/auth/forgot-password", data);
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ForgotPasswordInput) => {
    forgotPasswordMutation.mutate(data);
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: "hsl(230,75%,10%)" }}
      data-testid="container-forgot-password"
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        <img src={logoImage} alt="Academy Toolkit" className="h-14 w-auto" data-testid="img-logo" />

        {submitted ? (
          <div className="w-full flex flex-col items-center gap-6 text-center" data-testid="container-forgot-password-success">
            <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="space-y-2">
              <p className="text-white text-lg font-semibold" data-testid="text-success-title">Check Your Email</p>
              <p className="text-white/60 text-sm leading-relaxed" data-testid="text-success-description">
                If an account exists for that email, we sent a reset link. Check your inbox and follow the instructions.
              </p>
            </div>
            <div className="w-full rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/60 leading-relaxed" data-testid="text-expiry-notice">
              The link will expire in 60 minutes.
            </div>
            <Link
              href="/login"
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white text-center transition-opacity hover:opacity-80 flex items-center justify-center gap-2 border border-white/20"
              style={{ background: "hsl(230,75%,18%)" }}
              data-testid="button-back-to-login"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Login
            </Link>
          </div>
        ) : (
          <div
            className="w-full rounded-2xl border border-white/10 p-8 space-y-6"
            style={{ background: "hsl(230,75%,14%)" }}
            data-testid="card-forgot-password"
          >
            <div className="text-center space-y-2">
              <h1 className="text-xl font-semibold text-white" data-testid="text-page-title">Set or Reset Your Password</h1>
              <p className="text-sm text-white/50 leading-relaxed" data-testid="text-page-description">
                Enter your email and we'll send you a link to set or reset your password. Works whether it's your first time or you've forgotten yours.
              </p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-white/80 text-sm">Email address</FormLabel>
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

                <button
                  type="submit"
                  disabled={forgotPasswordMutation.isPending}
                  data-testid="button-submit"
                  className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: "hsl(358,100%,43%)" }}
                >
                  {forgotPasswordMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send Me a Link"
                  )}
                </button>
              </form>
            </Form>

            <div className="text-center">
              <Link
                href="/login"
                className="text-sm text-white/40 hover:text-white/70 transition-colors inline-flex items-center gap-1"
                data-testid="link-login"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Login
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
