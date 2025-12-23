import { storage } from "./storage";
import crypto from "crypto";

const KEAP_AUTHORIZE_URL_BASE = process.env.KEAP_AUTHORIZE_URL_BASE || "https://accounts.infusionsoft.com/app/oauth/authorize";
const KEAP_TOKEN_URL = process.env.KEAP_TOKEN_URL || "https://api.infusionsoft.com/token";
const KEAP_API_BASE = "https://api.infusionsoft.com/crm/rest/v1";

// Store pending OAuth states (in production, use Redis or DB)
const pendingOAuthStates = new Map<string, { createdAt: number }>();

// Clean up old states every 10 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes
  const entries = Array.from(pendingOAuthStates.entries());
  for (const [state, data] of entries) {
    if (now - data.createdAt > maxAge) {
      pendingOAuthStates.delete(state);
    }
  }
}, 10 * 60 * 1000);

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

interface KeapContact {
  id: number;
  email_addresses: Array<{ email: string; field: string }>;
  given_name?: string;
  family_name?: string;
}

interface KeapTag {
  id: number;
  name: string;
  description?: string;
  category?: { id: number; name: string };
}

interface KeapTagsResponse {
  tags: KeapTag[];
  count: number;
  next?: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3
): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : Math.pow(2, attempt) * 1000;
      console.log(`[Keap] Rate limited. Waiting ${waitTime}ms before retry ${attempt + 1}/${retries}`);
      await sleep(waitTime);
      continue;
    }
    
    return response;
  }
  
  throw new Error("Max retries exceeded for Keap API request");
}

export function generateOAuthState(): string {
  const state = crypto.randomBytes(32).toString("hex");
  pendingOAuthStates.set(state, { createdAt: Date.now() });
  console.log(`[Keap OAuth] Generated state: ${state.substring(0, 8)}...`);
  return state;
}

export function validateOAuthState(state: string): boolean {
  const valid = pendingOAuthStates.has(state);
  if (valid) {
    pendingOAuthStates.delete(state);
    console.log(`[Keap OAuth] State validated and consumed: ${state.substring(0, 8)}...`);
  } else {
    console.log(`[Keap OAuth] Invalid or expired state: ${state.substring(0, 8)}...`);
  }
  return valid;
}

export function getKeapAuthUrl(state: string): string {
  const clientId = process.env.KEAP_CLIENT_ID;
  const redirectUri = process.env.KEAP_REDIRECT_URI;
  
  console.log(`[Keap OAuth] Generating auth URL`);
  console.log(`[Keap OAuth] KEAP_CLIENT_ID present: ${!!clientId}`);
  console.log(`[Keap OAuth] KEAP_REDIRECT_URI: ${redirectUri}`);
  console.log(`[Keap OAuth] KEAP_AUTHORIZE_URL_BASE: ${KEAP_AUTHORIZE_URL_BASE}`);
  
  if (!clientId || !redirectUri) {
    throw new Error("Keap client ID and redirect URI must be configured");
  }
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "full",
    state: state,
  });
  
  const authUrl = `${KEAP_AUTHORIZE_URL_BASE}?${params.toString()}`;
  console.log(`[Keap OAuth] Generated authorize URL: ${authUrl}`);
  
  return authUrl;
}

export async function exchangeCodeForTokens(code: string): Promise<void> {
  const traceId = crypto.randomBytes(4).toString("hex");
  const clientId = process.env.KEAP_CLIENT_ID;
  const clientSecret = process.env.KEAP_CLIENT_SECRET;
  const redirectUri = process.env.KEAP_REDIRECT_URI;
  
  console.log(`[Keap OAuth ${traceId}] Starting token exchange`);
  console.log(`[Keap OAuth ${traceId}] Token URL: ${KEAP_TOKEN_URL}`);
  console.log(`[Keap OAuth ${traceId}] Redirect URI for exchange: ${redirectUri}`);
  console.log(`[Keap OAuth ${traceId}] Code length: ${code.length}`);
  
  if (!clientId || !clientSecret || !redirectUri) {
    console.error(`[Keap OAuth ${traceId}] Missing credentials - clientId: ${!!clientId}, clientSecret: ${!!clientSecret}, redirectUri: ${!!redirectUri}`);
    throw new Error("Keap credentials not configured");
  }
  
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });
  
  console.log(`[Keap OAuth ${traceId}] Sending token request...`);
  
  const response = await fetch(KEAP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body,
  });
  
  console.log(`[Keap OAuth ${traceId}] Token response status: ${response.status}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Keap OAuth ${traceId}] Token exchange failed: ${errorText}`);
    
    // Store error for admin UI display
    await storage.upsertSystemSettings({
      keapLastError: `Token exchange failed (${response.status}): ${errorText}`,
    });
    
    throw new Error(`Failed to exchange code for tokens: ${errorText}`);
  }
  
  const data: TokenResponse = await response.json();
  console.log(`[Keap OAuth ${traceId}] Token exchange successful - expires_in: ${data.expires_in}s`);
  
  await storage.upsertSystemSettings({
    keapAccessToken: data.access_token,
    keapRefreshToken: data.refresh_token,
    keapTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
    keapConnectedAt: new Date(),
    keapLastError: null,
  });
  
  console.log(`[Keap OAuth ${traceId}] Tokens stored successfully`);
}

