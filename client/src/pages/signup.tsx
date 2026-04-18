import { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Loader2, Mail } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import logoImage from "@assets/academy_toolkit_logo_1776551500119.png";

const signupFormSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  emailConsent: z.boolean().refine((val) => val === true, {
    message: "You must agree to receive emails to create an account",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignupFormInput = z.infer<typeof signupFormSchema>;

export default function SignupPage() {
  const { signup } = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | null>(null);
  const [showEmailSignup, setShowEmailSignup] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const errorType = params.get("error");
    if (errorType === "oauth_failed") {
      setError("Signup failed. Please try again or use email/password.");
      setShowEmailSignup(true);
    } else if (errorType === "oauth_not_configured") {
      setError("This signup method is not available. Please use email/password.");
      setShowEmailSignup(true);
    }
  }, [searchString]);

  const form = useForm<SignupFormInput>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
      emailConsent: false,
    },
  });

  const onSubmit = async (data: SignupFormInput) => {
    setError(null);
    setIsLoading(true);
    try {
      await signup(data.email, data.password, {
        emailConsent: data.emailConsent,
        firstName: data.firstName,
        lastName: data.lastName,
      });
      setLocation("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <img src={logoImage} alt="Academy Toolkit" className="h-10 mx-auto" />
          </div>
          <CardTitle className="text-2xl" data-testid="text-signup-title">Create your account</CardTitle>
          <CardDescription>
            Start creating videos that actually convert
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="text-signup-error">
              {error}
            </div>
          )}

          <Button
            variant="default"
            size="lg"
            className="w-full h-12"
            onClick={() => {
              setOauthLoading("google");
              window.location.href = "/api/auth/oauth/google";
            }}
            disabled={oauthLoading !== null}
            data-testid="button-oauth-google"
          >
            {oauthLoading === "google" ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <SiGoogle className="mr-2 h-5 w-5" />
            )}
            Continue with Google
          </Button>

          {!showEmailSignup ? (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowEmailSignup(true)}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-show-email-signup"
              >
                <Mail className="h-4 w-4" />
                Sign up with email instead
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or use email</span>
                </div>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              placeholder="John"
                              autoComplete="given-name"
                              data-testid="input-first-name"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              placeholder="Doe"
                              autoComplete="family-name"
                              data-testid="input-last-name"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
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
                            placeholder="At least 8 characters"
                            autoComplete="new-password"
                            data-testid="input-password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            placeholder="Confirm your password"
                            autoComplete="new-password"
                            data-testid="input-confirm-password"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="emailConsent"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-email-consent"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-normal">
                            I agree to receive emails related to my account and training.
                          </FormLabel>
                          <FormMessage />
                        </div>
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-signup-submit">
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      "Create account"
                    )}
                  </Button>
                </form>
              </Form>
            </>
          )}

          <div className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-brand-light hover:underline" data-testid="link-login">
              Log in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
