export type LessonVideo =
  | { kind: "iframe"; provider: "youtube" | "vimeo" | "voomly" | "wistia"; url: string }
  | { kind: "file"; provider: "mp4" | "hls"; url: string };

const hostIs = (hostname: string, domain: string) =>
  hostname === domain || hostname.endsWith(`.${domain}`);

export function resolveLessonVideo(raw: string | null | undefined): LessonVideo | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    if (/\.mp4$/i.test(url.pathname)) return { kind: "file", provider: "mp4", url: url.href };
    if (/\.m3u8$/i.test(url.pathname)) return { kind: "file", provider: "hls", url: url.href };

    if (hostIs(host, "youtube.com") || hostIs(host, "youtube-nocookie.com") || host === "youtu.be") {
      const id = host === "youtu.be" ? parts[0] :
        ["embed", "shorts", "live"].includes(parts[0]) ? parts[1] : url.searchParams.get("v");
      if (!id || !/^[\w-]{11}$/.test(id)) return null;
      const domain = hostIs(host, "youtube-nocookie.com") ? "www.youtube-nocookie.com" : "www.youtube.com";
      return { kind: "iframe", provider: "youtube", url: `https://${domain}/embed/${id}` };
    }
    if (hostIs(host, "vimeo.com")) {
      const id = url.pathname.match(/(?:^|\/)(?:video\/)?(\d+)(?:\/|$)/)?.[1];
      if (!id) return null;
      const params = new URLSearchParams(url.search);
      params.set("api", "1");
      return { kind: "iframe", provider: "vimeo", url: `https://player.vimeo.com/video/${id}?${params}` };
    }
    if (hostIs(host, "wistia.com") || hostIs(host, "wistia.net") || host === "wi.st") {
      const id = parts.at(-1);
      if (!id || !/^[\w-]+$/.test(id)) return null;
      return { kind: "iframe", provider: "wistia", url: `https://fast.wistia.net/embed/iframe/${id}` };
    }
    // Voomly supplies an iframe URL via its "Get embed code" sharing option.
    // Keep its path/query intact: its player uses them to identify the video.
    if (hostIs(host, "voomly.com") && parts.length > 0) {
      return { kind: "iframe", provider: "voomly", url: url.href };
    }
    return null;
  } catch {
    return null;
  }
}