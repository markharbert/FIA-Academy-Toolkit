import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Package } from "lucide-react";

export default function Stage8Page() {
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
              Stage 8 of 9
            </Badge>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Digital Product Creation</h1>
          <p className="text-white/60 text-base leading-relaxed max-w-2xl">
            Build your own course, ebook, or software. Having your own product elevates your brand, provides a new revenue stream, and gives you complete control over your business and income.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14 text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center">
              <Package className="h-7 w-7 text-violet-500/50" />
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">Tools Coming Soon</div>
              <div className="text-sm text-muted-foreground mt-1.5 max-w-sm">
                Stage 8 will walk you through creating, launching, and scaling your own digital product. This is where four figures becomes five and six.
              </div>
            </div>
            <Badge variant="outline">Level 3 · Apex</Badge>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground leading-relaxed italic">
              "Having your own product is one of the things that can take you from four figures a month to five and six figures a month, very easily. I have courses that I created one time that have paid me over and over for years."
            </p>
            <p className="text-xs text-muted-foreground/50 mt-2">— Keystone Framework, Stage 8</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
