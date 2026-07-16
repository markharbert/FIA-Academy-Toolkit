import { Handle, Position, type NodeProps, useReactFlow, NodeResizer, useStore } from "@xyflow/react";
import { useCallback, useState, useRef, useEffect } from "react";
import {
  Mail, MessageSquare, Search, Mic, StickyNote, Globe, X, Copy,
  UserPlus, CheckCircle, DollarSign, PlayCircle, Radio,
  CreditCard, TrendingUp, TrendingDown, ExternalLink, Video, Timer,
} from "lucide-react";
import {
  SiFacebook, SiInstagram, SiYoutube, SiTiktok, SiGoogle,
  SiPinterest, SiLinkedin, SiX, SiSnapchat, SiReddit,
  SiThreads, SiSpotify,
} from "react-icons/si";
import { useCanvasTheme } from "./canvas-theme-context";

export type FunnelNodeType =
  | "trafficSource"
  | "capturePage"
  | "thankYouPage"
  | "emailNode"
  | "salesPage"
  | "videoPage"
  | "webinar"
  | "zoom"
  | "orderForm"
  | "upsell"
  | "downsell"
  | "externalLink"
  | "delay"
  | "note"
  | "smsNode";

export interface FunnelNodeData {
  label: string;
  nodeType: FunnelNodeType;
  description?: string;
  notes?: string;
  accentColor?: string;
  estimatedTraffic?: number;
  costPerClick?: number;
  conversionRate?: number;
  trafficPlatform?: string;
  trafficPlatforms?: string[];
  pageUrl?: string;
  pagePreviewUrl?: string;
  emailSubject?: string;
  emailBody?: string;
  emailDay?: number;
  smsBody?: string;
  smsDay?: number;
  delayAmount?: number;
  delayUnit?: string;
  delayDirection?: "before" | "after";
  delayReference?: string;
  [key: string]: unknown;
}

export const TRAFFIC_PLATFORMS: Record<string, {
  label: string;
  Icon: React.ElementType;
  color: string;
}> = {
  facebook:  { label: "Facebook",    Icon: SiFacebook,    color: "#1877F2" },
  instagram: { label: "Instagram",   Icon: SiInstagram,   color: "#E4405F" },
  youtube:   { label: "YouTube",     Icon: SiYoutube,     color: "#FF0000" },
  tiktok:    { label: "TikTok",      Icon: SiTiktok,      color: "#69C9D0" },
  google:    { label: "Google Ads",  Icon: SiGoogle,      color: "#4285F4" },
  pinterest: { label: "Pinterest",   Icon: SiPinterest,   color: "#E60023" },
  linkedin:  { label: "LinkedIn",    Icon: SiLinkedin,    color: "#0A66C2" },
  twitter:   { label: "X / Twitter", Icon: SiX,           color: "#e7e9ea" },
  snapchat:  { label: "Snapchat",    Icon: SiSnapchat,    color: "#FFFC00" },
  reddit:    { label: "Reddit",      Icon: SiReddit,      color: "#FF4500" },
  threads:   { label: "Threads",     Icon: SiThreads,     color: "#aaaaaa" },
  spotify:   { label: "Podcast",     Icon: SiSpotify,     color: "#1DB954" },
  email:     { label: "Email",       Icon: Mail,          color: "#94A3B8" },
  sms:       { label: "SMS",         Icon: MessageSquare, color: "#10B981" },
  organic:   { label: "Organic/SEO", Icon: Search,        color: "#A78BFA" },
  podcast:   { label: "Podcast",     Icon: Mic,           color: "#F59E0B" },
};

export const NODE_CONFIGS: Record<FunnelNodeType, {
  label: string;
  color: string;
  lightColor: string;
  hexColor: string;
  bg: string;
  border: string;
  lightBorder: string;
  icon: React.ElementType;
  description: string;
}> = {
  trafficSource: { label: "Traffic Source", color: "text-sky-300",     lightColor: "text-sky-600",     hexColor: "#38BDF8", bg: "bg-sky-950/80",     border: "border-sky-500/60",     lightBorder: "border-sky-300",     icon: Globe,         description: "Ads, social, email, SEO" },
  capturePage:   { label: "Capture Page",   color: "text-violet-300",  lightColor: "text-violet-600",  hexColor: "#A78BFA", bg: "bg-violet-950/80", border: "border-violet-500/60", lightBorder: "border-violet-300", icon: UserPlus,      description: "Opt-in / lead capture" },
  thankYouPage:  { label: "Thank-You Page", color: "text-emerald-300", lightColor: "text-emerald-600", hexColor: "#34D399", bg: "bg-emerald-950/80",border: "border-emerald-500/60",lightBorder: "border-emerald-300",icon: CheckCircle,   description: "Confirmation after opt-in" },
  emailNode:     { label: "Email",          color: "text-cyan-300",    lightColor: "text-cyan-600",    hexColor: "#22D3EE", bg: "bg-cyan-950/80",   border: "border-cyan-500/60",   lightBorder: "border-cyan-300",   icon: Mail,          description: "Single email — write it right here" },
  smsNode:       { label: "SMS",            color: "text-emerald-300", lightColor: "text-emerald-600", hexColor: "#10B981", bg: "bg-emerald-950/80",border: "border-emerald-500/60",lightBorder: "border-emerald-300",icon: MessageSquare, description: "Single SMS / text message" },
  salesPage:     { label: "Sales Page",     color: "text-amber-300",   lightColor: "text-amber-600",   hexColor: "#FCD34D", bg: "bg-amber-950/80",  border: "border-amber-500/60",  lightBorder: "border-amber-300",  icon: DollarSign,    description: "Long-form sales letter" },
  videoPage:     { label: "Video Page",     color: "text-rose-300",    lightColor: "text-rose-600",    hexColor: "#FB7185", bg: "bg-rose-950/80",   border: "border-rose-500/60",   lightBorder: "border-rose-300",   icon: PlayCircle,    description: "Video sales letter (VSL)" },
  webinar:       { label: "Webinar Registration", color: "text-indigo-300", lightColor: "text-indigo-600", hexColor: "#818CF8", bg: "bg-indigo-950/80", border: "border-indigo-500/60", lightBorder: "border-indigo-300", icon: Radio, description: "Webinar registration / opt-in page" },
  zoom:          { label: "Zoom",           color: "text-blue-300",    lightColor: "text-blue-600",    hexColor: "#2D8CFF", bg: "bg-blue-950/80",   border: "border-blue-500/60",   lightBorder: "border-blue-300",   icon: Video,         description: "Zoom webinar or meeting" },
  orderForm:     { label: "Order Form",     color: "text-orange-300",  lightColor: "text-orange-600",  hexColor: "#FB923C", bg: "bg-orange-950/80", border: "border-orange-500/60", lightBorder: "border-orange-300", icon: CreditCard,    description: "Checkout / payment page" },
  upsell:        { label: "Upsell",         color: "text-green-300",   lightColor: "text-green-600",   hexColor: "#4ADE80", bg: "bg-green-950/80",  border: "border-green-500/60",  lightBorder: "border-green-300",  icon: TrendingUp,    description: "One-click upsell offer" },
  downsell:      { label: "Downsell",       color: "text-pink-300",    lightColor: "text-pink-600",    hexColor: "#F472B6", bg: "bg-pink-950/80",   border: "border-pink-500/60",   lightBorder: "border-pink-300",   icon: TrendingDown,  description: "Fallback offer for declines" },
  externalLink:  { label: "External Link",  color: "text-slate-300",   lightColor: "text-slate-600",   hexColor: "#94A3B8", bg: "bg-slate-800/80",  border: "border-slate-500/60",  lightBorder: "border-slate-300",  icon: ExternalLink,  description: "Link to external resource" },
  delay:         { label: "Delay",          color: "text-amber-300",   lightColor: "text-amber-600",   hexColor: "#F59E0B", bg: "bg-amber-950/60",  border: "border-amber-500/50",  lightBorder: "border-amber-400",  icon: Timer,         description: "Wait X hours / days / weeks" },
  note:          { label: "Note",           color: "text-yellow-300",  lightColor: "text-yellow-700",  hexColor: "#FDE047", bg: "bg-yellow-950/60", border: "border-yellow-500/50", lightBorder: "border-yellow-300", icon: StickyNote,    description: "Sticky note / annotation" },
};

