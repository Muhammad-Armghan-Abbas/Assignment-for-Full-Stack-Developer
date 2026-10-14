import mammoth from "mammoth";
import { marked } from "marked";
import { storeAsset } from "./assets";
import type { Db } from "./db";
import { createDocument, type DocumentDetail } from "./documents";
import { badRequest } from "./errors";
import { sanitizeDocumentHtml } from "./sanitize";

/** Supported import formats. Kept in one place so the UI, API and docs agree. */
export const IMPORT_EXTENSIONS = [".txt", ".md", ".docx"] as const;
// Vercel functions cap request bodies at 4.5 MB, so stay under it.
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_EMBEDDED_IMAGES = 20;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

/** "Q3 plan (final).docx" -> "Q3 plan (final)" */
export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
  return (base || "Imported document").slice(0, 200);
}

/** Plain text: blank lines separate paragraphs, single newlines become <br>. */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export interface ConvertedFile {
  /** Unsanitized HTML; embedded images are referenced as `import-image:N`. */
  html: string;
  images: Uint8Array[];
}

const PLACEHOLDER = "import-image:";

/**
 * Convert an uploaded file into editor HTML. Images embedded in .docx files are
 * pulled out so they can be stored as real assets rather than base64 blobs.
 * Throws a 400 AppError for unsupported, empty, oversized or corrupt files.
 */
export async function convertFile(filename: string, data: Buffer): Promise<ConvertedFile> {
  const ext = extensionOf(filename);
  if (!(IMPORT_EXTENSIONS as readonly string[]).includes(ext)) {
    throw badRequest(`Unsupported file type "${ext || filename}". Supported: ${IMPORT_EXTENSIONS.join(", ")}`);
  }
  if (data.byteLength === 0) throw badRequest("The file is empty");
  if (data.byteLength > MAX_IMPORT_BYTES) throw badRequest("File is too large (max 4 MB)");

  if (ext === ".docx") {
    const images: Uint8Array[] = [];
    try {
      const result = await mammoth.convertToHtml(
        { buffer: data },
        {
          // mammoth ignores underline by default; keep it, since the editor supports it.
          styleMap: ["u => u"],
          convertImage: mammoth.images.imgElement(async (image) => {
            if (images.length >= MAX_EMBEDDED_IMAGES) return { src: "" };
            images.push(new Uint8Array(await image.readAsArrayBuffer()));
            return { src: `${PLACEHOLDER}${images.length - 1}` };
          }),
        },
      );
      return { html: result.value, images };
    } catch {
      throw badRequest("Could not read this .docx file. Is it a valid Word document?");
    }
  }
  const text = data.toString("utf8");
  return { html: ext === ".md" ? await marked.parse(text, { gfm: true }) : textToHtml(text), images: [] };
}

/** Text-only conversion (images dropped). Used where no document exists yet to own the images. */
export async function convertFileToHtml(filename: string, data: Buffer): Promise<string> {
  const { html } = await convertFile(filename, data);
  const clean = sanitizeDocumentHtml(html).trim();
  if (!clean) throw badRequest("No readable content was found in this file");
  return clean;
}

/** Create a new document from an uploaded file, storing any embedded images as assets of that document. */
export async function importDocument(db: Db, userId: string, filename: string, data: Buffer): Promise<DocumentDetail> {
  const { html, images } = await convertFile(filename, data);
  if (!sanitizeDocumentHtml(html.replace(/src="import-image:\d+"/g, 'src="/api/assets/x"')).trim()) {
    throw badRequest("No readable content was found in this file");
  }
  if (images.length === 0) {
    return createDocument(db, userId, { title: titleFromFilename(filename), content: html, source: filename });
  }

  // Images need the new document's id, so they are stored inside createDocument's fill step;
  // that way the "Imported" version and activity entry capture the finished content.
  return createDocument(db, userId, {
    title: titleFromFilename(filename),
    content: "",
    source: filename,
    fill: async (docId) => {
      let finalHtml = html;
      for (let i = 0; i < images.length; i++) {
        try {
          const asset = await storeAsset(db, userId, docId, images[i], { skipAuth: true });
          finalHtml = finalHtml.split(`"${PLACEHOLDER}${i}"`).join(`"${asset.url}"`);
        } catch {
          // Unsupported formats (e.g. EMF/WMF diagrams) are dropped; the sanitizer removes the <img>.
        }
      }
      return finalHtml;
    },
  });
}
