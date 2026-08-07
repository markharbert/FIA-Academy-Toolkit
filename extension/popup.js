"use strict";

const API_BASE = "https://toolkit.fearlessmarketinglab.com";

const ACTS = [
  { key: "visionMeditation",    label: "Vision & Meditation",  icon: "🧘", secsKey: "visionSeconds",    defaultMins: 30 },
  { key: "personalDevelopment", label: "Personal Development", icon: "📚", secsKey: "personalSeconds",  defaultMins: 30 },
  { key: "expandSkills",        label: "Expand Your Skills",   icon: "🎯", secsKey: "expandSeconds",     defaultMins: 60 },
  { key: "execution",           label: "Execution",            icon: "⚡", secsKey: "executionSeconds",  defaultMins: 60 },
  { key: "connecting",          label: "Connect with People",  icon: "🤝", secsKey: "connectingSeconds", defaultMins: 60 },
];

// ─── App state ─────────────────────────────────────────────────────────────
let apiKey      = null;
let todayDate   = null;
let serverEntry = null;
let targets     = {};
let timers      = {};
let notesValue  = "";
let notesDirty  = false;
let notesSaveTimer  = null;
let tickInterval    = null;
let lastServerSave  = 0;
let statusClearTimer = null;
let currentTheme    = "light";   // "light" | "dark"
const AUTO_SAVE_MS  = 10_000;

// ─── DOM helpers ───────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ─── Theme ─────────────────────────────────────────────────────────────────
const SUN_SVG  = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const MOON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

function applyTheme(theme) {
  currentTheme = theme;
  if (theme === "dark") {
    document.body.classList.add("dark");
  } else {
    document.body.classList.remove("dark");
  }
  const btn = $("theme-btn");
  if (btn) btn.innerHTML = theme === "dark" ? SUN_SVG : MOON_SVG;
}

async function toggleTheme() {
  const next = currentTheme === "light" ? "dark" : "light";
  applyTheme(next);
  await chrome.storage.local.set({ theme: next });
}

// ─── Format helpers ────────────────────────────────────────────────────────
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

// ─── Timer math ────────────────────────────────────────────────────────────
function currentSecs(key) {
  const t = timers[key];
  if (!t) return 0;
  let total = t.accumulatedSeconds || 0;
  if (t.status === "running" && t.startedAt) total += (Date.now() - t.startedAt) / 1000;
  return Math.max(0, total);
}

function targetSecs(key) {
  return (targets[key] ?? ACTS.find(a => a.key === key)?.defaultMins ?? 60) * 60;
}

function calcPts(key) {
  return Math.min(5, currentSecs(key) / targetSecs(key) * 5);
}

function totalPts() {
  return ACTS.reduce((s, a) => s + calcPts(a.key), 0);
}

// ─── Status message ────────────────────────────────────────────────────────
function setStatus(msg, clearMs) {
  clearTimeout(statusClearTimer);
  const el = $("save-status");
  if (el) el.textContent = msg;
  if (clearMs) statusClearTimer = setTimeout(() => { if ($("save-status")) $("save-status").textContent = ""; }, clearMs);
}

// ─── API ───────────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
  return res.json();
}

function buildPayload() {
  const p = { notes: notesValue };
  ACTS.forEach(({ key, secsKey }) => {
    const secs = Math.floor(currentSecs(key));
    p[secsKey] = secs;
    p[key]     = secs > 0 || !!(serverEntry?.[key]);
  });
  return p;
}

async function saveToServer(showStatus = false) {
  try {
    const data = await apiFetch("/api/v1/dmo", { method: "POST", body: JSON.stringify(buildPayload()) });
    if (data.entry) serverEntry = data.entry;
    lastServerSave = Date.now();
    notesDirty = false;
    if (showStatus) setStatus("Saved ✓", 2500);
  } catch { if (showStatus) setStatus("Save failed", 3000); }
}

// ─── Persistence ───────────────────────────────────────────────────────────
async function persist() {
  await chrome.storage.local.set({ timers, todayDate, notesValue });
}

async function loadPersisted(todayKey) {
  const s = await chrome.storage.local.get(["timers", "todayDate", "notesValue"]);
  if (s.todayDate !== todayKey) { timers = {}; notesValue = ""; return; }
  timers     = s.timers     || {};
  notesValue = s.notesValue || "";
}

// ─── Timer controls ────────────────────────────────────────────────────────
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
  t.startedAt = null; t.status = "paused";
  await persist();
  await saveToServer(true);
  renderActivities();
  checkAllStopped();
}

