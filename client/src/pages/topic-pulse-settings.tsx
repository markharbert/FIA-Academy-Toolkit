import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, CheckCircle2, XCircle, Key, Youtube, MessageSquare, Search, Eye, EyeOff, Trash2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface KeywordsEverywhereKeyStatus {
  configured: boolean;
  keyLastFour: string | null;
  updatedAt: string | null;
}

export default function TopicPulseSettingsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  const { data: status } = useQuery<{ youtube: boolean; openai: boolean; reddit: boolean; keywordsEverywhere: boolean }>({
    queryKey: ["/api/topic-pulse/status"],
  });

  const { data: keApiKeyStatus, isLoading: isLoadingKeyStatus } = useQuery<KeywordsEverywhereKeyStatus>({
    queryKey: ["/api/topic-pulse/api-keys/keywords-everywhere"],
  });

  const saveKeyMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      const res = await apiRequest("/api/topic-pulse/api-keys/keywords-everywhere", {
        method: "POST",
        body: JSON.stringify({ apiKey }),
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/api-keys/keywords-everywhere"] });
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/keywords-everywhere-credits"] });
      setApiKeyInput("");
      toast({ title: "API key saved", description: "Your Keywords Everywhere API key has been securely stored." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to save API key", variant: "destructive" });
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/topic-pulse/api-keys/keywords-everywhere", { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/api-keys/keywords-everywhere"] });
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/keywords-everywhere-credits"] });
      toast({ title: "API key removed", description: "Your Keywords Everywhere API key has been deleted." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to remove API key", variant: "destructive" });
    },
  });
  
  const isMutating = saveKeyMutation.isPending || deleteKeyMutation.isPending;

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim().length < 10) {
      toast({ title: "Invalid key", description: "Please enter a valid API key", variant: "destructive" });
      return;
    }
    saveKeyMutation.mutate(apiKeyInput.trim());
  };

  return (
    <div className="min-h-full">
      <div className="border-b p-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/video-trends")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-page-title">Video Trends Settings</h1>
            <p className="text-sm text-muted-foreground">API keys and preferences</p>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Keywords Everywhere API Key
            </CardTitle>
            <CardDescription>
              Required for keyword search volume, CPC, and competition data. Get your key at{" "}
              <a 
                href="https://keywordseverywhere.com/ke/pricing.html" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
                data-testid="link-keywords-everywhere"
              >
                keywordseverywhere.com
                <ExternalLink className="h-3 w-3" />
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingKeyStatus ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : keApiKeyStatus?.configured ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Key className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="font-medium">API Key Configured</p>
                      <p className="text-sm text-muted-foreground">
                        Ending in ...{keApiKeyStatus.keyLastFour}
                      </p>
                    </div>
                  </div>
                  <Badge variant="default" className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Active
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteKeyMutation.mutate()}
                    disabled={isMutating}
                    data-testid="button-delete-api-key"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {deleteKeyMutation.isPending ? "Removing..." : "Remove Key"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Key className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">No API Key Configured</p>
                      <p className="text-sm text-muted-foreground">
                        Add your key to enable keyword metrics
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    Not Set
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      placeholder="Enter your Keywords Everywhere API key"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      disabled={isMutating}
                      className="pr-10"
                      data-testid="input-api-key"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() => setShowApiKey(!showApiKey)}
                      disabled={isMutating}
                      data-testid="button-toggle-visibility"
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button
                    onClick={handleSaveApiKey}
                    disabled={isMutating || !apiKeyInput.trim()}
                    data-testid="button-save-api-key"
                  >
                    {saveKeyMutation.isPending ? "Saving..." : "Save Key"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              System API Configuration
            </CardTitle>
            <CardDescription>
              These services power Video Trends. System-level API keys are managed by your administrator.
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
              <strong className="text-foreground">Keywords Everywhere:</strong> Provides search volume, CPC, 
              and competition data for each topic. Credits are consumed per keyword lookup ($10 = 100,000 credits).
            </p>
            <p>
              <strong className="text-foreground">Without YouTube API:</strong> Video Trends uses YouTube autocomplete 
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
