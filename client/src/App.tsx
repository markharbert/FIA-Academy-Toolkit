import { Switch, Route, Redirect, useParams } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { Footer } from "@/components/footer";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Loader2, ExternalLink } from "lucide-react";

import LoginPage from "@/pages/login";
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
import VideoToolsPage from "@/pages/video-tools";
import TeleprompterPage from "@/pages/teleprompter";
import EmailToolsPage from "@/pages/email-tools";
import InboxAnalyzerPage from "@/pages/inbox-analyzer";
import SenderReputationPage from "@/pages/sender-reputation";
import InboxIntelPage from "@/pages/inbox-intel";
import InboxIntelFeedPage from "@/pages/inbox-intel-feed";
import InboxIntelComparePage from "@/pages/inbox-intel-compare";
import InboxIntelTrackerPage from "@/pages/inbox-intel-tracker";
import InboxIntelEmailPage from "@/pages/inbox-intel-email";
import DmoTrackerPage from "@/pages/dmo-tracker";
import ProjectsPage from "@/pages/projects";
import ProjectDetailPage from "@/pages/project-detail";
import TemplateDetailPage from "@/pages/template-detail";
import FunnelPlannerIndexPage from "@/pages/funnel-planner/index";
import FunnelPlannerEditorPage from "@/pages/funnel-planner/editor";
import FunnelSharePage from "@/pages/funnel-planner/share";
import CfLoginPage from "@/pages/cf-login";
import MemberLoginPage from "@/pages/member-login";
import WorkspaceInviteAcceptPage from "@/pages/workspace-invite-accept";
import HelpPage from "@/pages/help";
import HelpCategoryPage from "@/pages/help-category";
import HelpArticlePage from "@/pages/help-article";
import FeedbackPage from "@/pages/feedback";
import AnalyticsPage from "@/pages/analytics";
import AnalyticsYouTubePage from "@/pages/analytics-youtube";
import AnalyticsGscPage from "@/pages/analytics-gsc";
import LinksPage from "@/pages/links";
import NotFound from "@/pages/not-found";
import Stage1Page from "@/pages/framework/stage-1";
import Stage2Page from "@/pages/framework/stage-2";
import Stage3Page from "@/pages/framework/stage-3";
import Stage4Page from "@/pages/framework/stage-4";
import Stage5Page from "@/pages/framework/stage-5";
import Stage6Page from "@/pages/framework/stage-6";
import Stage7Page from "@/pages/framework/stage-7";
import Stage8Page from "@/pages/framework/stage-8";
import Stage9Page from "@/pages/framework/stage-9";

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
    const dest = window.location.pathname + window.location.search;
    return <Redirect to={`/?redirect=${encodeURIComponent(dest)}`} />;
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
    return <Redirect to="/" />;
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

  return <Redirect to="/" />;
}

function LoginPageRedirect() {
  const qs = window.location.search;
  return <Redirect to={qs ? `/${qs}` : "/"} />;
}

function OldExploreRedirect() {
  const params = useParams<{ runId: string }>();
  return <Redirect to={`/video-studio/research/explore/${params.runId}`} />;
}

