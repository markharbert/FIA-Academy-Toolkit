import { useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Globe, Loader2, Camera, AlertCircle, ArrowUpRight } from "lucide-react";
import { format } from "date-fns";

type PromoLink = { title: string; url: string; description?: string };
type PublicSwipeItem = {
  id: string;
  title: string;
  type: "upload" | "snippet";
  content: string | null;
  imagePath: string | null;
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

  // Page title
  useEffect(() => {
    if (item) document.title = `${item.title} — FIA Toolkit Swipe File`;
    return () => { document.title = "FIA Academy Toolkit"; };
  }, [item]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(230,75%,10%)]">
        <Loader2 className="h-8 w-8 animate-spin text-white/60" />
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[hsl(230,75%,10%)] text-white p-6 text-center">
        <div className="rounded-full bg-white/10 p-5 mb-4">
          <AlertCircle className="h-10 w-10 text-white/60" />
        </div>
        <h1 className="text-xl font-bold mb-2">Link Not Found</h1>
        <p className="text-white/60 text-sm max-w-xs">
          This share link has expired, been revoked, or never existed.
        </p>
      </div>
    );
  }

  const hasPromos = item.promoLinks && item.promoLinks.length > 0;

  return (
    <div className="min-h-screen bg-[hsl(230,75%,10%)] text-white">
      {/* Nav bar */}
      <header className="border-b border-white/10 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm tracking-wide text-white/80">FIA Toolkit · Swipe File</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-white/40">
          <Globe className="h-3.5 w-3.5" />
          <span>{item.viewCount.toLocaleString()} view{item.viewCount !== 1 ? "s" : ""}</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Title + meta */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold leading-tight">{item.title}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-white/50">
            <span className="flex items-center gap-1">
              {item.type === "upload"
                ? <><Camera className="h-3.5 w-3.5" /> Image</>
                : <><FileText className="h-3.5 w-3.5" /> Text Snippet</>
              }
            </span>
            <span>{format(new Date(item.createdAt), "MMMM d, yyyy")}</span>
            {item.sourceUrl && (
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-white transition-colors">
                <ExternalLink className="h-3.5 w-3.5" />
                {item.sourceUrl.replace(/^https?:\/\//, "").split("/")[0]}
              </a>
            )}
          </div>
        </div>

        {/* Content */}
        {item.type === "upload" && item.imagePath ? (
          <div className="rounded-xl overflow-hidden border border-white/10 bg-white/5">
            <img
              src={`/api/swipe/public/${item.shareToken}/image`}
              alt={item.title}
              className="w-full object-contain max-h-[70vh]"
            />
          </div>
        ) : item.type === "snippet" && item.content ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <p className="text-white/90 leading-relaxed whitespace-pre-wrap font-mono text-sm">{item.content}</p>
            {item.sourceUrl && (
              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-4 text-xs text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />
                View original source
              </a>
            )}
          </div>
        ) : null}

        {/* Notes from creator */}
        {item.notes && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-1">Creator's Note</p>
            <p className="text-sm text-white/80 leading-relaxed">{item.notes}</p>
          </div>
        )}

        {/* Promo links */}
        {hasPromos && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-white/10" />
              <p className="text-xs font-semibold text-white/40 uppercase tracking-widest px-2">Recommended Resources</p>
              <div className="h-px flex-1 bg-white/10" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {item.promoLinks.map((pl, i) => (
                <a
                  key={i}
                  href={pl.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-primary/40 p-4 transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-white group-hover:text-primary transition-colors">
                      {pl.title}
                    </p>
                    {pl.description && (
                      <p className="text-xs text-white/50 mt-0.5 leading-relaxed">{pl.description}</p>
                    )}
                    <p className="text-xs text-white/30 mt-1 truncate">{pl.url.replace(/^https?:\/\//, "")}</p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-white/30 group-hover:text-primary shrink-0 mt-0.5 transition-colors" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-white/25 pt-4">
          Shared via <span className="text-white/40 font-medium">FIA Toolkit</span>
        </p>
      </div>
    </div>
  );
}
