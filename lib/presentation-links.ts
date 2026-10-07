import { sql } from "drizzle-orm"
import type { db } from "./db/index"

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
export class PresentationLinkError extends Error {}

/** Mantiene IDs y precios; sólo cambia la equivalencia y la foto del artículo. */
export async function linkPresentationPair(tx:Pick<Transaction,"execute">,input:{unitId:number;packId:number;packSize:number}) {
  const {unitId,packId,packSize}=input
  if (![unitId,packId].every(id=>Number.isSafeInteger(id)&&id>0) || unitId===packId) throw new PresentationLinkError("Elegí dos productos distintos.")
  if (!Number.isInteger(packSize)||packSize<2||packSize>1000) throw new PresentationLinkError("Indicá cuántas unidades trae el pack: entre 2 y 1.000.")
  // Usa el mismo bloqueo que el portal de fotos: publicar y vincular no se pisan.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(9137301)`)
  const found=await tx.execute<{id:number;name:string;group_key:string|null;active:boolean}>(sql`SELECT id,name,group_key,active FROM products WHERE id IN (${unitId},${packId}) FOR UPDATE`)
  const unit=found.rows.find(p=>p.id===unitId),pack=found.rows.find(p=>p.id===packId)
  if (!unit||!pack) throw new PresentationLinkError("Uno de los productos ya no existe. Recargá la lista.")
  if (!unit.active||!pack.active) throw new PresentationLinkError("Activá ambos productos antes de vincularlos.")
  const key=unit.group_key || `manual ${unitId}`
  const conflicts=await tx.execute<{name:string;pack_size:number}>(sql`SELECT name,pack_size FROM products
    WHERE group_key=${key} AND active AND id NOT IN (${unitId},${packId}) AND pack_size IN (1,${packSize})`)
  if (conflicts.rows.length) throw new PresentationLinkError(`Este artículo ya tiene ${conflicts.rows[0].pack_size===1 ? "otro unitario" : `un pack x${packSize}`}: ${conflicts.rows[0].name}. Separalo o corregilo antes de vincular para no ocultar un precio.`)
  // Prefiere la foto del unitario; si no tiene, la del pack. Nunca publica una pendiente.
  const photo=await tx.execute<{image_url:string}>(sql`SELECT p.image_url FROM products p
    LEFT JOIN product_photo_candidates c ON p.image_url='/api/fotos-productos/'||c.id::text
    WHERE (p.id IN (${unitId},${packId}) OR p.group_key=${key}) AND p.image_url IS NOT NULL
      AND (p.image_url NOT LIKE '/api/fotos-productos/%' OR c.status='confirmada')
    ORDER BY (p.id=${unitId}) DESC,(p.group_key=${key}) DESC NULLS LAST,p.pack_size,p.id LIMIT 1`)
  const image=photo.rows[0]?.image_url ?? null
  await tx.execute(sql`UPDATE products SET group_key=${key},pack_size=1,updated_at=now() WHERE id=${unitId}`)
  await tx.execute(sql`UPDATE products SET group_key=${key},pack_size=${packSize},updated_at=now() WHERE id=${packId}`)
  await tx.execute(sql`UPDATE products SET image_url=${image},updated_at=now() WHERE group_key=${key}`)
  return {groupKey:key}
}

export async function separatePresentation(tx:Pick<Transaction,"execute">,id:number) {
  if (!Number.isSafeInteger(id)||id<1) throw new PresentationLinkError("Producto inválido.")
  await tx.execute(sql`SELECT pg_advisory_xact_lock(9137301)`)
  const result=await tx.execute(sql`UPDATE products SET group_key=${`manual separado ${id}`},updated_at=now() WHERE id=${id} RETURNING id`)
  if (!result.rows.length) throw new PresentationLinkError("El producto ya no existe.")
}
