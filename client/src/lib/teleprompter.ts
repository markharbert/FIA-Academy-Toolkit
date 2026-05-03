// Standalone teleprompter window opener.
// Reused by the Scripts tool (with labeled 5-part sections) and the
// standalone Teleprompter tool (single text block, no labels).

export type TeleprompterSection = {
  label?: string;
  color?: string;
  text: string;
};

export function openTeleprompter(opts: { title: string; sections: TeleprompterSection[] }): void {
  const { title, sections } = opts;
  const cleaned = sections.filter((s) => s.text && s.text.trim());
  if (cleaned.length === 0) return;

  const esc = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
    html,body{height:100%;background:#0a0a0a;color:#fff;font-family:Georgia,"Times New Roman",serif;overflow:hidden}
    #controls{
      position:fixed;top:0;left:0;right:0;z-index:100;
      display:flex;align-items:center;gap:10px;flex-wrap:wrap;
      padding:10px 18px;background:#111;border-bottom:1px solid #333;
    }
    #controls .title{font-family:Arial,sans-serif;font-size:12px;color:#555;margin-right:6px;white-space:nowrap;overflow:hidden;max-width:200px}
    .speed-btn{
      font-family:Arial,sans-serif;font-size:12px;padding:5px 14px;
      border-radius:999px;border:none;cursor:pointer;
      background:rgba(255,255,255,.12);color:rgba(255,255,255,.6);transition:.15s;
    }
    .speed-btn.active{background:#fff;color:#000;font-weight:700}
    .speed-btn:hover:not(.active){background:rgba(255,255,255,.22);color:#fff}
    #playBtn{
      font-family:Arial,sans-serif;font-size:13px;font-weight:700;
      padding:7px 22px;border-radius:999px;border:none;cursor:pointer;
      background:#fff;color:#000;transition:.15s;margin-left:4px;
    }
    #playBtn:hover{background:#e5e5e5}
    #resetBtn{
      font-family:Arial,sans-serif;font-size:12px;padding:5px 12px;
      border-radius:999px;border:none;cursor:pointer;
      background:rgba(255,255,255,.08);color:rgba(255,255,255,.5);transition:.15s;
    }
    #resetBtn:hover{background:rgba(255,255,255,.18);color:#fff}
    #scroller{
      position:fixed;top:54px;bottom:0;left:0;right:0;
      overflow-y:scroll;padding:40px 60px 0;
      scrollbar-width:none;
    }
    #scroller::-webkit-scrollbar{display:none}
    .section{margin-bottom:72px}
    .section-label{
      font-family:Arial,sans-serif;font-size:11px;font-weight:700;
      letter-spacing:.18em;text-transform:uppercase;margin-bottom:20px;
    }
    .section-text{font-size:32px;line-height:1.85;white-space:pre-wrap;color:#fff}
    .bottom-pad{height:80vh}
    #hint{position:fixed;bottom:0;left:0;right:0;text-align:center;padding:4px;font-family:monospace;font-size:10px;color:#333;background:#0a0a0a}
    #countdown{
      display:none;margin-left:auto;
      font-family:Arial,sans-serif;font-size:12px;
      color:rgba(255,255,255,.55);white-space:nowrap;
    }
    #cd-num{font-weight:700;color:#fff;font-size:14px}
  </style>
</head>
<body>
  <div id="controls">
    <span class="title">${esc(title)}</span>
    <button class="speed-btn active" data-speed="28" onclick="setSpeed(this)">Slow</button>
    <button class="speed-btn"        data-speed="45" onclick="setSpeed(this)">Med</button>
    <button class="speed-btn"        data-speed="65" onclick="setSpeed(this)">Fast</button>
    <button id="resetBtn" onclick="resetScroll()">↺ Restart</button>
    <button id="playBtn"  onclick="togglePlay()">▶ Play</button>
    <span id="countdown">Scrolling begins in <span id="cd-num">5</span></span>
  </div>
  <div id="scroller">
    ${sectionsHtml}
    <div class="bottom-pad"></div>
  </div>
  <div id="hint">Space = play/pause &nbsp;·&nbsp; S/M/F = speed</div>
  <script>
    var playing = false;
    var speed = 28;
    var lastTime = null;
    var raf = null;
    var scrollAccum = 0;
    var cdTimer = null;
    var scroller  = document.getElementById('scroller');
    var playBtn   = document.getElementById('playBtn');
    var cdEl      = document.getElementById('countdown');
    var cdNumEl   = document.getElementById('cd-num');

    function setSpeed(btn) {
      speed = parseFloat(btn.dataset.speed);
      document.querySelectorAll('.speed-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
    }
    function hideCountdown() {
      if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
      cdEl.style.display = 'none';
    }
    function resetScroll() {
      playing = false;
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      hideCountdown();
      lastTime = null;
      scrollAccum = 0;
      scroller.scrollTop = 0;
      playBtn.textContent = '▶ Play';
    }
    function startCountdown() {
      var count = 5;
      cdNumEl.textContent = count;
      cdEl.style.display = 'block';
      cdTimer = setInterval(function() {
        count--;
        if (count <= 0) {
          hideCountdown();
          if (playing) { lastTime = null; scrollAccum = 0; raf = requestAnimationFrame(tick); }
        } else {
          cdNumEl.textContent = count;
        }
      }, 1000);
    }
    function togglePlay() {
      playing = !playing;
      if (playing) {
        playBtn.textContent = '⏸ Pause';
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        startCountdown();
      } else {
        playBtn.textContent = '▶ Play';
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        hideCountdown();
      }
    }
    function tick(now) {
      if (!playing) return;
      if (lastTime !== null) {
        scrollAccum += speed * (now - lastTime) / 1000;
        var pixels = Math.floor(scrollAccum);
        if (pixels >= 1) {
          scroller.scrollTop += pixels;
          scrollAccum -= pixels;
        }
        if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4) {
          playing = false;
          playBtn.textContent = '▶ Play';
          return;
        }
      }
      lastTime = now;
      raf = requestAnimationFrame(tick);
    }
    document.addEventListener('keydown', function(e) {
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      if (e.key === 's' || e.key === 'S') setSpeed(document.querySelector('[data-speed="28"]'));
      if (e.key === 'm' || e.key === 'M') setSpeed(document.querySelector('[data-speed="45"]'));
      if (e.key === 'f' || e.key === 'F') setSpeed(document.querySelector('[data-speed="65"]'));
      if (e.key === 'r' || e.key === 'R') resetScroll();
    });
  <\/script>
</body>
</html>`;

  const twWidth = 960;
  const twHeight = 520;
  const twLeft = Math.round((screen.width - twWidth) / 2);
  const twTop = 0;
  const tw = window.open(
    "",
    "_blank",
    `width=${twWidth},height=${twHeight},left=${twLeft},top=${twTop},resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no`,
  );
  if (tw) {
    tw.document.write(html);
    tw.document.close();
  }
}
