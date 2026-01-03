import type { Express, Request, Response } from "express";
import { db } from "./db";
import { userProfilePhotos, generatedThumbnails, thumbnailStyles, type ThumbnailStyle } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import multer from "multer";
import path from "path";
import fs from "fs";
import OpenAI from "openai";
import { GoogleGenAI, Modality } from "@google/genai";
import Replicate from "replicate";

const uploadsDir = path.join(process.cwd(), "uploads", "profile-photos");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
    }
  },
});

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const stylePrompts: Record<ThumbnailStyle, string> = {
  reaction: "A YouTube thumbnail with an expressive reaction face, dramatic lighting, bold colors, and a surprised or excited expression",
  before_after: "A split-screen YouTube thumbnail showing a dramatic before and after transformation, with clear visual contrast",
  list_style: "A YouTube thumbnail with large bold numbers, clean typography, and eye-catching visual elements for a list video",
  bold_text: "A YouTube thumbnail with large bold text as the main focus, high contrast colors, and minimal but impactful imagery",
  minimal: "A clean, minimalist YouTube thumbnail with simple composition, muted colors, and elegant typography",
  dramatic: "A cinematic YouTube thumbnail with dramatic lighting, intense colors, and movie-poster style composition",
};

function buildPrompt(title: string, style?: ThumbnailStyle, includesPerson?: boolean): string {
  const basePrompt = `Create a professional YouTube thumbnail (16:9 aspect ratio, 1280x720) for a video titled "${title}".`;
  const styleGuide = style ? stylePrompts[style] : "Eye-catching, professional YouTube thumbnail with vibrant colors and clear visual hierarchy.";
  const personNote = includesPerson 
    ? "Include a person with an expressive face as the main subject." 
    : "";
  
  return `${basePrompt} Style: ${styleGuide} ${personNote} Make it clickable and attention-grabbing. No text in the image unless absolutely necessary for the style.`;
}

async function generateWithDalle(prompt: string): Promise<{ b64_json: string; mimeType: string }> {
  const response = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    n: 1,
    size: "1024x1024",
  });

  const imageData = response.data?.[0];
  if (!imageData?.b64_json) {
    throw new Error("No image data received from DALL-E");
  }

  return {
    b64_json: imageData.b64_json,
    mimeType: "image/png",
  };
}

async function generateWithGemini(prompt: string): Promise<{ b64_json: string; mimeType: string }> {
  const response = await gemini.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find((part: any) => part.inlineData);

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data received from Gemini");
  }

  return {
    b64_json: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || "image/png",
  };
}

function buildInstantIdPrompt(title: string, style?: ThumbnailStyle): string {
  const styleDescriptions: Record<ThumbnailStyle, string> = {
    reaction: "expressive reaction face, surprised expression, dramatic lighting, bold vibrant colors",
    before_after: "professional portrait, split screen style, clean composition",
    list_style: "professional headshot, clean background, modern style",
    bold_text: "portrait with dramatic lighting, high contrast, professional",
    minimal: "elegant portrait, soft lighting, clean minimalist background",
    dramatic: "cinematic portrait, dramatic movie-poster lighting, intense colors",
  };

  const styleGuide = style ? styleDescriptions[style] : "professional YouTube thumbnail style, eye-catching, vibrant colors";
  
  return `Professional YouTube thumbnail portrait for video "${title}". ${styleGuide}. High quality, sharp focus, professional photography style.`;
}

