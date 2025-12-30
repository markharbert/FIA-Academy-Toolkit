import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft, Copy, Check, Clock, FileText, MessageSquare, AlignLeft, Tags, Save, Pencil, Search, Youtube, ChevronLeft, Eye, ThumbsUp, Sparkles, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Script, ScriptJson, SavedOffer } from "@shared/schema";
import { Gift, Star, RefreshCw } from "lucide-react";

interface YouTubeVideo {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
}

interface YouTubeComment {
  id: string;
  authorName: string;
  authorProfileImage: string;
  text: string;
  likeCount: number;
  publishedAt: string;
}

interface YouTubeVideoDetails extends YouTubeVideo {
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  duration: string | null;
  tags: string[];
  comments: YouTubeComment[];
  commentSummary: string | null;
}

function YouTubeResearchPanel({ defaultKeyword }: { defaultKeyword?: string }) {
  const [searchQuery, setSearchQuery] = useState(defaultKeyword || "");
  const [activeQuery, setActiveQuery] = useState(defaultKeyword || "");
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: videos, isLoading } = useQuery<YouTubeVideo[]>({
    queryKey: ["/api/youtube/search", activeQuery],
    queryFn: async () => {
      if (!activeQuery) return [];
      const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(activeQuery)}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: !!activeQuery,
  });

  const { data: videoDetails, isLoading: isLoadingDetails } = useQuery<YouTubeVideoDetails>({
    queryKey: ["/api/youtube/video", selectedVideoId],
    queryFn: async () => {
      const res = await fetch(`/api/youtube/video/${selectedVideoId}`);
      if (!res.ok) throw new Error("Failed to load video details");
      return res.json();
    },
    enabled: !!selectedVideoId,
  });

  const formatNumber = (num: number | null) => {
    if (num === null) return "N/A";
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length >= 2) {
      setActiveQuery(searchQuery.trim());
      setSelectedVideoId(null);
    } else {
      toast({ title: "Please enter at least 2 characters", variant: "destructive" });
    }
  };

  return (
    <div className="h-full flex flex-col bg-muted/30">
      <div className="p-3 border-b bg-background">
        <div className="flex items-center gap-2 mb-2">
          <Youtube className="h-4 w-4 text-red-500" />
          <h3 className="font-medium text-sm">Video Research</h3>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search YouTube..."
            className="flex-1"
            data-testid="input-youtube-search"
          />
          <Button type="submit" size="icon" disabled={isLoading} data-testid="button-youtube-search">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </form>
      </div>

      {selectedVideoId ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-2 border-b bg-background flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedVideoId(null)}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </div>
          <div className="flex-1 overflow-auto">
            <div className="aspect-video bg-black">
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${selectedVideoId}`}
                title="Video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            {isLoadingDetails ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : videoDetails ? (
              <div className="p-3 space-y-3">
                <h4 className="font-medium text-sm line-clamp-2">{videoDetails.title}</h4>
                <p className="text-xs text-muted-foreground">{videoDetails.channelTitle}</p>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Views</p>
                      <p className="text-sm font-medium">{formatNumber(videoDetails.viewCount)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    <ThumbsUp className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Likes</p>
                      <p className="text-sm font-medium">{formatNumber(videoDetails.likeCount)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Comments</p>
                      <p className="text-sm font-medium">{formatNumber(videoDetails.commentCount)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Duration</p>
                      <p className="text-sm font-medium">{videoDetails.duration || "N/A"}</p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground line-clamp-4">{videoDetails.description}</p>

                {videoDetails.tags && videoDetails.tags.length > 0 && (
                  <div className="pt-3 border-t">
                    <h5 className="text-xs font-medium mb-2 flex items-center gap-1">
                      <Tags className="h-3 w-3" />
                      Video Tags ({videoDetails.tags.length})
                    </h5>
                    <div className="flex flex-wrap gap-1">
                      {videoDetails.tags.map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {videoDetails.commentSummary && (
                  <div className="pt-3 border-t">
                    <h5 className="text-xs font-medium mb-2 flex items-center gap-1 text-primary">
                      <Sparkles className="h-3 w-3" />
                      AI Comment Summary
                    </h5>
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                      {videoDetails.commentSummary}
                    </p>
                  </div>
                )}

                {videoDetails.comments && videoDetails.comments.length > 0 && (
                  <div className="pt-3 border-t">
                    <h5 className="text-xs font-medium mb-2 flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      Top Comments ({videoDetails.comments.length})
                    </h5>
                    <div className="space-y-3">
                      {videoDetails.comments.map((comment) => (
                        <div key={comment.id} className="text-xs">
                          <div className="flex items-center gap-2 mb-1">
                            <img 
                              src={comment.authorProfileImage} 
                              alt="" 
                              className="w-5 h-5 rounded-full"
                            />
                            <span className="font-medium truncate">{comment.authorName}</span>
                            {comment.likeCount > 0 && (
                              <span className="text-muted-foreground flex items-center gap-0.5">
                                <ThumbsUp className="h-3 w-3" />
                                {comment.likeCount}
                              </span>
                            )}
                          </div>
                          <p className="text-muted-foreground line-clamp-3 pl-7">{comment.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : videos && videos.length > 0 ? (
              videos.map((video) => (
                <div
                  key={video.videoId}
                  className="flex gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                  onClick={() => setSelectedVideoId(video.videoId)}
                  data-testid={`video-item-${video.videoId}`}
                >
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-48 h-32 object-cover rounded flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold line-clamp-2">{video.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{video.channelTitle}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {video.viewCount !== null && (
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {video.viewCount >= 1000000 
                            ? `${(video.viewCount / 1000000).toFixed(1)}M` 
                            : video.viewCount >= 1000 
                              ? `${(video.viewCount / 1000).toFixed(0)}K` 
                              : video.viewCount}
                        </span>
                      )}
                      {video.likeCount !== null && (
                        <span className="flex items-center gap-1">
                          <ThumbsUp className="h-3 w-3" />
                          {video.likeCount >= 1000 
                            ? `${(video.likeCount / 1000).toFixed(0)}K` 
                            : video.likeCount}
                        </span>
                      )}
                      {video.commentCount !== null && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {video.commentCount >= 1000 
                            ? `${(video.commentCount / 1000).toFixed(0)}K` 
                            : video.commentCount}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{video.description}</p>
                  </div>
                </div>
              ))
            ) : activeQuery ? (
              <p className="text-center text-sm text-muted-foreground py-8">No videos found</p>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-8">
                Search for videos to research ideas
              </p>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function CopyButton({ text, label, html }: { text: string; label: string; html?: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      if (html) {
        const blob = new Blob([html], { type: "text/html" });
        const textBlob = new Blob([text], { type: "text/plain" });
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": blob,
            "text/plain": textBlob,
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
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

function CallToActionTab({ 
  scriptId, 
  editedScriptJson, 
  setEditedScriptJson,
  updateScriptMutation,
}: { 
  scriptId: string;
  editedScriptJson: ScriptJson | null;
  setEditedScriptJson: (json: ScriptJson | null) => void;
  updateScriptMutation: any;
}) {
  const { toast } = useToast();
  const [newOfferName, setNewOfferName] = useState("");
  const [newOfferDescription, setNewOfferDescription] = useState("");
  const [newOfferLinkUrl, setNewOfferLinkUrl] = useState("");
  const [newOfferLinkLabel, setNewOfferLinkLabel] = useState("");
  const [isAddingOffer, setIsAddingOffer] = useState(false);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [editLinkLabel, setEditLinkLabel] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: offers, isLoading } = useQuery<SavedOffer[]>({
    queryKey: ["/api/topic-pulse/offers"],
  });

  const createOfferMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; linkUrl: string; linkLabel: string }) => {
      const res = await apiRequest("POST", "/api/topic-pulse/offers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/offers"] });
      setNewOfferName("");
      setNewOfferDescription("");
      setNewOfferLinkUrl("");
      setNewOfferLinkLabel("");
      setIsAddingOffer(false);
      toast({ title: "Offer saved!" });
    },
    onError: () => {
      toast({ title: "Failed to save offer", variant: "destructive" });
    },
  });

  const updateOfferMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SavedOffer> }) => {
      const res = await apiRequest("PATCH", `/api/topic-pulse/offers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/offers"] });
      setEditingOfferId(null);
      toast({ title: "Offer updated!" });
    },
    onError: () => {
      toast({ title: "Failed to update offer", variant: "destructive" });
    },
  });

  const deleteOfferMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/topic-pulse/offers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/offers"] });
      toast({ title: "Offer deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete offer", variant: "destructive" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/topic-pulse/offers/${id}/set-default`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/offers"] });
      toast({ title: "Default offer set!" });
    },
    onError: () => {
      toast({ title: "Failed to set default", variant: "destructive" });
    },
  });

  const handleRefreshFinalCTA = async () => {
    const defaultOffer = offers?.find(o => o.isDefault);
    if (!defaultOffer) {
      toast({ title: "Please set a default offer first", variant: "destructive" });
      return;
    }

    if (!editedScriptJson?.fullScript?.finalCTA) {
      toast({ title: "No script to update", variant: "destructive" });
      return;
    }

    setIsRefreshing(true);
    try {
      const offerText = defaultOffer.description 
        ? `${defaultOffer.name}: ${defaultOffer.description}` 
        : defaultOffer.name;
      const linkText = defaultOffer.linkLabel && defaultOffer.linkUrl 
        ? `Click the ${defaultOffer.linkLabel} link in the description` 
        : defaultOffer.linkUrl 
          ? `Check out the link in the description` 
          : "";

      const newFinalCTAText = `Now here's the thing - if you're ready to take action on what we just covered, I want to share something that's been a game-changer for me and my students. ${offerText}. ${linkText}. I'll also leave a link to my next video where we go even deeper on this topic. Make sure you hit that subscribe button if you haven't already, and I'll see you in the next one!`;

      const updatedScriptJson = {
        ...editedScriptJson,
        fullScript: {
          ...editedScriptJson.fullScript,
          finalCTA: {
            ...editedScriptJson.fullScript.finalCTA,
            text: newFinalCTAText,
          },
        },
      };

      setEditedScriptJson(updatedScriptJson);
      
      await updateScriptMutation.mutateAsync({
        scriptJson: updatedScriptJson,
      });

      toast({ title: "Final CTA updated with your offer!" });
    } catch {
      toast({ title: "Failed to refresh Final CTA", variant: "destructive" });
    } finally {
      setIsRefreshing(false);
    }
  };

  const startEditing = (offer: SavedOffer) => {
    setEditingOfferId(offer.id);
    setEditName(offer.name);
    setEditDescription(offer.description || "");
    setEditLinkUrl(offer.linkUrl || "");
    setEditLinkLabel(offer.linkLabel || "");
  };

  const handleSaveEdit = () => {
    if (!editingOfferId) return;
    updateOfferMutation.mutate({
      id: editingOfferId,
      data: {
        name: editName,
        description: editDescription,
        linkUrl: editLinkUrl,
        linkLabel: editLinkLabel,
      },
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Gift className="h-5 w-5" />
            Your Saved Offers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : offers && offers.length > 0 ? (
            <div className="space-y-3">
              {offers.map((offer) => (
                <div 
                  key={offer.id} 
                  className={`p-4 rounded-md border ${offer.isDefault ? "border-primary bg-primary/5" : "bg-muted/30"}`}
                >
                  {editingOfferId === offer.id ? (
                    <div className="space-y-3">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Offer name"
                        data-testid="input-edit-offer-name"
                      />
                      <Textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder="Description (what is this offer?)"
                        className="min-h-[60px]"
                        data-testid="textarea-edit-offer-description"
                      />
                      <Input
                        value={editLinkUrl}
                        onChange={(e) => setEditLinkUrl(e.target.value)}
                        placeholder="Link URL"
                        data-testid="input-edit-offer-url"
                      />
                      <Input
                        value={editLinkLabel}
                        onChange={(e) => setEditLinkLabel(e.target.value)}
                        placeholder="Link label (e.g., 'first link')"
                        data-testid="input-edit-offer-label"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveEdit} disabled={updateOfferMutation.isPending} data-testid="button-save-offer-edit">
                          {updateOfferMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingOfferId(null)} data-testid="button-cancel-offer-edit">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{offer.name}</h4>
                          {offer.isDefault && (
                            <Badge variant="default" className="text-xs">
                              <Star className="h-3 w-3 mr-1" />
                              Default
                            </Badge>
                          )}
                        </div>
                        {offer.description && (
                          <p className="text-sm text-muted-foreground mt-1">{offer.description}</p>
                        )}
                        {offer.linkUrl && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {offer.linkLabel || "Link"}: {offer.linkUrl}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {!offer.isDefault && (
                          <Button 
                            size="icon" 
                            variant="ghost"
                            onClick={() => setDefaultMutation.mutate(offer.id)}
                            disabled={setDefaultMutation.isPending}
                            title="Set as default"
                            data-testid={`button-set-default-${offer.id}`}
                          >
                            <Star className="h-4 w-4" />
                          </Button>
                        )}
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={() => startEditing(offer)}
                          data-testid={`button-edit-offer-${offer.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost"
                          onClick={() => deleteOfferMutation.mutate(offer.id)}
                          disabled={deleteOfferMutation.isPending}
                          data-testid={`button-delete-offer-${offer.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No saved offers yet. Add your first offer below!
            </p>
          )}

          {isAddingOffer ? (
            <div className="mt-4 p-4 border rounded-md space-y-3">
              <Input
                value={newOfferName}
                onChange={(e) => setNewOfferName(e.target.value)}
                placeholder="Offer name (e.g., 'Free Marketing Course')"
                data-testid="input-new-offer-name"
              />
              <Textarea
                value={newOfferDescription}
                onChange={(e) => setNewOfferDescription(e.target.value)}
                placeholder="Description (e.g., 'My free 5-day email course on video marketing')"
                className="min-h-[60px]"
                data-testid="textarea-new-offer-description"
              />
              <Input
                value={newOfferLinkUrl}
                onChange={(e) => setNewOfferLinkUrl(e.target.value)}
                placeholder="Link URL (e.g., 'https://yoursite.com/free-course')"
                data-testid="input-new-offer-url"
              />
              <Input
                value={newOfferLinkLabel}
                onChange={(e) => setNewOfferLinkLabel(e.target.value)}
                placeholder="Link label (e.g., 'first link in the description')"
                data-testid="input-new-offer-label"
              />
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  onClick={() => createOfferMutation.mutate({
                    name: newOfferName,
                    description: newOfferDescription,
                    linkUrl: newOfferLinkUrl,
                    linkLabel: newOfferLinkLabel,
                  })}
                  disabled={!newOfferName.trim() || createOfferMutation.isPending}
                  data-testid="button-save-new-offer"
                >
                  {createOfferMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Offer"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setIsAddingOffer(false)} data-testid="button-cancel-new-offer">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button 
              variant="outline" 
              className="w-full mt-4" 
              onClick={() => setIsAddingOffer(true)}
              data-testid="button-add-offer"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add New Offer
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Refresh Final CTA
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Click the button below to update your script's Final CTA section with your default offer. 
            This will replace only the Final CTA text - all other sections remain unchanged.
          </p>
          <Button 
            onClick={handleRefreshFinalCTA}
            disabled={isRefreshing || !offers?.some(o => o.isDefault)}
            data-testid="button-refresh-final-cta"
          >
            {isRefreshing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Final CTA with Default Offer
              </>
            )}
          </Button>
          {!offers?.some(o => o.isDefault) && offers && offers.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Set one of your offers as default to enable this feature
            </p>
          )}
        </CardContent>
      </Card>
    </div>
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

interface ContentSection {
  title: string;
  content: string;
  timestamp?: string;
  brollIdeas?: string[];
  onScreenText?: string[];
}

function EditableContentSubSection({
  section,
  index,
  onUpdate,
  onDelete,
}: {
  section: ContentSection;
  index: number;
  onUpdate: (index: number, section: ContentSection) => void;
  onDelete: (index: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(section.title);
  const [editContent, setEditContent] = useState(section.content);
  const [editTimestamp, setEditTimestamp] = useState(section.timestamp || "");

  useEffect(() => {
    setEditTitle(section.title);
    setEditContent(section.content);
    setEditTimestamp(section.timestamp || "");
  }, [section]);

  const handleSave = () => {
    onUpdate(index, {
      ...section,
      title: editTitle,
      content: editContent,
      timestamp: editTimestamp || undefined,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(section.title);
    setEditContent(section.content);
    setEditTimestamp(section.timestamp || "");
    setIsEditing(false);
  };

  return (
    <div className="p-4 bg-muted/30">
      {isEditing ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={editTimestamp}
              onChange={(e) => setEditTimestamp(e.target.value)}
              placeholder="Timestamp (e.g., 2:30)"
              className="w-24"
              data-testid={`input-timestamp-${index}`}
            />
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Section title"
              className="flex-1"
              data-testid={`input-title-${index}`}
            />
          </div>
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[120px] font-mono text-sm"
            placeholder="Section content..."
            data-testid={`textarea-content-section-${index}`}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} data-testid={`button-save-content-section-${index}`}>
              <Check className="h-4 w-4 mr-1" />
              Done
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{section.timestamp || `Section ${index + 1}`}</Badge>
              <span className="font-medium">{section.title}</span>
            </div>
            <div className="flex gap-1">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsEditing(true)}
                data-testid={`button-edit-content-section-${index}`}
              >
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => onDelete(index)}
                className="text-destructive hover:text-destructive"
                data-testid={`button-delete-content-section-${index}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-sm whitespace-pre-wrap">{section.content}</p>
          {section.brollIdeas && section.brollIdeas.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              <strong>B-Roll:</strong> {section.brollIdeas.join(", ")}
            </div>
          )}
        </>
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
  
  // Check content sections
  const origSections = origFull.content.sections || [];
  const editSections = editFull.content.sections || [];
  if (origSections.length !== editSections.length) return true;
  for (let i = 0; i < origSections.length; i++) {
    if (origSections[i].title !== editSections[i].title) return true;
    if (origSections[i].content !== editSections[i].content) return true;
    if (origSections[i].timestamp !== editSections[i].timestamp) return true;
  }
  
  return false;
}

export default function TopicPulseScriptPage() {
  const { scriptId } = useParams<{ scriptId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [editedScriptJson, setEditedScriptJson] = useState<ScriptJson | null>(null);
  const [showResearchPanel, setShowResearchPanel] = useState(false);

  const { data: script, isLoading } = useQuery<Script>({
    queryKey: ["/api/topic-pulse/scripts", scriptId],
    enabled: !!scriptId,
  });

  // Handle double-nested structure from previous bug for comparison
  const getUnnestedScriptJson = (json: any): ScriptJson | null => {
    if (!json) return null;
    if (json.scriptJson && json.scriptJson.fullScript) {
      return json.scriptJson as ScriptJson;
    }
    return json as ScriptJson;
  };
  const originalScriptJson = getUnnestedScriptJson(script?.scriptJson);
  const hasChanges = hasScriptChanged(originalScriptJson, editedScriptJson);

  useEffect(() => {
    if (script?.scriptJson) {
      // Handle double-nested structure from previous bug
      const json = script.scriptJson as any;
      if (json.scriptJson && json.scriptJson.fullScript) {
        setEditedScriptJson(json.scriptJson as ScriptJson);
      } else {
        setEditedScriptJson(json as ScriptJson);
      }
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

  const handleContentSectionUpdate = (index: number, updatedSection: ContentSection) => {
    if (!editedScriptJson?.fullScript?.content.sections) return;
    const newSections = [...editedScriptJson.fullScript.content.sections];
    newSections[index] = updatedSection;
    setEditedScriptJson({
      ...editedScriptJson,
      fullScript: {
        ...editedScriptJson.fullScript,
        content: {
          ...editedScriptJson.fullScript.content,
          sections: newSections,
        },
      },
    });
  };

  const handleContentSectionDelete = (index: number) => {
    if (!editedScriptJson?.fullScript?.content.sections) return;
    const newSections = editedScriptJson.fullScript.content.sections.filter((_, i) => i !== index);
    setEditedScriptJson({
      ...editedScriptJson,
      fullScript: {
        ...editedScriptJson.fullScript,
        content: {
          ...editedScriptJson.fullScript.content,
          sections: newSections,
        },
      },
    });
  };

  const handleAddContentSection = () => {
    if (!editedScriptJson?.fullScript) return;
    const currentSections = editedScriptJson.fullScript.content.sections || [];
    const newSection: ContentSection = {
      title: `New Section ${currentSections.length + 1}`,
      content: "Add your content here...",
      timestamp: "",
    };
    setEditedScriptJson({
      ...editedScriptJson,
      fullScript: {
        ...editedScriptJson.fullScript,
        content: {
          ...editedScriptJson.fullScript.content,
          sections: [...currentSections, newSection],
        },
      },
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
    if (!editedScriptJson?.fullScript) return "";
    const fs = editedScriptJson.fullScript;
    
    const sections: string[] = [];
    
    // Hook
    sections.push("");
    sections.push("═══════════════════════════════════════");
    sections.push("1. HOOK");
    sections.push("═══════════════════════════════════════");
    sections.push("");
    sections.push(fs.hook.text);
    if (fs.hook.duration) sections.push(`\n[Duration: ${fs.hook.duration}]`);
    
    // Set the Hook
    sections.push("");
    sections.push("");
    sections.push("═══════════════════════════════════════");
    sections.push("2. SET THE HOOK");
    sections.push("═══════════════════════════════════════");
    sections.push("");
    sections.push(fs.setHook.text);
    if (fs.setHook.duration) sections.push(`\n[Duration: ${fs.setHook.duration}]`);
    
    // First CTA
    sections.push("");
    sections.push("");
    sections.push("═══════════════════════════════════════");
    sections.push("3. FIRST CALL TO ACTION");
    sections.push("═══════════════════════════════════════");
    sections.push("");
    sections.push(fs.firstCTA.text);
    if (fs.firstCTA.duration) sections.push(`\n[Duration: ${fs.firstCTA.duration}]`);
    
    // Content
    sections.push("");
    sections.push("");
    sections.push("═══════════════════════════════════════");
    sections.push("4. CONTENT");
    sections.push("═══════════════════════════════════════");
    sections.push("");
    sections.push(fs.content.text);

    // Add content sections
    if (fs.content.sections && fs.content.sections.length > 0) {
      fs.content.sections.forEach((section, i) => {
        sections.push("");
        sections.push(`   → Section ${i + 1}: ${section.title}${section.timestamp ? ` [${section.timestamp}]` : ""}`);
        sections.push("");
        sections.push(section.content);
        if (section.brollIdeas && section.brollIdeas.length > 0) {
          sections.push(`\n   B-Roll Ideas: ${section.brollIdeas.join(", ")}`);
        }
      });
    }

    // Final CTA
    sections.push("");
    sections.push("");
    sections.push("═══════════════════════════════════════");
    sections.push("5. FINAL CALL TO ACTION");
    sections.push("═══════════════════════════════════════");
    sections.push("");
    sections.push(fs.finalCTA.text);
    if (fs.finalCTA.duration) sections.push(`\n[Duration: ${fs.finalCTA.duration}]`);

    if (fs.finalCTA.nextVideoSuggestion) {
      sections.push(`\nNext Video Suggestion: ${fs.finalCTA.nextVideoSuggestion}`);
    }

    return sections.join("\n");
  };

  const getFullScriptHtml = () => {
    if (!editedScriptJson?.fullScript) return "";
    const fs = editedScriptJson.fullScript;
    
    const escapeHtml = (text: string) => text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
    
    let html = `<div style="font-family: Arial, sans-serif; line-height: 1.6;">`;
    
    // Hook
    html += `<p><strong style="font-size: 16px;">1. HOOK</strong></p>`;
    html += `<p>${escapeHtml(fs.hook.text)}</p>`;
    if (fs.hook.duration) html += `<p><em>[Duration: ${fs.hook.duration}]</em></p>`;
    html += `<br>`;
    
    // Set the Hook
    html += `<p><strong style="font-size: 16px;">2. SET THE HOOK</strong></p>`;
    html += `<p>${escapeHtml(fs.setHook.text)}</p>`;
    if (fs.setHook.duration) html += `<p><em>[Duration: ${fs.setHook.duration}]</em></p>`;
    html += `<br>`;
    
    // First CTA
    html += `<p><strong style="font-size: 16px;">3. FIRST CALL TO ACTION</strong></p>`;
    html += `<p>${escapeHtml(fs.firstCTA.text)}</p>`;
    if (fs.firstCTA.duration) html += `<p><em>[Duration: ${fs.firstCTA.duration}]</em></p>`;
    html += `<br>`;
    
    // Content
    html += `<p><strong style="font-size: 16px;">4. CONTENT</strong></p>`;
    html += `<p>${escapeHtml(fs.content.text)}</p>`;

    // Add content sections
    if (fs.content.sections && fs.content.sections.length > 0) {
      fs.content.sections.forEach((section, i) => {
        html += `<br>`;
        html += `<p style="margin-left: 20px;"><strong style="color: #DC2626;">→ Section ${i + 1}: ${escapeHtml(section.title)}${section.timestamp ? ` [${section.timestamp}]` : ""}</strong></p>`;
        html += `<p style="margin-left: 20px;">${escapeHtml(section.content)}</p>`;
        if (section.brollIdeas && section.brollIdeas.length > 0) {
          html += `<p style="margin-left: 20px;"><em>B-Roll Ideas: ${escapeHtml(section.brollIdeas.join(", "))}</em></p>`;
        }
      });
    }
    html += `<br>`;

    // Final CTA
    html += `<p><strong style="font-size: 16px;">5. FINAL CALL TO ACTION</strong></p>`;
    html += `<p>${escapeHtml(fs.finalCTA.text)}</p>`;
    if (fs.finalCTA.duration) html += `<p><em>[Duration: ${fs.finalCTA.duration}]</em></p>`;

    if (fs.finalCTA.nextVideoSuggestion) {
      html += `<p><em>Next Video Suggestion: ${escapeHtml(fs.finalCTA.nextVideoSuggestion)}</em></p>`;
    }

    html += `</div>`;
    return html;
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
          <Button 
            size="sm"
            onClick={() => setShowResearchPanel(!showResearchPanel)}
            className="hidden md:flex bg-red-600 hover:bg-red-700 text-white border-red-600"
            data-testid="button-toggle-research"
          >
            <Youtube className="h-4 w-4 mr-2" />
            {showResearchPanel ? "Hide" : "Show"} Video Research
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        <Tabs defaultValue="full" className="flex-1 h-full flex flex-col overflow-hidden">
          <div className="border-b px-4">
            <TabsList className="h-12">
              <TabsTrigger value="full" className="flex items-center gap-2" data-testid="tab-full-script">
                <FileText className="h-4 w-4" />
                Long Form Script
              </TabsTrigger>
              <TabsTrigger value="shorts" className="flex items-center gap-2" data-testid="tab-shorts">
                <AlignLeft className="h-4 w-4" />
                Shorts Script
              </TabsTrigger>
              <TabsTrigger value="description" className="flex items-center gap-2" data-testid="tab-description">
                <Tags className="h-4 w-4" />
                Description
              </TabsTrigger>
              <TabsTrigger value="comment" className="flex items-center gap-2" data-testid="tab-comment">
                <MessageSquare className="h-4 w-4" />
                Pinned Comment
              </TabsTrigger>
              <TabsTrigger value="cta" className="flex items-center gap-2" data-testid="tab-cta">
                <Gift className="h-4 w-4" />
                Call To Action
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="full" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full">
              <div className="p-4 max-w-3xl mx-auto">
                <div className="flex justify-end mb-4 gap-2">
                  <CopyButton text={getFullScriptText()} label="Copy Full Script" html={getFullScriptHtml()} />
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
                      {editedScriptJson?.fullScript?.content.sections?.map((section, i) => (
                        <EditableContentSubSection
                          key={i}
                          section={section}
                          index={i}
                          onUpdate={handleContentSectionUpdate}
                          onDelete={handleContentSectionDelete}
                        />
                      ))}
                      <div className="p-4 border-t border-dashed">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={handleAddContentSection}
                          className="w-full"
                          data-testid="button-add-content-section"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Content Section
                        </Button>
                      </div>
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

          <TabsContent value="cta" className="flex-1 overflow-hidden m-0">
            <ScrollArea className="h-full">
              <div className="p-4 max-w-3xl mx-auto">
                <CallToActionTab 
                  scriptId={script.id}
                  editedScriptJson={editedScriptJson}
                  setEditedScriptJson={setEditedScriptJson}
                  updateScriptMutation={saveMutation}
                />
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {showResearchPanel && (
          <div className="hidden md:block w-[525px] border-l flex-shrink-0 overflow-hidden">
            <YouTubeResearchPanel defaultKeyword={script.title} />
          </div>
        )}
      </div>
    </div>
  );
}
