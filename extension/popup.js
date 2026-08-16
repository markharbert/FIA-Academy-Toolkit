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

let suspendedCountdownInterval = null;
const SUSPENDED_CHECK_SECS     = 5 * 60; // 5 minutes — matches SW alarm interval

// ─── Log tab state ─────────────────────────────────────────────────────────
let logEntries      = [];
let logExpandedDate = null;
let logEditMode     = null;   // null | "times" | "notes" | "backfill"
let logTimeEdits    = {};
let logNotesEdit    = "";

// ─── Links tab state ───────────────────────────────────────────────────────
let linksAll             = [];
let linksSearch          = "";
let linksCategory        = "all";
let linksPage            = 1;
let linksFormOpen        = false;
let linksEditingLink     = null;
let linksCopiedId        = null;
let linksDeleteConfirmId = null;
const LINKS_PAGE_SIZE    = 15;

// ─── Swipe File tab state ──────────────────────────────────────────────────
let swipeItems         = [];
const SWIPE_RECENT_MAX = 5;

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

// ─── Membership error ──────────────────────────────────────────────────────
class MembershipError extends Error {
  constructor(msg) { super(msg); this.name = "MembershipError"; }
}

// ─── API ───────────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (res.status === 403) {
    let msg = "Membership not active.";
    try { const j = await res.json(); msg = j.message || msg; } catch {}
    throw new MembershipError(msg);
  }
  if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
  return res.json();
}

