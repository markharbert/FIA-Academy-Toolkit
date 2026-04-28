import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { Loader2 } from "lucide-react";

import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import DashboardPage from "@/pages/dashboard";
import VideoScorePage from "@/pages/video-score";
import SessionPage from "@/pages/session";
import AdminPage from "@/pages/admin";
import AccountPage from "@/pages/account";
import TopicPulsePage from "@/pages/topic-pulse";
import TopicPulseExplorePage from "@/pages/topic-pulse-explore";
import TopicPulseScriptPage from "@/pages/topic-pulse-script";
import TopicPulseScriptsPage from "@/pages/topic-pulse-scripts";
import TopicPulseSavedPage from "@/pages/topic-pulse-saved";
import TopicPulseSettingsPage from "@/pages/topic-pulse-settings";
import AccountabilityPage from "@/pages/accountability";
import DmoTrackerPage from "@/pages/dmo-tracker";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (!user.isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

function PublicOnlyRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

function AuthenticatedCatchAll() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Redirect to="/dashboard" />;
  }

  return <NotFound />;
}

function ProtectedRoutes() {
  return (
    <Switch>
      <Route path="/dashboard">
        {() => <ProtectedRoute component={DashboardPage} />}
      </Route>
      <Route path="/video-score">
        {() => <ProtectedRoute component={VideoScorePage} />}
      </Route>
      <Route path="/video-score-upload">
        {() => <ProtectedRoute component={SessionPage} />}
      </Route>
      <Route path="/video-score-upload/:id">
        {() => <ProtectedRoute component={SessionPage} />}
      </Route>
      <Route path="/record">
        {() => <ProtectedRoute component={SessionPage} />}
      </Route>
      <Route path="/admin">
        {() => <AdminRoute component={AdminPage} />}
      </Route>
      <Route path="/account">
        {() => <ProtectedRoute component={AccountPage} />}
      </Route>
      <Route path="/video-trends">
        {() => <ProtectedRoute component={TopicPulsePage} />}
      </Route>
      <Route path="/video-trends/explore/:runId">
        {() => <ProtectedRoute component={TopicPulseExplorePage} />}
      </Route>
      <Route path="/video-trends/scripts/:scriptId">
        {() => <ProtectedRoute component={TopicPulseScriptPage} />}
      </Route>
      <Route path="/video-trends/scripts">
        {() => <ProtectedRoute component={TopicPulseScriptsPage} />}
      </Route>
      <Route path="/video-trends/saved">
        {() => <ProtectedRoute component={TopicPulseSavedPage} />}
      </Route>
      <Route path="/video-trends/settings">
        {() => <ProtectedRoute component={TopicPulseSettingsPage} />}
      </Route>
      <Route path="/accountability">
        {() => <ProtectedRoute component={AccountabilityPage} />}
      </Route>
      <Route path="/dmo-tracker">
        {() => <ProtectedRoute component={DmoTrackerPage} />}
      </Route>
      <Route>{() => <AuthenticatedCatchAll />}</Route>
    </Switch>
  );
}

function PublicRoutes() {
  const { user, isLoading } = useAuth();

  return (
    <Switch>
      <Route path="/">
        {() => {
          if (isLoading) {
            return (
              <div className="flex min-h-[60vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            );
          }
          if (user) {
            return <Redirect to="/dashboard" />;
          }
          return <LandingPage />;
        }}
      </Route>
      <Route path="/login">
        {() => <PublicOnlyRoute component={LoginPage} />}
      </Route>
      <Route path="/signup">
        {() => <Redirect to="/" />}
      </Route>
      <Route path="/forgot-password">
        {() => <PublicOnlyRoute component={ForgotPasswordPage} />}
      </Route>
      <Route path="/reset-password">
        {() => <PublicOnlyRoute component={ResetPasswordPage} />}
      </Route>
      <Route>{() => <AuthenticatedCatchAll />}</Route>
    </Switch>
  );
}

function AppLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return (
      <SidebarProvider>
        <div className="flex h-screen w-full">
          <AppSidebar />
          <SidebarInset>
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger className="-ml-1" data-testid="button-sidebar-toggle" />
            </header>
            <main className="flex-1 overflow-auto">
              <ProtectedRoutes />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1">
        <PublicRoutes />
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AppLayout />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
