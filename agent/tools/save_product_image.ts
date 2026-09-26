import { defineTool } from "eve/tools";
import { z } from "zod";
import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { products } from "../../lib/db/schema";

const inputSchema = z.object({
  productId: z.number().int().positive(),
  imageUrl: z.string().url(),
  sourceUrl: z.string().url(),
  confidence: z.enum(["high", "medium"]),
});

export default defineTool({
  description: "Download a verified public product image, upload it to public Vercel Blob storage, and update the product image URL.",
  inputSchema,
  async execute({ productId, imageUrl, sourceUrl, confidence }) {
    const product = await db.query.products.findFirst({ where: eq(products.id, productId) });
    if (!product) return { ok: false, productId, reason: "Producto inexistente" };
    if (product.imageUrl) return { ok: false, productId, reason: "El producto ya tiene imagen" };

    const response = await fetch(imageUrl, { headers: { "User-Agent": "TODO-PACK product catalog image importer" }, redirect: "follow" });
    if (!response.ok) return { ok: false, productId, reason: `La imagen respondió HTTP ${response.status}` };
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return { ok: false, productId, reason: "La URL no devolvió una imagen" };
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > 10_000_000) return { ok: false, productId, reason: "La imagen supera 10 MB" };

    const blob = await put(`products/${productId}-${product.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80)}.${contentType.split("/")[1]?.split(";")[0] ?? "jpg"}`, await response.arrayBuffer(), { access: "public", contentType, addRandomSuffix: true });
    await db.update(products).set({ imageUrl: blob.url, updatedAt: new Date() }).where(eq(products.id, productId));
    return { ok: true, productId, productName: product.name, imageUrl: blob.url, sourceUrl, confidence };
  },
});
