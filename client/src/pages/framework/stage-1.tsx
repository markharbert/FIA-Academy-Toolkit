import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Target, BookOpen, ChevronRight, Lightbulb, Brain, BookMarked, Headphones, Tv2 } from "lucide-react";

function getTodayString() {
  return new Date().toISOString().split("T")[0];
}

function getProverbsChapter() {
  return new Date().getDate(); // 1–31
}

const HABITS = [
  {
    id: "prayer_meditation",
    icon: Brain,
    label: "Prayer / Meditation",
    description: "Start your day quiet. Get still before you get busy.",
  },
  {
    id: "read_proverbs",
    icon: BookMarked,
    label: `Read Proverbs — Chapter ${getProverbsChapter()}`,
    description: "One chapter per day, 31 chapters, repeat for life. Timeless wisdom.",
  },
  {
    id: "bible_reading",
    icon: BookOpen,
    label: "Bible / Faith Reading",
    description: "1–2 chapters of additional scripture or faith-based material.",
  },
  {
    id: "read_good_book",
    icon: Headphones,
    label: "Read or Listen to a Good Book",
    description: "30 minutes. Start with The Slight Edge by Jeff Olson.",
  },
  {
    id: "stage_training",
    icon: Tv2,
    label: "Watch a Stage Training",
    description: "One training per week. Pick the stage you're working on.",
    isWeekly: true,
  },
];

function getHabitsKey() {
  return `fia-stage1-habits-${getTodayString()}`;
}

export default function Stage1Page() {
  const [, setLocation] = useLocation();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getHabitsKey());
      if (raw) setChecked(JSON.parse(raw));
    } catch { /* ignore */ }
    setMounted(true);
  }, []);

  function toggle(id: string) {
    setChecked(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(getHabitsKey(), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  const completedCount = HABITS.filter(h => checked[h.id]).length;
  const allDone = completedCount === HABITS.length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs font-semibold">
            Level 1 · Genesis
          </Badge>
          <Badge variant="outline" className="text-xs text-white/40 border-white/10">
            Stage 1 of 3
          </Badge>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Personal Philosophy</h1>
        <p className="text-white/60 text-base leading-relaxed max-w-2xl">
          The bedrock of your business journey. Success is 80% mindset and 20% strategy — and this stage is where that 80% gets built, daily, one brick at a time.
        </p>
      </div>

      {/* Daily Habits Checklist */}
      <Card className="border-emerald-500/20 bg-emerald-950/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-emerald-400" />
              Today's Stage 1 Habits
            </CardTitle>
            <span className={`text-sm font-semibold ${allDone ? "text-emerald-400" : "text-white/40"}`}>
              {completedCount} / {HABITS.length}
            </span>
          </div>
          {allDone && (
            <p className="text-xs text-emerald-400 mt-1">
              ✓ Full set complete — great work today.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {mounted && HABITS.map(habit => {
            const Icon = habit.icon;
            const isChecked = !!checked[habit.id];
            return (
              <div
                key={habit.id}
                onClick={() => toggle(habit.id)}
                className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                  isChecked
                    ? "border-emerald-500/30 bg-emerald-950/20"
                    : "border-white/5 bg-white/[0.02] hover:bg-white/[0.05]"
                }`}
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => toggle(habit.id)}
                  onClick={e => e.stopPropagation()}
                  className="mt-0.5 border-emerald-500/50 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${isChecked ? "text-emerald-400" : "text-white/40"}`} />
                    <span className={`text-sm font-medium ${isChecked ? "text-white line-through opacity-60" : "text-white"}`}>
                      {habit.label}
                    </span>
                    {habit.isWeekly && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-white/40 border-white/10">
                        weekly
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-white/40 mt-0.5">{habit.description}</p>
                </div>
              </div>
            );
          })}
          {!mounted && (
            <div className="text-xs text-white/30 py-2">Loading…</div>
          )}
        </CardContent>
      </Card>

      {/* Tools */}
      <div>
        <h2 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">Your Tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* DMO Tracker */}
          <button
            onClick={() => setLocation("/dmo-tracker")}
            className="group text-left p-4 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-amber-500/30 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                  <Target className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-white">DMO Tracker</div>
                  <div className="text-xs text-white/50 mt-0.5 leading-relaxed">
                    Track your daily business habits, streaks, and personal development time.
                  </div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-white/20 group-hover:text-white/50 shrink-0 mt-0.5 transition-colors" />
            </div>
          </button>

          {/* Reading Library — coming soon */}
          <div className="p-4 rounded-2xl border border-white/5 bg-white/[0.02] opacity-60">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                <BookOpen className="h-5 w-5 text-blue-400/60" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-white/60">Reading Library</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-white/30 border-white/10">
                    Coming Soon
                  </Badge>
                </div>
                <div className="text-xs text-white/30 mt-0.5 leading-relaxed">
                  Track recommended books, mark progress, and log your insights.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stage context */}
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="pt-4 pb-4">
          <p className="text-xs text-white/40 leading-relaxed italic">
            "You will never leave this stage. Stage 1 is something you will always, always make a part of your daily routine for the rest of your life. Build your house one brick at a time — every day you show up here is another brick."
          </p>
          <p className="text-xs text-white/25 mt-2">— Keystone Framework, Stage 1</p>
        </CardContent>
      </Card>
    </div>
  );
}
