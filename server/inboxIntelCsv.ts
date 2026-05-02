import type { CapturedCompetitorEmail } from "@shared/schema";

/**
 * RFC-4180-ish CSV escape: wrap in quotes if the value contains a comma, quote,
 * newline, or carriage return; double internal quotes. Empty/null becomes "".
 * Also strips control chars that can be used for CSV-injection of formulas.
 */
function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Date) {
    s = value.toISOString();
  } else if (typeof value === "boolean") {
    s = value ? "true" : "false";
  } else {
    s = String(value);
  }
  // Strip control chars except tab/newline/cr (which we'll quote-wrap)
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  // Strip leading BOM that some spreadsheet apps ignore before formula detection
  s = s.replace(/^\uFEFF+/, "");
  // CSV-injection guard: prefix any cell whose first non-whitespace/BOM
  // character is a formula-trigger. Excel/Sheets evaluate formulas even when
  // preceded by spaces, tabs, or carriage returns, so the guard must look
  // past leading whitespace too.
  if (/^[\s\uFEFF]*[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  if (/[,"\r\n]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const HEADERS = [
  "tracker_name",
  "received_at",
  "subject",
  "from_name",
  "from_email",
  "from_domain",
  "detected_esp",
  "word_count",
  "link_count",
  "image_count",
  "subject_length",
  "subject_has_emoji",
  "spf_result",
  "dkim_result",
  "dmarc_result",
  "list_unsubscribe_present",
  "is_pinned",
  "body_available",
];

export interface CsvRow {
  trackerName: string;
  email: CapturedCompetitorEmail;
}

export function emailsToCsv(rows: CsvRow[]): string {
  const lines: string[] = [HEADERS.join(",")];
  for (const { trackerName, email: e } of rows) {
    lines.push(
      [
        esc(trackerName),
        esc(e.receivedAt),
        esc(e.subject),
        esc(e.fromName),
        esc(e.fromEmail),
        esc(e.fromDomain),
        esc(e.detectedEsp),
        esc(e.wordCount),
        esc(e.linkCount),
        esc(e.imageCount),
        esc(e.subjectLength),
        esc(e.subjectHasEmoji),
        esc(e.spfResult),
        esc(e.dkimResult),
        esc(e.dmarcResult),
        esc(e.listUnsubscribePresent),
        esc(e.isPinned),
        esc(e.bodyAvailable),
      ].join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

export function csvFilename(stem: string): string {
  const slug = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "export";
  const stamp = new Date().toISOString().slice(0, 10);
  return `${slug}-${stamp}.csv`;
}