/* ─────────────────────────────────────────────────────────────
   SVG PAGE MOCKUPS  (viewBox 0 0 148 96)
───────────────────────────────────────────────────────────── */

function Frame({ c, children }: { c: string; children?: React.ReactNode }) {
  return (
    <>
      <rect x="2" y="2" width="144" height="92" rx="7" fill="rgba(0,0,0,0.55)" stroke={c} strokeWidth="1.5" />
      <circle cx="13" cy="10" r="2.5" fill={c} opacity="0.55" />
      <circle cx="20" cy="10" r="2.5" fill={c} opacity="0.55" />
      <circle cx="27" cy="10" r="2.5" fill={c} opacity="0.55" />
      <line x1="2" y1="18" x2="146" y2="18" stroke={c} strokeWidth="0.8" opacity="0.3" />
      {children}
    </>
  );
}

function CapturePageSVG({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 148 96" width="148" height="96">
      <Frame c={c}>
        <rect x="2" y="18" width="144" height="22" fill={c} opacity="0.6" />
        <rect x="26" y="22" width="96" height="5" rx="2.5" fill="white" opacity="0.65" />
        <rect x="40" y="30" width="68" height="3.5" rx="1.5" fill="white" opacity="0.35" />
        <rect x="10" y="46" width="128" height="9" rx="2" fill="rgba(255,255,255,0.06)" stroke="white" strokeWidth="0.7" strokeOpacity="0.3" />
        <rect x="15" y="49" width="50" height="3" rx="1.5" fill="white" opacity="0.18" />
        <rect x="10" y="58" width="128" height="9" rx="2" fill="rgba(255,255,255,0.06)" stroke="white" strokeWidth="0.7" strokeOpacity="0.3" />
        <rect x="15" y="61" width="40" height="3" rx="1.5" fill="white" opacity="0.18" />
        <rect x="16" y="73" width="116" height="14" rx="4" fill={c} opacity="0.95" />
        <rect x="48" y="78" width="52" height="4" rx="2" fill="white" opacity="0.8" />
      </Frame>
    </svg>
  );
}

function ThankYouSVG({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 148 96" width="148" height="96">
      <Frame c={c}>
        <rect x="2" y="18" width="144" height="14" fill={c} opacity="0.5" />
        <circle cx="74" cy="52" r="18" stroke={c} strokeWidth="2.5" fill="none" />
        <path d="M63 52 L71 61 L87 40" stroke={c} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="28" y="76" width="92" height="4.5" rx="2" fill="white" opacity="0.45" />
        <rect x="42" y="83" width="64" height="3.5" rx="1.5" fill="white" opacity="0.25" />
      </Frame>
    </svg>
  );
}

function SalesPageSVG({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 148 96" width="148" height="96">
      <Frame c={c}>
        <rect x="8" y="20" width="132" height="42" rx="3" fill="rgba(0,0,0,0.65)" stroke={c} strokeWidth="0.8" strokeOpacity="0.45" />
        <circle cx="74" cy="41" r="13" fill={c} opacity="0.2" stroke={c} strokeWidth="1.5" />
        <polygon points="70,35 70,47 82,41" fill={c} opacity="0.95" />
        <rect x="10" y="67" width="128" height="4" rx="2" fill="white" opacity="0.45" />
        <rect x="16" y="76" width="116" height="14" rx="4" fill={c} opacity="0.9" />
        <rect x="46" y="81" width="56" height="4" rx="2" fill="white" opacity="0.8" />
      </Frame>
    </svg>
  );
}

function OrderFormSVG({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 148 96" width="148" height="96">
      <Frame c={c}>
        <rect x="8" y="20" width="38" height="22" rx="4" fill={c} opacity="0.45" stroke={c} strokeWidth="1" />
        <rect x="12" y="26" width="20" height="3.5" rx="1.5" fill="white" opacity="0.55" />
        <rect x="52" y="20" width="88" height="22" rx="4" fill="rgba(255,255,255,0.05)" stroke="white" strokeWidth="0.6" strokeOpacity="0.25" />
        <rect x="56" y="25" width="9" height="6" rx="1.5" fill={c} opacity="0.5" />
        <rect x="69" y="25" width="9" height="6" rx="1.5" fill="white" opacity="0.25" />
        <rect x="82" y="25" width="9" height="6" rx="1.5" fill="white" opacity="0.2" />
        <rect x="8" y="47" width="132" height="9" rx="2" fill="rgba(255,255,255,0.06)" stroke="white" strokeWidth="0.6" strokeOpacity="0.25" />
        <rect x="13" y="50" width="60" height="3" rx="1.5" fill="white" opacity="0.18" />
        <rect x="8" y="60" width="62" height="8" rx="2" fill="rgba(255,255,255,0.06)" stroke="white" strokeWidth="0.5" strokeOpacity="0.2" />
        <rect x="80" y="60" width="60" height="8" rx="2" fill="rgba(255,255,255,0.06)" stroke="white" strokeWidth="0.5" strokeOpacity="0.2" />
        <rect x="8" y="74" width="132" height="14" rx="4" fill={c} opacity="0.95" />
        <rect x="42" y="79" width="64" height="4" rx="2" fill="white" opacity="0.8" />
      </Frame>
    </svg>
  );
}

