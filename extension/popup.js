"use strict";

const API_BASE = "https://toolkit.fearlessmarketinglab.com";

const ACTS = [
  { key: "visionMeditation",    label: "Vision & Meditation",  icon: "🧘", secsKey: "visionSeconds",    defaultMins: 30 },
  { key: "personalDevelopment", label: "Personal Development", icon: "📚", secsKey: "personalSeconds",  defaultMins: 30 },
  { key: "expandSkills",        label: "Expand Your Skills",   icon: "🎯", secsKey: "expandSeconds",     defaultMins: 60 },
  { key: "execution",           label: "Execution",            icon: "⚡", secsKey: "executionSeconds",  defaultMins: 60 },
  { key: "connecting",          label: "Connect with People",  icon: "🤝", secsKey: "connectingSeconds", defaultMins: 60 },
];

// ─── App state ────────────────────────────────────────────────────────────────
let apiKey      = null;
let todayDate   = null;           // "YYYY-MM-DD"
let serverEntry = null;           // last saved entry from server
let targets     = {};             // { visionMeditation: 30, ... } minutes

// Per-activity timer state (persisted in chrome.storage.local under "timers"):
//   { status: "idle"|"running"|"paused"|"done", accumulatedSeconds: 0, startedAt: null }
let timers = {};

let notesValue     = "";
let notesDirty     = false;
let notesSaveTimer = null;

