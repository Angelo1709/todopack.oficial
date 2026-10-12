import { gt, isNull, or } from "drizzle-orm"
import { products } from "./db/schema.ts"

/** Durante la puesta en marcha se ven los desconocidos; al activar el control, sólo stock confirmado. */
export function stockAvailableCondition() {
  const positive = gt(products.stockQuantity, 0)
  return /^(true|1)$/i.test(process.env.STOCK_SYNC_REQUIRED ?? "")
    ? positive
    : or(isNull(products.stockQuantity), positive)
}
