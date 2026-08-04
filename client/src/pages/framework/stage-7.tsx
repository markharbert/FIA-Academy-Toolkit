import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Monitor } from "lucide-react";

export default function Stage7Page() {
  return (
    <div className="min-h-full">
      {/* Dark hero strip */}
      <div className="bg-[hsl(230,50%,6%)] px-6 py-8 border-b border-white/10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30 text-xs font-semibold">
              Level 3 · Apex
            </Badge>
            <Badge variant="outline" className="text-xs text-white/40 border-white/15">
              Stage 7 of 9
            </Badge>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Profitable Presentations</h1>
          <p className="text-white/60 text-base leading-relaxed max-w-2xl">
            The master key for massive profits. Webinars, workshops, and challenges are where you turn warm leads into red-hot buyers — often resulting in exponential revenue growth in a single event.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center">
              <Monitor className="h-7 w-7 text-violet-500/50" />
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">Tools Coming Soon</div>
              <div className="text-sm text-muted-foreground mt-1.5 max-w-sm">
                Level 3 Apex tools are reserved for those who have built the foundation and momentum. Keep climbing.
              </div>
            </div>
            <Badge variant="outline">Level 3 · Apex</Badge>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground leading-relaxed italic">
              "How many top earners do you see out there doing presentations, selling their products and services? Is there any wonder why they are successful? It's because they've learned the art of profitable presentations."
            </p>
            <p className="text-xs text-muted-foreground/50 mt-2">— Keystone Framework, Stage 7</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
