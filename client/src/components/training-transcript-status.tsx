import { useState } from "react";
import { Check, ChevronDown, Clock3, Copy } from "lucide-react";
import { formatTranscriptParagraphs } from "@shared/transcript-format";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type TrainingTranscriptStatusProps = {
  updatedAt: string | null;
  source?: string | null;
  transcriptText?: string | null;
};

function formatTranscriptGeneratedAt(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function TrainingTranscriptStatus({ updatedAt, source, transcriptText }: TrainingTranscriptStatusProps) {
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
  );
}