// ─── Service-worker messaging ──────────────────────────────────────────────
// Uses chrome.runtime.sendMessage — the correct MV3 extension messaging API.
function messageServiceWorker(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

// ─── Suspended countdown ───────────────────────────────────────────────────
function startSuspendedCountdown() {
  clearSuspendedCountdown();
  let secsLeft = SUSPENDED_CHECK_SECS;
  const el = $("suspended-countdown");
  function tick() {
    if (el) el.textContent = `Next check in ${fmtTimer(secsLeft)}`;
    secsLeft = secsLeft <= 0 ? SUSPENDED_CHECK_SECS : secsLeft - 1;
  }
  tick(); // render immediately before first interval fires
  suspendedCountdownInterval = setInterval(tick, 1000);
}

function clearSuspendedCountdown() {
  clearInterval(suspendedCountdownInterval);
  suspendedCountdownInterval = null;
  const el = $("suspended-countdown");
  if (el) el.textContent = "";
}

// ─── Suspended screen ──────────────────────────────────────────────────────
function showSuspended() {
  // Delegate to showScreen so the SW alarm is always started,
  // including mid-session 403 flows that call showSuspended() directly.
  showScreen("suspended");
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
        <button class="cbtn cbtn-edit"   data-key="${key}">✎ Edit</button>
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
    b.addEventListener("click", async () => {
      const key = b.dataset.key;
      const t = timers[key];
      if (!t) return;
      if (t.status === "done") {
        // Flip to paused then re-render; open row in the fresh DOM
        t.status = "paused";
        await persist();
        renderActivities();
      }
      // Whether we just re-rendered (done→paused) or are already paused,
      // the row is now in the DOM — open it and pre-fill current time
      const row   = $(`manual-row-${key}`);
      const input = $(`manual-val-${key}`);
      if (input) input.value = Math.round(currentSecs(key) / 60);
      if (row) row.classList.add("open");
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

// ─── Links tab ─────────────────────────────────────────────────────────────
async function renderLinks() {
  const container = $("links-content");
  if (!container) return;
  container.innerHTML = `<div class="links-loading"><div class="spinner" style="border-top-color:var(--accent)"></div></div>`;
  try {
    const data = await apiFetch("/api/v1/links?activeOnly=false");
    linksAll = data.links || [];
    renderLinksList(container);
  } catch (err) {
    if (err instanceof MembershipError) { showSuspended(); return; }
    container.innerHTML = `<div class="links-empty">Could not load links. Check your connection.</div>`;
  }
}

function renderLinksList(container) {
  container.innerHTML = "";

  // ── Header ──
  const header = document.createElement("div");
  header.className = "links-header";
  const titleSpan = document.createElement("span");
  titleSpan.className = "links-title";
  titleSpan.textContent = "🔗 Link Library";
  const addBtn = document.createElement("button");
  addBtn.className = "links-add-btn";
  addBtn.textContent = (linksFormOpen && !linksEditingLink) ? "✕ Cancel" : "+ Add Link";
  addBtn.addEventListener("click", () => {
    if (linksFormOpen && !linksEditingLink) {
      linksFormOpen = false;
    } else {
      linksFormOpen = true; linksEditingLink = null;
    }
    renderLinksList(container);
  });
  header.appendChild(titleSpan);
  header.appendChild(addBtn);
  container.appendChild(header);

  // ── Add/edit form ──
  if (linksFormOpen) container.appendChild(buildLinksForm(container));

  // ── Search ──
  const filtersDiv = document.createElement("div");
  filtersDiv.className = "links-filters";
  const searchInput = document.createElement("input");
  searchInput.className = "links-search-input";
  searchInput.type = "text";
  searchInput.placeholder = "Search links…";
  searchInput.value = linksSearch;
  filtersDiv.appendChild(searchInput);
  container.appendChild(filtersDiv);
  searchInput.addEventListener("input", () => {
    linksSearch = searchInput.value;
    linksPage = 1;
    redrawLinksBody(container);
  });

  // ── Category pills ──
  const cats = ["all", ...new Set(linksAll.map(l => l.category).filter(Boolean))];
  const pillsDiv = document.createElement("div");
  pillsDiv.className = "links-cats";
  cats.forEach(cat => {
    const pill = document.createElement("button");
    pill.className = "links-cat-pill" + (linksCategory === cat ? " active" : "");
    pill.dataset.cat = cat;
    pill.textContent = cat === "all" ? "All" : cat;
    pill.addEventListener("click", () => {
      linksCategory = cat;
      linksPage = 1;
      container.querySelectorAll(".links-cat-pill").forEach(p =>
        p.classList.toggle("active", p.dataset.cat === cat));
      redrawLinksBody(container);
    });
    pillsDiv.appendChild(pill);
  });
  container.appendChild(pillsDiv);

  drawLinksBody(container);
}

function getFilteredLinks() {
  const q = linksSearch.toLowerCase();
  return linksAll.filter(l => {
    const matchQ = !q || l.title.toLowerCase().includes(q) ||
      (l.url || "").toLowerCase().includes(q) ||
      (l.description || "").toLowerCase().includes(q) ||
      (l.category || "").toLowerCase().includes(q);
    const matchCat = linksCategory === "all" || l.category === linksCategory;
    return matchQ && matchCat;
  });
}

function redrawLinksBody(container) {
  container.querySelectorAll(".links-list, .links-empty, .links-pagination")
    .forEach(el => el.remove());
  drawLinksBody(container);
}

function drawLinksBody(container) {
  const filtered = getFilteredLinks();
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "links-empty";
    empty.textContent = linksAll.length
      ? "No links match your search."
      : "No links yet. Tap + Add Link to save your first one.";
    container.appendChild(empty);
    return;
  }

  const totalPages = Math.ceil(filtered.length / LINKS_PAGE_SIZE);
  if (linksPage > totalPages) linksPage = totalPages;
  if (linksPage < 1)          linksPage = 1;

  const start     = (linksPage - 1) * LINKS_PAGE_SIZE;
  const pageLinks = filtered.slice(start, start + LINKS_PAGE_SIZE);

  const list = document.createElement("div");
  list.className = "links-list";
  pageLinks.forEach(link => list.appendChild(buildLinkCard(link, container)));
  container.appendChild(list);

  if (totalPages > 1) {
    const pager = document.createElement("div");
    pager.className = "links-pagination";

    const prevBtn = document.createElement("button");
    prevBtn.className = "links-page-btn";
    prevBtn.innerHTML = "&#8249;";
    prevBtn.title = "Previous page";
    prevBtn.disabled = linksPage <= 1;
    prevBtn.addEventListener("click", () => { linksPage--; redrawLinksBody(container); });

    const info = document.createElement("span");
    info.className = "links-page-info";
    info.textContent = `${start + 1}–${Math.min(start + LINKS_PAGE_SIZE, filtered.length)} of ${filtered.length}`;

    const nextBtn = document.createElement("button");
    nextBtn.className = "links-page-btn";
    nextBtn.innerHTML = "&#8250;";
    nextBtn.title = "Next page";
    nextBtn.disabled = linksPage >= totalPages;
    nextBtn.addEventListener("click", () => { linksPage++; redrawLinksBody(container); });

    pager.appendChild(prevBtn);
    pager.appendChild(info);
    pager.appendChild(nextBtn);
    container.appendChild(pager);
  }
}

function buildLinkCard(link, container) {
  const card = document.createElement("div");
  card.className = "link-card" + (!link.isActive ? " inactive" : "");

  const top = document.createElement("div");
  top.className = "link-card-top";

  // Screenshot thumbnail (Microlink)
  const thumb = document.createElement("div");
  thumb.className = "link-thumb";
  const thumbImg = document.createElement("img");
  thumbImg.loading = "lazy";
  thumbImg.alt = link.title;
  thumbImg.src = `https://api.microlink.io/?url=${encodeURIComponent(link.url)}&screenshot=true&meta=false&embed=screenshot.url`;
  const thumbPh = document.createElement("span");
  thumbPh.className = "link-thumb-ph";
  thumbPh.textContent = "🌐";
  thumbImg.addEventListener("load",  () => { thumbImg.classList.add("loaded"); });
  thumbImg.addEventListener("error", () => { thumbImg.style.display = "none"; thumbPh.textContent = "🔗"; });
  thumb.appendChild(thumbImg);
  thumb.appendChild(thumbPh);
  top.appendChild(thumb);

  // Body: title + meta + description
  const body = document.createElement("div");
  body.className = "link-card-body";
  const titleEl = document.createElement("div");
  titleEl.className = "link-card-title";
  titleEl.textContent = link.title;
  titleEl.title = link.title;
  body.appendChild(titleEl);

  if (link.category || !link.isActive) {
    const meta = document.createElement("div");
    meta.className = "link-card-meta";
    if (link.category) {
      const cat = document.createElement("span");
      cat.className = "link-card-cat";
      cat.textContent = link.category;
      meta.appendChild(cat);
    }
    if (!link.isActive) {
      const badge = document.createElement("span");
      badge.className = "link-card-inactive-badge";
      badge.textContent = "Inactive";
      meta.appendChild(badge);
    }
    body.appendChild(meta);
  }

  if (link.description) {
    const desc = document.createElement("div");
    desc.className = "link-card-desc";
    desc.textContent = link.description;
    body.appendChild(desc);
  }
  top.appendChild(body);

  // Actions
  const actions = document.createElement("div");
  actions.className = "link-card-actions";

  if (linksDeleteConfirmId === link.id) {
    // Inline delete confirm
    const wrap = document.createElement("div");
    wrap.className = "link-del-confirm";
    const lbl = document.createElement("span");
    lbl.className = "link-del-label";
    lbl.textContent = "Delete?";
    const yesBtn = document.createElement("button");
    yesBtn.className = "link-icon-btn del";
    yesBtn.title = "Confirm";
    yesBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    const noBtn = document.createElement("button");
    noBtn.className = "link-icon-btn";
    noBtn.title = "Cancel";
    noBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    wrap.appendChild(lbl); wrap.appendChild(yesBtn); wrap.appendChild(noBtn);
    actions.appendChild(wrap);

    yesBtn.addEventListener("click", async () => {
      yesBtn.disabled = true;
      try {
        await apiFetch(`/api/v1/links/${link.id}`, { method: "DELETE" });
        linksAll = linksAll.filter(l => l.id !== link.id);
        linksDeleteConfirmId = null;
        redrawLinksBody(container);
      } catch (err) {
        if (err instanceof MembershipError) { showSuspended(); return; }
        yesBtn.disabled = false;
      }
    });
    noBtn.addEventListener("click", () => { linksDeleteConfirmId = null; redrawLinksBody(container); });

  } else {
    // Copy
    const copyBtn = document.createElement("button");
    copyBtn.className = "link-copy-btn" + (linksCopiedId === link.id ? " copied" : "");
    copyBtn.textContent = linksCopiedId === link.id ? "✓ Copied" : "Copy";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(link.url);
        linksCopiedId = link.id;
        copyBtn.className = "link-copy-btn copied"; copyBtn.textContent = "✓ Copied";
        apiFetch(`/api/v1/links/${link.id}/click`, { method: "POST" }).catch(() => {});
        setTimeout(() => {
          linksCopiedId = null;
          copyBtn.className = "link-copy-btn"; copyBtn.textContent = "Copy";
        }, 2000);
      } catch (_) {}
    });
    actions.appendChild(copyBtn);

    // Open
    const openBtn = document.createElement("button");
    openBtn.className = "link-icon-btn";
    openBtn.title = "Open link";
    openBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
    openBtn.addEventListener("click", () => window.open(link.url, "_blank"));
    actions.appendChild(openBtn);

    // Edit
    const editBtn = document.createElement("button");
    editBtn.className = "link-icon-btn";
    editBtn.title = "Edit";
    editBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
    editBtn.addEventListener("click", () => {
      linksEditingLink = link; linksFormOpen = true; linksDeleteConfirmId = null;
      renderLinksList(container);
    });
    actions.appendChild(editBtn);

    // Delete
    const delBtn = document.createElement("button");
    delBtn.className = "link-icon-btn del";
    delBtn.title = "Delete";
    delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
    delBtn.addEventListener("click", () => { linksDeleteConfirmId = link.id; redrawLinksBody(container); });
    actions.appendChild(delBtn);
  }

  top.appendChild(actions);
  card.appendChild(top);

  // URL strip
  const urlEl = document.createElement("div");
  urlEl.className = "link-card-url";
  urlEl.textContent = link.url;
  card.appendChild(urlEl);

  return card;
}

