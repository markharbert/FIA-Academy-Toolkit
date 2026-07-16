import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, ArrowLeft, Copy, Check, FileText, Save, Search, Youtube, ChevronLeft, Eye, ThumbsUp, MessageSquare, Sparkles, Plus, Trash2, TrendingUp, TrendingDown, Minus, HelpCircle, FileDown, Play, Pause, X, RotateCcw, MonitorPlay, ChevronUp, ChevronDown, BookmarkPlus, Wand2, Brain, Clock, Tags, Video } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { openTeleprompter } from "@/lib/teleprompter";
import type { Script, ScriptJson, SavedOffer, Topic } from "@shared/schema";
import { Gift, Star, RefreshCw } from "lucide-react";
import academyLogoPath from "@assets/Media_&_Images_—_Kiss_Cut_Fearless_Influencer_Logo_—_2024-04_1777420277879.png";

type TrendDataPoint = { year: number; month: string; value: number };

function formatSearchVolume(volume: number | null | undefined): string {
  if (volume === null || volume === undefined) return "N/A";
  if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
  if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
  return volume.toString();
}

function formatCPC(cpc: number | null | undefined): string {
  if (cpc === null || cpc === undefined) return "N/A";
  return `$${cpc.toFixed(2)}`;
}

function formatCompetition(competition: number | null | undefined): { label: string; color: string; value: string } {
  if (competition === null || competition === undefined) {
    return { label: "N/A", color: "text-muted-foreground", value: "" };
  }
  const percent = Math.round(competition * 100);
  if (competition <= 0.33) return { label: "Low", color: "text-green-600 dark:text-green-400", value: `${percent}%` };
  if (competition <= 0.66) return { label: "Medium", color: "text-yellow-600 dark:text-yellow-400", value: `${percent}%` };
  return { label: "High", color: "text-red-600 dark:text-red-400", value: `${percent}%` };
}

function getTrendFromData(trend: TrendDataPoint[] | null | undefined): { direction: string; label: string } {
  if (!trend || trend.length < 6) return { direction: "unknown", label: "Unknown" };
  const recentMonths = trend.slice(-3);
  const olderMonths = trend.slice(-6, -3);
  const recentAvg = recentMonths.reduce((sum, t) => sum + t.value, 0) / recentMonths.length;
  const olderAvg = olderMonths.reduce((sum, t) => sum + t.value, 0) / olderMonths.length;
  if (olderAvg === 0) return { direction: "unknown", label: "Unknown" };
  const growthRate = (recentAvg - olderAvg) / olderAvg;
  const percentChange = Math.round(growthRate * 100);
  if (growthRate > 0.1) return { direction: "rising", label: `+${percentChange}%` };
  if (growthRate < -0.1) return { direction: "falling", label: `${percentChange}%` };
  return { direction: "steady", label: "Steady" };
}

function getOpportunityLevel(score: number): { color: string; label: string } {
  if (score >= 70) return { color: "text-green-600 dark:text-green-400", label: "Great opportunity" };
  if (score >= 50) return { color: "text-yellow-600 dark:text-yellow-400", label: "Good potential" };
  return { color: "text-red-600 dark:text-red-400", label: "Challenging" };
}

