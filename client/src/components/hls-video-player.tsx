import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HlsVideoPlayerProps {
  sessionId: string;
  hlsStatus: "queued" | "generating" | "playable" | "complete" | "failed" | null;
  fallbackVideoPath: string | null;
  posterUrl?: string | null;
  className?: string;
}

export function HlsVideoPlayer({ 
  sessionId, 
  hlsStatus, 
  fallbackVideoPath,
  posterUrl,
  className = "aspect-video w-full rounded-lg bg-black"
}: HlsVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingHls, setUsingHls] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const hlsPlayable = hlsStatus === "playable" || hlsStatus === "complete";
  const hlsPlaylistUrl = `/api/sessions/${sessionId}/hls/playlist.m3u8`;
  const fallbackVideoUrl = `/api/sessions/${sessionId}/video`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const cleanup = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    const tryHlsPlayback = () => {
      if (!hlsPlayable) return false;

      if (Hls.isSupported()) {
        cleanup();
        
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
        });
        
        hlsRef.current = hls;
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setLoading(false);
          setUsingHls(true);
          setError(null);
        });
        
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.error("[HLS] Fatal error:", data);
            cleanup();
            
            if (fallbackVideoPath) {
              tryFallbackPlayback();
            } else {
              setError("Failed to load HLS stream");
              setLoading(false);
            }
          }
        });
        
        hls.loadSource(hlsPlaylistUrl);
        hls.attachMedia(video);
        
        return true;
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = hlsPlaylistUrl;
        video.addEventListener("loadedmetadata", () => {
          setLoading(false);
          setUsingHls(true);
          setError(null);
        });
        video.addEventListener("error", () => {
          if (fallbackVideoPath) {
            tryFallbackPlayback();
          } else {
            setError("Failed to load video");
            setLoading(false);
          }
        });
        return true;
      }
      
      return false;
    };

    const tryFallbackPlayback = async () => {
      setUsingHls(false);
      setLoading(true);
      setError(null);
      
      try {
        // First check if the video endpoint is accessible
        const checkResponse = await fetch(fallbackVideoUrl, { 
          method: "HEAD",
          credentials: "include" 
        });
        
        if (!checkResponse.ok) {
          const contentType = checkResponse.headers.get("content-type");
          // Try to get error message from a GET request if HEAD fails
          if (checkResponse.status >= 400) {
            const errorResponse = await fetch(fallbackVideoUrl, { credentials: "include" });
            if (errorResponse.headers.get("content-type")?.includes("application/json")) {
              const data = await errorResponse.json();
              throw new Error(data.message || `Failed to load video: ${checkResponse.status}`);
            }
            throw new Error(`Failed to load video: ${checkResponse.status}`);
          }
        }
        
        // Use direct URL with credentials - browser handles range requests natively
        video.src = fallbackVideoUrl;
        
        video.onloadedmetadata = () => {
          setLoading(false);
          setError(null);
        };
        
        video.onerror = (e) => {
          console.error("[Video] Native playback error:", e);
          setError("Video playback failed");
          setLoading(false);
        };
      } catch (err) {
        console.error("[Video] Fallback error:", err);
        setError(err instanceof Error ? err.message : "Failed to load video");
        setLoading(false);
      }
    };

    setLoading(true);
    setError(null);

    if (hlsPlayable) {
      const usedHls = tryHlsPlayback();
      if (!usedHls && fallbackVideoPath) {
        tryFallbackPlayback();
      } else if (!usedHls) {
        setError("Video streaming not supported");
        setLoading(false);
      }
    } else if (fallbackVideoPath) {
      tryFallbackPlayback();
    } else {
      setLoading(false);
    }

    return cleanup;
  }, [sessionId, hlsPlayable, fallbackVideoPath, retryCount]);

  const handleRetry = () => {
    setRetryCount(c => c + 1);
  };

  if (error) {
    return (
      <div className={`flex items-center justify-center ${className} bg-muted`}>
        <div className="text-center space-y-3">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
          <p className="font-medium text-destructive">Video failed to load</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button
            variant="outline"
            onClick={handleRetry}
            data-testid="button-reload-video"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {loading && (
        <div className={`absolute inset-0 flex items-center justify-center ${className} bg-muted`}>
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-2 text-sm text-muted-foreground">
              {hlsPlayable ? "Streaming video..." : "Loading video..."}
            </p>
          </div>
        </div>
      )}
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        poster={posterUrl || undefined}
        className={className}
        style={{ display: loading ? "none" : "block" }}
        data-testid="video-player"
      />
      {usingHls && !loading && (
        <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 rounded text-[10px] text-white/80 pointer-events-none">
          HLS
        </div>
      )}
    </div>
  );
}