function UpsellSVG({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 148 96" width="148" height="96">
      <Frame c={c}>
        <polygon points="74,20 92,38 83,38 83,52 65,52 65,38 56,38" fill={c} opacity="0.8" />
        <rect x="14" y="57" width="120" height="5" rx="2.5" fill="white" opacity="0.5" />
        <rect x="28" y="65" width="92" height="4" rx="2" fill={c} opacity="0.55" />
        <rect x="12" y="75" width="124" height="15" rx="4" fill={c} opacity="0.9" />
        <rect x="54" y="80" width="40" height="4.5" rx="2" fill="white" opacity="0.85" />
      </Frame>
    </svg>
  );
}

function DownsellSVG({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 148 96" width="148" height="96">
      <Frame c={c}>
        <polygon points="74,52 92,34 83,34 83,20 65,20 65,34 56,34" fill={c} opacity="0.8" />
        <rect x="14" y="57" width="120" height="5" rx="2.5" fill="white" opacity="0.5" />
        <rect x="28" y="65" width="92" height="4" rx="2" fill={c} opacity="0.55" />
        <rect x="12" y="75" width="124" height="15" rx="4" fill={c} opacity="0.85" />
        <rect x="46" y="80" width="56" height="4.5" rx="2" fill="white" opacity="0.8" />
      </Frame>
    </svg>
  );
}

function VideoPageSVG({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 148 96" width="148" height="96">
      <Frame c={c}>
        <rect x="6" y="19" width="136" height="58" rx="3" fill="rgba(0,0,0,0.7)" />
        <circle cx="74" cy="48" r="16" stroke={c} strokeWidth="2" fill="rgba(0,0,0,0.35)" />
        <polygon points="69,41 69,55 83,48" fill={c} opacity="0.95" />
        <rect x="6" y="79" width="136" height="3.5" rx="1.5" fill="rgba(255,255,255,0.1)" />
        <rect x="6" y="79" width="56" height="3.5" rx="1.5" fill={c} opacity="0.75" />
        <rect x="8" y="86" width="30" height="3" rx="1.5" fill="white" opacity="0.25" />
      </Frame>
    </svg>
  );
}

function WebinarSVG({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 148 96" width="148" height="96">
      <Frame c={c}>
        <rect x="6" y="19" width="104" height="42" rx="3" fill="rgba(0,0,0,0.5)" stroke={c} strokeWidth="1" strokeOpacity="0.55" />
        <path d="M112,24 L142,19 L142,60 L112,56 Z" fill={c} opacity="0.45" />
        <circle cx="46" cy="32" r="7" fill={c} opacity="0.25" />
        <path d="M30,52 Q46,42 62,52" stroke={c} strokeWidth="1.5" fill={c} fillOpacity="0.15" />
        <rect x="66" y="27" width="36" height="4" rx="2" fill="white" opacity="0.18" />
        <rect x="66" y="34" width="28" height="4" rx="2" fill="white" opacity="0.14" />
        <rect x="66" y="41" width="32" height="4" rx="2" fill="white" opacity="0.12" />
        <rect x="6" y="68" width="136" height="22" rx="4" fill={c} opacity="0.85" />
        <rect x="36" y="76" width="76" height="5" rx="2.5" fill="white" opacity="0.8" />
      </Frame>
    </svg>
  );
}

function ZoomSVG({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 148 96" width="148" height="96">
      <rect x="0" y="0" width="148" height="96" rx="0" fill="rgba(0,0,0,0.75)" />
      {/* Main speaker tile */}
      <rect x="4" y="4" width="96" height="60" rx="4" fill="rgba(0,0,0,0.5)" stroke={c} strokeWidth="1" strokeOpacity="0.6" />
      <circle cx="52" cy="24" r="10" fill={c} opacity="0.25" />
      <path d="M34,44 Q52,34 70,44" stroke={c} strokeWidth="1.5" fill={c} fillOpacity="0.12" />
      {/* Participant tiles on the right */}
      <rect x="104" y="4" width="40" height="28" rx="3" fill="rgba(255,255,255,0.07)" stroke={c} strokeWidth="0.8" strokeOpacity="0.4" />
      <circle cx="124" cy="14" r="5" fill={c} opacity="0.22" />
      <path d="M114,26 Q124,20 134,26" stroke={c} strokeWidth="1" fill="none" strokeOpacity="0.4" />
      <rect x="104" y="36" width="40" height="28" rx="3" fill="rgba(255,255,255,0.07)" stroke={c} strokeWidth="0.8" strokeOpacity="0.4" />
      <circle cx="124" cy="46" r="5" fill={c} opacity="0.22" />
      <path d="M114,58 Q124,52 134,58" stroke={c} strokeWidth="1" fill="none" strokeOpacity="0.4" />
      {/* Controls bar */}
      <rect x="4" y="70" width="140" height="22" rx="4" fill="rgba(255,255,255,0.06)" />
      <circle cx="34" cy="81" r="7" fill={c} opacity="0.8" />
      <line x1="30" y1="77" x2="38" y2="85" stroke="white" strokeWidth="1.5" strokeOpacity="0.7" />
      <line x1="38" y1="77" x2="30" y2="85" stroke="white" strokeWidth="1.5" strokeOpacity="0.7" />
      <circle cx="74" cy="81" r="7" fill={c} opacity="0.4" />
      <rect cx="74" cy="81" x="69" y="77" width="8" height="5" rx="1.5" fill="white" opacity="0.55" />
      <path d="M78,82 L83,79 L83,84 Z" fill="white" opacity="0.55" />
      <circle cx="114" cy="81" r="7" fill={c} opacity="0.4" />
      <rect x="110" y="78" width="8" height="6" rx="1.5" fill="white" opacity="0.5" />
    </svg>
  );
}


function EmailNodeSVG({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 148 96" width="100%" height="100%">
      <rect x="0" y="0" width="148" height="96" fill="rgba(0,0,0,0.5)" />
      <rect x="10" y="14" width="128" height="70" rx="6" fill="white" fillOpacity="0.92" stroke="rgba(0,0,0,0.6)" strokeWidth="2" />
      <path d="M10,14 L74,56 L138,14" stroke="rgba(0,0,0,0.55)" strokeWidth="2.5" fill="none" strokeLinejoin="round" />
      <line x1="10" y1="84" x2="52" y2="52" stroke="rgba(0,0,0,0.22)" strokeWidth="1.5" />
      <line x1="138" y1="84" x2="96" y2="52" stroke="rgba(0,0,0,0.22)" strokeWidth="1.5" />
    </svg>
  );
}