function buildLinksForm(container) {
  const isEdit = !!linksEditingLink;
  const link = linksEditingLink;
  const existingCats = [...new Set(linksAll.map(l => l.category).filter(Boolean))];
  let isActive = link ? link.isActive : true;

  const form = document.createElement("div");
  form.className = "links-form-panel";

  const heading = document.createElement("div");
  heading.className = "links-form-heading";
  heading.textContent = isEdit ? "✎ Edit Link" : "+ New Link";
  form.appendChild(heading);

  // Title
  const titleField = document.createElement("div");
  titleField.className = "links-form-field";
  titleField.innerHTML = `<div class="links-form-label">Title</div>`;
  const titleInput = document.createElement("input");
  titleInput.className = "links-form-input"; titleInput.type = "text";
  titleInput.placeholder = "e.g. Kajabi 30-Day Trial";
  titleInput.value = link?.title || "";
  titleField.appendChild(titleInput);
  form.appendChild(titleField);

  // URL
  const urlField = document.createElement("div");
  urlField.className = "links-form-field";
  urlField.innerHTML = `<div class="links-form-label">URL</div>`;
  const urlInput = document.createElement("input");
  urlInput.className = "links-form-input"; urlInput.type = "url";
  urlInput.placeholder = "https://…"; urlInput.value = link?.url || "";
  urlField.appendChild(urlInput);
  form.appendChild(urlField);

  // Category field
  const catField = document.createElement("div");
  catField.className = "links-form-field";
  catField.innerHTML = `<div class="links-form-label">Category</div>`;
  const catInput = document.createElement("input");
  catInput.className = "links-form-input"; catInput.type = "text";
  catInput.placeholder = "e.g. Social Media";
  catInput.value = link?.category || "";
  catInput.setAttribute("list", "lf-cats-dl");
  catField.appendChild(catInput);
  const dl = document.createElement("datalist");
  dl.id = "lf-cats-dl";
  existingCats.forEach(c => { const o = document.createElement("option"); o.value = c; dl.appendChild(o); });
  catField.appendChild(dl);
  form.appendChild(catField);

  // Description
  const descField = document.createElement("div");
  descField.className = "links-form-field";
  descField.innerHTML = `<div class="links-form-label">Description <span style="opacity:.5;font-weight:400">(optional)</span></div>`;
  const descInput = document.createElement("textarea");
  descInput.className = "links-form-textarea"; descInput.rows = 2;
  descInput.placeholder = "Short note or description…";
  descInput.value = link?.description || "";
  descField.appendChild(descInput);
  form.appendChild(descField);

  // Active toggle
  const activeRow = document.createElement("div");
  activeRow.className = "links-form-active-row";
  const toggleBtn = document.createElement("button");
  toggleBtn.className = "links-toggle" + (isActive ? " on" : "");
  toggleBtn.type = "button";
  const activeLbl = document.createElement("span");
  activeLbl.className = "links-form-active-label";
  activeLbl.textContent = isActive ? "Active" : "Inactive";
  toggleBtn.addEventListener("click", () => {
    isActive = !isActive;
    toggleBtn.className = "links-toggle" + (isActive ? " on" : "");
    activeLbl.textContent = isActive ? "Active" : "Inactive";
  });
  activeRow.appendChild(toggleBtn); activeRow.appendChild(activeLbl);
  form.appendChild(activeRow);

  // Save / Cancel
  const actionsRow = document.createElement("div");
  actionsRow.className = "links-form-actions";
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "links-form-cancel"; cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => {
    linksFormOpen = false; linksEditingLink = null; renderLinksList(container);
  });
  const saveBtn = document.createElement("button");
  saveBtn.className = "links-form-save";
  saveBtn.textContent = isEdit ? "Save Changes" : "Add Link";
  saveBtn.addEventListener("click", async () => {
    const tv = titleInput.value.trim();
    const uv = urlInput.value.trim();
    titleInput.classList.toggle("error", !tv);
    urlInput.classList.toggle("error", !uv);
    if (!tv || !uv) return;
    const payload = {
      title: tv, url: uv,
      category: catInput.value.trim() || null,
      description: descInput.value.trim() || null,
      isActive,
    };
    saveBtn.textContent = "Saving…"; saveBtn.disabled = true;
    try {
      let res;
      if (isEdit) {
        res = await apiFetch(`/api/v1/links/${link.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        const idx = linksAll.findIndex(l => l.id === link.id);
        if (idx !== -1) linksAll[idx] = res.link;
      } else {
        res = await apiFetch("/api/v1/links", { method: "POST", body: JSON.stringify(payload) });
        linksAll.unshift(res.link);
      }
      linksFormOpen = false; linksEditingLink = null;
      renderLinksList(container);
    } catch (err) {
      if (err instanceof MembershipError) { showSuspended(); return; }
      saveBtn.textContent = isEdit ? "Save Changes" : "Add Link";
      saveBtn.disabled = false;
    }
  });
  actionsRow.appendChild(cancelBtn); actionsRow.appendChild(saveBtn);
  form.appendChild(actionsRow);
  return form;
}

// ─── Render log ────────────────────────────────────────────────────────────
async function renderLog() {
  const container = $("log-content");
  if (!container) return;
  container.innerHTML = `<div class="log-loading"><div class="spinner" style="border-top-color:var(--accent)"></div></div>`;
  try {
    const data = await apiFetch("/api/v1/dmo/history?limit=60");
    logEntries = data.entries || [];
    renderLogList(container);
  } catch {
    container.innerHTML = `<div class="log-empty">Could not load log. Check your connection.</div>`;
  }
}

function renderLogList(container) {
  container.innerHTML = "";

  // "+ Log Past Day" button
  const backfillBar = document.createElement("div");
  backfillBar.className = "log-backfill-bar";
  const bfBtn = document.createElement("button");
  bfBtn.className = "log-backfill-btn" + (logEditMode === "backfill" ? " open" : "");
  bfBtn.id = "log-backfill-btn";
  bfBtn.textContent = logEditMode === "backfill" ? "✕ Cancel" : "+ Log Past Day";
  backfillBar.appendChild(bfBtn);
  container.appendChild(backfillBar);

  bfBtn.addEventListener("click", () => {
    if (logEditMode === "backfill") {
      logEditMode = null;
    } else {
      logEditMode = "backfill";
      logExpandedDate = null;
      logTimeEdits = {};
      ACTS.forEach(a => { logTimeEdits[a.key] = ""; });
      logNotesEdit = "";
    }
    renderLogList(container);
  });

  // Backfill form
  if (logEditMode === "backfill") {
    container.appendChild(buildBackfillForm(container));
  }

  if (!logEntries.length) {
    const empty = document.createElement("div");
    empty.className = "log-empty";
    empty.textContent = "No entries yet. Start tracking to build your log.";
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "log-list";
  logEntries.forEach(entry => renderLogRow(entry, list, container));
  container.appendChild(list);
}

function renderLogRow(entry, list, container) {
  const totalSecs = ACTS.reduce((s, a) => s + (entry[a.secsKey] || 0), 0);
  const pts = ACTS.reduce((s, a) => {
    const tgt = (targets[a.key] ?? a.defaultMins) * 60;
    return s + Math.min(5, (entry[a.secsKey] || 0) / tgt * 5);
  }, 0);
  const dots = ACTS.map(a =>
    `<div class="log-dot${(entry[a.key] || (entry[a.secsKey] || 0) > 0) ? "" : " off"}" title="${a.label}"></div>`
  ).join("");

  const isExpanded = logExpandedDate === entry.date;
  const wrap = document.createElement("div");
  wrap.className = "log-entry-wrap";

  const row = document.createElement("div");
  row.className = "log-row" + (isExpanded ? " expanded" : "");
  row.innerHTML = `
    <span class="log-date">${fmtDate(entry.date)}</span>
    <div class="log-dots">${dots}</div>
    <span class="log-pts">${pts.toFixed(1)} pts</span>
    <span class="log-time">${fmtMins(totalSecs)}</span>
    <span class="log-chevron">${isExpanded ? "▾" : "▸"}</span>`;
  wrap.appendChild(row);

  if (isExpanded) {
    wrap.appendChild(buildEntryDetail(entry, container));
  }

  row.addEventListener("click", () => {
    if (logExpandedDate === entry.date) {
      logExpandedDate = null;
      logEditMode = null;
    } else {
      logExpandedDate = entry.date;
      logEditMode = null;
    }
    renderLogList(container);
  });

  list.appendChild(wrap);
}

function buildEntryDetail(entry, container) {
  const detail = document.createElement("div");
  detail.className = "log-detail";

  const isEditingTimes = logEditMode === "times";
  const isEditingNotes = logEditMode === "notes";

  // ── Activity rows ──
  const actsDiv = document.createElement("div");
  actsDiv.className = "log-detail-acts";
  ACTS.forEach(a => {
    const secs = entry[a.secsKey] || 0;
    const tgtSecs = (targets[a.key] ?? a.defaultMins) * 60;
    const pct = tgtSecs > 0 ? Math.min(100, secs / tgtSecs * 100) : 0;
    const goalMet = secs >= tgtSecs;

    const actRow = document.createElement("div");
    actRow.className = "log-act-row";

    if (isEditingTimes) {
      actRow.innerHTML = `
        <span class="log-act-icon">${a.icon}</span>
        <span class="log-act-label">${a.label}</span>
        <input class="log-time-input" id="log-edit-${a.key}"
               type="number" min="0" max="480" placeholder="0"
               value="${logTimeEdits[a.key] ?? (secs > 0 ? Math.round(secs / 60) : "")}" />
        <span class="log-act-unit">min</span>`;
    } else {
      actRow.innerHTML = `
        <span class="log-act-icon">${a.icon}</span>
        <span class="log-act-label">${a.label}</span>
        <div class="log-act-right">
          <div class="log-act-bar-track"><div class="log-act-bar-fill" style="width:${pct}%"></div></div>
          <span class="log-act-time${secs === 0 ? " zero" : ""}">${secs > 0 ? fmtMins(secs) : "—"}</span>
          <span class="log-act-check">${goalMet && secs > 0 ? "✓" : ""}</span>
        </div>`;
    }
    actsDiv.appendChild(actRow);
  });
  detail.appendChild(actsDiv);

  // ── Time edit controls ──
  if (isEditingTimes) {
    const editRow = document.createElement("div");
    editRow.className = "log-edit-row";
    editRow.innerHTML = `
      <span class="log-edit-hint">Minutes per activity (0 to clear)</span>
      <button class="log-cancel-btn" id="log-time-cancel">Cancel</button>
      <button class="log-save-btn"   id="log-time-save">Save Times</button>`;
    detail.appendChild(editRow);

    editRow.querySelector("#log-time-cancel").addEventListener("click", e => {
      e.stopPropagation();
      logEditMode = null;
      renderLogList(container);
    });
    editRow.querySelector("#log-time-save").addEventListener("click", async e => {
      e.stopPropagation();
      ACTS.forEach(a => {
        const inp = detail.querySelector(`#log-edit-${a.key}`);
        if (inp) logTimeEdits[a.key] = inp.value;
      });
      const btn = e.currentTarget;
      btn.textContent = "Saving…"; btn.disabled = true;
      try {
        const payload = { date: entry.date, notes: entry.notes ?? "" };
        ACTS.forEach(a => {
          const mins = parseFloat(logTimeEdits[a.key]);
          const secs = (!isNaN(mins) && mins > 0) ? Math.round(mins * 60) : 0;
          payload[a.secsKey] = secs;
          payload[a.key] = secs > 0 ? true : (entry[a.key] || false);
        });
        await apiFetch("/api/v1/dmo", { method: "POST", body: JSON.stringify(payload) });
        logEditMode = null;
        const data = await apiFetch("/api/v1/dmo/history?limit=60");
        logEntries = data.entries || [];
        renderLogList(container);
      } catch (err) {
        if (err instanceof MembershipError) { showSuspended(); return; }
        btn.textContent = "Save Times"; btn.disabled = false;
      }
    });
  } else if (!isEditingNotes) {
    const editRow = document.createElement("div");
    editRow.className = "log-edit-row log-edit-row-right";
    editRow.innerHTML = `<button class="log-edit-btn" id="log-times-edit-btn">✎ Edit Times</button>`;
    detail.appendChild(editRow);
    editRow.querySelector("#log-times-edit-btn").addEventListener("click", e => {
      e.stopPropagation();
      logTimeEdits = {};
      ACTS.forEach(a => { logTimeEdits[a.key] = entry[a.secsKey] > 0 ? String(Math.round(entry[a.secsKey] / 60)) : ""; });
      logEditMode = "times";
      renderLogList(container);
    });
  }

  // ── Notes section ──
  const notesSection = document.createElement("div");
  notesSection.className = "log-notes-section";
  const notesText = entry.notes?.trim() || "";

  const notesHeader = document.createElement("div");
  notesHeader.className = "log-notes-header";
  notesHeader.innerHTML = `<span class="log-notes-label">📝 Notes</span>`;
  if (!isEditingNotes && !isEditingTimes) {
    const editNotesBtn = document.createElement("button");
    editNotesBtn.className = "log-edit-btn";
    editNotesBtn.textContent = "✎ Edit";
    editNotesBtn.addEventListener("click", e => {
      e.stopPropagation();
      logNotesEdit = entry.notes ?? "";
      logEditMode = "notes";
      renderLogList(container);
    });
    notesHeader.appendChild(editNotesBtn);
  }
  notesSection.appendChild(notesHeader);

  if (isEditingNotes) {
    const textarea = document.createElement("textarea");
    textarea.className = "log-notes-textarea";
    textarea.id = "log-notes-textarea";
    textarea.rows = 3;
    textarea.placeholder = "Add notes for this day…";
    textarea.value = logNotesEdit;
    notesSection.appendChild(textarea);

    const notesEditRow = document.createElement("div");
    notesEditRow.className = "log-edit-row log-edit-row-right";
    notesEditRow.innerHTML = `
      <button class="log-cancel-btn" id="log-notes-cancel">Cancel</button>
      <button class="log-save-btn"   id="log-notes-save">Save Notes</button>`;
    notesSection.appendChild(notesEditRow);

    notesEditRow.querySelector("#log-notes-cancel").addEventListener("click", e => {
      e.stopPropagation();
      logEditMode = null;
      renderLogList(container);
    });
    notesEditRow.querySelector("#log-notes-save").addEventListener("click", async e => {
      e.stopPropagation();
      const notes = notesSection.querySelector("#log-notes-textarea")?.value ?? logNotesEdit;
      const btn = e.currentTarget;
      btn.textContent = "Saving…"; btn.disabled = true;
      try {
        const payload = { date: entry.date, notes };
        ACTS.forEach(a => {
          payload[a.secsKey] = entry[a.secsKey] || 0;
          payload[a.key]     = entry[a.key] || (entry[a.secsKey] > 0);
        });
        await apiFetch("/api/v1/dmo", { method: "POST", body: JSON.stringify(payload) });
        logEditMode = null;
        const data = await apiFetch("/api/v1/dmo/history?limit=60");
        logEntries = data.entries || [];
        renderLogList(container);
      } catch (err) {
        if (err instanceof MembershipError) { showSuspended(); return; }
        btn.textContent = "Save Notes"; btn.disabled = false;
      }
    });
  } else {
    const p = document.createElement("p");
    p.className = "log-notes-text" + (notesText ? "" : " placeholder");
    p.textContent = notesText || "No notes for this day. Tap Edit to add.";
    notesSection.appendChild(p);
  }

  detail.appendChild(notesSection);
  return detail;
}

