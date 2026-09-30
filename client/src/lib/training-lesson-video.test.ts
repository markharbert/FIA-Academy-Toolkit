import { describe, expect, it } from "vitest";
import { resolveLessonVideo } from "./training-lesson-video";

describe("lesson video URLs", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abcdefghijk", "youtube", "https://www.youtube.com/embed/abcdefghijk"],
    ["https://youtu.be/abcdefghijk?t=30", "youtube", "https://www.youtube.com/embed/abcdefghijk"],
    ["https://www.youtube.com/embed/abcdefghijk", "youtube", "https://www.youtube.com/embed/abcdefghijk"],
    ["https://youtube.com/shorts/abcdefghijk", "youtube", "https://www.youtube.com/embed/abcdefghijk"],
    ["https://www.youtube-nocookie.com/embed/abcdefghijk", "youtube", "https://www.youtube-nocookie.com/embed/abcdefghijk"],
    ["https://fast.wistia.net/embed/iframe/abc123", "wistia", "https://fast.wistia.net/embed/iframe/abc123"],
    ["https://example.wistia.com/medias/abc123", "wistia", "https://fast.wistia.net/embed/iframe/abc123"],
    ["https://embed.voomly.com/embed/abc123?token=a", "voomly", "https://embed.voomly.com/embed/abc123?token=a"],
    ["https://cdn.example.com/video.mp4?token=x", "mp4", "https://cdn.example.com/video.mp4?token=x"],
    ["https://cdn.example.com/master.m3u8?token=x", "hls", "https://cdn.example.com/master.m3u8?token=x"],
  ])("recognizes %s", (url, provider, expected) => {
    expect(resolveLessonVideo(url)).toMatchObject({ provider, url: expected });
  });

  it.each(["javascript:alert(1)", "https://youtube.com.evil.test/watch?v=abcdefghijk", "https://example.com", "https://youtube.com/embed/no", "https://user:pass@embed.voomly.com/embed/id"])("rejects %s", (url) => {
    expect(resolveLessonVideo(url)).toBeNull();
  });
});