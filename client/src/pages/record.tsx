import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Video, Lightbulb, Mic, CheckCircle, Loader2, AlertCircle, Upload, Settings, X, File } from "lucide-react";
import type { GoalType } from "@shared/schema";

const formulaParts = [
  {
    num: 1,
    title: "Hook",
    goal: "Grab attention in the first 1-3 seconds.",
    examples: ["Ask a sharp question", "Call out the audience", "Make a bold promise"],
  },
  {
    num: 2,
    title: "Set the Hook",
    goal: "Create curiosity and make the viewer want to keep watching.",
    examples: ["Tease what is coming", "Mention a common mistake", "Set up a quick story"],
  },
  {
    num: 3,
    title: "First Call to Action",
    goal: "Early micro action.",
    examples: ['"Comment the word..."', '"Follow for more..."', '"Stick with me..."'],
  },
  {
    num: 4,
    title: "Content",
    goal: "Deliver the value clearly.",
    examples: ["1 to 3 points", "Clear steps", "Simple explanation"],
  },
  {
    num: 5,
    title: "Final Call to Action",
    goal: "Clear next step at the end.",
    examples: ['"Click the link..."', '"Download the guide..."', '"Send me a message..."'],
  },
];

const tips = [
  { icon: Lightbulb, text: "Record in good lighting - face a window or light source" },
  { icon: Mic, text: "Speak clearly and at a steady pace" },
  { icon: Video, text: "Keep it short and focused - aim for 30-90 seconds" },
];

type ProcessingStep = "idle" | "uploading" | "done" | "error";

const stepLabels: Record<ProcessingStep, string> = {
  idle: "Ready to upload",
  uploading: "Uploading video...",
  done: "Upload complete! Redirecting...",
  error: "Error occurred",
};

const SUPPORTED_FORMATS = ".mp4, .mov, .webm, .mkv, .avi, .wmv, .mpeg, .mpg, .m4v, .3gp";
const MAX_FILE_SIZE_MB = 2048; // 2GB
const MAX_DURATION_MINUTES = 10;

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadProgress({ currentStep, uploadProgress }: { currentStep: ProcessingStep; uploadProgress: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3">
        {currentStep === "uploading" ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        ) : currentStep === "done" ? (
          <CheckCircle className="h-6 w-6 text-primary" />
        ) : null}
        <p className="text-sm font-medium">{stepLabels[currentStep]}</p>
      </div>
      {currentStep === "uploading" && (
        <div className="space-y-1">
          <Progress value={uploadProgress} className="h-2" />
          <p className="text-center text-xs text-muted-foreground">{uploadProgress}%</p>
        </div>
      )}
    </div>
  );
}

