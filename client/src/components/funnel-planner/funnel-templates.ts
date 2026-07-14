export interface TemplateCanvasData {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type?: string;
    data?: Record<string, unknown>;
    label?: string;
  }>;
}

export const FUNNEL_TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  canvas: TemplateCanvasData;
}> = [
  {
    id: "simple-lead-gen",
    name: "Simple Lead Gen",
    description: "Basic opt-in funnel to capture leads with a thank-you page and follow-up sequence.",
    canvas: {
      nodes: [
        { id: "n1", type: "trafficSource", position: { x: 280, y: 40 }, data: { label: "Facebook Ads", nodeType: "trafficSource", description: "Social media traffic" } },
        { id: "n2", type: "capturePage", position: { x: 280, y: 180 }, data: { label: "Free Guide Opt-In", nodeType: "capturePage", description: "Enter email for free guide", estimatedTraffic: 1000, conversionRate: 30 } },
        { id: "n3", type: "thankYouPage", position: { x: 280, y: 320 }, data: { label: "Thank You!", nodeType: "thankYouPage", description: "Check your email for the guide" } },
        { id: "n4", type: "emailNode", position: { x: 280, y: 460 }, data: { label: "5-Day Email Series", nodeType: "emailNode", description: "Nurture & build trust" } },
        { id: "n5", type: "salesPage", position: { x: 280, y: 600 }, data: { label: "Offer Sales Page", nodeType: "salesPage", description: "Premium product offer" } },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
        { id: "e3", source: "n3", target: "n4" },
        { id: "e4", source: "n4", target: "n5" },
      ],
    },
  },
  {
    id: "webinar-funnel",
    name: "Webinar Funnel",
    description: "Drive registrations to a live or automated webinar, then close on a sales page.",
    canvas: {
      nodes: [
        { id: "n1", type: "trafficSource", position: { x: 300, y: 40 }, data: { label: "Email List / Ads", nodeType: "trafficSource" } },
        { id: "n2", type: "capturePage", position: { x: 300, y: 180 }, data: { label: "Webinar Registration", nodeType: "capturePage", description: "Register for free training", estimatedTraffic: 500, conversionRate: 40 } },
        { id: "n3", type: "emailNode", position: { x: 300, y: 320 }, data: { label: "Pre-Webinar Reminders", nodeType: "emailNode", description: "3-email reminder sequence" } },
        { id: "n4", type: "webinar", position: { x: 300, y: 460 }, data: { label: "Live Training", nodeType: "webinar", description: "60-min value + pitch" } },
        { id: "n5", type: "salesPage", position: { x: 140, y: 600 }, data: { label: "Order Page (Yes)", nodeType: "orderForm", description: "Buyers go here" } },
        { id: "n6", type: "emailNode", position: { x: 460, y: 600 }, data: { label: "No-Show Follow-Up", nodeType: "emailNode", description: "Re-engagement emails" } },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
        { id: "e3", source: "n3", target: "n4" },
        { id: "e4", source: "n4", target: "n5", data: { pathType: "yes" } },
        { id: "e5", source: "n4", target: "n6", data: { pathType: "no" } },
      ],
    },
  },
  {
    id: "product-launch",
    name: "Product Launch Funnel",
    description: "Build anticipation with content, then open cart with upsell and downsell offers.",
    canvas: {
      nodes: [
        { id: "n1", type: "trafficSource", position: { x: 300, y: 40 }, data: { label: "Warm Audience", nodeType: "trafficSource" } },
        { id: "n2", type: "capturePage", position: { x: 300, y: 180 }, data: { label: "Launch Waitlist", nodeType: "capturePage", description: "Join early-bird list", estimatedTraffic: 2000, conversionRate: 50 } },
        { id: "n3", type: "videoPage", position: { x: 300, y: 320 }, data: { label: "Training Video #1", nodeType: "videoPage", description: "Pure value content" } },
        { id: "n4", type: "videoPage", position: { x: 300, y: 460 }, data: { label: "Training Video #2", nodeType: "videoPage", description: "Case studies" } },
        { id: "n5", type: "orderForm", position: { x: 300, y: 600 }, data: { label: "Cart Open!", nodeType: "orderForm", description: "48-hour cart", estimatedTraffic: 500, conversionRate: 8 } },
        { id: "n6", type: "upsell", position: { x: 120, y: 740 }, data: { label: "VIP Upgrade", nodeType: "upsell", description: "1-click upsell" } },
        { id: "n7", type: "downsell", position: { x: 480, y: 740 }, data: { label: "Payment Plan", nodeType: "downsell", description: "3-pay option" } },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
        { id: "e3", source: "n3", target: "n4" },
        { id: "e4", source: "n4", target: "n5" },
        { id: "e5", source: "n5", target: "n6", data: { pathType: "yes" } },
        { id: "e6", source: "n6", target: "n7", data: { pathType: "no" } },
      ],
    },
  },
  {
    id: "email-followup",
    name: "Email Follow-Up Sequence",
    description: "Simple automated email nurture path for new subscribers who aren't ready to buy yet.",
    canvas: {
      nodes: [
        { id: "n1", type: "capturePage", position: { x: 300, y: 40 }, data: { label: "New Subscriber", nodeType: "capturePage" } },
        { id: "n2", type: "emailNode", position: { x: 300, y: 180 }, data: { label: "Welcome Email", nodeType: "emailNode", description: "Introduce yourself & deliver lead magnet" } },
        { id: "n3", type: "emailNode", position: { x: 300, y: 320 }, data: { label: "Value Email #1", nodeType: "emailNode", description: "Share a quick win tip" } },
        { id: "n4", type: "emailNode", position: { x: 300, y: 460 }, data: { label: "Value Email #2", nodeType: "emailNode", description: "Story-based email" } },
        { id: "n5", type: "emailNode", position: { x: 300, y: 600 }, data: { label: "Soft Pitch Email", nodeType: "emailNode", description: "Introduce your offer" } },
        { id: "n6", type: "salesPage", position: { x: 180, y: 740 }, data: { label: "Sales Page", nodeType: "salesPage" } },
        { id: "n7", type: "emailNode", position: { x: 420, y: 740 }, data: { label: "Ongoing Nurture", nodeType: "emailNode", description: "Weekly value emails" } },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3" },
        { id: "e3", source: "n3", target: "n4" },
        { id: "e4", source: "n4", target: "n5" },
        { id: "e5", source: "n5", target: "n6", data: { pathType: "yes" } },
        { id: "e6", source: "n5", target: "n7", data: { pathType: "no" } },
      ],
    },
  },
];
