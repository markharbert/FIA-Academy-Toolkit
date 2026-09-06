import { useEffect, useState } from "react";
import { Check, ChevronDown, Clock3, Copy, ListVideo, Loader2, Pencil, Save } from "lucide-react";
import { formatTranscriptParagraphs } from "@shared/transcript-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type TrainingChapter = {
  startSeconds: number;
  title: string;
};

type TrainingTranscriptStatusProps = {
  updatedAt: string | null;
  source?: string | null;
  transcriptText?: string | null;
  chapters?: TrainingChapter[] | null;
  chaptersGeneratedAt?: string | null;
  onSaveChapterTitles?: (titles: string[]) => Promise<void>;
};

function formatTranscriptGeneratedAt(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatChapterTimestamp(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = String(total % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remaining}`
    : `${minutes}:${remaining}`;
}

function TrainingChapterEditor({
  chapters,
  generatedAt,
  onSave,
}: {
  chapters: TrainingChapter[];
  generatedAt?: string | null;
  onSave?: (titles: string[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [titles, setTitles] = useState(chapters.map((chapter) => chapter.title));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitles(chapters.map((chapter) => chapter.title));
  }, [chapters]);

  const reset = () => {
    setTitles(chapters.map((chapter) => chapter.title));
    setOpen(false);
  };

  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(titles.map((title) => title.trim()));
      setOpen(false);
    } catch {
      // The owning editor reports the request error.
    } finally {
      setSaving(false);
    }
  };

  const unchanged = titles.every((title, index) => title.trim() === chapters[index]?.title);
  const invalid = titles.some((title) => !title.trim());

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-4 border-t border-violet-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-violet-50/70 px-3 py-2">
        <div className="flex items-start gap-2">
          <ListVideo className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" />
          <span className="text-xs text-violet-950">
            {generatedAt ? (
              <>
                Chapters generated on{" "}
                <span className="font-semibold">
                  {formatTranscriptGeneratedAt(generatedAt) || "an unknown date"}
                </span>
              </>
            ) : (
              <span className="font-semibold">Chapters are ready</span>
            )}
            <span className="text-violet-800/75"> · {chapters.length} chapters</span>
          </span>
        </div>
        {onSave && (
          <CollapsibleTrigger asChild>
            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs text-violet-900">
              <Pencil className="h-3.5 w-3.5" />
              Edit Chapters
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
        )}
      </div>
      <CollapsibleContent>
        <div className="space-y-2 px-1 pt-3">
          {chapters.map((chapter, index) => (
            <div key={`${chapter.startSeconds}-${index}`} className="flex items-center gap-2">
              <span className="w-12 shrink-0 font-mono text-xs font-semibold text-violet-700">
                {formatChapterTimestamp(chapter.startSeconds)}
              </span>
              <Input
                value={titles[index] ?? ""}
                maxLength={60}
                aria-label={`Chapter ${index + 1} title`}
                onChange={(event) => setTitles((current) => current.map((title, titleIndex) =>
                  titleIndex === index ? event.target.value : title
                ))}
              />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={reset}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={saving || invalid || unchanged} onClick={save}>
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Save titles
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function TrainingTranscriptStatus({
  updatedAt,
  source,
  transcriptText,
  chapters,
  chaptersGeneratedAt,
  onSaveChapterTitles,
}: TrainingTranscriptStatusProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!updatedAt) return null;
  const formattedTranscript = transcriptText ? formatTranscriptParagraphs(transcriptText) : "";

  const copyTranscript = async () => {
    await navigator.clipboard.writeText(formattedTranscript);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="rounded-md border border-violet-100 bg-violet-50/60 text-xs text-violet-950">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div className="flex items-start gap-2">
              <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" />
              <span>
                Transcript generated on{" "}
                <span className="font-semibold">
                  {formatTranscriptGeneratedAt(updatedAt) || "an unknown date"}
                </span>
                {source && <span className="text-violet-800/75"> · {source}</span>}
              </span>
            </div>
            {formattedTranscript && (
              <CollapsibleTrigger asChild>
                <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-violet-900">
                  View Transcript
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
          <CollapsibleContent>
            <div className="border-t border-violet-100 bg-white/80 px-4 py-3">
              <div className="mb-2 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 bg-white"
                  onClick={copyTranscript}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-foreground">
                {formattedTranscript}
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
      {chapters && chapters.length > 0 && (
        <TrainingChapterEditor
          chapters={chapters}
          generatedAt={chaptersGeneratedAt}
          onSave={onSaveChapterTitles}
        />
      )}
    </>
  );
}