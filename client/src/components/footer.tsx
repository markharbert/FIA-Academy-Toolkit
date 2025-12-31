import { Shield, Zap, Sparkles, Target, TrendingUp } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-brand-dark py-10">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center justify-center gap-6 text-center">
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-white/80">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              <span>Topic Research</span>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span>AI Scripts</span>
            </div>
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              <span>Video Scoring</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span>YouTube Research</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-white/70">
            <Shield className="h-4 w-4" />
            <span>Your content stays private and secure</span>
          </div>
          <p className="text-sm text-white/60">&copy; {new Date().getFullYear()} Video Creators Toolkit. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
