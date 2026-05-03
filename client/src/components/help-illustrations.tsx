import step1 from "@assets/help/step1.jpg";
import step2 from "@assets/help/step2.jpg";
import step3 from "@assets/help/step3.jpg";
import step4 from "@assets/help/step4.jpg";
import step5 from "@assets/help/step5.jpg";
import step6 from "@assets/help/step6.jpg";
import step7 from "@assets/help/step7.jpg";

import srP1Step1 from "@assets/help/sr-p1-step1.jpg";
import srP1Step2 from "@assets/help/sr-p1-step2.jpg";
import srP1Step3 from "@assets/help/sr-p1-step3.jpg";
import srP1Step4 from "@assets/help/sr-p1-step4.jpg";
import srP1Step6 from "@assets/help/sr-p1-step6.jpg";
import srP1Step8 from "@assets/help/sr-p1-step8.jpg";
import srP1Compliance from "@assets/help/sr-p1-dns-godaddy.jpg";
import srP1Dns from "@assets/help/sr-p1-dns.jpg";

import srP2Step1 from "@assets/help/sr-p2-step1.jpg";
import srP2Step2 from "@assets/help/sr-p2-step2.jpg";
import srP2Step3 from "@assets/help/sr-p2-step3.jpg";
import srP2Step4 from "@assets/help/sr-p2-step4.jpg";
import srP2Step5 from "@assets/help/sr-p2-step5.jpg";
import srP2Step6 from "@assets/help/sr-p2-step6.jpg";
import srP2Step7 from "@assets/help/sr-p2-step7.jpg";
import srP2Step8 from "@assets/help/sr-p2-step8.jpg";

import vtHub from "@assets/help/vt-hub.jpg";
import vtExploreList from "@assets/help/vt-explore-list.jpg";
import vtTopicDetail from "@assets/help/vt-topic-detail.jpg";
import vtSaved from "@assets/help/vt-saved.jpg";
import vtScriptDetail from "@assets/help/vt-script-detail.jpg";

import scriptsList from "@assets/help/scripts-list.jpg";
import scriptsDetail from "@assets/help/scripts-detail.jpg";
import scriptsSections from "@assets/help/scripts-sections.jpg";
import scriptsCta from "@assets/help/scripts-cta.jpg";

import iiHub from "@assets/help/ii-hub.jpg";
import iiTrackerEmails from "@assets/help/ii-tracker-emails.jpg";
import iiTrackerAnalytics from "@assets/help/ii-tracker-analytics.jpg";
import iiTrackerFunnel from "@assets/help/ii-tracker-funnel.jpg";
import iiFeed from "@assets/help/ii-feed.jpg";
import iiCompare from "@assets/help/ii-compare.jpg";

import iaHub from "@assets/help/ia-hub.jpg";
import iaMyAddress from "@assets/help/ia-my-address.jpg";
import iaEmailOverview from "@assets/help/ia-email-overview.jpg";
import iaPlacement from "@assets/help/ia-placement.jpg";
import iaAuthentication from "@assets/help/ia-authentication.jpg";

import projHub from "@assets/help/proj-hub.jpg";
import projList from "@assets/help/proj-list.jpg";
import projCalendar from "@assets/help/proj-calendar.jpg";
import projTemplates from "@assets/help/proj-templates.jpg";
import projDetail from "@assets/help/proj-detail.jpg";
import projTaskSheet from "@assets/help/proj-task-sheet.jpg";
import projComments from "@assets/help/proj-comments.jpg";
import projActivity from "@assets/help/proj-activity.jpg";
import projTemplateEditor from "@assets/help/proj-template-editor.jpg";
import projNewDialog from "@assets/help/proj-new-dialog.jpg";
import projDashboard from "@assets/help/proj-dashboard.jpg";

import { AnnotatedScreenshot, type Annotation } from "@/components/annotated-screenshot";

function ScreenshotIllustration({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-sm">
      <img
        src={src}
        alt={alt}
        className="w-full h-auto block"
        loading="lazy"
      />
    </div>
  );
}

export function VideoToolsHubIllustration() {
  return <ScreenshotIllustration src={step1} alt="Video Tools hub showing Video Score, Video Trends, and Scripts cards with sidebar highlighted" />;
}

export function SessionsListIllustration() {
  return <ScreenshotIllustration src={step2} alt="Video Score sessions list with Score New Video button in the top right" />;
}

export function UploadPageIllustration() {
  return <ScreenshotIllustration src={step3} alt="Add Video page with drag-and-drop upload zone" />;
}

export function ScoreSummaryIllustration() {
  return <ScreenshotIllustration src={step4} alt="Score Summary showing 74 out of 100 with all 5 part scores and what you did well section" />;
}

export function FormulaBreakdownIllustration() {
  return <ScreenshotIllustration src={step5} alt="5-part formula breakdown showing Hook, Set the Hook, First CTA, Content, and Final CTA with individual scores and AI Coach Summary" />;
}

export function HookExpandedIllustration() {
  return <ScreenshotIllustration src={step6} alt="Hook section expanded showing What Worked, What's Missing, Suggestions, and Example Lines" />;
}

export function TranscriptDownloadIllustration() {
  return <ScreenshotIllustration src={step7} alt="Transcript section with Download and Copy buttons" />;
}

export function PostmasterComplianceIllustration() {
  return <ScreenshotIllustration src={srP1Compliance} alt="Google Postmaster Tools Compliance Status dashboard showing all requirements marked Compliant with green checkmarks" />;
}

export function PostmasterWelcomeIllustration() {
  return <ScreenshotIllustration src={srP1Step1} alt="Google Postmaster Tools home screen showing the Welcome dialog and the + button in the bottom right corner to add a domain" />;
}

