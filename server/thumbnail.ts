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

  // Use data URL format which Replicate accepts
  const dataUrl = `data:${imageMimeType};base64,${faceImageBase64}`;
  console.log("Using data URL, length:", dataUrl.length);
  console.log("Prompt:", prompt);

  // Use PhotoMaker model - reliable for face-based image generation
  // PhotoMaker uses "img" as trigger word to reference the uploaded photo
  // Keep prompt simple and focused for best results
  const photoMakerPrompt = `A photo of a person img, ${prompt}`;
  console.log("PhotoMaker prompt:", photoMakerPrompt);
  
  const output = await replicate.run(
    "tencentarc/photomaker:ddfc2b08d209f9fa8c1eca692712918bd449f695dabb4a958da31802a9570fe4",
    {
      input: {
        input_image: dataUrl,
        prompt: photoMakerPrompt,
        negative_prompt: "nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, deformed face, distorted face",
        style_name: "Photographic (Default)",
        num_steps: 50,
        style_strength_ratio: 15,
        guidance_scale: 7.5,
        num_outputs: 1,
        seed: Math.floor(Math.random() * 2147483647),
      }
    }
  );

  console.log("Replicate output type:", typeof output, Array.isArray(output) ? "array" : "");
  
  let imageData: Buffer | undefined;
  
  if (Array.isArray(output) && output.length > 0) {
    const firstOutput = output[0];
    console.log("First output type:", typeof firstOutput, firstOutput?.constructor?.name);
    
    // Handle FileOutput objects from newer Replicate SDK - they are ReadableStreams
    if (firstOutput && typeof firstOutput === "object") {
      // Check if it's a ReadableStream (Web Streams API)
      if (firstOutput instanceof ReadableStream || 
          (firstOutput.constructor && firstOutput.constructor.name === "ReadableStream")) {
        console.log("Reading from ReadableStream...");
        const reader = (firstOutput as ReadableStream<Uint8Array>).getReader();
        const chunks: Uint8Array[] = [];
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        
        // Combine all chunks
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        imageData = Buffer.from(combined);
        console.log("Read", imageData.length, "bytes from stream");
      }
      // Check if it has a blob() or arrayBuffer() method
      else if (typeof (firstOutput as any).blob === "function") {
        console.log("Reading via blob()...");
        const blob = await (firstOutput as any).blob();
        const arrayBuffer = await blob.arrayBuffer();
        imageData = Buffer.from(arrayBuffer);
      }
      // Check if it has a url property or method
      else if ("url" in firstOutput) {
        const url = typeof (firstOutput as any).url === "function" 
          ? (firstOutput as any).url() 
          : (firstOutput as any).url;
        if (url && typeof url === "string") {
          console.log("Fetching from URL:", url);
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          imageData = Buffer.from(arrayBuffer);
        }
      }
    }
    // Handle plain string URL
    else if (typeof firstOutput === "string" && firstOutput.startsWith("http")) {
      console.log("Fetching from URL string:", firstOutput);
      const response = await fetch(firstOutput);
      const arrayBuffer = await response.arrayBuffer();
      imageData = Buffer.from(arrayBuffer);
    }
  }

  if (!imageData || imageData.length === 0) {
    console.error("Could not extract image data from output");
    throw new Error("No image data received from PhotoMaker");
  }

  return {
    b64_json: imageData.toString("base64"),
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

      const { title, style, customPrompt, userPhotoId } = req.body;

      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }

      if (!customPrompt || typeof customPrompt !== "string" || !customPrompt.trim()) {
        return res.status(400).json({ error: "Thumbnail description is required" });
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
      
      // Use the user's custom prompt directly
      const prompt = customPrompt.trim();
      const imageResult = await generateWithInstantId(prompt, photoBase64, photo.mimeType);

      const [thumbnail] = await db.insert(generatedThumbnails).values({
        userId: req.session.userId,
        title,
        prompt,
        style: style || null,
        provider: "instantid",
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
