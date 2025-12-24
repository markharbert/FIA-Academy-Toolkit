import PDFDocument from "pdfkit";
import type { Session } from "@shared/schema";
import { goalTypeLabels } from "@shared/schema";
import fs from "fs";
import path from "path";

const BRAND_COLORS = {
  darkBlue: "#06092a",
  lightBlue: "#3f92cc",
  red: "#da0010",
  white: "#ffffff",
  lightGray: "#f5f5f5",
  gray: "#666666",
};

const PART_LABELS: Record<string, string> = {
  hook: "Hook",
  setTheHook: "Set the Hook",
  firstCta: "First CTA",
  content: "Content",
  finalCta: "Final CTA",
};

const LOGO_PATH = path.join(process.cwd(), "attached_assets", "Mark_Harbert_Logo_(2)_1766503621615.png");

export async function generateSessionPdfBuffer(session: Session): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `Video Practice Report - ${session.title || "Session"}`,
        Author: "Fearless Video Coach",
        Subject: "Video Practice Session Report",
      },
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - 100;
    let yPos = 50;

    // Header with logo
    if (fs.existsSync(LOGO_PATH)) {
      try {
        doc.image(LOGO_PATH, 50, yPos, { height: 40 });
        yPos += 50;
      } catch {
        doc.fontSize(20).fillColor(BRAND_COLORS.darkBlue).text("Fearless Video Coach", 50, yPos);
        yPos += 30;
      }
    } else {
      doc.fontSize(20).fillColor(BRAND_COLORS.darkBlue).text("Fearless Video Coach", 50, yPos);
      yPos += 30;
    }

    // Title
    yPos += 20;
    doc.fontSize(24).fillColor(BRAND_COLORS.darkBlue).text("Video Practice Report", 50, yPos);
    yPos += 35;

    // Session title
    const sessionTitle = session.title || "Practice Session";
    doc.fontSize(16).fillColor(BRAND_COLORS.lightBlue).text(sessionTitle, 50, yPos);
    yPos += 25;

    // Date line
    const dateStr = session.createdAt ? new Date(session.createdAt).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }) : "N/A";
    doc.fontSize(10).fillColor(BRAND_COLORS.gray).text(`Date: ${dateStr}`, 50, yPos);
    yPos += 15;

    // Goal type
    const goalLabel = goalTypeLabels[session.goalType as keyof typeof goalTypeLabels] || session.goalType;
    doc.text(`Goal Type: ${goalLabel}`, 50, yPos);
    yPos += 15;

    // Duration
    const duration = session.durationSeconds || 0;
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    doc.text(`Duration: ${mins}:${secs.toString().padStart(2, "0")}`, 50, yPos);
    yPos += 30;

    // Scores Section
    const scoreJson = session.scoreJson as any;
    if (scoreJson) {
      // Overall Score Box
      doc.rect(50, yPos, pageWidth, 60)
        .fill(BRAND_COLORS.lightGray);
      
      const overallScore = scoreJson.overallScore || 0;
      doc.fontSize(14).fillColor(BRAND_COLORS.darkBlue).text("Overall Score", 70, yPos + 10);
      
      const scoreColor = overallScore >= 80 ? "#22c55e" : overallScore >= 60 ? "#f59e0b" : BRAND_COLORS.red;
      doc.fontSize(32).fillColor(scoreColor).text(`${overallScore}`, 70, yPos + 25, { continued: true });
      doc.fontSize(16).fillColor(BRAND_COLORS.gray).text(" / 100", { continued: false });
      yPos += 80;

      // Part Scores
      const partScores = scoreJson.partScores || {};
      doc.fontSize(14).fillColor(BRAND_COLORS.darkBlue).text("Score Breakdown", 50, yPos);
      yPos += 25;

      for (const [partKey, partData] of Object.entries(partScores) as [string, any][]) {
        const label = PART_LABELS[partKey] || partKey;
        const score = partData?.score || 0;
        const barColor = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : BRAND_COLORS.red;

        doc.fontSize(11).fillColor(BRAND_COLORS.darkBlue).text(label, 50, yPos);
        doc.fontSize(11).fillColor(BRAND_COLORS.gray).text(`${score}/100`, pageWidth - 20, yPos, { align: "right" });

        // Progress bar background
        const barY = yPos + 18;
        doc.rect(50, barY, pageWidth, 8).fill("#e0e0e0");
        doc.rect(50, barY, (pageWidth * score) / 100, 8).fill(barColor);
        yPos += 35;
      }

      // Recommendations
      if (scoreJson.recommendations && scoreJson.recommendations.length > 0) {
        yPos += 10;
        
        if (yPos > 650) {
          doc.addPage();
          yPos = 50;
        }

        doc.fontSize(14).fillColor(BRAND_COLORS.darkBlue).text("Recommendations", 50, yPos);
        yPos += 25;

        for (const rec of scoreJson.recommendations) {
          if (yPos > 700) {
            doc.addPage();
            yPos = 50;
          }

          doc.circle(60, yPos + 5, 3).fill(BRAND_COLORS.lightBlue);
          doc.fontSize(10).fillColor(BRAND_COLORS.gray).text(rec, 75, yPos, {
            width: pageWidth - 30,
            align: "left",
          });
          yPos += doc.heightOfString(rec, { width: pageWidth - 30 }) + 10;
        }
      }
    }

    // Transcript Section
    const transcript = session.transcriptEditedText || session.transcriptText;
    if (transcript) {
      yPos += 20;
      
      if (yPos > 600) {
        doc.addPage();
        yPos = 50;
      }

      doc.fontSize(14).fillColor(BRAND_COLORS.darkBlue).text("Transcript", 50, yPos);
      yPos += 25;

      doc.fontSize(10).fillColor(BRAND_COLORS.gray).text(transcript, 50, yPos, {
        width: pageWidth,
        align: "left",
      });
    }

    // Footer on every page
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).fillColor(BRAND_COLORS.gray)
        .text(
          `Generated by Fearless Video Coach | Page ${i + 1} of ${pages.count}`,
          50,
          doc.page.height - 30,
          { align: "center", width: pageWidth }
        );
    }

    doc.end();
  });
}