async function refreshAccessToken(): Promise<string> {
  const traceId = crypto.randomBytes(4).toString("hex");
  const settings = await storage.getSystemSettings();
  
  if (!settings?.keapRefreshToken) {
    throw new Error("No refresh token available");
  }
  
  const clientId = process.env.KEAP_CLIENT_ID;
  const clientSecret = process.env.KEAP_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error("Keap credentials not configured");
  }
  
  console.log(`[Keap Refresh ${traceId}] Refreshing access token...`);
  
  const response = await fetch(KEAP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: settings.keapRefreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  
  console.log(`[Keap Refresh ${traceId}] Refresh response status: ${response.status}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Keap Refresh ${traceId}] Token refresh failed: ${errorText}`);
    
    await storage.upsertSystemSettings({
      keapLastError: `Token refresh failed (${response.status}): ${errorText}`,
    });
    
    throw new Error("Failed to refresh access token");
  }
  
  const data: TokenResponse = await response.json();
  console.log(`[Keap Refresh ${traceId}] Token refreshed successfully`);
  
  await storage.upsertSystemSettings({
    keapAccessToken: data.access_token,
    keapRefreshToken: data.refresh_token,
    keapTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
    keapLastError: null,
  });
  
  return data.access_token;
}

async function getValidAccessToken(): Promise<string> {
  const settings = await storage.getSystemSettings();
  
  if (!settings?.keapAccessToken) {
    throw new Error("Keap not connected");
  }
  
  const expiresAt = settings.keapTokenExpiresAt;
  const now = new Date();
  const bufferMs = 5 * 60 * 1000; // 5 minutes buffer
  
  if (!expiresAt || new Date(expiresAt.getTime() - bufferMs) <= now) {
    return await refreshAccessToken();
  }
  
  return settings.keapAccessToken;
}

export async function isKeapConnected(): Promise<boolean> {
  try {
    const settings = await storage.getSystemSettings();
    return !!(settings?.keapAccessToken && settings?.keapRefreshToken);
  } catch {
    return false;
  }
}

export async function disconnectKeap(): Promise<void> {
  await storage.upsertSystemSettings({
    keapAccessToken: null,
    keapRefreshToken: null,
    keapTokenExpiresAt: null,
    keapConnectedAt: null,
    keapLastError: null,
    keapDefaultTagId: null,
    keapDefaultTagName: null,
  });
  console.log("[Keap] Disconnected and cleared all settings");
}

export async function fetchKeapTags(): Promise<KeapTag[]> {
  const traceId = crypto.randomBytes(4).toString("hex");
  console.log(`[Keap Tags ${traceId}] Fetching tags from Keap...`);
  
  try {
    const accessToken = await getValidAccessToken();
    
    const response = await fetchWithRetry(
      `${KEAP_API_BASE}/tags?limit=1000`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Keap Tags ${traceId}] Failed to fetch tags: ${errorText}`);
      throw new Error(`Failed to fetch tags: ${errorText}`);
    }
    
    const data: KeapTagsResponse = await response.json();
    console.log(`[Keap Tags ${traceId}] Fetched ${data.tags?.length || 0} tags`);
    
    // Update last sync time
    await storage.upsertSystemSettings({
      keapLastTagSyncAt: new Date(),
    });
    
    return data.tags || [];
  } catch (error) {
    console.error(`[Keap Tags ${traceId}] Error:`, error);
    throw error;
  }
}

export async function setDefaultTag(tagId: number, tagName: string): Promise<void> {
  await storage.upsertSystemSettings({
    keapDefaultTagId: tagId,
    keapDefaultTagName: tagName,
  });
  console.log(`[Keap] Default tag set to: ${tagName} (${tagId})`);
}

export async function getDefaultTag(): Promise<{ id: number; name: string } | null> {
  const settings = await storage.getSystemSettings();
  if (settings?.keapDefaultTagId && settings?.keapDefaultTagName) {
    return { id: settings.keapDefaultTagId, name: settings.keapDefaultTagName };
  }
  return null;
}

export async function createOrUpdateContact(
  email: string,
  firstName?: string,
  lastName?: string,
  tagIdOverride?: number
): Promise<number | null> {
  const traceId = crypto.randomBytes(4).toString("hex");
  console.log(`[Keap Contact ${traceId}] Creating/updating contact: ${email}`);
  
  try {
    const accessToken = await getValidAccessToken();
    const settings = await storage.getSystemSettings();
    
    const contactData: Record<string, unknown> = {
      email_addresses: [{ email, field: "EMAIL1" }],
      opt_in_reason: "Signed up for Fearless Video Coach app",
    };
    
    if (firstName) contactData.given_name = firstName;
    if (lastName) contactData.family_name = lastName;
    
    const response = await fetchWithRetry(
      `${KEAP_API_BASE}/contacts`,
      {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(contactData),
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Keap Contact ${traceId}] Create contact failed: ${errorText}`);
      return null;
    }
    
    const contact: KeapContact = await response.json();
    console.log(`[Keap Contact ${traceId}] Contact created/updated with ID: ${contact.id}`);
    
    // Determine which tag to apply
    const tagToApply = tagIdOverride || settings?.keapDefaultTagId || (process.env.KEAP_TAG_ID ? parseInt(process.env.KEAP_TAG_ID, 10) : null);
    
    if (tagToApply && contact.id) {
      await applyTagToContact(contact.id, tagToApply, traceId);
    }
    
    return contact.id;
  } catch (error) {
    console.error(`[Keap Contact ${traceId}] Error:`, error);
    return null;
  }
}

