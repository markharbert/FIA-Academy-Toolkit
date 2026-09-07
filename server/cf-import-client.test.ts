import assert from "node:assert/strict";
import test from "node:test";
import { extractCfLessonContent, extractVideoUrl, extractVimeoUrl } from "./cf-import-client";

test("extracts a Vimeo player URL and preserves its private-video token", () => {
  assert.equal(
    extractVimeoUrl('<iframe src="https://player.vimeo.com/video/123456789?h=private-token"></iframe>'),
    "https://player.vimeo.com/video/123456789?h=private-token",
  );
});

test("extracts Vimeo URLs from escaped ClickFunnels page data", () => {
  assert.equal(
    extractVimeoUrl('{"embed":"https:\\/\\/vimeo.com\\/987654321"}'),
    "https://player.vimeo.com/video/987654321",
  );
});

test("does not mistake unrelated content for a Vimeo video", () => {
  assert.equal(extractVimeoUrl("<iframe src='https://www.youtube.com/embed/example'></iframe>"), null);
  assert.equal(extractVimeoUrl("Video 123456789 is ready"), null);
  assert.equal(extractVimeoUrl(null), null);
});

test("extracts lesson content, resources, images, and a YouTube embed", () => {
  const recovered = extractCfLessonContent(`
    <main class="lesson-content">
      <h2>Replay notes</h2>
      <p>These are useful notes for the replay lesson.</p>
      <iframe src="https://www.youtube.com/embed/abcDEF123"></iframe>
      <img src="/images/replay.jpg" alt="Replay cover">
      <a href="/files/workbook.pdf">Download workbook</a>
      <script>alert("no")</script>
    </main>
  `, "https://courses.example.com/replays/example");
  assert.equal(recovered.videoUrl, "https://www.youtube.com/embed/abcDEF123");
  assert.equal(recovered.thumbnailUrl, "https://courses.example.com/images/replay.jpg");
  assert.deepEqual(recovered.resources, [{
    name: "Download workbook",
    url: "https://courses.example.com/files/workbook.pdf",
    kind: "pdf",
  }]);
  assert.match(recovered.content ?? "", /Replay notes/);
  assert.doesNotMatch(recovered.content ?? "", /script|alert/);
  assert.equal(recovered.status, "recovered");
});

test("recognizes Wistia and direct HTML5 video URLs", () => {
  assert.equal(
    extractVideoUrl('<iframe src="//fast.wistia.net/embed/iframe/a1b2c3"></iframe>'),
    "https://fast.wistia.net/embed/iframe/a1b2c3",
  );
  assert.equal(
    extractVideoUrl('<video src="https://cdn.example.com/replay.mp4"></video>'),
    "https://cdn.example.com/replay.mp4",
  );
});