// Trusted extension pages ask the worker to authenticate requests; no credentials leave it.
export async function extensionStatus() {
  const result = await chrome.runtime.sendMessage({ type: "AUTH_STATUS" });
  if (!result?.ok) throw new Error(result?.error || "Could not check your extension connection.");
  return result;
}

export async function extensionRequest(path, options = {}) {
  const result = await chrome.runtime.sendMessage({ type: "AUTH_REQUEST", path, method: options.method, body: options.body });
  const status = result?.status || 0;
  if (!result?.ok || status >= 400) {
    throw Object.assign(new Error(result?.data?.message || result?.error || `Connection error (${status})`), { status });
  }
  return result.data;
}
