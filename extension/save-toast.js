// FIA Toolkit — injected save confirmation toast
// Self-contained, no external dependencies.
(function () {
  const TOAST_ID = "__fia_save_toast__";
  const STYLE_ID = "__fia_toast_style__";

  // Remove any stale toast from a rapid re-trigger
  [TOAST_ID, STYLE_ID].forEach(id => { const el = document.getElementById(id); if (el) el.remove(); });

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes _fia_in  { from { opacity:0; transform:translateX(-50%) scale(.75); } to { opacity:1; transform:translateX(-50%) scale(1); } }
    @keyframes _fia_out { from { opacity:1; transform:translateX(-50%) scale(1); } to { opacity:0; transform:translateX(-50%) scale(.75); } }
    @keyframes _fia_chk { from { stroke-dashoffset:32; } to { stroke-dashoffset:0; } }
  `;
  document.head.appendChild(style);

  const toast = document.createElement("div");
  toast.id = TOAST_ID;
  toast.setAttribute("aria-live", "polite");
  toast.style.cssText = [
    "position:fixed", "top:28px", "left:50%",
    "transform:translateX(-50%)",
    "z-index:2147483647",
    "background:linear-gradient(135deg,#34c172 0%,#1a9e55 100%)",
    "padding:11px 22px 11px 14px",
    "border-radius:999px",
    "box-shadow:0 8px 28px rgba(26,158,85,.45),0 2px 8px rgba(0,0,0,.18)",
    "display:flex", "align-items:center", "gap:10px",
    "animation:_fia_in .4s cubic-bezier(.34,1.56,.64,1) both",
    "pointer-events:none",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif",
    "user-select:none", "-webkit-user-select:none",
  ].join(";");

  toast.innerHTML = `
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;">
      <circle cx="13" cy="13" r="12" fill="rgba(255,255,255,0.22)"/>
      <path d="M7.5 13.5L11.2 17.5L18.5 9"
            stroke="white" stroke-width="2.6"
            stroke-linecap="round" stroke-linejoin="round"
            style="stroke-dasharray:32;stroke-dashoffset:32;animation:_fia_chk .42s ease-out .22s forwards"/>
    </svg>
    <span style="color:#fff;font-size:14px;font-weight:650;letter-spacing:.01em;white-space:nowrap;">Saved to Swipe File!</span>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "_fia_out .32s ease-in both";
    setTimeout(() => { toast.remove(); style.remove(); }, 350);
  }, 2700);
})();
