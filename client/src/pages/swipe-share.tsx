import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ExternalLink, FileText, Globe, Loader2,
  Camera, AlertCircle, ArrowUpRight,
} from "lucide-react";
import { format } from "date-fns";
import DOMPurify from "dompurify";

const SNIPPET_ALLOWED_TAGS = [
  "p","br","strong","em","b","i","u","s","del","ins","mark",
  "h1","h2","h3","h4","h5","h6",
  "ul","ol","li","blockquote","pre","code",
  "a","img","figure","figcaption",
  "table","thead","tbody","tfoot","tr","th","td",
  "hr","span","div","section","article",
];
function isHtmlSnippet(content: string) { return /<[a-z][\s\S]*?>/i.test(content); }
function sanitizeSnippet(html: string) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: SNIPPET_ALLOWED_TAGS,
    ALLOWED_ATTR: ["href","src","alt","title","target","rel"],
    FORCE_BODY: true,
  });
}

type PromoLink = { title: string; url: string; description?: string };
type PublicSwipeItem = {
  id: string;
  title: string;
  type: "upload" | "snippet";
  content: string | null;
  imagePath: string | null;
  strips: string[] | null;
  sourceUrl: string | null;
  notes: string | null;
  promoLinks: PromoLink[];
  shareToken: string;
  viewCount: number;
  createdAt: string;
  fiaAffiliateLink: string | null;
};

// ── Share page ─────────────────────────────────────────────────────────────────
export default function SwipeSharePage() {
  const { token } = useParams<{ token: string }>();

  // ── Resizable split state ────────────────────────────────────────────────
  const [leftPct,   setLeftPct]   = useState(70);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  const [imgLoaded, setImgLoaded] = useState(false);
  const splitRef   = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current || !splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      const pct  = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(Math.max(pct, 25), 80));
    };
    const onUp = () => { isDragging.current = false; document.body.style.cursor = ""; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
  }, []);

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

  const hasPromos    = item.promoLinks && item.promoLinks.length > 0;
  const isImage      = item.type === "upload" && item.imagePath;
  const isMultiStrip = isImage && Array.isArray(item.strips) && item.strips.length > 1;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header
        className="px-4 py-3 flex items-center gap-3 shadow-md"
        style={{ background: "hsl(228,45%,14%)" }}
      >
        {/* Branding — lion + name, both link to affiliate URL */}
        <a
          href={item.fiaAffiliateLink || "https://www.fearlessinfluencer.com"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 shrink-0 group"
        >
          <img
            src="/lion-logo.png"
            alt="Fearless Influencer Academy"
            className="h-8 w-8 object-contain"
          />
          <span className="font-semibold text-sm tracking-wide text-white/90 group-hover:text-white transition-colors hidden sm:inline">
            Fearless Influencer Academy
          </span>
        </a>

        <div className="w-px h-5 bg-white/20 shrink-0" />

        {/* Title */}
        <h1 className="flex-1 min-w-0 text-base font-bold text-white truncate leading-tight">
          {item.title}
        </h1>

      </header>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <main className="p-4 lg:p-6">

        {isImage ? (
          /* ── IMAGE: resizable split card ─────────────────────────────── */
          <div
            ref={splitRef}
            className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden
                       flex flex-col lg:flex-row"
            style={{ height: "calc(100vh - 120px)" }}
          >
            {/* Left pane — scrollable image */}
            <div
              className="overflow-y-auto bg-gray-950 flex-shrink-0"
              style={isDesktop ? { width: `${leftPct}%` } : { flex: "1 1 0", minHeight: "55vw", maxHeight: "60vh" }}
            >
              {isMultiStrip ? (
                /* Multi-strip: stacked strips scroll naturally */
                <>
                  {item.strips!.map((_, i) => (
                    <img
                      key={i}
                      src={`/api/swipe/public/${item.shareToken}/strip/${i}`}
                      alt={`${item.title} — section ${i + 1}`}
                      style={{ display: "block", width: "100%" }}
                      loading={i === 0 ? "eager" : "lazy"}
                    />
                  ))}
                </>
              ) : (
                /* Single image — full-width, natural height, scrollable */
                <>
                  {!imgLoaded && (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 className="h-7 w-7 animate-spin text-gray-600" />
                    </div>
                  )}
                  <img
                    src={`/api/swipe/public/${item.shareToken}/image`}
                    alt={item.title}
                    className="w-full h-auto block"
                    style={{ opacity: imgLoaded ? 1 : 0, transition: "opacity .25s" }}
                    onLoad={() => setImgLoaded(true)}
                  />
                </>
              )}
            </div>

            {/* Drag handle — desktop only */}
            {isDesktop && (
              <div
                className="hidden lg:flex shrink-0 items-center justify-center w-2 bg-gray-100
                           hover:bg-primary/20 border-x border-gray-200 cursor-col-resize
                           transition-colors group select-none"
                onMouseDown={(e) => {
                  e.preventDefault();
                  isDragging.current = true;
                  document.body.style.cursor = "col-resize";
                }}
                title="Drag to resize"
              >
                {/* grip dots */}
                <div className="flex flex-col gap-1">
                  {[0,1,2,3].map(i => (
                    <div key={i} className="w-1 h-1 rounded-full bg-gray-300 group-hover:bg-primary/60 transition-colors" />
                  ))}
                </div>
              </div>
            )}

            {/* Right pane — info + promo */}
            <div className="flex-1 border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col
                            min-h-0 lg:h-full">

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">

                {/* Meta */}
                <div className="space-y-2">
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

                <div className="h-px bg-gray-100" />

                {/* Promo links */}
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
                          className="group flex items-start gap-2 rounded-xl border border-gray-200
                                     bg-gray-50 hover:bg-primary/5 hover:border-primary/30 p-3 transition-all"
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
                <p className="text-center text-xs text-gray-500">
                  Shared via{" "}
                  <a
                    href={item.fiaAffiliateLink || "https://www.fearlessinfluencer.com"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    Fearless Influencer Academy
                  </a>
                </p>
              </div>
            </div>
          </div>

        ) : (
          /* ── SNIPPET / FALLBACK: single column ──────────────────────── */
          <div className="max-w-3xl mx-auto space-y-5 pt-2">

            <div className="space-y-1">
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

            {item.content && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                {isHtmlSnippet(item.content) ? (
                  <div
                    className="prose prose-sm max-w-none
                      prose-headings:text-gray-900 prose-p:text-gray-800
                      prose-strong:text-gray-900 prose-a:text-blue-600
                      prose-blockquote:border-l-gray-300 prose-blockquote:text-gray-600
                      prose-code:text-emerald-700 prose-code:bg-gray-100 prose-code:rounded prose-code:px-1
                      prose-pre:bg-gray-100 prose-li:text-gray-800 prose-img:rounded-lg"
                    dangerouslySetInnerHTML={{ __html: sanitizeSnippet(item.content) }}
                  />
                ) : (
                  <p className="text-gray-800 leading-relaxed whitespace-pre-wrap font-mono text-sm">
                    {item.content}
                  </p>
                )}
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

            {item.notes && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                  Creator's Note
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">{item.notes}</p>
              </div>
            )}

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
                      className="group flex items-start gap-3 rounded-xl border border-gray-200
                                 bg-white hover:bg-gray-50 hover:border-primary/30 p-4 transition-all shadow-sm"
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

            <p className="text-center text-xs text-gray-500 pb-4">
              Shared via{" "}
              <a
                href={item.fiaAffiliateLink || "https://www.fearlessinfluencer.com"}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-blue-600 hover:text-blue-700 transition-colors"
              >
                Fearless Influencer Academy
              </a>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
