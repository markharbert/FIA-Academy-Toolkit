import { z } from "zod";

// Shared with the editor so MCP cannot advertise a node the UI cannot render.
export const FUNNEL_NODE_TYPES = [
  "trafficSource", "capturePage", "thankYouPage", "emailNode", "salesPage",
  "videoPage", "webinar", "zoom", "orderForm", "upsell", "downsell",
  "externalLink", "delay", "note", "smsNode",
] as const;
export type FunnelNodeType = typeof FUNNEL_NODE_TYPES[number];
const text = z.string().max(20000);
const url = z.string().url().max(2000).refine((s) => /^https?:\/\//i.test(s), "Use an HTTP or HTTPS URL");
export const funnelNodeDataSchema = z.object({
  label: z.string().trim().min(1).max(200),
  nodeType: z.enum(FUNNEL_NODE_TYPES),
  description: text.optional(), notes: text.optional(),
  accentColor: z.string().regex(/^#[a-fA-F0-9]{6}$/).optional(),
  estimatedTraffic: z.number().finite().min(0).max(1e12).optional(),
  costPerClick: z.number().finite().min(0).max(1e9).optional(),
  conversionRate: z.number().finite().min(0).max(100).optional(),
  trafficPlatform: z.string().max(80).optional(),
  trafficPlatforms: z.array(z.string().max(80)).max(30).optional(),
  pageUrl: url.optional(), emailSubject: z.string().max(500).optional(),
  emailBody: text.optional(), emailDay: z.number().int().min(0).max(10000).optional(),
  smsBody: text.optional(), smsDay: z.number().int().min(0).max(10000).optional(),
  delayAmount: z.number().finite().min(0).max(10000).optional(),
  delayUnit: z.enum(["minutes", "hours", "days", "weeks"]).optional(),
  delayDirection: z.enum(["before", "after"]).optional(),
  delayReference: z.string().max(500).optional(),
}).strict();
const key = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
export const funnelNodeInput = z.object({
  id: key, type: z.enum(FUNNEL_NODE_TYPES),
  data: funnelNodeDataSchema.omit({ nodeType: true }),
  position: z.object({ x: z.number().finite().min(-1e6).max(1e6), y: z.number().finite().min(-1e6).max(1e6) }).strict().optional(),
  width: z.number().min(100).max(2000).optional(),
  height: z.number().min(80).max(2000).optional(),
}).strict();
export const funnelEdgeInput = z.object({
  id: key, source: key, target: key,
  label: z.string().max(200).optional(),
  sourceHandle: z.enum(["top", "right", "bottom", "left"]).optional(),
  targetHandle: z.enum(["top", "right", "bottom", "left"]).optional(),
}).strict();
export const funnelMapInput = z.object({
  nodes: z.array(funnelNodeInput).max(300), edges: z.array(funnelEdgeInput).max(1000),
}).strict().superRefine((map, ctx) => {
  const nodes = new Set(map.nodes.map((n) => n.id));
  if (nodes.size !== map.nodes.length) ctx.addIssue({ code: "custom", message: "Node IDs must be unique" });
  if (new Set(map.edges.map((e) => e.id)).size !== map.edges.length) ctx.addIssue({ code: "custom", message: "Connection IDs must be unique" });
  for (const edge of map.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) ctx.addIssue({ code: "custom", message: `Connection ${edge.id} refers to a missing node` });
    if (edge.source === edge.target) ctx.addIssue({ code: "custom", message: "A node cannot connect to itself" });
    if (map.nodes.some((n) => n.type === "note" && (n.id === edge.source || n.id === edge.target))) {
      ctx.addIssue({ code: "custom", message: "Notes are standalone annotations without connection handles" });
    }
  }
});