function buildBackfillForm(container) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const maxDate = yesterday.toISOString().slice(0, 10);

  const form = document.createElement("div");
  form.className = "log-backfill-form";

  const dateRow = document.createElement("div");
  dateRow.className = "log-bf-date-row";
  dateRow.innerHTML = `
    <label class="log-bf-label">Date</label>
    <input type="date" id="bf-date" class="log-bf-date-input"
           value="${maxDate}" max="${maxDate}" />`;
  form.appendChild(dateRow);

  ACTS.forEach(a => {
    const actRow = document.createElement("div");
    actRow.className = "log-act-row";
    actRow.innerHTML = `
      <span class="log-act-icon">${a.icon}</span>
      <span class="log-act-label">${a.label}</span>
      <input class="log-time-input" id="bf-${a.key}" type="number"
             min="0" max="480" placeholder="0"
             value="${logTimeEdits[a.key] || ""}" />
      <span class="log-act-unit">min</span>`;
    form.appendChild(actRow);
  });

  const notesRow = document.createElement("div");
  notesRow.className = "log-bf-notes-row";
  notesRow.innerHTML = `
    <label class="log-bf-label">Notes <span style="font-weight:400;opacity:.5">(optional)</span></label>
    <textarea id="bf-notes" class="log-notes-textarea" rows="2"
              placeholder="Add notes for this day…">${logNotesEdit}</textarea>`;
  form.appendChild(notesRow);

  const btnRow = document.createElement("div");
  btnRow.className = "log-edit-row log-edit-row-right";
  btnRow.innerHTML = `
    <button class="log-cancel-btn" id="bf-cancel">Cancel</button>
    <button class="log-save-btn"   id="bf-save">Save Day</button>`;
  form.appendChild(btnRow);

  btnRow.querySelector("#bf-cancel").addEventListener("click", () => {
    logEditMode = null;
    renderLogList(container);
  });

  btnRow.querySelector("#bf-save").addEventListener("click", async () => {
    const dateVal = form.querySelector("#bf-date")?.value;
    if (!dateVal) return;
    const btn = form.querySelector("#bf-save");
    btn.textContent = "Saving…"; btn.disabled = true;
    try {
      const notes = form.querySelector("#bf-notes")?.value ?? "";
      const payload = { date: dateVal, notes };
      ACTS.forEach(a => {
        const mins = parseFloat(form.querySelector(`#bf-${a.key}`)?.value || "0");
        const secs = (!isNaN(mins) && mins > 0) ? Math.round(mins * 60) : 0;
        payload[a.secsKey] = secs;
        payload[a.key] = secs > 0;
      });
      await apiFetch("/api/v1/dmo", { method: "POST", body: JSON.stringify(payload) });
      logEditMode = null;
      logExpandedDate = dateVal; // auto-expand the saved entry
      const data = await apiFetch("/api/v1/dmo/history?limit=60");
      logEntries = data.entries || [];
      renderLogList(container);
    } catch (err) {
      if (err instanceof MembershipError) { showSuspended(); return; }
      btn.textContent = "Save Day"; btn.disabled = false;
    }
  });

  return form;
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
// Apply DMO data to local state + re-render (no network, no screen change).
async function applyDmoData(dmoData, settingsData) {
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

  if (serverEntry) {
    ACTS.forEach(({ key, secsKey }) => {
      const local = timers[key];
      if (!local || local.status === "idle") {
        const srvSecs = serverEntry[secsKey] || 0;
        const srvBool = serverEntry[key]     || false;
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
  updateSubtitle();
  renderActivities();
  renderTargetRows();
  if (ACTS.some(a => timers[a.key]?.status === "running")) startTick();
}

// Fetch fresh DMO data from server.
// background=true → update silently without touching the loading screen.
async function loadDMO(background = false) {
  try {
    const [dmoData, settingsData] = await Promise.all([
      apiFetch("/api/v1/dmo"),
      apiFetch("/api/v1/dmo/settings").catch(() => null),
    ]);

    // Persist for next cache-first open
    chrome.storage.local.set({ cachedDmo: { dmoData, settingsData } }).catch(() => {});

    await applyDmoData(dmoData, settingsData);
    if (!background) showScreen("main");
  } catch (e) {
    if (e instanceof MembershipError) {
      showScreen("suspended");
    } else if (e.status === 401) {
      await chrome.storage.local.remove("apiKey");
      apiKey = null; showScreen("setup");
    } else {
      if (!background) { renderActivities(); showScreen("main"); }
      setStatus("Could not refresh — check connection", 5000);
    }
  }
}

// ─── Screen management ─────────────────────────────────────────────────────
function showScreen(name) {
  ["loading", "suspended", "setup", "main"].forEach(s => {
    const el = $(`${s}-screen`);
    if (!el) return;
    el.classList.toggle("active", s === name);
  });
  if (name === "suspended") {
    // Ask the service worker to set a persistent alarm that survives popup close.
    messageServiceWorker({ type: "START_SUSPENDED_CHECK" });
    startSuspendedCountdown();
  } else {
    // Cancel the alarm — membership is no longer suspended from our perspective.
    messageServiceWorker({ type: "STOP_SUSPENDED_CHECK" });
    clearSuspendedCountdown();
  }
}

// ─── Tab management ────────────────────────────────────────────────────────
let currentPrimaryTab = "dmo";
let currentSubTab     = "today";

function updateSubtitle() {
  const ds = $("date-sub");
  if (ds && todayDate) ds.textContent = fmtDate(todayDate);
}

// ─── Swipe File functions ──────────────────────────────────────────────────

const SWIPE_BTN_IDS = ["swipe-btn-fullpage", "swipe-btn-visible", "swipe-btn-section"];

// ── Status helpers ─────────────────────────────────────────────────────────

function swipeShowStatus(html, autoHideMs = 0) {
  const el = $("swipe-status");
  if (!el) return;
  el.innerHTML = html;
  el.style.display = "flex";
  if (autoHideMs > 0) setTimeout(() => { el.style.display = "none"; el.innerHTML = ""; }, autoHideMs);
}

function swipeHideStatus() {
  const el = $("swipe-status"); if (el) { el.style.display = "none"; el.innerHTML = ""; }
}

function swipeEnableBtns() {
  SWIPE_BTN_IDS.forEach(id => { const b = $(id); if (b) { b.disabled = false; b.classList.remove("active"); } });
}

function swipeReset() { swipeEnableBtns(); swipeHideStatus(); }

// ── Full Page (native scroll-and-stitch via service worker) ──────────────────

async function swipeCaptureFullPage() {
  let tab;
  try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); } catch (_) {}
  const url = tab?.url ?? "";
  if (!url.startsWith("http")) { alert("Full Page capture only works on http/https pages."); return; }

  SWIPE_BTN_IDS.forEach(id => { const b = $(id); if (b) b.disabled = true; });
  $("swipe-btn-fullpage").classList.add("active");

  chrome.runtime.sendMessage({
    action: "startFullPageCapture",
    tabId:  tab.id,
    title:  (tab.title || url).substring(0, 140),
  });

  swipeShowStatus("📄 Capturing full page in background — you'll get a notification when it's saved.");
  setTimeout(() => window.close(), 2200);
}

// ── Visible Area (captureVisibleTab → auto-save) ──────────────────────────

async function swipeCaptureVisibleArea() {
  SWIPE_BTN_IDS.forEach(id => { const b = $(id); if (b) b.disabled = true; });
  $("swipe-btn-visible").classList.add("active");
  swipeShowStatus('<span class="spinner" style="width:12px;height:12px;border-width:2px;border-top-color:var(--accent);flex-shrink:0;"></span>&nbsp; Saving…');

  try {
    const dataUrl = await new Promise((resolve, reject) => {
      chrome.tabs.captureVisibleTab(null, { format: "png" }, url => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(url);
      });
    });

    let title = "Visible Area";
    try { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); title = tab?.title || title; } catch (_) {}

    const { uploadURL, objectPath } = await apiFetch("/api/v1/swipe/request-upload-url", { method: "POST" });
    const blob = await (await fetch(dataUrl)).blob();
    await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": "image/png" }, body: blob });
    const { item: savedItem } = await apiFetch("/api/v1/swipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "upload", title, imagePath: objectPath }),
    });

    // Auto-generate share token so Recent Saves shows thumbnail + "Copy link" immediately
    try {
      const { token } = await apiFetch(`/api/v1/swipe/${savedItem.id}/share`, { method: "POST" });
      savedItem.shareToken = token;
    } catch (_) {}

    swipeEnableBtns();
    swipeShowStatus("✓ Saved!", 2500);
    renderSwipe();

    // Inject page-level toast on the captured tab
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        chrome.scripting.executeScript({ target: { tabId: activeTab.id }, files: ["save-toast.js"] }).catch(() => {});
      }
    } catch (_) {}
  } catch (err) {
    swipeEnableBtns();
    swipeHideStatus();
    console.error("[FIA Swipe] visible area save failed:", err.message);
    // Inject red error toast into the active tab
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: (msg) => {
            const TOAST_ID = "__fia_save_toast__", STYLE_ID = "__fia_toast_style__";
            [TOAST_ID, STYLE_ID].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });
            const style = document.createElement("style");
            style.id = STYLE_ID;
            style.textContent = "@keyframes _fia_in{from{opacity:0;transform:translateX(-50%) scale(.75)}to{opacity:1;transform:translateX(-50%) scale(1)}}@keyframes _fia_out{from{opacity:1;transform:translateX(-50%) scale(1)}to{opacity:0;transform:translateX(-50%) scale(.75)}}";
            document.head.appendChild(style);
            const toast = document.createElement("div");
            toast.id = TOAST_ID;
            toast.style.cssText = "position:fixed;top:28px;left:50%;transform:translateX(-50%);z-index:2147483647;background:linear-gradient(135deg,#e85d5d 0%,#b52b2b 100%);padding:11px 22px 11px 14px;border-radius:999px;box-shadow:0 8px 28px rgba(185,43,43,.45);display:flex;align-items:center;gap:10px;animation:_fia_in .4s cubic-bezier(.34,1.56,.64,1) both;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif;user-select:none;-webkit-user-select:none";
            toast.innerHTML = `<svg width="26" height="26" viewBox="0 0 26 26" fill="none" style="flex-shrink:0"><circle cx="13" cy="13" r="12" fill="rgba(255,255,255,0.22)"/><path d="M8.5 8.5l9 9M17.5 8.5l-9 9" stroke="white" stroke-width="2.6" stroke-linecap="round"/></svg><span style="color:#fff;font-size:14px;font-weight:650;white-space:nowrap">${msg}</span>`;
            document.body.appendChild(toast);
            setTimeout(() => { toast.style.animation = "_fia_out .32s ease-in both"; setTimeout(() => { toast.remove(); style.remove(); }, 350); }, 4000);
          },
          args: ["Capture failed — try again"],
        }).catch(() => {});
      }
    } catch (_) {}
  }
}

