// Standalone teleprompter window opener.
// Reused by the Scripts tool (with labeled 5-part sections) and the
// standalone Teleprompter tool (single text block, no labels).

export type TeleprompterSection = {
  label?: string;
  color?: string;
  text: string;
};

export function openTeleprompter(opts: { title: string; sections: TeleprompterSection[]; scriptId?: string; bulletPoints?: string }): void {
  const { title, sections, scriptId, bulletPoints } = opts;
  const cleaned = sections.filter((s) => s.text && s.text.trim());
  if (cleaned.length === 0) return;

  const esc = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const bulletsHtml = bulletPoints
    ? bulletPoints.split("\n").filter((l) => l.trim()).map((l) => {
        const t = l.trim();
        if (t.toUpperCase().startsWith("HOOK:")) {
          return `<div class="bullet-hook">${esc(t)}</div>`;
        } else if (t.toUpperCase().startsWith("CTA:")) {
          return `<div class="bullet-cta">${esc(t)}</div>`;
        }
        return `<div class="bullet-line">${esc(t)}</div>`;
      }).join("")
    : "";

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

    /* ── Controls bar ── */
    #controls{
      flex-shrink:0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;
      padding:10px 18px;background:#111;border-bottom:1px solid #333;
    }
    #controls .title{font-family:Arial,sans-serif;font-size:12px;color:#555;margin-right:6px;white-space:nowrap;overflow:hidden;max-width:180px}
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
    #countdown{display:none;margin-left:auto;font-family:Arial,sans-serif;font-size:12px;color:rgba(255,255,255,.55);white-space:nowrap}
    #cd-num{font-weight:700;color:#fff;font-size:14px}

    /* ── Main two-panel layout ── */
    #main{flex:1;display:flex;overflow:hidden;min-height:0;padding-right:16px;padding-bottom:12px}

    /* ── Left: teleprompter ── */
    #left{flex:1;display:flex;flex-direction:column;min-width:0;overflow:hidden}
    #scroller{flex:1;overflow-y:scroll;padding:40px 60px 0;scrollbar-width:none}
    #scroller::-webkit-scrollbar{display:none}
    .section{margin-bottom:72px}
    .section-label{font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;margin-bottom:20px}
    .section-text{font-size:var(--text-size,32px);line-height:1.85;white-space:pre-wrap;color:#fff}
    .bottom-pad{height:80vh}
    #hint{flex-shrink:0;text-align:center;padding:4px;font-family:monospace;font-size:10px;color:#2d2d2d;background:#0a0a0a;border-top:1px solid #1a1a1a}

    /* ── Right: camera panel ── */
    #camera-panel{width:420px;flex-shrink:0;background:#111;border-left:1px solid #1e1e1e;display:flex;flex-direction:column}

    /* video area */
    #video-wrap{position:relative;width:100%;background:#000;overflow:hidden;aspect-ratio:16/9;flex-shrink:0}
    #cam-preview{width:100%;height:100%;object-fit:cover;display:none;transform:scaleX(-1)}
    #cam-playback{width:100%;height:100%;object-fit:contain;display:none;background:#000}
    #cam-placeholder{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;background:#0d0d0d}
    #cam-placeholder svg{opacity:.15}
    #cam-placeholder span{font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,.2);letter-spacing:.08em}

    /* recording overlay indicators */
    #rec-dot{position:absolute;top:10px;left:12px;display:none;align-items:center;gap:5px;font-family:Arial,sans-serif;font-size:11px;font-weight:700;color:#ff4444;letter-spacing:.05em;text-shadow:0 1px 3px rgba(0,0,0,.9)}
    #rec-dot .dot{width:8px;height:8px;border-radius:50%;background:#ff4444;animation:blink 1s infinite}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:.15}}
    #rec-timer{position:absolute;top:10px;right:12px;font-family:monospace;font-size:13px;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.9);display:none;background:rgba(0,0,0,.55);padding:2px 7px;border-radius:4px}

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
    .upload-spinner{width:36px;height:36px;border:3px solid rgba(255,255,255,.12);border-top-color:rgba(255,255,255,.75);border-radius:50%;animation:spin .75s linear infinite;margin:8px auto 4px}
    @keyframes spin{to{transform:rotate(360deg)}}

    #cam-footer{flex-shrink:0;padding:6px 12px;font-family:monospace;font-size:9px;color:#222;border-top:1px solid #1a1a1a;text-align:center}
    #download-info{font-family:monospace;font-size:11px;color:rgba(255,255,255,.3)}

    /* ── Script / Bullets tabs ── */
    #view-tabs{flex-shrink:0;display:flex;gap:8px;padding:10px 60px 6px;background:#0a0a0a}
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
  </style>
</head>
<body>
  <!-- ── Top controls (full-width) ── -->
  <div id="controls">
    <span class="title">${esc(title)}</span>
    <div id="speedWrap">
      <span id="speedLabel">Scroll Speed</span>
      <input type="range" id="speedSlider" min="1" max="8" value="3" step="1">
    </div>
    <button class="font-btn" id="fontDown" onclick="changeFont(-1)" title="Smaller text">A−</button>
    <span id="fontLabel">Medium</span>
    <button class="font-btn" id="fontUp" onclick="changeFont(1)" title="Larger text">A+</button>
    <button id="resetBtn" onclick="resetScroll()">↺ Restart</button>
    <button id="playBtn" onclick="togglePlay()">▶ Play</button>
    <span id="countdown">Scrolling begins in <span id="cd-num">5</span></span>
  </div>

  <!-- ── Main area ── -->
  <div id="main">

    <!-- Left: scrolling script / bullets -->
    <div id="left">
      <div id="view-tabs">
        <button class="view-tab active" id="tab-script" onclick="switchView('script')">&#x1F4C4; Script</button>
        <button class="view-tab" id="tab-bullets" onclick="switchView('bullets')">&#x2022; Bullets</button>
      </div>
      <div id="scroller">
        ${sectionsHtml}
        <div class="bottom-pad"></div>
      </div>
      <div id="bullets-view">
        ${bulletsHtml || '<div style="font-family:Arial,sans-serif;color:rgba(255,255,255,.25);font-size:16px;padding:20px 0">No bullet points added yet — save bullet points from the editor first.</div>'}
        <div class="bottom-pad"></div>
      </div>
      <div id="hint">Space = play/pause &nbsp;·&nbsp; [ / ] = slower / faster &nbsp;·&nbsp; +/− = font size</div>
    </div>

    <!-- Right: camera + recording -->
    <div id="camera-panel">
      <!-- 16:9 video area -->
      <div id="video-wrap">
        <div id="cam-placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
            <path d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
          </svg>
          <span>CAMERA</span>
        </div>
        <video id="cam-preview" autoplay muted playsinline></video>
        <video id="cam-playback" controls></video>
        <div id="rec-dot"><span class="dot"></span><span>REC</span></div>
        <div id="rec-timer">0:00</div>
      </div>

      <!-- State-driven controls -->
      <div id="cam-body">

        <!-- IDLE: prompt to enable camera -->
        <div id="cam-idle" class="cam-section">
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
          <p class="cam-msg">Camera ready. Hit record when you're set — recording starts immediately.</p>
          <button class="cam-btn cam-btn-red" onclick="startRecording()">
            <span style="font-size:9px">●</span> Start Recording
          </button>
        </div>

        <!-- RECORDING -->
        <div id="cam-recording" class="cam-section">
          <p class="cam-msg">Recording in progress…</p>
          <button class="cam-btn cam-btn-dark" onclick="stopRecording()">
            <span style="font-size:9px">■</span> Stop Recording
          </button>
        </div>

        <!-- UPLOADING -->
        <div id="cam-uploading" class="cam-section">
          <div class="upload-spinner"></div>
          <p class="cam-msg" style="text-align:center;font-weight:600">Processing video…</p>
          <p class="cam-msg" style="text-align:center;font-size:11px">Saving your take to your account. Hang tight.</p>
        </div>

        <!-- REVIEW -->
        <div id="cam-review" class="cam-section">
          <div id="review-cloud-msg"></div>
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
    /* ══════════════════════════════════════════
       TELEPROMPTER LOGIC
    ══════════════════════════════════════════ */
    var SPEEDS=[6,12,20,28,38,50,65,85];
    var playing=false,speed=SPEEDS[2],lastTime=null,raf=null,scrollAccum=0,cdTimer=null;
    var scroller=document.getElementById('scroller');
    var playBtn=document.getElementById('playBtn');
    var cdEl=document.getElementById('countdown');
    var cdNumEl=document.getElementById('cd-num');
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

    function hideCountdown(){if(cdTimer){clearInterval(cdTimer);cdTimer=null;}cdEl.style.display='none';}
    function resetScroll(){
      playing=false;if(raf){cancelAnimationFrame(raf);raf=null;}
      hideCountdown();lastTime=null;scrollAccum=0;scroller.scrollTop=0;playBtn.textContent='▶ Play';
    }
    function startCountdown(){
      var count=5;cdNumEl.textContent=count;cdEl.style.display='block';
      cdTimer=setInterval(function(){
        count--;
        if(count<=0){hideCountdown();if(playing){lastTime=null;scrollAccum=0;raf=requestAnimationFrame(tick);}}
        else cdNumEl.textContent=count;
      },1000);
    }
    function togglePlay(){
      playing=!playing;
      if(playing){playBtn.textContent='⏸ Pause';if(raf){cancelAnimationFrame(raf);raf=null;}startCountdown();}
      else{playBtn.textContent='▶ Play';if(raf){cancelAnimationFrame(raf);raf=null;}hideCountdown();}
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
      if(e.key==='['||e.key===','){e.preventDefault();stepSpeed(-1);}
      if(e.key===']'||e.key==='.'){e.preventDefault();stepSpeed(1);}
      if(e.key==='r'||e.key==='R')resetScroll();
      if(e.key==='+'||e.key==='='){e.preventDefault();changeFont(1);}
      if(e.key==='-'||e.key==='_'){e.preventDefault();changeFont(-1);}
    });

    /* ══════════════════════════════════════════
       CAMERA / RECORDING LOGIC
    ══════════════════════════════════════════ */
    var SCRIPT_ID = ${JSON.stringify(scriptId || "")};
    var SCRIPT_TITLE = ${JSON.stringify(title)};
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
    var hasUnsaved=false,recordingId=null,uploadFailed=false;

    var camPreview=document.getElementById('cam-preview');
    var camPlayback=document.getElementById('cam-playback');
    var camPlaceholder=document.getElementById('cam-placeholder');
    var recDot=document.getElementById('rec-dot');
    var recTimerEl=document.getElementById('rec-timer');

    function setCamState(s){
      camState=s;
      // placeholder (shows when no video is active)
      camPlaceholder.style.display=(s==='idle'||s==='loading'||s==='denied')?'flex':'none';
      // live preview
      camPreview.style.display=(s==='ready'||s==='recording')?'block':'none';
      // recorded playback (visible during upload preview + review)
      camPlayback.style.display=(s==='uploading'||s==='review')?'block':'none';
      // REC overlay
      recDot.style.display=(s==='recording')?'flex':'none';
      recTimerEl.style.display=(s==='recording')?'block':'none';
      // section panels
      ['idle','loading','denied','ready','recording','uploading','review'].forEach(function(name){
        var el=document.getElementById('cam-'+name);
        if(el)el.className='cam-section'+(name===s?' active':'');
      });
    }

    function getSupportedMimeType(){
      var types=['video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
      for(var i=0;i<types.length;i++){
        if(typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(types[i]))return types[i];
      }
      return '';
    }

    function requestCamera(){
      setCamState('loading');
      if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
        document.getElementById('denied-msg').textContent='Camera API not supported in this browser.';
        setCamState('denied');return;
      }
      navigator.mediaDevices.getUserMedia({
        video:{width:{ideal:1920},height:{ideal:1080},facingMode:'user'},
        audio:true
      }).then(function(stream){
        mediaStream=stream;
        camPreview.srcObject=stream;
        camPreview.play().catch(function(){});
        setCamState('ready');
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

    function startRecording(){
      if(!mediaStream)return;
      // Also kick off the teleprompter scroll if it isn't already running
      if(!playing)togglePlay();
      recMimeType=getSupportedMimeType();
      var opts=recMimeType?{mimeType:recMimeType}:{};
      try{mediaRecorder=new MediaRecorder(mediaStream,opts);}
      catch(e){mediaRecorder=new MediaRecorder(mediaStream);recMimeType=mediaRecorder.mimeType||'video/webm';}
      recordedChunks=[];
      mediaRecorder.ondataavailable=function(e){if(e.data&&e.data.size>0)recordedChunks.push(e.data);};
      mediaRecorder.onstop=function(){
        recordedBlob=new Blob(recordedChunks,{type:recMimeType||'video/webm'});
        if(recordedUrl)URL.revokeObjectURL(recordedUrl);
        recordedUrl=URL.createObjectURL(recordedBlob);
        camPlayback.src=recordedUrl;
        hasUnsaved=true;
        clearInterval(timerInterval);
        var mb=(recordedBlob.size/1048576).toFixed(1);
        var ext=(recMimeType&&recMimeType.indexOf('mp4')!==-1)?'.mp4':'.webm';
        document.getElementById('download-info').textContent=mb+' MB \u00b7 '+ext.replace('.','').toUpperCase()+' file';
        // Switch to uploading state and begin cloud upload
        setCamState('uploading');
        uploadRecording();
      };
      mediaRecorder.start(1000);
      recSeconds=0;updateRecTimer();
      timerInterval=setInterval(function(){recSeconds++;updateRecTimer();},1000);
      setCamState('recording');
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
      var fd=new FormData();
      var ext=(recMimeType&&recMimeType.indexOf('mp4')!==-1)?'.mp4':'.webm';
      var ts=new Date().toISOString().slice(0,19).replace(/[T:]/g,'-');
      fd.append('video',recordedBlob,'recording-'+ts+ext);
      if(SCRIPT_ID)fd.append('scriptId',SCRIPT_ID);
      fd.append('title',SCRIPT_TITLE||'Untitled Take');
      fd.append('durationSeconds',String(recSeconds));
      fetch('/api/teleprompter/recordings',{method:'POST',body:fd,credentials:'include'})
        .then(function(r){
          if(!r.ok)return Promise.reject(r.status);
          return r.json();
        })
        .then(function(data){
          recordingId=data.id;
          uploadFailed=false;
          hasUnsaved=false;
          document.getElementById('review-cloud-msg').innerHTML='<p class="cam-msg success" style="font-size:11px">&#x2601; Saved to your account \u2014 available for 30 days.</p>';
          document.getElementById('review-warn').style.display='none';
          setCamState('review');
        })
        .catch(function(){
          uploadFailed=true;
          document.getElementById('review-cloud-msg').innerHTML='<p class="cam-msg error" style="font-size:11px">\u26a0 Cloud save failed \u2014 download below to keep your take.</p>';
          document.getElementById('review-warn').style.display='block';
          setCamState('review');
        });
    }

    function downloadRecording(){
      // Prefer server-side download if the upload succeeded
      if(recordingId){
        var a=document.createElement('a');
        a.href='/api/teleprompter/recordings/'+recordingId+'/download';
        a.download='';
        document.body.appendChild(a);a.click();document.body.removeChild(a);
        return;
      }
      // Fallback: download from local blob
      if(!recordedUrl)return;
      var ext=(recMimeType&&recMimeType.indexOf('mp4')!==-1)?'.mp4':'.webm';
      var ts=new Date().toISOString().slice(0,19).replace(/[T:]/g,'-');
      var a=document.createElement('a');
      a.href=recordedUrl;
      a.download='recording-'+ts+ext;
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
      setCamState('ready');
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
  if (tw) {
    try {
      tw.resizeTo(twWidth, twHeight);
      tw.moveTo(twLeft, twTop);
    } catch (e) { /* noop — blocked in some browsers */ }
  }
  if (tw) {
    tw.document.write(html);
    tw.document.close();
  }
}