export function PostmasterTxtRecordIllustration() {
  return <ScreenshotIllustration src={srP1Step2} alt="Google Postmaster Tools Domain Verification dialog showing the TXT record value to copy and add to your DNS settings" />;
}

export function PostmasterDnsGuideIllustration() {
  return <ScreenshotIllustration src={srP1Dns} alt="GoDaddy help page showing how to add a TXT record in DNS settings — the same process applies in any DNS provider" />;
}

export function PostmasterNotVerifiedIllustration() {
  return <ScreenshotIllustration src={srP1Step3} alt="Google Postmaster Tools domain list showing a domain with Not Verified status before clicking Verify" />;
}

export function PostmasterVerifiedIllustration() {
  return <ScreenshotIllustration src={srP1Step4} alt="Google Postmaster Tools domain list showing a domain with Verified status after successful domain verification" />;
}

export function PostmasterSpamChartIllustration() {
  return <ScreenshotIllustration src={srP1Step6} alt="Google Postmaster Tools Spam dashboard showing user-reported spam rate chart with the 0.1% recommended threshold and 0.3% policy violation threshold lines" />;
}

export function PostmasterAuthChartIllustration() {
  return <ScreenshotIllustration src={srP1Step8} alt="Google Postmaster Tools Authentication dashboard showing DKIM, SPF, and DMARC success rates over time" />;
}

export function SrP2ConnectTopIllustration() {
  return <ScreenshotIllustration src={srP2Step1} alt="Sender Reputation header with the green Connected badge highlighted, showing the Google account linked as mark@markharbert.com" />;
}

export function SrP2DashboardTopIllustration() {
  return <ScreenshotIllustration src={srP2Step2} alt="Sender Reputation dashboard with red annotation boxes highlighting the High Reputation badge and the six stat cards row showing Spam Rate, SPF, DKIM, DMARC, Outbound TLS, and Inbound TLS" />;
}

export function SrP2OverviewChartsIllustration() {
  return <ScreenshotIllustration src={srP2Step3} alt="Overview tab annotated: red box on the Overview tab, orange boxes highlighting the Spam Complaint Rate chart on the left and the Domain Reputation History chart on the right" />;
}

export function SrP2AuthTlsChartsIllustration() {
  return <ScreenshotIllustration src={srP2Step4} alt="Overview tab annotated: red box on the Overview tab, orange boxes highlighting the Authentication Pass Rates chart and the TLS Encryption chart in the second row" />;
}

export function SrP2ComplianceChecklistIllustration() {
  return <ScreenshotIllustration src={srP2Step5} alt="Compliance tab annotated: red box on the Compliance tab, orange box around the full Gmail Compliance checklist card showing all requirements with Passing badges" />;
}

export function SrP2ComplianceDetailIllustration() {
  return <ScreenshotIllustration src={srP2Step6} alt="Compliance tab annotated: red box on the Compliance tab, orange box around the expanded SPF Authentication row showing the description, 99% pass rate, and Google guidance link" />;
}

export function SrP2ActionPlanIllustration() {
  return <ScreenshotIllustration src={srP2Step7} alt="Action Plan tab annotated: red box on the Action Plan tab, orange box on the All clear badge, and green box around the Healthy status card" />;
}

export function SrP2InfrastructureIllustration() {
  return <ScreenshotIllustration src={srP2Step8} alt="Infrastructure tab annotated: red box on the Infrastructure tab, orange boxes highlighting the Sending IP Reputation card with 8 High and 2 Medium IPs, and the Delivery Errors card" />;
}

// ─── Video Trends Illustrations ───────────────────────────────────────────────

export function VtHubIllustration() {
  const annotations: Annotation[] = [
    { x: 33.0, y: 30.5, w: 53.0, h: 4.5, color: "red", label: "1 Search bar", labelPos: "outside-top" },
    { x: 46.5, y: 24.5, w: 27.5, h: 3.0, color: "amber", label: "2 Credits", labelPos: "outside-top" },
    { x: 40.5, y: 36.0, w: 37.0, h: 4.0, color: "blue", label: "3 Quick presets", labelPos: "outside-bottom" },
    { x: 18.0, y: 66.0, w: 61.0, h: 22.0, color: "green", label: "4 Recent searches", labelPos: "outside-top" },
  ];
  return (
    <AnnotatedScreenshot
      src={vtHub}
      alt="Video Trends hub showing the keyword search bar, monthly credits badge, quick-filter preset pills, Saved Topics and Scripts stat cards, and a Recent Searches list with two prior runs"
      annotations={annotations}
    />
  );
}

export function VtExploreListIllustration() {
  const annotations: Annotation[] = [
    { x: 20.0, y: 17.0, w: 78.0, h: 3.5, color: "red", label: "1 Filter & sort", labelPos: "outside-top" },
    { x: 79.0, y: 27.5, w: 18.0, h: 3.7, color: "orange", label: "2 Topic signals", labelPos: "outside-top" },
  ];
  return (
    <AnnotatedScreenshot
      src={vtExploreList}
      alt="Video Trends results page for the seed query 'claude ai tutorial' showing 24 topic cards. Each card has the topic title, monthly search volume badge, intent badge (How-To, Beginner Guide), a trend arrow, and an opportunity score on the right"
      annotations={annotations}
    />
  );
}

