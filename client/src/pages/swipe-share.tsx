import { useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ExternalLink, FileText, Globe, Loader2,
  Camera, AlertCircle, ArrowUpRight,
} from "lucide-react";
import { format } from "date-fns";

type PromoLink = { title: string; url: string; description?: string };
type PublicSwipeItem = {
  id: string;
  title: string;
  type: "upload" | "snippet";
  content: string | null;
  imagePath: string | null;
  strips: string[] | null;   // ordered GCS paths for full-page multi-strip captures
  sourceUrl: string | null;
  notes: string | null;
  promoLinks: PromoLink[];
  shareToken: string;
  viewCount: number;
  createdAt: string;
};

export default function SwipeSharePage() {
  const { token } = useParams<{ token: string }>();

  const { data, isLoading, isError } = useQuery<{ item: PublicSwipeItem }>({
    queryKey: [`/api/swipe/public/${token}`],
    queryFn: async () => {
      const r = await fetch(`/api/swipe/public/${token}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? "Not found");
      return r.json();
    },
    retry: false,
    staleTime: 30_000,
  });

  const item = data?.item;

  useEffect(() => {
    if (item) document.title = `${item.title} — FIA Toolkit Swipe File`;
    return () => { document.title = "FIA Academy Toolkit"; };
  }, [item]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="rounded-full bg-gray-100 p-5 mb-4">
          <AlertCircle className="h-10 w-10 text-gray-400" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Link Not Found</h1>
        <p className="text-gray-400 text-sm max-w-xs">
          This share link has expired, been revoked, or never existed.
        </p>
      </div>
    );
  }

  const hasPromos   = item.promoLinks && item.promoLinks.length > 0;
  const isImage     = item.type === "upload" && item.imagePath;
  const isMultiStrip = isImage && Array.isArray(item.strips) && item.strips.length > 1;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm tracking-wide text-gray-700">
            FIA Toolkit · Swipe File
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Globe className="h-3.5 w-3.5" />
          <span>{item.viewCount.toLocaleString()} view{item.viewCount !== 1 ? "s" : ""}</span>
        </div>
      </header>

      {/* ── Main (with margin on all sides) ────────────────────────────────── */}
      <main className="p-4 lg:p-6">

        {isImage ? (
          /* ── IMAGE: 75 / 25 split card ────────────────────────────────── */
          <div
            className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col lg:flex-row"
            style={{ minHeight: "calc(100vh - 120px)" }}
          >
            {/* Left 75% — image (single) or scrollable strip stack (full-page) */}
            {isMultiStrip ? (
              /* Multi-strip (legacy strip-upload) — stacked scrollable strips */
              <div
                className="lg:w-3/4 bg-gray-950 overflow-y-auto"
                style={{ maxHeight: "calc(100vh - 120px)" }}
              >
                {item.strips!.map((_, i) => (
                  <img
                    key={i}
                    src={`/api/swipe/public/${item.shareToken}/strip/${i}`}
                    alt={`${item.title} — section ${i + 1}`}
                    style={{ display: "block", width: "100%" }}
                    loading={i === 0 ? "eager" : "lazy"}
                  />
                ))}
              </div>
            ) : (
              /* Single image — scrollable so tall full-page captures are readable */
              <div
                className="lg:w-3/4 bg-gray-950 overflow-y-auto"
                style={{ maxHeight: "calc(100vh - 120px)" }}
              >
                <img
                  src={`/api/swipe/public/${item.shareToken}/image`}
                  alt={item.title}
                  style={{ display: "block", width: "100%" }}
                />
              </div>
            )}

            {/* Right 25% — info + promo */}
            <div className="lg:w-1/4 border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col">

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">

                {/* Title + meta */}
                <div className="space-y-2">
                  <h1 className="text-lg font-bold text-gray-900 leading-snug">{item.title}</h1>
                  <div className="space-y-1 text-xs text-gray-400">
                    <div className="flex items-center gap-1.5">
                      <Camera className="h-3 w-3 shrink-0" />
                      <span>{format(new Date(item.createdAt), "MMMM d, yyyy")}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Globe className="h-3 w-3 shrink-0" />
                      <span>{item.viewCount.toLocaleString()} view{item.viewCount !== 1 ? "s" : ""}</span>
                    </div>
                    {item.sourceUrl && (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 hover:text-gray-700 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {item.sourceUrl.replace(/^https?:\/\//, "").split("/")[0]}
                        </span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Creator's note */}
                {item.notes && (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                      Creator's Note
                    </p>
                    <p className="text-sm text-gray-700 leading-relaxed">{item.notes}</p>
                  </div>
                )}

                {/* Divider */}
                <div className="h-px bg-gray-100" />

                {/* Promo links — or placeholder */}
                {hasPromos ? (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                      Recommended Resources
                    </p>
                    <div className="space-y-2">
                      {item.promoLinks.map((pl, i) => (
                        <a
                          key={i}
                          href={pl.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 hover:bg-primary/5 hover:border-primary/30 p-3 transition-all"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-xs text-gray-900 group-hover:text-primary transition-colors">
                              {pl.title}
                            </p>
                            {pl.description && (
                              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{pl.description}</p>
                            )}
                            <p className="text-xs text-gray-400 mt-1 truncate">
                              {pl.url.replace(/^https?:\/\//, "")}
                            </p>
                          </div>
                          <ArrowUpRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-primary shrink-0 mt-0.5 transition-colors" />
                        </a>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border-2 border-dashed border-gray-100 p-6 text-center">
                    <p className="text-xs text-gray-300">Promotional links will appear here</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="shrink-0 p-4 border-t border-gray-100">
                <p className="text-center text-xs text-gray-300">
                  Shared via{" "}
                  <span className="text-gray-400 font-medium">FIA Toolkit</span>
                </p>
              </div>
            </div>
          </div>

        ) : (
          /* ── SNIPPET / FALLBACK: centered single-column ───────────────── */
          <div className="max-w-3xl mx-auto space-y-5 pt-2">

            {/* Title + meta */}
            <div className="space-y-1">
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">{item.title}</h1>
              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                <span className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" /> Text Snippet
                </span>
                <span>{format(new Date(item.createdAt), "MMMM d, yyyy")}</span>
                {item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-gray-700 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {item.sourceUrl.replace(/^https?:\/\//, "").split("/")[0]}
                  </a>
                )}
              </div>
            </div>

            {/* Snippet body */}
            {item.content && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <p className="text-gray-800 leading-relaxed whitespace-pre-wrap font-mono text-sm">
                  {item.content}
                </p>
                {item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-4 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View original source
                  </a>
                )}
              </div>
            )}

            {/* Notes */}
            {item.notes && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                  Creator's Note
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">{item.notes}</p>
              </div>
            )}

            {/* Promo links */}
            {hasPromos && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-gray-200" />
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest px-2">
                    Recommended Resources
                  </p>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {item.promoLinks.map((pl, i) => (
                    <a
                      key={i}
                      href={pl.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 hover:border-primary/30 p-4 transition-all shadow-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 group-hover:text-primary transition-colors">
                          {pl.title}
                        </p>
                        {pl.description && (
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{pl.description}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1 truncate">
                          {pl.url.replace(/^https?:\/\//, "")}
                        </p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-primary shrink-0 mt-0.5 transition-colors" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            <p className="text-center text-xs text-gray-300 pb-4">
              Shared via{" "}
              <span className="text-gray-400 font-medium">FIA Toolkit</span>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
