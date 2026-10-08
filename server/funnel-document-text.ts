/** Extract text only; DOCX HTML is never rendered, and PDF resources are released. */
export async function extractFunnelDocumentText(mimetype: string, filename: string, buffer: Buffer): Promise<string> {
  if (mimetype === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      return (await parser.getText()).text ?? "";
    } finally {
      await parser.destroy();
    }
  }
  if (mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || filename.toLowerCase().endsWith(".docx")) {
    const { extractRawText } = await import("mammoth");
    return (await extractRawText({ buffer })).value ?? "";
  }
  return buffer.toString("utf8");
}