export function VtTopicDetailIllustration() {
  const annotations: Annotation[] = [
    { x: 21.0, y: 22.0, w: 43.5, h: 6.7, color: "red", label: "1 Selected topic", labelPos: "outside-top" },
    { x: 66.5, y: 29.0, w: 18.5, h: 4.4, color: "orange", label: "2 Generate Script", labelPos: "outside-top" },
    { x: 66.5, y: 42.5, w: 32.5, h: 4.0, color: "amber", label: "3 Opportunity Score", labelPos: "outside-top" },
    { x: 66.5, y: 51.5, w: 32.5, h: 21.5, color: "blue", label: "4 Keyword data", labelPos: "outside-top" },
  ];
  return (
    <AnnotatedScreenshot
      src={vtTopicDetail}
      alt="Topic detail side panel for 'Claude Ai Tutorial' showing the Generate Script, Save, and Research Deeper buttons, an Opportunity Score of 66/100 marked Good potential, and the Google Search Data card with monthly volume 210, CPC $1.53, Low competition (25%), and a +448% trend"
      annotations={annotations}
    />
  );
}

export function VtSavedIllustration() {
  const annotations: Annotation[] = [
    { x: 25.0, y: 11.5, w: 12.0, h: 3.0, color: "red", label: "1 Active / completed", labelPos: "outside-top" },
    { x: 20.5, y: 22.5, w: 78.0, h: 17.0, color: "orange", label: "2 Saved topics", labelPos: "outside-top" },
  ];
  return (
    <AnnotatedScreenshot
      src={vtSaved}
      alt="Saved Topics page showing two active saved topics — 'Claude Ai Tutorial' and 'Claude Ai Tutorial For Beginners' — each with their search volume, intent, trend, and opportunity score badges"
      annotations={annotations}
    />
  );
}

export function VtScriptDetailIllustration() {
  const annotations: Annotation[] = [
    { x: 20.5, y: 16.5, w: 78.0, h: 8.5, color: "red", label: "1 Topic stats", labelPos: "outside-top" },
    { x: 35.5, y: 28.5, w: 47.5, h: 3.5, color: "orange", label: "2 Format tabs", labelPos: "outside-top" },
    { x: 63.5, y: 34.7, w: 28.5, h: 4.5, color: "amber", label: "3 Copy / PDF", labelPos: "outside-bottom" },
    { x: 20.5, y: 44.5, w: 78.0, h: 42.0, color: "green", label: "4 5-part script", labelPos: "outside-top" },
  ];
  return (
    <AnnotatedScreenshot
      src={vtScriptDetail}
      alt="Generated script detail page for 'Claude Ai Tutorial' showing the topic stats row (210 monthly searches, 66/100 opportunity, $1.53 CPC, Low competition, +448% trend), the Long Form / Shorts / Description / Pinned Comment / Call To Action tabs, Copy and Download PDF buttons, and the script content opening with section 1 Hook"
      annotations={annotations}
    />
  );
}

// ─── Scripts Illustrations ────────────────────────────────────────────────────

export function ScriptsListIllustration() {
  const annotations: Annotation[] = [
    { x: 45.0, y: 8.0, w: 8.0, h: 4.5, color: "red", label: "1 Scripts count", labelPos: "outside-top" },
    { x: 25.5, y: 21.0, w: 68.5, h: 11.0, color: "orange", label: "2 Click card to open", labelPos: "outside-top" },
    { x: 28.0, y: 28.5, w: 34.5, h: 3.5, color: "amber", label: "3 Topic metrics", labelPos: "outside-bottom" },
  ];
  return (
    <AnnotatedScreenshot
      src={scriptsList}
      alt="Generated Scripts page showing three saved scripts — Claude Ai Tutorial, Affiliate Marketing Pinterest, and Affiliate Marketing For Beginners — each card displaying creation date, target video length, topic name, monthly search volume, trend, and opportunity score badges"
      annotations={annotations}
    />
  );
}

export function ScriptsDetailIllustration() {
  const annotations: Annotation[] = [
    { x: 34.5, y: 7.5, w: 16.0, h: 5.0, color: "red", label: "1 Script title", labelPos: "outside-top" },
    { x: 79.0, y: 7.5, w: 9.0, h: 5.5, color: "orange", label: "2 Teleprompter mode", labelPos: "outside-top" },
    { x: 88.0, y: 7.5, w: 9.5, h: 5.5, color: "amber", label: "3 Research panel", labelPos: "outside-top" },
    { x: 24.0, y: 33.5, w: 68.0, h: 6.5, color: "green", label: "4 Save / Copy / PDF", labelPos: "outside-bottom" },
  ];
  return (
    <AnnotatedScreenshot
      src={scriptsDetail}
      alt="Script detail page for Claude Ai Tutorial showing the script title, Teleprompter and Research buttons in the header, the topic stats row (210 monthly searches, 66/100 opportunity, $1.53 CPC, Low competition, +448% trend), the format tabs, and the Save Script, Copy Full Script, and Download PDF action buttons"
      annotations={annotations}
    />
  );
}

export function ScriptsSectionsIllustration() {
  const annotations: Annotation[] = [
    { x: 25.5, y: 40.5, w: 68.5, h: 30.0, color: "red", label: "1 Hook section", labelPos: "outside-top" },
    { x: 28.5, y: 54.5, w: 56.0, h: 11.5, color: "amber", label: "2 On-screen text", labelPos: "outside-bottom" },
    { x: 25.5, y: 71.5, w: 68.5, h: 25.0, color: "blue", label: "3 Next section", labelPos: "outside-top" },
  ];
  return (
    <AnnotatedScreenshot
      src={scriptsSections}
      alt="Script body view showing two sections of the 5-part formula — section 1 Hook (15-20 seconds) with its prose copy and an On-Screen Text panel listing three text overlays, followed by section 2 Set the Hook (30-45 seconds) with its own prose"
      annotations={annotations}
    />
  );
}

