import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Image as ImageIcon, Trash2, Download, Sparkles, User, Upload } from "lucide-react";
import type { GeneratedThumbnail, UserProfilePhoto } from "@shared/schema";

const styleLabels: Record<string, { label: string; description: string }> = {
  reaction: { label: "Reaction", description: "Expressive face with dramatic lighting" },
  before_after: { label: "Before/After", description: "Split-screen transformation" },
  list_style: { label: "List Style", description: "Bold numbers and typography" },
  bold_text: { label: "Bold Text", description: "Large text as main focus" },
  minimal: { label: "Minimal", description: "Clean and elegant" },
  dramatic: { label: "Dramatic", description: "Cinematic, movie-poster style" },
};

const providerLabels: Record<string, { label: string; description: string }> = {
  instantid: { label: "InstantID (Your Photo)", description: "Uses your uploaded photo - best for personal branding" },
  dalle: { label: "DALL-E 3", description: "AI-generated scenes, no photo needed" },
  gemini: { label: "Gemini", description: "Fast stylized images, no photo needed" },
};

export default function ThumbnailGenerator() {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [style, setStyle] = useState<string>("");
  const [provider, setProvider] = useState<string>("dalle");
  const [selectedPhotoId, setSelectedPhotoId] = useState<string>("");
  const [includePerson, setIncludePerson] = useState(false);
  const [activeTab, setActiveTab] = useState("generate");

  const { data: photos = [], isLoading: photosLoading } = useQuery<UserProfilePhoto[]>({
    queryKey: ["/api/thumbnails/photos"],
  });

  const { data: thumbnails = [], isLoading: thumbnailsLoading } = useQuery<(GeneratedThumbnail & { imageData: string })[]>({
    queryKey: ["/api/thumbnails"],
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("photo", file);
      const response = await fetch("/api/thumbnails/upload-photo", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to upload photo");
      return response.json();
    },
    onSuccess: (photo) => {
      queryClient.invalidateQueries({ queryKey: ["/api/thumbnails/photos"] });
      setSelectedPhotoId(photo.id);
      toast({ title: "Photo uploaded", description: "Your photo is ready to use in thumbnails" });
    },
    onError: (error: Error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/thumbnails/photos/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/thumbnails/photos"] });
      setSelectedPhotoId("");
      toast({ title: "Photo deleted" });
    },
  });

  const generateThumbnailMutation = useMutation({
    mutationFn: async (data: { title: string; style?: string; provider: string; userPhotoId?: string; includePerson?: boolean }) => {
      const response = await apiRequest("POST", "/api/thumbnails/generate", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/thumbnails"] });
      toast({ title: "Thumbnail generated!", description: "Your new thumbnail is ready" });
      setActiveTab("gallery");
    },
    onError: (error: Error) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteThumbnailMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/thumbnails/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/thumbnails"] });
      toast({ title: "Thumbnail deleted" });
    },
  });

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadPhotoMutation.mutate(file);
    }
  };

  const handleGenerate = () => {
    if (!title.trim()) {
      toast({ title: "Title required", description: "Please enter a video title", variant: "destructive" });
      return;
    }
    
    if (provider === "instantid" && !selectedPhotoId) {
      toast({ title: "Photo required", description: "Please upload or select a photo to use InstantID", variant: "destructive" });
      return;
    }

    generateThumbnailMutation.mutate({
      title: title.trim(),
      style: style || undefined,
      provider,
      userPhotoId: provider === "instantid" ? selectedPhotoId : undefined,
      includePerson: provider !== "instantid" ? includePerson : undefined,
    });
  };

  const handleDownload = (thumbnail: GeneratedThumbnail & { imageData: string }) => {
    const link = document.createElement("a");
    link.href = thumbnail.imageData;
    link.download = `thumbnail-${thumbnail.title.replace(/\s+/g, "-").toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const needsPhoto = provider === "instantid";

  return (
    <div className="min-h-full p-6 space-y-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">AI Thumbnail Generator</h1>
          <p className="text-muted-foreground">
            Create eye-catching YouTube thumbnails with your photo or AI-generated imagery
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="generate" data-testid="tab-generate">Generate</TabsTrigger>
            <TabsTrigger value="photos" data-testid="tab-photos">
              My Photos {photos.length > 0 && <Badge variant="secondary" className="ml-2">{photos.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="gallery" data-testid="tab-gallery">
              Gallery {thumbnails.length > 0 && <Badge variant="secondary" className="ml-2">{thumbnails.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Create New Thumbnail</CardTitle>
                <CardDescription>
                  Use InstantID to incorporate your actual photo, or generate AI-only thumbnails with DALL-E/Gemini.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="title">Video Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., 10 Keto Snacks That Changed My Life"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    data-testid="input-title"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>AI Provider</Label>
                    <Select value={provider} onValueChange={setProvider}>
                      <SelectTrigger data-testid="select-provider">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(providerLabels).map(([key, { label, description }]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex flex-col">
                              <span>{label}</span>
                              <span className="text-xs text-muted-foreground">{description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Thumbnail Style</Label>
                    <Select value={style} onValueChange={setStyle}>
                      <SelectTrigger data-testid="select-style">
                        <SelectValue placeholder="Choose a style (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(styleLabels).map(([key, { label, description }]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex flex-col">
                              <span>{label}</span>
                              <span className="text-xs text-muted-foreground">{description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {needsPhoto && (
                  <div className="space-y-3 p-4 border rounded-md bg-muted/30">
                    <Label className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Select Your Photo
                    </Label>
                    
                    {photosLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    ) : photos.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground mb-3">
                          Upload a photo to use your likeness in thumbnails
                        </p>
                        <Label
                          htmlFor="quick-photo-upload"
                          className="inline-flex items-center gap-2 cursor-pointer px-4 py-2 border rounded-md hover:bg-accent transition-colors"
                        >
                          <Upload className="h-4 w-4" />
                          Upload Photo
                        </Label>
                        <input
                          id="quick-photo-upload"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handlePhotoUpload}
                          className="hidden"
                          data-testid="input-quick-photo-upload"
                        />
                        {uploadPhotoMutation.isPending && (
                          <div className="mt-2">
                            <Loader2 className="h-4 w-4 animate-spin inline" />
                            <span className="ml-2 text-sm">Uploading...</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {photos.map((photo) => (
                            <button
                              key={photo.id}
                              onClick={() => setSelectedPhotoId(photo.id)}
                              className={`relative w-16 h-16 rounded-md overflow-hidden border-2 transition-colors ${
                                selectedPhotoId === photo.id 
                                  ? "border-primary" 
                                  : "border-transparent hover:border-muted-foreground/50"
                              }`}
                              data-testid={`button-select-photo-${photo.id}`}
                            >
                              <img
                                src={`/api/thumbnails/photo-file/${photo.id}`}
                                alt={photo.filename}
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ))}
                          <Label
                            htmlFor="inline-photo-upload"
                            className="w-16 h-16 flex items-center justify-center border-2 border-dashed rounded-md cursor-pointer hover:border-primary transition-colors"
                          >
                            {uploadPhotoMutation.isPending ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <Upload className="h-5 w-5 text-muted-foreground" />
                            )}
                          </Label>
                          <input
                            id="inline-photo-upload"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handlePhotoUpload}
                            className="hidden"
                            data-testid="input-inline-photo-upload"
                          />
                        </div>
                        {!selectedPhotoId && (
                          <p className="text-sm text-amber-600 dark:text-amber-400">
                            Please select a photo above
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {!needsPhoto && (
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="includePerson"
                      checked={includePerson}
                      onCheckedChange={(checked) => setIncludePerson(checked === true)}
                      data-testid="checkbox-include-person"
                    />
                    <Label htmlFor="includePerson" className="cursor-pointer flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Include a person in the thumbnail (AI-generated)
                    </Label>
                  </div>
                )}

                <Button
                  onClick={handleGenerate}
                  disabled={generateThumbnailMutation.isPending || !title.trim() || (needsPhoto && !selectedPhotoId)}
                  className="w-full"
                  data-testid="button-generate"
                >
                  {generateThumbnailMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Generating (this may take 15-30 seconds)...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Thumbnail
                    </>
                  )}
                </Button>

                {provider === "instantid" && (
                  <p className="text-xs text-muted-foreground text-center">
                    InstantID uses Replicate AI (~$0.02 per generation) to create thumbnails featuring your actual likeness.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="photos" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Your Profile Photos</CardTitle>
                <CardDescription>
                  Upload photos of yourself to use with InstantID for personalized thumbnails
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Label
                    htmlFor="photo-upload"
                    className="flex items-center gap-2 cursor-pointer px-4 py-2 border rounded-md hover:bg-accent transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    Upload Photo
                  </Label>
                  <input
                    id="photo-upload"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoUpload}
                    className="hidden"
                    data-testid="input-photo-upload"
                  />
                  {uploadPhotoMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>

                {photosLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : photos.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <User className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No photos uploaded yet</p>
                    <p className="text-sm">Upload a clear photo of your face for best results</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {photos.map((photo) => (
                      <div key={photo.id} className="relative group">
                        <img
                          src={`/api/thumbnails/photo-file/${photo.id}`}
                          alt={photo.filename}
                          className="w-full aspect-square object-cover rounded-md"
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deletePhotoMutation.mutate(photo.id)}
                          disabled={deletePhotoMutation.isPending}
                          data-testid={`button-delete-photo-${photo.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        {photo.isDefault && (
                          <Badge className="absolute bottom-2 left-2">Default</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gallery" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Generated Thumbnails</CardTitle>
                <CardDescription>
                  Your previously generated thumbnails. Click download to save them.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {thumbnailsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : thumbnails.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No thumbnails generated yet</p>
                    <p className="text-sm">Generate your first thumbnail in the Generate tab</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {thumbnails.map((thumbnail) => (
                      <div key={thumbnail.id} className="relative group">
                        <img
                          src={thumbnail.imageData}
                          alt={thumbnail.title}
                          className="w-full aspect-video object-cover rounded-md"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDownload(thumbnail)}
                            data-testid={`button-download-${thumbnail.id}`}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteThumbnailMutation.mutate(thumbnail.id)}
                            disabled={deleteThumbnailMutation.isPending}
                            data-testid={`button-delete-thumbnail-${thumbnail.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 rounded-b-md">
                          <p className="text-white text-sm font-medium truncate">{thumbnail.title}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="secondary" className="text-xs">
                              {providerLabels[thumbnail.provider]?.label || thumbnail.provider}
                            </Badge>
                            {thumbnail.style && (
                              <Badge variant="outline" className="text-xs text-white border-white/50">
                                {styleLabels[thumbnail.style]?.label || thumbnail.style}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