async function resumeTimer(key) {
  ensureTimer(key);
  timers[key].status    = "running";
  timers[key].startedAt = Date.now();
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

async function applyManual(key, minutes) {
  ensureTimer(key);
  const t = timers[key];
  if (t.status === "running") t.startedAt = null;
  t.accumulatedSeconds = Math.max(0, minutes) * 60;
  t.status = "done";
  await persist();
  await saveToServer(true);
  renderActivities();
  checkAllStopped();
}

function checkAllStopped() {
  if (!ACTS.some(a => timers[a.key]?.status === "running")) stopTick();
}

// ─── Tick ──────────────────────────────────────────────────────────────────
function startTick() {
  if (tickInterval) return;
  tickInterval = setInterval(onTick, 1000);
}
function stopTick() { clearInterval(tickInterval); tickInterval = null; }

async function onTick() {
  ACTS.forEach(({ key }) => {
    if (timers[key]?.status !== "running") return;
    const secs = currentSecs(key);
    const timerEl = $(`timer-${key}`);
    if (timerEl) timerEl.textContent = fmtTimer(secs);
    const pb = $(`prog-${key}`);
    if (pb) pb.style.width = Math.min(100, secs / targetSecs(key) * 100) + "%";
    const ptsEl = $(`pts-${key}`);
    if (ptsEl) {
      const pts = calcPts(key);
      ptsEl.textContent = pts.toFixed(1) + " pts";
      ptsEl.className = "pts-badge" + (pts >= 5 ? " full" : "");
    }
  });
  updateHeader();
  await persist();
  if (Date.now() - lastServerSave >= AUTO_SAVE_MS) await saveToServer();
}

function updateHeader() {
  const pts = totalPts();
  const el  = $("total-pts");
  if (el) el.textContent = pts.toFixed(1);
  const pb  = $("pts-bar");
  if (pb) pb.style.width = Math.min(100, pts / 25 * 100) + "%";
}

// ─── Render activities ─────────────────────────────────────────────────────
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

    let timerHTML = "", btnsHTML = "";

    if (isIdle) {
      timerHTML = `<span class="timer idle" id="timer-${key}">Not started</span>`;
      btnsHTML  = `<div class="btn-row">
        <button class="cbtn cbtn-start"  data-key="${key}">▶ Start</button>
        <button class="cbtn cbtn-manual" data-key="${key}" id="open-manual-${key}">+ Manual</button>
      </div>`;
    } else if (isRun) {
      timerHTML = `<span class="timer running" id="timer-${key}">${fmtTimer(secs)}</span>`;
      btnsHTML  = `<div class="btn-row">
        <button class="cbtn cbtn-pause" data-key="${key}">⏸ Pause</button>
      </div>`;
    } else if (isPause) {
      timerHTML = `<span class="timer paused" id="timer-${key}">${fmtTimer(secs)}</span>`;
      btnsHTML  = `<div class="btn-row">
        <button class="cbtn cbtn-resume" data-key="${key}">▶ Resume</button>
        <button class="cbtn cbtn-done"   data-key="${key}">✓ Done</button>
      </div>`;
    } else { // done
      timerHTML = `<span class="timer done" id="timer-${key}">✓ ${fmtMins(secs)}</span>`;
      btnsHTML  = `<div class="btn-row">
        <button class="cbtn cbtn-resume" data-key="${key}">▶ Add more</button>
        <button class="cbtn cbtn-edit"   data-key="${key}">Edit</button>
      </div>`;
    }

    const card = document.createElement("div");
    card.className = "act-card" + (isRun ? " running" : "") + (isDone ? " done" : "");
    card.innerHTML = `
      <div class="card-top">
        <span class="act-emoji">${icon}</span>
        <div class="act-info">
          <div class="act-name">${label}</div>
          <div class="act-goal">Goal: ${tMins} min</div>
        </div>
        <span class="pts-badge${pts >= 5 ? " full" : ""}" id="pts-${key}">${pts.toFixed(1)} pts</span>
      </div>
      <div class="prog-track"><div class="prog-fill" id="prog-${key}" style="width:${pct}%"></div></div>
      <div class="card-bottom">${timerHTML}${btnsHTML}</div>
      <div class="manual-row" id="manual-row-${key}">
        <input type="number" id="manual-val-${key}" placeholder="0" min="0" max="480" step="1" />
        <span class="m-unit">min</span>
        <button class="m-save"   data-key="${key}">Save</button>
        <button class="m-cancel" data-key="${key}">×</button>
      </div>`;
    container.appendChild(card);
  });

  // Wire events
  container.querySelectorAll(".cbtn-start").forEach(b =>
    b.addEventListener("click", () => startTimer(b.dataset.key)));
  container.querySelectorAll(".cbtn-pause").forEach(b =>
    b.addEventListener("click", () => pauseTimer(b.dataset.key)));
  container.querySelectorAll(".cbtn-resume").forEach(b =>
    b.addEventListener("click", () => resumeTimer(b.dataset.key)));
  container.querySelectorAll(".cbtn-done").forEach(b =>
    b.addEventListener("click", () => doneTimer(b.dataset.key)));
  container.querySelectorAll(".cbtn-edit").forEach(b =>
    b.addEventListener("click", () => {
      const row = $(`manual-row-${b.dataset.key}`);
      if (row) {
        const input = $(`manual-val-${b.dataset.key}`);
        if (input) input.value = Math.round(currentSecs(b.dataset.key) / 60);
        row.classList.add("open");
      }
      editTimer(b.dataset.key);
    }));
  container.querySelectorAll(".cbtn-manual").forEach(b =>
    b.addEventListener("click", () => {
      $(`manual-row-${b.dataset.key}`)?.classList.add("open");
    }));
  container.querySelectorAll(".m-save").forEach(b =>
    b.addEventListener("click", () => {
      const input = $(`manual-val-${b.dataset.key}`);
      const mins = parseFloat(input?.value);
      if (!isNaN(mins) && mins >= 0) applyManual(b.dataset.key, mins);
    }));
  container.querySelectorAll(".m-cancel").forEach(b =>
    b.addEventListener("click", () => {
      $(`manual-row-${b.dataset.key}`)?.classList.remove("open");
      const t = timers[b.dataset.key];
      if (t && t.status === "paused" && (t.accumulatedSeconds || 0) > 0) {
        t.status = "done"; persist(); renderActivities();
      }
    }));

  // Notes
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

  updateHeader();
}