export function ScriptsCtaIllustration() {
  const annotations: Annotation[] = [
    { x: 73.0, y: 28.5, w: 12.5, h: 4.0, color: "red", label: "1 Call To Action tab", labelPos: "outside-top" },
    { x: 28.0, y: 36.5, w: 63.0, h: 23.5, color: "orange", label: "2 Manage offers", labelPos: "outside-top" },
    { x: 28.0, y: 64.5, w: 63.0, h: 24.0, color: "amber", label: "3 Refresh scripts with offer", labelPos: "outside-top" },
  ];
  return (
    <AnnotatedScreenshot
      src={scriptsCta}
      alt="Call To Action tab of a generated script showing the Your Saved Offers card with an Add New Offer button and the Refresh Scripts with Offer card with a Refresh Scripts with Default Offer button to update the Final CTA, Shorts Script, and Pinned Comment with your saved offer"
      annotations={annotations}
    />
  );
}

// ─── Inbox Intel Illustrations ────────────────────────────────────────────────

export function InboxIntelHubIllustration() {
  const annotations: Annotation[] = [
    { x: 85.5, y: 35.5, w: 10.5, h: 4.0, color: "red", label: "1 Add competitor", labelPos: "outside-top" },
    { x: 21.5, y: 41.5, w: 48.5, h: 15.5, color: "orange", label: "2 What's changed this week", labelPos: "outside-top" },
    { x: 71.5, y: 41.5, w: 24.0, h: 15.5, color: "amber", label: "3 Top sends leaderboard", labelPos: "outside-top" },
    { x: 21.5, y: 60.0, w: 74.0, h: 38.0, color: "blue", label: "4 Competitor tiles", labelPos: "outside-top" },
  ];
  return (
    <AnnotatedScreenshot
      src={iiHub}
      alt="Inbox Intel hub showing the Tracked Competitors header (3 of 20), Compare and View full feed and Add competitor buttons, the What's changed this week panel with a Pat Flynn anomaly, the Top sends leaderboard with Amy Porterfield and Brennan Dunn, and three competitor tiles for Pat Flynn, Amy Porterfield, and Brennan Dunn each with seed count, email count, and last-received date"
      annotations={annotations}
    />
  );
}

export function InboxIntelTrackerEmailsIllustration() {
  const annotations: Annotation[] = [
    { x: 64.9, y: 12.5, w: 30.8, h: 5.0, color: "red", label: "1 Tracker actions", labelPos: "outside-top" },
    { x: 21.5, y: 28.0, w: 74.0, h: 30.5, color: "orange", label: "2 Private seed addresses", labelPos: "outside-top" },
    { x: 21.7, y: 67.0, w: 28.1, h: 5.0, color: "amber", label: "3 Tab navigation", labelPos: "outside-top" },
    { x: 21.7, y: 77.0, w: 74.0, h: 22.5, color: "blue", label: "4 Captured emails", labelPos: "outside-top" },
  ];
  return (
    <AnnotatedScreenshot
      src={iiTrackerEmails}
      alt="Brennan Dunn tracker detail page on the Captured emails tab showing the Refresh preview, CSV, Edit, and Remove action buttons, the Seed addresses block listing three personal-looking seed mailboxes on watch.fearlessmarketinglab.com with received counts and last-received dates, the Captured emails / Analytics / Funnel tabs, and the first three captured email rows"
      annotations={annotations}
    />
  );
}

export function InboxIntelTrackerAnalyticsIllustration() {
  const annotations: Annotation[] = [
    { x: 34.7, y: 67.0, w: 7.6, h: 5.0, color: "red", label: "1 Analytics tab", labelPos: "outside-top" },
    { x: 21.0, y: 74.0, w: 74.7, h: 10.5, color: "orange", label: "2 Stat tiles", labelPos: "outside-top" },
    { x: 21.0, y: 86.5, w: 36.7, h: 13.0, color: "amber", label: "3 Cadence heatmap", labelPos: "outside-top" },
    { x: 59.0, y: 86.5, w: 37.0, h: 13.0, color: "blue", label: "4 Send volume chart", labelPos: "outside-top" },
  ];
  return (
    <AnnotatedScreenshot
      src={iiTrackerAnalytics}
      alt="Brennan Dunn tracker detail on the Analytics tab showing four stat tiles — Total emails 33, Avg per week 4, Busiest send Sat at 11, and Primary ESP ConvertKit at 100% confidence — and the start of a Cadence heatmap by day of week and hour of day card next to a Send volume per day card"
      annotations={annotations}
    />
  );
}

export function InboxIntelTrackerFunnelIllustration() {
  const annotations: Annotation[] = [
    { x: 43.4, y: 67.0, w: 6.4, h: 5.0, color: "red", label: "1 Funnel tab", labelPos: "outside-top" },
    { x: 21.0, y: 75.0, w: 74.7, h: 8.5, color: "orange", label: "2 Verdict + confidence", labelPos: "outside-top" },
    { x: 21.0, y: 86.0, w: 74.7, h: 7.0, color: "amber", label: "3 Auto vs broadcast counts", labelPos: "outside-top" },
  ];
  return (
    <AnnotatedScreenshot
      src={iiTrackerFunnel}
      alt="Brennan Dunn tracker detail on the Funnel tab showing the verdict 'Detected a 5-email welcome series over 7 days' with a HIGH CONFIDENCE badge, and the four classification counts — 5 welcome steps, 15 automated, 18 broadcast, 0 unclassified"
      annotations={annotations}
    />
  );
}

export function InboxIntelFeedIllustration() {
  const annotations: Annotation[] = [
    { x: 21.7, y: 29.5, w: 74.0, h: 6.5, color: "red", label: "1 Filter bar", labelPos: "outside-top" },
    { x: 78.6, y: 30.5, w: 9.8, h: 4.5, color: "orange", label: "2 Pinned only", labelPos: "outside-top" },
    { x: 21.7, y: 41.0, w: 74.0, h: 58.0, color: "amber", label: "3 Day-grouped stream", labelPos: "outside-top" },
  ];
  return (
    <AnnotatedScreenshot
      src={iiFeed}
      alt="Unified Feed page showing the search input, Last 30 days date selector, All competitors and Any ESP filters, Pinned only toggle, and CSV download button above a day-grouped chronological stream — Yesterday with three Amy Porterfield emails followed by Thursday April 30 with Brennan Dunn emails"
      annotations={annotations}
    />
  );
}

