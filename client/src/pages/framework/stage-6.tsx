import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

export default function Stage6Page() {
  return (
    <div className="min-h-full">
      {/* Dark hero strip */}
      <div className="bg-[hsl(230,50%,6%)] px-6 py-8 border-b border-white/10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs font-semibold">
              Level 2 · Momentum
            </Badge>
            <Badge variant="outline" className="text-xs text-white/40 border-white/15">
              Stage 6 of 6
            </Badge>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Paid Marketing</h1>
          <p className="text-white/60 text-base leading-relaxed max-w-2xl">
            The turbocharger for scaling and growth. Once you've mastered social networking and organic content, paid marketing is your fast track to scaling — driving targeted traffic, generating leads, and accelerating sales.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center">
              <TrendingUp className="h-7 w-7 text-amber-500/50" />
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">Tools Coming Soon</div>
              <div className="text-sm text-muted-foreground mt-1.5 max-w-sm">
                Stage 6 paid marketing tools are being built. Master Stages 4 and 5 first — organic before paid is the right order.
              </div>
            </div>
            <Badge variant="outline">Level 2 · Momentum</Badge>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground leading-relaxed italic">
              "Once you get to a point where you've really mastered social networking and you're really rocking on the content creation — now it's time to scale. We're gonna show you some very low cost strategies to get started."
            </p>
            <p className="text-xs text-muted-foreground/50 mt-2">— Keystone Framework, Stage 6</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