function SmsNodeSVG({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 148 96" width="100%" height="100%">
      {/* Dark emerald background */}
      <rect x="0" y="0" width="148" height="96" fill="#022c22" />
      {/* Phone body */}
      <rect x="38" y="4" width="72" height="88" rx="11" fill="#052e16" stroke={c} strokeWidth="2.5" />
      {/* Screen */}
      <rect x="44" y="14" width="60" height="64" rx="4" fill="#041f15" />
      {/* Received bubble — bright solid green */}
      <rect x="48" y="19" width="36" height="16" rx="8" fill={c} />
      <polygon points="48,30 40,35 50,33" fill={c} />
      {/* Sent bubble — dimmer white */}
      <rect x="64" y="41" width="34" height="15" rx="7.5" fill="white" fillOpacity="0.28" />
      <polygon points="98,52 106,56 96,54" fill="white" fillOpacity="0.28" />
      {/* Received bubble — second, slightly smaller */}
      <rect x="48" y="62" width="28" height="13" rx="6.5" fill={c} fillOpacity="0.75" />
      <polygon points="48,72 40,76 50,74" fill={c} fillOpacity="0.75" />
      {/* Home bar */}
      <rect x="60" y="84" width="28" height="3.5" rx="1.75" fill={c} fillOpacity="0.5" />
    </svg>
  );
}

function ExternalLinkSVG({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 148 96" width="148" height="96">
      <Frame c={c}>
        <rect x="8" y="20" width="132" height="13" rx="3" fill="rgba(255,255,255,0.07)" stroke="white" strokeWidth="0.6" strokeOpacity="0.25" />
        <circle cx="18" cy="26.5" r="4" stroke={c} strokeWidth="1" fill="none" opacity="0.6" />
        <rect x="26" y="24" width="90" height="5" rx="2.5" fill="white" opacity="0.22" />
        <circle cx="74" cy="60" r="22" stroke={c} strokeWidth="2" fill="none" opacity="0.7" />
        <ellipse cx="74" cy="60" rx="10" ry="22" stroke={c} strokeWidth="1.2" fill="none" opacity="0.45" />
        <line x1="52" y1="60" x2="96" y2="60" stroke={c} strokeWidth="1.2" opacity="0.45" />
        <line x1="57" y1="43" x2="57" y2="77" stroke={c} strokeWidth="0.8" opacity="0.25" />
        <line x1="91" y1="43" x2="91" y2="77" stroke={c} strokeWidth="0.8" opacity="0.25" />
        <path d="M87,46 L96,46 L96,55" stroke={c} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <line x1="84" y1="58" x2="96" y2="46" stroke={c} strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
      </Frame>
    </svg>
  );
}

const MOCKUPS: Record<FunnelNodeType, (c: string) => React.ReactNode> = {
  capturePage:   (c) => <CapturePageSVG c={c} />,
  thankYouPage:  (c) => <ThankYouSVG c={c} />,
  salesPage:     (c) => <SalesPageSVG c={c} />,
  orderForm:     (c) => <OrderFormSVG c={c} />,
  upsell:        (c) => <UpsellSVG c={c} />,
  downsell:      (c) => <DownsellSVG c={c} />,
  videoPage:     (c) => <VideoPageSVG c={c} />,
  webinar:       (c) => <WebinarSVG c={c} />,
  zoom:          (c) => <ZoomSVG c={c} />,
  emailNode:     (c) => <EmailNodeSVG c={c} />,
  smsNode:       (c) => <SmsNodeSVG c={c} />,
  externalLink:  (c) => <ExternalLinkSVG c={c} />,
  trafficSource: (_c) => null,
  delay:         (_c) => null,
  note:          (_c) => null,
};

function Handles() {
  const theme = useCanvasTheme();
  const cls = theme === "light"
    ? "!w-2.5 !h-2.5 !border-2 !border-gray-300 !bg-white"
    : "!w-2.5 !h-2.5 !border-2 !border-white/30 !bg-slate-900";
  return (
    <>
      <Handle id="top"    type="source" position={Position.Top}    className={cls} />
      <Handle id="bottom" type="source" position={Position.Bottom} className={cls} />
      <Handle id="left"   type="source" position={Position.Left}   className={cls} />
      <Handle id="right"  type="source" position={Position.Right}  className={cls} />
    </>
  );
}

function DuplicateButton({ id, positionCls = "absolute top-1.5 left-1.5 z-10" }: { id: string; positionCls?: string }) {
  const theme = useCanvasTheme();
  const { getNode, setNodes } = useReactFlow();

  const stopAll = (e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e as React.PointerEvent).nativeEvent?.stopImmediatePropagation();
  };

  return (
    <button
      className={`${positionCls} w-5 h-5 rounded-full flex items-center justify-center border transition-all cursor-pointer opacity-0 group-hover:opacity-100 hover:bg-indigo-500/80 hover:text-white hover:border-indigo-400/60 ${
        theme === "light"
          ? "bg-white border-gray-200 text-gray-400"
          : "bg-black/50 border-white/15 text-white/40"
      }`}
      title="Duplicate node"
      data-testid={`button-duplicate-node-${id}`}
      onPointerDown={(e) => {
        stopAll(e);
        const node = getNode(id);
        if (!node) return;
        const newId = `n${Date.now()}${Math.floor(Math.random() * 1000)}`;
        setNodes((nds) => [
          ...nds,
          {
            ...node,
            id: newId,
            selected: false,
            position: { x: node.position.x + 24, y: node.position.y + 24 },
            data: { ...node.data },
          },
        ]);
      }}
    >
      <Copy className="w-2.5 h-2.5" />
    </button>
  );
}

function DeleteButton({ id, positionCls = "absolute top-1.5 right-1.5 z-10" }: { id: string; positionCls?: string }) {
  const theme = useCanvasTheme();
  const { deleteElements } = useReactFlow();
  const [confirming, setConfirming] = useState(false);

  const stopAll = (e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e as React.PointerEvent).nativeEvent?.stopImmediatePropagation();
  };

  if (confirming) {
    return (
      <div
        className={`absolute top-1 right-1 z-20 flex items-center gap-0.5 rounded-lg px-1.5 py-1 shadow-xl nodrag nopan border ${
          theme === "light" ? "bg-white border-gray-200" : "bg-gray-900/95 border-white/15"
        }`}
        onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={`text-[9px] mr-1 whitespace-nowrap ${theme === "light" ? "text-gray-500" : "text-white/50"}`}>Delete?</span>
        <button
          className="text-[9px] font-semibold text-red-500 hover:text-white bg-red-500/20 hover:bg-red-500/70 transition-colors px-1.5 py-0.5 rounded"
          data-testid={`button-confirm-delete-${id}`}
          onPointerDown={(e) => { stopAll(e); deleteElements({ nodes: [{ id }] }); }}
        >Yes</button>
        <button
          className={`text-[9px] transition-colors px-1.5 py-0.5 rounded ${
            theme === "light"
              ? "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              : "text-white/40 hover:text-white/80 hover:bg-white/10"
          }`}
          data-testid={`button-cancel-delete-${id}`}
          onPointerDown={(e) => { stopAll(e); setConfirming(false); }}
        >No</button>
      </div>
    );
  }

  return (
    <button
      className={`${positionCls} w-5 h-5 rounded-full flex items-center justify-center border transition-all cursor-pointer opacity-0 group-hover:opacity-100 hover:bg-red-500/80 hover:text-white hover:border-red-400/60 ${
        theme === "light"
          ? "bg-white border-gray-200 text-gray-400"
          : "bg-black/50 border-white/15 text-white/40"
      }`}
      title="Delete node"
      data-testid={`button-delete-node-${id}`}
      onPointerDown={(e) => { stopAll(e); setConfirming(true); }}
    >
      <X className="w-2.5 h-2.5" />
    </button>
  );
}

