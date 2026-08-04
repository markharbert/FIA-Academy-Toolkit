import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function Stage4Page() {
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
              Stage 4 of 6
            </Badge>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Social Networking</h1>
          <p className="text-white/60 text-base leading-relaxed max-w-2xl">
            The art of building profitable relationships. Strategic cultivation of connections in your industry — not just collecting contacts, but establishing meaningful partnerships that lead to collaborations and sales.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center">
              <Users className="h-7 w-7 text-amber-500/50" />
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">Tools Coming Soon</div>
              <div className="text-sm text-muted-foreground mt-1.5 max-w-sm">
                Stage 4 tools are being built. Complete Level 1 first — your foundation must be solid before momentum starts.
              </div>
            </div>
            <Badge variant="outline">Level 2 · Momentum</Badge>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground leading-relaxed italic">
              "I can't even begin to tell you how many top earners I know that I have partnered with to do promotions. It's all part of networking — getting to know people on social media. And there's a way to do that."
            </p>
            <p className="text-xs text-muted-foreground/50 mt-2">— Keystone Framework, Stage 4</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