// ── Section (inject overlay → SW auto-saves) ──────────────────────────────

async function swipeCaptureSection() {
  let tab;
  try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); } catch (_) {}
  if (!tab?.id) { alert("No active tab found."); return; }

  SWIPE_BTN_IDS.forEach(id => { const b = $(id); if (b) b.disabled = true; });
  $("swipe-btn-section").classList.add("active");

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["selection-overlay.js"] });
    // Close immediately so the full page is visible for selection
    window.close();
  } catch (err) {
    swipeEnableBtns();
    swipeHideStatus();
    console.error("[FIA Swipe] section inject failed:", err.message);
  }
}

async function renderSwipe() {
  // Show cached items instantly, then refresh from the server in the background.
  // This keeps the list in sync with the web app while feeling immediate.
  const cached = await chrome.storage.local.get("cachedSwipeItems");
  if (cached.cachedSwipeItems?.length) {
    swipeItems = cached.cachedSwipeItems;
    drawSwipeList();
  }

  try {
    const data  = await apiFetch("/api/v1/swipe");
    swipeItems  = data.items || [];
    // Persist for next open
    chrome.storage.local.set({ cachedSwipeItems: swipeItems }).catch(() => {});
  } catch (_) {
    if (!cached.cachedSwipeItems) swipeItems = [];
  }
  drawSwipeList(); // always re-draw with fresh (or empty-fallback) data
}

