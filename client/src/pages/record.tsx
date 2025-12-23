import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Video, Circle, Square, RotateCcw, Save, Lightbulb, Mic, CheckCircle, Loader2, AlertCircle, Upload, FileText, TrendingUp, Camera, Settings } from "lucide-react";
import type { GoalType } from "@shared/schema";

interface MediaDeviceOption {
  deviceId: string;
  label: string;
}

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
  { icon: Lightbulb, text: "Find good lighting - face a window or light source" },
  { icon: Mic, text: "Speak clearly and at a steady pace" },
  { icon: Video, text: "Keep it short and focused - aim for 30-90 seconds" },
];

type ProcessingStep = "idle" | "uploading" | "converting" | "transcribing" | "scoring" | "done" | "error";

const stepLabels: Record<ProcessingStep, string> = {
  idle: "Ready",
  uploading: "Uploading video...",
  converting: "Converting to MP4...",
  transcribing: "Transcribing audio...",
  scoring: "Scoring your video...",
  done: "Complete!",
  error: "Error occurred",
};

function ProcessingStepper({ currentStep }: { currentStep: ProcessingStep }) {
  const steps: ProcessingStep[] = ["uploading", "converting", "transcribing", "scoring", "done"];
  const currentIndex = steps.indexOf(currentStep);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isActive = step === currentStep;
          const isComplete = currentIndex > index || currentStep === "done";
          const Icon = step === "uploading" ? Upload : step === "converting" ? Video : step === "transcribing" ? FileText : step === "scoring" ? TrendingUp : CheckCircle;

          return (
            <div key={step} className="flex flex-1 items-center">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                isComplete ? "border-primary bg-primary text-primary-foreground" :
                isActive ? "border-primary text-primary" :
                "border-muted text-muted-foreground"
              }`}>
                {isComplete && step !== currentStep ? (
                  <CheckCircle className="h-5 w-5" />
                ) : isActive && currentStep !== "done" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </div>
              {index < steps.length - 1 && (
                <div className={`h-0.5 flex-1 mx-2 ${isComplete ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-center text-sm font-medium">{stepLabels[currentStep]}</p>
    </div>
  );
}