export function InboxIntelCompareIllustration() {
  const annotations: Annotation[] = [
    { x: 23.4, y: 30.5, w: 38.2, h: 4.5, color: "red", label: "1 Pick up to 4", labelPos: "outside-top" },
    { x: 21.0, y: 40.0, w: 74.7, h: 59.0, color: "orange", label: "2 Side-by-side cards", labelPos: "outside-top" },
    { x: 21.7, y: 75.0, w: 36.0, h: 16.0, color: "amber", label: "3 Activity & metrics", labelPos: "outside-top" },
  ];
  return (
    <AnnotatedScreenshot
      src={iiCompare}
      alt="Compare competitors page with two trackers selected — Brennan Dunn and Amy Porterfield — and side-by-side cards each showing Activity (this week, last 30 days, avg per week, total captured), Email platform with confidence, and the start of the Busiest send window block"
      annotations={annotations}
    />
  );
}

// ─── Inbox Analyzer Illustrations ─────────────────────────────────────────────

export function InboxAnalyzerHubIllustration() {
  const annotations: Annotation[] = [
    { x: 22.5, y: 19.5, w: 30.0, h: 4.5, color: "red", label: "1 Your private scoring address", labelPos: "outside-top" },
    { x: 48.5, y: 30.5, w: 26.0, h: 5.0, color: "orange", label: "2 Emails / My Address tabs", labelPos: "outside-top" },
    { x: 21.5, y: 47.5, w: 75.0, h: 8.5, color: "amber", label: "3 Click row to expand full report", labelPos: "outside-bottom" },
  ];
  return (
    <AnnotatedScreenshot
      src={iaHub}
      alt="Inbox Analyzer hub showing the page header with the user's unique scoring address (iahelp7k2x9q@email.fearlessmarketinglab.com), the Emails / My Address tab switcher, and a captured email row '🔥 LIMITED TIME — Act now to make money fast!!!' from Sarah Mitchell with an Overall Score of 42 and a Pending status badge"
      annotations={annotations}
    />
  );
}

export function InboxAnalyzerMyAddressIllustration() {
  const annotations: Annotation[] = [
    { x: 34.5, y: 37.0, w: 54.0, h: 17.0, color: "red", label: "1 Scoring address — paste into your CRM's BCC / seed field", labelPos: "outside-top" },
    { x: 34.5, y: 55.5, w: 54.0, h: 37.0, color: "orange", label: "2 Placement addresses — add as real subscribers", labelPos: "outside-top" },
  ];
  return (
    <AnnotatedScreenshot
      src={iaMyAddress}
      alt="My Address tab of Inbox Analyzer showing Step 1 'Add your scoring address to your CRM' with the unique fearlessmarketinglab.com address and a Copy button, and Step 2 'Add these placement addresses to your CRM' listing three Gmail seed inboxes (Gmail A, B, C) each with their own Copy button"
      annotations={annotations}
    />
  );
}

export function InboxAnalyzerEmailOverviewIllustration() {
  const annotations: Annotation[] = [
    { x: 22.5, y: 58.5, w: 32.5, h: 40.0, color: "red", label: "1 Sender + technical metadata", labelPos: "outside-top" },
    { x: 58.5, y: 57.5, w: 38.0, h: 9.5, color: "orange", label: "2 Overall Score", labelPos: "outside-top" },
    { x: 59.5, y: 70.5, w: 37.0, h: 11.5, color: "amber", label: "3 6-category breakdown", labelPos: "outside-bottom" },
  ];
  return (
    <AnnotatedScreenshot
      src={iaEmailOverview}
      alt="Expanded email report showing the sender metadata column (Subject, From, Reply-To, sending server academytoolkit.demo with IP 149.72.142.18, received timestamp, and Message-ID) on the left, and the Overall Score panel on the right with the headline score 42 'Based on 6 categories below' followed by the six category rings — Auth 100, Trust 100, Spam 38, Technical 50, Content 0, CAN-SPAM 50 — and the weighted breakdown caption underneath"
      annotations={annotations}
    />
  );
}

export function InboxAnalyzerPlacementIllustration() {
  const annotations: Annotation[] = [
    { x: 58.5, y: 12.0, w: 39.0, h: 5.5, color: "red", label: "1 Inbox Placement panel", labelPos: "outside-top" },
    { x: 58.5, y: 18.5, w: 39.0, h: 24.0, color: "orange", label: "2 Per-inbox results", labelPos: "outside-top" },
    { x: 86.5, y: 19.5, w: 9.5, h: 21.0, color: "amber", label: "3 Promotions / Spam / Junk badges", labelPos: "outside-bottom" },
  ];
  return (
    <AnnotatedScreenshot
      src={iaPlacement}
      alt="Inbox Placement panel for the captured email showing a placement score of 67/100 and three result rows — Gmail A placement.a@gmail.com landed in Promotions, Gmail B placement.b@gmail.com landed in Spam, and Gmail C placement.c@gmail.com landed in Promotions — with a 'Confirmed May 2 at 1:12 AM' timestamp underneath"
      annotations={annotations}
    />
  );
}