async function generateWithInstantId(
  prompt: string, 
  faceImageBase64: string,
  imageMimeType: string
): Promise<{ b64_json: string; mimeType: string }> {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("Replicate API token not configured");
  }

  // Convert base64 to buffer and upload to Replicate's file hosting
  const imageBuffer = Buffer.from(faceImageBase64, "base64");
  const extension = imageMimeType.split("/")[1] || "png";
  
  // Upload file to Replicate
  const uploadResponse = await fetch("https://api.replicate.com/v1/files", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      "Content-Type": imageMimeType,
    },
    body: imageBuffer,
  });
  
  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    console.error("Replicate file upload failed:", errorText);
    throw new Error(`Failed to upload image to Replicate: ${uploadResponse.status}`);
  }
  
  const uploadResult = await uploadResponse.json() as { urls?: { get?: string } };
  const fileUrl = uploadResult.urls?.get;
  
  if (!fileUrl) {
    console.error("No file URL in upload response:", uploadResult);
    throw new Error("Failed to get file URL from Replicate");
  }
  
  console.log("Uploaded image to Replicate:", fileUrl);

  const output = await replicate.run(
    "lucataco/ip-adapter-faceid:fb81ef963e74776af72e6f380949013533d46dd5c6228a9e586c57db6303d7cd",
    {
      input: {
        face_image: fileUrl,
        prompt: prompt,
        negative_prompt: "monochrome, lowres, bad anatomy, worst quality, low quality, blurry, multiple people, watermark, text",
        width: 1280,
        height: 720,
        num_outputs: 1,
        num_inference_steps: 30,
        seed: Math.floor(Math.random() * 1000000000),
        agree_to_research_only: true,
      }
    }
  );

  console.log("Replicate output:", JSON.stringify(output, null, 2));

  let imageUrl: string | undefined;
  
  if (Array.isArray(output) && output.length > 0) {
    // Handle FileOutput objects from newer Replicate SDK
    const firstOutput = output[0];
    if (typeof firstOutput === "string") {
      imageUrl = firstOutput;
    } else if (firstOutput && typeof firstOutput === "object") {
      // FileOutput has url() method or direct URL property
      if ("url" in firstOutput && typeof (firstOutput as any).url === "function") {
        imageUrl = (firstOutput as any).url();
      } else if ("url" in firstOutput) {
        imageUrl = (firstOutput as any).url;
      } else if ("href" in firstOutput) {
        imageUrl = (firstOutput as any).href;
      }
    }
  } else if (typeof output === "string") {
    imageUrl = output;
  } else if (output && typeof output === "object" && "output" in output) {
    const innerOutput = (output as any).output;
    imageUrl = Array.isArray(innerOutput) ? innerOutput[0] : innerOutput;
  }
  
  // If still no URL, try to stringify and extract
  if (!imageUrl) {
    const outputStr = JSON.stringify(output);
    const urlMatch = outputStr.match(/https:\/\/[^"'\s]+\.(png|jpg|jpeg|webp)/i);
    if (urlMatch) {
      imageUrl = urlMatch[0];
    }
  }

  if (!imageUrl || typeof imageUrl !== "string") {
    console.error("Could not extract image URL from output:", output);
    throw new Error("No image URL received from InstantID");
  }
  
  const https = await import("https");
  const http = await import("http");
  
  const base64 = await new Promise<string>((resolve, reject) => {
    const protocol = imageUrl.startsWith("https") ? https : http;
    protocol.get(imageUrl, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.toString("base64"));
      });
      response.on("error", reject);
    }).on("error", reject);
  });

  return {
    b64_json: base64,
    mimeType: "image/png",
  };
}

