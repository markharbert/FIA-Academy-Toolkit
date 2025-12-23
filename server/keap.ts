import { storage } from "./storage";

const KEAP_AUTHORIZE_URL_BASE = process.env.KEAP_AUTHORIZE_URL_BASE || "https://accounts.infusionsoft.com/app/oauth/authorize";
const KEAP_TOKEN_URL = process.env.KEAP_TOKEN_URL || "https://api.infusionsoft.com/token";
const KEAP_API_BASE = "https://api.infusionsoft.com/crm/rest/v1";
const KEAP_TAG_ID = process.env.KEAP_TAG_ID || "";

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
      console.log(`Keap rate limited. Waiting ${waitTime}ms before retry ${attempt + 1}/${retries}`);
      await sleep(waitTime);
      continue;
    }
    
    return response;
  }
  
  throw new Error("Max retries exceeded for Keap API request");
}

export function getKeapAuthUrl(): string {
  const clientId = process.env.KEAP_CLIENT_ID;
  const redirectUri = process.env.KEAP_REDIRECT_URI;
  
  if (!clientId || !redirectUri) {
    throw new Error("Keap client ID and redirect URI must be configured");
  }
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "full",
  });
  
  return `${KEAP_AUTHORIZE_URL_BASE}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<void> {
  const clientId = process.env.KEAP_CLIENT_ID;
  const clientSecret = process.env.KEAP_CLIENT_SECRET;
  const redirectUri = process.env.KEAP_REDIRECT_URI;
  
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Keap credentials not configured");
  }
  
  const response = await fetch(KEAP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Keap token exchange failed:", errorText);
    throw new Error("Failed to exchange code for tokens");
  }
  
  const data: TokenResponse = await response.json();
  
  await storage.upsertSystemSettings({
    keapAccessToken: data.access_token,
    keapRefreshToken: data.refresh_token,
    keapTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
    keapConnectedAt: new Date(),
  });
}

async function refreshAccessToken(): Promise<string> {
  const settings = await storage.getSystemSettings();
  
  if (!settings?.keapRefreshToken) {
    throw new Error("No refresh token available");
  }
  
  const clientId = process.env.KEAP_CLIENT_ID;
  const clientSecret = process.env.KEAP_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error("Keap credentials not configured");
  }
  
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
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Keap token refresh failed:", errorText);
    throw new Error("Failed to refresh access token");
  }
  
  const data: TokenResponse = await response.json();
  
  await storage.upsertSystemSettings({
    keapAccessToken: data.access_token,
    keapRefreshToken: data.refresh_token,
    keapTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
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
  const bufferMs = 5 * 60 * 1000;
  
  // If no expiry set or token is expiring soon, refresh it
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
  });
}

export async function createOrUpdateContact(
  email: string,
  firstName?: string,
  lastName?: string
): Promise<number | null> {
  try {
    const accessToken = await getValidAccessToken();
    
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
      console.error("Keap create contact failed:", errorText);
      return null;
    }
    
    const contact: KeapContact = await response.json();
    
    if (KEAP_TAG_ID && contact.id) {
      await applyTagToContact(contact.id);
    }
    
    return contact.id;
  } catch (error) {
    console.error("Error creating Keap contact:", error);
    return null;
  }
}

async function applyTagToContact(contactId: number): Promise<void> {
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
          tagIds: [parseInt(KEAP_TAG_ID, 10)],
        }),
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Keap apply tag failed:", errorText);
    }
  } catch (error) {
    console.error("Error applying Keap tag:", error);
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
