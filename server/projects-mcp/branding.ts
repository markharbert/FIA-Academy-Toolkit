import type { Implementation } from "@modelcontextprotocol/sdk/types.js";

/** Same-origin, public branding shared by MCP initialization and OAuth discovery. */
export function mcpBranding(origin: string): Implementation {
  return {
    name: "fia-toolkit",
    title: "FIA Toolkit",
    version: "1.1.0",
    websiteUrl: new URL("/", origin).href,
    icons: [{
      src: new URL("/lion-logo.png", origin).href,
      mimeType: "image/png",
      sizes: ["540x540"],
    }],
  };
}