// ─── Render log ────────────────────────────────────────────────────────────
async function renderLog() {
  const container = $("log-content");
  if (!container) return;
  container.innerHTML = `<div class="log-loading"><div class="spinner" style="border-top-color:var(--accent)"></div></div>`;
  try {
    const data    = await apiFetch("/api/v1/dmo/history?limit=30");
    const entries = data.entries || [];
    if (!entries.length) {
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
      const dots = ACTS.map(a =>
        `<div class="log-dot${(entry[a.key] || (entry[a.secsKey] || 0) > 0) ? "" : " off"}" title="${a.label}"></div>`
      ).join("");
      const row = document.createElement("div");
      row.className = "log-row";
      row.innerHTML = `
        <span class="log-date">${fmtDate(entry.date)}</span>
        <div class="log-dots">${dots}</div>
        <span class="log-pts">${pts.toFixed(1)} pts</span>
        <span class="log-time">${fmtMins(totalSecs)}</span>`;
      list.appendChild(row);
    });
    container.innerHTML = "";
    container.appendChild(list);
  } catch {
    container.innerHTML = `<div class="log-empty">Could not load log. Check your connection.</div>`;
  }
}

// ─── Render settings target rows ───────────────────────────────────────────
function renderTargetRows() {
  const container = $("target-rows");
  if (!container) return;
  container.innerHTML = "";
  ACTS.forEach(({ key, label, icon, defaultMins }) => {
    const row = document.createElement("div");
    row.className = "target-row";
    row.innerHTML = `
      <span class="target-act">${icon} ${label}</span>
      <div class="target-right">
        <input type="number" class="target-input" id="target-${key}"
               value="${targets[key] ?? defaultMins}" min="1" max="480" />
        <span class="target-unit">min</span>
      </div>`;
    container.appendChild(row);
  });
}

async function saveTargets() {
  // Map extension keys → server setting field names
  const MAP = {
    visionMeditation: "visionTarget", personalDevelopment: "personalTarget",
    expandSkills: "expandTarget",     execution: "executionTarget", connecting: "connectingTarget",
  };
  const payload = {};
  ACTS.forEach(({ key, defaultMins }) => {
    const val = parseInt($(`target-${key}`)?.value, 10);
    if (val > 0) { targets[key] = val; payload[MAP[key]] = val; }
    else targets[key] = defaultMins;
  });
  try {
    await apiFetch("/api/dmo/settings", { method: "POST", body: JSON.stringify(payload) });
    await chrome.storage.local.set({ targets });
    setStatus("Goals saved ✓", 2500);
    renderActivities();
  } catch { setStatus("Save failed", 3000); }
}

