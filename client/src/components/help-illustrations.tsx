import step1 from "@assets/help/step1.jpg";
import step2 from "@assets/help/step2.jpg";
import step3 from "@assets/help/step3.jpg";
import step4 from "@assets/help/step4.jpg";
import step5 from "@assets/help/step5.jpg";
import step6 from "@assets/help/step6.jpg";
import step7 from "@assets/help/step7.jpg";

import srP1Step1 from "@assets/help/sr-p1-step1.jpg";
import srP1Step2 from "@assets/help/sr-p1-step2.jpg";
import srP1Step4 from "@assets/help/sr-p1-step4.jpg";
import srP1Step5 from "@assets/help/sr-p1-step5.jpg";
import srP1Step6 from "@assets/help/sr-p1-step6.jpg";

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

export function PostmasterSignInIllustration() {
  return <ScreenshotIllustration src={srP1Step1} alt="Google sign-in page for accessing Google Postmaster Tools" />;
}

export function PostmasterSetupGuideIllustration() {
  return <ScreenshotIllustration src={srP1Step2} alt="Google's official Set up Postmaster Tools help page showing steps to add and verify a domain" />;
}

export function GoDaddyDNSIllustration() {
  return <ScreenshotIllustration src={srP1Step4} alt="GoDaddy help page showing how to add a TXT record in the DNS settings" />;
}

export function CloudflareDNSIllustration() {
  return <ScreenshotIllustration src={srP1Step5} alt="Cloudflare documentation showing how to create DNS records including TXT records" />;
}

export function MxToolboxIllustration() {
  return <ScreenshotIllustration src={srP1Step6} alt="MXToolbox SuperTool for verifying DNS records and checking domain configuration" />;
}

export const ILLUSTRATIONS: Record<string, React.ComponentType> = {
  "video-tools-hub": VideoToolsHubIllustration,
  "sessions-list": SessionsListIllustration,
  "upload-page": UploadPageIllustration,
  "score-summary": ScoreSummaryIllustration,
  "formula-breakdown": FormulaBreakdownIllustration,
  "hook-expanded": HookExpandedIllustration,
  "transcript-download": TranscriptDownloadIllustration,
  "postmaster-signin": PostmasterSignInIllustration,
  "postmaster-setup-guide": PostmasterSetupGuideIllustration,
  "godaddy-dns": GoDaddyDNSIllustration,
  "cloudflare-dns": CloudflareDNSIllustration,
  "mxtoolbox-verify": MxToolboxIllustration,
};