export function InboxAnalyzerAuthenticationIllustration() {
  const annotations: Annotation[] = [
    { x: 58.5, y: 11.5, w: 39.0, h: 12.5, color: "red", label: "1 SPF / DKIM / DMARC results", labelPos: "outside-top" },
    { x: 58.5, y: 26.0, w: 39.0, h: 17.0, color: "orange", label: "2 DNS records present at domain", labelPos: "outside-top" },
    { x: 58.5, y: 46.0, w: 39.0, h: 21.0, color: "amber", label: "3 Sender Trust — blocklist + spoofing checks", labelPos: "outside-top" },
    { x: 58.5, y: 69.5, w: 39.0, h: 30.0, color: "violet", label: "4 Spammy Language Analysis", labelPos: "outside-top" },
  ];
  return (
    <AnnotatedScreenshot
      src={iaAuthentication}
      alt="Authentication, Sender Trust, and Spammy Language panels for the captured email — Email Authentication shows SPF, DKIM, and DMARC all PASS with a 100/100 score; DNS Records Configured shows SPF, DKIM, and DMARC records all Found; Sender Trust shows IP not on any blocklists, display name matches sending domain, and Reply-To matches From domain (100/100); and the start of Spammy Language Analysis with a 38/100 score and chips for HIGH RISK phrases (act now, free money, SUBJ make money fast, get rich) and MEDIUM RISK phrases"
      annotations={annotations}
    />
  );
}

// ─── Projects Illustrations ───────────────────────────────────────────────────

export function ProjectsHubIllustration() {
  const annotations: Annotation[] = [
    { x: 21.9, y: 21.9, w: 32.6, h: 4.7,  color: "red",    label: "1 Top-level tabs",          labelPos: "outside-bottom" },
    { x: 85.4, y: 15.3, w: 11.0, h: 4.4,  color: "orange", label: "2 New Project",             labelPos: "bl" },
    { x: 21.0, y: 31.3, w: 75.4, h: 43.0, color: "amber",  label: "3 Urgent — overdue + soon", labelPos: "tl" },
    { x: 21.0, y: 76.3, w: 75.4, h: 23.0, color: "blue",   label: "4 Project cards",           labelPos: "tl" },
  ];
  return (
    <AnnotatedScreenshot
      src={projHub}
      alt="Projects hub on the Overview tab showing the four top-level tabs (Overview, List, Calendar, Templates), the New Project button in the top-right, an Urgent due-soon banner with three overdue tasks, and a row of three active project cards (May YouTube Channel Launch, Spring Webinar Funnel, Q2 Content Calendar) each with Open / Done / Due-7d stats and a progress bar"
      annotations={annotations}
    />
  );
}

export function ProjectsListIllustration() {
  const annotations: Annotation[] = [
    { x: 31.4, y: 21.9, w: 5.5,  h: 4.7,  color: "red",    label: "1 List tab",        labelPos: "outside-bottom" },
    { x: 21.0, y: 32.5, w: 75.4, h: 12.5, color: "orange", label: "2 Overdue",         labelPos: "tr" },
    { x: 21.0, y: 46.9, w: 75.4, h: 20.0, color: "amber",  label: "3 Today",           labelPos: "tr" },
    { x: 21.0, y: 68.4, w: 75.4, h: 29.5, color: "blue",   label: "4 This week",       labelPos: "tr" },
  ];
  return (
    <AnnotatedScreenshot
      src={projList}
      alt="Projects List tab showing every open task across all active projects grouped by Overdue (1), Today (2), and This week (7). Each row has a project color dot, project name tag, priority badge, and a colored due pill (Today / Tomorrow / dated)."
      annotations={annotations}
    />
  );
}

export function ProjectsCalendarIllustration() {
  const annotations: Annotation[] = [
    { x: 37.3, y: 21.9, w: 6.4,  h: 4.7,  color: "red",    label: "1 Calendar tab",      labelPos: "outside-bottom" },
    { x: 22.9, y: 32.8, w: 73.5, h: 5.5,  color: "orange", label: "2 Month nav + Today", labelPos: "tr" },
    { x: 21.0, y: 54.7, w: 10.5, h: 12.5, color: "amber",  label: "3 Today's cell",      labelPos: "bl" },
    { x: 87.4, y: 43.0, w: 8.9,  h: 10.2, color: "blue",   label: "4 Tasks on due date", labelPos: "bl" },
  ];
  return (
    <AnnotatedScreenshot
      src={projCalendar}
      alt="Projects Calendar tab showing a 6-week May 2026 grid with project tasks plotted on their due dates. Today (May 3) shows a red badge with 3 tasks queued; other cells across the month show single tasks colored by their parent project."
      annotations={annotations}
    />
  );
}

export function ProjectsTemplatesIllustration() {
  const annotations: Annotation[] = [
    { x: 44.7, y: 21.9, w: 9.8,  h: 4.7,  color: "red",    label: "1 Templates tab",  labelPos: "outside-bottom" },
    { x: 84.6, y: 32.5, w: 11.9, h: 4.5,  color: "orange", label: "2 New template",   labelPos: "outside-bottom" },
    { x: 21.0, y: 39.5, w: 75.0, h: 17.0, color: "amber",  label: "3 Template cards", labelPos: "tl" },
    { x: 35.5, y: 52.3, w: 10.5, h: 4.7,  color: "blue",   label: "4 Use template",   labelPos: "outside-bottom" },
  ];
  return (
    <AnnotatedScreenshot
      src={projTemplates}
      alt="Projects Templates tab showing three template cards — YouTube Video Production (6 tasks), Webinar Launch (6 tasks), Email Newsletter Issue (4 tasks) — each with a colored top accent, description, task count, kebab menu, and a Use template button."
      annotations={annotations}
    />
  );
}

