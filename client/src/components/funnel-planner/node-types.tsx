import { Handle, Position, type NodeProps, useReactFlow } from "@xyflow/react";
import { useCallback } from "react";
import { Mail, MessageSquare, Search, Mic, StickyNote, Globe, X } from "lucide-react";
import {
  SiFacebook, SiInstagram, SiYoutube, SiTiktok, SiGoogle,
  SiPinterest, SiLinkedin, SiX, SiSnapchat, SiReddit,
  SiThreads, SiSpotify,
} from "react-icons/si";

export type FunnelNodeType =
  | "trafficSource"
  | "capturePage"
  | "thankYouPage"
  | "emailSequence"
  | "emailNode"
  | "salesPage"
  | "videoPage"
  | "webinar"
  | "orderForm"
  | "upsell"
  | "downsell"
  | "externalLink"
  | "note";

export interface FunnelNodeData {
  label: string;
  nodeType: FunnelNodeType;
  description?: string;
  notes?: string;
  estimatedTraffic?: number;
  conversionRate?: number;
  trafficPlatform?: string;
  trafficPlatforms?: string[];
  pageUrl?: string;
  pagePreviewUrl?: string;
  emailSubject?: string;
  emailBody?: string;
  emailDay?: number;
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
  hexColor: string;
  bg: string;
  border: string;
  icon: React.ElementType;
  description: string;
}> = {
  trafficSource: { label: "Traffic Source", color: "text-sky-300",     hexColor: "#38BDF8", bg: "bg-sky-950/80",     border: "border-sky-500/60",     icon: Globe,      description: "Ads, social, email, SEO" },
  capturePage:   { label: "Capture Page",   color: "text-violet-300",  hexColor: "#A78BFA", bg: "bg-violet-950/80", border: "border-violet-500/60", icon: StickyNote, description: "Opt-in / lead capture" },
  thankYouPage:  { label: "Thank-You Page", color: "text-emerald-300", hexColor: "#34D399", bg: "bg-emerald-950/80",border: "border-emerald-500/60",icon: StickyNote, description: "Confirmation after opt-in" },
  emailSequence: { label: "Email Sequence", color: "text-teal-300",    hexColor: "#2DD4BF", bg: "bg-teal-950/80",   border: "border-teal-500/60",   icon: Mail,       description: "Follow-up email series (group)" },
  emailNode:     { label: "Email",          color: "text-cyan-300",    hexColor: "#22D3EE", bg: "bg-cyan-950/80",   border: "border-cyan-500/60",   icon: Mail,       description: "Single email — write it right here" },
  salesPage:     { label: "Sales Page",     color: "text-amber-300",   hexColor: "#FCD34D", bg: "bg-amber-950/80",  border: "border-amber-500/60",  icon: StickyNote, description: "Long-form sales letter" },
  videoPage:     { label: "Video Page",     color: "text-rose-300",    hexColor: "#FB7185", bg: "bg-rose-950/80",   border: "border-rose-500/60",   icon: StickyNote, description: "Video sales letter (VSL)" },
  webinar:       { label: "Webinar",        color: "text-indigo-300",  hexColor: "#818CF8", bg: "bg-indigo-950/80", border: "border-indigo-500/60", icon: StickyNote, description: "Live or automated webinar" },
  orderForm:     { label: "Order Form",     color: "text-orange-300",  hexColor: "#FB923C", bg: "bg-orange-950/80", border: "border-orange-500/60", icon: StickyNote, description: "Checkout / payment page" },
  upsell:        { label: "Upsell",         color: "text-green-300",   hexColor: "#4ADE80", bg: "bg-green-950/80",  border: "border-green-500/60",  icon: StickyNote, description: "One-click upsell offer" },
  downsell:      { label: "Downsell",       color: "text-pink-300",    hexColor: "#F472B6", bg: "bg-pink-950/80",   border: "border-pink-500/60",   icon: StickyNote, description: "Fallback offer for declines" },
  externalLink:  { label: "External Link",  color: "text-slate-300",   hexColor: "#94A3B8", bg: "bg-slate-800/80",  border: "border-slate-500/60",  icon: StickyNote, description: "Link to external resource" },
  note:          { label: "Note",           color: "text-yellow-300",  hexColor: "#FDE047", bg: "bg-yellow-950/60", border: "border-yellow-500/50", icon: StickyNote, description: "Sticky note / annotation" },
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

function EmailSequenceSVG({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 148 96" width="148" height="96">
      <Frame c={c}>
        <rect x="12" y="20" width="124" height="46" rx="4" fill="rgba(0,0,0,0.45)" stroke={c} strokeWidth="1.8" strokeOpacity="0.75" />
        <path d="M12,22 L74,52 L136,22" stroke={c} strokeWidth="2.2" fill="none" strokeOpacity="0.9" />
        <circle cx="24" cy="78" r="6.5" fill={c} opacity="0.9" />
        <text x="24" y="81" textAnchor="middle" fontSize="7" fill="black" fontWeight="bold">1</text>
        <line x1="31" y1="78" x2="47" y2="78" stroke={c} strokeWidth="1.5" strokeOpacity="0.5" />
        <circle cx="54" cy="78" r="6.5" fill={c} opacity="0.72" />
        <text x="54" y="81" textAnchor="middle" fontSize="7" fill="black" fontWeight="bold">2</text>
        <line x1="61" y1="78" x2="77" y2="78" stroke={c} strokeWidth="1.5" strokeOpacity="0.4" />
        <circle cx="84" cy="78" r="6.5" fill={c} opacity="0.54" />
        <text x="84" y="81" textAnchor="middle" fontSize="7" fill="black" fontWeight="bold">3</text>
        <line x1="91" y1="78" x2="107" y2="78" stroke={c} strokeWidth="1.5" strokeOpacity="0.3" />
        <circle cx="114" cy="78" r="6.5" fill={c} opacity="0.36" />
        <text x="114" y="81" textAnchor="middle" fontSize="7" fill="rgba(0,0,0,0.7)" fontWeight="bold">4</text>
      </Frame>
    </svg>
  );
}

/* EMAIL NODE SVG — large bold white envelope with dark outline */
function EmailNodeSVG({ c }: { c: string }) {
  return (
    <svg viewBox="0 0 148 96" width="148" height="96">
      {/* Dark background */}
      <rect x="0" y="0" width="148" height="96" fill="rgba(0,0,0,0.5)" />
      {/* Envelope body — white fill, dark outline */}
      <rect x="10" y="14" width="128" height="70" rx="6" fill="white" fillOpacity="0.92" stroke="rgba(0,0,0,0.6)" strokeWidth="2" />
      {/* Envelope flap — V shape pointing down, drawn in dark so it reads on white */}
      <path d="M10,14 L74,56 L138,14" stroke="rgba(0,0,0,0.55)" strokeWidth="2.5" fill="none" strokeLinejoin="round" />
      {/* Bottom corner fold creases */}
      <line x1="10" y1="84" x2="52" y2="52" stroke="rgba(0,0,0,0.22)" strokeWidth="1.5" />
      <line x1="138" y1="84" x2="96" y2="52" stroke="rgba(0,0,0,0.22)" strokeWidth="1.5" />
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
  emailSequence: (c) => <EmailSequenceSVG c={c} />,
  emailNode:     (c) => <EmailNodeSVG c={c} />,
  externalLink:  (c) => <ExternalLinkSVG c={c} />,
  trafficSource: (_c) => null,
  note:          (_c) => null,
};

const HANDLES = (
  <>
    <Handle id="top"    type="source" position={Position.Top}    className="!w-2.5 !h-2.5 !border-2 !border-white/30 !bg-slate-900" />
    <Handle id="bottom" type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !border-2 !border-white/30 !bg-slate-900" />
    <Handle id="left"   type="source" position={Position.Left}   className="!w-2.5 !h-2.5 !border-2 !border-white/30 !bg-slate-900" />
    <Handle id="right"  type="source" position={Position.Right}  className="!w-2.5 !h-2.5 !border-2 !border-white/30 !bg-slate-900" />
  </>
);

function DeleteButton({ id }: { id: string }) {
  const { deleteElements } = useReactFlow();
  return (
    <button
      className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full flex items-center justify-center bg-black/50 border border-white/15 text-white/40 hover:bg-red-500/80 hover:text-white hover:border-red-400/60 transition-colors cursor-pointer"
      title="Delete node"
      data-testid={`button-delete-node-${id}`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); deleteElements({ nodes: [{ id }] }); }}
    >
      <X className="w-2.5 h-2.5" />
    </button>
  );
}