export function registerThumbnailRoutes(app: Express): void {
  app.post("/api/thumbnails/upload-photo", upload.single("photo"), async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const existingPhotos = await db.select().from(userProfilePhotos).where(eq(userProfilePhotos.userId, req.session.userId));
      const isDefault = existingPhotos.length === 0;

      const [photo] = await db.insert(userProfilePhotos).values({
        userId: req.session.userId,
        filename: req.file.originalname,
        storagePath: req.file.path,
        mimeType: req.file.mimetype,
        isDefault,
      }).returning();

      res.json(photo);
    } catch (error) {
      console.error("Error uploading photo:", error);
      res.status(500).json({ error: "Failed to upload photo" });
    }
  });

  app.get("/api/thumbnails/photos", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const photos = await db.select().from(userProfilePhotos)
        .where(eq(userProfilePhotos.userId, req.session.userId))
        .orderBy(desc(userProfilePhotos.createdAt));

      res.json(photos);
    } catch (error) {
      console.error("Error fetching photos:", error);
      res.status(500).json({ error: "Failed to fetch photos" });
    }
  });

  app.delete("/api/thumbnails/photos/:id", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const [photo] = await db.select().from(userProfilePhotos)
        .where(eq(userProfilePhotos.id, req.params.id));

      if (!photo || photo.userId !== req.session.userId) {
        return res.status(404).json({ error: "Photo not found" });
      }

      if (fs.existsSync(photo.storagePath)) {
        fs.unlinkSync(photo.storagePath);
      }

      await db.delete(userProfilePhotos).where(eq(userProfilePhotos.id, req.params.id));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting photo:", error);
      res.status(500).json({ error: "Failed to delete photo" });
    }
  });

  app.get("/api/thumbnails/photo-file/:id", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const [photo] = await db.select().from(userProfilePhotos)
        .where(eq(userProfilePhotos.id, req.params.id));

      if (!photo || photo.userId !== req.session.userId) {
        return res.status(404).json({ error: "Photo not found" });
      }

      if (!fs.existsSync(photo.storagePath)) {
        return res.status(404).json({ error: "Photo file not found" });
      }

      res.setHeader("Content-Type", photo.mimeType);
      res.sendFile(photo.storagePath);
    } catch (error) {
      console.error("Error serving photo:", error);
      res.status(500).json({ error: "Failed to serve photo" });
    }
  });

  app.post("/api/thumbnails/generate", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { title, style, provider, includePerson, customPrompt, userPhotoId } = req.body;

      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }

      if (!provider || !["dalle", "gemini", "instantid"].includes(provider)) {
        return res.status(400).json({ error: "Valid provider (dalle, gemini, or instantid) is required" });
      }

      let imageResult: { b64_json: string; mimeType: string };

      if (provider === "instantid") {
        if (!userPhotoId) {
          return res.status(400).json({ error: "Photo selection required for InstantID" });
        }

        const [photo] = await db.select().from(userProfilePhotos)
          .where(eq(userProfilePhotos.id, userPhotoId));

        if (!photo || photo.userId !== req.session.userId) {
          return res.status(404).json({ error: "Photo not found" });
        }

        if (!fs.existsSync(photo.storagePath)) {
          return res.status(404).json({ error: "Photo file not found" });
        }

        const photoBuffer = fs.readFileSync(photo.storagePath);
        const photoBase64 = photoBuffer.toString("base64");
        
        const prompt = customPrompt || buildInstantIdPrompt(title, style);
        imageResult = await generateWithInstantId(prompt, photoBase64, photo.mimeType);

        const [thumbnail] = await db.insert(generatedThumbnails).values({
          userId: req.session.userId,
          title,
          prompt,
          style: style || null,
          provider,
          base64Data: imageResult.b64_json,
          userPhotoId: userPhotoId,
        }).returning();

        return res.json({
          ...thumbnail,
          imageData: `data:${imageResult.mimeType};base64,${imageResult.b64_json}`,
        });
      }

      const prompt = customPrompt || buildPrompt(title, style, !!includePerson);

      if (provider === "dalle") {
        imageResult = await generateWithDalle(prompt);
      } else {
        imageResult = await generateWithGemini(prompt);
      }

      const [thumbnail] = await db.insert(generatedThumbnails).values({
        userId: req.session.userId,
        title,
        prompt,
        style: style || null,
        provider,
        base64Data: imageResult.b64_json,
        userPhotoId: null,
      }).returning();

      res.json({
        ...thumbnail,
        imageData: `data:${imageResult.mimeType};base64,${imageResult.b64_json}`,
      });
    } catch (error) {
      console.error("Error generating thumbnail:", error);
      res.status(500).json({ error: "Failed to generate thumbnail" });
    }
  });

  app.get("/api/thumbnails", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const thumbnails = await db.select().from(generatedThumbnails)
        .where(eq(generatedThumbnails.userId, req.session.userId))
        .orderBy(desc(generatedThumbnails.createdAt));

      const thumbnailsWithImages = thumbnails.map(t => ({
        ...t,
        imageData: t.base64Data ? `data:image/png;base64,${t.base64Data}` : null,
        base64Data: undefined,
      }));

      res.json(thumbnailsWithImages);
    } catch (error) {
      console.error("Error fetching thumbnails:", error);
      res.status(500).json({ error: "Failed to fetch thumbnails" });
    }
  });

  app.delete("/api/thumbnails/:id", async (req: Request, res: Response) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const [thumbnail] = await db.select().from(generatedThumbnails)
        .where(eq(generatedThumbnails.id, req.params.id));

      if (!thumbnail || thumbnail.userId !== req.session.userId) {
        return res.status(404).json({ error: "Thumbnail not found" });
      }

      await db.delete(generatedThumbnails).where(eq(generatedThumbnails.id, req.params.id));

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting thumbnail:", error);
      res.status(500).json({ error: "Failed to delete thumbnail" });
    }
  });

  app.get("/api/thumbnails/styles", (_req: Request, res: Response) => {
    res.json(thumbnailStyles);
  });
}
