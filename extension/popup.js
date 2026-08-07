"use strict";

const API_BASE = "https://toolkit.fearlessmarketinglab.com";

const ACTIVITIES = [
  { key: "visionMeditation",    label: "Vision & Meditation",   icon: "🧘" },
  { key: "personalDevelopment", label: "Personal Development",  icon: "📚" },
  { key: "expandSkills",        label: "Expand Skills",         icon: "🎯" },
  { key: "execution",           label: "Execution",             icon: "⚡" },
  { key: "connecting",          label: "Connecting",            icon: "🤝" },
];

// ─── State ──────────────────────────────────────────────────────────────────
let apiKey = null;
let entry = {};      // current DMO field values (booleans)
let saveTimer = null;

// ─── Screens ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function showScreen(name) {
  ["loading-screen", "setup-screen", "main-screen", "settings-screen"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    if (id === "loading-screen") {
      el.style.display = (name === "loading") ? "flex" : "none";
    } else if (id === "setup-screen" || id === "settings-screen") {
      el.classList.toggle("active", id === name + "-screen");
    } else {
      el.classList.toggle("active", id === name + "-screen");
    }
  });
}

// ─── API helpers ─────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─── DMO rendering ───────────────────────────────────────────────────────────
function renderActivities() {
  const container = $("activities");
  container.innerHTML = "";
  let checkedCount = 0;

  ACTIVITIES.forEach(({ key, label, icon }) => {
    const checked = !!entry[key];
    if (checked) checkedCount++;
    const row = document.createElement("div");
    row.className = "activity-row" + (checked ? " checked" : "");
    row.dataset.key = key;
    row.innerHTML = `
      <div class="checkbox">
        <svg class="checkmark" width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span class="activity-icon">${icon}</span>
      <span class="activity-label">${label}</span>
      <div class="saving-dot" id="dot-${key}"></div>
    `;
    row.addEventListener("click", () => toggleActivity(key));
    container.appendChild(row);
  });

  const pct = (checkedCount / ACTIVITIES.length) * 100;
  $("progress-bar").style.width = `${pct}%`;
}

function toggleActivity(key) {
  entry[key] = !entry[key];
  renderActivities();
  scheduleSave(key);
}

function scheduleSave(key) {
  const dot = $(`dot-${key}`);
  if (dot) dot.classList.add("visible");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveEntry(key), 600);
}

async function saveEntry(key) {
  const dot = $(`dot-${key}`);
  try {
    const payload = {};
    ACTIVITIES.forEach(({ key: k }) => { payload[k] = !!entry[k]; });
    await apiFetch("/api/v1/dmo", { method: "POST", body: JSON.stringify(payload) });
    $("save-status").textContent = "Saved ✓";
    setTimeout(() => { const s = $("save-status"); if (s) s.textContent = ""; }, 2000);
  } catch (e) {
    $("save-status").textContent = "Save failed";
  } finally {
    if (dot) dot.classList.remove("visible");
  }
}

// ─── Load DMO data ────────────────────────────────────────────────────────────
async function loadDMO() {
  try {
    const data = await apiFetch("/api/v1/dmo");
    // Streak
    const streak = data.streak?.currentStreak ?? 0;
    $("streak-count").textContent = streak;
    // Date
    const d = new Date(data.date + "T12:00:00");
    $("date-bar").textContent = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    // Entry
    entry = {};
    if (data.entry) {
      ACTIVITIES.forEach(({ key }) => { entry[key] = !!data.entry[key]; });
    }
    renderActivities();
    showScreen("main");
  } catch (e) {
    // If 401/403, API key is invalid
    if (e.message.includes("401") || e.message.includes("403")) {
      await chrome.storage.local.remove("apiKey");
      apiKey = null;
      showScreen("setup");
    } else {
      // Show main with empty state
      renderActivities();
      showScreen("main");
      $("save-status").textContent = "Could not load data";
    }
  }
}

// ─── Push subscription ────────────────────────────────────────────────────────
async function requestPushSubscription(key) {
  try {
    const [tab] = await chrome.tabs.query({ active: true });
    const sw = await navigator.serviceWorker.ready;
    const channel = new MessageChannel();
    sw.active.postMessage({ type: "SUBSCRIBE_PUSH", apiKey: key }, [channel.port2]);
    // Fire and forget — result logged in SW
  } catch (_) { /* push opt-in is best-effort */ }
}

// ─── API key validation ───────────────────────────────────────────────────────
async function validateAndSave(key, errorEl) {
  errorEl.style.display = "none";
  const btn = key === apiKey ? $("update-key-btn") : $("save-key-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Connecting…"; }
  try {
    if (!key.startsWith("ftk_")) throw new Error("Key must start with ftk_");
    apiKey = key;
    await apiFetch("/api/v1/dmo"); // validates the key
    await chrome.storage.local.set({ apiKey: key });
    await requestPushSubscription(key);
    await loadDMO();
  } catch (e) {
    apiKey = null;
    errorEl.textContent = e.message.includes("401") || e.message.includes("403")
      ? "Invalid API key. Check your account page."
      : `Error: ${e.message}`;
    errorEl.style.display = "block";
    showScreen("setup");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = btn.id === "update-key-btn" ? "Update Key" : "Connect"; }
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  showScreen("loading");

  // Wire up setup screen
  $("save-key-btn").addEventListener("click", () => {
    const key = $("api-key-input").value.trim();
    validateAndSave(key, $("setup-error"));
  });
  $("api-key-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("save-key-btn").click();
  });

  // Wire up settings screen
  $("settings-btn").addEventListener("click", () => {
    $("settings-key-input").value = apiKey || "";
    $("settings-error").style.display = "none";
    showScreen("settings");
  });
  $("back-btn").addEventListener("click", () => showScreen("main"));
  $("update-key-btn").addEventListener("click", () => {
    const key = $("settings-key-input").value.trim();
    validateAndSave(key, $("settings-error"));
  });
  $("disconnect-btn").addEventListener("click", async () => {
    await chrome.storage.local.clear();
    apiKey = null;
    entry = {};
    showScreen("setup");
  });

  // Load stored key
  const stored = await chrome.storage.local.get("apiKey");
  if (stored.apiKey) {
    apiKey = stored.apiKey;
    await loadDMO();
  } else {
    showScreen("setup");
  }
}

document.addEventListener("DOMContentLoaded", boot);