function NodeLabel({ typeLabel, customLabel, typeColor, lightTypeColor, description, accentHex }: {
  typeLabel: string;
  customLabel: string;
  typeColor: string;
  lightTypeColor: string;
  description?: string;
  accentHex?: string;
}) {
  const theme = useCanvasTheme();
  const usedColor = theme === "light" ? lightTypeColor : typeColor;
  return (
    <div className={`px-2.5 py-2 border-t ${theme === "light" ? "border-gray-100" : "border-white/[0.08]"}`}>
      <div
        className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${accentHex ? "" : usedColor}`}
        style={accentHex ? { color: accentHex } : undefined}
      >{typeLabel}</div>
      <div className={`text-xs font-semibold leading-tight truncate ${theme === "light" ? "text-gray-900" : "text-white"}`}>{customLabel}</div>
      {description && (
        <div className={`text-[10px] mt-0.5 leading-tight line-clamp-1 ${theme === "light" ? "text-gray-500" : "text-white/40"}`}>{description}</div>
      )}
    </div>
  );
}

/* ─── TRAFFIC SOURCE NODE ─── */
function TrafficSourceNode({ id, data, selected }: NodeProps) {
  const nodeData = data as FunnelNodeData;
  const theme = useCanvasTheme();
  const { setNodes } = useReactFlow();

  const platforms: string[] = (nodeData.trafficPlatforms as string[] | undefined) ||
    (nodeData.trafficPlatform ? [nodeData.trafficPlatform as string] : []);
  const picking: boolean = (nodeData as any).pickingMode ?? (platforms.length === 0);

  const accentColor = nodeData.accentColor as string | undefined;
  const containerCls = theme === "light"
    ? `relative rounded-xl border-2 shadow-md transition-all duration-150 overflow-hidden bg-white ${accentColor ? "" : "border-sky-300"} ${selected ? "ring-2 ring-sky-400 ring-offset-1" : ""}`
    : `relative rounded-xl border-2 shadow-xl transition-all duration-150 overflow-hidden bg-sky-950/80 ${accentColor ? "" : "border-sky-500/60"} ${selected ? "ring-2 ring-white/50 ring-offset-1 ring-offset-transparent" : ""}`;
  const containerStyle = accentColor ? { borderColor: accentColor } : undefined;

  const iconBg = theme === "light" ? "bg-gray-50" : "bg-black/35";

  const togglePlatform = useCallback((p: string) => {
    const idx = platforms.indexOf(p);
    let next: string[];
    if (idx >= 0) {
      next = platforms.filter(x => x !== p);
    } else if (platforms.length < 4) {
      next = [...platforms, p];
    } else {
      return;
    }
    const autoLabel = next.length === 0
      ? "Traffic Source"
      : next.length === 1
        ? (TRAFFIC_PLATFORMS[next[0]]?.label ?? next[0])
        : "Multiple Sources";
    // Only auto-open picker if already in picker mode, or all platforms were cleared.
    // Prevents the picker from unexpectedly reopening when a user removes one of 4 platforms.
    const pickingMode = picking || next.length === 0;
    setNodes(nds => nds.map(n =>
      n.id === id ? { ...n, data: { ...n.data, trafficPlatforms: next, trafficPlatform: next[0] || undefined, label: autoLabel, pickingMode } } : n
    ));
  }, [id, setNodes, platforms, picking]);

  const closePicker = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes(nds => nds.map(n =>
      n.id === id ? { ...n, data: { ...n.data, pickingMode: false } } : n
    ));
  }, [id, setNodes]);

  const ALL_PLATFORMS = Object.entries(TRAFFIC_PLATFORMS);

  function renderIconView() {
    const count = platforms.length;
    if (count === 1) {
      const cfg = TRAFFIC_PLATFORMS[platforms[0]];
      return cfg ? <div className={`flex items-center justify-center py-2 ${iconBg}`}><cfg.Icon style={{ color: cfg.color, width: 88, height: 88 }} /></div> : null;
    }
    if (count === 2) {
      return (
        <div className={`grid grid-cols-2 gap-2 px-3 py-3 items-center justify-items-center ${iconBg}`}>
          {platforms.map(p => { const cfg = TRAFFIC_PLATFORMS[p]; return cfg ? <cfg.Icon key={p} style={{ color: cfg.color, width: 52, height: 52 }} /> : null; })}
        </div>
      );
    }
    if (count === 3) {
      return (
        <div className={`grid grid-cols-3 gap-1 px-2 py-3 items-center justify-items-center ${iconBg}`}>
          {platforms.map(p => { const cfg = TRAFFIC_PLATFORMS[p]; return cfg ? <cfg.Icon key={p} style={{ color: cfg.color, width: 38, height: 38 }} /> : null; })}
        </div>
      );
    }
    return (
      <div className={`grid grid-cols-2 gap-2 px-3 py-3 items-center justify-items-center ${iconBg}`}>
        {platforms.map(p => { const cfg = TRAFFIC_PLATFORMS[p]; return cfg ? <cfg.Icon key={p} style={{ color: cfg.color, width: 50, height: 50 }} /> : null; })}
      </div>
    );
  }

  return (
    <div className={`${containerCls} group`} style={{ width: 148, ...containerStyle }} data-testid="funnel-node-trafficSource">
      <Handles />
      <DuplicateButton id={id} />
      <DeleteButton id={id} />
      {!picking && platforms.length > 0 ? (
        renderIconView()
      ) : (
        <div
          className={`p-2 nodrag nopan ${iconBg}`}
          onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
          onClick={(e) => e.stopPropagation()}
        >
          {platforms.length > 0 && (
            <div className="flex items-center justify-center gap-1.5 mb-1.5">
              {platforms.map(p => { const cfg = TRAFFIC_PLATFORMS[p]; return cfg ? <cfg.Icon key={p} style={{ color: cfg.color, width: 20, height: 20 }} /> : null; })}
              <span className={`text-[8px] ml-0.5 ${theme === "light" ? "text-gray-400" : "text-white/30"}`}>{platforms.length}/4</span>
            </div>
          )}
          <div className={`text-[9px] font-bold uppercase tracking-widest mb-1.5 text-center ${theme === "light" ? "text-sky-600" : "text-sky-300/75"}`}>
            {platforms.length === 0 ? "Choose Traffic Source" : "Add more (up to 4)"}
          </div>
          {[ALL_PLATFORMS.slice(0, 8), ALL_PLATFORMS.slice(8)].map((row, ri) => (
            <div key={ri} className={`grid grid-cols-4 gap-1 ${ri > 0 ? "mt-0.5" : ""}`}>
              {row.map(([p, pc]) => {
                const active = platforms.includes(p);
                const maxed = !active && platforms.length >= 4;
                return (
                  <button key={p} title={pc.label}
                    onPointerDown={maxed ? undefined : (e) => { e.stopPropagation(); e.preventDefault(); e.nativeEvent.stopImmediatePropagation(); togglePlatform(p); }}
                    className={`flex flex-col items-center gap-0.5 rounded-md p-1 transition-all border ${
                      active
                        ? "border-sky-400/60 bg-sky-500/25"
                        : maxed
                          ? "border-transparent cursor-not-allowed"
                          : `border-transparent ${theme === "light" ? "hover:bg-gray-100" : "hover:bg-white/10"}`
                    }`}
                    style={{ opacity: maxed ? 0.3 : active ? 1 : 0.6 }}>
                    <pc.Icon style={{ color: pc.color, width: 17, height: 17 }} />
                    <span className={`text-[7px] leading-none truncate w-full text-center ${theme === "light" ? "text-gray-500" : "text-white/40"}`}>{pc.label.split(" ")[0]}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {platforms.length >= 1 && (
            <button onClick={closePicker}
              className="mt-2 w-full text-[10px] font-semibold text-sky-600 hover:text-white bg-sky-500/20 hover:bg-sky-500/40 transition-colors rounded-md py-1"
              data-testid="button-done-traffic-sources">
              ✓ Done
            </button>
          )}
        </div>
      )}
      <NodeLabel typeLabel="Traffic Source" customLabel={nodeData.label} typeColor="text-sky-300" lightTypeColor="text-sky-600" description={nodeData.description} accentHex={accentColor} />
    </div>
  );
}

/* ─── EMAIL NODE ─── */
function EmailNode({ id, data, selected }: NodeProps) {
  const nodeData = data as FunnelNodeData;
  const theme = useCanvasTheme();
  const cfg = NODE_CONFIGS.emailNode;
  const subject = nodeData.emailSubject as string | undefined;
  const day = nodeData.emailDay as number | undefined;
  const body = nodeData.emailBody as string | undefined;

  const accentColor = nodeData.accentColor as string | undefined;
  const containerCls = theme === "light"
    ? `relative rounded-xl border-2 shadow-md transition-all duration-150 overflow-hidden bg-white ${accentColor ? "" : cfg.lightBorder} ${selected ? "ring-2 ring-cyan-400 ring-offset-1" : ""}`
    : `relative rounded-xl border-2 shadow-xl transition-all duration-150 overflow-hidden ${cfg.bg} ${accentColor ? "" : cfg.border} ${selected ? "ring-2 ring-white/50 ring-offset-1 ring-offset-transparent" : ""}`;

  return (
    <div className={`${containerCls} group`} style={{ width: 116, ...(accentColor ? { borderColor: accentColor } : {}) }} data-testid="funnel-node-emailNode">
      <Handles />
      <DuplicateButton id={id} />
      <DeleteButton id={id} />
      <div className="overflow-hidden" style={{ height: 74 }}>
        <EmailNodeSVG c={accentColor ?? cfg.hexColor} />
      </div>
      <div className={`px-2 py-1.5 border-t ${theme === "light" ? "border-gray-100" : "border-white/[0.08]"}`}>
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className={`text-[9px] font-bold uppercase tracking-widest ${accentColor ? "" : (theme === "light" ? cfg.lightColor : cfg.color)}`}
            style={accentColor ? { color: accentColor } : undefined}
          >Email</span>
          {day !== undefined && (
            <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${theme === "light" ? "bg-cyan-50 text-cyan-700" : `bg-white/10 ${cfg.color}`}`}>Day {day}</span>
          )}
        </div>
        <div className={`text-xs font-semibold leading-tight truncate ${theme === "light" ? "text-gray-900" : "text-white"}`}>
          {subject || nodeData.label || "Untitled Email"}
        </div>
        {body && (
          <div className={`text-[10px] mt-0.5 leading-tight line-clamp-1 ${theme === "light" ? "text-gray-500" : "text-white/40"}`}>{body}</div>
        )}
      </div>
    </div>
  );
}