function NodeLabel({ typeLabel, customLabel, typeColor, description }: {
  typeLabel: string; customLabel: string; typeColor: string; description?: string;
}) {
  return (
    <div className="px-2.5 py-2 border-t border-white/[0.08]">
      <div className={`text-[9px] font-bold uppercase tracking-widest mb-0.5 ${typeColor}`}>{typeLabel}</div>
      <div className="text-white text-xs font-semibold leading-tight truncate">{customLabel}</div>
      {description && (
        <div className="text-white/40 text-[10px] mt-0.5 leading-tight line-clamp-1">{description}</div>
      )}
    </div>
  );
}

/* ─── TRAFFIC SOURCE NODE — platform picker ─── */
function TrafficSourceNode({ id, data, selected }: NodeProps) {
  const nodeData = data as FunnelNodeData;
  const { setNodes } = useReactFlow();

  // Support both legacy single-string and new multi-platform array
  const platforms: string[] = (nodeData.trafficPlatforms as string[] | undefined) ||
    (nodeData.trafficPlatform ? [nodeData.trafficPlatform as string] : []);

  const togglePlatform = useCallback((p: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    const idx = platforms.indexOf(p);
    let next: string[];
    if (idx >= 0) {
      next = platforms.filter(x => x !== p);
    } else if (platforms.length < 4) {
      next = [...platforms, p];
    } else {
      return;
    }
    setNodes(nds => nds.map(n =>
      n.id === id ? { ...n, data: { ...n.data, trafficPlatforms: next, trafficPlatform: next[0] || undefined } } : n
    ));
  }, [id, setNodes, platforms]);

  const ALL_PLATFORMS = Object.entries(TRAFFIC_PLATFORMS);

  function renderIcons() {
    const count = platforms.length;
    if (count === 1) {
      const cfg = TRAFFIC_PLATFORMS[platforms[0]];
      return cfg ? (
        <div className="flex items-center justify-center bg-black/35 py-1">
          <cfg.Icon style={{ color: cfg.color, width: 108, height: 108 }} />
        </div>
      ) : null;
    }
    if (count === 2) {
      return (
        <div className="grid grid-cols-2 gap-2 bg-black/35 px-3 py-3 items-center justify-items-center">
          {platforms.map(p => { const cfg = TRAFFIC_PLATFORMS[p]; return cfg ? <cfg.Icon key={p} style={{ color: cfg.color, width: 56, height: 56 }} /> : null; })}
        </div>
      );
    }
    if (count === 3) {
      return (
        <div className="grid grid-cols-3 gap-1 bg-black/35 px-2 py-3 items-center justify-items-center">
          {platforms.map(p => { const cfg = TRAFFIC_PLATFORMS[p]; return cfg ? <cfg.Icon key={p} style={{ color: cfg.color, width: 40, height: 40 }} /> : null; })}
        </div>
      );
    }
    if (count === 4) {
      return (
        <div className="grid grid-cols-2 gap-2 bg-black/35 px-3 py-3 items-center justify-items-center">
          {platforms.map(p => { const cfg = TRAFFIC_PLATFORMS[p]; return cfg ? <cfg.Icon key={p} style={{ color: cfg.color, width: 52, height: 52 }} /> : null; })}
        </div>
      );
    }
    return null;
  }

  return (
    <div
      className={`relative rounded-xl border-2 shadow-xl transition-all duration-150 overflow-hidden bg-sky-950/80 border-sky-500/60 ${selected ? "ring-2 ring-white/50 ring-offset-1 ring-offset-transparent" : ""}`}
      style={{ width: 148 }}
      data-testid="funnel-node-trafficSource"
    >
      {HANDLES}
      <DeleteButton id={id} />
      {platforms.length > 0 ? renderIcons() : (
        <div className="p-2 bg-black/35">
          <div className="text-[9px] text-sky-300/75 font-bold uppercase tracking-widest mb-2 text-center">Choose Traffic Source</div>
          <div className="grid grid-cols-4 gap-1">
            {ALL_PLATFORMS.slice(0, 8).map(([p, pc]) => (
              <button key={p} title={pc.label} onClick={togglePlatform(p)}
                className="flex flex-col items-center gap-0.5 rounded-md p-1 hover:bg-white/10 transition-colors">
                <pc.Icon style={{ color: pc.color, width: 17, height: 17 }} />
                <span className="text-[7px] text-white/40 leading-none truncate w-full text-center">{pc.label.split(" ")[0]}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1 mt-0.5">
            {ALL_PLATFORMS.slice(8).map(([p, pc]) => (
              <button key={p} title={pc.label} onClick={togglePlatform(p)}
                className="flex flex-col items-center gap-0.5 rounded-md p-1 hover:bg-white/10 transition-colors">
                <pc.Icon style={{ color: pc.color, width: 17, height: 17 }} />
                <span className="text-[7px] text-white/40 leading-none truncate w-full text-center">{pc.label.split(" ")[0]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <NodeLabel typeLabel="Traffic Source" customLabel={nodeData.label} typeColor="text-sky-300" description={nodeData.description} />
    </div>
  );
}

/* ─── EMAIL NODE — individual email with subject + body ─── */
function EmailNode({ id, data, selected }: NodeProps) {
  const nodeData = data as FunnelNodeData;
  const cfg = NODE_CONFIGS.emailNode;
  const subject = nodeData.emailSubject as string | undefined;
  const day = nodeData.emailDay as number | undefined;
  const body = nodeData.emailBody as string | undefined;

  return (
    <div
      className={`relative rounded-xl border-2 shadow-xl transition-all duration-150 overflow-hidden ${cfg.bg} ${cfg.border} ${selected ? "ring-2 ring-white/50 ring-offset-1 ring-offset-transparent" : ""}`}
      style={{ width: 148 }}
      data-testid="funnel-node-emailNode"
    >
      {HANDLES}
      <DeleteButton id={id} />
      <div className="overflow-hidden" style={{ height: 96 }}>
        <EmailNodeSVG c={cfg.hexColor} />
      </div>
      <div className="px-2.5 py-2 border-t border-white/[0.08]">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`text-[9px] font-bold uppercase tracking-widest ${cfg.color}`}>Email</span>
          {day !== undefined && (
            <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-white/10 ${cfg.color}`}>Day {day}</span>
          )}
        </div>
        <div className="text-white text-xs font-semibold leading-tight truncate">
          {subject || nodeData.label || "Untitled Email"}
        </div>
        {body ? (
          <div className="text-white/40 text-[10px] mt-0.5 leading-tight line-clamp-1">{body}</div>
        ) : (
          <div className="text-white/20 text-[10px] mt-0.5 italic">Double-click to write email</div>
        )}
      </div>
    </div>
  );
}

/* ─── PAGE NODES — graphical SVG mockup ─── */
function FunnelPageNode({ id, data, selected }: NodeProps) {
  const nodeData = data as FunnelNodeData;
  const cfg = NODE_CONFIGS[nodeData.nodeType] ?? NODE_CONFIGS.externalLink;
  const mockupFn = MOCKUPS[nodeData.nodeType];

  return (
    <div
      className={`relative rounded-xl border-2 shadow-xl transition-all duration-150 overflow-hidden ${cfg.bg} ${cfg.border} ${selected ? "ring-2 ring-white/50 ring-offset-1 ring-offset-transparent" : ""}`}
      style={{ width: 148 }}
      data-testid={`funnel-node-${nodeData.nodeType}`}
    >
      {HANDLES}
      <DeleteButton id={id} />
      <div className="overflow-hidden" style={{ height: 96 }}>
        {nodeData.pagePreviewUrl ? (
          <img
            src={nodeData.pagePreviewUrl}
            alt="Page preview"
            className="w-full h-full object-cover object-top"
            style={{ display: "block" }}
          />
        ) : mockupFn ? mockupFn(cfg.hexColor) : (
          <div className="flex items-center justify-center bg-black/35 h-full">
            <cfg.icon className={`h-10 w-10 ${cfg.color} opacity-60`} />
          </div>
        )}
      </div>
      <NodeLabel typeLabel={cfg.label} customLabel={nodeData.label} typeColor={cfg.color} description={nodeData.description} />
    </div>
  );
}

/* ─── NOTE NODE ─── */
function NoteNode({ id, data, selected }: NodeProps) {
  const nodeData = data as FunnelNodeData;
  return (
    <div
      className={`relative border-2 shadow-lg bg-yellow-400/90 border-yellow-300 rounded-md ${selected ? "ring-2 ring-white/50" : ""}`}
      style={{ width: 148, minHeight: 70 }}
      data-testid="funnel-node-note"
    >
      <DeleteButton id={id} />
      <div className="px-3 py-2.5">
        <div className="text-[9px] font-bold uppercase tracking-widest text-yellow-900/70 mb-1">Note</div>
        <div className="text-yellow-950 text-xs font-semibold leading-tight">{nodeData.label}</div>
        {nodeData.notes && (
          <div className="text-yellow-900/70 text-[10px] mt-1 leading-snug">{nodeData.notes}</div>
        )}
      </div>
    </div>
  );
}

export const nodeTypes: Record<string, React.ComponentType<NodeProps>> = {
  trafficSource: TrafficSourceNode,
  capturePage:   FunnelPageNode,
  thankYouPage:  FunnelPageNode,
  emailSequence: FunnelPageNode,
  emailNode:     EmailNode,
  salesPage:     FunnelPageNode,
  videoPage:     FunnelPageNode,
  webinar:       FunnelPageNode,
  orderForm:     FunnelPageNode,
  upsell:        FunnelPageNode,
  downsell:      FunnelPageNode,
  externalLink:  FunnelPageNode,
  note:          NoteNode,
};