function drawSwipeList() {
  const container = $("swipe-list");
  if (!container) return;
  if (swipeItems.length === 0) {
    container.innerHTML = `<div class="swipe-empty">Nothing saved yet — try a screenshot!</div>`;
    return;
  }
  const recent = swipeItems.slice(0, SWIPE_RECENT_MAX);
  const rows = recent.map(item => {
    const isImg = item.type === "upload" && item.shareToken;
    const thumb = isImg
      ? `<div class="swipe-item-thumb"><img src="${API_BASE}/api/swipe/public/${item.shareToken}/image" onerror="this.style.display='none'" /></div>`
      : `<div class="swipe-item-thumb">${item.type === "upload" ? "📷" : "📝"}</div>`;
    const action = item.shareToken
      ? `<button class="swipe-link-btn" data-token="${item.shareToken}">Copy link</button>`
      : `<button class="swipe-share-btn" data-id="${item.id}">Share</button>`;
    return `<div class="swipe-item-card">
      ${thumb}
      <div class="swipe-item-body">
        <div class="swipe-item-title">${item.title}</div>
        <div class="swipe-item-meta">${item.type === "upload" ? "📷 Image" : "📝 Snippet"}</div>
      </div>
      <div class="swipe-item-acts">${action}</div>
    </div>`;
  }).join("");
  container.innerHTML = `<div class="swipe-item-list">${rows}</div>`;

  // Copy link buttons
  container.querySelectorAll(".swipe-link-btn[data-token]").forEach(btn => {
    btn.addEventListener("click", () => {
      const url = `${API_BASE}/swipe/${btn.dataset.token}`;
      navigator.clipboard.writeText(url).catch(() => {});
      btn.textContent = "Copied!"; btn.classList.add("copied");
      setTimeout(() => { btn.textContent = "Copy link"; btn.classList.remove("copied"); }, 2000);
    });
  });

  // Share buttons (no token yet)
  container.querySelectorAll(".swipe-share-btn[data-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true; btn.textContent = "…";
      try {
        const data = await apiFetch(`/api/v1/swipe/${btn.dataset.id}/share`, { method: "POST" });
        const url = `${API_BASE}/swipe/${data.token}`;
        navigator.clipboard.writeText(url).catch(() => {});
        const item = swipeItems.find(i => i.id === btn.dataset.id);
        if (item) item.shareToken = data.token;
        drawSwipeList(); // re-render to show copy button
      } catch (_) {
        btn.disabled = false; btn.textContent = "Share";
      }
    });
  });
}

