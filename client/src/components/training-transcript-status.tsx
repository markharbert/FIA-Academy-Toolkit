import { Clock3 } from "lucide-react";

type TrainingTranscriptStatusProps = {
  updatedAt: string | null;
  source?: string | null;
};

function formatTranscriptGeneratedAt(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function TrainingTranscriptStatus({ updatedAt, source }: TrainingTranscriptStatusProps) {
  if (!updatedAt) return null;

  return (
    <div className="flex items-start gap-2 rounded-md border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs text-violet-950">
      <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" />
      <span>
        Transcript generated on{" "}
        <span className="font-semibold">
          {formatTranscriptGeneratedAt(updatedAt) || "an unknown date"}
        </span>
        {source && <span className="text-violet-800/75"> · {source}</span>}
      </span>
    </div>
  );
}