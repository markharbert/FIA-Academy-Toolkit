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
};