// (switchSubTab moved up, defined together with switchPrimaryTab)

function switchPrimaryTab(name) {
  currentPrimaryTab = name;
  document.querySelectorAll(".primary-tab-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.primary === name));
  document.querySelectorAll(".primary-panel").forEach(p =>
    p.classList.toggle("active", p.id === `primary-${name}`));
  if (name === "links") renderLinks();
  if (name === "swipe") renderSwipe();
  if (name !== "links") {
    linksFormOpen = false; linksEditingLink = null; linksDeleteConfirmId = null;
  }
  chrome.storage.local.set({ lastPrimaryTab: name }).catch(() => {});
}

function switchSubTab(name) {
  currentSubTab = name;
  document.querySelectorAll(".sub-tab-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach(p =>
    p.classList.toggle("active", p.id === `tab-${name}`));
  if (name === "log")   renderLog();
  if (name === "goals") renderTargetRows();
  chrome.storage.local.set({ lastSubTab: name }).catch(() => {});
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
    if (e instanceof MembershipError) {
      // Key is valid but membership is inactive — save it and show suspended screen
      await chrome.storage.local.set({ apiKey: key });
      showScreen("suspended");
    } else {
      apiKey = null;
      errorEl.textContent = e.status === 401
        ? "API key not found or revoked — check your Account page."
        : `Connection error: ${e.message}`;
      errorEl.style.display = "block"; showScreen("setup");
    }
  }
}

