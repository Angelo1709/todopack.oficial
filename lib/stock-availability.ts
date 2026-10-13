import { gt, isNotNull, isNull, or } from "drizzle-orm"
import { products } from "./db/schema.ts"

const required = () => /^(true|1)$/i.test(process.env.STOCK_SYNC_REQUIRED ?? "")

/** Durante la puesta en marcha se venden los desconocidos; al activar el control, sólo stock confirmado. */
export function stockAvailableCondition() {
  const positive = gt(products.stockQuantity, 0)
  return required() ? positive : or(isNull(products.stockQuantity), positive)
}

/** Lo que la tienda muestra: lo disponible y lo agotado (en gris). Con el control activo, el stock desconocido sigue oculto. */
export function stockVisibleCondition() {
  return required() ? isNotNull(products.stockQuantity) : undefined
}