let tickInterval    = null;
let lastServerSave  = 0;
const AUTO_SAVE_MS  = 10_000;
let statusClearTimer = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function fmtTimer(totalSecs) {
  const s = Math.floor(Math.max(0, totalSecs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
  return `${m}:${String(ss).padStart(2,"0")}`;
}

function fmtMins(totalSecs) {
  const m = Math.round(totalSecs / 60);
  if (m === 0) return "< 1 min";
  return m === 1 ? "1 min" : `${m} min`;
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function currentSecs(key) {
  const t = timers[key];
  if (!t) return 0;
  let total = t.accumulatedSeconds || 0;
  if (t.status === "running" && t.startedAt) total += (Date.now() - t.startedAt) / 1000;
  return Math.max(0, total);
}

function targetSecs(key) {
  const mins = targets[key] ?? ACTS.find(a => a.key === key)?.defaultMins ?? 60;
  return mins * 60;
}

function calcPts(key) {
  return Math.min(5, currentSecs(key) / targetSecs(key) * 5);
}

function totalPts() {
  return ACTS.reduce((s, a) => s + calcPts(a.key), 0);
}

function setStatus(msg, clearAfterMs) {
  clearTimeout(statusClearTimer);
  const el = $("save-status");
  if (el) el.textContent = msg;
  if (clearAfterMs) statusClearTimer = setTimeout(() => { if (el) el.textContent = ""; }, clearAfterMs);
}

// ─── API ──────────────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function buildSavePayload() {
  const payload = { notes: notesValue };
  ACTS.forEach(({ key, secsKey }) => {
    const secs = Math.floor(currentSecs(key));
    payload[secsKey] = secs;
    payload[key]     = secs > 0 || !!(serverEntry?.[key]);
  });
  return payload;
}

async function saveToServer(showStatus = false) {
  try {
    const data = await apiFetch("/api/v1/dmo", { method: "POST", body: JSON.stringify(buildSavePayload()) });
    if (data.entry) serverEntry = data.entry;
    lastServerSave = Date.now();
    notesDirty = false;
    if (showStatus) setStatus("Saved ✓", 2500);
  } catch (e) {
    if (showStatus) setStatus("Save failed", 3000);
  }
}

// ─── Persistence ──────────────────────────────────────────────────────────────
async function persist() {
  await chrome.storage.local.set({ timers, todayDate, notesValue });
}

async function loadPersisted(todayKey) {
  const s = await chrome.storage.local.get(["timers", "todayDate", "notesValue"]);
  if (s.todayDate !== todayKey) {
    // New day — reset in-progress timers
    timers = {};
    notesValue = "";
    return;
  }
  timers     = s.timers     || {};
  notesValue = s.notesValue || "";
}

// ─── Timer controls ───────────────────────────────────────────────────────────
function ensureTimer(key) {
  if (!timers[key]) timers[key] = { status: "idle", accumulatedSeconds: 0, startedAt: null };
}

async function startTimer(key) {
  ensureTimer(key);
  timers[key].status    = "running";
  timers[key].startedAt = Date.now();
  await persist();
  startTick();
  renderActivities();
}

async function pauseTimer(key) {
  const t = timers[key];
  if (!t || t.status !== "running") return;
  t.accumulatedSeconds = (t.accumulatedSeconds || 0) + (Date.now() - t.startedAt) / 1000;
  t.startedAt = null;
  t.status    = "paused";
  await persist();
  await saveToServer(true);
  renderActivities();
  checkAllStopped();
}

async function resumeTimer(key) {
  const t = timers[key];
  if (!t) return;
  t.status    = "running";
  t.startedAt = Date.now();
  await persist();
  startTick();
  renderActivities();
}

async function doneTimer(key) {
  const t = timers[key];
  if (!t) return;
  if (t.status === "running") {
    t.accumulatedSeconds = (t.accumulatedSeconds || 0) + (Date.now() - t.startedAt) / 1000;
    t.startedAt = null;
  }
  t.status = "done";
  await persist();
  await saveToServer(true);
  renderActivities();
  checkAllStopped();
}

async function editTimer(key) {
  // Allow re-editing a done entry by switching back to paused
  const t = timers[key];
  if (!t) return;
  if (t.status === "running") {
    t.accumulatedSeconds = (t.accumulatedSeconds || 0) + (Date.now() - t.startedAt) / 1000;
    t.startedAt = null;
  }
  t.status = "paused";
  await persist();
  renderActivities();
}

async function applyManualTime(key, minutes) {
  ensureTimer(key);
  // Stop any running first
  if (timers[key].status === "running") {
    timers[key].startedAt = null;
  }
  timers[key].accumulatedSeconds = Math.max(0, minutes) * 60;
  timers[key].status             = "done";
  await persist();
  await saveToServer(true);
  renderActivities();
  checkAllStopped();
}

function checkAllStopped() {
  if (!ACTS.some(a => timers[a.key]?.status === "running")) stopTick();
}

// ─── Tick ─────────────────────────────────────────────────────────────────────
function startTick() {
  if (tickInterval) return;
  tickInterval = setInterval(onTick, 1000);
}
function stopTick() {
  clearInterval(tickInterval);
  tickInterval = null;
}

async function onTick() {
  // Live-update timer displays and progress bars without full re-render
  ACTS.forEach(({ key }) => {
    const t = timers[key];
    if (!t || t.status !== "running") return;
    const secs = currentSecs(key);

    const timerEl = $(`timer-${key}`);
    if (timerEl) timerEl.textContent = fmtTimer(secs);

    const pb = $(`prog-${key}`);
    if (pb) pb.style.width = Math.min(100, secs / targetSecs(key) * 100) + "%";

    const ptsEl = $(`pts-${key}`);
    if (ptsEl) {
      const pts = calcPts(key);
      ptsEl.textContent = pts.toFixed(1) + " pts";
      ptsEl.className = "act-pts" + (pts >= 5 ? " full" : "");
    }
  });
  updatePointsHeader();
  await persist();
  if (Date.now() - lastServerSave >= AUTO_SAVE_MS) await saveToServer();
}

function updatePointsHeader() {
  const pts = totalPts();
  const el  = $("total-pts");
  if (el) el.textContent = pts.toFixed(1);
  const pb  = $("pts-bar");
  if (pb) pb.style.width = Math.min(100, pts / 25 * 100) + "%";
}

// ─── Render Today tab ─────────────────────────────────────────────────────────
function renderActivities() {
  const container = $("activities");
  if (!container) return;
  container.innerHTML = "";

  ACTS.forEach(({ key, label, icon, defaultMins }) => {
    const t       = timers[key] || { status: "idle", accumulatedSeconds: 0, startedAt: null };
    const secs    = currentSecs(key);
    const tSecs   = targetSecs(key);
    const pct     = Math.min(100, secs / tSecs * 100);
    const pts     = calcPts(key);
    const isDone  = t.status === "done";
    const isRun   = t.status === "running";
    const isPause = t.status === "paused";
    const isIdle  = t.status === "idle";
    const tMins   = targets[key] ?? defaultMins;

    let timerHTML = "";
    let btnsHTML  = "";

    if (isIdle) {
      timerHTML = `<span class="timer-display idle" id="timer-${key}">Not started</span>`;
      btnsHTML  = `
        <div class="btn-row">
          <button class="card-btn btn-start"  data-key="${key}">▶ Start</button>
          <button class="card-btn btn-manual" data-key="${key}" id="manual-open-${key}">+ Manual</button>
        </div>`;
    } else if (isRun) {
      timerHTML = `<span class="timer-display running" id="timer-${key}">${fmtTimer(secs)}</span>`;
      btnsHTML  = `
        <div class="btn-row">
          <button class="card-btn btn-pause" data-key="${key}">⏸ Pause</button>
        </div>`;
    } else if (isPause) {
      timerHTML = `<span class="timer-display paused" id="timer-${key}">${fmtTimer(secs)}</span>`;
      btnsHTML  = `
        <div class="btn-row">
          <button class="card-btn btn-resume" data-key="${key}">▶ Resume</button>
          <button class="card-btn btn-done"   data-key="${key}">✓ Done</button>
        </div>`;
    } else if (isDone) {
      timerHTML = `<span class="timer-display done" id="timer-${key}">✓ ${fmtMins(secs)}</span>`;
      btnsHTML  = `
        <div class="btn-row">
          <button class="card-btn btn-resume" data-key="${key}">▶ Add more</button>
          <button class="card-btn btn-edit"   data-key="${key}">Edit</button>
        </div>`;
    }

    const card = document.createElement("div");
    card.className = "activity-card" + (isRun ? " running" : "") + (isDone ? " done" : "");
    card.innerHTML = `
      <div class="card-top">
        <span class="act-icon">${icon}</span>
        <div class="act-info">
          <div class="act-name">${label}</div>
          <div class="act-meta">Goal: ${tMins} min</div>
        </div>
        <span class="act-pts${pts >= 5 ? " full" : ""}" id="pts-${key}">${pts.toFixed(1)} pts</span>
      </div>
      <div class="prog-track"><div class="prog-fill" id="prog-${key}" style="width:${pct}%"></div></div>
      <div class="card-bottom">
        ${timerHTML}
        ${btnsHTML}
      </div>
      <div class="manual-row" id="manual-row-${key}">
        <input type="number" id="manual-val-${key}" placeholder="0" min="0" max="480" step="1" />
        <span class="m-label">min</span>
        <button class="btn-save-m"   data-key="${key}">Save</button>
        <button class="btn-cancel-m" data-key="${key}">×</button>
      </div>
    `;
    container.appendChild(card);
  });

  // Wire buttons
  container.querySelectorAll(".btn-start").forEach(b =>
    b.addEventListener("click", () => startTimer(b.dataset.key)));
  container.querySelectorAll(".btn-pause").forEach(b =>
    b.addEventListener("click", () => pauseTimer(b.dataset.key)));
  container.querySelectorAll(".btn-resume").forEach(b =>
    b.addEventListener("click", () => resumeTimer(b.dataset.key)));
  container.querySelectorAll(".btn-done").forEach(b =>
    b.addEventListener("click", () => doneTimer(b.dataset.key)));
  container.querySelectorAll(".btn-edit").forEach(b =>
    b.addEventListener("click", () => {
      editTimer(b.dataset.key);
      // Pre-fill manual input with current time
      const input = $(`manual-val-${b.dataset.key}`);
      if (input) input.value = Math.round(currentSecs(b.dataset.key) / 60);
      const row = $(`manual-row-${b.dataset.key}`);
      if (row) row.classList.add("open");
    }));
  container.querySelectorAll(".btn-manual").forEach(b =>
    b.addEventListener("click", () => {
      const row = $(`manual-row-${b.dataset.key}`);
      if (row) row.classList.add("open");
    }));
  container.querySelectorAll(".btn-save-m").forEach(b =>
    b.addEventListener("click", () => {
      const input = $(`manual-val-${b.dataset.key}`);
      const mins  = parseFloat(input?.value);
      if (isNaN(mins) || mins < 0) return;
      applyManualTime(b.dataset.key, mins);
    }));
  container.querySelectorAll(".btn-cancel-m").forEach(b =>
    b.addEventListener("click", () => {
      const row = $(`manual-row-${b.dataset.key}`);
      if (row) row.classList.remove("open");
      // If was in paused state just for edit, restore done
      const t = timers[b.dataset.key];
      if (t && t.status === "paused" && (t.accumulatedSeconds || 0) > 0) {
        t.status = "done";
        persist();
        renderActivities();
      }
    }));

  // Notes field
  const notesEl = $("notes-field");
  if (notesEl) {
    notesEl.value = notesValue;
    notesEl.oninput = () => {
      notesValue = notesEl.value;
      notesDirty = true;
      clearTimeout(notesSaveTimer);
      notesSaveTimer = setTimeout(() => saveToServer(true), 1500);
    };
  }

  updatePointsHeader();
}

// ─── Render Log tab ───────────────────────────────────────────────────────────
async function renderLog() {
  const container = $("log-content");
  if (!container) return;
  container.innerHTML = `<div class="log-empty"><div class="spinner" style="margin:auto"></div></div>`;
  try {
    const data = await apiFetch("/api/v1/dmo/history?limit=30");
    const entries = data.entries || [];
    if (entries.length === 0) {
      container.innerHTML = `<div class="log-empty">No entries yet. Start tracking to build your log.</div>`;
      return;
    }
    const list = document.createElement("div");
    list.className = "log-list";
    entries.forEach(entry => {
      const totalSecs = ACTS.reduce((s, a) => s + (entry[a.secsKey] || 0), 0);
      const pts = ACTS.reduce((s, a) => {
        const tgt = (targets[a.key] ?? a.defaultMins) * 60;
        return s + Math.min(5, (entry[a.secsKey] || 0) / tgt * 5);
      }, 0);
      const row = document.createElement("div");
      row.className = "log-row";
      const dots = ACTS.map(a =>
        `<div class="log-dot${entry[a.key] || (entry[a.secsKey] || 0) > 0 ? "" : " off"}" title="${a.label}"></div>`
      ).join("");
      row.innerHTML = `
        <span class="log-date">${fmtDate(entry.date)}</span>
        <div class="log-acts">${dots}</div>
        <span class="log-pts">${pts.toFixed(1)} pts</span>
        <span class="log-time">${fmtMins(totalSecs)}</span>
      `;
      list.appendChild(row);
    });
    container.innerHTML = "";
    container.appendChild(list);
  } catch (e) {
    container.innerHTML = `<div class="log-empty">Could not load log. Check your connection.</div>`;
  }
}

// ─── Render Settings tab ──────────────────────────────────────────────────────
function renderTargetRows() {
  const container = $("target-rows");
  if (!container) return;
  container.innerHTML = "";
  ACTS.forEach(({ key, label, icon, defaultMins }) => {
    const row = document.createElement("div");
    row.className = "target-row";
    row.innerHTML = `
      <span class="target-act">${icon} ${label}</span>
      <div style="display:flex;align-items:center;gap:4px">
        <input type="number" class="target-input" id="target-${key}"
          value="${targets[key] ?? defaultMins}" min="1" max="480" />
        <span class="target-min">min</span>
      </div>
    `;
    container.appendChild(row);
  });
}

async function saveTargets() {
  const payload = {};
  ACTS.forEach(({ key }) => {
    const val = parseInt($(`target-${key}`)?.value, 10);
    if (val > 0) payload[key + "Target"] = val; // server field names e.g. visionTarget
  });
  // Map to server field names
  const serverPayload = {};
  if (payload["visionMeditationTarget"])    serverPayload.visionTarget    = payload["visionMeditationTarget"];
  if (payload["personalDevelopmentTarget"]) serverPayload.personalTarget  = payload["personalDevelopmentTarget"];
  if (payload["expandSkillsTarget"])        serverPayload.expandTarget    = payload["expandSkillsTarget"];
  if (payload["executionTarget"])           serverPayload.executionTarget  = payload["executionTarget"];
  if (payload["connectingTarget"])          serverPayload.connectingTarget = payload["connectingTarget"];

  try {
    await apiFetch("/api/dmo/settings", { method: "POST", body: JSON.stringify(serverPayload) });
    // Update local targets
    ACTS.forEach(({ key, defaultMins }) => {
      const val = parseInt($(`target-${key}`)?.value, 10);
      targets[key] = val > 0 ? val : defaultMins;
    });
    await chrome.storage.local.set({ targets });
    setStatus("Goals saved ✓", 2500);
    // Re-render activities to show updated goals
    renderActivities();
  } catch (e) {
    setStatus("Save failed", 3000);
  }
}

// ─── Load DMO data ────────────────────────────────────────────────────────────
async function loadDMO() {
  try {
    // Load server data + settings in parallel
    const [dmoData, settingsData] = await Promise.all([
      apiFetch("/api/v1/dmo"),
      apiFetch("/api/v1/dmo/settings").catch(() => null),
    ]);

    todayDate = dmoData.date;
    serverEntry = dmoData.entry || null;

    // Apply settings
    if (settingsData) {
      targets = {
        visionMeditation:    settingsData.visionTarget    ?? 30,
        personalDevelopment: settingsData.personalTarget  ?? 30,
        expandSkills:        settingsData.expandTarget    ?? 60,
        execution:           settingsData.executionTarget ?? 60,
        connecting:          settingsData.connectingTarget?? 60,
      };
    } else {
      // Use stored or defaults
      const stored = await chrome.storage.local.get("targets");
      targets = stored.targets || {
        visionMeditation: 30, personalDevelopment: 30,
        expandSkills: 60, execution: 60, connecting: 60,
      };
    }
    await chrome.storage.local.set({ targets });

    // Load persisted timer state (checks if same day)
    await loadPersisted(todayDate);

    // Merge server entry into timer state for activities not yet locally tracked
    if (serverEntry) {
      ACTS.forEach(({ key, secsKey }) => {
        const localT = timers[key];
        // Only use server data if no local timer in progress
        if (!localT || localT.status === "idle") {
          const serverSecs = serverEntry[secsKey] || 0;
          const serverBool = serverEntry[key] || false;
          if (serverSecs > 0 || serverBool) {
            timers[key] = { status: "done", accumulatedSeconds: serverSecs, startedAt: null };
          }
        }
      });
      // Merge notes (local wins if user typed something)
      if (!notesValue && serverEntry.notes) notesValue = serverEntry.notes;
    }

    // Update streak display
    const streak = dmoData.streak?.currentStreak ?? dmoData.streak?.current ?? 0;
    const el = $("streak-count");
    if (el) el.textContent = streak;

    // Date label
    const dateEl = $("date-sub");
    if (dateEl) dateEl.textContent = fmtDate(todayDate);

    // Render
    renderActivities();
    renderTargetRows();

    // Start tick if any timer is running
    if (ACTS.some(a => timers[a.key]?.status === "running")) startTick();

    showScreen("main");
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
      await chrome.storage.local.remove("apiKey");
      apiKey = null;
      showScreen("setup");
    } else {
      renderActivities();
      showScreen("main");
      setStatus("Could not load data", 4000);
    }
  }
}

// ─── Screen management ────────────────────────────────────────────────────────
function showScreen(name) {
  ["loading", "setup", "main"].forEach(s => {
    const el = $(`${s}-screen`);
    if (!el) return;
    el.classList.toggle("active", s === name);
  });
}

// ─── Tab management ───────────────────────────────────────────────────────────
function switchTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === tabName));
  document.querySelectorAll(".tab-panel").forEach(p =>
    p.classList.toggle("active", p.id === `tab-${tabName}`));
  if (tabName === "log") renderLog();
  if (tabName === "settings") renderTargetRows();
}

