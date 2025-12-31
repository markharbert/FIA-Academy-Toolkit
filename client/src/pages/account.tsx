import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, User, Mail, Lock, Link as LinkIcon, RefreshCw, ExternalLink, Check, X } from "lucide-react";
import { SiGoogle } from "react-icons/si";

interface AccountData {
  id: string;
  email: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  emailVerifiedAt: string | null;
  emailConsentAt: string | null;
  createdAt: string;
  connectedProviders: string[];
  hasPassword: boolean;
}

const profileFormSchema = z.object({
  displayName: z.string().max(40, "Display name must be 40 characters or less").optional(),
  firstName: z.string().max(40, "First name must be 40 characters or less").optional(),
  lastName: z.string().max(40, "Last name must be 40 characters or less").optional(),
  email: z.string().email("Please enter a valid email address").optional().or(z.literal("")),
});

const setPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ProfileFormInput = z.infer<typeof profileFormSchema>;
type SetPasswordInput = z.infer<typeof setPasswordSchema>;

function getGravatarUrl(email: string | null, size = 200): string {
  if (!email) return `https://www.gravatar.com/avatar/?s=${size}&d=identicon`;
  const trimmedEmail = email.trim().toLowerCase();
  return `https://www.gravatar.com/avatar/${md5(trimmedEmail)}?s=${size}&d=identicon`;
}

function md5(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(32, "0");
}

export default function AccountPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [gravatarKey, setGravatarKey] = useState(Date.now());
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  const { data: account, isLoading } = useQuery<AccountData>({
    queryKey: ["/api/account"],
    enabled: !!user,
  });

  const profileForm = useForm<ProfileFormInput>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      displayName: "",
      firstName: "",
      lastName: "",
      email: "",
    },
    values: account ? {
      displayName: account.displayName || "",
      firstName: account.firstName || "",
      lastName: account.lastName || "",
      email: account.email || "",
    } : undefined,
  });

  const passwordForm = useForm<SetPasswordInput>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormInput) => {
      const response = await apiRequest("PATCH", "/api/account", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/account"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Profile updated", description: "Your profile has been saved." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: async (data: { password: string }) => {
      const response = await apiRequest("POST", "/api/account/set-password", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/account"] });
      toast({ title: "Password set", description: "You can now log in with email and password." });
      setShowSetPassword(false);
      passwordForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const response = await apiRequest("DELETE", `/api/account/identities/${provider}`);
      return response.json();
    },
    onSuccess: (_, provider) => {
      queryClient.invalidateQueries({ queryKey: ["/api/account"] });
      toast({ title: "Disconnected", description: `${provider} has been disconnected.` });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const onProfileSubmit = (data: ProfileFormInput) => {
    updateProfileMutation.mutate(data);
  };

  const onSetPassword = (data: SetPasswordInput) => {
    setPasswordMutation.mutate({ password: data.password });
  };

  const handleConnect = (provider: string) => {
    setConnectingProvider(provider);
    window.location.href = `/api/account/connect/${provider}`;
  };

  const handleDisconnect = (provider: string) => {
    disconnectMutation.mutate(provider);
  };

  const refreshGravatar = () => {
    setGravatarKey(Date.now());
    toast({ title: "Image refreshed", description: "Your Gravatar image has been refreshed." });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Unable to load account information.</p>
      </div>
    );
  }

  const providers = [
    { id: "google", name: "Google", icon: SiGoogle },
  ];

  const canDisconnect = (provider: string) => {
    const otherProviders = account.connectedProviders.filter((p) => p !== provider);
    return account.hasPassword || otherProviders.length > 0;
  };

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-8" data-testid="text-account-title">Account</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-start gap-4 pb-4">
            <Avatar className="h-20 w-20">
              <AvatarImage 
                src={`${getGravatarUrl(account.email)}&v=${gravatarKey}`} 
                alt={account.displayName || "Profile"} 
              />
              <AvatarFallback>
                <User className="h-8 w-8" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <CardTitle data-testid="text-profile-name">
                {account.displayName || account.firstName || "Your Profile"}
              </CardTitle>
              <CardDescription className="mt-1">
                {account.email || "No email set"}
              </CardDescription>
              <div className="flex items-center gap-2 mt-3">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={refreshGravatar}
                  data-testid="button-refresh-gravatar"
                >
                  <RefreshCw className="h-3 w-3 mr-2" />
                  Refresh Image
                </Button>
                <a
                  href="https://gravatar.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex"
                >
                  <Button variant="ghost" size="sm" data-testid="link-gravatar">
                    Change on Gravatar
                    <ExternalLink className="h-3 w-3 ml-2" />
                  </Button>
                </a>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile Information
            </CardTitle>
            <CardDescription>
              Update your personal information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                <FormField
                  control={profileForm.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="How you want to be called"
                          data-testid="input-display-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={profileForm.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="John"
                            data-testid="input-first-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={profileForm.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Doe"
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
                  control={profileForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          data-testid="input-email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                      {!account.email && (
                        <p className="text-sm text-muted-foreground">
                          Add an email to enable password login and email features.
                        </p>
                      )}
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  disabled={updateProfileMutation.isPending}
                  data-testid="button-save-profile"
                >
                  {updateProfileMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5" />
              Connected Sign-In Methods
            </CardTitle>
            <CardDescription>
              Manage how you sign in to your account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">Email & Password</p>
                  <p className="text-sm text-muted-foreground">
                    {account.hasPassword ? "Password set" : "No password set"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {account.hasPassword ? (
                  <Badge variant="secondary" className="gap-1">
                    <Check className="h-3 w-3" />
                    Connected
                  </Badge>
                ) : (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowSetPassword(true)}
                    data-testid="button-set-password"
                  >
                    Set Password
                  </Button>
                )}
              </div>
            </div>

            {showSetPassword && !account.hasPassword && (
              <div className="rounded-lg border p-4 space-y-4">
                <Form {...passwordForm}>
                  <form onSubmit={passwordForm.handleSubmit(onSetPassword)} className="space-y-4">
                    <FormField
                      control={passwordForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="At least 8 characters"
                              data-testid="input-new-password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={passwordForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Confirm your password"
                              data-testid="input-confirm-new-password"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex gap-2">
                      <Button 
                        type="submit" 
                        disabled={setPasswordMutation.isPending}
                        data-testid="button-submit-password"
                      >
                        {setPasswordMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Setting...
                          </>
                        ) : (
                          "Set Password"
                        )}
                      </Button>
                      <Button 
                        type="button" 
                        variant="ghost"
                        onClick={() => setShowSetPassword(false)}
                        data-testid="button-cancel-password"
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
            )}

            <Separator />

            {providers.map((provider) => {
              const isConnected = account.connectedProviders.includes(provider.id);
              const Icon = provider.icon;
              
              return (
                <div key={provider.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{provider.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {isConnected ? "Connected" : "Not connected"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isConnected ? (
                      <>
                        <Badge variant="secondary" className="gap-1">
                          <Check className="h-3 w-3" />
                          Connected
                        </Badge>
                        {canDisconnect(provider.id) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDisconnect(provider.id)}
                            disabled={disconnectMutation.isPending}
                            data-testid={`button-disconnect-${provider.id}`}
                          >
                            {disconnectMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleConnect(provider.id)}
                        disabled={connectingProvider === provider.id}
                        data-testid={`button-connect-${provider.id}`}
                      >
                        {connectingProvider === provider.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Connect
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
