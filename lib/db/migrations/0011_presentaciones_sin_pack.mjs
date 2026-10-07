import { planPresentationRepairs } from "../../presentation-audit.ts"
import shareArticlePhotos from "./0010_fotos_por_articulo.mjs"

export default async function migrate(client) {
  await client.query("SELECT pg_advisory_xact_lock(9137301)")
  const { rows } = await client.query("SELECT id,name,price,pack_size,group_key,active FROM products FOR UPDATE")
  const repairs = planPresentationRepairs(rows)
  for (const r of repairs) await client.query(
    "UPDATE products SET pack_size=$2,group_key=$3,updated_at=now() WHERE id=$1",
    [r.id,r.packSize,r.groupKey],
  )
  await shareArticlePhotos(client)
  console.log(`  ${repairs.length} presentaciones corregidas; precios originales conservados.`)
}
