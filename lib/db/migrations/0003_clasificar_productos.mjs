// Clasifica los productos que nunca se clasificaron (group_key NULL): presentación (pack_size),
// grupo y categoría detectados del nombre, igual que la importación del Excel.
// Los ya clasificados (o editados a mano) no se tocan.
import { parsePresentation } from "../../pack.ts"
import { categorize } from "../../categorize.ts"

export default async function migrate(client) {
  const { rows } = await client.query(`SELECT id, name FROM products WHERE group_key IS NULL`)
  for (const { id, name } of rows) {
    const { packSize, groupKey } = parsePresentation(name)
    await client.query(
      `UPDATE products SET pack_size = $2, group_key = $3, category = $4, updated_at = now() WHERE id = $1`,
      [id, packSize, groupKey, categorize(name)],
    )
  }
  console.log(`  ${rows.length} producto(s) clasificado(s)`)
}