// ─── Boot ──────────────────────────────────────────────────────────────────
async function boot() {
  showScreen("loading");

  // Load and apply saved theme
  const stored = await chrome.storage.local.get(["apiKey", "theme", "targets", "cachedDmo", "lastPrimaryTab", "lastSubTab"]);
  applyTheme(stored.theme || "light");   // light is default

  // Theme toggle
  $("theme-btn").addEventListener("click", toggleTheme);

  // Primary tabs (DMO Tracker | Links)
  document.querySelectorAll(".primary-tab-btn").forEach(b =>
    b.addEventListener("click", () => switchPrimaryTab(b.dataset.primary)));
  // Sub-tabs (Today | Log | Settings)
  document.querySelectorAll(".sub-tab-btn").forEach(b =>
    b.addEventListener("click", () => switchSubTab(b.dataset.tab)));

  // Setup screen
  $("save-key-btn").addEventListener("click", () =>
    validateAndSave($("api-key-input").value.trim(), $("setup-error")));
  $("api-key-input").addEventListener("keydown", e => {
    if (e.key === "Enter") $("save-key-btn").click();
  });

  // Settings tab
  $("update-key-btn").addEventListener("click", () =>
    validateAndSave($("settings-key-input").value.trim(), $("settings-error")));
  $("disconnect-btn").addEventListener("click", () => {
    $("disconnect-btn").style.display = "none";
    $("disconnect-confirm").style.display = "flex";
  });
  $("disconnect-confirm-cancel").addEventListener("click", () => {
    $("disconnect-confirm").style.display = "none";
    $("disconnect-btn").style.display = "";
  });
  $("disconnect-confirm-yes").addEventListener("click", async () => {
    stopTick();
    const savedTheme = currentTheme;
    await chrome.storage.local.clear();
    await chrome.storage.local.set({ theme: savedTheme }); // keep theme pref
    apiKey = null; timers = {}; notesValue = ""; serverEntry = null;
    $("disconnect-confirm").style.display = "none";
    $("disconnect-btn").style.display = "";
    $("settings-overlay").classList.remove("open");
    showScreen("setup");
  });
  $("save-targets-btn").addEventListener("click", saveTargets);

  // Populate version badge + check for updates
  try {
    const currentVersion = chrome.runtime.getManifest().version;
    const badge = $("settings-version-badge");
    if (badge) badge.textContent = `v${currentVersion}`;

    // Fetch latest version from server (fire-and-forget, no auth needed)
    fetch(`${API_BASE}/api/extension/version`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.version) return;
        const latest  = data.version;
        const current = currentVersion;
        // Simple semver-style comparison (major.minor.patch)
        const toNum = v => v.split(".").reduce((acc, n, i) => acc + parseInt(n, 10) * Math.pow(1000, 2 - i), 0);
        if (toNum(latest) > toNum(current)) {
          // Show red dot on gear icon
          const gear = $("settings-gear-btn");
          if (gear && !gear.querySelector(".update-dot")) {
            const dot = document.createElement("span");
            dot.className = "update-dot";
            dot.style.cssText = "position:absolute;top:4px;right:4px;width:7px;height:7px;border-radius:50%;background:var(--red);pointer-events:none;";
            gear.style.position = "relative";
            gear.appendChild(dot);
          }
          // Show update card in Settings
          const card  = $("settings-update-card");
          const label = $("settings-update-new-ver");
          const link  = $("settings-update-dl-link");
          if (card)  card.style.display = "flex";
          if (label) label.textContent  = `v${latest}`;
          if (link && data.downloadUrl)  link.href = `${API_BASE}${data.downloadUrl}`;
        }
      })
      .catch(() => {/* silently ignore network errors */});
  } catch (_) {}

  // Swipe File panel — three capture buttons
  $("swipe-btn-fullpage").addEventListener("click", swipeCaptureFullPage);
  $("swipe-btn-visible").addEventListener("click", swipeCaptureVisibleArea);
  $("swipe-btn-section").addEventListener("click", swipeCaptureSection);

  // Suspended screen — "Check Again" button triggers an immediate live re-check.
  // The service-worker alarm continues running independently in the background.
  $("suspended-check-btn")?.addEventListener("click", async () => {
    const btn = $("suspended-check-btn");
    const msg = $("suspended-check-msg");
    if (!btn || !apiKey) return;

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:var(--accent)"></span> Checking…`;
    if (msg) { msg.textContent = ""; msg.className = "suspended-check-msg"; }

    try {
      const data = await apiFetch("/api/v1/membership/check", { method: "POST" });
      if (data.enrolled) {
        // Membership restored — loadDMO() will call showScreen("main") which
        // sends STOP_SUSPENDED_CHECK to the SW to cancel the background alarm.
        await loadDMO();
      } else {
        if (msg) { msg.textContent = "Still inactive — contact support"; msg.className = "suspended-check-msg error"; }
        btn.disabled = false;
        btn.innerHTML = "🔄 Check Again";
      }
    } catch {
      if (msg) { msg.textContent = "Check failed — try again later"; msg.className = "suspended-check-msg error"; }
      btn.disabled = false;
      btn.innerHTML = "🔄 Check Again";
    }
  });

  // Suspended screen — disconnect clears everything
  $("suspended-disconnect")?.addEventListener("click", async () => {
    stopTick();
    const savedTheme = currentTheme;
    await chrome.storage.local.clear();
    await chrome.storage.local.set({ theme: savedTheme });
    apiKey = null; timers = {}; notesValue = ""; serverEntry = null;
    showScreen("setup");
  });

  // Gear icon → open settings overlay; back arrow → close it
  $("settings-gear-btn").addEventListener("click", () => {
    const el = $("settings-key-input");
    if (el && apiKey) el.value = apiKey;
    const errEl = $("settings-error");
    if (errEl) errEl.style.display = "none";
    $("settings-overlay").classList.add("open");
  });
  $("settings-ovl-close").addEventListener("click", () => {
    $("settings-overlay").classList.remove("open");
  });

  // Listen for MEMBERSHIP_RESTORED pushed by the service-worker alarm.
  // Uses chrome.runtime.onMessage — the correct MV3 extension messaging API.
  // Fires when the background alarm detects restored membership while the popup is open.
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "MEMBERSHIP_RESTORED") {
      loadDMO();
    }
  });

  // Load API key and go — cache-first so the popup feels instant
  if (stored.apiKey) {
    apiKey = stored.apiKey;
    if (stored.targets) targets = stored.targets;

    if (stored.cachedDmo?.dmoData) {
      // Show UI immediately from last cached response (~0ms), then refresh in background
      await applyDmoData(stored.cachedDmo.dmoData, stored.cachedDmo.settingsData);
      showScreen("main");
      loadDMO(true).catch(() => {}); // silent background refresh
    } else {
      // First-ever open — must wait for the network
      await loadDMO();
    }

    // Restore whichever tab the user was on last
    if (stored.lastPrimaryTab) switchPrimaryTab(stored.lastPrimaryTab);
    if (stored.lastSubTab) switchSubTab(stored.lastSubTab);

    // If the SW auto-saved a capture while the popup was closed, override to the
    // Swipe tab so the user sees the new item (this runs after restore, so it wins).
    try {
      const sess = await chrome.storage.session.get("swipeRecentlySaved");
      if (sess.swipeRecentlySaved) {
        await chrome.storage.session.remove("swipeRecentlySaved");
        switchPrimaryTab("swipe");
        swipeShowStatus("✓ Saved to your Swipe File!", 3000);
      }
    } catch (_) {}
  } else {
    showScreen("setup");
  }
}

document.addEventListener("DOMContentLoaded", boot);
