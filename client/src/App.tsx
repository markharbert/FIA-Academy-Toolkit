import { Switch, Route, Redirect, useParams } from "wouter";
import { lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
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

// Public pages — kept eager so the login screen renders instantly
import LoginPage from "@/pages/login";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";

/**
 * Lazy-load a page chunk. If the chunk 404s (stale cache after a new
 * deployment), force a full page reload so the browser fetches the new
 * index.html and picks up the updated chunk hashes automatically.
 *
 * A timestamp throttle limits automatic reloads to ONE per 30 seconds,
 * globally across all lazy pages. Combined with the server sending index.html
 * with Cache-Control: no-cache, that single reload fetches a fresh index.html
 * with updated chunk hashes and all subsequent navigations succeed cleanly.
 *
 * The old approach used a per-attempt counter that reset to 0 on every
 * successful load. This caused a loop: page A fails → reload → A succeeds
 * (counter reset to 0) → page B fails → reload → B succeeds (counter reset)
 * → … repeating once per page visited after a deployment. The timestamp
 * approach prevents more than one automatic reload in any 30-second window
 * regardless of how many pages succeed or fail.
 */
const CHUNK_RELOAD_KEY = "__chunkLastReload";
const CHUNK_RELOAD_WINDOW_MS = 30_000; // one auto-reload per 30 s, globally

function lazyPage<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T }>
) {
  return lazy(() =>
    importFn()
      .catch(() => {
        try {
          const last = parseInt(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? "0", 10);
          const now = Date.now();
          if (now - last > CHUNK_RELOAD_WINDOW_MS) {
            // First failure in this window — reload to pick up fresh chunks.
            sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
            window.location.reload();
            return new Promise<{ default: T }>(() => {}); // reload fires; never resolves
          }
        } catch {}
        // A reload already happened within the last 30 s — stop looping and
        // let the ErrorBoundary surface the problem so the user can act.
        throw new Error("Page failed to load. Please hard-refresh (Ctrl+Shift+R).");
      })
  );
}

