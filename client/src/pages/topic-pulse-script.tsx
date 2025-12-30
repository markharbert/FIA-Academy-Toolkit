import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeft, Copy, Check, Clock, FileText, MessageSquare, AlignLeft, Tags, Save, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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

function EditableScriptSection({ 
  title, 
  content, 
  duration, 
  onScreenText,
  onChange,
  sectionKey,
}: { 
  title: string; 
  content: string; 
  duration?: string;
  onScreenText?: string[];
  onChange: (value: string) => void;
  sectionKey: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(content);

  useEffect(() => {
    setEditValue(content);
  }, [content]);

  const handleSave = () => {
    onChange(editValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(content);
    setIsEditing(false);
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold">{title}</span>
          {duration && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {duration}
            </Badge>
          )}
        </div>
        {!isEditing && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setIsEditing(true)}
            data-testid={`button-edit-${sectionKey}`}
          >
            <Pencil className="h-4 w-4 mr-1" />
            Edit
          </Button>
        )}
      </div>
      
      {isEditing ? (
        <div className="space-y-3">
          <Textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="min-h-[150px] font-mono text-sm"
            data-testid={`textarea-${sectionKey}`}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} data-testid={`button-save-${sectionKey}`}>
              <Check className="h-4 w-4 mr-1" />
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
      )}
      
      {onScreenText && onScreenText.length > 0 && !isEditing && (
        <div className="mt-3 p-3 bg-muted/50 rounded-md">
          <p className="text-xs font-medium text-muted-foreground mb-2">On-Screen Text:</p>
          <ul className="text-sm space-y-1">
            {onScreenText.map((text, i) => (
              <li key={i} className="text-muted-foreground">{text}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function hasScriptChanged(original: ScriptJson | null, edited: ScriptJson | null): boolean {
  if (!original || !edited) return false;
  
  if (original.shortsScript !== edited.shortsScript) return true;
  if (original.pinnedComment !== edited.pinnedComment) return true;
  
  const origFull = original.fullScript;
  const editFull = edited.fullScript;
  if (!origFull || !editFull) return origFull !== editFull;
  
  if (origFull.hook.text !== editFull.hook.text) return true;
  if (origFull.setHook.text !== editFull.setHook.text) return true;
  if (origFull.firstCTA.text !== editFull.firstCTA.text) return true;
  if (origFull.content.text !== editFull.content.text) return true;
  if (origFull.finalCTA.text !== editFull.finalCTA.text) return true;
  
  return false;
}

export default function TopicPulseScriptPage() {
  const { scriptId } = useParams<{ scriptId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [editedScriptJson, setEditedScriptJson] = useState<ScriptJson | null>(null);

  const { data: script, isLoading } = useQuery<Script>({
    queryKey: ["/api/topic-pulse/scripts", scriptId],
    enabled: !!scriptId,
  });

  const originalScriptJson = script?.scriptJson as ScriptJson | null;
  const hasChanges = hasScriptChanged(originalScriptJson, editedScriptJson);

  useEffect(() => {
    if (script?.scriptJson) {
      setEditedScriptJson(script.scriptJson as ScriptJson);
    }
  }, [script]);

  const saveMutation = useMutation({
    mutationFn: async (scriptJson: ScriptJson) => {
      const res = await apiRequest("PATCH", `/api/topic-pulse/scripts/${scriptId}`, { scriptJson });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Script saved!" });
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/scripts", scriptId] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save script", description: err.message, variant: "destructive" });
    },
  });

  const handleSectionChange = (section: keyof NonNullable<ScriptJson["fullScript"]>, value: string) => {
    if (!editedScriptJson?.fullScript) return;
    
    setEditedScriptJson({
      ...editedScriptJson,
      fullScript: {
        ...editedScriptJson.fullScript,
        [section]: {
          ...editedScriptJson.fullScript[section],
          text: value,
        },
      },
    });
  };

  const handleShortsChange = (value: string) => {
    if (!editedScriptJson) return;
    setEditedScriptJson({
      ...editedScriptJson,
      shortsScript: value,
    });
  };

  const handleCommentChange = (value: string) => {
    if (!editedScriptJson) return;
    setEditedScriptJson({
      ...editedScriptJson,
      pinnedComment: value,
    });
  };

  const handleSave = () => {
    if (editedScriptJson) {
      saveMutation.mutate(editedScriptJson);
    }
  };

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

  const fullScript = editedScriptJson?.fullScript;

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
          {hasChanges && (
            <Button 
              onClick={handleSave} 
              disabled={saveMutation.isPending}
              data-testid="button-save-script"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          )}
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
                      <EditableScriptSection 
                        title="1. Hook" 
                        content={fullScript.hook.text} 
                        duration={fullScript.hook.duration}
                        onScreenText={fullScript.hook.onScreenText}
                        onChange={(v) => handleSectionChange("hook", v)}
                        sectionKey="hook"
                      />
                      <EditableScriptSection 
                        title="2. Set the Hook" 
                        content={fullScript.setHook.text} 
                        duration={fullScript.setHook.duration}
                        onScreenText={fullScript.setHook.onScreenText}
                        onChange={(v) => handleSectionChange("setHook", v)}
                        sectionKey="set-hook"
                      />
                      <EditableScriptSection 
                        title="3. First CTA" 
                        content={fullScript.firstCTA.text} 
                        duration={fullScript.firstCTA.duration}
                        onChange={(v) => handleSectionChange("firstCTA", v)}
                        sectionKey="first-cta"
                      />
                      <EditableScriptSection 
                        title="4. Content" 
                        content={fullScript.content.text}
                        onChange={(v) => handleSectionChange("content", v)}
                        sectionKey="content"
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
                      <EditableScriptSection 
                        title="5. Final CTA" 
                        content={fullScript.finalCTA.text} 
                        duration={fullScript.finalCTA.duration}
                        onChange={(v) => handleSectionChange("finalCTA", v)}
                        sectionKey="final-cta"
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
                  <CopyButton text={editedScriptJson?.shortsScript || ""} label="Copy Shorts Script" />
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">YouTube Shorts Script</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={editedScriptJson?.shortsScript || ""}
                      onChange={(e) => handleShortsChange(e.target.value)}
                      className="min-h-[200px] font-mono text-sm"
                      placeholder="No shorts script available"
                      data-testid="textarea-shorts"
                    />
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="comment" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full">
              <div className="p-4 max-w-3xl mx-auto">
                <div className="flex justify-end mb-4">
                  <CopyButton text={editedScriptJson?.pinnedComment || ""} label="Copy Comment" />
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Pinned Comment</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={editedScriptJson?.pinnedComment || ""}
                      onChange={(e) => handleCommentChange(e.target.value)}
                      className="min-h-[150px] font-mono text-sm"
                      placeholder="No pinned comment available"
                      data-testid="textarea-comment"
                    />
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="description" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full">
              <div className="p-4 max-w-3xl mx-auto">
                {editedScriptJson?.description && (
                  <>
                    <div className="flex justify-end mb-4">
                      <CopyButton 
                        text={`${editedScriptJson.description.summary}\n\n${editedScriptJson.description.affiliateDisclosure}\n\n${editedScriptJson.description.linkSection}\n\nTags: ${editedScriptJson.description.tags?.join(", ")}`} 
                        label="Copy Description" 
                      />
                    </div>
                    <div className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Summary</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p>{editedScriptJson.description.summary}</p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Affiliate Disclosure</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p>{editedScriptJson.description.affiliateDisclosure}</p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Link Section</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p>{editedScriptJson.description.linkSection}</p>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Tags</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {editedScriptJson.description.tags?.map((tag, i) => (
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
