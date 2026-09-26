import { defineTool } from "eve/tools";
import { z } from "zod";
import { and, isNull, eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { products } from "../../lib/db/schema";

export default defineTool({
  description: "List products in the catalog that do not have an image, with optional pagination.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(20).default(20),
    offset: z.number().int().min(0).default(0),
  }),
  async execute({ limit, offset }) {
    const rows = await db.select({ id: products.id, name: products.name, category: products.category })
      .from(products)
      .where(and(isNull(products.imageUrl), eq(products.active, true)))
      .limit(limit)
      .offset(offset);
    return { count: rows.length, offset, products: rows };
  },
});
