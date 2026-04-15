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

async function runWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 7000
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      const is429 = error?.response?.status === 429 || 
                    error?.message?.includes('429') ||
                    error?.message?.includes('Too Many Requests');
      
      if (is429 && attempt < maxRetries - 1) {
        const delay = initialDelay * (attempt + 1);
        console.log(`Rate limited, waiting ${delay/1000}s before retry ${attempt + 1}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError || new Error("Max retries exceeded");
}

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
    model: "gemini-3-pro-image-preview",
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

async function extractReplicateImage(output: unknown): Promise<Buffer> {
  let imageData: Buffer | undefined;
  
  console.log("Extracting image from Replicate output type:", typeof output);
  if (output && typeof output === "object") {
    console.log("Output constructor:", (output as any).constructor?.name);
  }
  
  // Handle FileOutput object (has url() method and read() method)
  if (output && typeof output === "object" && typeof (output as any).url === "function") {
    const urlResult = (output as any).url();
    // urlResult might be a URL object or a string
    const url = typeof urlResult === "string" ? urlResult : urlResult?.href || urlResult?.toString();
    console.log("Got URL from FileOutput:", url);
    if (url && typeof url === "string") {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      imageData = Buffer.from(arrayBuffer);
    }
  }
  // Handle ReadableStream directly
  else if (output && typeof output === "object" && 
           ((output as any) instanceof ReadableStream || 
            (output as any).constructor?.name === "ReadableStream")) {
    console.log("Handling ReadableStream output");
    const reader = (output as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    imageData = Buffer.from(combined);
  }
  // Handle object with blob() method
  else if (output && typeof output === "object" && typeof (output as any).blob === "function") {
    console.log("Handling blob output");
    const blob = await (output as any).blob();
    const arrayBuffer = await blob.arrayBuffer();
    imageData = Buffer.from(arrayBuffer);
  }
  // Handle array output
  else if (Array.isArray(output) && output.length > 0) {
    console.log("Handling array output with", output.length, "items");
    const firstOutput = output[0];
    
    if (firstOutput && typeof firstOutput === "object") {
      if (typeof (firstOutput as any).url === "function") {
        const url = (firstOutput as any).url();
        if (url && typeof url === "string") {
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          imageData = Buffer.from(arrayBuffer);
        }
      }
      else if (firstOutput instanceof ReadableStream || 
          (firstOutput.constructor && firstOutput.constructor.name === "ReadableStream")) {
        const reader = (firstOutput as ReadableStream<Uint8Array>).getReader();
        const chunks: Uint8Array[] = [];
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        imageData = Buffer.from(combined);
      }
      else if (typeof (firstOutput as any).blob === "function") {
        const blob = await (firstOutput as any).blob();
        const arrayBuffer = await blob.arrayBuffer();
        imageData = Buffer.from(arrayBuffer);
      }
      else if ("url" in firstOutput) {
        const url = typeof (firstOutput as any).url === "function" 
          ? (firstOutput as any).url() 
          : (firstOutput as any).url;
        if (url && typeof url === "string") {
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          imageData = Buffer.from(arrayBuffer);
        }
      }
    }
    else if (typeof firstOutput === "string" && firstOutput.startsWith("http")) {
      const response = await fetch(firstOutput);
      const arrayBuffer = await response.arrayBuffer();
      imageData = Buffer.from(arrayBuffer);
    }
  }
  // Handle single string URL output (some models return string directly)
  else if (typeof output === "string" && output.startsWith("http")) {
    console.log("Handling string URL output");
    const response = await fetch(output);
    const arrayBuffer = await response.arrayBuffer();
    imageData = Buffer.from(arrayBuffer);
  }

  if (!imageData || imageData.length === 0) {
    console.log("Failed to extract image. Output was:", JSON.stringify(output, null, 2)?.substring(0, 500));
    throw new Error("Could not extract image data from Replicate output");
  }

  return imageData;
}

async function removeBackground(imageBase64: string, mimeType: string): Promise<Buffer> {
  console.log("Removing background from user photo...");
  
  const dataUrl = `data:${mimeType};base64,${imageBase64}`;
  
  const output = await runWithRetry(() => replicate.run(
    "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
    {
      input: {
        image: dataUrl,
      }
    }
  ));
  
  const imageData = await extractReplicateImage(output);
  console.log("Background removed, got", imageData.length, "bytes");
  return imageData;
}

function buildThumbnailPrompt(userPrompt: string, width: number, height: number): string {
  const aspectRatio = width > height ? "landscape 16:9" : "square 1:1";
  
  return `Professional YouTube thumbnail design, ${aspectRatio} format.
${userPrompt}

IMPORTANT DESIGN REQUIREMENTS:
- Person cutout with white stroke outline on the right side of the image
- Bold, large readable text with drop shadows and outlines
- Vibrant gradient background with tech/modern feel
- Professional YouTube thumbnail style
- Eye-catching, high contrast colors
- Include relevant icons and graphics that match the topic
- Text should be readable at small sizes
- Clean, professional composition`;
}

async function generateCompositeThumbnail(
  userPrompt: string,
  cutoutImageBase64: string,
  width: number = 1280,
  height: number = 720
): Promise<{ b64_json: string; mimeType: string }> {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("Replicate API token not configured");
  }

  console.log("Generating composite thumbnail with Ideogram Character...");
  console.log("User prompt:", userPrompt);
  console.log("Dimensions:", width, "x", height);

  const cutoutDataUrl = `data:image/png;base64,${cutoutImageBase64}`;
  
  const thumbnailPrompt = buildThumbnailPrompt(userPrompt, width, height);
  
  const aspectRatio = width > height ? "16:9" : "1:1";
  
  const output = await runWithRetry(() => replicate.run(
    "ideogram-ai/ideogram-character",
    {
      input: {
        prompt: thumbnailPrompt,
        aspect_ratio: aspectRatio,
        rendering_speed: "Default",
        style_type: "Realistic",
        magic_prompt_option: "On",
        character_reference_image: cutoutDataUrl,
      }
    }
  ));

  const imageData = await extractReplicateImage(output);
  console.log("Composite thumbnail generated, got", imageData.length, "bytes");

  return {
    b64_json: imageData.toString("base64"),
    mimeType: "image/png",
  };
}

async function generateThumbnailPipeline(
  userPrompt: string,
  userPhotoBase64: string,
  userPhotoMimeType: string,
  width: number = 1280,
  height: number = 720
): Promise<{ b64_json: string; mimeType: string }> {
  
  console.log("=== Starting Thumbnail Generation Pipeline ===");
  
  const cutoutBuffer = await removeBackground(userPhotoBase64, userPhotoMimeType);
  const cutoutBase64 = cutoutBuffer.toString("base64");
  
  const result = await generateCompositeThumbnail(userPrompt, cutoutBase64, width, height);
  
  console.log("=== Thumbnail Pipeline Complete ===");
  return result;
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

      const { title, customPrompt, imageType, width, height, userPhotoId } = req.body;

      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }

      if (!customPrompt || typeof customPrompt !== "string" || !customPrompt.trim()) {
        return res.status(400).json({ error: "Thumbnail description is required" });
      }

      if (!imageType || !width || !height) {
        return res.status(400).json({ error: "Image type and dimensions are required" });
      }

      if (!userPhotoId) {
        return res.status(400).json({ error: "Photo selection required" });
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
      
      // Use the new compositing pipeline: background removal + Ideogram
      const prompt = customPrompt.trim();
      const imageResult = await generateThumbnailPipeline(prompt, photoBase64, photo.mimeType, width, height);

      const [thumbnail] = await db.insert(generatedThumbnails).values({
        userId: req.session.userId,
        title,
        prompt,
        imageType,
        width,
        height,
        provider: "ideogram",
        base64Data: imageResult.b64_json,
        userPhotoId: userPhotoId,
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
