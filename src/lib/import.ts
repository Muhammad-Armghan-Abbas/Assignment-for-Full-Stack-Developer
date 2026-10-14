import mammoth from "mammoth";
import { marked } from "marked";
import { badRequest } from "./errors";
import { sanitizeDocumentHtml } from "./sanitize";

/** Supported import formats. Kept in one place so the UI, API and docs agree. */
export const IMPORT_EXTENSIONS = [".txt", ".md", ".docx"] as const;
// Vercel functions cap request bodies at 4.5 MB, so stay under it.
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024; // 4 MB

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

/**
 * Convert an uploaded file into sanitized editor HTML.
 * Throws a 400 AppError for unsupported, empty or oversized files.
 */
export async function convertFileToHtml(filename: string, data: Buffer): Promise<string> {
  const ext = extensionOf(filename);
  if (!(IMPORT_EXTENSIONS as readonly string[]).includes(ext)) {
    throw badRequest(`Unsupported file type "${ext || filename}". Supported: ${IMPORT_EXTENSIONS.join(", ")}`);
  }
  if (data.byteLength === 0) throw badRequest("The file is empty");
  if (data.byteLength > MAX_IMPORT_BYTES) throw badRequest("File is too large (max 4 MB)");

  let html: string;
  if (ext === ".docx") {
    try {
      const result = await mammoth.convertToHtml({ buffer: data });
      html = result.value;
    } catch {
      throw badRequest("Could not read this .docx file. Is it a valid Word document?");
    }
  } else {
    const text = data.toString("utf8");
    html = ext === ".md" ? await marked.parse(text, { gfm: true }) : textToHtml(text);
  }

  const clean = sanitizeDocumentHtml(html).trim();
  if (!clean) throw badRequest("No readable text was found in this file");
  return clean;
}