export default function RecordPage() {
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [goalType, setGoalType] = useState<GoalType>("sales");
  const [processingStep, setProcessingStep] = useState<ProcessingStep>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const isProcessing = processingStep !== "idle" && processingStep !== "error";

  const handleFileSelect = useCallback((file: File) => {
    setError(null);
    
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }

    if (!file.type.startsWith("video/")) {
      setError("Please select a video file.");
      return;
    }

    setSelectedFile(file);
    
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(file));
  }, [previewUrl]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const clearFile = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setError(null);
    setProcessingStep("idle");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadAndProcess = async () => {
    if (!selectedFile) return;

    setProcessingStep("uploading");
    setUploadProgress(0);
    setError(null);

    try {
      const createRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          goalType, 
          title: sessionTitle.trim() || undefined,
        }),
        credentials: "include",
      });

      if (!createRes.ok) throw new Error("Failed to create session");
      const { id } = await createRes.json();

      const formData = new FormData();
      formData.append("video", selectedFile);

      const xhr = new XMLHttpRequest();
      
      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percent);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            try {
              const errData = JSON.parse(xhr.responseText);
              reject(new Error(errData.message || "Upload failed"));
            } catch {
              reject(new Error("Upload failed"));
            }
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
        xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

        xhr.open("POST", `/api/sessions/${id}/upload`);
        xhr.withCredentials = true;
        xhr.send(formData);
      });

      // Upload complete - processing starts automatically on server
      // Redirect to session page immediately where progress will be shown via SSE
      setProcessingStep("done");
      setLocation(`/session/${id}`);
    } catch (err) {
      setProcessingStep("error");
      const errorMessage = err instanceof Error ? err.message : "An error occurred";
      setError(errorMessage);
      console.error("[Upload] Error:", errorMessage);
    }
  };

  return (
    <div className="container mx-auto max-w-6xl p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Upload Video</h1>
        <p className="text-muted-foreground">Upload a video to get AI-powered feedback on your marketing skills.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardContent className="p-4">
              {!selectedFile ? (
                <div
                  className={`relative aspect-video overflow-hidden rounded-lg border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center gap-4 ${
                    isDragging 
                      ? "border-primary bg-primary/5" 
                      : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="upload-dropzone"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleInputChange}
                    className="hidden"
                    data-testid="input-video-file"
                  />
                  <Upload className={`h-16 w-16 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="text-center px-4">
                    <p className="text-lg font-medium">
                      {isDragging ? "Drop your video here" : "Drag and drop your video here"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      or click to browse your files
                    </p>
                  </div>
                  <div className="text-center text-xs text-muted-foreground space-y-1">
                    <p>Supported formats: {SUPPORTED_FORMATS}</p>
                    <p>Maximum size: 2GB | Maximum duration: {MAX_DURATION_MINUTES} minutes</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
                    <video
                      src={previewUrl || undefined}
                      controls
                      className="h-full w-full object-contain"
                      data-testid="video-preview"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3 min-w-0">
                      <File className="h-8 w-8 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium truncate" data-testid="text-filename">{selectedFile.name}</p>
                        <p className="text-sm text-muted-foreground" data-testid="text-filesize">
                          {formatFileSize(selectedFile.size)}
                        </p>
                      </div>
                    </div>
                    {!isProcessing && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={clearFile}
                        data-testid="button-clear-file"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="error-message">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              {isProcessing && (
                <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                  <UploadProgress currentStep={processingStep} uploadProgress={uploadProgress} />
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                {selectedFile && !isProcessing && (
                  <Button
                    size="lg"
                    onClick={uploadAndProcess}
                    data-testid="button-upload-process"
                  >
                    <Upload className="mr-2 h-5 w-5" />
                    Upload and Analyze
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3">
            {tips.map((tip, index) => (
              <Card key={index}>
                <CardContent className="flex items-start gap-3 p-4">
                  <tip.icon className="h-5 w-5 shrink-0 text-primary" />
                  <p className="text-sm">{tip.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                Session Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Session Name (optional)</Label>
                <Input
                  id="title"
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  placeholder="e.g., Product pitch practice"
                  maxLength={80}
                  disabled={isProcessing}
                  data-testid="input-session-title"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to auto-generate from your transcript
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal">Video Goal</Label>
                <Select value={goalType} onValueChange={(v) => setGoalType(v as GoalType)} disabled={isProcessing}>
                  <SelectTrigger id="goal" data-testid="select-goal">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales">Sales</SelectItem>
                    <SelectItem value="lead">Lead Capture</SelectItem>
                    <SelectItem value="education">Content Education</SelectItem>
                    <SelectItem value="recruit">Recruitment / Invite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Video className="h-5 w-5 text-primary" />
                5-Part Video Formula
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {formulaParts.map((part) => (
                <div key={part.num} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="w-6 h-6 flex items-center justify-center p-0">
                      {part.num}
                    </Badge>
                    <span className="font-medium">{part.title}</span>
                  </div>
                  <p className="text-sm text-muted-foreground pl-8">{part.goal}</p>
                  <ul className="text-xs text-muted-foreground pl-8 space-y-0.5">
                    {part.examples.map((example, i) => (
                      <li key={i} className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-primary" />
                        {example}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