export function ProjectsDetailIllustration() {
  const annotations: Annotation[] = [
    { x: 21.0, y: 4.7,  w: 75.4, h: 23.5, color: "red",    label: "1 Project header",       labelPos: "tr" },
    { x: 22.7, y: 22.7, w: 9.6,  h: 4.0,  color: "orange", label: "2 Due pill",             labelPos: "bl" },
    { x: 21.0, y: 32.0, w: 75.4, h: 26.0, color: "amber",  label: "3 To do",                labelPos: "tr" },
    { x: 21.0, y: 60.0, w: 75.4, h: 20.3, color: "blue",   label: "4 In progress",          labelPos: "tr" },
    { x: 21.0, y: 83.4, w: 75.4, h: 16.6, color: "green",  label: "5 Done (struck through)", labelPos: "tr" },
  ];
  return (
    <AnnotatedScreenshot
      src={projDetail}
      alt="Project detail page for May YouTube Channel Launch showing the colored hero header with project title, description, due-date pill, and 5-open / 2-done badges, followed by three task lists — To do (3), In progress (2 with one task showing a 1/3 subtasks chip), and Done (2 with strike-through). Each list has a quick-add row at the bottom."
      annotations={annotations}
    />
  );
}

export function ProjectsTaskSheetIllustration() {
  const annotations: Annotation[] = [
    { x: 49.3, y: 0.5,  w: 49.5, h: 11.5, color: "red",    label: "1 Task header",             labelPos: "bl" },
    { x: 49.3, y: 14.1, w: 49.5, h: 7.5,  color: "orange", label: "2 Status / Priority / Due", labelPos: "tl" },
    { x: 49.3, y: 21.8, w: 49.5, h: 12.0, color: "amber",  label: "3 Links",                   labelPos: "tr" },
    { x: 49.3, y: 33.8, w: 49.5, h: 42.0, color: "blue",   label: "4 Notes (WYSIWYG)",         labelPos: "tl" },
  ];
  return (
    <AnnotatedScreenshot
      src={projTaskSheet}
      alt="Task side sheet open over the project page. The sheet header shows the parent project crumb, the task title 'Record video 1 — channel intro', and badges for status (In progress), priority (Urgent), due date (5/2/2026 12:00 AM), and 1/3 subtasks complete. Below are Status / Priority / Due dropdowns, a Links list with a Loom recording brief and an empty add-link row, and the Notes section rendered with rich-text formatting (Goal heading, Talking points bullet list, a quoted hook line, and a Wardrobe note)."
      annotations={annotations}
    />
  );
}

export function ProjectsCommentsIllustration() {
  const annotations: Annotation[] = [
    { x: 49.3, y: 18.6, w: 49.5, h: 22.3, color: "red",    label: "1 Subtasks (1 level deep)",   labelPos: "tl" },
    { x: 49.0, y: 43.1, w: 26.4, h: 5.8,  color: "orange", label: "2 Comments tab",              labelPos: "bl" },
    { x: 49.3, y: 49.2, w: 49.5, h: 23.4, color: "amber",  label: "3 Comment bubbles + Edit",    labelPos: "tl" },
    { x: 49.3, y: 74.7, w: 49.5, h: 15.9, color: "blue",   label: "4 Cmd/Ctrl+Enter to send",    labelPos: "tl" },
  ];
  return (
    <AnnotatedScreenshot
      src={projComments}
      alt="Task side sheet scrolled down to show the Subtasks list (Set up lighting + camera done, Run through script twice, Record A-roll + B-roll) and the Comments + Activity tabs section. The Comments tab shows two chat bubbles from Tele Test with relative timestamps, an (edited) marker, and Edit / Delete actions, followed by a 'Write a comment...' compose box with a Comment send button."
      annotations={annotations}
    />
  );
}

export function ProjectsActivityIllustration() {
  const annotations: Annotation[] = [
    { x: 75.2, y: 55.5, w: 21.5, h: 5.9,  color: "red",    label: "1 Activity tab",       labelPos: "bl" },
    { x: 49.3, y: 62.5, w: 49.5, h: 25.8, color: "orange", label: "2 Auto-logged events", labelPos: "tl" },
  ];
  return (
    <AnnotatedScreenshot
      src={projActivity}
      alt="Activity tab inside the task side sheet showing five auto-logged events with color-coded icons and relative timestamps — Tele Test created this task (3 days ago), added subtask 'Set up lighting + camera' (2d), set priority to Urgent (2d), changed status from To do to In progress (1d), and added a comment (2h ago)."
      annotations={annotations}
    />
  );
}

export function ProjectsTemplateEditorIllustration() {
  const annotations: Annotation[] = [
    { x: 22.5, y: 14.4, w: 7.5,  h: 3.6,  color: "red",    label: "1 Template badge",                labelPos: "outside-bottom" },
    { x: 21.0, y: 32.0, w: 75.4, h: 4.7,  color: "orange", label: "2 No due dates in templates",     labelPos: "tl" },
    { x: 21.0, y: 39.8, w: 75.4, h: 35.5, color: "amber",  label: "3 Tasks (priority + tags only)",  labelPos: "tl" },
    { x: 21.0, y: 75.0, w: 75.4, h: 4.7,  color: "blue",   label: "4 Quick add",                     labelPos: "tl" },
  ];
  return (
    <AnnotatedScreenshot
      src={projTemplateEditor}
      alt="Template editor for the YouTube Video Production template showing the TEMPLATE badge in the hero, the explanatory banner ('Tasks in a template have no due date — pick dates after creating a project from this template'), and the 6 template tasks (Pick topic + outline, Write script, Record A-roll, Record B-roll, Edit + thumbnail, Schedule + write SEO desc) each showing a priority chip but no status or due date controls."
      annotations={annotations}
    />
  );
}

