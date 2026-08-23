import assert from "node:assert/strict";
import test from "node:test";
import { extractVimeoUrl } from "./cf-import-client";

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