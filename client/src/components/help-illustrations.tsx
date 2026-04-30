import { Video, Wrench, LayoutDashboard, Mail, Target, ChevronRight, Circle, Mic, Camera, Square, Download, RefreshCw, FileText, CheckCircle, Loader2, BarChart2, Zap, BookOpen } from "lucide-react";

function AnnotationBadge({ text, position = "bottom" }: { text: string; position?: "bottom" | "top" | "right" | "left" }) {
  const posClass = {
    bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
    top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
    right: "left-full ml-2 top-1/2 -translate-y-1/2",
    left: "right-full mr-2 top-1/2 -translate-y-1/2",
  }[position];
  return (
    <div className={`absolute ${posClass} z-10 whitespace-nowrap`}>
      <div className="bg-amber-400 text-amber-900 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-700 flex-shrink-0" />
        {text}
      </div>
    </div>
  );
}

function Highlight({ children, annotation, position = "bottom" }: { children: React.ReactNode; annotation: string; position?: "bottom" | "top" | "right" | "left" }) {
  return (
    <div className="relative inline-block">
      <div className="ring-2 ring-amber-400 ring-offset-1 ring-offset-card rounded-lg animate-pulse">
        {children}
      </div>
      <AnnotationBadge text={annotation} position={position} />
    </div>
  );
}