async function applyTagToContact(contactId: number, tagId: number, traceId?: string): Promise<boolean> {
  const tid = traceId || crypto.randomBytes(4).toString("hex");
  console.log(`[Keap Tag ${tid}] Applying tag ${tagId} to contact ${contactId}`);
  
  try {
    const accessToken = await getValidAccessToken();
    
    const response = await fetchWithRetry(
      `${KEAP_API_BASE}/contacts/${contactId}/tags`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tagIds: [tagId],
        }),
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Keap Tag ${tid}] Apply tag failed: ${errorText}`);
      return false;
    }
    
    console.log(`[Keap Tag ${tid}] Tag applied successfully`);
    return true;
  } catch (error) {
    console.error(`[Keap Tag ${tid}] Error applying tag:`, error);
    return false;
  }
}

export async function applyTagToUser(userId: string, tagId: number): Promise<boolean> {
  const user = await storage.getUser(userId);
  if (!user?.keapContactId) {
    console.log(`[Keap] User ${userId} has no Keap contact ID`);
    return false;
  }
  
  return await applyTagToContact(parseInt(user.keapContactId, 10), tagId);
}

export async function syncUserToKeap(
  userId: string,
  tagIdOverride?: number
): Promise<{ success: boolean; contactId?: number; error?: string }> {
  const traceId = crypto.randomBytes(4).toString("hex");
  console.log(`[Keap Sync ${traceId}] Starting sync for user ${userId}`);
  
  try {
    const connected = await isKeapConnected();
    if (!connected) {
      return { success: false, error: "Keap not connected" };
    }
    
    const user = await storage.getUser(userId);
    if (!user) {
      return { success: false, error: "User not found" };
    }
    
    if (!user.email) {
      return { success: false, error: "User has no email" };
    }
    
    // Use user's name if available
    const firstName = user.firstName || undefined;
    const lastName = user.lastName || undefined;
    
    const contactId = await createOrUpdateContact(
      user.email,
      firstName,
      lastName,
      tagIdOverride
    );
    
    if (contactId) {
      await storage.updateUser(userId, {
        keapContactId: String(contactId),
        keapSyncStatus: "synced",
        keapLastSyncAt: new Date(),
        keapSyncError: null,
      });
      
      return { success: true, contactId };
    } else {
      await storage.updateUser(userId, {
        keapSyncStatus: "failed",
        keapSyncError: "Failed to create/update contact",
      });
      
      return { success: false, error: "Failed to create/update contact" };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Keap Sync ${traceId}] Error:`, error);
    
    await storage.updateUser(userId, {
      keapSyncStatus: "failed",
      keapSyncError: errorMsg,
    });
    
    return { success: false, error: errorMsg };
  }
}

export async function sendTestContact(): Promise<{ success: boolean; message: string; contactId?: number }> {
  try {
    const contactId = await createOrUpdateContact(
      "test@fearlessvideocoach.com",
      "Test",
      "Contact"
    );
    
    if (contactId) {
      return {
        success: true,
        message: `Test contact created/updated successfully with ID: ${contactId}`,
        contactId,
      };
    } else {
      return {
        success: false,
        message: "Failed to create test contact in Keap",
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
