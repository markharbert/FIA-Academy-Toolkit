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

import srP2Top from "@assets/help/sr-p2-top.jpg";
import srP2Charts1 from "@assets/help/sr-p2-charts1.jpg";
import srP2Charts2 from "@assets/help/sr-p2-charts2.jpg";
import srP2Compliance from "@assets/help/sr-p2-compliance.jpg";
import srP2ComplianceExpanded from "@assets/help/sr-p2-compliance-expanded.jpg";
import srP2ActionPlan from "@assets/help/sr-p2-action-plan.jpg";
import srP2Infrastructure from "@assets/help/sr-p2-infrastructure.jpg";

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
  return <ScreenshotIllustration src={srP2Top} alt="Sender Reputation page showing the Connect Google Postmaster setup card with two steps before any account is linked" />;
}

export function SrP2DashboardTopIllustration() {
  return <ScreenshotIllustration src={srP2Top} alt="Sender Reputation dashboard header showing High Reputation badge, Connected status with email, time range selector, Refresh button, and six stat cards for Spam Rate, SPF, DKIM, DMARC, Outbound TLS, and Inbound TLS" />;
}

export function SrP2OverviewChartsIllustration() {
  return <ScreenshotIllustration src={srP2Charts1} alt="Overview tab showing Spam Complaint Rate area chart with 0.1% and 0.3% reference lines on the left, and Domain Reputation History stepped line chart on the right" />;
}

export function SrP2AuthTlsChartsIllustration() {
  return <ScreenshotIllustration src={srP2Charts2} alt="Overview tab showing Authentication Pass Rates card with SPF, DKIM, and DMARC progress bars and line chart on the left, and TLS Encryption card with Outbound and Inbound area chart on the right" />;
}

export function SrP2ComplianceChecklistIllustration() {
  return <ScreenshotIllustration src={srP2Compliance} alt="Compliance tab showing Gmail Compliance card with 6 Passing badge and checklist rows for SPF, DKIM, DMARC, Spam Complaint Rate, TLS Encryption, and Reverse DNS all showing Passing status" />;
}

export function SrP2ComplianceDetailIllustration() {
  return <ScreenshotIllustration src={srP2ComplianceExpanded} alt="Compliance tab with SPF Authentication row expanded showing the requirement description, 99% pass rate excellent note, and link to Google's guidance" />;
}

export function SrP2ActionPlanIllustration() {
  return <ScreenshotIllustration src={srP2ActionPlan} alt="Action Plan tab showing an All clear badge and a single green Healthy card titled Everything looks great — your email health is in good shape" />;
}

export function SrP2InfrastructureIllustration() {
  return <ScreenshotIllustration src={srP2Infrastructure} alt="Infrastructure tab showing Sending IP Reputation card with 8 High IPs and 2 Medium IPs, and Delivery Errors card showing no significant delivery errors" />;
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