export default function RecordPage() {
  const [, setLocation] = useLocation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [goalType, setGoalType] = useState<GoalType>("sales");
  const [processingStep, setProcessingStep] = useState<ProcessingStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("");

  const [cameras, setCameras] = useState<MediaDeviceOption[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceOption[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [selectedMicrophone, setSelectedMicrophone] = useState<string>("");
  const [audioLevel, setAudioLevel] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioAnimationRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);

  const cleanupAudio = useCallback(() => {
    if (audioAnimationRef.current) {
      cancelAnimationFrame(audioAnimationRef.current);
      audioAnimationRef.current = null;
    }
    if (audioSourceRef.current) {
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  const startCamera = useCallback(async (cameraId?: string, micId?: string) => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      cleanupAudio();

      const constraints: MediaStreamConstraints = {
        video: cameraId
          ? { deviceId: { exact: cameraId }, width: 1280, height: 720 }
          : { width: 1280, height: 720, facingMode: "user" },
        audio: micId
          ? { deviceId: { exact: micId } }
          : true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
      }
      setCameraReady(true);

      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new AudioContext();
      }
      const audioContext = audioContextRef.current;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioSourceRef.current = source;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(Math.min(100, (avg / 128) * 100));
        audioAnimationRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (err) {
      setError("Could not access camera. Please allow camera permissions.");
    }
  }, [cleanupAudio]);

  useEffect(() => {
    const init = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {}
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices
        .filter((d) => d.kind === "videoinput")
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${i + 1}`,
        }));
      const audioDevices = devices
        .filter((d) => d.kind === "audioinput")
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
        }));

      setCameras(videoDevices);
      setMicrophones(audioDevices);

      const savedCamera = localStorage.getItem("selectedCameraId");
      const savedMic = localStorage.getItem("selectedMicrophoneId");

      const initialCamera = savedCamera && videoDevices.some((d) => d.deviceId === savedCamera)
        ? savedCamera
        : videoDevices[0]?.deviceId || "";
      const initialMic = savedMic && audioDevices.some((d) => d.deviceId === savedMic)
        ? savedMic
        : audioDevices[0]?.deviceId || "";

      setSelectedCamera(initialCamera);
      setSelectedMicrophone(initialMic);

      if (initialCamera || initialMic) {
        await startCamera(initialCamera, initialMic);
      }
      isInitializedRef.current = true;
    };
    init();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      cleanupAudio();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [startCamera, cleanupAudio]);

  const handleCameraChange = (deviceId: string) => {
    setSelectedCamera(deviceId);
    localStorage.setItem("selectedCameraId", deviceId);
    if (isInitializedRef.current) {
      startCamera(deviceId, selectedMicrophone);
    }
  };

  const handleMicrophoneChange = (deviceId: string) => {
    setSelectedMicrophone(deviceId);
    localStorage.setItem("selectedMicrophoneId", deviceId);
    if (isInitializedRef.current) {
      startCamera(selectedCamera, deviceId);
    }
  };

  const startRecording = () => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    setDuration(0);
    setRecordedBlob(null);
    setRecordedUrl(null);
    setError(null);

    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: "video/webm;codecs=vp9,opus",
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      setRecordedBlob(blob);
      const url = URL.createObjectURL(blob);
      setRecordedUrl(url);
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start(1000);
    setIsRecording(true);

    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const retake = () => {
    setRecordedBlob(null);
    setRecordedUrl(null);
    setDuration(0);
    setError(null);
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.muted = true;
    }
  };

  const saveSession = async () => {
    if (!recordedBlob) return;

    setProcessingStep("uploading");
    setError(null);

    try {
      const createRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          goalType, 
          durationSeconds: duration,
          title: sessionTitle.trim() || undefined,
        }),
        credentials: "include",
      });

      if (!createRes.ok) throw new Error("Failed to create session");
      const { id } = await createRes.json();

      const formData = new FormData();
      formData.append("video", recordedBlob, "recording.webm");

      const uploadRes = await fetch(`/api/sessions/${id}/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!uploadRes.ok) throw new Error("Failed to upload video");

      setProcessingStep("converting");
      const convertRes = await fetch(`/api/sessions/${id}/convert`, {
        method: "POST",
        credentials: "include",
      });

      if (!convertRes.ok) throw new Error("Failed to convert video to MP4");

      setProcessingStep("transcribing");
      const transcribeRes = await fetch(`/api/sessions/${id}/transcribe`, {
        method: "POST",
        credentials: "include",
      });

      if (!transcribeRes.ok) throw new Error("Failed to transcribe video");

      setProcessingStep("scoring");
      const scoreRes = await fetch(`/api/sessions/${id}/score`, {
        method: "POST",
        credentials: "include",
      });

      if (!scoreRes.ok) throw new Error("Failed to score video");

      setProcessingStep("done");
      setTimeout(() => {
        setLocation(`/session/${id}`);
      }, 1000);
    } catch (err) {
      setProcessingStep("error");
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isProcessing = processingStep !== "idle" && processingStep !== "error";

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold" data-testid="text-record-title">New Practice Session</h1>
        <p className="text-muted-foreground">Record your video and get AI-powered feedback</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-6">
          <Card>
            <CardContent className="p-4">
              <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
                {recordedUrl ? (
                  <video
                    src={recordedUrl}
                    controls
                    className="h-full w-full object-cover"
                    data-testid="video-playback"
                  />
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="h-full w-full object-cover"
                    data-testid="video-preview"
                  />
                )}
                {isRecording && (
                  <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-destructive px-3 py-1 text-sm font-medium text-destructive-foreground">
                    <Circle className="h-3 w-3 animate-pulse fill-current" />
                    {formatTime(duration)}
                  </div>
                )}
                {!cameraReady && !recordedUrl && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-white" />
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                {!recordedUrl ? (
                  <>
                    {!isRecording ? (
                      <Button
                        size="lg"
                        onClick={startRecording}
                        disabled={!cameraReady}
                        data-testid="button-start-recording"
                      >
                        <Circle className="mr-2 h-5 w-5 fill-current" />
                        Start Recording
                      </Button>
                    ) : (
                      <Button
                        size="lg"
                        variant="destructive"
                        onClick={stopRecording}
                        data-testid="button-stop-recording"
                      >
                        <Square className="mr-2 h-5 w-5 fill-current" />
                        Stop Recording
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={retake}
                      disabled={isProcessing}
                      data-testid="button-retake"
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Re-record
                    </Button>
                    <Button
                      size="lg"
                      onClick={saveSession}
                      disabled={isProcessing}
                      data-testid="button-save-session"
                    >
                      {isProcessing ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-5 w-5" />
                      )}
                      Save Session
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {isProcessing && (
            <Card>
              <CardContent className="py-6">
                <ProcessingStepper currentStep={processingStep} />
              </CardContent>
            </Card>
          )}

          {error && (
            <Card className="border-destructive">
              <CardContent className="flex items-center gap-3 py-4">
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Recording Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {tips.map((tip, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <tip.icon className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground pt-1">{tip.text}</p>
                </div>
              ))}
            </CardContent>
          </Card>

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
                  disabled={isRecording || isProcessing}
                  data-testid="input-session-title"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to auto-generate from your transcript
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal">Video Goal</Label>
                <Select value={goalType} onValueChange={(v) => setGoalType(v as GoalType)} disabled={isRecording || isProcessing}>
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

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="camera" className="flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    Camera
                  </Label>
                  {cameras.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No camera detected</p>
                  ) : (
                    <Select 
                      value={selectedCamera} 
                      onValueChange={handleCameraChange}
                      disabled={isRecording || isProcessing}
                    >
                      <SelectTrigger id="camera" data-testid="select-camera">
                        <SelectValue placeholder="Select camera" />
                      </SelectTrigger>
                      <SelectContent>
                        {cameras.map((cam) => (
                          <SelectItem key={cam.deviceId} value={cam.deviceId}>
                            {cam.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="microphone" className="flex items-center gap-2">
                    <Mic className="h-4 w-4" />
                    Microphone
                  </Label>
                  {microphones.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No microphone detected</p>
                  ) : (
                    <Select 
                      value={selectedMicrophone} 
                      onValueChange={handleMicrophoneChange}
                      disabled={isRecording || isProcessing}
                    >
                      <SelectTrigger id="microphone" data-testid="select-microphone">
                        <SelectValue placeholder="Select microphone" />
                      </SelectTrigger>
                      <SelectContent>
                        {microphones.map((mic) => (
                          <SelectItem key={mic.deviceId} value={mic.deviceId}>
                            {mic.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {microphones.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Microphone Level</Label>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div 
                      className="h-full bg-primary transition-all duration-75"
                      style={{ width: `${audioLevel}%` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                5-Part Video Formula
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {formulaParts.map((part) => (
                <div key={part.num} className="space-y-2" data-testid={`formula-part-${part.num}`}>
                  <div className="flex items-center gap-2">
                    <Badge className="h-6 w-6 shrink-0 items-center justify-center rounded-full p-0">
                      {part.num}
                    </Badge>
                    <h4 className="font-semibold">{part.title}</h4>
                  </div>
                  <p className="text-sm text-muted-foreground pl-8">{part.goal}</p>
                  <ul className="space-y-1 pl-8">
                    {part.examples.map((ex, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        • {ex}
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