// ─── Load DMO ──────────────────────────────────────────────────────────────
async function loadDMO() {
  try {
    const [dmoData, settingsData] = await Promise.all([
      apiFetch("/api/v1/dmo"),
      apiFetch("/api/v1/dmo/settings").catch(() => null),
    ]);

    todayDate   = dmoData.date;
    serverEntry = dmoData.entry || null;

    if (settingsData) {
      targets = {
        visionMeditation:    settingsData.visionTarget    ?? 30,
        personalDevelopment: settingsData.personalTarget  ?? 30,
        expandSkills:        settingsData.expandTarget    ?? 60,
        execution:           settingsData.executionTarget ?? 60,
        connecting:          settingsData.connectingTarget?? 60,
      };
    } else {
      const s = await chrome.storage.local.get("targets");
      targets = s.targets || { visionMeditation:30, personalDevelopment:30, expandSkills:60, execution:60, connecting:60 };
    }
    await chrome.storage.local.set({ targets });

    await loadPersisted(todayDate);

    // Seed timer state from server for activities not yet locally tracked
    if (serverEntry) {
      ACTS.forEach(({ key, secsKey }) => {
        const local = timers[key];
        if (!local || local.status === "idle") {
          const srvSecs = serverEntry[secsKey] || 0;
          const srvBool = serverEntry[key] || false;
          if (srvSecs > 0 || srvBool) {
            timers[key] = { status: "done", accumulatedSeconds: srvSecs, startedAt: null };
          }
        }
      });
      if (!notesValue && serverEntry.notes) notesValue = serverEntry.notes;
    }

    const streak = dmoData.streak?.currentStreak ?? dmoData.streak?.current ?? 0;
    const sc = $("streak-count");
    if (sc) sc.textContent = streak;
    const ds = $("date-sub");
    if (ds) ds.textContent = fmtDate(todayDate);

    renderActivities();
    renderTargetRows();
    if (ACTS.some(a => timers[a.key]?.status === "running")) startTick();
    showScreen("main");
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
      await chrome.storage.local.remove("apiKey");
      apiKey = null; showScreen("setup");
    } else {
      renderActivities(); showScreen("main");
      setStatus("Could not load — check connection", 5000);
    }
  }
}

// ─── Screen management ─────────────────────────────────────────────────────
function showScreen(name) {
  ["loading", "setup", "main"].forEach(s => {
    const el = $(`${s}-screen`);
    if (!el) return;
    el.classList.toggle("active", s === name);
  });
}

// ─── Tab management ────────────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach(p =>
    p.classList.toggle("active", p.id === `tab-${name}`));
  if (name === "log")      renderLog();
  if (name === "settings") renderTargetRows();
}

// ─── API key validation ────────────────────────────────────────────────────
async function validateAndSave(key, errorEl) {
  errorEl.style.display = "none";
  if (!key.startsWith("ftk_")) {
    errorEl.textContent = "Key must start with ftk_"; errorEl.style.display = "block"; return;
  }
  apiKey = key;
  try {
    await apiFetch("/api/v1/dmo");
    await chrome.storage.local.set({ apiKey: key });
    try {
      const sw = await navigator.serviceWorker.ready;
      if (sw.active) sw.active.postMessage({ type: "SUBSCRIBE_PUSH", apiKey: key });
    } catch (_) {}
    await loadDMO();
  } catch (e) {
    apiKey = null;
    errorEl.textContent = (e.status === 401 || e.status === 403)
      ? "Invalid API key — check your Account page."
      : `Connection error: ${e.message}`;
    errorEl.style.display = "block"; showScreen("setup");
  }
}

// ─── Boot ──────────────────────────────────────────────────────────────────
async function boot() {
  showScreen("loading");

  // Load and apply saved theme
  const stored = await chrome.storage.local.get(["apiKey", "theme", "targets"]);
  applyTheme(stored.theme || "light");   // light is default

  // Theme toggle
  $("theme-btn").addEventListener("click", toggleTheme);

  // Tabs
  document.querySelectorAll(".tab-btn").forEach(b =>
    b.addEventListener("click", () => switchTab(b.dataset.tab)));

  // Setup screen
  $("save-key-btn").addEventListener("click", () =>
    validateAndSave($("api-key-input").value.trim(), $("setup-error")));
  $("api-key-input").addEventListener("keydown", e => {
    if (e.key === "Enter") $("save-key-btn").click();
  });

  // Settings tab
  $("update-key-btn").addEventListener("click", () =>
    validateAndSave($("settings-key-input").value.trim(), $("settings-error")));
  $("disconnect-btn").addEventListener("click", async () => {
    stopTick();
    const savedTheme = currentTheme;
    await chrome.storage.local.clear();
    await chrome.storage.local.set({ theme: savedTheme }); // keep theme pref
    apiKey = null; timers = {}; notesValue = ""; serverEntry = null;
    showScreen("setup");
  });
  $("save-targets-btn").addEventListener("click", saveTargets);

  // Pre-fill key in settings tab when opened
  document.querySelector('[data-tab="settings"]').addEventListener("click", () => {
    const el = $("settings-key-input");
    if (el && apiKey) el.value = apiKey;
    $("settings-error").style.display = "none";
  });

  // Load API key and go
  if (stored.apiKey) {
    apiKey = stored.apiKey;
    if (stored.targets) targets = stored.targets;
    await loadDMO();
  } else {
    showScreen("setup");
  }
}

document.addEventListener("DOMContentLoaded", boot);
