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
};
