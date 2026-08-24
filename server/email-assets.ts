import fs from "fs";
import path from "path";

const EMAIL_LOGO_FILENAME = "lion-logo.png";

type ResolveEmailLogoOptions = {
  compiledPublicDir?: string;
  sourcePublicDir?: string;
  fileExists?: (filePath: string) => boolean;
};

function getCompiledPublicDir(): string {
  // The compiled CJS deployment has __dirname set to dist/. The TypeScript
  // development server runs as ESM, where it does not exist.
  return typeof __dirname === "string"
    ? path.resolve(__dirname, "public")
    : path.resolve(process.cwd(), "dist", "public");
}

/**
 * Finds the shared email logo in the compiled deployment output first, then
 * falls back to the source asset used by the development server.
 */
export function resolveEmailLogoPath({
  compiledPublicDir = getCompiledPublicDir(),
  sourcePublicDir = path.resolve(process.cwd(), "client", "public"),
  fileExists = fs.existsSync,
}: ResolveEmailLogoOptions = {}): string | undefined {
  const candidates = [
    path.join(compiledPublicDir, EMAIL_LOGO_FILENAME),
    path.join(sourcePublicDir, EMAIL_LOGO_FILENAME),
  ];

  return candidates.find(fileExists);
}