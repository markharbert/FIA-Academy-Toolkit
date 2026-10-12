import { pgTable, varchar, text, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./schema";

const at = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const member = (name: string) => varchar(name).notNull().references(() => users.id, { onDelete: "cascade" });

export const projectMcpClients = pgTable("project_mcp_clients", {
  id: text("id").primaryKey(),
  encryptedData: text("encrypted_data").notNull(),
  createdAt: at("created_at"),
});

export const projectMcpRequests = pgTable("project_mcp_requests", {
  id: varchar("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => projectMcpClients.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
  expiresAt: at("expires_at"),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: at("created_at"),
});

export const projectMcpGrants = pgTable("project_mcp_grants", {
  id: varchar("id").primaryKey(),
  userId: member("user_id"),
  workspaceId: member("workspace_id"),
  clientId: text("client_id").notNull().references(() => projectMcpClients.id, { onDelete: "cascade" }),
  scopes: text("scopes").array().notNull(),
  resource: text("resource").notNull(),
  createdAt: at("created_at"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [index("project_mcp_grants_member_idx").on(t.userId)]);

export const projectMcpCodes = pgTable("project_mcp_codes", {
  hash: text("hash").primaryKey(),
  grantId: varchar("grant_id").notNull().references(() => projectMcpGrants.id, { onDelete: "cascade" }),
  clientId: text("client_id").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  challenge: text("challenge").notNull(),
  expiresAt: at("expires_at"),
});

export const projectMcpTokens = pgTable("project_mcp_tokens", {
  hash: text("hash").primaryKey(),
  grantId: varchar("grant_id").notNull().references(() => projectMcpGrants.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  expiresAt: at("expires_at"),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
}, (t) => [index("project_mcp_tokens_grant_idx").on(t.grantId)]);

export const projectMcpApprovals = pgTable("project_mcp_approvals", {
  id: varchar("id").primaryKey(),
  grantId: varchar("grant_id").notNull().references(() => projectMcpGrants.id, { onDelete: "cascade" }),
  userId: member("user_id"),
  workspaceId: member("workspace_id"),
  toolName: text("tool_name").notNull(),
  args: jsonb("args").notNull(),
  summary: text("summary").notNull(),
  targetHash: text("target_hash").notNull(),
  status: text("status").notNull().default("pending"),
  result: jsonb("result"),
  error: text("error"),
  createdAt: at("created_at"),
  expiresAt: at("expires_at"),
}, (t) => [index("project_mcp_approvals_member_idx").on(t.userId)]);

export const projectMcpOperations = pgTable("project_mcp_operations", {
  id: varchar("id").primaryKey(),
  grantId: varchar("grant_id").notNull().references(() => projectMcpGrants.id, { onDelete: "cascade" }),
  requestId: varchar("request_id").notNull(),
  toolName: text("tool_name").notNull(),
  argsHash: text("args_hash").notNull(),
  status: text("status").notNull(),
  result: jsonb("result"),
  error: text("error"),
  createdAt: at("created_at"),
}, (t) => [uniqueIndex("project_mcp_operations_request_idx").on(t.grantId, t.requestId)]);
