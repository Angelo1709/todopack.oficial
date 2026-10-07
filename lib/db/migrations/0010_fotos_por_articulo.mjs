import { canonicalVolumeOrder } from "../../pack.ts"

export default async function migrate(client) {
  await client.query("SELECT pg_advisory_xact_lock(9137301)")
  const products=(await client.query("SELECT id,group_key FROM products WHERE group_key IS NOT NULL FOR UPDATE")).rows
  for (const p of products) {
    const key=canonicalVolumeOrder(p.group_key)
    if (key!==p.group_key) await client.query("UPDATE products SET group_key=$2,updated_at=now() WHERE id=$1",[p.id,key])
  }
  // El usuario confirmó que 7Up fría 1,5 L unidad y pack x6 son el mismo
  // artículo: conserva $2.700/unidad y $15.000/pack, sin modificar precios.
  await client.query(`UPDATE products SET group_key='7up 1.5l',updated_at=now()
    WHERE group_key='7up fria 1.5l' AND pack_size=1 AND name='7UP 1.5 LT FRIA UNIDAD'
      AND EXISTS(SELECT 1 FROM products WHERE group_key='7up 1.5l' AND pack_size=6)`)
  // Una foto por artículo. Conserva la foto elegida por el usuario por encima del
  // automatch; entre decisiones equivalentes gana la publicación más reciente.
  await client.query(`WITH choices AS (
    SELECT DISTINCT ON (coalesce(p.group_key,'id:'||p.id))
      coalesce(p.group_key,'id:'||p.id) AS key,p.image_url
    FROM products p LEFT JOIN product_photo_candidates c
      ON p.image_url='/api/fotos-productos/'||c.id::text
    WHERE p.image_url IS NOT NULL AND (c.id IS NULL OR c.status='confirmada')
    ORDER BY coalesce(p.group_key,'id:'||p.id),
      (c.reviewed_by IS NOT NULL OR c.id IS NULL) DESC,c.updated_at DESC NULLS LAST,p.pack_size,p.id
  ) UPDATE products p SET image_url=choices.image_url,updated_at=now()
    FROM choices WHERE coalesce(p.group_key,'id:'||p.id)=choices.key AND p.image_url IS DISTINCT FROM choices.image_url`)
}