// ─── API key flow ──────────────────────────────────────────────────────────────
async function validateAndSave(key, errorEl) {
  errorEl.style.display = "none";
  if (!key.startsWith("ftk_")) {
    errorEl.textContent = "Key must start with ftk_";
    errorEl.style.display = "block";
    return;
  }
  apiKey = key;
  try {
    await apiFetch("/api/v1/dmo"); // validate
    await chrome.storage.local.set({ apiKey: key });
    // Register for push notifications (best-effort)
    try {
      const sw = await navigator.serviceWorker.ready;
      if (sw.active) sw.active.postMessage({ type: "SUBSCRIBE_PUSH", apiKey: key });
    } catch (_) {}
    await loadDMO();
  } catch (e) {
    apiKey = null;
    errorEl.textContent = (e.status === 401 || e.status === 403)
      ? "Invalid API key. Check your Account page."
      : `Connection error: ${e.message}`;
    errorEl.style.display = "block";
    showScreen("setup");
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  showScreen("loading");

  // Setup screen
  $("save-key-btn").addEventListener("click", () =>
    validateAndSave($("api-key-input").value.trim(), $("setup-error")));
  $("api-key-input").addEventListener("keydown", e => {
    if (e.key === "Enter") $("save-key-btn").click();
  });

  // Tabs
  document.querySelectorAll(".tab-btn").forEach(b =>
    b.addEventListener("click", () => switchTab(b.dataset.tab)));

  // Settings tab wiring
  $("update-key-btn").addEventListener("click", () =>
    validateAndSave($("settings-key-input").value.trim(), $("settings-error")));
  $("disconnect-btn").addEventListener("click", async () => {
    stopTick();
    await chrome.storage.local.clear();
    apiKey = null; timers = {}; notesValue = ""; serverEntry = null;
    showScreen("setup");
  });
  $("save-targets-btn").addEventListener("click", saveTargets);

  // Populate settings key field when tab opens
  document.querySelector('[data-tab="settings"]').addEventListener("click", () => {
    const el = $("settings-key-input");
    if (el && apiKey) el.value = apiKey;
    $("settings-error").style.display = "none";
  });

  // Load stored API key
  const stored = await chrome.storage.local.get("apiKey");
  if (stored.apiKey) {
    apiKey = stored.apiKey;
    await loadDMO();
  } else {
    showScreen("setup");
  }
}

document.addEventListener("DOMContentLoaded", boot);