// All other pages are lazy-loaded so they only download when first visited
const DashboardPage              = lazyPage(() => import("@/pages/dashboard"));
const VideoScorePage             = lazyPage(() => import("@/pages/video-score"));
const SessionPage                = lazyPage(() => import("@/pages/session"));
const AdminPage                  = lazyPage(() => import("@/pages/admin"));
const AccountPage                = lazyPage(() => import("@/pages/account"));
const TopicPulsePage             = lazyPage(() => import("@/pages/topic-pulse"));
const TopicPulseExplorePage      = lazyPage(() => import("@/pages/topic-pulse-explore"));
const TopicPulseScriptPage       = lazyPage(() => import("@/pages/topic-pulse-script"));
const TopicPulseScriptsPage      = lazyPage(() => import("@/pages/topic-pulse-scripts"));
const TopicPulseSavedPage        = lazyPage(() => import("@/pages/topic-pulse-saved"));
const VideoToolsPage             = lazyPage(() => import("@/pages/video-tools"));
const TeleprompterPage           = lazyPage(() => import("@/pages/teleprompter"));
const EmailToolsPage             = lazyPage(() => import("@/pages/email-tools"));
const InboxAnalyzerPage          = lazyPage(() => import("@/pages/inbox-analyzer"));
const SenderReputationPage       = lazyPage(() => import("@/pages/sender-reputation"));
const InboxIntelPage             = lazyPage(() => import("@/pages/inbox-intel"));
const InboxIntelFeedPage         = lazyPage(() => import("@/pages/inbox-intel-feed"));
const InboxIntelComparePage      = lazyPage(() => import("@/pages/inbox-intel-compare"));
const InboxIntelTrackerPage      = lazyPage(() => import("@/pages/inbox-intel-tracker"));
const InboxIntelEmailPage        = lazyPage(() => import("@/pages/inbox-intel-email"));
const DmoTrackerPage             = lazyPage(() => import("@/pages/dmo-tracker"));
const ProjectsPage               = lazyPage(() => import("@/pages/projects"));
const ProjectDetailPage          = lazyPage(() => import("@/pages/project-detail"));
const TemplateDetailPage         = lazyPage(() => import("@/pages/template-detail"));
const FunnelPlannerIndexPage     = lazyPage(() => import("@/pages/funnel-planner/index"));
const FunnelPlannerEditorPage    = lazyPage(() => import("@/pages/funnel-planner/editor"));
const FunnelSharePage            = lazyPage(() => import("@/pages/funnel-planner/share"));
const CfLoginPage                = lazyPage(() => import("@/pages/cf-login"));
const MemberLoginPage            = lazyPage(() => import("@/pages/member-login"));
const WorkspaceInviteAcceptPage  = lazyPage(() => import("@/pages/workspace-invite-accept"));
const HelpPage                   = lazyPage(() => import("@/pages/help"));
const HelpCategoryPage           = lazyPage(() => import("@/pages/help-category"));
const HelpArticlePage            = lazyPage(() => import("@/pages/help-article"));
const FeedbackPage               = lazyPage(() => import("@/pages/feedback"));
const AnalyticsPage              = lazyPage(() => import("@/pages/analytics"));
const AnalyticsYouTubePage       = lazyPage(() => import("@/pages/analytics-youtube"));
const AnalyticsGscPage           = lazyPage(() => import("@/pages/analytics-gsc"));
const LinksPage                  = lazyPage(() => import("@/pages/links"));
const SwipeFilePage              = lazyPage(() => import("@/pages/swipe-file"));
const SwipeSharePage             = lazyPage(() => import("@/pages/swipe-share"));
const AdminCoursesPage           = lazyPage(() => import("@/pages/admin-courses"));
const AdminCourseOutlinePage     = lazyPage(() => import("@/pages/admin-course-outline"));
const AdminLessonEditorPage      = lazyPage(() => import("@/pages/admin-lesson-editor"));
const TrainingCoursePage         = lazyPage(() => import("@/pages/training-course"));
const TrainingLessonPage         = lazyPage(() => import("@/pages/training-lesson"));
const PrivacyPolicyPage          = lazyPage(() => import("@/pages/privacy-policy"));
const NotFound                   = lazyPage(() => import("@/pages/not-found"));

function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

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
    <Suspense fallback={<PageLoader />}>
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
        {() => <ProtectedRoute component={LinksPage} />}
      </Route>
      <Route path="/swipe-file">
        {() => <ProtectedRoute component={SwipeFilePage} />}
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
      <Route path="/admin/courses/:id/lessons/:lessonId">
        {() => <AdminRoute component={AdminLessonEditorPage} />}
      </Route>
      <Route path="/admin/courses/:id/outline">
        {() => <AdminRoute component={AdminCourseOutlinePage} />}
      </Route>
      <Route path="/admin/courses">
        {() => <AdminRoute component={AdminCoursesPage} />}
      </Route>
      <Route path="/training/:courseId/lessons/:lessonId">
        {() => <ProtectedRoute component={TrainingLessonPage} />}
      </Route>
      <Route path="/training/:courseId">
        {() => <ProtectedRoute component={TrainingCoursePage} />}
      </Route>
      <Route>{() => <AuthenticatedCatchAll />}</Route>
    </Switch>
    </Suspense>
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
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <Suspense fallback={<PageLoader />}>
              <Switch>
                {/* Standalone pages — no sidebar, no auth check */}
                <Route path="/cf-login">{() => <CfLoginPage />}</Route>
                <Route path="/member-login">{() => <MemberLoginPage />}</Route>
                <Route path="/workspace/accept">{() => <WorkspaceInviteAcceptPage />}</Route>
                <Route path="/funnels/share/:token">{() => <FunnelSharePage />}</Route>
                <Route path="/swipe/:token">{() => <SwipeSharePage />}</Route>
                <Route path="/privacy-policy">{() => <PrivacyPolicyPage />}</Route>
                <Route>{() => <AppLayout />}</Route>
              </Switch>
            </Suspense>
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
