// Standalone teleprompter window opener.
// Reused by the Scripts tool (with labeled 5-part sections) and the
// standalone Teleprompter tool (single text block, no labels).

export type TeleprompterSection = {
  label?: string;
  color?: string;
  text: string;
};

export function buildTeleprompterHtml(opts: { title: string; sections: TeleprompterSection[]; scriptId?: string; bulletPoints?: string; baseUrl?: string }): string {
  const { title, sections, scriptId, bulletPoints, baseUrl } = opts;
  const cleaned = sections.filter((s) => s.text && s.text.trim());
  if (cleaned.length === 0) return "";

  const esc = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const bulletsHtml = (() => {
    if (!bulletPoints) return "";
    const lines = bulletPoints.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return "";
    // First non-bullet line = hook, last non-bullet line = cta, rest = bullets
    const firstNonBullet = lines.findIndex((l) => !l.startsWith("•"));
    const lastNonBullet = lines.length - 1 - [...lines].reverse().findIndex((l) => !l.startsWith("•"));
    return lines.map((l, i) => {
      if (!l.startsWith("•") && i === firstNonBullet) return `<div class="bullet-hook">${esc(l)}</div>`;
      if (!l.startsWith("•") && i === lastNonBullet && lastNonBullet !== firstNonBullet) return `<div class="bullet-cta">${esc(l)}</div>`;
      return `<div class="bullet-line">${esc(l)}</div>`;
    }).join("");
  })();

  const sectionsHtml = cleaned
    .map((s) => {
      const labelHtml = s.label
        ? `<div class="section-label" style="color:${s.color || "#fff"}">${esc(s.label)}</div>`
        : "";
      return `<div class="section">${labelHtml}<p class="section-text">${esc(s.text)}</p></div>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Teleprompter — ${esc(title)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{height:100%;background:#0a0a0a;color:#fff;font-family:Georgia,"Times New Roman",serif;overflow:hidden;display:flex;flex-direction:column}

    /* ── Controls bar (lives inside left column) ── */
    #controls{
      flex-shrink:0;display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;
      padding:8px 16px;background:#0a0a0a;border-top:1px solid #1a1a1a;
    }
    /* ── Topic title (top of right column, above format picker) ── */
    #cam-title{flex-shrink:0;text-align:center;padding:7px 12px;font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:rgba(255,255,255,.75);background:#0d0d0d;border-bottom:1px solid #1e1e1e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.03em}
    #speedWrap{display:flex;flex-direction:column;align-items:center;gap:3px}
    #speedLabel{font-family:Arial,sans-serif;font-size:10px;color:rgba(255,255,255,.4);letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
    #speedSlider{width:100px;cursor:pointer;accent-color:#fff;height:4px;border-radius:2px}
    #playBtn{font-family:Arial,sans-serif;font-size:13px;font-weight:700;padding:7px 22px;border-radius:999px;border:none;cursor:pointer;background:#fff;color:#000;transition:.15s;margin-left:4px}
    #playBtn:hover{background:#e5e5e5}
    #resetBtn{font-family:Arial,sans-serif;font-size:12px;padding:5px 12px;border-radius:999px;border:none;cursor:pointer;background:rgba(255,255,255,.08);color:rgba(255,255,255,.5);transition:.15s}
    #resetBtn:hover{background:rgba(255,255,255,.18);color:#fff}
    .font-btn{font-family:Arial,sans-serif;font-size:13px;font-weight:700;width:30px;height:28px;border-radius:999px;border:none;cursor:pointer;background:rgba(255,255,255,.12);color:rgba(255,255,255,.75);transition:.15s;display:inline-flex;align-items:center;justify-content:center}
    .font-btn:hover{background:rgba(255,255,255,.22);color:#fff}
    .font-btn:disabled{opacity:.3;cursor:not-allowed}
    #fontLabel{font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,.55);min-width:54px;text-align:center;white-space:nowrap}
    /* ── Main two-panel layout ── */
    #main{flex:1;display:flex;overflow:hidden;min-height:0;padding-right:16px}

    /* ── Left: teleprompter ── */
    #left{flex:1;display:flex;flex-direction:column;min-width:0;overflow:hidden;position:relative}

    /* ── Centered countdown overlay ── */
    #rec-countdown{display:none;position:absolute;inset:0;align-items:center;justify-content:center;pointer-events:none;z-index:20}
    #rec-cd-card{background:rgba(0,0,0,.88);border-radius:20px;padding:24px 52px 20px;display:flex;flex-direction:column;align-items:center;gap:6px;box-shadow:0 8px 48px rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.08)}
    #rec-cd-num{font-family:Arial,sans-serif;font-size:110px;font-weight:900;color:#fff;line-height:1;animation:cdPulse .9s ease-in-out infinite}
    #rec-cd-label{font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.55)}
    @keyframes cdPulse{0%{transform:scale(.88);opacity:.7}45%{transform:scale(1.04);opacity:1}55%{transform:scale(1.04);opacity:1}100%{transform:scale(.88);opacity:.7}}
    #scroller{flex:1;overflow-y:scroll;padding:12px 60px 0;scrollbar-width:none}
    #scroller::-webkit-scrollbar{display:none}
    .section{margin-bottom:72px}
    .section-label{font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;margin-bottom:20px}
    .section-text{font-size:var(--text-size,32px);line-height:1.85;white-space:pre-wrap;color:#fff}
    .bottom-pad{height:80vh}
    #hint{flex-shrink:0;text-align:center;padding:5px 10px;font-family:monospace;font-size:10px;color:rgba(255,255,255,.6);background:#0a0a0a;border-top:1px solid #1a1a1a;border-bottom:1px solid #1a1a1a}

    /* ── Right: camera panel ── */
    #camera-panel{width:35%;flex-shrink:0;background:#111;border-left:1px solid #1e1e1e;display:flex;flex-direction:column}

    /* ── Format picker ── */
    #format-picker{flex-shrink:0;display:flex;justify-content:center;gap:4px;padding:7px 10px 6px;background:#0d0d0d;border-bottom:1px solid #1e1e1e}
    .fmt-btn{display:flex;flex-direction:column;align-items:center;gap:4px;font-family:Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.35);background:transparent;border:1px solid transparent;border-radius:6px;cursor:pointer;padding:5px 9px;transition:.15s;min-width:56px}
    .fmt-btn:hover{color:rgba(255,255,255,.7);background:rgba(255,255,255,.06)}
    .fmt-btn.active{color:#fff;background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2)}
    .fmt-btn.locked{opacity:.3;cursor:not-allowed;pointer-events:none}
    .fmt-icon-wrap{display:flex;align-items:center;justify-content:center;height:28px;width:100%;flex-shrink:0}
    .fmt-icon{display:block;border:2px solid currentColor;border-radius:2px}
    .fmt-icon-land{width:28px;height:16px}
    .fmt-icon-port{width:14px;height:28px}
    .fmt-icon-sq{width:22px;height:22px}

    /* ── Device selector bar ── */
    #device-bar{flex-shrink:0;display:none;flex-direction:column;gap:5px;padding:7px 10px;background:#0d0d0d;border-bottom:1px solid #1a1a1a}
    #device-bar.vis{display:flex}
    .dev-row{display:flex;align-items:center;gap:7px}
    .dev-icon{flex-shrink:0;color:rgba(255,255,255,.35)}
    .dev-select{flex:1;background:#1c1c1c;color:rgba(255,255,255,.75);border:1px solid #333;border-radius:6px;font-family:Arial,sans-serif;font-size:11px;padding:5px 6px;cursor:pointer;outline:none;min-width:0;max-width:100%}
    .dev-select option{background:#1c1c1c;color:#fff}
    .dev-select:hover:not(:disabled){border-color:#555;background:#252525}
    .dev-select:disabled{opacity:.35;cursor:not-allowed}
    /* ── Mic level meter ── */
    #mic-meter-row{padding:1px 0 3px}
    #mic-level-track{flex:1;height:5px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden}
    #mic-level-fill{height:100%;width:0%;border-radius:999px;background:linear-gradient(to right,#ef4444 0%,#facc15 50%,#22c55e 100%);transition:width 60ms ease-out}

    /* video area */
    #video-wrap{position:relative;background:#000;overflow:hidden;flex-shrink:0}
    #video-wrap.fmt-landscape{width:100%;aspect-ratio:16/9;align-self:stretch}
    #video-wrap.fmt-portrait{aspect-ratio:9/16;width:auto;height:clamp(180px,40vh,300px);align-self:center}
    #video-wrap.fmt-square{width:100%;aspect-ratio:1/1;align-self:stretch}
    #cam-preview{width:100%;height:100%;object-fit:cover;display:none;transform:scaleX(-1)}
    #cam-playback{width:100%;height:100%;object-fit:cover;display:none;background:#000}
    #cam-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;background:#0d0d0d}
    #cam-placeholder svg{opacity:.15}
    #cam-placeholder span{font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,.2);letter-spacing:.08em}

    /* recording overlay indicators */
    #rec-dot{position:absolute;top:12px;left:14px;display:none;align-items:center;gap:8px;font-family:Arial,sans-serif;font-size:14px;font-weight:800;color:#fff;letter-spacing:.08em;background:#dc2626;padding:5px 12px 5px 10px;border-radius:999px;box-shadow:0 2px 12px rgba(220,38,38,.6)}
    #rec-dot .dot{width:11px;height:11px;border-radius:50%;background:#fff;flex-shrink:0;animation:rec-pulse 1.2s ease-in-out infinite}
    @keyframes rec-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.45);opacity:.55}}
    #rec-timer{position:absolute;top:12px;right:14px;font-family:monospace;font-size:18px;font-weight:700;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.9);display:none;background:rgba(0,0,0,.65);padding:4px 10px;border-radius:6px;letter-spacing:.04em}

    /* cam body */
    #cam-body{flex:1;display:flex;flex-direction:column;padding:16px;gap:10px;overflow-y:auto;min-height:0}
    .cam-section{display:none;flex-direction:column;gap:10px}
    .cam-section.active{display:flex}
    .cam-msg{font-family:Arial,sans-serif;font-size:12px;color:rgba(255,255,255,.5);line-height:1.55}
    .cam-msg.success{color:#34d399;font-weight:700}
    .cam-msg.warn{color:#fbbf24;font-weight:600;font-size:11px}
    .cam-msg.error{color:#f87171}
    .cam-msg.info{color:#60a5fa;font-size:11px}

    /* cam buttons */
    .cam-btn{font-family:Arial,sans-serif;font-size:13px;font-weight:700;padding:10px 14px;border-radius:8px;border:none;cursor:pointer;transition:.15s;display:flex;align-items:center;justify-content:center;gap:6px;width:100%}
    .cam-btn-white{background:#fff;color:#000}
    .cam-btn-white:hover{background:#e5e5e5}
    .cam-btn-red{background:#ef4444;color:#fff}
    .cam-btn-red:hover{background:#dc2626}
    .cam-btn-dark{background:rgba(255,255,255,.08);color:rgba(255,255,255,.75);border:1px solid rgba(255,255,255,.1)}
    .cam-btn-dark:hover{background:rgba(255,255,255,.16);color:#fff}
    .cam-btn-green{background:#10b981;color:#fff}
    .cam-btn-green:hover{background:#059669}

    /* upload spinner */
    .upload-spinner{width:48px;height:48px;border:4px solid rgba(255,255,255,.1);border-top-color:#10b981;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 10px}
    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes bar-glow{0%,100%{box-shadow:0 0 10px rgba(16,185,129,.5)}50%{box-shadow:0 0 22px rgba(16,185,129,.85)}}

    #cam-footer{flex-shrink:0;padding:6px 12px;font-family:monospace;font-size:9px;color:#222;border-top:1px solid #1a1a1a;text-align:center}
    #download-info{font-family:monospace;font-size:11px;color:rgba(255,255,255,.3)}

    /* ── Script / Bullets tabs ── */
    #view-tabs{flex-shrink:0;display:flex;justify-content:center;gap:8px;padding:6px 24px 10px;background:#0a0a0a;border-top:1px solid #1a1a1a}
    .view-tab{font-family:Arial,sans-serif;font-size:12px;font-weight:700;padding:6px 20px;border-radius:999px;border:none;cursor:pointer;transition:.15s;letter-spacing:.03em}
    .view-tab.active{background:#fff;color:#000}
    .view-tab:not(.active){background:rgba(255,255,255,.1);color:rgba(255,255,255,.5)}
    .view-tab:hover:not(.active){background:rgba(255,255,255,.2);color:rgba(255,255,255,.9)}
    #bullets-view{flex:1;overflow-y:auto;padding:40px 60px 0;scrollbar-width:none;display:none}
    #bullets-view::-webkit-scrollbar{display:none}
    .bullet-line{font-size:var(--text-size,32px);line-height:2.2;color:#fff;white-space:pre-wrap;border-bottom:1px solid rgba(255,255,255,.06);padding-bottom:8px;margin-bottom:8px}
    .bullet-line:last-child{border-bottom:none}
    .bullet-hook{font-size:var(--text-size,32px);line-height:1.8;color:#facc15;font-weight:700;white-space:pre-wrap;border-bottom:2px solid rgba(250,204,21,.25);padding-bottom:12px;margin-bottom:16px}
    .bullet-cta{font-size:var(--text-size,32px);line-height:1.8;color:#4ade80;font-weight:700;white-space:pre-wrap;border-top:2px solid rgba(74,222,128,.25);padding-top:12px;margin-top:8px}

    /* ── Resizable divider ── */
    #resizer{width:8px;flex-shrink:0;background:rgba(255,255,255,.08);border-left:1px solid rgba(255,255,255,.15);border-right:1px solid rgba(255,255,255,.15);cursor:col-resize;position:relative;transition:background .15s;z-index:10}
    #resizer:hover,#resizer.dragging{background:rgba(255,255,255,.18)}
    #resizer::after{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);height:56px;width:4px;border-radius:999px;background:rgba(255,255,255,.45);transition:background .15s}
    #resizer:hover::after,#resizer.dragging::after{background:rgba(255,255,255,.85)}

    /* ── Layout toggle (PiP / Side by Side) ── */
    .layout-row{display:flex;gap:6px}
    .layout-btn{flex:1;font-family:Arial,sans-serif;font-size:11px;font-weight:700;padding:7px 6px;border-radius:7px;border:1px solid rgba(255,255,255,.15);cursor:pointer;transition:.15s;background:rgba(255,255,255,.06);color:rgba(255,255,255,.5)}
    .layout-btn:hover:not(.active){background:rgba(255,255,255,.12);color:rgba(255,255,255,.85)}
    .layout-btn.active{background:rgba(255,255,255,.15);color:#fff;border-color:rgba(255,255,255,.35)}
    /* ── Canvas composite (screen share preview) ── */
    #canvas-composite{display:none;position:absolute;inset:0;width:100%;height:100%}
    /* ── Screen sharing indicator badge ── */
    #screen-indicator{position:absolute;bottom:12px;left:14px;display:none;align-items:center;gap:5px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#fff;background:rgba(59,130,246,.9);padding:4px 10px 4px 8px;border-radius:999px;box-shadow:0 2px 8px rgba(59,130,246,.5);z-index:6}
    /* ── Ready section sub-views ── */
    .ready-sub{display:flex;flex-direction:column;gap:10px}
  </style>
</head>
<body>
  <!-- ── Main area ── -->
  <div id="main">

    <!-- Left: scrolling script / bullets -->
    <div id="left">
      <!-- Centered countdown overlay -->
      <div id="rec-countdown">
        <div id="rec-cd-card">
          <span id="rec-cd-label">Starting in…</span>
          <span id="rec-cd-num">5</span>
        </div>
      </div>
      <div id="scroller">
        ${sectionsHtml}
        <div class="bottom-pad"></div>
      </div>
      <div id="bullets-view">
        ${bulletsHtml || '<div style="font-family:Arial,sans-serif;color:rgba(255,255,255,.25);font-size:16px;padding:20px 0">No bullet points added yet — save bullet points from the editor first.</div>'}
        <div class="bottom-pad"></div>
      </div>
      <div id="view-tabs">
        <button class="view-tab active" id="tab-script" onclick="switchView('script')">&#x1F4C4; Script</button>
        <button class="view-tab" id="tab-bullets" onclick="switchView('bullets')">&#x2022; Bullets</button>
      </div>
      <div id="hint">Space = play/pause &nbsp;·&nbsp; ↑ / ↓ = faster / slower &nbsp;·&nbsp; +/− = font size</div>
      <div id="controls">
        <div id="speedWrap">
          <span id="speedLabel">Scroll Speed</span>
          <input type="range" id="speedSlider" min="1" max="8" value="3" step="1">
        </div>
        <button class="font-btn" id="fontDown" onclick="changeFont(-1)" title="Smaller text">A−</button>
        <span id="fontLabel">Medium</span>
        <button class="font-btn" id="fontUp" onclick="changeFont(1)" title="Larger text">A+</button>
        <button id="resetBtn" onclick="resetScroll()">↺ Restart</button>
        <button id="playBtn" onclick="togglePlay()">▶ Play</button>
      </div>
    </div>

    <!-- Draggable divider -->
    <div id="resizer" title="Drag to resize"></div>

    <!-- Right: camera + recording -->
    <div id="camera-panel">
      <!-- Topic / keyword title — top of the right column, near the window close button -->
      <div id="cam-title">${esc(title)}</div>
      <!-- Format picker -->
      <div id="format-picker">
        <button class="fmt-btn active" id="fmt-btn-landscape" onclick="setFormat('landscape')" title="YouTube · Facebook · 16:9">
          <span class="fmt-icon-wrap"><span class="fmt-icon fmt-icon-land"></span></span>YouTube 16:9
        </button>
        <button class="fmt-btn" id="fmt-btn-portrait" onclick="setFormat('portrait')" title="TikTok · Instagram Reels · 9:16">
          <span class="fmt-icon-wrap"><span class="fmt-icon fmt-icon-port"></span></span>Portrait 9:16
        </button>
        <button class="fmt-btn" id="fmt-btn-square" onclick="setFormat('square')" title="Instagram Feed · Square · 1:1">
          <span class="fmt-icon-wrap"><span class="fmt-icon fmt-icon-sq"></span></span>Square 1:1
        </button>
      </div>
      <!-- Video area -->
      <div id="video-wrap" class="fmt-landscape">
        <div id="cam-placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
            <path d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
          </svg>
          <span>CAMERA</span>
        </div>
        <video id="cam-preview" autoplay muted playsinline></video>
        <video id="cam-playback" controls></video>
        <!-- Canvas composite for PiP / Side-by-Side screen sharing -->
        <canvas id="canvas-composite"></canvas>
        <!-- Hidden video element that plays the screen share stream (used as canvas draw source) -->
        <video id="screen-vid-hidden" autoplay muted playsinline style="position:absolute;pointer-events:none;opacity:0;width:1px;height:1px;top:0;left:0"></video>
        <div id="rec-dot"><span class="dot"></span><span>REC</span></div>
        <div id="rec-timer">0:00</div>
        <!-- Screen sharing badge (shown during recording) -->
        <div id="screen-indicator">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          Screen Sharing
        </div>
      </div>

      <!-- Device selector (camera + mic) — visible once camera is active -->
      <div id="device-bar">
        <div class="dev-row">
          <svg class="dev-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
          <select id="cam-select" class="dev-select" onchange="switchCamera(this.value)">
            <option>Loading cameras\u2026</option>
          </select>
        </div>
        <div class="dev-row">
          <svg class="dev-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>
          <select id="mic-select" class="dev-select" onchange="switchMic(this.value)">
            <option>Loading microphones\u2026</option>
          </select>
        </div>
        <!-- Microphone level meter (red → yellow → green) -->
        <div id="mic-meter-row" class="dev-row">
          <svg class="dev-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.35"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>
          <div id="mic-level-track"><div id="mic-level-fill"></div></div>
        </div>
      </div>

      <!-- State-driven controls -->
      <div id="cam-body">

        <!-- IDLE: prompt to enable camera -->
        <div id="cam-idle" class="cam-section active">
          <p class="cam-msg">Record a take while you read your script. Your video will be saved to your account automatically.</p>
          <div id="unsupported-msg" style="display:none;font-family:Arial,sans-serif;font-size:12px;color:#f87171">Recording is not supported in this browser. Try Chrome, Edge, or Firefox.</div>
          <button class="cam-btn cam-btn-white" onclick="requestCamera()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
            Enable Camera &amp; Mic
          </button>
        </div>

        <!-- LOADING -->
        <div id="cam-loading" class="cam-section">
          <p class="cam-msg">Requesting camera access…</p>
        </div>

        <!-- DENIED -->
        <div id="cam-denied" class="cam-section">
          <p id="denied-msg" class="cam-msg error"></p>
          <p class="cam-msg" style="margin-top:2px">Check your browser's camera permissions and try again.</p>
          <button class="cam-btn cam-btn-dark" onclick="requestCamera()">Try Again</button>
        </div>

        <!-- READY -->
        <div id="cam-ready" class="cam-section">
          <p class="cam-msg" id="ready-msg">Camera ready. Hit record when you're set.</p>
          <button class="cam-btn cam-btn-red" onclick="startRecording()">
            <span style="font-size:9px">●</span> Start Recording
          </button>
          <!-- Screen share controls — always available below the record button -->
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:2px">
            <button class="cam-btn cam-btn-dark" id="ready-share-btn" onclick="requestScreenShare()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              Share Screen
            </button>
            <!-- Layout toggle — appears after screen sharing is active -->
            <div id="ready-layout-row" class="layout-row" style="display:none">
              <button id="ready-layout-pip" class="layout-btn active" onclick="setScreenLayout('pip')">Picture-in-Picture</button>
              <button id="ready-layout-sbs" class="layout-btn" onclick="setScreenLayout('sidebyside')">Side by Side</button>
            </div>
            <!-- PiP camera size — only shown in PiP mode -->
            <div id="ready-pip-size-row" class="layout-row" style="display:none">
              <button id="ready-pip-large" class="layout-btn active" onclick="setPipSize('large')">Large</button>
              <button id="ready-pip-small" class="layout-btn" onclick="setPipSize('small')">Small</button>
              <button id="ready-pip-circle" class="layout-btn" onclick="setPipSize('circle')">Circle</button>
            </div>
            <button class="cam-btn cam-btn-dark" id="ready-stop-share-btn" style="display:none" onclick="stopScreenShare()">
              &#x2715; Stop Screen Sharing
            </button>
          </div>
        </div>

        <!-- RECORDING -->
        <div id="cam-recording" class="cam-section">
          <p class="cam-msg" id="rec-mode-msg">Recording in progress…</p>
          <button class="cam-btn cam-btn-dark" onclick="stopRecording()">
            <span style="font-size:9px">■</span> Stop Recording
          </button>
          <!-- Screen share toggle — always available during recording -->
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:2px">
            <button id="rec-share-btn" class="cam-btn cam-btn-dark" onclick="requestScreenShare()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
              Add Screen Share
            </button>
            <!-- Layout toggle — appears when screen is active -->
            <div id="rec-layout-row" class="layout-row" style="display:none">
              <button id="rec-layout-pip" class="layout-btn active" onclick="setScreenLayout('pip')">Picture-in-Picture</button>
              <button id="rec-layout-sbs" class="layout-btn" onclick="setScreenLayout('sidebyside')">Side by Side</button>
            </div>
            <!-- PiP camera size — only shown in PiP mode -->
            <div id="rec-pip-size-row" class="layout-row" style="display:none">
              <button id="rec-pip-large" class="layout-btn active" onclick="setPipSize('large')">Large</button>
              <button id="rec-pip-small" class="layout-btn" onclick="setPipSize('small')">Small</button>
              <button id="rec-pip-circle" class="layout-btn" onclick="setPipSize('circle')">Circle</button>
            </div>
            <button id="rec-stop-share-btn" class="cam-btn cam-btn-dark" style="display:none" onclick="stopScreenShare()">
              &#x2715; Remove Screen Share
            </button>
          </div>
        </div>

        <!-- UPLOADING -->
        <div id="cam-uploading" class="cam-section" style="gap:6px">
          <div class="upload-spinner"></div>
          <p style="font-family:Arial,sans-serif;font-size:22px;font-weight:800;color:#fff;text-align:center;margin:0;letter-spacing:-.01em">Video Uploading…</p>
          <p style="font-family:Arial,sans-serif;font-size:13px;color:#fbbf24;font-weight:700;text-align:center;margin:0 0 6px;line-height:1.4">⚠&nbsp; Do NOT close or refresh this window</p>
          <div style="background:rgba(255,255,255,.12);border-radius:999px;height:20px;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.07)">
            <div id="upload-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#059669,#10b981,#34d399);border-radius:999px;transition:width .5s ease;animation:bar-glow 1.8s ease-in-out infinite"></div>
          </div>
          <div style="text-align:center;margin:2px 0 4px">
            <span id="upload-pct" style="font-family:monospace;font-size:32px;font-weight:800;color:#10b981;line-height:1">0%</span>
          </div>
          <p style="font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,.35);text-align:center;margin:0;line-height:1.5">Your take is being saved to the cloud.<br>Large videos may take a minute or two.</p>
        </div>

        <!-- REVIEW -->
        <div id="cam-review" class="cam-section">
          <div id="review-cloud-msg"></div>
          <button id="retry-upload-btn" class="cam-btn cam-btn-dark" style="display:none;margin-bottom:4px" onclick="retryUpload()">↑ Retry Upload</button>
          <p class="cam-msg warn" id="review-warn">⚠ Download before closing this window.</p>
          <div id="download-info"></div>
          <button class="cam-btn cam-btn-green" onclick="downloadRecording()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Download Video
          </button>
          <button class="cam-btn cam-btn-dark" style="margin-top:2px" onclick="retake()">↺ Record Another Take</button>
        </div>

      </div>
      <div id="cam-footer">saves to your account for 30 days · download any time from your teleprompter page</div>
    </div>

  </div>

  <script>
    window.onerror=function(msg,src,line){
      var d=document.getElementById('_err_banner');
      if(!d){d=document.createElement('div');d.id='_err_banner';d.style.cssText='position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:8px 14px;z-index:9999;font-family:monospace;font-size:11px;word-break:break-word';document.body.appendChild(d);}
      d.textContent='JS Error (line '+line+'): '+msg;
    };
  <\/script>
  <script>
    /* ══════════════════════════════════════════
       TELEPROMPTER LOGIC
    ══════════════════════════════════════════ */
    var SPEEDS=[6,12,20,28,38,50,65,85];
    var playing=false,hasStarted=false,speed=SPEEDS[2],lastTime=null,raf=null,scrollAccum=0,cdTimer=null;
    var scroller=document.getElementById('scroller');
    var playBtn=document.getElementById('playBtn');
    var recCdEl=document.getElementById('rec-countdown');
    var recCdNumEl=document.getElementById('rec-cd-num');
    var recCdLabel=document.getElementById('rec-cd-label');
    var fontLabel=document.getElementById('fontLabel');
    var fontDown=document.getElementById('fontDown');
    var fontUp=document.getElementById('fontUp');
    var speedSlider=document.getElementById('speedSlider');

    try{
      var sv=parseInt(localStorage.getItem('teleprompter:speedLevel')||'',10);
      if(!isNaN(sv)&&sv>=1&&sv<=8){speedSlider.value=sv;speed=SPEEDS[sv-1];}
    }catch(e){}

    speedSlider.addEventListener('input',function(){
      var lv=parseInt(this.value,10);speed=SPEEDS[lv-1];
      try{localStorage.setItem('teleprompter:speedLevel',String(lv));}catch(e){}
    });

    function stepSpeed(d){
      var nx=Math.min(8,Math.max(1,parseInt(speedSlider.value,10)+d));
      speedSlider.value=nx;speed=SPEEDS[nx-1];
      try{localStorage.setItem('teleprompter:speedLevel',String(nx));}catch(e){}
    }

    var FONT_SIZES=[{px:24,name:'Small'},{px:32,name:'Medium'},{px:44,name:'Large'},{px:56,name:'X-Large'},{px:72,name:'XX-Large'}];
    var fontIdx=1;
    try{
      var sf=parseInt(localStorage.getItem('teleprompter:fontSizeIdx')||'',10);
      if(!isNaN(sf)&&sf>=0&&sf<FONT_SIZES.length)fontIdx=sf;
    }catch(e){}
    function applyFont(){
      var f=FONT_SIZES[fontIdx];
      document.documentElement.style.setProperty('--text-size',f.px+'px');
      fontLabel.textContent=f.name;
      fontDown.disabled=(fontIdx===0);
      fontUp.disabled=(fontIdx===FONT_SIZES.length-1);
      try{localStorage.setItem('teleprompter:fontSizeIdx',String(fontIdx));}catch(e){}
    }
    function changeFont(d){var nx=fontIdx+d;if(nx<0||nx>=FONT_SIZES.length)return;fontIdx=nx;applyFont();}
    applyFont();

    function hideCountdown(){
      if(cdTimer){clearInterval(cdTimer);cdTimer=null;}
      recCdEl.style.display='none';
      // Always unlock the recording button so it's never permanently stuck
      recCdActive=false;
    }
    function resetScroll(){
      playing=false;hasStarted=false;if(raf){cancelAnimationFrame(raf);raf=null;}
      hideCountdown();lastTime=null;scrollAccum=0;scroller.scrollTop=0;playBtn.textContent='▶ Play';
    }
    function startCountdown(onDone,label){
      // Clear any in-progress countdown before starting a new one — prevents
      // leaked intervals if Play and Record countdowns stack on top of each other.
      if(cdTimer){clearInterval(cdTimer);cdTimer=null;}
      var count=5;recCdNumEl.textContent=count;recCdLabel.textContent=label||'';recCdEl.style.display='flex';
      cdTimer=setInterval(function(){
        count--;
        if(count<=0){hideCountdown();if(onDone)onDone();}
        else recCdNumEl.textContent=count;
      },1000);
    }
    function togglePlay(){
      playing=!playing;
      if(playing){
        playBtn.textContent='⏸ Pause';if(raf){cancelAnimationFrame(raf);raf=null;}
        if(!hasStarted){
          startCountdown(function(){if(playing){hasStarted=true;lastTime=null;scrollAccum=0;raf=requestAnimationFrame(tick);}},'Scroll starts in…');
        }else{lastTime=null;raf=requestAnimationFrame(tick);}
      }else{playBtn.textContent='▶ Play';if(raf){cancelAnimationFrame(raf);raf=null;}hideCountdown();}
    }
    function tick(now){
      if(!playing)return;
      if(lastTime!==null){
        scrollAccum+=speed*(now-lastTime)/1000;
        var px=Math.floor(scrollAccum);
        if(px>=1){scroller.scrollTop+=px;scrollAccum-=px;}
        if(scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-4){
          playing=false;playBtn.textContent='▶ Play';return;
        }
      }
      lastTime=now;raf=requestAnimationFrame(tick);
    }
    document.addEventListener('keydown',function(e){
      if(e.target===speedSlider)return;
      if(e.key===' '){e.preventDefault();togglePlay();}
      if(e.key==='ArrowDown'){e.preventDefault();stepSpeed(-1);}
      if(e.key==='ArrowUp'){e.preventDefault();stepSpeed(1);}
      if(e.key==='r'||e.key==='R')resetScroll();
      if(e.key==='+'||e.key==='='){e.preventDefault();changeFont(1);}
      if(e.key==='-'||e.key==='_'){e.preventDefault();changeFont(-1);}
    });

    /* ══════════════════════════════════════════
       RESIZABLE DIVIDER
    ══════════════════════════════════════════ */
    (function(){
      var resizer=document.getElementById('resizer');
      var camPanel=document.getElementById('camera-panel');
      var isResizing=false,startX=0,startW=0;
      resizer.addEventListener('mousedown',function(e){
        isResizing=true;startX=e.clientX;startW=camPanel.offsetWidth;
        resizer.classList.add('dragging');
        document.body.style.cursor='col-resize';
        document.body.style.userSelect='none';
        e.preventDefault();
      });
      document.addEventListener('mousemove',function(e){
        if(!isResizing)return;
        var dx=startX-e.clientX; // dragging left widens camera panel
        var newW=Math.max(220,Math.min(window.innerWidth*0.65,startW+dx));
        camPanel.style.width=newW+'px';
      });
      document.addEventListener('mouseup',function(){
        if(!isResizing)return;
        isResizing=false;
        resizer.classList.remove('dragging');
        document.body.style.cursor='';
        document.body.style.userSelect='';
      });
    })();

    /* ══════════════════════════════════════════
       CAMERA / RECORDING LOGIC
    ══════════════════════════════════════════ */
    var SCRIPT_ID = ${JSON.stringify(scriptId || "")};
    var SCRIPT_TITLE = ${JSON.stringify(title)};
    var APP_BASE_URL = ${JSON.stringify(baseUrl || "")};
    var BULLET_POINTS = ${JSON.stringify(bulletPoints || "")};

    var activeView='script';
    function switchView(v){
      activeView=v;
      var isScript=(v==='script');
      document.getElementById('scroller').style.display=isScript?'block':'none';
      document.getElementById('bullets-view').style.display=isScript?'none':'block';
      document.getElementById('tab-script').className='view-tab'+(isScript?' active':'');
      document.getElementById('tab-bullets').className='view-tab'+(!isScript?' active':'');
      // Pause auto-scroll and disable play controls when on bullets view
      if(!isScript&&playing)togglePlay();
      playBtn.disabled=!isScript;
      document.getElementById('speedWrap').style.opacity=isScript?'1':'0.3';
      document.getElementById('speedWrap').style.pointerEvents=isScript?'':'none';
    }

    var camState='idle';
    var mediaStream=null,mediaRecorder=null,recordedChunks=[],recordedBlob=null,recordedUrl=null,recMimeType='';
    var timerInterval=null,recSeconds=0;
    var hasUnsaved=false,recordingId=null,recordingTitle=null,uploadFailed=false;
    var selectedFormat='landscape';
    var selectedCameraId='',selectedMicId='';
    var audioCtx=null,audioAnalyser=null,micRaf=null,micLevelFill=null;

    // Screen sharing state
    var screenLayout='pip'; // 'pip' | 'sidebyside' — layout when screen is shared
    var pipSize='large'; // 'large' | 'small' | 'circle' — camera overlay size in PiP mode
    var screenStream=null,compositeStream=null,compositeAnimId=null,screenReady=false,compositing=false;
    var COMPOSITE_W=1920,COMPOSITE_H=1080;

    var camPreview=document.getElementById('cam-preview');
    var camPlayback=document.getElementById('cam-playback');
    var camPlaceholder=document.getElementById('cam-placeholder');
    var recDot=document.getElementById('rec-dot');
    var recTimerEl=document.getElementById('rec-timer');
    var deviceBar=document.getElementById('device-bar');
    var camSelect=document.getElementById('cam-select');
    var micSelect=document.getElementById('mic-select');
    var canvasComposite=document.getElementById('canvas-composite');
    var screenVidHidden=document.getElementById('screen-vid-hidden');
    var screenIndicator=document.getElementById('screen-indicator');

    function setCamState(s){
      camState=s;
      var liveActive=(s==='ready'||s==='recording');
      // placeholder (shows when no video is active)
      camPlaceholder.style.display=(s==='idle'||s==='loading'||s==='denied')?'flex':'none';
      // Show canvas when screen is shared in any live state, or when compositing is
      // running during recording (screen was added mid-take)
      var showCanvas=(screenReady&&liveActive)||(compositing&&s==='recording');
      if(showCanvas){
        camPreview.style.display='none';
        canvasComposite.style.display='block';
      }else{
        camPreview.style.display=liveActive?'block':'none';
        canvasComposite.style.display='none';
      }
      // recorded playback (visible during upload preview + review)
      camPlayback.style.display=(s==='uploading'||s==='review')?'block':'none';
      // REC overlay
      recDot.style.display=(s==='recording')?'flex':'none';
      recTimerEl.style.display=(s==='recording')?'block':'none';
      // screen sharing badge (blue pill) — only visible during recording with screen active
      screenIndicator.style.display=(s==='recording'&&screenReady)?'flex':'none';
      // device bar — show only when camera is active; disable selects while recording
      var devVisible=(s==='ready'||s==='recording');
      deviceBar.className=devVisible?'vis':'';
      camSelect.disabled=(s==='recording'||s==='uploading');
      micSelect.disabled=(s==='recording'||s==='uploading');
      // section panels
      ['idle','loading','denied','ready','recording','uploading','review'].forEach(function(name){
        var el=document.getElementById('cam-'+name);
        if(el)el.className='cam-section'+(name===s?' active':'');
      });
      // update sub-views
      if(s==='ready')updateReadySection();
      if(s==='recording')updateRecordingControls();
    }

    function getSupportedMimeType(){
      var types=['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
      for(var i=0;i<types.length;i++){
        if(typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(types[i]))return types[i];
      }
      return '';
    }

    function setFormat(fmt){
      if(camState==='recording'||camState==='uploading')return;
      if(screenReady)return; // format locked while screen is shared — always landscape
      if(selectedFormat===fmt)return;
      selectedFormat=fmt;
      ['landscape','portrait','square'].forEach(function(f){
        var btn=document.getElementById('fmt-btn-'+f);
        if(btn)btn.className='fmt-btn'+(f===fmt?' active':'');
      });
      document.getElementById('video-wrap').className='fmt-'+fmt;
      // If camera is already running, restart it preserving device selection
      if(camState==='ready'){
        if(mediaStream){mediaStream.getTracks().forEach(function(t){t.stop();});mediaStream=null;}
        camPreview.srcObject=null;
        openCamera(selectedCameraId,selectedMicId);
      }
    }

    // Open the camera with optional specific device IDs.
    // cameraId / micId may be '' to let the browser pick defaults.
    function openCamera(cameraId,micId){
      setCamState('loading');
      if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
        document.getElementById('denied-msg').textContent='Camera API not supported in this browser.';
        setCamState('denied');return;
      }
      var vidConstraints={
        // For landscape (used by screen modes): require at least 720p so the PiP
        // overlay has enough pixels to look sharp; aim for 1080p if the webcam supports it
        landscape:{width:{min:1280,ideal:1920},height:{min:720,ideal:1080}},
        portrait:{width:{min:720,ideal:1080},height:{min:1280,ideal:1920}},
        square:{width:{min:720,ideal:1080},height:{min:720,ideal:1080}}
      }[selectedFormat]||{width:{min:1280,ideal:1920},height:{min:720,ideal:1080}};
      var videoConstraint=Object.assign(cameraId?{deviceId:{exact:cameraId}}:{facingMode:'user'},vidConstraints);
      var audioConstraint=micId?{deviceId:{exact:micId}}:true;
      navigator.mediaDevices.getUserMedia({video:videoConstraint,audio:audioConstraint})
      .then(function(stream){
        mediaStream=stream;
        camPreview.srcObject=stream;
        camPreview.play().catch(function(){});
        setCamState('ready');
        startMicMeter(stream); // start live mic level indicator
        loadDevices(); // populate / refresh dropdowns now that permission is granted
      }).catch(function(err){
        var msg='Camera access was denied.';
        if(err.name==='NotFoundError'||err.name==='DevicesNotFoundError')msg='No camera found on this device.';
        else if(err.name==='NotReadableError'||err.name==='TrackStartError')msg='Camera is in use by another application.';
        else if(err.name==='OverconstrainedError')msg='Camera could not match the requested quality. Try reloading.';
        else if(err.name==='NotAllowedError')msg='Camera permission denied. Click the camera icon in your address bar to allow access.';
        document.getElementById('denied-msg').textContent=msg;
        setCamState('denied');
      });
    }

    function requestCamera(){openCamera('','');}

    // ── Mic level meter ──────────────────────────────────────────────────────
    function stopMicMeter(){
      if(micRaf){cancelAnimationFrame(micRaf);micRaf=null;}
      if(audioCtx){try{audioCtx.close();}catch(e){} audioCtx=null;}
      audioAnalyser=null;
      if(micLevelFill)micLevelFill.style.width='0%';
    }
    function startMicMeter(stream){
      stopMicMeter();
      micLevelFill=document.getElementById('mic-level-fill');
      if(!micLevelFill||!stream)return;
      try{
        audioCtx=new(window.AudioContext||window.webkitAudioContext)();
        audioAnalyser=audioCtx.createAnalyser();
        audioAnalyser.fftSize=256;
        audioAnalyser.smoothingTimeConstant=0.7;
        var src=audioCtx.createMediaStreamSource(stream);
        src.connect(audioAnalyser);
        var buf=new Uint8Array(audioAnalyser.frequencyBinCount);
        function tick(){
          if(!audioAnalyser){return;}
          audioAnalyser.getByteFrequencyData(buf);
          var sum=0;for(var i=0;i<buf.length;i++)sum+=buf[i];
          var avg=sum/buf.length;
          var pct=Math.min(100,avg*1.5); // 0-255 byte avg → normal speech ≈ 65-75%, very loud → 100%
          micLevelFill.style.width=pct+'%';
          micRaf=requestAnimationFrame(tick);
        }
        tick();
      }catch(e){console.warn('[mic-meter]',e);}
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Enumerate all video + audio input devices and populate the dropdowns.
    // Labels are only available after permission has been granted.
    function loadDevices(){
      navigator.mediaDevices.enumerateDevices().then(function(devices){
        var cams=devices.filter(function(d){return d.kind==='videoinput';});
        var mics=devices.filter(function(d){return d.kind==='audioinput';});
        // Find what device IDs the current stream is actually using
        var activeCamId='',activeMicId='';
        if(mediaStream){
          var vt=mediaStream.getVideoTracks();
          var at=mediaStream.getAudioTracks();
          if(vt.length)activeCamId=vt[0].getSettings().deviceId||'';
          if(at.length)activeMicId=at[0].getSettings().deviceId||'';
        }
        if(activeCamId)selectedCameraId=activeCamId;
        if(activeMicId)selectedMicId=activeMicId;
        // Build camera options
        camSelect.innerHTML=cams.length?cams.map(function(d,i){
          var lbl=d.label||('Camera '+(i+1));
          var sel=(d.deviceId===activeCamId)?'selected':'';
          return '<option value="'+d.deviceId+'" '+sel+'>'+lbl+'</option>';
        }).join(''):'<option>No cameras found</option>';
        // Build mic options
        micSelect.innerHTML=mics.length?mics.map(function(d,i){
          var lbl=d.label||('Microphone '+(i+1));
          var sel=(d.deviceId===activeMicId)?'selected':'';
          return '<option value="'+d.deviceId+'" '+sel+'>'+lbl+'</option>';
        }).join(''):'<option>No microphones found</option>';
      }).catch(function(err){
        console.error('[teleprompter] enumerateDevices failed:',err);
      });
    }

    // Switch to a different camera; restart the stream
    function switchCamera(deviceId){
      if(camState!=='ready')return;
      selectedCameraId=deviceId;
      if(mediaStream){mediaStream.getTracks().forEach(function(t){t.stop();});mediaStream=null;}
      camPreview.srcObject=null;
      openCamera(selectedCameraId,selectedMicId);
    }

    // Switch to a different microphone; restart the stream
    function switchMic(deviceId){
      if(camState!=='ready')return;
      selectedMicId=deviceId;
      if(mediaStream){mediaStream.getTracks().forEach(function(t){t.stop();});mediaStream=null;}
      camPreview.srcObject=null;
      openCamera(selectedCameraId,selectedMicId);
    }

    var recCdActive=false;
    function startRecording(){
      if(recCdActive)return;
      if(!mediaStream)return;
      recCdActive=true;
      // Phase 1: countdown → recording starts
      startCountdown(function(){
        recCdActive=false;

        // Decide which stream to record.
        // Screen modes always record from the canvas — that way screen sharing can
        // be toggled on or off freely at any point during the take.
        var streamToRecord;
        if(screenReady){
          // Screen is active: record from canvas so screen sharing can be toggled freely
          if(!compositing)startCompositing();
          var canvasVideoTracks=canvasComposite.captureStream(30).getVideoTracks();
          var micTracks=mediaStream.getAudioTracks();
          compositeStream=new MediaStream(canvasVideoTracks);
          micTracks.forEach(function(t){compositeStream.addTrack(t);});
          streamToRecord=compositeStream;
        }else{
          compositeStream=null;
          streamToRecord=mediaStream;
        }

        recMimeType=getSupportedMimeType();
        var opts=recMimeType?{mimeType:recMimeType}:{};
        try{mediaRecorder=new MediaRecorder(streamToRecord,opts);}
        catch(e){mediaRecorder=new MediaRecorder(streamToRecord);recMimeType=mediaRecorder.mimeType||'video/webm';}

        recordedChunks=[];
        mediaRecorder.ondataavailable=function(e){if(e.data&&e.data.size>0)recordedChunks.push(e.data);};
        mediaRecorder.onstop=function(){
          // Stop compositing when recording is done; playback takes over the panel
          stopCompositing();
          recordedBlob=new Blob(recordedChunks,{type:recMimeType||'video/webm'});
          if(recordedUrl)URL.revokeObjectURL(recordedUrl);
          recordedUrl=URL.createObjectURL(recordedBlob);
          camPlayback.src=recordedUrl;
          hasUnsaved=true;
          clearInterval(timerInterval);
          var mb=(recordedBlob.size/1048576).toFixed(1);
          var ext=(recMimeType&&recMimeType.indexOf('mp4')!==-1)?'.mp4':'.webm';
          document.getElementById('download-info').textContent=mb+' MB \u00b7 '+ext.replace('.','').toUpperCase()+' file';
          setCamState('uploading');
          uploadRecording();
        };

        mediaRecorder.start(1000);
        recSeconds=0;updateRecTimer();
        timerInterval=setInterval(function(){recSeconds++;updateRecTimer();},1000);
        setCamState('recording');

        // Phase 2: silent 5-second pause, then scroll starts
        setTimeout(function(){
          if(!playing){
            playing=true;hasStarted=true;playBtn.textContent='⏸ Pause';
            lastTime=null;scrollAccum=0;raf=requestAnimationFrame(tick);
          }
        },5000);
      },'Recording starts in…');
    }

    function stopRecording(){
      // Also pause the teleprompter scroll when recording stops
      if(playing)togglePlay();
      if(mediaRecorder&&mediaRecorder.state!=='inactive')mediaRecorder.stop();
      clearInterval(timerInterval);
    }

    function updateRecTimer(){
      var m=Math.floor(recSeconds/60),s=recSeconds%60;
      recTimerEl.textContent=m+':'+(s<10?'0':'')+s;
    }

    function uploadRecording(){
      if(!recordedBlob)return;

      var bar=document.getElementById('upload-bar');
      var pct=document.getElementById('upload-pct');

      function onSuccess(data){
        recordingId=data.id;
        recordingTitle=data.title||null;
        uploadFailed=false;
        hasUnsaved=false;
        document.getElementById('review-cloud-msg').innerHTML='<p class="cam-msg success" style="font-size:11px">&#x2601; Saved to your account \u2014 available for 30 days.</p>';
        document.getElementById('retry-upload-btn').style.display='none';
        document.getElementById('review-warn').style.display='none';
        setCamState('review');
        try{if(window.opener)window.opener.postMessage({type:'teleprompter-recording-saved'},'*');if(window.parent&&window.parent!==window)window.parent.postMessage({type:'teleprompter-recording-saved'},'*');}catch(e){}
      }

      function onFail(reason){
        uploadFailed=true;
        var msg=reason||'Cloud save failed';
        document.getElementById('review-cloud-msg').innerHTML='<p class="cam-msg error" style="font-size:11px">\u26a0 '+msg+' \u2014 download below to keep your take.</p>';
        document.getElementById('retry-upload-btn').style.display='block';
        document.getElementById('review-warn').style.display='block';
        setCamState('review');
      }

      // Guard: if the blob is empty the recording failed silently
      if(recordedBlob.size<2000){
        console.error('[teleprompter] recording blob is too small:',recordedBlob.size,'bytes');
        onFail('Recording was empty (codec issue)');
        return;
      }

      // ── chunked upload — direct fetch from iframe ──
      // Blob-URL iframes share the creating page's origin, so fetch() with
      // credentials:"include" sends the session cookie to the same-origin
      // Express server just like the parent page would. No postMessage relay
      // needed. Chunks are ≤ 5 MB each, safely under any ingress size limit.
      // GCS signed-URL direct PUT is NOT used here — that is CORS-blocked.
      (function(){
        var CHUNK_SIZE=5*1024*1024;
        var uploadId=Math.random().toString(36).slice(2)+Date.now().toString(36);
        var totalChunks=Math.ceil(recordedBlob.size/CHUNK_SIZE);
        var ext=(recMimeType&&recMimeType.indexOf('mp4')!==-1)?'.mp4':'.webm';
        var chunkIdx=0;

        function sendNextChunk(){
          if(chunkIdx>=totalChunks){
            // All chunks stored — ask server to assemble and register
            var p=97;if(bar)bar.style.width=p+'%';if(pct)pct.textContent=p+'%';
            fetch((APP_BASE_URL||'')+'/api/teleprompter/recordings/finalize-chunked-upload',{
              method:'POST',
              credentials:'include',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({
                uploadId:uploadId,
                totalChunks:totalChunks,
                title:SCRIPT_TITLE||'Untitled Take',
                scriptId:SCRIPT_ID||'',
                durationSeconds:recSeconds,
                format:selectedFormat,
                mimeType:recMimeType||'video/webm',
                sizeBytes:recordedBlob.size,
              }),
            }).then(function(r){
              if(!r.ok){return r.text().then(function(t){throw new Error('Save failed ('+r.status+')'+(t?': '+t.slice(0,120):''));});}
              return r.json();
            }).then(function(data){
              if(bar)bar.style.width='100%';if(pct)pct.textContent='100%';
              setTimeout(function(){onSuccess(data);},300);
              try{if(window.parent&&window.parent!==window)window.parent.postMessage({type:'teleprompter-recording-saved'},'*');}catch(e){}
            }).catch(function(err){
              onFail(err.message||'Failed to save recording');
            });
            return;
          }

          var p=Math.round(chunkIdx/totalChunks*95);
          if(bar)bar.style.width=p+'%';if(pct)pct.textContent=p+'%';

          var start=chunkIdx*CHUNK_SIZE;
          var end=Math.min(start+CHUNK_SIZE,recordedBlob.size);
          var blob=recordedBlob.slice(start,end);
          var fd=new FormData();
          fd.append('chunk',blob,'chunk-'+chunkIdx+ext);
          fd.append('uploadId',uploadId);
          fd.append('chunkIndex',String(chunkIdx));
          fd.append('totalChunks',String(totalChunks));

          fetch((APP_BASE_URL||'')+'/api/teleprompter/recordings/upload-chunk',{
            method:'POST',
            credentials:'include',
            body:fd,
          }).then(function(r){
            if(!r.ok){return r.text().then(function(t){throw new Error('Chunk '+(chunkIdx+1)+'/'+totalChunks+' failed ('+r.status+')'+(t?': '+t.slice(0,80):''));});}
            return r.json();
          }).then(function(){
            chunkIdx++;
            sendNextChunk();
          }).catch(function(err){
            onFail(err.message||'Upload failed');
          });
        }

        sendNextChunk();
      })();
      return;

      // ── popup window context: direct XHR (session cookie available) ──
      var ext=(recMimeType&&recMimeType.indexOf('mp4')!==-1)?'.mp4':'.webm';
      var fd=new FormData();
      fd.append('video',recordedBlob,'recording'+ext);
      fd.append('title',SCRIPT_TITLE||'Untitled Take');
      if(SCRIPT_ID)fd.append('scriptId',SCRIPT_ID);
      fd.append('durationSeconds',String(recSeconds));
      fd.append('format',selectedFormat);

      var xhr=new XMLHttpRequest();
      xhr.open('POST','/api/teleprompter/recordings',true);
      xhr.withCredentials=true;

      xhr.upload.onprogress=function(e){
        if(!e.lengthComputable)return;
        var p=Math.round(e.loaded/e.total*100);
        if(bar)bar.style.width=p+'%';
        if(pct)pct.textContent=p+'%';
      };

      xhr.onload=function(){
        if(xhr.status<200||xhr.status>=300){
          console.error('[teleprompter] upload failed:',xhr.status,xhr.responseText?xhr.responseText.slice(0,300):'');
          onFail('Upload failed (HTTP '+xhr.status+')');
          return;
        }
        try{onSuccess(JSON.parse(xhr.responseText));}
        catch(e){onFail('Bad response from server');}
      };

      xhr.onerror=function(){
        console.error('[teleprompter] upload network error');
        onFail('Network error during upload');
      };

      xhr.timeout=120000;
      xhr.ontimeout=function(){
        console.error('[teleprompter] upload timed out');
        onFail('Upload timed out — tap Retry Upload to try again');
      };

      xhr.send(fd);
    }

    function retryUpload(){
      uploadFailed=false;
      document.getElementById('retry-upload-btn').style.display='none';
      document.getElementById('review-cloud-msg').innerHTML='';
      var bar=document.getElementById('upload-bar');var pct=document.getElementById('upload-pct');
      if(bar)bar.style.width='0%';if(pct)pct.textContent='0%';
      setCamState('uploading');
      uploadRecording();
    }

    function downloadRecording(){
      // Prefer server-side download if the upload succeeded.
      // Use APP_BASE_URL for the absolute path — this popup runs at a blob: URL so
      // relative paths don't resolve to the server. Also open in a new tab so the
      // download never navigates (and blanks) this popup window.
      if(recordingId){
        var a=document.createElement('a');
        a.href=(APP_BASE_URL||window.location.origin)+'/api/teleprompter/recordings/'+recordingId+'/download';
        a.download='';
        a.target='_blank';
        a.rel='noopener';
        document.body.appendChild(a);a.click();document.body.removeChild(a);
        return;
      }
      // Fallback: download from local blob
      if(!recordedUrl)return;
      var ext=(recMimeType&&recMimeType.indexOf('mp4')!==-1)?'.mp4':'.webm';
      var fallbackName=(recordingTitle||SCRIPT_TITLE||'recording')
        .replace(/\u2014/g,' - ')
        .replace(/[^\w\s().,'&!\-]/g,'')
        .replace(/\s+/g,' ')
        .trim()
        .slice(0,100)||'recording';
      var a=document.createElement('a');
      a.href=recordedUrl;
      a.download=fallbackName+ext;
      document.body.appendChild(a);a.click();document.body.removeChild(a);
      hasUnsaved=false;
    }

    function retake(){
      if(recordedUrl){URL.revokeObjectURL(recordedUrl);recordedUrl=null;}
      recordedBlob=null;recordedChunks=[];hasUnsaved=false;
      recordingId=null;uploadFailed=false;
      camPlayback.src='';
      document.getElementById('review-cloud-msg').innerHTML='';
      document.getElementById('review-warn').style.display='block';
      // Reset progress bar for the next take
      var bar=document.getElementById('upload-bar');
      var pct=document.getElementById('upload-pct');
      if(bar)bar.style.width='0%';
      if(pct)pct.textContent='0%';
      // Restart compositing if still in screen mode with screen shared
      if(screenReady)startCompositing();
      setCamState('ready');
    }

    /* ══════════════════════════════════════════
       SCREEN SHARING — CONTROLS
    ══════════════════════════════════════════ */

    // Update the cam-ready controls to reflect current screen sharing state
    function updateReadySection(){
      var readyMsg=document.getElementById('ready-msg');
      var shareBtn=document.getElementById('ready-share-btn');
      var layoutRow=document.getElementById('ready-layout-row');
      var stopShareBtn=document.getElementById('ready-stop-share-btn');
      if(screenReady){
        if(readyMsg){readyMsg.textContent='\u2713 Screen sharing active \u2014 '+(screenLayout==='pip'?'Picture-in-Picture':'Side by Side')+'.';readyMsg.className='cam-msg success';}
        if(shareBtn)shareBtn.style.display='none';
        if(layoutRow)layoutRow.style.display='flex';
        if(stopShareBtn)stopShareBtn.style.display='';
      }else{
        if(readyMsg){readyMsg.textContent="Camera ready. Hit record when you're set.";readyMsg.className='cam-msg';}
        if(shareBtn)shareBtn.style.display='';
        if(layoutRow)layoutRow.style.display='none';
        if(stopShareBtn)stopShareBtn.style.display='none';
      }
      updateLayoutButtons();
      updatePipSizeButtons();
    }

    // Switch PiP / Side-by-Side layout while screen is shared (works before or during recording)
    function setScreenLayout(layout){
      if(screenLayout===layout)return;
      screenLayout=layout;
      updateLayoutButtons();
      updatePipSizeButtons();
      // frame() reads screenLayout on every tick — no compositing restart needed
    }

    // Change the camera overlay size (only has visual effect in PiP mode)
    function setPipSize(size){
      if(pipSize===size)return;
      pipSize=size;
      updatePipSizeButtons();
    }

    // Sync active state on both the ready-section and recording-section layout buttons
    function updateLayoutButtons(){
      ['pip','sbs'].forEach(function(id){
        var layout=id==='pip'?'pip':'sidebyside';
        var active=screenLayout===layout;
        var rb=document.getElementById('ready-layout-'+id);
        var rc=document.getElementById('rec-layout-'+id);
        if(rb)rb.className='layout-btn'+(active?' active':'');
        if(rc)rc.className='layout-btn'+(active?' active':'');
      });
    }

    // Sync active state on pip-size buttons; show row only when PiP is the active layout
    function updatePipSizeButtons(){
      var showSizeRow=screenReady&&screenLayout==='pip';
      var rr=document.getElementById('ready-pip-size-row');
      var rc2=document.getElementById('rec-pip-size-row');
      if(rr)rr.style.display=showSizeRow?'flex':'none';
      if(rc2)rc2.style.display=showSizeRow?'flex':'none';
      ['large','small','circle'].forEach(function(s){
        var active=pipSize===s;
        var rb2=document.getElementById('ready-pip-'+s);
        var rc3=document.getElementById('rec-pip-'+s);
        if(rb2)rb2.className='layout-btn'+(active?' active':'');
        if(rc3)rc3.className='layout-btn'+(active?' active':'');
      });
    }

    // ── Canvas compositing helpers ────────────────────────────────────────────

    // Draw video onto canvas using object-fit:cover semantics, optionally mirrored
    function drawCover(ctx,video,dx,dy,dw,dh,mirror){
      if(!video||!video.videoWidth||!video.videoHeight)return;
      var vw=video.videoWidth,vh=video.videoHeight;
      var dstAR=dw/dh,srcAR=vw/vh;
      var sx,sy,sw,sh;
      if(srcAR>dstAR){sh=vh;sw=Math.round(vh*dstAR);sy=0;sx=Math.round((vw-sw)/2);}
      else{sw=vw;sh=Math.round(vw/dstAR);sx=0;sy=Math.round((vh-sh)/2);}
      ctx.save();
      if(mirror){
        // Translate to right edge of target, flip, draw from 0
        ctx.translate(dx+dw,dy);ctx.scale(-1,1);
        ctx.drawImage(video,sx,sy,sw,sh,0,0,dw,dh);
      }else{
        ctx.drawImage(video,sx,sy,sw,sh,dx,dy,dw,dh);
      }
      ctx.restore();
    }

    // Draw a rounded rectangle path (ES5 compatible)
    function roundedRectPath(ctx,x,y,w,h,r){
      ctx.beginPath();
      ctx.moveTo(x+r,y);
      ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
      ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
      ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
      ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
      ctx.closePath();
    }

    function stopCompositing(){
      compositing=false;
      if(compositeAnimId){clearInterval(compositeAnimId);compositeAnimId=null;}
    }

    function startCompositing(){
      stopCompositing(); // stop any existing loop
      if(!canvasComposite)return;
      canvasComposite.width=COMPOSITE_W;
      canvasComposite.height=COMPOSITE_H;
      var ctx=canvasComposite.getContext('2d');
      // Use highest quality interpolation for all scaling operations
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality='high';
      compositing=true;

      function frame(){
        if(!compositing)return;
        // Re-apply smoothing each frame — save()/restore() can reset context state
        ctx.imageSmoothingEnabled=true;
        ctx.imageSmoothingQuality='high';
        ctx.clearRect(0,0,COMPOSITE_W,COMPOSITE_H);

        if(screenLayout==='pip'||!screenReady){
          ctx.fillStyle='#000';
          ctx.fillRect(0,0,COMPOSITE_W,COMPOSITE_H);

          if(screenReady&&screenVidHidden.videoWidth){
            // PiP: screen full-frame + camera overlay bottom-right
            drawCover(ctx,screenVidHidden,0,0,COMPOSITE_W,COMPOSITE_H,false);

            if(pipSize==='circle'){
              // Circle overlay — small circle in bottom-right corner
              var cr=Math.round(COMPOSITE_H*0.13);
              var cx=COMPOSITE_W-cr-28;
              var cy=COMPOSITE_H-cr-28;
              ctx.save();
              ctx.beginPath();ctx.arc(cx,cy,cr,0,Math.PI*2);ctx.clip();
              drawCover(ctx,camPreview,cx-cr,cy-cr,cr*2,cr*2,true);
              ctx.restore();
              ctx.save();
              ctx.beginPath();ctx.arc(cx,cy,cr,0,Math.PI*2);
              ctx.strokeStyle='rgba(255,255,255,0.9)';ctx.lineWidth=3;ctx.stroke();
              ctx.restore();
            }else{
              // Large (26%) or Small (16%) rounded-rect overlay
              var pipW=Math.round(COMPOSITE_W*(pipSize==='small'?0.16:0.26));
              var pipH=Math.round(pipW*9/16);
              var pipX=COMPOSITE_W-pipW-24;
              var pipY=COMPOSITE_H-pipH-24;
              var r=10;
              ctx.save();
              roundedRectPath(ctx,pipX,pipY,pipW,pipH,r);
              ctx.clip();
              drawCover(ctx,camPreview,pipX,pipY,pipW,pipH,true);
              ctx.restore();
              ctx.save();
              roundedRectPath(ctx,pipX,pipY,pipW,pipH,r);
              ctx.strokeStyle='rgba(255,255,255,0.9)';
              ctx.lineWidth=3;
              ctx.stroke();
              ctx.restore();
            }
          }else{
            // No screen yet (or screen stopped): camera full-frame so recording continues
            drawCover(ctx,camPreview,0,0,COMPOSITE_W,COMPOSITE_H,true);
          }

        }else if(screenLayout==='sidebyside'){
          ctx.fillStyle='#111';
          ctx.fillRect(0,0,COMPOSITE_W,COMPOSITE_H);

          if(screenReady&&screenVidHidden.videoWidth){
            // Side-by-side: screen left, camera right
            var halfW=COMPOSITE_W/2;
            ctx.save();
            ctx.beginPath();ctx.rect(0,0,halfW,COMPOSITE_H);ctx.clip();
            drawCover(ctx,screenVidHidden,0,0,halfW,COMPOSITE_H,false);
            ctx.restore();
            ctx.save();
            ctx.beginPath();ctx.rect(halfW,0,halfW,COMPOSITE_H);ctx.clip();
            drawCover(ctx,camPreview,halfW,0,halfW,COMPOSITE_H,true);
            ctx.restore();
            ctx.strokeStyle='rgba(255,255,255,0.18)';
            ctx.lineWidth=2;
            ctx.beginPath();ctx.moveTo(halfW,0);ctx.lineTo(halfW,COMPOSITE_H);ctx.stroke();
          }else{
            // No screen: camera full-frame
            ctx.fillStyle='#000';ctx.fillRect(0,0,COMPOSITE_W,COMPOSITE_H);
            drawCover(ctx,camPreview,0,0,COMPOSITE_W,COMPOSITE_H,true);
          }
        }

      }

      // Use setInterval instead of requestAnimationFrame so compositing continues
      // at full speed even when the user switches browser tabs (rAF is throttled in
      // background tabs; setInterval is not throttled when MediaRecorder is active).
      compositeAnimId=setInterval(frame,1000/30);
    }

    // ── Screen share request / teardown ───────────────────────────────────────

    function requestScreenShare(){
      if(!navigator.mediaDevices||!navigator.mediaDevices.getDisplayMedia){
        alert('Screen sharing is not supported in this browser. Please use Chrome, Edge, or Firefox.');
        return;
      }
      if(!canvasComposite.captureStream){
        alert('Canvas recording is not supported in this browser. Please use Chrome or Firefox.');
        return;
      }
      navigator.mediaDevices.getDisplayMedia({
        video:{frameRate:{ideal:30},width:{ideal:1920}},
        audio:false
      }).then(function(stream){
        screenStream=stream;
        screenVidHidden.srcObject=stream;
        screenVidHidden.play().catch(function(){});

        // Handle user clicking the browser's native "Stop sharing" button
        stream.getVideoTracks()[0].addEventListener('ended',function(){
          stopScreenShare();
        });

        screenReady=true;

        // Lock to landscape while screen is shared
        if(selectedFormat!=='landscape'){
          var tmpScreenReady=screenReady;screenReady=false;
          setFormat('landscape');
          screenReady=tmpScreenReady;
        }
        ['portrait','square'].forEach(function(f){
          var b=document.getElementById('fmt-btn-'+f);
          if(b)b.classList.add('locked');
        });

        if(camState==='recording'){
          // Mid-recording: frame() picks up screenReady flag on next tick.
          screenIndicator.style.display='flex';
          updateRecordingControls();
        }else{
          // Pre-recording: start compositing, switch preview to canvas.
          if(!compositing)startCompositing();
          camPreview.style.display='none';
          canvasComposite.style.display='block';
          updateReadySection();
        }
      }).catch(function(err){
        // NotAllowedError and AbortError mean user cancelled — silently ignore
        if(err.name!=='NotAllowedError'&&err.name!=='AbortError'){
          console.warn('[screen-share] getDisplayMedia error:',err.name,err.message);
        }
      });
    }

    function stopScreenShare(){
      if(screenStream){
        screenStream.getTracks().forEach(function(t){t.stop();});
        screenStream=null;
      }
      screenVidHidden.srcObject=null;
      screenReady=false;

      // Unlock portrait/square format buttons
      ['portrait','square'].forEach(function(f){
        var b=document.getElementById('fmt-btn-'+f);
        if(b)b.classList.remove('locked');
      });

      if(camState==='recording'){
        // Mid-recording: compositing keeps running; frame() falls back to camera.
        screenIndicator.style.display='none';
        updateRecordingControls();
      }else{
        // Not recording: tear down compositing and restore camera preview
        stopCompositing();
        canvasComposite.style.display='none';
        if(camState==='ready')camPreview.style.display='block';
        if(camState==='ready')updateReadySection();
      }
    }

    // Update the mid-recording screen share controls
    function updateRecordingControls(){
      var shareBtn=document.getElementById('rec-share-btn');
      var layoutRow=document.getElementById('rec-layout-row');
      var stopShareBtn=document.getElementById('rec-stop-share-btn');
      var recMsg=document.getElementById('rec-mode-msg');
      if(screenReady){
        if(shareBtn)shareBtn.style.display='none';
        if(layoutRow)layoutRow.style.display='flex';
        if(stopShareBtn)stopShareBtn.style.display='';
        if(recMsg)recMsg.textContent='Recording \u2014 screen sharing active.';
      }else{
        if(shareBtn)shareBtn.style.display='';
        if(layoutRow)layoutRow.style.display='none';
        if(stopShareBtn)stopShareBtn.style.display='none';
        if(recMsg)recMsg.textContent='Recording \u2014 camera only. Add screen sharing below.';
      }
      updateLayoutButtons();
      updatePipSizeButtons();
    }

    // Warn before accidental close while recording or uploading
    window.addEventListener('beforeunload',function(e){
      if(hasUnsaved||camState==='uploading'){e.preventDefault();e.returnValue='';}
    });

    // Check MediaRecorder API support
    if(typeof MediaRecorder==='undefined'){
      document.getElementById('unsupported-msg').style.display='block';
    }

    // Boot
    setCamState('idle');
  <\/script>
</body>
</html>`;

  return html;
}

export function openTeleprompter(opts: { title: string; sections: TeleprompterSection[]; scriptId?: string; bulletPoints?: string }): boolean {
  const cleaned = opts.sections.filter((s) => s.text && s.text.trim());
  if (cleaned.length === 0) return false;
  const html = buildTeleprompterHtml(opts);
  const twWidth = Math.min(1440, screen.availWidth - 40);
  const twHeight = Math.min(900, screen.availHeight - 60);
  const twLeft = Math.max(0, Math.round((screen.availWidth - twWidth) / 2));
  const twTop = Math.max(0, Math.round((screen.availHeight - twHeight) / 4));
  const features = [
    "popup=yes",
    `width=${twWidth}`,
    `height=${twHeight}`,
    `left=${twLeft}`,
    `top=${twTop}`,
    "resizable=yes",
    "scrollbars=no",
    "toolbar=no",
    "menubar=no",
    "location=no",
    "status=no",
    "noopener=no",
  ].join(",");
  const tw = window.open("", "teleprompter_window", features);
  if (!tw) return false;
  try {
    tw.resizeTo(twWidth, twHeight);
    tw.moveTo(twLeft, twTop);
  } catch (e) { /* noop — blocked in some browsers */ }
  tw.document.write(html);
  tw.document.close();
  return true;
}
