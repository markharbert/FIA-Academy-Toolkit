import { projectTools } from "./tools";
import { MCP_SCOPES, mcpOrigin, productionOrigin } from "./oauth";

// Paths are documentation of mounted HTTP handlers, not individual REST tool
// endpoints. Tool names and argument names come from the live tool registry.
export const mcpEndpointReference = [
  { method: "POST", path: "/mcp/agent", category: "MCP transport", access: "OAuth bearer credential", description: "The single Streamable HTTP connection URL. Carries initialize, notifications, tools/list, and tools/call JSON-RPC messages. All project tools use this endpoint." },
  { method: "OPTIONS", path: "/mcp/agent", category: "MCP transport", access: "Public", description: "Browser CORS preflight. GET and DELETE on the MCP endpoint return 405 because this server uses stateless POST requests." },
  { method: "GET", path: "/.well-known/oauth-authorization-server", category: "OAuth discovery", access: "Public", description: "OAuth issuer metadata: authorization, token, client registration, revocation, scopes, and PKCE support." },
  { method: "GET", path: "/.well-known/oauth-protected-resource/mcp/agent", category: "OAuth discovery", access: "Public", description: "Resource-specific OAuth discovery, advertised in the 401 WWW-Authenticate response." },
  { method: "GET", path: "/.well-known/oauth-protected-resource", category: "OAuth discovery", access: "Public", description: "Root discovery fallback for clients that do not request the resource-specific metadata path." },
  { method: "GET / POST", path: "/api/mcp/oauth/authorize", category: "OAuth flow", access: "Registered OAuth client; website login for consent", description: "Starts authorization with a registered callback, S256 PKCE challenge, resource URL, and requested project scopes. Redirects to the Academy consent screen." },
  { method: "POST", path: "/api/mcp/oauth/register", category: "OAuth flow", access: "Public, rate-limited", description: "Dynamic Client Registration (DCR). AI clients register their own callback URLs automatically; members do not copy an API key or create a manual client secret." },
  { method: "POST", path: "/api/mcp/oauth/token", category: "OAuth flow", access: "OAuth client validation and code/refresh credential", description: "Redeems a single-use authorization code with its PKCE verifier, or rotates a refresh credential. Uses form-encoded OAuth requests." },
  { method: "POST", path: "/api/mcp/oauth/revoke", category: "OAuth flow", access: "OAuth client validation", description: "Revokes the connection associated with the submitted credential. The AI client manages this endpoint, not a browser bookmark." },
  { method: "GET", path: "/api/mcp/config", category: "Website management", access: "Signed-in member", description: "Current and published connection URLs, supported scopes, capabilities, and initialization readiness." },
  { method: "GET", path: "/api/mcp/consent/:requestId", category: "Website management", access: "Signed-in eligible member", description: "Reads a pending consent request and issues a session-bound consent nonce. Requests expire after ten minutes." },
  { method: "POST", path: "/api/mcp/consent/:requestId", category: "Website management", access: "Member session, same origin, consent nonce", description: "Approves read-only or requested editing access, or denies the request; returns the registered client callback destination." },
  { method: "GET", path: "/api/mcp/connections", category: "Website management", access: "Signed-in member", description: "Lists the member's assistant connections and destructive-action approval queue." },
  { method: "DELETE", path: "/api/mcp/connections/:id", category: "Website management", access: "Owning member session, same origin", description: "Disconnects an assistant and prevents future credential use or renewal for that connection." },
  { method: "POST", path: "/api/mcp/approvals/:id", category: "Retired endpoint", access: "Signed-in member; always returns 410", description: "Retired website approval endpoint. Never executes or cancels a deletion. All action confirmations happen inside the AI client through confirm_deletion or cancel_deletion." },
  { method: "GET", path: "/api/admin/mcp/reference", category: "Admin reference", access: "Signed-in, enabled administrator", description: "Returns this endpoint reference and the current tool registry for the admin-only MCP server guide." },
];

export function buildMcpReference(origin = mcpOrigin()) {
  return {
    endpoint: `${origin}/mcp/agent`,
    productionEndpoint: `${productionOrigin()}/mcp/agent`,
    scopes: MCP_SCOPES,
    transport: "Streamable HTTP (stateless POST)",
    auth: "OAuth with S256 PKCE and Dynamic Client Registration",
    endpoints: mcpEndpointReference,
    tools: Object.entries(projectTools).map(([name, tool]) => ({
      name, description: tool.description, write: !!tool.write, destructive: !!tool.destructive,
      parameters: Object.entries(tool.schema.shape).map(([key, schema]: [string, any]) => ({
        name: key, required: !schema.isOptional(), description: schema.description || "",
      })),
    })),
  };
}