export function ProjectsNewDialogIllustration() {
  const annotations: Annotation[] = [
    { x: 34.7, y: 25.0, w: 30.8, h: 7.0,  color: "red",    label: "1 Start from (Blank or template)", labelPos: "tr" },
    { x: 34.7, y: 34.4, w: 30.8, h: 22.2, color: "orange", label: "2 Name + description",            labelPos: "tr" },
    { x: 34.7, y: 58.6, w: 30.8, h: 7.3,  color: "amber",  label: "3 Project color",                 labelPos: "tr" },
    { x: 34.7, y: 67.2, w: 30.8, h: 7.0,  color: "blue",   label: "4 Due date (optional)",           labelPos: "tr" },
  ];
  return (
    <AnnotatedScreenshot
      src={projNewDialog}
      alt="The New Project dialog showing the Start from picker (set to 'Blank project'), Name and Description fields, a row of nine color swatches (indigo, violet, pink, red, amber, green, teal, blue, gray), an optional Due date field, and Cancel / Create buttons in the footer."
      annotations={annotations}
    />
  );
}

export function ProjectsDashboardIllustration() {
  const annotations: Annotation[] = [
    { x: 21.0, y: 23.1, w: 75.4, h: 9.7,  color: "red",    label: "1 Today's KPIs",       labelPos: "tr" },
    { x: 21.0, y: 36.7, w: 51.0, h: 62.5, color: "orange", label: "2 Projects hero",      labelPos: "tl" },
    { x: 23.4, y: 46.6, w: 46.5, h: 7.8,  color: "amber",  label: "3 Project stat chips", labelPos: "tr" },
    { x: 23.4, y: 59.4, w: 46.5, h: 39.0, color: "blue",   label: "4 Up Next this week",  labelPos: "tr" },
    { x: 72.8, y: 36.7, w: 23.7, h: 34.7, color: "green",  label: "5 Email Health",       labelPos: "tr" },
  ];
  return (
    <AnnotatedScreenshot
      src={projDashboard}
      alt="Dashboard hero showing the personalized greeting with Open Projects and Log DMO buttons, the 3-KPI ribbon (DMO points today 0/25, Open tasks 13, Competitor emails 7d 0), the Projects hero card with stat chips (3 Projects, 13 Open tasks, 10 Due 7d, 1 Overdue) and the Up Next list grouped Overdue / Today / This week, plus the Email Health tile on the right with Sender Reputation and Inbox Placement rows."
      annotations={annotations}
    />
  );
}

export const ILLUSTRATIONS: Record<string, React.ComponentType> = {
  "video-tools-hub": VideoToolsHubIllustration,
  "sessions-list": SessionsListIllustration,
  "upload-page": UploadPageIllustration,
  "score-summary": ScoreSummaryIllustration,
  "formula-breakdown": FormulaBreakdownIllustration,
  "hook-expanded": HookExpandedIllustration,
  "transcript-download": TranscriptDownloadIllustration,
  "postmaster-compliance": PostmasterComplianceIllustration,
  "postmaster-welcome": PostmasterWelcomeIllustration,
  "postmaster-txt-record": PostmasterTxtRecordIllustration,
  "postmaster-dns-guide": PostmasterDnsGuideIllustration,
  "postmaster-not-verified": PostmasterNotVerifiedIllustration,
  "postmaster-verified": PostmasterVerifiedIllustration,
  "postmaster-spam-chart": PostmasterSpamChartIllustration,
  "postmaster-auth-chart": PostmasterAuthChartIllustration,
  "sr-p2-connect-top": SrP2ConnectTopIllustration,
  "sr-p2-dashboard-top": SrP2DashboardTopIllustration,
  "sr-p2-overview-charts": SrP2OverviewChartsIllustration,
  "sr-p2-auth-tls-charts": SrP2AuthTlsChartsIllustration,
  "sr-p2-compliance-checklist": SrP2ComplianceChecklistIllustration,
  "sr-p2-compliance-detail": SrP2ComplianceDetailIllustration,
  "sr-p2-action-plan-view": SrP2ActionPlanIllustration,
  "sr-p2-infrastructure-view": SrP2InfrastructureIllustration,
  "vt-hub": VtHubIllustration,
  "vt-explore-list": VtExploreListIllustration,
  "vt-topic-detail": VtTopicDetailIllustration,
  "vt-saved": VtSavedIllustration,
  "vt-script-detail": VtScriptDetailIllustration,
  "scripts-list": ScriptsListIllustration,
  "scripts-detail": ScriptsDetailIllustration,
  "scripts-sections": ScriptsSectionsIllustration,
  "scripts-cta": ScriptsCtaIllustration,
  "ii-hub": InboxIntelHubIllustration,
  "ii-tracker-emails": InboxIntelTrackerEmailsIllustration,
  "ii-tracker-analytics": InboxIntelTrackerAnalyticsIllustration,
  "ii-tracker-funnel": InboxIntelTrackerFunnelIllustration,
  "ii-feed": InboxIntelFeedIllustration,
  "ii-compare": InboxIntelCompareIllustration,
  "ia-hub": InboxAnalyzerHubIllustration,
  "ia-my-address": InboxAnalyzerMyAddressIllustration,
  "ia-email-overview": InboxAnalyzerEmailOverviewIllustration,
  "ia-placement": InboxAnalyzerPlacementIllustration,
  "ia-authentication": InboxAnalyzerAuthenticationIllustration,
  "proj-hub": ProjectsHubIllustration,
  "proj-list": ProjectsListIllustration,
  "proj-calendar": ProjectsCalendarIllustration,
  "proj-templates": ProjectsTemplatesIllustration,
  "proj-detail": ProjectsDetailIllustration,
  "proj-task-sheet": ProjectsTaskSheetIllustration,
  "proj-comments": ProjectsCommentsIllustration,
  "proj-activity": ProjectsActivityIllustration,
  "proj-template-editor": ProjectsTemplateEditorIllustration,
  "proj-new-dialog": ProjectsNewDialogIllustration,
  "proj-dashboard": ProjectsDashboardIllustration,
};
