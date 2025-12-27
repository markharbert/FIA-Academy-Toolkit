import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, XCircle, Key, Youtube, MessageSquare } from "lucide-react";

export default function TopicPulseSettingsPage() {
  const [, navigate] = useLocation();

  const { data: status } = useQuery<{ youtube: boolean; openai: boolean; reddit: boolean }>({
    queryKey: ["/api/topic-pulse/status"],
  });

  return (
    <div className="min-h-full">
      <div className="border-b p-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/topic-pulse")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-page-title">Video Pulse Settings</h1>
            <p className="text-sm text-muted-foreground">API keys and preferences</p>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API Configuration
            </CardTitle>
            <CardDescription>
              These services power Video Pulse Finder. Some features require API keys.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
              <div className="flex items-center gap-3">
                <Youtube className="h-5 w-5 text-red-500" />
                <div>
                  <p className="font-medium">YouTube Data API</p>
                  <p className="text-sm text-muted-foreground">Enhanced topic metrics and competition analysis</p>
                </div>
              </div>
              {status?.youtube ? (
                <Badge variant="default" className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="flex items-center gap-1">
                  <XCircle className="h-3 w-3" />
                  Optional
                </Badge>
              )}
            </div>

            <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 flex items-center justify-center text-green-500 font-bold text-xs">AI</div>
                <div>
                  <p className="font-medium">OpenAI API</p>
                  <p className="text-sm text-muted-foreground">Script generation and topic enrichment</p>
                </div>
              </div>
              {status?.openai ? (
                <Badge variant="default" className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <XCircle className="h-3 w-3" />
                  Required
                </Badge>
              )}
            </div>

            <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-5 w-5 text-orange-500" />
                <div>
                  <p className="font-medium">Reddit API</p>
                  <p className="text-sm text-muted-foreground">Community question mining (coming soon)</p>
                </div>
              </div>
              {status?.reddit ? (
                <Badge variant="default" className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="outline" className="flex items-center gap-1">
                  <XCircle className="h-3 w-3" />
                  Optional
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Without YouTube API:</strong> Video Pulse uses YouTube autocomplete 
              suggestions to find in-demand topics. Results are based on search patterns and keyword variations.
            </p>
            <p>
              <strong className="text-foreground">With YouTube API:</strong> Get enhanced metrics including video view counts, 
              channel sizes, and competition analysis for more accurate opportunity scores.
            </p>
            <p>
              <strong className="text-foreground">Script Generation:</strong> Uses OpenAI to create complete video scripts 
              following Mark Harbert's 5-part video formula.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
