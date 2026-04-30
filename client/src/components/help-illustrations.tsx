import step1 from "@assets/help/step1.jpg";
import step2 from "@assets/help/step2.jpg";
import step3 from "@assets/help/step3.jpg";
import step4 from "@assets/help/step4.jpg";
import step5 from "@assets/help/step5.jpg";
import step6 from "@assets/help/step6.jpg";
import step7 from "@assets/help/step7.jpg";
import step8 from "@assets/help/step8.jpg";
import step9 from "@assets/help/step9.jpg";
import step10 from "@assets/help/step10.jpg";

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

export function SidebarNavIllustration() {
  return <ScreenshotIllustration src={step1} alt="Sidebar showing Video Tools highlighted" />;
}

export function VideoToolsHubIllustration() {
  return <ScreenshotIllustration src={step2} alt="Video Tools hub showing Video Score, Video Trends, and Scripts cards" />;
}

export function SessionsListIllustration() {
  return <ScreenshotIllustration src={step3} alt="Video Score sessions list with New Session button" />;
}

export function GoalTypeSelectorIllustration() {
  return <ScreenshotIllustration src={step4} alt="New Practice Session dialog with goal type selector" />;
}

export function DeviceSetupIllustration() {
  return <ScreenshotIllustration src={step5} alt="Camera and microphone setup screen with audio level meter" />;
}

export function RecordingInterfaceIllustration() {
  return <ScreenshotIllustration src={step6} alt="Recording in progress with REC indicator and Stop button" />;
}

export function ProcessingStatusIllustration() {
  return <ScreenshotIllustration src={step7} alt="Processing pipeline showing Upload, Transcription, AI Scoring steps" />;
}

export function OverallScoreIllustration() {
  return <ScreenshotIllustration src={step8} alt="Overall score circle showing 82 out of 100 with formula breakdown bars" />;
}

export function FormulaBreakdownIllustration() {
  return <ScreenshotIllustration src={step9} alt="Detailed feedback cards for Hook and Set the Hook sections" />;
}

export function DownloadReportIllustration() {
  return <ScreenshotIllustration src={step10} alt="Download PDF Report button and Retranscribe option" />;
}

export const ILLUSTRATIONS: Record<string, React.ComponentType> = {
  "sidebar-nav": SidebarNavIllustration,
  "video-tools-hub": VideoToolsHubIllustration,
  "sessions-list": SessionsListIllustration,
  "goal-type-selector": GoalTypeSelectorIllustration,
  "device-setup": DeviceSetupIllustration,
  "recording-interface": RecordingInterfaceIllustration,
  "processing-status": ProcessingStatusIllustration,
  "overall-score": OverallScoreIllustration,
  "formula-breakdown": FormulaBreakdownIllustration,
  "download-report": DownloadReportIllustration,
};
