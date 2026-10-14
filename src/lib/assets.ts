import { randomUUID } from "node:crypto";
import { authorize } from "./access";
import type { Db } from "./db";
import { badRequest, notFound } from "./errors";
import { ASSET_URL_PREFIX } from "./sanitize";

/**
 * Images embedded in documents.
 *
 * Stored as BLOBs next to the document (Turso free tier is plenty for a demo,
 * and it keeps deployment to one service). Every read is authorized against
 * the owning document, so an image is exactly as private as its document.
 * SVG is deliberately not accepted: it can carry script.
 */

export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB, under Vercel's 4.5 MB request cap

/** Check the file's magic bytes too — the browser-supplied MIME type is just a claim. */
function sniff(data: Uint8Array): string | null {
  const b = data;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

export async function storeAsset(db: Db, userId: string, docId: string, data: Uint8Array, { skipAuth = false } = {}) {
  if (!skipAuth) await authorize(db, userId, docId, "edit");
  if (data.byteLength === 0) throw badRequest("The image is empty");
  if (data.byteLength > MAX_IMAGE_BYTES) throw badRequest("Images must be 3 MB or smaller");
  const mime = sniff(data);
  if (!mime) throw badRequest("Unsupported image. Use PNG, JPEG, GIF or WebP.");
  const id = randomUUID();
  await db.execute({
    sql: "INSERT INTO assets (id, document_id, uploader_id, mime, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [id, docId, userId, mime, data.byteLength, data, new Date().toISOString()],
  });
  return { id, url: `${ASSET_URL_PREFIX}${id}`, mime, size: data.byteLength };
}

export async function readAsset(db: Db, userId: string, assetId: string): Promise<{ mime: string; data: Uint8Array }> {
  const { rows } = await db.execute({ sql: "SELECT document_id, mime, data FROM assets WHERE id = ?", args: [assetId] });
  if (!rows.length) throw notFound("Image");
  await authorize(db, userId, String(rows[0].document_id), "read");
  const raw = rows[0].data as ArrayBuffer | Uint8Array;
  return { mime: String(rows[0].mime), data: raw instanceof Uint8Array ? raw : new Uint8Array(raw) };
}
