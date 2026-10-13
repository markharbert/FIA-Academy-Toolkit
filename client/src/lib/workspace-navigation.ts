export function announceWorkspaceChange() {
  try {
    localStorage.setItem("fia-workspace-change", String(Date.now()));
  } catch {
    // A storage quota/privacy restriction must never prevent the current tab
    // from reloading into the workspace the server has already selected.
    console.warn("Other Toolkit tabs could not be notified. Reload them before continuing.");
  }
}

export function reloadWorkspace() {
  window.location.assign("/projects");
}
