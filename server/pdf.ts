import PDFDocument from "pdfkit";
import type { Session, ScoreResult } from "@shared/schema";
import { goalTypeLabels, type GoalType } from "@shared/schema";
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
  setHook: "Set the Hook",
  firstCTA: "First CTA",
  content: "Content",
  finalCTA: "Final CTA",
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
    const goalLabel = goalTypeLabels[session.goalType as GoalType] || session.goalType;
    doc.text(`Goal Type: ${goalLabel}`, 50, yPos);
    yPos += 15;

    // Duration
    const duration = session.durationSeconds || 0;
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;
    doc.text(`Duration: ${mins}:${secs.toString().padStart(2, "0")}`, 50, yPos);
    yPos += 30;

    // Scores Section - using actual ScoreResult schema
    const scoreJson = session.scoreJson as ScoreResult | null;
    if (scoreJson) {
      // Overall Score Box
      doc.rect(50, yPos, pageWidth, 60)
        .fill(BRAND_COLORS.lightGray);
      
      const overallScore = scoreJson.totalScore || 0;
      doc.fontSize(14).fillColor(BRAND_COLORS.darkBlue).text("Overall Score", 70, yPos + 10);
      
      const scoreColor = overallScore >= 80 ? "#22c55e" : overallScore >= 60 ? "#f59e0b" : BRAND_COLORS.red;
      doc.fontSize(32).fillColor(scoreColor).text(`${overallScore}`, 70, yPos + 25, { continued: true });
      doc.fontSize(16).fillColor(BRAND_COLORS.gray).text(" / 100", { continued: false });
      yPos += 80;

      // Part Scores (each is 0-20)
      const partScores = scoreJson.partScores;
      if (partScores) {
        doc.fontSize(14).fillColor(BRAND_COLORS.darkBlue).text("Score Breakdown", 50, yPos);
        yPos += 25;

        const partKeys: (keyof typeof partScores)[] = ["hook", "setHook", "firstCTA", "content", "finalCTA"];
        
        for (const partKey of partKeys) {
          const score = partScores[partKey] || 0;
          const label = PART_LABELS[partKey] || partKey;
          const percentage = (score / 20) * 100;
          const barColor = score >= 14 ? "#22c55e" : score >= 8 ? "#f59e0b" : BRAND_COLORS.red;

          doc.fontSize(11).fillColor(BRAND_COLORS.darkBlue).text(label, 50, yPos);
          doc.fontSize(11).fillColor(BRAND_COLORS.gray).text(`${score}/20`, pageWidth - 20, yPos, { align: "right" });

          // Progress bar background
          const barY = yPos + 18;
          doc.rect(50, barY, pageWidth, 8).fill("#e0e0e0");
          doc.rect(50, barY, (pageWidth * percentage) / 100, 8).fill(barColor);
          yPos += 35;
        }
      }

      // Summary Section - Strengths and Top Improvements
      const summary = scoreJson.summary;
      if (summary) {
        if (summary.strengths && summary.strengths.length > 0) {
          yPos += 10;
          
          if (yPos > 650) {
            doc.addPage();
            yPos = 50;
          }

          doc.fontSize(14).fillColor("#22c55e").text("Strengths", 50, yPos);
          yPos += 20;

          for (const strength of summary.strengths) {
            if (yPos > 700) {
              doc.addPage();
              yPos = 50;
            }

            doc.circle(60, yPos + 5, 3).fill("#22c55e");
            doc.fontSize(10).fillColor(BRAND_COLORS.gray).text(strength, 75, yPos, {
              width: pageWidth - 30,
              align: "left",
            });
            yPos += doc.heightOfString(strength, { width: pageWidth - 30 }) + 10;
          }
        }

        if (summary.topImprovements && summary.topImprovements.length > 0) {
          yPos += 10;
          
          if (yPos > 650) {
            doc.addPage();
            yPos = 50;
          }

          doc.fontSize(14).fillColor(BRAND_COLORS.lightBlue).text("Top Improvements", 50, yPos);
          yPos += 20;

          for (const improvement of summary.topImprovements) {
            if (yPos > 700) {
              doc.addPage();
              yPos = 50;
            }

            doc.circle(60, yPos + 5, 3).fill(BRAND_COLORS.lightBlue);
            doc.fontSize(10).fillColor(BRAND_COLORS.gray).text(improvement, 75, yPos, {
              width: pageWidth - 30,
              align: "left",
            });
            yPos += doc.heightOfString(improvement, { width: pageWidth - 30 }) + 10;
          }
        }
      }

      // Delivery Stats
      const delivery = scoreJson.delivery;
      if (delivery) {
        yPos += 10;
        
        if (yPos > 650) {
          doc.addPage();
          yPos = 50;
        }

        doc.fontSize(14).fillColor(BRAND_COLORS.darkBlue).text("Delivery Analysis", 50, yPos);
        yPos += 20;

        doc.fontSize(10).fillColor(BRAND_COLORS.gray);
        doc.text(`Speaking Pace: ${delivery.wordsPerMinute || 0} words per minute`, 50, yPos);
        yPos += 15;

        if (delivery.fillerWords) {
          doc.text(`Filler Words: ${delivery.fillerWords.count || 0}`, 50, yPos);
          yPos += 15;
        }

        if (delivery.clarityNotes && delivery.clarityNotes.length > 0) {
          doc.text("Clarity Notes:", 50, yPos);
          yPos += 15;
          for (const note of delivery.clarityNotes) {
            if (yPos > 700) {
              doc.addPage();
              yPos = 50;
            }
            doc.text(`  - ${note}`, 60, yPos);
            yPos += 12;
          }
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

export async function generateTranscriptPdfBuffer(session: Session): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `Transcript - ${session.title || "Session"}`,
        Author: "Fearless Video Coach",
        Subject: "Video Transcript",
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
    doc.fontSize(24).fillColor(BRAND_COLORS.darkBlue).text("Transcript", 50, yPos);
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
    yPos += 30;

    // Transcript content
    const transcript = session.transcriptEditedText || session.transcriptText;
    if (transcript) {
      doc.fontSize(11).fillColor(BRAND_COLORS.darkBlue).text(transcript, 50, yPos, {
        width: pageWidth,
        align: "left",
        lineGap: 4,
      });
    } else {
      doc.fontSize(11).fillColor(BRAND_COLORS.gray).text("No transcript available.", 50, yPos);
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