function IllustrationShell({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/60 border-b border-border">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
        <span className="ml-2 text-[10px] font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── Step 1: Sidebar nav ───────────────────────────────────────────────────────
export function SidebarNavIllustration() {
  return (
    <IllustrationShell label="Sidebar — Navigation">
      <div className="flex gap-3">
        <div className="w-36 bg-[hsl(230,45%,14%)] rounded-lg p-2 space-y-0.5 flex-shrink-0">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400 px-2 pt-1 pb-0.5">Navigation</p>
          {[
            { icon: LayoutDashboard, label: "Dashboard", active: false },
            { icon: Target, label: "DMO Tracker", active: false },
            { icon: Wrench, label: "Video Tools", active: true },
            { icon: Mail, label: "Email Tools", active: false },
          ].map(item => (
            <div key={item.label} className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] font-medium ${item.active ? "bg-white/15 text-white" : "text-slate-300"}`}>
              <item.icon className="h-3 w-3 flex-shrink-0" />
              {item.label}
            </div>
          ))}
        </div>
        <div className="flex-1 flex items-center justify-center min-h-[100px]">
          <div className="relative mt-6">
            <Highlight annotation='Click "Video Tools"' position="right">
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-white/15 text-white text-xs font-medium">
                <Wrench className="h-3.5 w-3.5" />
                Video Tools
              </div>
            </Highlight>
          </div>
        </div>
      </div>
    </IllustrationShell>
  );
}

// ── Step 2: Video Tools Hub ───────────────────────────────────────────────────
export function VideoToolsHubIllustration() {
  return (
    <IllustrationShell label="Video Tools Hub">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground mb-3">Choose a tool to get started</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Video, label: "Video Score", desc: "Record & score your videos", highlight: true, gradient: "from-violet-500 to-indigo-600" },
            { icon: BarChart2, label: "Video Trends", desc: "Research trending topics", highlight: false, gradient: "from-emerald-500 to-teal-600" },
            { icon: FileText, label: "Scripts", desc: "Generate video scripts", highlight: false, gradient: "from-orange-500 to-amber-600" },
          ].map(card => (
            <div key={card.label} className={`relative rounded-lg overflow-hidden ${card.highlight ? "ring-2 ring-amber-400 ring-offset-1" : ""}`}>
              {card.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 bg-amber-400 text-amber-900 text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">Click this card</div>
              )}
              <div className={`bg-gradient-to-br ${card.gradient} p-3 flex flex-col gap-1`}>
                <card.icon className="h-4 w-4 text-white/90" />
                <p className="text-[10px] font-bold text-white">{card.label}</p>
                <p className="text-[9px] text-white/70">{card.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </IllustrationShell>
  );
}

// ── Step 3: Sessions list ─────────────────────────────────────────────────────
export function SessionsListIllustration() {
  return (
    <IllustrationShell label="Video Score — My Sessions">
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-foreground">My Sessions</p>
          <div className="relative">
            <Highlight annotation="Click to start recording" position="left">
              <div className="flex items-center gap-1.5 bg-primary text-primary-foreground text-[10px] font-semibold px-2.5 py-1.5 rounded-md">
                <Video className="h-3 w-3" />
                New Session
              </div>
            </Highlight>
          </div>
        </div>
        {["Week 4 Sales Practice", "Intro Video — Lead Gen", "Product Demo Run-through"].map((name, i) => (
          <div key={name} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border border-border/50">
            <div className="h-8 w-12 rounded bg-muted flex-shrink-0 flex items-center justify-center">
              <Video className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-medium text-foreground truncate">{name}</p>
              <p className="text-[9px] text-muted-foreground">{["98/100", "74/100", "61/100"][i]} · {["Sales", "Lead Gen", "Sales"][i]}</p>
            </div>
            <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          </div>
        ))}
      </div>
    </IllustrationShell>
  );
}

// ── Step 4: Goal type selector ────────────────────────────────────────────────
export function GoalTypeSelectorIllustration() {
  const goals = [
    { label: "Sales Video", desc: "Persuasion & CTA", selected: true },
    { label: "Lead Generation", desc: "Hook & opt-in", selected: false },
    { label: "Education", desc: "Clarity & structure", selected: false },
    { label: "Recruiting", desc: "Opportunity framing", selected: false },
  ];
  return (
    <IllustrationShell label="New Session — Choose Your Goal">
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-foreground">Session name</p>
          <div className="h-6 rounded-md border border-border bg-background px-2 flex items-center">
            <span className="text-[10px] text-muted-foreground">Week 5 Sales Practice</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-foreground">Goal Type</p>
          <div className="grid grid-cols-2 gap-1.5">
            {goals.map(g => (
              <div key={g.label} className={`rounded-lg p-2 border text-[10px] cursor-pointer ${g.selected ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border bg-muted/30 text-muted-foreground"}`}>
                <p className={g.selected ? "font-bold" : "font-medium"}>{g.label}</p>
                <p className="text-[9px] opacity-70 mt-0.5">{g.desc}</p>
              </div>
            ))}
          </div>
          <div className="relative inline-block w-full">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
              <p className="text-[9px] text-amber-700 dark:text-amber-400">Goal type affects how the AI scores your video — pick the one that matches your intention</p>
            </div>
          </div>
        </div>
      </div>
    </IllustrationShell>
  );
}

// ── Step 5: Device setup ──────────────────────────────────────────────────────
export function DeviceSetupIllustration() {
  return (
    <IllustrationShell label="New Session — Device Setup">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-black aspect-video flex items-center justify-center relative">
          <Camera className="h-6 w-6 text-white/30" />
          <div className="absolute bottom-1 left-1 right-1 h-0.5 bg-emerald-400/30 rounded-full">
            <div className="h-full w-3/4 bg-emerald-400 rounded-full" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Camera className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] font-semibold text-foreground">Camera</p>
            </div>
            <div className="h-6 rounded border border-border bg-background px-2 flex items-center justify-between">
              <span className="text-[9px] text-foreground">FaceTime HD Camera</span>
              <ChevronRight className="h-2.5 w-2.5 text-muted-foreground rotate-90" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Mic className="h-3 w-3 text-muted-foreground" />
              <p className="text-[10px] font-semibold text-foreground">Microphone</p>
            </div>
            <div className="h-6 rounded border border-border bg-background px-2 flex items-center justify-between">
              <span className="text-[9px] text-foreground">Built-in Microphone</span>
              <ChevronRight className="h-2.5 w-2.5 text-muted-foreground rotate-90" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[9px] font-medium text-muted-foreground">Audio level</p>
            <div className="flex gap-0.5 h-3 items-end">
              {[4, 6, 8, 10, 8, 9, 7, 5, 8, 10, 9, 7, 4, 6, 8, 3].map((h, i) => (
                <div key={i} className={`flex-1 rounded-sm ${i < 12 ? "bg-emerald-400" : "bg-muted"}`} style={{ height: `${h * 10}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </IllustrationShell>
  );
}

// ── Step 6: Recording interface ───────────────────────────────────────────────
export function RecordingInterfaceIllustration() {
  return (
    <IllustrationShell label="Recording in progress">
      <div className="space-y-2">
        <div className="rounded-lg bg-black aspect-video relative overflow-hidden flex items-center justify-center">
          <Camera className="h-8 w-8 text-white/20" />
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-red-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            REC
          </div>
          <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
            0:47
          </div>
        </div>
        <div className="flex items-center justify-center gap-4 pt-1">
          <div className="relative">
            <Highlight annotation="Click to stop" position="top">
              <div className="h-9 w-9 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30">
                <Square className="h-3.5 w-3.5 text-white fill-white" />
              </div>
            </Highlight>
          </div>
        </div>
        <p className="text-center text-[9px] text-muted-foreground">Aim for 60–90 seconds · you're at 47 sec</p>
      </div>
    </IllustrationShell>
  );
}

// ── Step 7: Processing status ─────────────────────────────────────────────────
export function ProcessingStatusIllustration() {
  const steps = [
    { label: "Transcription", status: "done", detail: "Completed in 42s" },
    { label: "AI Scoring", status: "active", detail: "Analyzing formula…" },
    { label: "Video Preview", status: "pending", detail: "Waiting…" },
  ];
  return (
    <IllustrationShell label="Processing — almost ready">
      <div className="space-y-2">
        {steps.map(s => (
          <div key={s.label} className={`flex items-center gap-3 p-2.5 rounded-lg border ${s.status === "done" ? "border-emerald-500/30 bg-emerald-500/5" : s.status === "active" ? "border-blue-500/30 bg-blue-500/5" : "border-border bg-muted/20"}`}>
            {s.status === "done"
              ? <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              : s.status === "active"
              ? <Loader2 className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
              : <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-foreground">{s.label}</p>
              <p className="text-[10px] text-muted-foreground">{s.detail}</p>
            </div>
          </div>
        ))}
        <p className="text-[9px] text-center text-muted-foreground pt-1">You can navigate away — results will be here when you return</p>
      </div>
    </IllustrationShell>
  );
}

// ── Step 8: Overall score ─────────────────────────────────────────────────────
export function OverallScoreIllustration() {
  const r = 28; const circ = 2 * Math.PI * r; const pct = 82; const dash = (pct / 100) * circ;
  return (
    <IllustrationShell label="Session Results — Overall Score">
      <div className="flex items-start gap-4">
        <div className="relative">
          <Highlight annotation="Your overall score" position="bottom">
            <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-muted/30 border border-border">
              <svg width="72" height="72" viewBox="0 0 72 72">
                <circle cx="36" cy="36" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/30" />
                <circle cx="36" cy="36" r={r} fill="none" stroke="#10b981" strokeWidth="6"
                  strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                  transform="rotate(-90 36 36)" />
                <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="18" fontWeight="700" fill="#10b981">82</text>
              </svg>
              <p className="text-[10px] font-bold text-emerald-500">Strong</p>
              <p className="text-[9px] text-muted-foreground">out of 100</p>
            </div>
          </Highlight>
        </div>
        <div className="flex-1 space-y-1.5 pt-1">
          {["Hook", "Set the Hook", "First CTA", "Content", "Final CTA"].map((s, i) => {
            const scores = [90, 85, 70, 88, 75];
            const color = scores[i] >= 80 ? "bg-emerald-400" : "bg-yellow-400";
            return (
              <div key={s} className="space-y-0.5">
                <div className="flex justify-between text-[9px]">
                  <span className="text-foreground font-medium">{s}</span>
                  <span className="text-muted-foreground">{scores[i]}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${color} rounded-full`} style={{ width: `${scores[i]}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </IllustrationShell>
  );
}

// ── Step 9: Formula breakdown ─────────────────────────────────────────────────
export function FormulaBreakdownIllustration() {
  return (
    <IllustrationShell label="Session Results — Formula Breakdown">
      <div className="space-y-1.5">
        {[
          { label: "Hook", score: 90, color: "text-emerald-500", feedback: "Strong opening — you grabbed attention immediately with a bold question.", icon: Zap },
          { label: "Set the Hook", score: 85, color: "text-emerald-500", feedback: "Clearly explained what's in it for the viewer.", icon: Target },
          { label: "First CTA", score: 70, color: "text-yellow-500", feedback: "CTA was present but came too late. Move it earlier.", icon: ChevronRight },
        ].map(s => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-2.5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <s.icon className="h-3 w-3 text-muted-foreground" />
                <p className="text-[10px] font-bold text-foreground">{s.label}</p>
              </div>
              <span className={`text-[10px] font-bold ${s.color}`}>{s.score}/100</span>
            </div>
            <p className="text-[9px] text-muted-foreground leading-relaxed">{s.feedback}</p>
          </div>
        ))}
        <p className="text-[9px] text-muted-foreground text-center pt-0.5">+ 2 more sections below ↓</p>
      </div>
    </IllustrationShell>
  );
}

// ── Step 10: Download + retranscribe ──────────────────────────────────────────
export function DownloadReportIllustration() {
  return (
    <IllustrationShell label="Session Results — Export & Options">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Highlight annotation="Download your PDF report" position="bottom">
              <div className="flex items-center gap-1.5 bg-primary text-primary-foreground text-[10px] font-semibold px-3 py-2 rounded-md">
                <Download className="h-3 w-3" />
                Download PDF
              </div>
            </Highlight>
          </div>
          <div className="flex items-center gap-1.5 border border-border text-[10px] font-medium px-3 py-2 rounded-md text-muted-foreground">
            <RefreshCw className="h-3 w-3" />
            Retranscribe
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex items-start gap-2">
            <FileText className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-semibold text-foreground">Week 5 Sales Practice</p>
              <p className="text-[9px] text-muted-foreground">Overall: 82/100 · Sales Video · Apr 30, 2026</p>
              <div className="flex gap-1 mt-1.5">
                {[90, 85, 70, 88, 75].map((s, i) => (
                  <div key={i} className={`h-1.5 w-8 rounded-full ${s >= 80 ? "bg-emerald-400" : "bg-yellow-400"}`} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <p className="text-[9px] text-muted-foreground">Use Retranscribe (up to 3×) if the AI missed part of your audio</p>
      </div>
    </IllustrationShell>
  );
}

export const ILLUSTRATIONS: Record<string, React.ComponentType> = {
  "sidebar-nav": SidebarNavIllustration,
  "video-tools-hub": VideoToolsHubIllustration,
  "sessions-list": SessionsListIllustration,
  "goal-type-selector": GoalTypeSelectorIllustration,
  "device-setup": DeviceSetupIllustration,
  "recording-interface": RecordingInterfaceIllustration,
  "processing-status": ProcessingStatusIllustration,
  "overall-score": OverallScoreIllustration,
  "formula-breakdown": FormulaBreakdownIllustration,
  "download-report": DownloadReportIllustration,
};
