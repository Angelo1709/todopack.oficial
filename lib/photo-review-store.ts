import { createHash, randomUUID } from "node:crypto"
import type { Pool, PoolClient } from "pg"

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024
export const PHOTO_STATUSES = ["pendiente", "confirmada", "errada"] as const
export type PhotoStatus = typeof PHOTO_STATUSES[number]
export type PhotoProduct = { id: number; name: string; groupKey: string | null; packSize: number; imageUrl: string | null }
export type PhotoCandidate = {
  id: string; productId: number | null; filename: string; sourceTitle: string
  status: PhotoStatus; version: number; published: boolean
}
export type PhotoSnapshot = { products: PhotoProduct[]; candidates: PhotoCandidate[] }
export class PhotoReviewError extends Error {}
export const isPhotoId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)

export function photoMime(bytes: Uint8Array): string {
  const data = Buffer.from(bytes)
  if (data.length > MAX_PHOTO_BYTES || data.length < 12) throw new PhotoReviewError("La foto debe pesar hasta 8 MB.")
  if (data.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return "image/jpeg"
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png"
  if (data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "image/webp"
  throw new PhotoReviewError("Elegí una foto JPG, PNG o WebP.")
}

export function publicPhotoUrl(id: string) { return `/api/fotos-productos/${id}` }
const columns = `c.id, c.product_id AS "productId", c.filename, c.source_title AS "sourceTitle",
  c.status, c.version, coalesce(p.image_url = '/api/fotos-productos/' || c.id::text AND c.status = 'confirmada', false) AS published`

export class PhotoReviewStore {
  private pool: Pick<Pool, "query" | "connect">
  constructor(pool: Pick<Pool, "query" | "connect">) { this.pool = pool }

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query("BEGIN")
      // Serializa las decisiones y reasignaciones para que dos revisores no
      // publiquen ni retiren una foto sobre una decisión que ya cambió.
      await client.query("SELECT pg_advisory_xact_lock(9137301)")
      const result = await work(client)
      await client.query("COMMIT")
      return result
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally { client.release() }
  }

  async snapshot(): Promise<PhotoSnapshot> {
    const [products, candidates] = await Promise.all([
      this.pool.query<PhotoProduct>(`SELECT id, name, group_key AS "groupKey", pack_size AS "packSize", image_url AS "imageUrl"
        FROM products ORDER BY name`),
      this.pool.query<PhotoCandidate>(`SELECT ${columns} FROM product_photo_candidates c
        LEFT JOIN products p ON p.id = c.product_id ORDER BY c.created_at, c.id`),
    ])
    return { products: products.rows, candidates: candidates.rows }
  }

  async upload(input: { data: Uint8Array; filename: string; productId?: number | null; sourceTitle?: string; sourceUrl?: string | null; userId: string | null }) {
    const mime = photoMime(input.data)
    const sha = createHash("sha256").update(input.data).digest("hex")
    const productId = input.productId ?? null
    if (productId !== null && (!Number.isSafeInteger(productId) || productId < 1)) throw new PhotoReviewError("Producto inválido.")
    return this.transaction(async (client) => {
      if (productId !== null && !(await client.query("SELECT id FROM products WHERE id=$1", [productId])).rowCount)
        throw new PhotoReviewError("El producto ya no existe.")
      const existing = await client.query<{ id: string }>(`SELECT id FROM product_photo_candidates WHERE product_id IS NOT DISTINCT FROM $1 AND sha256=$2`, [productId, sha])
      if (existing.rows.length) return { id: existing.rows[0].id, duplicate: true }
      const id = randomUUID()
      await client.query(`INSERT INTO product_photo_candidates
        (id, product_id, filename, source_title, source_url, mime_type, image_data, sha256, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, productId, input.filename.slice(0, 250),
        (input.sourceTitle ?? "").slice(0, 500), input.sourceUrl?.slice(0, 2000) ?? null,
        mime, Buffer.from(input.data), sha, input.userId])
      return { id, duplicate: false }
    })
  }

  async decide(input: { id: string; version: number; status?: PhotoStatus; productId?: number | null; userId: string | null }) {
    if (!isPhotoId(input.id)) throw new PhotoReviewError("Foto inválida.")
    if (!Number.isInteger(input.version) || input.version < 1) throw new PhotoReviewError("Recargá la revisión antes de guardar.")
    if (input.status !== undefined && !PHOTO_STATUSES.includes(input.status)) throw new PhotoReviewError("Estado inválido.")
    if (input.productId !== undefined && input.productId !== null && (!Number.isSafeInteger(input.productId) || input.productId < 1))
      throw new PhotoReviewError("Producto inválido.")
    return this.transaction(async (client) => {
      const found = await client.query<{ product_id: number | null; status: PhotoStatus; version: number }>(
        "SELECT product_id, status, version FROM product_photo_candidates WHERE id=$1 FOR UPDATE", [input.id])
      const row = found.rows[0]
      if (!row) throw new PhotoReviewError("La foto ya no existe.")
      if (row.version !== input.version) throw new PhotoReviewError("La revisión cambió. Recargá antes de decidir.")
      const assigning = input.productId !== undefined && input.productId !== row.product_id
      if (assigning && row.status === "confirmada") throw new PhotoReviewError("Volvé la foto a pendiente antes de cambiar el producto.")
      const productId = input.productId === undefined ? row.product_id : input.productId
      const status = assigning ? "pendiente" : input.status ?? row.status
      if (status === "confirmada" && !productId) throw new PhotoReviewError("Elegí el producto antes de confirmar.")
      if (productId !== null && !(await client.query("SELECT id FROM products WHERE id=$1 FOR UPDATE", [productId])).rowCount)
        throw new PhotoReviewError("El producto ya no existe.")
      if (assigning) {
        const duplicate = await client.query("SELECT id FROM product_photo_candidates WHERE product_id IS NOT DISTINCT FROM $1 AND sha256=(SELECT sha256 FROM product_photo_candidates WHERE id=$2) AND id<>$2", [productId, input.id])
        if (duplicate.rowCount) throw new PhotoReviewError("Esta foto ya está vinculada a ese producto.")
      }
      const url = publicPhotoUrl(input.id)
      if (status === "confirmada") {
        // La foto es para ESTA presentación. No se aplica a todo el groupKey.
        await client.query("UPDATE products SET image_url=$1, updated_at=now() WHERE id=$2", [url, productId])
      } else {
        // Sólo retira esta foto: otra imagen publicada después queda intacta.
        await client.query("UPDATE products SET image_url=NULL, updated_at=now() WHERE id=$1 AND image_url=$2", [row.product_id, url])
      }
      await client.query(`UPDATE product_photo_candidates SET product_id=$2, status=$3, version=version+1,
        reviewed_by=$4, updated_at=now() WHERE id=$1`, [input.id, productId, status, input.userId])
      await client.query("INSERT INTO product_photo_reviews (candidate_id,product_id,status,reviewed_by) VALUES ($1,$2,$3,$4)", [input.id, productId, assigning ? "vinculada" : status, input.userId])
      return { ok: true }
    })
  }

  async image(id: string, publicOnly: boolean) {
    const result = await this.pool.query<{ image_data: Buffer; mime_type: string }>(
      `SELECT c.image_data, c.mime_type FROM product_photo_candidates c LEFT JOIN products p ON p.id=c.product_id
       WHERE c.id=$1 ${publicOnly ? "AND c.status='confirmada' AND p.image_url='/api/fotos-productos/' || c.id::text" : ""}`, [id])
    return result.rows[0] ?? null
  }
}