function TrendIcon({ direction }: { direction: string }) {
  if (direction === "rising") return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (direction === "falling") return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function HeroIntentAnalysis({ analysis }: { analysis?: string | null }) {
  if (!analysis) return null;
  return (
    <div className="mt-3 pt-3 border-t border-white/10 flex items-start gap-2.5">
      <Brain className="h-4 w-4 text-white/40 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-white/40 text-xs font-semibold uppercase tracking-wider">Intent Analysis</span>
        <p className="text-white/75 text-sm leading-relaxed mt-1" data-testid="text-hero-intent-analysis">{analysis}</p>
      </div>
    </div>
  );
}

function KeywordDataDisplay({ topic }: { topic: Topic }) {
  const trend = getTrendFromData(topic.trendData as TrendDataPoint[] | null);
  const competition = formatCompetition(topic.competition);
  const opportunityLevel = getOpportunityLevel(topic.opportunityScore || 0);

  const stats = [
    {
      label: "Monthly Searches",
      value: <span className="font-mono text-base font-bold text-blue-400" data-testid="text-search-volume">{formatSearchVolume(topic.monthlySearchVolume)}</span>,
      tip: "Estimated monthly searches on Google (Keywords Everywhere)",
      accent: "border-blue-500/40",
    },
    {
      label: "Opportunity",
      value: <span className={`font-mono text-base font-bold ${opportunityLevel.color}`} data-testid="text-opportunity-score">{topic.opportunityScore}/100</span>,
      tip: "Composite score based on volume, competition, CPC, and trend",
      accent: "border-emerald-500/40",
    },
    {
      label: "CPC",
      value: <span className="font-mono text-base font-semibold" data-testid="text-cpc">{formatCPC(topic.cpc)}</span>,
      tip: "Cost-per-click in Google Ads. Higher = more commercial intent",
      accent: "border-violet-500/40",
    },
    {
      label: "Competition",
      value: (
        <span className={`font-mono text-base font-semibold ${competition.color}`} data-testid="text-competition">
          {competition.label}
          {competition.value && <span className="text-sm font-normal opacity-70 ml-1">({competition.value})</span>}
        </span>
      ),
      tip: "Ad competition level. Lower = easier to rank",
      accent: "border-amber-500/40",
    },
    {
      label: "Trend",
      value: (
        <div className="flex items-center gap-1.5" data-testid="text-trend">
          <TrendIcon direction={trend.direction} />
          <span className={`font-mono text-base font-semibold ${
            trend.direction === "rising" ? "text-green-400" : trend.direction === "falling" ? "text-red-400" : "text-muted-foreground"
          }`}>{trend.label}</span>
        </div>
      ),
      tip: "Search interest trend over recent months",
      accent: "border-teal-500/40",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
      {stats.map((s) => (
        <div key={s.label} className={`flex flex-col gap-1 px-3 py-2.5 rounded-xl bg-white/5 border ${s.accent}`}>
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/50">{s.label}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3 w-3 text-white/30 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs"><p className="text-xs">{s.tip}</p></TooltipContent>
            </Tooltip>
          </div>
          {s.value}
        </div>
      ))}
    </div>
  );
}

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

  const handleRefreshScripts = async () => {
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
      const linkInDescription = defaultOffer.linkUrl 
        ? `${defaultOffer.linkLabel || "Link"} in the description` 
        : "";

      const newFinalCTAText = `Now here's the thing - if you're ready to take action on what we just covered, I want to share something that's been a game-changer for me and my students. ${offerText}. ${linkText}. I'll also leave a link to my next video where we go even deeper on this topic. Make sure you hit that subscribe button if you haven't already, and I'll see you in the next one!`;

      const newShortsScript = editedScriptJson.shortsScript 
        ? `${editedScriptJson.shortsScript.replace(/Want to dive deeper\?.*$|Check out.*in the description.*$|Link in.*$/gi, '').trim()} Want to dive deeper? Watch my full video and grab ${defaultOffer.name}${linkInDescription ? ` - ${linkInDescription}` : ''}!`
        : `Want to dive deeper? Grab ${defaultOffer.name}${linkInDescription ? ` - ${linkInDescription}` : ''}!`;

      const newPinnedComment = `Ready to take action? Grab ${defaultOffer.name}${defaultOffer.description ? ` - ${defaultOffer.description}` : ''}${linkInDescription ? ` ${linkInDescription}` : ''}. Let me know your biggest takeaway in the comments below!`;

      const updatedScriptJson = {
        ...editedScriptJson,
        shortsScript: newShortsScript,
        pinnedComment: newPinnedComment,
        fullScript: {
          ...editedScriptJson.fullScript,
          finalCTA: {
            ...editedScriptJson.fullScript.finalCTA,
            text: newFinalCTAText,
          },
        },
      };

      setEditedScriptJson(updatedScriptJson);
      
      await updateScriptMutation.mutateAsync(updatedScriptJson);

      toast({ title: "Scripts updated with your offer!" });
    } catch {
      toast({ title: "Failed to refresh scripts", variant: "destructive" });
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
            Refresh Scripts with Offer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Click the button below to update your Final CTA, Shorts Script, and Pinned Comment with your default offer. 
            The Hook, Set the Hook, First CTA, and Content sections remain unchanged.
          </p>
          <Button 
            onClick={handleRefreshScripts}
            disabled={isRefreshing || !offers?.some(o => o.isDefault)}
            data-testid="button-refresh-scripts"
          >
            {isRefreshing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Scripts with Default Offer
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

const SECTION_STYLES: Record<string, { border: string; badge: string; glow: string }> = {
  hook:      { border: "border-l-violet-500", badge: "bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/20", glow: "bg-violet-500/5" },
  "set-hook":{ border: "border-l-blue-500",   badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20",       glow: "bg-blue-500/5" },
  "first-cta":{ border: "border-l-amber-500", badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",   glow: "bg-amber-500/5" },
  content:   { border: "border-l-teal-500",   badge: "bg-teal-500/10 text-teal-600 dark:text-teal-400 ring-teal-500/20",       glow: "bg-teal-500/5" },
  "final-cta":{ border: "border-l-rose-500",  badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20",       glow: "bg-rose-500/5" },
};

const SECTION_ACCENT_COLORS: Record<string, string> = {
  hook:        "#7c3aed",
  "set-hook":  "#2563eb",
  "first-cta": "#d97706",
  content:     "#0d9488",
  "final-cta": "#e11d48",
};

function AutoTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = ref.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      data-testid={testId}
      className="w-full resize-none bg-transparent border-0 outline-none focus:ring-0 text-[15px] leading-[1.85] text-foreground/90 p-0 placeholder:text-muted-foreground/40"
      style={{ minHeight: "88px", fontFamily: 'Georgia, "Times New Roman", serif', overflow: "hidden" }}
    />
  );
}

function EditableScriptSection({ 
  title, 
  content, 
  onChange,
  sectionKey,
  onRegenerate,
  isRegenerating,
}: { 
  title: string; 
  content: string; 
  onChange: (value: string) => void;
  sectionKey: string;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}) {
  const [localValue, setLocalValue] = useState(content);
  const style = SECTION_STYLES[sectionKey] ?? { border: "border-l-muted-foreground/30", badge: "bg-muted text-muted-foreground ring-muted", glow: "" };

  useEffect(() => {
    setLocalValue(content);
  }, [content]);

  const handleBlur = useCallback(() => {
    if (localValue !== content) onChange(localValue);
  }, [localValue, content, onChange]);

  return (
    <div className={`border-l-4 ${style.border}`}>
      <div className="px-5 pt-5 pb-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ring-1 ${style.badge}`}>{title}</span>
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              disabled={isRegenerating}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 transition-all bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/30 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="button-regenerate-hook"
            >
              {isRegenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              {isRegenerating ? "Generating…" : "AI Regenerate Hook"}
            </button>
          )}
        </div>
        <AutoTextarea
          value={localValue}
          onChange={setLocalValue}
          onBlur={handleBlur}
          placeholder={`Enter ${title.toLowerCase()} content…`}
          testId={`textarea-${sectionKey}`}
        />
      </div>
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
  const [localTitle, setLocalTitle] = useState(section.title);
  const [localContent, setLocalContent] = useState(section.content);

  useEffect(() => {
    setLocalTitle(section.title);
    setLocalContent(section.content);
  }, [section]);

  const handleTitleBlur = useCallback(() => {
    if (localTitle !== section.title) {
      onUpdate(index, { ...section, title: localTitle });
    }
  }, [localTitle, section, index, onUpdate]);

  const handleContentBlur = useCallback(() => {
    if (localContent !== section.content) {
      onUpdate(index, { ...section, content: localContent });
    }
  }, [localContent, section, index, onUpdate]);

  const style = SECTION_STYLES["content"] ?? { border: "border-l-muted-foreground/30", badge: "bg-muted text-muted-foreground ring-muted", glow: "" };

  return (
    <div className={`border-l-4 ${style.border}`}>
      <div className="px-5 pt-5 pb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ring-1 shrink-0 ${style.badge}`}>
            Section {index + 1}
          </span>
          <input
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={handleTitleBlur}
            className="flex-1 text-sm font-semibold bg-transparent border-0 outline-none focus:ring-0 text-foreground/80 placeholder:text-muted-foreground/40 min-w-0"
            placeholder="Section title…"
            data-testid={`input-title-${index}`}
          />
          <button
            onClick={() => onDelete(index)}
            className="p-1.5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
            data-testid={`button-delete-content-section-${index}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <AutoTextarea
          value={localContent}
          onChange={setLocalContent}
          onBlur={handleContentBlur}
          placeholder="Write this section's content…"
          testId={`textarea-content-section-${index}`}
        />
      </div>
    </div>
  );
}

function formatForTeleprompter(text: string): string {
  const sentences: string[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(/(?<=[.!?])\s+/);
    for (const part of parts) {
      const s = part.trim();
      if (s) sentences.push(s);
    }
  }
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    const chunk = sentences.slice(i, i + 2).join(' ');
    if (chunk.trim()) paragraphs.push(chunk.trim());
  }
  return paragraphs.join('\n\n');
}

function hasScriptChanged(original: ScriptJson | null, edited: ScriptJson | null): boolean {
  if (!original || !edited) return false;
  
  if (original.expandedScript !== edited.expandedScript) return true;
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

// Teleprompter is opened as a standalone window (see handleOpenTeleprompter in the page component)

export default function TopicPulseScriptPage() {
  const { scriptId } = useParams<{ scriptId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [editedScriptJson, setEditedScriptJson] = useState<ScriptJson | null>(null);
  const [showResearchPanel, setShowResearchPanel] = useState(false);
  const [savedNotice, setSavedNotice] = useState<"manual" | "auto" | null>(null);
  const [savedTeleprompterScriptId, setSavedTeleprompterScriptId] = useState<string | null>(null);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [scriptView, setScriptView] = useState<"outline" | "full">("outline");
  const [videoLengthTarget, setVideoLengthTarget] = useState<string>("6-10");

  const { data: script, isLoading } = useQuery<Script & { topic?: Topic }>({
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
      const json = script.scriptJson as any;
      let parsed: ScriptJson;
      if (json.scriptJson && json.scriptJson.fullScript) {
        parsed = json.scriptJson as ScriptJson;
      } else {
        parsed = json as ScriptJson;
      }
      if (parsed.expandedScript) {
        parsed = { ...parsed, expandedScript: formatForTeleprompter(parsed.expandedScript) };
      }
      setEditedScriptJson(parsed);
    }
    if (script && (script as any).teleprompterScriptId) {
      setSavedTeleprompterScriptId((script as any).teleprompterScriptId);
    }
    if (script?.inputsJson) {
      const inputs = script.inputsJson as any;
      if (inputs.videoLengthTarget) setVideoLengthTarget(inputs.videoLengthTarget);
    }
  }, [script]);

  const isAutoSaveRef = useRef(false);

  const saveMutation = useMutation({
    mutationFn: async (scriptJson: ScriptJson) => {
      const res = await apiRequest("PATCH", `/api/topic-pulse/scripts/${scriptId}`, { scriptJson });
      return res.json();
    },
    onSuccess: () => {
      if (!isAutoSaveRef.current) {
        setSavedNotice("manual");
        setTimeout(() => setSavedNotice(null), 5000);
      }
      isAutoSaveRef.current = false;
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/scripts", scriptId] });
    },
    onError: (err: Error) => {
      isAutoSaveRef.current = false;
      toast({ title: "Failed to save script", description: err.message, variant: "destructive" });
    },
  });

  const saveToTeleprompterMutation = useMutation({
    mutationFn: async (payload: { title: string; content: string }) => {
      const res = await apiRequest("POST", "/api/teleprompter/scripts", payload);
      return res.json();
    },
    onSuccess: async (data) => {
      if (data?.id) {
        setSavedTeleprompterScriptId(data.id);
        await apiRequest("PATCH", `/api/topic-pulse/scripts/${scriptId}`, {
          teleprompterScriptId: data.id,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/scripts", scriptId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/teleprompter/scripts"] });
      toast({
        title: "Saved to Teleprompter",
        description: "Your script is ready in the Teleprompter library whenever you want to record it.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const overwriteTeleprompterMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: { title: string; content: string } }) => {
      const res = await apiRequest("PATCH", `/api/teleprompter/scripts/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teleprompter/scripts"] });
      toast({
        title: "Teleprompter script updated",
        description: "Your changes have been saved over the previous version.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to overwrite", description: err.message, variant: "destructive" });
    },
  });

  const regenerateHookMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/topic-pulse/scripts/${scriptId}/regenerate-hook`, {});
      return res.json() as Promise<{ hook: string }>;
    },
    onSuccess: (data) => {
      if (!data.hook) return;
      setEditedScriptJson((prev) => {
        if (!prev?.fullScript) return prev;
        return {
          ...prev,
          fullScript: {
            ...prev.fullScript,
            hook: { ...prev.fullScript.hook, text: data.hook },
          },
        };
      });
      toast({ title: "New hook generated!", description: "Review it above — click again for another variation." });
    },
    onError: (err: Error) => {
      toast({ title: "Hook regeneration failed", description: err.message, variant: "destructive" });
    },
  });

  const generateFullMutation = useMutation({
    mutationFn: async (vlt: string) => {
      const res = await apiRequest("POST", `/api/topic-pulse/scripts/${scriptId}/generate-full`, { videoLengthTarget: vlt });
      return res.json() as Promise<{ expandedScript: string }>;
    },
    onSuccess: (data) => {
      const formatted = formatForTeleprompter(data.expandedScript);
      setEditedScriptJson(prev => prev ? { ...prev, expandedScript: formatted } : prev);
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/scripts", scriptId] });
      toast({ title: "Full script generated!", description: "Your complete teleprompter script is ready. You can edit it and save it to the Teleprompter." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to generate script", description: err.message, variant: "destructive" });
    },
  });

  // Auto-save: silently persist changes 5 seconds after the last edit
  useEffect(() => {
    if (!hasChanges || saveMutation.isPending) return;
    const timer = setTimeout(() => {
      if (editedScriptJson) {
        isAutoSaveRef.current = true;
        saveMutation.mutate(editedScriptJson, {
          onSuccess: () => {
            setSavedNotice("auto");
            setTimeout(() => setSavedNotice(null), 5000);
          },
        });
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [editedScriptJson, hasChanges]);

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

  const handleDownloadExpandedPdf = () => {
    if (!editedScriptJson?.expandedScript || !script) return;
    const esc = (text: string) =>
      text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const bodyHtml = editedScriptJson.expandedScript
      .split(/\n\n+/)
      .map((para) => `<p>${esc(para).replace(/\n/g, "<br>")}</p>`)
      .join("");
    const logoUrl = `${window.location.origin}${academyLogoPath}`;
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(script.title)}</title>
  <style>
    @page{size:letter;margin:0}
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,"Times New Roman",serif;color:#111;background:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact;padding-top:80px;padding-bottom:48px}
    .hdr{position:fixed;top:0;left:0;right:0;height:68px;display:flex;align-items:center;justify-content:space-between;padding:0 48px;background:#fff;border-bottom:2px solid #0b1437;z-index:100}
    .hdr img{height:44px;width:auto}
    .hdr-date{font-family:Arial,sans-serif;font-size:10px;color:#888;text-align:right;line-height:1.6}
    .ftr{position:fixed;bottom:0;left:0;right:0;height:36px;display:flex;align-items:center;justify-content:center;padding:0 48px;background:#fff;border-top:1px solid #e5e7eb;z-index:100;font-family:Arial,sans-serif;font-size:10px;color:#aaa}
    .ftr a{color:#aaa;text-decoration:none}
    .page{padding:20px 48px 16px}
    .title{font-size:22px;font-weight:bold;margin-bottom:3px;line-height:1.3}
    .meta{font-size:11px;color:#888;margin-bottom:28px;font-family:Arial,sans-serif}
    p{font-size:14px;line-height:1.8;margin-bottom:14px}
  </style>
</head>
<body>
  <div class="hdr">
    <img src="${logoUrl}" alt="Fearless Influencer" />
    <div class="hdr-date">Script generated<br>${new Date(script.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
  </div>
  <div class="ftr">Created with the Fearless Influencer Academy Toolkit &nbsp;·&nbsp;<a href="https://fearlessinfluencer.com">fearlessinfluencer.com</a></div>
  <div class="page">
    <h1 class="title">${esc(script.title)}</h1>
    <p class="meta">Full teleprompter script</p>
    ${bodyHtml}
  </div>
  <script>window.onload=function(){window.print()}<\/script>
</body>
</html>`;
    const pw = window.open("", "_blank");
    if (pw) { pw.document.write(html); pw.document.close(); }
  };

  const handleDownloadPdf = () => {
    if (!editedScriptJson?.fullScript || !script) return;
    const fs = editedScriptJson.fullScript;

    const esc = (text: string) =>
      text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

    const buildSection = (
      label: string,
      color: string,
      text: string,
      duration?: string,
      onScreenText?: string[],
      extra?: string
    ) => `
      <div class="section" style="border-left:4px solid ${color}; padding-left:18px; margin-bottom:32px; page-break-inside:avoid;">
        <div class="section-label" style="color:${color};">${label}</div>
        ${duration ? `<div class="duration">⏱ ${duration}</div>` : ""}
        <div class="section-text">${esc(text)}</div>
        ${onScreenText && onScreenText.length > 0 ? `
          <div class="on-screen">
            <div class="on-screen-label">On-Screen Text</div>
            ${onScreenText.map((t) => `<div>› ${esc(t)}</div>`).join("")}
          </div>` : ""}
        ${extra ?? ""}
      </div>`;

    let contentSubSections = "";
    (fs.content.sections ?? []).forEach((sec, i) => {
      contentSubSections += `
        <div class="sub-section">
          <div class="sub-title">Section ${i + 1}: ${esc(sec.title)}${sec.timestamp ? ` <span class="ts">[${sec.timestamp}]</span>` : ""}</div>
          <div class="sub-text">${esc(sec.content)}</div>
          ${sec.brollIdeas?.length ? `<div class="broll">B-Roll: ${esc(sec.brollIdeas.join(", "))}</div>` : ""}
        </div>`;
    });

    const nextVideoHtml = fs.finalCTA.nextVideoSuggestion
      ? `<div class="next-video"><strong>Next Video Suggestion:</strong> ${esc(fs.finalCTA.nextVideoSuggestion)}</div>`
      : "";

    const logoUrl = `${window.location.origin}${academyLogoPath}`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(script.title)}</title>
  <style>
    @page{size:letter;margin:0}
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      font-family:Georgia,"Times New Roman",serif;
      color:#111;background:#fff;
      print-color-adjust:exact;-webkit-print-color-adjust:exact;
      padding-top:80px;padding-bottom:48px;
    }
    /* ── Fixed header: repeats on every page ── */
    .hdr{
      position:fixed;top:0;left:0;right:0;height:68px;
      display:flex;align-items:center;justify-content:space-between;
      padding:0 48px;background:#fff;
      border-bottom:2px solid #0b1437;z-index:100;
    }
    .hdr img{height:44px;width:auto}
    .hdr-date{font-family:Arial,sans-serif;font-size:10px;color:#888;text-align:right;line-height:1.6}
    /* ── Fixed footer: repeats on every page ── */
    .ftr{
      position:fixed;bottom:0;left:0;right:0;height:36px;
      display:flex;align-items:center;justify-content:center;
      padding:0 48px;background:#fff;
      border-top:1px solid #e5e7eb;z-index:100;
      font-family:Arial,sans-serif;font-size:10px;color:#aaa;
    }
    .ftr a{color:#aaa;text-decoration:none}
    /* ── Content ── */
    .page{padding:20px 48px 16px}
    .title{font-size:22px;font-weight:bold;margin-bottom:3px;line-height:1.3}
    .meta{font-size:11px;color:#888;margin-bottom:28px;font-family:Arial,sans-serif}
    .section{margin-bottom:20px;padding:14px 16px;border-left:4px solid #ccc;page-break-inside:avoid}
    .section-label{font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px}
    .duration{font-family:Arial,sans-serif;font-size:10px;color:#888;margin-bottom:6px}
    .section-text{font-size:14px;line-height:1.8;white-space:pre-wrap}
    .on-screen{margin-top:10px;padding:8px 12px;background:#f5f5f5;border-radius:4px}
    .on-screen-label{font-family:Arial,sans-serif;font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:4px}
    .on-screen div{font-family:Arial,sans-serif;font-size:11px;color:#555;margin:2px 0}
    .sub-section{margin:12px 0;padding:10px 14px;background:#f8f8f8;border-radius:6px;page-break-inside:avoid}
    .sub-title{font-family:Arial,sans-serif;font-size:12px;font-weight:600;margin-bottom:6px;color:#333}
    .ts{color:#888;font-weight:normal}
    .sub-text{font-size:13px;line-height:1.7;white-space:pre-wrap}
    .broll{font-family:Arial,sans-serif;font-size:11px;color:#888;margin-top:6px;font-style:italic}
    .next-video{margin-top:10px;padding:8px 12px;background:#fffbf0;border-radius:4px;font-family:Arial,sans-serif;font-size:12px;color:#666}
  </style>
</head>
<body>
  <div class="hdr">
    <img src="${logoUrl}" alt="Fearless Influencer" />
    <div class="hdr-date">
      Script generated<br>
      ${new Date(script.createdAt).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}
    </div>
  </div>
  <div class="ftr">
    Created with the Fearless Influencer Academy Toolkit &nbsp;·&nbsp;
    <a href="https://fearlessinfluencer.com">fearlessinfluencer.com</a>
  </div>
  <div class="page">
    <h1 class="title">${esc(script.title)}</h1>
    <p class="meta">Video script · 5-Part Formula</p>
    ${buildSection("1. Hook", "#7c3aed", fs.hook.text, fs.hook.duration, fs.hook.onScreenText)}
    ${buildSection("2. Set the Hook", "#2563eb", fs.setHook.text, fs.setHook.duration, (fs.setHook as any).onScreenText)}
    ${buildSection("3. First Call to Action", "#d97706", fs.firstCTA.text, fs.firstCTA.duration)}
    ${buildSection("4. Content", "#0d9488", fs.content.text, undefined, undefined, contentSubSections)}
    ${buildSection("5. Final Call to Action", "#e11d48", fs.finalCTA.text, fs.finalCTA.duration, undefined, nextVideoHtml)}
  </div>
  <script>window.onload=function(){window.print()}<\/script>
</body>
</html>`;

    const pw = window.open("", "_blank");
    if (pw) { pw.document.write(html); pw.document.close(); }
  };

  const handleOpenTeleprompter = () => {
    if (!editedScriptJson?.fullScript) return;
    const fs = editedScriptJson.fullScript;

    const sections = [
      { label: "HOOK",                 color: "#f97316", text: fs.hook.text ?? "" },
      { label: "SET THE HOOK",         color: "#a855f7", text: fs.setHook.text ?? "" },
      { label: "FIRST CALL TO ACTION", color: "#eab308", text: fs.firstCTA.text ?? "" },
      { label: "CONTENT",              color: "#22c55e", text: fs.content.text ?? "" },
      ...(fs.content.sections ?? []).map(s => ({
        label: s.title.toUpperCase(),
        color: "#22c55e",
        text: s.content ?? "",
      })),
      { label: "FINAL CALL TO ACTION", color: "#ec4899", text: fs.finalCTA.text ?? "" },
    ];

    openTeleprompter({ title: script?.title ?? "Script", sections });
  };

  const buildTeleprompterContent = () => {
    if (!script) return null;
    // In full-script view, use the AI-generated expanded script if available
    if (scriptView === "full" && editedScriptJson?.expandedScript) {
      return { title: script.title, content: editedScriptJson.expandedScript };
    }
    if (!editedScriptJson?.fullScript) return null;
    const fs = editedScriptJson.fullScript;
    const parts: string[] = [];
    if (fs.hook.text)        parts.push(fs.hook.text);
    if (fs.setHook.text)     parts.push(fs.setHook.text);
    if (fs.firstCTA.text)    parts.push(fs.firstCTA.text);
    if (fs.content.text)     parts.push(fs.content.text);
    (fs.content.sections ?? []).forEach(s => {
      if (s.content) parts.push(s.content);
    });
    if (fs.finalCTA.text)    parts.push(fs.finalCTA.text);
    return { title: script.title, content: parts.join("\n\n") };
  };

  const handleSaveToTeleprompter = () => {
    if (!editedScriptJson?.fullScript || !script) return;
    if (savedTeleprompterScriptId) {
      setShowOverwriteDialog(true);
    } else {
      const payload = buildTeleprompterContent();
      if (payload) saveToTeleprompterMutation.mutate(payload);
    }
  };

  const handleOverwriteConfirm = () => {
    setShowOverwriteDialog(false);
    if (!savedTeleprompterScriptId) return;
    const payload = buildTeleprompterContent();
    if (payload) overwriteTeleprompterMutation.mutate({ id: savedTeleprompterScriptId, payload });
  };

  const handleOverwriteCancel = () => {
    setShowOverwriteDialog(false);
    const payload = buildTeleprompterContent();
    if (payload) saveToTeleprompterMutation.mutate(payload);
  };

  const handleSaveAndGoToTeleprompter = () => {
    if (savedTeleprompterScriptId) {
      navigate(`/teleprompter?script=${savedTeleprompterScriptId}`);
      return;
    }
    if (!editedScriptJson?.fullScript || !script) return;
    const payload = buildTeleprompterContent();
    if (!payload) return;
    saveToTeleprompterMutation.mutate(payload, {
      onSuccess: (data: any) => {
        const id = data?.id ?? null;
        if (id) navigate(`/teleprompter?script=${id}`);
        else navigate("/teleprompter");
      },
    });
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
      {/* ── Hero header ── */}
      <div className="bg-sidebar text-sidebar-foreground px-6 py-6 shrink-0">
        <div className="max-w-5xl mx-auto">
          {/* Top row: back + title + actions */}
          <div className="flex items-start gap-3">
            <button
              onClick={() => navigate("/video-studio/scripts")}
              className="mt-0.5 flex items-center gap-1 text-white/50 hover:text-white text-sm transition-colors"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4" />
              Scripts
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white leading-tight truncate" data-testid="text-script-title">
                {script.title}
              </h1>
              <p className="text-white/40 text-xs mt-0.5">
                Created {new Date(script.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                onClick={() => setShowResearchPanel(!showResearchPanel)}
                className="hidden md:flex bg-red-600 hover:bg-red-700 text-white border-0"
                data-testid="button-toggle-research"
              >
                <Youtube className="h-4 w-4 mr-1.5" />
                {showResearchPanel ? "Hide" : "Research"}
              </Button>
            </div>
          </div>

          {/* Intent analysis */}
          <HeroIntentAnalysis analysis={(script.topic as any)?.intentAnalysis} />
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        <ScrollArea className="flex-1 h-full">
          <div className="p-5 max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-5 gap-2">
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saveMutation.isPending || !hasChanges}
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold"
                  data-testid="button-save-script"
                >
                  {saveMutation.isPending && isAutoSaveRef.current === false
                    ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    : <Save className="h-4 w-4 mr-1.5" />}
                  Save Script
                </Button>
                {savedNotice && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1 animate-in fade-in duration-300" data-testid="text-saved-notice">
                    <Check className="h-3.5 w-3.5 text-green-500" />
                    {savedNotice === "auto" ? "Script auto-saved" : "Script saved"}
                  </span>
                )}
              </div>
              <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5" data-testid="toggle-script-view">
                <button
                  onClick={() => setScriptView("outline")}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    scriptView === "outline"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="button-view-outline"
                >
                  Outline
                </button>
                <button
                  onClick={() => setScriptView("full")}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    scriptView === "full"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid="button-view-full-script"
                >
                  Full Script
                </button>
              </div>
            </div>

            {/* ── OUTLINE VIEW ── */}
            {scriptView === "outline" && fullScript && (
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden space-y-px">
                <EditableScriptSection 
                  title="1. Hook" 
                  content={fullScript.hook.text}
                  onChange={(v) => handleSectionChange("hook", v)}
                  sectionKey="hook"
                  onRegenerate={() => regenerateHookMutation.mutate()}
                  isRegenerating={regenerateHookMutation.isPending}
                />
                <EditableScriptSection 
                  title="2. Set the Hook" 
                  content={fullScript.setHook.text}
                  onChange={(v) => handleSectionChange("setHook", v)}
                  sectionKey="set-hook"
                />
                <EditableScriptSection 
                  title="3. First CTA" 
                  content={fullScript.firstCTA.text}
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
                <div className="px-5 py-4 bg-muted/20 border-t border-border/40">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleAddContentSection}
                    className="w-full border-dashed text-muted-foreground hover:text-foreground"
                    data-testid="button-add-content-section"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Content Section
                  </Button>
                </div>
                <EditableScriptSection 
                  title="5. Final CTA" 
                  content={fullScript.finalCTA.text}
                  onChange={(v) => handleSectionChange("finalCTA", v)}
                  sectionKey="final-cta"
                />
              </div>
            )}

            {/* ── FULL SCRIPT VIEW ── */}
            {scriptView === "full" && (
              <div className="space-y-4">
                {/* Generate controls card */}
                <div className="rounded-xl border bg-card shadow-sm p-5">
                  <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-sm mb-1">Generate Full Script</h3>
                      <p className="text-xs text-muted-foreground mb-3">
                        AI will expand your outline into a complete, word-for-word teleprompter script based on your target video length.
                      </p>
                      <div className="flex items-center gap-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1">Video Length</label>
                          <Select
                            value={videoLengthTarget}
                            onValueChange={setVideoLengthTarget}
                          >
                            <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-video-length">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="3-5">3–5 minutes</SelectItem>
                              <SelectItem value="6-10">6–10 minutes</SelectItem>
                              <SelectItem value="10-15">10–15 minutes</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="pt-5">
                          <Button
                            size="sm"
                            onClick={() => generateFullMutation.mutate(videoLengthTarget)}
                            disabled={generateFullMutation.isPending}
                            className="bg-violet-600 hover:bg-violet-700 text-white"
                            data-testid="button-generate-full-script"
                          >
                            {generateFullMutation.isPending ? (
                              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Generating…</>
                            ) : (
                              <><Wand2 className="h-4 w-4 mr-1.5" />{editedScriptJson?.expandedScript ? "Regenerate" : "Generate Full Script"}</>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded script editor */}
                {editedScriptJson?.expandedScript ? (
                  <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
                      <span className="text-sm font-semibold">Full Script</span>
                      <div className="flex items-center gap-2">
                        <CopyButton text={getFullScriptText()} label="Copy Script" html={getFullScriptHtml()} />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleDownloadExpandedPdf}
                          data-testid="button-download-pdf"
                        >
                          <FileDown className="h-4 w-4 mr-2" />
                          PDF
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      value={editedScriptJson.expandedScript}
                      onChange={(e) => setEditedScriptJson(prev => prev ? { ...prev, expandedScript: e.target.value } : prev)}
                      className="min-h-[500px] rounded-none border-0 shadow-none focus-visible:ring-0 resize-none font-sans text-sm leading-relaxed p-5"
                      placeholder="Your full script will appear here after generation…"
                      data-testid="textarea-full-script"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed bg-muted/20 p-10 text-center">
                    <Wand2 className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <p className="text-sm font-medium text-muted-foreground mb-1">No full script yet</p>
                    <p className="text-xs text-muted-foreground">
                      Fill in your outline sections, then click <strong>Generate Full Script</strong> above.
                    </p>
                  </div>
                )}

                {/* ── Record CTA — appears once a full script exists ── */}
                {editedScriptJson?.expandedScript && (
                  <div className={`rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center gap-4 ${
                    savedTeleprompterScriptId
                      ? "bg-emerald-500/8 border-emerald-500/20"
                      : "bg-violet-500/8 border-violet-500/20"
                  }`}>
                    <div className="flex-1">
                      {savedTeleprompterScriptId ? (
                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-0.5">
                          <Check className="h-4 w-4 shrink-0" />
                          <span className="font-semibold text-sm">Script saved to Teleprompter</span>
                        </div>
                      ) : (
                        <p className="font-semibold text-sm text-violet-600 dark:text-violet-400 mb-0.5">
                          Ready to record your video?
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {savedTeleprompterScriptId
                          ? "Open the Teleprompter to scroll through your script while you record."
                          : "Save your script to the Teleprompter, then scroll through it while you record your video."}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {savedTeleprompterScriptId ? (
                        <Button
                          onClick={() => navigate(`/teleprompter?script=${savedTeleprompterScriptId}`)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 font-semibold"
                          data-testid="button-open-teleprompter"
                        >
                          <Video className="h-4 w-4 mr-1.5" />
                          Open in Teleprompter
                        </Button>
                      ) : (
                        <Button
                          onClick={handleSaveAndGoToTeleprompter}
                          disabled={saveToTeleprompterMutation.isPending}
                          className="bg-violet-600 hover:bg-violet-700 text-white border-0 font-semibold"
                          data-testid="button-save-open-teleprompter"
                        >
                          {saveToTeleprompterMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          ) : (
                            <Video className="h-4 w-4 mr-1.5" />
                          )}
                          Save & Open in Teleprompter
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        {showResearchPanel && (
          <div className="hidden md:block w-[525px] border-l flex-shrink-0 overflow-hidden">
            <YouTubeResearchPanel defaultKeyword={script.title} />
          </div>
        )}
      </div>

      <AlertDialog open={showOverwriteDialog} onOpenChange={setShowOverwriteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Already saved to Teleprompter</AlertDialogTitle>
            <AlertDialogDescription>
              You've already saved this script to your Teleprompter library. Do you want to overwrite it with your latest edits, or save a new copy?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleOverwriteCancel}>
              Save as new copy
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleOverwriteConfirm}>
              Yes, overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
