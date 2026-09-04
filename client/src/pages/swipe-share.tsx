import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ExternalLink, FileText, Globe, Loader2,
  Camera, AlertCircle, ArrowUpRight, Palette, Copy, Check,
} from "lucide-react";
import { format } from "date-fns";
import DOMPurify from "dompurify";
import logoImage from "@assets/image_1788559097620.png";

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
  type: "upload" | "snippet" | "palette";
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

type SwipePaletteFontVariant = { weight: string; size: string; count: number };
type SwipePaletteFont = { family: string; variants: SwipePaletteFontVariant[] };
type SwipePalette = {
  version: 1;
  colors: [string, string, string, string, string, string];
  fonts: SwipePaletteFont[];
};
function parsePaletteFonts(value: unknown): SwipePaletteFont[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) return [];
  return value.flatMap(rawFont => {
    if (!rawFont || typeof rawFont !== "object") return [];
    const font = rawFont as Record<string, unknown>;
    const family = typeof font.family === "string" ? font.family.trim().replace(/\s+/g, " ") : "";
    if (!family || family.length > 120 || !Array.isArray(font.variants) || font.variants.length < 1 || font.variants.length > 8) return [];
    const variants = font.variants.flatMap(rawVariant => {
      if (!rawVariant || typeof rawVariant !== "object") return [];
      const variant = rawVariant as Record<string, unknown>;
      const weight = typeof variant.weight === "string" ? variant.weight.trim() : "";
      const size = typeof variant.size === "string" ? variant.size.trim() : "";
      const count = variant.count;
      if (!/^\d{1,4}$/.test(weight) || !/^\d+(?:\.\d+)?px$/.test(size) || typeof count !== "number" || !Number.isInteger(count) || count < 1) return [];
      return [{ weight, size, count }];
    });
    return variants.length ? [{ family, variants }] : [];
  });
}
function parsePalette(content: string | null): SwipePalette | null {
  if (!content) return null;
  try {
    const value = JSON.parse(content);
    if (value?.version !== 1 || !Array.isArray(value.colors) || value.colors.length !== 6) return null;
    if (!value.colors.every((color: unknown) => typeof color === "string" && /^#[0-9A-F]{6}$/.test(color))) return null;
    return {
      version: 1,
      colors: value.colors as SwipePalette["colors"],
      fonts: parsePaletteFonts(value.fonts),
    };
  } catch { return null; }
}

function SharedPalette({ palette }: { palette: SwipePalette }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [failedIndex, setFailedIndex] = useState<number | null>(null);
  const [copiedFont, setCopiedFont] = useState<string | null>(null);
  async function copyColor(color: string, index: number) {
    setFailedIndex(null);
    try {
      await navigator.clipboard.writeText(color);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex(current => current === index ? null : current), 1800);
    } catch {
      setFailedIndex(index);
      window.setTimeout(() => setFailedIndex(current => current === index ? null : current), 2500);
    }
  }
  async function copyFont(family: string) {
    try {
      await navigator.clipboard.writeText(family);
      setCopiedFont(family);
      window.setTimeout(() => setCopiedFont(current => current === family ? null : current), 1800);
    } catch {}
  }
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Palette className="h-4 w-4 text-cyan-700" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Website palette</p>
          <p className="text-xs text-gray-400">Select any swatch to copy its hex value.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {palette.colors.map((color, index) => (
          <button key={`${color}-${index}`} type="button" onClick={() => void copyColor(color, index)}
            className="group overflow-hidden rounded-xl border border-gray-200 text-left transition-transform hover:-translate-y-1 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            title={`Copy ${color}`}>
            <span className="block h-20 sm:h-24" style={{ backgroundColor: color }} />
            <span className="flex items-center justify-between gap-2 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700">
              {copiedIndex === index ? <><Check className="h-3.5 w-3.5 text-emerald-600" />Copied</> : failedIndex === index ? "Copy failed" : color}
              {copiedIndex !== index && failedIndex !== index && <Copy className="h-3.5 w-3.5 text-gray-300 group-hover:text-primary" />}
            </span>
          </button>
        ))}
      </div>
       {palette.fonts.length > 0 && (
         <div className="mt-5 border-t border-gray-100 pt-4">
           <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Detected fonts</p>
           <p className="mt-1 text-xs text-gray-400">Weight · size · text elements using it</p>
           <div className="mt-3 space-y-2">
             {palette.fonts.map(font => (
               <button key={font.family} type="button" onClick={() => void copyFont(font.family)}
                 title={`Copy ${font.family}`}
                 className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/5">
                 <span className="block truncate text-sm font-semibold text-gray-800">
                   {copiedFont === font.family ? "Copied font family" : font.family}
                 </span>
                 <span className="mt-1.5 flex flex-wrap gap-1">
                   {font.variants.map(variant => (
                     <span key={`${variant.weight}-${variant.size}`} className="rounded-full bg-white px-1.5 py-0.5 font-mono text-[10px] text-gray-500 ring-1 ring-gray-200">
                       {variant.weight} · {variant.size} · {variant.count}×
                     </span>
                   ))}
                 </span>
               </button>
             ))}
           </div>
         </div>
       )}
    </div>
  );
}

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
  const palette      = item.type === "palette" ? parsePalette(item.content) : null;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header
        className="px-4 py-3 flex items-center gap-3 shadow-md"
        style={{ background: "hsl(228,45%,14%)" }}
      >
        {/* Academy logo — links to affiliate URL */}
        <a
          href={item.fiaAffiliateLink || "https://www.fearlessinfluencer.com"}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 opacity-90 hover:opacity-100 transition-opacity"
          title="Fearless Influencer Academy"
        >
          <img
            src={logoImage}
            alt="Fearless Influencer Academy"
            className="h-9 w-auto max-w-[180px] object-contain"
          />
        </a>

        {/* Title */}
        <h1 className="flex-1 min-w-0 text-xl font-bold text-white truncate leading-tight">
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

        ) : palette ? (
          /* ── PALETTE: six individually copyable swatches ───────────── */
          <div className="max-w-3xl mx-auto space-y-5 pt-2">
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
              <span className="flex items-center gap-1"><Palette className="h-3.5 w-3.5" /> Website Color Palette</span>
              <span>{format(new Date(item.createdAt), "MMMM d, yyyy")}</span>
              {item.sourceUrl && (
                <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-gray-700 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" /> {item.sourceUrl.replace(/^https?:\/\//, "").split("/")[0]}
                </a>
              )}
            </div>
            <SharedPalette palette={palette} />
            {item.notes && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400">Creator's Note</p>
                <p className="text-sm leading-relaxed text-gray-700">{item.notes}</p>
              </div>
            )}
            {hasPromos && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Recommended Resources</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {item.promoLinks.map((pl, i) => (
                    <a key={i} href={pl.url} target="_blank" rel="noopener noreferrer"
                      className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-primary/30">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-gray-900 group-hover:text-primary">{pl.title}</span>
                        <ArrowUpRight className="h-4 w-4 text-gray-300 group-hover:text-primary" />
                      </span>
                      {pl.description && <span className="mt-1 block text-xs text-gray-500">{pl.description}</span>}
                    </a>
                  ))}
                </div>
              </div>
            )}
            <p className="pb-4 text-center text-xs text-gray-500">Shared via <a href={item.fiaAffiliateLink || "https://www.fearlessinfluencer.com"} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:text-blue-700">Fearless Influencer Academy</a></p>
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
