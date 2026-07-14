import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { X, Upload, Trash2, Loader2, FileText, Brain } from "lucide-react";

interface BrainFile {
  id: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
}

interface BrainData {
  targeting: string;
  files: BrainFile[];
}

interface Props {
  funnelId: string;
  onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FunnelBrainPanel({ funnelId, onClose }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [targeting, setTargeting] = useState("");
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);

  const brainKey = [`/api/funnels/${funnelId}/brain`];

  const { data, isLoading } = useQuery<BrainData>({
    queryKey: brainKey,
    queryFn: async () => {
      const res = await fetch(`/api/funnels/${funnelId}/brain`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  useEffect(() => {
    if (data?.targeting !== undefined) setTargeting(data.targeting);
  }, [data?.targeting]);

  const saveMutation = useMutation({
    mutationFn: async (value: string) => {
      await apiRequest("PATCH", `/api/funnels/${funnelId}/brain`, { targeting: value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brainKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await apiRequest("DELETE", `/api/funnels/${funnelId}/brain/files/${fileId}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brainKey });
      toast({ title: "File removed" });
    },
    onError: () => toast({ title: "Failed to remove file", variant: "destructive" }),
  });

  const uploadFile = useCallback(
    async (file: File) => {
      const fileCount = data?.files?.length ?? 0;
      if (fileCount >= 25) {
        toast({ title: "Maximum 25 files reached", variant: "destructive" });
        return;
      }
      const allowed = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "text/markdown",
        "text/csv",
      ];
      const ext = file.name.toLowerCase();
      const ok =
        allowed.includes(file.type) ||
        ext.endsWith(".txt") ||
        ext.endsWith(".md") ||
        ext.endsWith(".pdf") ||
        ext.endsWith(".docx");
      if (!ok) {
        toast({ title: "Unsupported file type. Use PDF, DOCX, TXT, or MD.", variant: "destructive" });
        return;
      }
      setUploadingFile(file.name);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/funnels/${funnelId}/brain/files`, {
          method: "POST",
          body: form,
          credentials: "include",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { message?: string }).message ?? "Upload failed");
        }
        queryClient.invalidateQueries({ queryKey: brainKey });
        toast({ title: "File added to Funnel Brain" });
      } catch (err: any) {
        toast({ title: err.message ?? "Upload failed", variant: "destructive" });
      } finally {
        setUploadingFile(null);
      }
    },
    [data?.files?.length, funnelId, toast, brainKey]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
      e.target.value = "";
    },
    [uploadFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const fileCount = data?.files?.length ?? 0;

  return (
    <div className="w-72 shrink-0 flex flex-col bg-[hsl(230,45%,9%)] border-l border-white/10 h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold text-white">Funnel Brain</span>
        </div>
        <button
          onClick={onClose}
          className="text-white/30 hover:text-white transition-colors"
          data-testid="button-close-funnel-brain"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-white/30" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {/* Intro blurb */}
          <p className="text-[11px] text-white/40 leading-relaxed">
            Everything you add here gives the AI context about this funnel. It automatically uses this when drafting emails.
          </p>

          {/* Target Audience */}
          <div>
            <Label className="text-xs text-white/50 uppercase tracking-wide">Target Audience</Label>
            <p className="text-[10px] text-white/30 mt-1 mb-2 leading-snug">
              Who is this funnel for? Describe your ideal customer, their pain points, goals, and what makes them buy.
            </p>
            <Textarea
              value={targeting}
              onChange={(e) => setTargeting(e.target.value)}
              onBlur={() => {
                if (targeting !== (data?.targeting ?? "")) saveMutation.mutate(targeting);
              }}
              className="bg-white/[0.04] border-white/10 text-white text-sm resize-none"
              style={{ minHeight: 130 }}
              placeholder="e.g. Female physical therapists aged 35-55 who want to attract more private pay patients and stop relying on insurance billing..."
              data-testid="textarea-brain-targeting"
            />
            {saveMutation.isPending && (
              <p className="text-[10px] text-white/30 mt-1 flex items-center gap-1">
                <Loader2 className="w-2.5 h-2.5 animate-spin" /> Saving…
              </p>
            )}
          </div>

          {/* Context Files */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-white/50 uppercase tracking-wide">Context Files</Label>
              <span className="text-[10px] text-white/30">{fileCount} / 25</span>
            </div>
            <p className="text-[10px] text-white/30 mb-3 leading-snug">
              Upload PDFs, transcripts, Word docs, or text files. The AI reads these when writing emails.
            </p>

            {/* Drop zone */}
            {fileCount < 25 && (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                onDragLeave={() => setIsDraggingOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl p-5 flex flex-col items-center gap-2 cursor-pointer transition-colors mb-3 ${
                  isDraggingOver
                    ? "border-violet-400/60 bg-violet-500/10"
                    : "border-white/10 hover:border-white/20 hover:bg-white/[0.03]"
                }`}
                data-testid="dropzone-brain-files"
              >
                {uploadingFile ? (
                  <>
                    <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
                    <p className="text-[11px] text-white/50 text-center leading-snug truncate max-w-full px-2">
                      Reading {uploadingFile}…
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="h-5 w-5 text-white/30" />
                    <p className="text-[11px] text-white/40 text-center leading-snug">
                      Drop a file here, or click to browse
                    </p>
                    <p className="text-[10px] text-white/25 text-center">PDF · DOCX · TXT · MD — up to 20 MB</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={handleFileChange}
                  data-testid="input-brain-file"
                />
              </div>
            )}

            {/* File list */}
            {data?.files && data.files.length > 0 && (
              <div className="space-y-2">
                {data.files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.07] group"
                    data-testid={`brain-file-${file.id}`}
                  >
                    <FileText className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white/80 truncate leading-snug">{file.filename}</p>
                      <p className="text-[10px] text-white/30">{formatBytes(file.fileSize)}</p>
                    </div>
                    <button
                      onClick={() => deleteMutation.mutate(file.id)}
                      disabled={deleteMutation.isPending}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-white/30 hover:text-red-400"
                      title="Remove file"
                      data-testid={`button-delete-brain-file-${file.id}`}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {fileCount === 0 && !uploadingFile && (
              <p className="text-[10px] text-white/20 text-center mt-1">No files yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