/* ─── SMS NODE ─── */
function SmsNode({ id, data, selected }: NodeProps) {
  const nodeData = data as FunnelNodeData;
  const theme = useCanvasTheme();
  const cfg = NODE_CONFIGS.smsNode;
  const day = nodeData.smsDay as number | undefined;
  const body = nodeData.smsBody as string | undefined;
  const accentColor = nodeData.accentColor as string | undefined;

  const containerCls = theme === "light"
    ? `relative rounded-xl border-2 shadow-md transition-all duration-150 overflow-hidden bg-white ${accentColor ? "" : cfg.lightBorder} ${selected ? "ring-2 ring-emerald-400 ring-offset-1" : ""}`
    : `relative rounded-xl border-2 shadow-xl transition-all duration-150 overflow-hidden ${cfg.bg} ${accentColor ? "" : cfg.border} ${selected ? "ring-2 ring-white/50 ring-offset-1 ring-offset-transparent" : ""}`;

  return (
    <div className={`${containerCls} group`} style={{ width: 96, ...(accentColor ? { borderColor: accentColor } : {}) }} data-testid="funnel-node-smsNode">
      <Handles />
      <DuplicateButton id={id} />
      <DeleteButton id={id} />
      <div className="overflow-hidden" style={{ height: 60 }}>
        <SmsNodeSVG c={accentColor ?? cfg.hexColor} />
      </div>
      <div className={`px-2 py-1.5 border-t ${theme === "light" ? "border-gray-100" : "border-white/[0.08]"}`}>
        <div className="flex items-center gap-1.5 mb-0.5">
          <span
            className={`text-[9px] font-bold uppercase tracking-widest ${accentColor ? "" : (theme === "light" ? cfg.lightColor : cfg.color)}`}
            style={accentColor ? { color: accentColor } : undefined}
          >SMS</span>
          {day !== undefined && (
            <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full ${theme === "light" ? "bg-emerald-50 text-emerald-700" : `bg-white/10 ${cfg.color}`}`}>Day {day}</span>
          )}
        </div>
        <div className={`text-xs font-semibold leading-tight truncate ${theme === "light" ? "text-gray-900" : "text-white"}`}>
          {nodeData.label || "Untitled SMS"}
        </div>
        {body && (
          <div className={`text-[10px] mt-0.5 leading-tight line-clamp-1 ${theme === "light" ? "text-gray-500" : "text-white/40"}`}>{body}</div>
        )}
      </div>
    </div>
  );
}

/* ─── PAGE NODES ─── */
function FunnelPageNode({ id, data, selected }: NodeProps) {
  const nodeData = data as FunnelNodeData;
  const theme = useCanvasTheme();
  const cfg = NODE_CONFIGS[nodeData.nodeType] ?? NODE_CONFIGS.externalLink;
  const mockupFn = MOCKUPS[nodeData.nodeType];

  const accentColor = nodeData.accentColor as string | undefined;
  const containerCls = theme === "light"
    ? `relative rounded-xl border-2 shadow-md transition-all duration-150 overflow-hidden bg-white ${accentColor ? "" : cfg.lightBorder} ${selected ? "ring-2 ring-indigo-400 ring-offset-1" : ""}`
    : `relative rounded-xl border-2 shadow-xl transition-all duration-150 overflow-hidden ${cfg.bg} ${accentColor ? "" : cfg.border} ${selected ? "ring-2 ring-white/50 ring-offset-1 ring-offset-transparent" : ""}`;

  return (
    <div className={`${containerCls} group`} style={{ width: 148, ...(accentColor ? { borderColor: accentColor } : {}) }} data-testid={`funnel-node-${nodeData.nodeType}`}>
      <Handles />
      <DuplicateButton id={id} />
      <DeleteButton id={id} />
      <div className="overflow-hidden" style={{ height: nodeData.nodeType === "upsell" ? 110 : 96 }}>
        {nodeData.pagePreviewUrl ? (
          <img
            src={nodeData.pagePreviewUrl}
            alt="Page preview"
            className="w-full h-full object-cover object-top"
            style={{ display: "block" }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : mockupFn ? mockupFn(accentColor ?? cfg.hexColor) : (
          <div className={`flex items-center justify-center h-full ${theme === "light" ? "bg-gray-50" : "bg-black/35"}`}>
            {accentColor
              ? <cfg.icon className="h-10 w-10 opacity-60" style={{ color: accentColor }} />
              : <cfg.icon className={`h-10 w-10 ${theme === "light" ? cfg.lightColor : cfg.color} opacity-60`} />
            }
          </div>
        )}
      </div>
      <NodeLabel typeLabel={cfg.label} customLabel={nodeData.label} typeColor={cfg.color} lightTypeColor={cfg.lightColor} description={nodeData.description} accentHex={accentColor} />
    </div>
  );
}

/* ─── DELAY NODE ─── */
function DelayNode({ id, data, selected }: NodeProps) {
  const nodeData = data as FunnelNodeData;
  const amount = (nodeData.delayAmount as number | undefined) ?? 1;
  const unit = (nodeData.delayUnit as string | undefined) ?? "days";
  const direction = nodeData.delayDirection as "before" | "after" | undefined;
  const reference = (nodeData.delayReference as string | undefined)?.trim();
  const accentColor = nodeData.accentColor as string | undefined;
  const c = accentColor ?? "#F59E0B";

  const unitLabel = (() => {
    const n = Number(amount);
    const base = unit.replace(/s$/, "");
    return n === 1 ? base : `${base}s`;
  })();

  const mainLine = direction
    ? `${amount} ${unitLabel} ${direction}${reference ? ` ${reference}` : ""}`
    : `Wait ${amount} ${unitLabel}`;

  return (
    <div className="relative group" style={{ display: "inline-flex" }}>
      <DuplicateButton id={id} positionCls="absolute left-0 -top-[26px] z-20" />
      <DeleteButton    id={id} positionCls="absolute right-0 -top-[26px] z-20" />
      <div
        className={`relative flex items-center gap-2 px-2 py-1.5 border-2 border-dashed rounded-2xl shadow-lg transition-all select-none`}
        style={{
          background: `rgba(0,0,0,0.65)`,
          borderColor: c,
          minWidth: 75,
          maxWidth: 112,
          ...(selected ? { boxShadow: `0 0 0 3px ${c}50, 0 4px 20px rgba(0,0,0,0.5)` } : { boxShadow: "0 2px 12px rgba(0,0,0,0.4)" }),
        }}
        data-testid="funnel-node-delay"
      >
        <Handles />
        <div
          className="flex items-center justify-center w-5 h-5 rounded-full shrink-0"
          style={{ background: `${c}22`, border: `1.5px solid ${c}55` }}
        >
          <Timer className="h-2.5 w-2.5" style={{ color: c }} />
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-[7px] font-bold uppercase tracking-widest" style={{ color: `${c}99` }}>Delay</span>
          <span className="text-[9px] font-semibold leading-snug break-words" style={{ color: c }}>
            {mainLine}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── NOTE NODE ─── */
function NoteNode({ id, data, selected }: NodeProps) {
  const nodeData = data as FunnelNodeData;
  const { setNodes } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const accent = (nodeData.accentColor as string | undefined) ?? "#FDE047";
  const editorRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<{ x: number; y: number } | null>(null);
  const [editMode, setEditMode] = useState(false);

  const updateData = useCallback(
    (updates: Partial<FunnelNodeData>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...updates } } : n))
      );
    },
    [id, setNodes]
  );

  // When entering edit mode: set innerHTML and focus
  useEffect(() => {
    if (editMode && editorRef.current) {
      editorRef.current.innerHTML = nodeData.notes ?? "";
      editorRef.current.focus();
      // Place cursor at end
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode]);

  const exitEditMode = () => {
    setPopup(null);
    setEditMode(false);
  };

  const fmt = (cmd: string, value?: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;

    if (cmd === "fontSize" && value) {
      const sizeMap: Record<string, string> = { "2": "10px", "3": "13px", "4": "16px", "5": "20px" };
      const span = document.createElement("span");
      span.style.fontSize = sizeMap[value] ?? value;
      try { range.surroundContents(span); } catch { const f = range.extractContents(); span.appendChild(f); range.insertNode(span); }
    } else {
      const tagMap: Record<string, string> = { bold: "strong", italic: "em", underline: "u" };
      const tag = tagMap[cmd];
      if (!tag) return;
      const existing = sel.anchorNode?.parentElement?.closest(tag as keyof HTMLElementTagNameMap);
      if (existing && el.contains(existing)) {
        const parent = existing.parentNode;
        if (parent) { while (existing.firstChild) parent.insertBefore(existing.firstChild, existing); parent.removeChild(existing); }
      } else {
        const wrapper = document.createElement(tag);
        try { range.surroundContents(wrapper); } catch { const f = range.extractContents(); wrapper.appendChild(f); range.insertNode(wrapper); }
      }
    }
    updateData({ notes: el.innerHTML });
  };

  const checkSelection = () => {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.toString().length === 0 || !editorRef.current?.contains(sel.anchorNode)) {
        setPopup(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const selRect = range.getBoundingClientRect();
      const wrapRect = wrapperRef.current?.getBoundingClientRect();
      if (!wrapRect) return;
      setPopup({
        x: (selRect.left - wrapRect.left + selRect.width / 2) / zoom,
        y: (selRect.top - wrapRect.top) / zoom,
      });
    }, 10);
  };

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={150}
        minHeight={90}
        lineStyle={{ border: `1.5px solid ${accent}99` }}
        handleStyle={{ background: accent, border: `1px solid ${accent}cc`, width: 9, height: 9, borderRadius: 3 }}
      />
      {/* Outer wrapper — overflow visible so floating popup can escape the note box */}
      <div ref={wrapperRef} style={{ position: "relative", width: "100%", height: "100%" }}>
        {/* Note box */}
        <div
          className="absolute inset-0 flex flex-col border-2 shadow-lg rounded-md overflow-hidden group"
          style={{
            backgroundColor: accent + "e8",
            borderColor: accent,
            ...(editMode ? { outline: `2px solid ${accent}99`, outlineOffset: "2px" } : selected ? { outline: `2px solid ${accent}55`, outlineOffset: "2px" } : {}),
          }}
          data-testid="funnel-node-note"
        >
          <DuplicateButton id={id} />
          <DeleteButton id={id} />

          {/* Header strip — slightly darker than body via black overlay */}
          <div
            className="flex items-center gap-1.5 px-3 pt-2 pb-1 border-b shrink-0"
            style={{ background: `linear-gradient(rgba(0,0,0,0.18), rgba(0,0,0,0.18)), ${accent}`, borderBottomColor: `${accent}99` }}
          >
            <StickyNote className="h-3 w-3 shrink-0" style={{ color: "rgba(0,0,0,0.45)" }} />
            <input
              value={nodeData.label ?? "Note"}
              onChange={(e) => updateData({ label: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-transparent text-[10px] font-bold uppercase tracking-widest outline-none border-none truncate"
              style={{ color: "rgba(0,0,0,0.6)", caretColor: "rgba(0,0,0,0.6)" }}
              placeholder="Title…"
            />
          </div>

          {/* Body: view mode (read-only) vs edit mode (contentEditable) */}
          {!editMode ? (
            /* VIEW MODE — double-click to start editing */
            <div
              className="flex-1 min-h-0 w-full px-3 py-2 text-[11px] leading-snug overflow-y-auto cursor-text"
              style={{ color: "#1a1a1a" }}
              onDoubleClick={(e) => { e.stopPropagation(); setEditMode(true); }}
              dangerouslySetInnerHTML={{
                __html: nodeData.notes
                  ? nodeData.notes
                  : '<span style="color:rgba(0,0,0,0.3);font-style:italic">Double-click to write your note…</span>',
              }}
            />
          ) : (
            /* EDIT MODE — full contentEditable, ReactFlow bypassed */
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              tabIndex={0}
              onInput={() => { if (editorRef.current) updateData({ notes: editorRef.current.innerHTML }); }}
              onPointerDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
              onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
              onPointerMove={(e) => { e.stopPropagation(); }}
              onClick={(e) => e.stopPropagation()}
              onMouseUp={checkSelection}
              onKeyUp={checkSelection}
              onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); exitEditMode(); } }}
              onBlur={() => { setTimeout(() => { if (!wrapperRef.current?.contains(document.activeElement)) exitEditMode(); }, 150); }}
              className="nopan nodrag flex-1 min-h-0 w-full px-3 py-2 text-[11px] leading-snug outline-none overflow-y-auto"
              style={{ color: "#1a1a1a", caretColor: "#1a1a1a", userSelect: "text" }}
            />
          )}
        </div>

        {/* Floating format popup — appears above selected text */}
        {popup && (
          <div
            style={{
              position: "absolute",
              left: popup.x,
              top: popup.y,
              transform: "translate(-50%, calc(-100% - 6px))",
              zIndex: 1000,
              pointerEvents: "all",
            }}
          >
            <div
              className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg shadow-2xl border"
              style={{ backgroundColor: accent, borderColor: "rgba(0,0,0,0.15)" }}
            >
              {/* B / I / U */}
              {[
                { label: "B", cmd: "bold",      cls: "font-bold" },
                { label: "I", cmd: "italic",    cls: "italic"    },
                { label: "U", cmd: "underline", cls: "underline" },
              ].map(({ label, cmd, cls }) => (
                <button
                  key={cmd}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    fmt(cmd);
                    checkSelection();
                  }}
                  className={`w-6 h-6 text-[11px] rounded flex items-center justify-center hover:bg-black/15 transition-colors ${cls}`}
                  style={{ color: "rgba(0,0,0,0.7)" }}
                  data-testid={`button-note-${cmd}`}
                >
                  {label}
                </button>
              ))}

              {/* Divider */}
              <div className="w-px h-3.5 mx-0.5" style={{ backgroundColor: "rgba(0,0,0,0.2)" }} />

              {/* Font size: A buttons, visually growing */}
              {([
                { label: "S", val: "2", size: 8  },
                { label: "M", val: "3", size: 10 },
                { label: "L", val: "4", size: 13 },
                { label: "XL", val: "5", size: 16 },
              ]).map(({ label, val, size }) => (
                <button
                  key={label}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    fmt("fontSize", val);
                    checkSelection();
                  }}
                  className="w-6 h-6 rounded flex items-center justify-center hover:bg-black/15 transition-colors font-semibold"
                  style={{ color: "rgba(0,0,0,0.65)", fontSize: size }}
                  title={`Size ${label}`}
                  data-testid={`button-note-size-${label.toLowerCase()}`}
                >
                  A
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export const nodeTypes: Record<string, React.ComponentType<NodeProps>> = {
  trafficSource: TrafficSourceNode,
  capturePage:   FunnelPageNode,
  thankYouPage:  FunnelPageNode,
  emailNode:     EmailNode,
  salesPage:     FunnelPageNode,
  videoPage:     FunnelPageNode,
  webinar:       FunnelPageNode,
  zoom:          FunnelPageNode,
  orderForm:     FunnelPageNode,
  upsell:        FunnelPageNode,
  downsell:      FunnelPageNode,
  externalLink:  FunnelPageNode,
  delay:         DelayNode,
  note:          NoteNode,
  smsNode:       SmsNode,
};
