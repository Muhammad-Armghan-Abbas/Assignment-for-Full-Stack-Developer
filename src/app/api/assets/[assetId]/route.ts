import { handle } from "@/lib/api";
import { readAsset } from "@/lib/assets";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ assetId: string }> };

/** Serve an image only to people who can read its document. Asset ids are immutable, so cache privately for a long time. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { assetId } = await params;
  const { mime, data } = await readAsset(await getDb(), user.id, assetId);
  return new Response(Buffer.from(data), {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
});
