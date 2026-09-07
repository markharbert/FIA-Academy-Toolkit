import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticatedLessonPageHeaders,
  extractCfLessonContent,
  extractVideoUrl,
  extractVimeoUrl,
} from "./cf-import-client";

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
      <meta name="description" content="A focused replay about building a practical weekly plan.">
      <p>These are useful notes for the replay lesson.</p>
      <iframe src="https://www.youtube.com/embed/abcDEF123"></iframe>
      <img src="/images/replay.jpg" alt="Replay cover">
      <a href="/files/workbook.pdf">Download workbook</a>
      <script>alert("no")</script>
    </main>
  `, "https://courses.example.com/replays/example");
  assert.equal(recovered.videoUrl, "https://www.youtube.com/embed/abcDEF123");
  assert.equal(recovered.description, "A focused replay about building a practical weekly plan.");
  assert.equal(recovered.thumbnailUrl, "https://courses.example.com/images/replay.jpg");
  assert.deepEqual(recovered.resources, [{
    name: "Download workbook",
    url: "https://courses.example.com/files/workbook.pdf",
    kind: "pdf",
  }]);
  assert.match(recovered.content ?? "", /Replay notes/);
  assert.doesNotMatch(recovered.content ?? "", /Download workbook|workbook\.pdf/);
  assert.doesNotMatch(recovered.content ?? "", /script|alert/);
  assert.equal(recovered.status, "recovered");
});

test("replaces the generic ClickFunnels site description with replay-specific page text", () => {
  const recovered = extractCfLessonContent(`
    <head>
      <meta name="description" content="The Fearless Marketing Lab is your go-to hub for proven trainings and tools to grow your brand, generate leads, and boost sales—without the overwhelm.">
    </head>
    <main class="lesson-content"><p>Replay-specific lesson notes belong here.</p></main>
  `);
  assert.equal(recovered.description, "Replay-specific lesson notes belong here.");
});

test("uses a replay-specific introductory paragraph when page metadata is generic", () => {
  const recovered = extractCfLessonContent(`
    <head>
      <meta name="description" content="The Fearless Marketing Lab is your go-to hub for proven trainings and tools.">
    </head>
    <main class="lesson-content">
      <h1>Replay title</h1>
      <p>Learn how to build a practical weekly plan that keeps the most important work moving.</p>
    </main>
  `);
  assert.equal(
    recovered.description,
    "Learn how to build a practical weekly plan that keeps the most important work moving.",
  );
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

test("authenticated lesson requests retain the browser identity ClickFunnels requires", () => {
  assert.deepEqual(
    authenticatedLessonPageHeaders({
      cookie: "session=authenticated",
      userAgent: "Browser User Agent",
      referer: "https://courses.example.com/courses/example",
    }),
    {
      Cookie: "session=authenticated",
      "User-Agent": "Browser User Agent",
      Referer: "https://courses.example.com/courses/example",
      Accept: "text/html,application/xhtml+xml",
    },
  );
});