function OldScriptRedirect() {
  const params = useParams<{ scriptId: string }>();
  return <Redirect to={`/video-studio/scripts/${params.scriptId}`} />;
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
      <Route path="/links">
        {() => <AdminRoute component={LinksPage} />}
      </Route>
      <Route path="/account">
        {() => <ProtectedRoute component={AccountPage} />}
      </Route>
      <Route path="/video-studio/research">
        {() => <ProtectedRoute component={TopicPulsePage} />}
      </Route>
      <Route path="/video-studio/research/explore/:runId">
        {() => <ProtectedRoute component={TopicPulseExplorePage} />}
      </Route>
      <Route path="/video-studio/research/saved">
        {() => <ProtectedRoute component={TopicPulseSavedPage} />}
      </Route>
      <Route path="/video-studio/scripts/:scriptId">
        {() => <ProtectedRoute component={TopicPulseScriptPage} />}
      </Route>
      <Route path="/video-studio/scripts">
        {() => <ProtectedRoute component={TopicPulseScriptsPage} />}
      </Route>
      <Route path="/video-studio/record">
        {() => <ProtectedRoute component={TeleprompterPage} />}
      </Route>
      <Route path="/video-trends">
        {() => <Redirect to="/video-studio/research" />}
      </Route>
      <Route path="/video-trends/explore/:runId">
        {() => <OldExploreRedirect />}
      </Route>
      <Route path="/video-trends/scripts/:scriptId">
        {() => <OldScriptRedirect />}
      </Route>
      <Route path="/video-trends/scripts">
        {() => <Redirect to="/video-studio/scripts" />}
      </Route>
      <Route path="/video-trends/saved">
        {() => <Redirect to="/video-studio/research/saved" />}
      </Route>
      <Route path="/teleprompter">
        {() => <Redirect to="/video-studio/record" />}
      </Route>
      <Route path="/video-studio">
        {() => <ProtectedRoute component={VideoToolsPage} />}
      </Route>
      <Route path="/video-tools">
        {() => <Redirect to="/video-studio" />}
      </Route>
      <Route path="/email-tools">
        {() => <ProtectedRoute component={EmailToolsPage} />}
      </Route>
      <Route path="/email-tools/inbox-analyzer">
        {() => <ProtectedRoute component={InboxAnalyzerPage} />}
      </Route>
      <Route path="/email-tools/sender-reputation">
        {() => <ProtectedRoute component={SenderReputationPage} />}
      </Route>
      <Route path="/email-tools/inbox-intel">
        {() => <ProtectedRoute component={InboxIntelPage} />}
      </Route>
      <Route path="/email-tools/inbox-intel/feed">
        {() => <ProtectedRoute component={InboxIntelFeedPage} />}
      </Route>
      <Route path="/email-tools/inbox-intel/compare">
        {() => <ProtectedRoute component={InboxIntelComparePage} />}
      </Route>
      <Route path="/email-tools/inbox-intel/:trackerId">
        {() => <ProtectedRoute component={InboxIntelTrackerPage} />}
      </Route>
      <Route path="/email-tools/inbox-intel/:trackerId/email/:emailId">
        {() => <ProtectedRoute component={InboxIntelEmailPage} />}
      </Route>
      <Route path="/dmo-tracker">
        {() => <ProtectedRoute component={DmoTrackerPage} />}
      </Route>
      <Route path="/projects">
        {() => <ProtectedRoute component={ProjectsPage} />}
      </Route>
      <Route path="/projects/templates/:id">
        {() => <ProtectedRoute component={TemplateDetailPage} />}
      </Route>
      <Route path="/projects/:id">
        {() => <ProtectedRoute component={ProjectDetailPage} />}
      </Route>
      <Route path="/funnel-grid/:id">
        {() => <ProtectedRoute component={FunnelPlannerEditorPage} />}
      </Route>
      <Route path="/funnel-grid">
        {() => <ProtectedRoute component={FunnelPlannerIndexPage} />}
      </Route>
      <Route path="/help">
        {() => <ProtectedRoute component={HelpPage} />}
      </Route>
      <Route path="/help/video-trends">
        <Redirect to="/help/research" />
      </Route>
      <Route path="/help/category/:slug">
        {() => <ProtectedRoute component={HelpCategoryPage} />}
      </Route>
      <Route path="/help/:slug">
        {() => <ProtectedRoute component={HelpArticlePage} />}
      </Route>
      <Route path="/analytics">
        {() => <ProtectedRoute component={AnalyticsPage} />}
      </Route>
      <Route path="/analytics/youtube">
        {() => <ProtectedRoute component={AnalyticsYouTubePage} />}
      </Route>
      <Route path="/analytics/search-console">
        {() => <ProtectedRoute component={AnalyticsGscPage} />}
      </Route>
      <Route path="/feedback">
        {() => <ProtectedRoute component={FeedbackPage} />}
      </Route>
      {/* Keystone Framework */}
      <Route path="/framework/stage-1">
        {() => <ProtectedRoute component={Stage1Page} />}
      </Route>
      <Route path="/framework/stage-2">
        {() => <ProtectedRoute component={Stage2Page} />}
      </Route>
      <Route path="/framework/stage-3">
        {() => <ProtectedRoute component={Stage3Page} />}
      </Route>
      <Route path="/framework/stage-4">
        {() => <ProtectedRoute component={Stage4Page} />}
      </Route>
      <Route path="/framework/stage-5">
        {() => <ProtectedRoute component={Stage5Page} />}
      </Route>
      <Route path="/framework/stage-6">
        {() => <ProtectedRoute component={Stage6Page} />}
      </Route>
      <Route path="/framework/stage-7">
        {() => <ProtectedRoute component={Stage7Page} />}
      </Route>
      <Route path="/framework/stage-8">
        {() => <ProtectedRoute component={Stage8Page} />}
      </Route>
      <Route path="/framework/stage-9">
        {() => <ProtectedRoute component={Stage9Page} />}
      </Route>
      <Route>{() => <AuthenticatedCatchAll />}</Route>
    </Switch>
  );
}

function PublicRoutes() {
  return (
    <Switch>
      <Route path="/">
        {() => <PublicOnlyRoute component={LoginPage} />}
      </Route>
      <Route path="/members-only">
        {() => <Redirect to="/" />}
      </Route>
      <Route path="/login">
        {() => <LoginPageRedirect />}
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
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 bg-[hsl(230,45%,14%)] border-[hsl(230,45%,19%)]">
              <SidebarTrigger className="-ml-1 text-white hover:bg-white/10 hover:text-white" data-testid="button-sidebar-toggle" />
              <a
                href="https://www.fearlessmarketinglab.com/courses/fearless-influencer-academy"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                data-testid="link-back-to-members-area"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Back to Members Area</span>
              </a>
            </header>
            <ImpersonationBanner />
            <main className="flex-1 overflow-auto">
              <div className="flex flex-col min-h-full">
                <div className="flex-1">
                  <ProtectedRoutes />
                </div>
                <Footer />
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    );
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "hsl(230,75%,10%)" }}>
      <main className="flex-1">
        <PublicRoutes />
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Switch>
            {/* Standalone pages — no sidebar, no auth check */}
            <Route path="/cf-login">{() => <CfLoginPage />}</Route>
            <Route path="/member-login">{() => <MemberLoginPage />}</Route>
            <Route path="/workspace/accept">{() => <WorkspaceInviteAcceptPage />}</Route>
            <Route path="/funnels/share/:token">{() => <FunnelSharePage />}</Route>
            <Route>{() => <AppLayout />}</Route>
          </Switch>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
