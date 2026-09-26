// Upsert de productos de la lista de precios, compartido por seed-products.mjs y gen-seed-sql.mjs.
// Mismas reglas que la importación Excel del admin (app/actions/catalog.ts):
// - nuevo: se inserta con categoría, pack_size y group_key detectados;
// - existente: se actualiza el precio y se reactiva;
// - categoría / pack_size / group_key existentes NO se pisan (pueden estar corregidos a mano),
//   salvo que group_key sea NULL (producto nunca clasificado): ahí se completan con lo detectado.

export const PRODUCT_COLUMNS = "name, price, category, pack_size, group_key"

export const PRODUCT_CONFLICT_SQL = `ON CONFLICT (name) DO UPDATE SET
  price = EXCLUDED.price,
  active = true,
  category = CASE WHEN products.group_key IS NULL THEN EXCLUDED.category ELSE products.category END,
  pack_size = CASE WHEN products.group_key IS NULL THEN EXCLUDED.pack_size ELSE products.pack_size END,
  group_key = COALESCE(products.group_key, EXCLUDED.group_key),
  updated_at = now()
WHERE products.price IS DISTINCT FROM EXCLUDED.price OR NOT products.active OR products.group_key IS NULL`

/** Valores de una fila de data/products.json en el orden de PRODUCT_COLUMNS. */
export function productValues(p) {
  return [p.name, p.price, p.category, p.packSize ?? 1, p.groupKey ?? null]
}
