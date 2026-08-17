import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ExternalLink, FileText, Globe, Loader2,
  Camera, AlertCircle, ArrowUpRight, ZoomIn, ZoomOut,
} from "lucide-react";
import { format } from "date-fns";

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
};

// ── Pan + Zoom image viewer ────────────────────────────────────────────────────
// All frame-by-frame state lives in refs to avoid per-frame React re-renders.
// Only `displayZoom` and `loaded` drive re-renders (toolbar + fade-in).
function PanZoomViewer({ src, alt }: { src: string; alt: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLImageElement>(null);
  const [loaded,      setLoaded]      = useState(false);
  const [displayZoom, setDisplayZoom] = useState(100);
  const [dragging,    setDragging]    = useState(false);

  // Mutable transform — mutated via applyTransform, never triggers renders
  const T           = useRef({ scale: 1, tx: 0, ty: 0, fitScale: 1 });
  const dragOrigin  = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const pinchOrigin = useRef<{ dist: number; scale: number } | null>(null);

  // ── helpers ───────────────────────────────────────────────────────────────
  const applyTransform = (tx: number, ty: number, scale: number) => {
    if (imgRef.current)
      imgRef.current.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
    T.current = { ...T.current, tx, ty, scale };
  };

  // Keep image within the container bounds
  const clamp = (tx: number, ty: number, scale: number) => {
    const c = containerRef.current, img = imgRef.current;
    if (!c || !img) return { tx, ty };
    const cw = c.clientWidth,  ch = c.clientHeight;
    const iw = img.naturalWidth * scale, ih = img.naturalHeight * scale;
    return {
      // Wider than container → allow left/right pan; narrower → center it
      tx: iw >= cw ? Math.min(0, Math.max(cw - iw, tx)) : (cw - iw) / 2,
      // Taller than container → allow up/down pan; shorter → pin to top
      ty: ih >= ch ? Math.min(0, Math.max(ch - ih, ty)) : 0,
    };
  };

  // Zoom centered on (pivotX, pivotY) in container-local px
  const zoomAt = (newScale: number, pivotX: number, pivotY: number) => {
    const { scale, tx, ty, fitScale } = T.current;
    // clamp scale: 95 % of fit-width … 8× fit-width
    const s     = Math.min(Math.max(fitScale * 0.95, newScale), fitScale * 8);
    const ratio = s / scale;
    const { tx: ntx, ty: nty } = clamp(
      pivotX - (pivotX - tx) * ratio,
      pivotY - (pivotY - ty) * ratio,
      s,
    );
    applyTransform(ntx, nty, s);
    setDisplayZoom(Math.round((s / fitScale) * 100));
  };

  // ── image load: initialise fit-to-width ──────────────────────────────────
  const onImageLoad = () => {
    const c = containerRef.current, img = imgRef.current;
    if (!c || !img) return;
    const fit = img.naturalWidth > 0 ? c.clientWidth / img.naturalWidth : 1;
    T.current.fitScale = fit;
    const { tx, ty } = clamp(0, 0, fit);
    applyTransform(tx, ty, fit);
    setLoaded(true);
    setDisplayZoom(100);
  };

  // ── non-passive wheel + touchmove (must use native addEventListener) ──────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(
        T.current.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12),
        e.clientX - r.left,
        e.clientY - r.top,
      );
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2 && pinchOrigin.current) {
        const t0 = e.touches[0], t1 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
        const r  = el.getBoundingClientRect();
        const mx = (t0.clientX + t1.clientX) / 2 - r.left;
        const my = (t0.clientY + t1.clientY) / 2 - r.top;
        zoomAt(pinchOrigin.current.scale * (dist / pinchOrigin.current.dist), mx, my);
      } else if (e.touches.length === 1 && dragOrigin.current) {
        const t = e.touches[0], o = dragOrigin.current;
        const { tx, ty } = clamp(o.tx + t.clientX - o.x, o.ty + t.clientY - o.y, T.current.scale);
        applyTransform(tx, ty, T.current.scale);
      }
    };

    el.addEventListener("wheel",     onWheel,     { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("wheel",     onWheel);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, []); // reads refs only — no stale-closure risk

  // ── mouse ─────────────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragOrigin.current = { x: e.clientX, y: e.clientY, tx: T.current.tx, ty: T.current.ty };
    setDragging(true);
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragOrigin.current) return;
    const o = dragOrigin.current;
    const { tx, ty } = clamp(o.tx + e.clientX - o.x, o.ty + e.clientY - o.y, T.current.scale);
    applyTransform(tx, ty, T.current.scale);
  };
  const onMouseUp = () => { dragOrigin.current = null; setDragging(false); };

  // Double-click: toggle between fit-width and 2× zoom at cursor
  const onDblClick = (e: React.MouseEvent) => {
    const c = containerRef.current;
    if (!c) return;
    const { fitScale, scale } = T.current;
    const r = c.getBoundingClientRect();
    if (scale > fitScale * 1.1) {
      const { tx, ty } = clamp(0, 0, fitScale);
      applyTransform(tx, ty, fitScale);
      setDisplayZoom(100);
    } else {
      zoomAt(fitScale * 2, e.clientX - r.left, e.clientY - r.top);
    }
  };

  // ── touch start / end ─────────────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const t0 = e.touches[0], t1 = e.touches[1];
      pinchOrigin.current = {
        dist:  Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY),
        scale: T.current.scale,
      };
      dragOrigin.current = null;
    } else {
      const t = e.touches[0];
      dragOrigin.current  = { x: t.clientX, y: t.clientY, tx: T.current.tx, ty: T.current.ty };
      pinchOrigin.current = null;
    }
  };
  const onTouchEnd = () => { pinchOrigin.current = null; };

  // ── toolbar helpers ───────────────────────────────────────────────────────
  const zoomCenter = (factor: number) => {
    const c = containerRef.current;
    if (!c) return;
    zoomAt(T.current.scale * factor, c.clientWidth / 2, c.clientHeight / 2);
  };
  const resetFit = () => {
    const { fitScale } = T.current;
    const { tx, ty } = clamp(0, 0, fitScale);
    applyTransform(tx, ty, fitScale);
    setDisplayZoom(100);
  };

  return (
    <div className="flex flex-col h-full select-none bg-gray-950">

      {/* ── Canvas ──────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        style={{ cursor: dragging ? "grabbing" : "grab" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onDoubleClick={onDblClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
          </div>
        )}
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          onLoad={onImageLoad}
          draggable={false}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            transformOrigin: "0 0",
            maxWidth: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
            opacity: loaded ? 1 : 0,
            transition: "opacity 0.25s",
          }}
        />
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-2 bg-gray-900 border-t border-white/5">
        <button
          onClick={() => zoomCenter(1 / 1.4)}
          title="Zoom out (scroll wheel)"
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ZoomOut className="h-4 w-4" />
        </button>

        <span className="text-xs font-mono text-gray-400 w-11 text-center tabular-nums">
          {displayZoom}%
        </span>

        <button
          onClick={() => zoomCenter(1.4)}
          title="Zoom in (scroll wheel)"
          className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ZoomIn className="h-4 w-4" />
        </button>

        <div className="w-px h-4 bg-white/10 mx-0.5" />

        <button
          onClick={resetFit}
          title="Fit to width"
          className="px-2.5 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          Fit
        </button>

        <span className="hidden sm:block ml-2 text-[10px] text-gray-600">
          drag to pan · scroll to zoom · double-click to toggle · pinch on touch
        </span>
      </div>
    </div>
  );
}

// ── Share page ─────────────────────────────────────────────────────────────────
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

  const hasPromos    = item.promoLinks && item.promoLinks.length > 0;
  const isImage      = item.type === "upload" && item.imagePath;
  const isMultiStrip = isImage && Array.isArray(item.strips) && item.strips.length > 1;

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3">

        {/* Branding */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Camera className="h-4 w-4 text-primary" />
          <span className="font-semibold text-xs tracking-wide text-gray-400 hidden sm:inline">
            FIA Toolkit
          </span>
        </div>

        <div className="w-px h-4 bg-gray-200 shrink-0" />

        {/* Title — read-only on public page */}
        <h1 className="flex-1 min-w-0 text-base font-bold text-gray-900 truncate leading-tight">
          {item.title}
        </h1>

        {/* View count */}
        <div className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
          <Globe className="h-3.5 w-3.5" />
          <span>{item.viewCount.toLocaleString()} view{item.viewCount !== 1 ? "s" : ""}</span>
        </div>

      </header>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <main className="p-4 lg:p-6">

        {isImage ? (
          /* ── IMAGE: 75 / 25 split card ───────────────────────────────── */
          <div
            className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden
                       flex flex-col lg:flex-row"
            style={{ height: "calc(100vh - 120px)" }}
          >
            {/* Left 75 % — image viewer */}
            <div
              className="lg:w-3/4 flex flex-col overflow-hidden"
              style={{ minHeight: "55vw", maxHeight: "60vh" }}
            >
              {isMultiStrip ? (
                /* Legacy multi-strip: stacked scrollable strips */
                <div className="flex-1 bg-gray-950 overflow-y-auto">
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
                /* Single image — pan + zoom viewer */
                <PanZoomViewer
                  src={`/api/swipe/public/${item.shareToken}/image`}
                  alt={item.title}
                />
              )}
            </div>

            {/* Right 25 % — info + promo */}
            <div className="lg:w-1/4 border-t lg:border-t-0 lg:border-l border-gray-200 flex flex-col
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
                <p className="text-center text-xs text-gray-300">
                  Shared via{" "}
                  <span className="text-gray-400 font-medium">FIA Toolkit</span>
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
