import { Link } from "lucide-react";

export function TrainingResourceIcon({ kind }: { kind?: string | null }) {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100">
      {kind === "pdf" ? (
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-red-600 text-[9px] font-extrabold tracking-tight text-white shadow-sm">
          PDF
        </div>
      ) : (
        <Link className="h-5 w-5 text-slate-500" aria-label="Link resource" />
      )}
    </div>
  );
}