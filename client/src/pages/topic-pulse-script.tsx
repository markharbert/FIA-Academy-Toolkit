import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, ArrowLeft, Copy, Check, ChevronDown, Clock, FileText, MessageSquare, AlignLeft, Tags } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Script, ScriptJson } from "@shared/schema";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast({ title: `${label} copied!` });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleCopy} data-testid={`button-copy-${label.toLowerCase().replace(/\s/g, "-")}`}>
      {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
      {label}
    </Button>
  );
}

function ScriptSection({ title, content, duration, onScreenText, isOpen = true }: { 
  title: string; 
  content: string; 
  duration?: string;
  onScreenText?: string[];
  isOpen?: boolean;
}) {
  const [open, setOpen] = useState(isOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 hover-elevate rounded-md">
        <div className="flex items-center gap-3">
          <span className="font-semibold">{title}</span>
          {duration && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {duration}
            </Badge>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
        {onScreenText && onScreenText.length > 0 && (
          <div className="mt-3 p-3 bg-muted/50 rounded-md">
            <p className="text-xs font-medium text-muted-foreground mb-2">On-Screen Text:</p>
            <ul className="text-sm space-y-1">
              {onScreenText.map((text, i) => (
                <li key={i} className="text-muted-foreground">• {text}</li>
              ))}
            </ul>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function TopicPulseScriptPage() {
  const { scriptId } = useParams<{ scriptId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: script, isLoading } = useQuery<Script>({
    queryKey: ["/api/topic-pulse/scripts", scriptId],
    enabled: !!scriptId,
  });

  if (isLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!script) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <p className="text-muted-foreground">Script not found</p>
      </div>
    );
  }

  const scriptJson = script.scriptJson as ScriptJson | null;
  const fullScript = scriptJson?.fullScript;

  const getFullScriptText = () => {
    if (!fullScript) return "";
    return [
      `## HOOK\n${fullScript.hook.text}`,
      `## SET THE HOOK\n${fullScript.setHook.text}`,
      `## FIRST CALL TO ACTION\n${fullScript.firstCTA.text}`,
      `## CONTENT\n${fullScript.content.text}`,
      `## FINAL CALL TO ACTION\n${fullScript.finalCTA.text}`,
    ].join("\n\n");
  };

  return (
    <div className="min-h-full flex flex-col">
      <div className="border-b p-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/topic-pulse/scripts")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold" data-testid="text-script-title">{script.title}</h1>
            <p className="text-sm text-muted-foreground">
              Created {new Date(script.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="full" className="h-full flex flex-col">
          <div className="border-b px-4">
            <TabsList className="h-12">
              <TabsTrigger value="full" className="flex items-center gap-2" data-testid="tab-full-script">
                <FileText className="h-4 w-4" />
                Full Script
              </TabsTrigger>
              <TabsTrigger value="shorts" className="flex items-center gap-2" data-testid="tab-shorts">
                <AlignLeft className="h-4 w-4" />
                Shorts
              </TabsTrigger>
              <TabsTrigger value="comment" className="flex items-center gap-2" data-testid="tab-comment">
                <MessageSquare className="h-4 w-4" />
                Pinned Comment
              </TabsTrigger>
              <TabsTrigger value="description" className="flex items-center gap-2" data-testid="tab-description">
                <Tags className="h-4 w-4" />
                Description
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="full" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full">
              <div className="p-4 max-w-3xl mx-auto">
                <div className="flex justify-end mb-4 gap-2">
                  <CopyButton text={getFullScriptText()} label="Copy Full Script" />
                </div>

                {fullScript && (
                  <Card>
                    <CardContent className="p-0 divide-y">
                      <ScriptSection 
                        title="1. Hook" 
                        content={fullScript.hook.text} 
                        duration={fullScript.hook.duration}
                        onScreenText={fullScript.hook.onScreenText}
                      />
                      <ScriptSection 
                        title="2. Set the Hook" 
                        content={fullScript.setHook.text} 
                        duration={fullScript.setHook.duration}
                        onScreenText={fullScript.setHook.onScreenText}
                      />
                      <ScriptSection 
                        title="3. First CTA" 
                        content={fullScript.firstCTA.text} 
                        duration={fullScript.firstCTA.duration}
                      />
                      <ScriptSection 
                        title="4. Content" 
                        content={fullScript.content.text} 
                      />
                      {fullScript.content.sections?.map((section, i) => (
                        <div key={i} className="p-4 bg-muted/30">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">{section.timestamp || `Section ${i + 1}`}</Badge>
                            <span className="font-medium">{section.title}</span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{section.content}</p>
                          {section.brollIdeas && section.brollIdeas.length > 0 && (
                            <div className="mt-2 text-xs text-muted-foreground">
                              <strong>B-Roll:</strong> {section.brollIdeas.join(", ")}
                            </div>
                          )}
                        </div>
                      ))}
                      <ScriptSection 
                        title="5. Final CTA" 
                        content={fullScript.finalCTA.text} 
                        duration={fullScript.finalCTA.duration}
                      />
                      {fullScript.finalCTA.nextVideoSuggestion && (
                        <div className="p-4 bg-primary/5">
                          <p className="text-sm">
                            <strong>Next Video Suggestion:</strong> {fullScript.finalCTA.nextVideoSuggestion}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="shorts" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full">
              <div className="p-4 max-w-3xl mx-auto">
                <div className="flex justify-end mb-4">
                  <CopyButton text={scriptJson?.shortsScript || ""} label="Copy Shorts Script" />
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">YouTube Shorts Script</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">{scriptJson?.shortsScript || "No shorts script available"}</p>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="comment" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full">
              <div className="p-4 max-w-3xl mx-auto">
                <div className="flex justify-end mb-4">
                  <CopyButton text={scriptJson?.pinnedComment || ""} label="Copy Comment" />
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Pinned Comment</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-wrap">{scriptJson?.pinnedComment || "No pinned comment available"}</p>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="description" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full">
              <div className="p-4 max-w-3xl mx-auto">
                {scriptJson?.description && (
                  <>
                    <div className="flex justify-end mb-4">
                      <CopyButton 
                        text={`${scriptJson.description.summary}\n\n${scriptJson.description.affiliateDisclosure}\n\n${scriptJson.description.linkSection}\n\nTags: ${scriptJson.description.tags?.join(", ")}`} 
                        label="Copy Description" 
                      />
                    </div>
                    <div className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Summary</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p>{scriptJson.description.summary}</p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Affiliate Disclosure</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p>{scriptJson.description.affiliateDisclosure}</p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Link Section</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p>{scriptJson.description.linkSection}</p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Tags</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {scriptJson.description.tags?.map((tag, i) => (
                              <Badge key={i} variant="secondary">{tag}</Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
