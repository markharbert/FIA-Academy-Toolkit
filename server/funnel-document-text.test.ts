import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import PDFDocument from "pdfkit";
import { extractFunnelDocumentText } from "./funnel-document-text";

test("PDF uploads extract readable text with the installed parser API", async () => {
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const pdf = new PDFDocument();
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    pdf.text("Publishing readiness PDF fixture");
    pdf.end();
  });
  assert.match(await extractFunnelDocumentText("application/pdf", "fixture.pdf", buffer), /Publishing readiness PDF fixture/);
  assert.match(await extractFunnelDocumentText("application/octet-stream", "fixture.pdf", buffer), /Publishing readiness PDF fixture/);
});

test("Word uploads extract text without rendering document HTML", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "toolkit-docx-"));
  try {
    await mkdir(path.join(dir, "_rels"));
    await mkdir(path.join(dir, "word"));
    await writeFile(path.join(dir, "[Content_Types].xml"), `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
    await writeFile(path.join(dir, "_rels/.rels"), `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    await writeFile(path.join(dir, "word/document.xml"), `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Publishing readiness Word fixture</w:t></w:r></w:p></w:body></w:document>`);
    execFileSync("zip", ["-q", "-r", "fixture.docx", "[Content_Types].xml", "_rels", "word"], { cwd: dir });
    assert.match(await extractFunnelDocumentText("application/octet-stream", "fixture.docx", await readFile(path.join(dir, "fixture.docx"))), /Publishing readiness Word fixture/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("plain text stays intact and invalid PDF data fails explicitly", async () => {
  assert.equal(await extractFunnelDocumentText("text/plain", "notes.txt", Buffer.from("Test notes")), "Test notes");
  await assert.rejects(extractFunnelDocumentText("application/pdf", "bad.pdf", Buffer.from("Not a PDF")));
});
