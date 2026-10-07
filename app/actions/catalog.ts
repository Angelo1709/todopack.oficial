"use server"

import { db } from "@/lib/db"
import { products } from "@/lib/db/schema"
import { requireAdmin } from "@/lib/session"
import { categorize, isCategory } from "@/lib/categorize"
import { normalizeGroupKey, parsePresentation, presentationLabel, unitPrice } from "@/lib/pack"
import { nameKey } from "@/lib/price-list"
import { persistImage } from "@/lib/storage"
import { and, asc, eq, gt, ilike, isNull, ne, notInArray, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { linkPresentationPair,separatePresentation,PresentationLinkError } from "@/lib/presentation-links"

// Los errores esperables se devuelven como { ok: false, error } (en producción Next oculta
// el mensaje de las excepciones que salen de una server action).
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const MAX_NAME = 200
const MAX_PRICE = 100_000_000
const MAX_PACK = 1000
const MAX_IMPORT_ROWS = 5000

function revalidateCatalog() {
  revalidatePath("/")
  revalidatePath("/admin/productos")
  revalidatePath("/admin/fotos")
}

function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, "\\$&")}%`
}

function isUniqueViolation(e: unknown) {
  const err = e as { code?: string; cause?: { code?: string } }
  return err?.code === "23505" || err?.cause?.code === "23505"
}

// ---------------------------------------------------------------------------
// Importación de la lista de precios (Excel)
// ---------------------------------------------------------------------------

export type ImportRow = { name: string; price: number }

type CleanRow = { key: string; name: string; price: number }

type ExistingProduct = {
  id: number
  name: string
  price: number
  active: boolean
  category: string
  packSize: number
  groupKey: string | null
}

function cleanRows(rows: ImportRow[]): { rows: CleanRow[]; skipped: number } {
  if (!Array.isArray(rows)) return { rows: [], skipped: 0 }
  const byKey = new Map<string, CleanRow>()
  let skipped = 0
  for (const r of rows.slice(0, MAX_IMPORT_ROWS)) {
    const name = String(r?.name ?? "").trim()
    const price = Math.round(Number(r?.price))
    if (!name || name.length > MAX_NAME || !Number.isFinite(price) || price <= 0 || price > MAX_PRICE) {
      skipped++
      continue
    }
    const key = nameKey(name)
    if (byKey.has(key)) skipped++ // nombre repetido en la lista: vale la última fila
    byKey.set(key, { key, name, price })
  }
  return { rows: [...byKey.values()], skipped: skipped + Math.max(0, rows.length - MAX_IMPORT_ROWS) }
}

async function loadExisting(executor: Pick<typeof db, "select"> = db): Promise<Map<string, ExistingProduct>> {
  const rows = await executor
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      active: products.active,
      category: products.category,
      packSize: products.packSize,
      groupKey: products.groupKey,
    })
    .from(products)
  return new Map(rows.map((p) => [nameKey(p.name), p]))
}

export type ImportPreviewStatus = "nuevo" | "actualiza" | "sin_cambios"

export type ImportPreviewRow = {
  name: string
  price: number
  status: ImportPreviewStatus
  previousPrice: number | null
  /** Existe pero estaba desactivado: se vuelve a activar. */
  reactivates: boolean
  /** Existe sin clasificar (group_key vacío): toma categoría y presentación detectadas. */
  classifies: boolean
  packSize: number
  label: string
  unitPrice: number
  category: string
}

export type ImportPreview = {
  rows: ImportPreviewRow[]
  skipped: number
  counts: Record<ImportPreviewStatus, number>
  /** Productos activos que no están en la lista (se pueden desactivar). */
  missingActive: number
}

/** Compara la lista contra la base sin modificar nada. */
export async function previewImport(rows: ImportRow[]): Promise<ActionResult<ImportPreview>> {
  await requireAdmin()
  const { rows: clean, skipped } = cleanRows(rows)
  if (!clean.length) return { ok: false, error: "No encontramos filas con nombre y precio válidos." }

  const existing = await loadExisting()
  const matched = new Set<number>()
  const counts: Record<ImportPreviewStatus, number> = { nuevo: 0, actualiza: 0, sin_cambios: 0 }

  const previewRows = clean.map((r): ImportPreviewRow => {
    const ex = existing.get(r.key)
    if (ex) matched.add(ex.id)
    const classifies = Boolean(ex && ex.groupKey === null)
    // Para existentes ya clasificados se muestran sus valores (la importación no los cambia).
    const detected = parsePresentation(ex?.name ?? r.name)
    const packSize = ex && !classifies ? ex.packSize : detected.packSize
    const category = ex && !classifies ? ex.category : categorize(ex?.name ?? r.name)
    const status: ImportPreviewStatus = !ex
      ? "nuevo"
      : ex.price !== r.price || !ex.active || classifies
        ? "actualiza"
        : "sin_cambios"
    counts[status]++
    return {
      name: r.name,
      price: r.price,
      status,
      previousPrice: ex ? ex.price : null,
      reactivates: Boolean(ex && !ex.active),
      classifies,
      packSize,
      label: presentationLabel(ex?.name ?? r.name, packSize),
      unitPrice: unitPrice(r.price, packSize),
      category,
    }
  })

  let missingActive = 0
  for (const ex of existing.values()) if (ex.active && !matched.has(ex.id)) missingActive++

  return { ok: true, rows: previewRows, skipped, counts, missingActive }
}

export type ImportResult = {
  inserted: number
  updated: number
  unchanged: number
  deactivated: number
  skipped: number
}

/**
 * Importa la lista en una transacción con upserts en lote:
 * - nuevos: se insertan con categoría, pack y grupo detectados;
 * - existentes: se actualiza el precio y se reactivan, sin pisar categoría, pack ni grupo
 *   (pueden estar corregidos a mano), salvo los nunca clasificados (group_key NULL);
 * - opcional: se desactivan los productos activos que no están en la lista.
 */
export async function importProducts(
  rows: ImportRow[],
  options: { deactivateMissing?: boolean } = {},
): Promise<ActionResult<ImportResult>> {
  await requireAdmin()
  const { rows: clean, skipped } = cleanRows(rows)
  if (!clean.length) return { ok: false, error: "No encontramos filas con nombre y precio válidos." }

  const result = await db.transaction(async (tx) => {
    const existing = await loadExisting(tx)
    const values: (typeof products.$inferInsert)[] = []
    const keepNames: string[] = []
    let inserted = 0
    let updated = 0
    let unchanged = 0

    for (const r of clean) {
      const ex = existing.get(r.key)
      // Si ya existe se usa el nombre de la base (puede diferir en espacios o mayúsculas).
      const name = ex?.name ?? r.name
      keepNames.push(name)
      if (ex && ex.price === r.price && ex.active && ex.groupKey !== null) {
        unchanged++
        continue
      }
      if (ex) updated++
      else inserted++
      const detected = parsePresentation(name)
      values.push({
        name,
        price: r.price,
        category: categorize(name),
        packSize: detected.packSize,
        groupKey: detected.groupKey,
      })
    }

    for (let i = 0; i < values.length; i += 500) {
      await tx
        .insert(products)
        .values(values.slice(i, i + 500))
        .onConflictDoUpdate({
          target: products.name,
          set: {
            price: sql`excluded.price`,
            active: true,
            updatedAt: sql`now()`,
            // Solo los nunca clasificados (group_key NULL) toman lo detectado.
            category: sql`case when ${products.groupKey} is null then excluded.category else ${products.category} end`,
            packSize: sql`case when ${products.groupKey} is null then excluded.pack_size else ${products.packSize} end`,
            groupKey: sql`coalesce(${products.groupKey}, excluded.group_key)`,
          },
        })
    }

    let deactivated = 0
    if (options.deactivateMissing) {
      const off = await tx
        .update(products)
        .set({ active: false, updatedAt: new Date() })
        .where(and(eq(products.active, true), notInArray(products.name, keepNames)))
        .returning({ id: products.id })
      deactivated = off.length
    }

    return { inserted, updated, unchanged, deactivated }
  })

  revalidateCatalog()
  return { ok: true, ...result, skipped }
}

// ---------------------------------------------------------------------------
// ABM de productos (no se borran: se desactivan)
// ---------------------------------------------------------------------------

export type ProductInput = {
  id?: number | null
  name: string
  price: number
  category: string
  packSize: number
  groupKey: string
  imageUrl: string
  active: boolean
  /** Vincular un unitario y un pack con equivalencia explícita. */
  linkToId?: number | null
  linkCurrentIsPack?: boolean
  linkPackSize?: number
}

const INTERNAL_PHOTO = /^\/api\/fotos-productos\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i
function validImageUrl(url: string) {
  if (INTERNAL_PHOTO.test(url)) return true
  try {
    const u = new URL(url)
    return (u.protocol === "https:" || u.protocol === "http:") && url.length <= 2000
  } catch {
    return false
  }
}

export async function saveProduct(input: ProductInput): Promise<ActionResult<{ id: number }>> {
  await requireAdmin()

  const id = input.id ? Number(input.id) : null
  if (id !== null && (!Number.isInteger(id) || id <= 0)) return { ok: false, error: "Producto inválido." }
  const name = String(input.name ?? "").trim()
  if (!name) return { ok: false, error: "Escribí el nombre del producto." }
  if (name.length > MAX_NAME) return { ok: false, error: `El nombre puede tener hasta ${MAX_NAME} caracteres.` }
  const price = Number(input.price)
  if (!Number.isInteger(price) || price <= 0 || price > MAX_PRICE) {
    return { ok: false, error: "El precio tiene que ser un número entero mayor a 0 (en pesos, sin centavos)." }
  }
  const category = String(input.category ?? "")
  if (!isCategory(category)) return { ok: false, error: "Elegí una categoría de la lista." }
  const packSize = Number(input.packSize)
  if (!Number.isInteger(packSize) || packSize < 1 || packSize > MAX_PACK) {
    return { ok: false, error: `Las unidades por presentación van de 1 a ${MAX_PACK}.` }
  }
  const imageInput = String(input.imageUrl ?? "").trim()
  if (imageInput && !validImageUrl(imageInput)) {
    return { ok: false, error: "La URL de la imagen tiene que empezar con https:// (o http://)." }
  }
  const linkToId = input.linkToId ? Number(input.linkToId) : null
  if (linkToId !== null && (!Number.isSafeInteger(linkToId)||linkToId<1||linkToId===id)) return {ok:false,error:"Elegí otro producto válido para vincular."}
  const currentIsPack=input.linkCurrentIsPack ?? packSize>1
  const linkedPackSize=Number(input.linkPackSize ?? packSize)
  if (linkToId && (!Number.isInteger(linkedPackSize)||linkedPackSize<2||linkedPackSize>MAX_PACK)) return {ok:false,error:"Indicá cuántas unidades trae el pack: entre 2 y 1.000."}

  try {
    const savedId = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(9137301)`)
      const [current] = id
        ? await tx.select({ id: products.id, imageUrl: products.imageUrl }).from(products).where(eq(products.id, id))
        : []
      if (id && !current) throw new Error("NOT_FOUND")

      // El grupo nunca queda vacío: si no se indica, se calcula a partir del nombre.
      let groupKey = normalizeGroupKey(input.groupKey ?? "")
      if (!groupKey) groupKey = parsePresentation(name).groupKey || normalizeGroupKey(name)

      let imageUrl: string | null = imageInput || null
      if (imageUrl && INTERNAL_PHOTO.test(imageUrl)) {
        const photo=await tx.execute(sql`SELECT id FROM product_photo_candidates WHERE id=${imageUrl.split("/").pop()}::uuid AND status='confirmada'`)
        if (!photo.rows.length) throw new PresentationLinkError("La foto ya no está confirmada. Recargá el producto antes de guardar.")
      } else if (imageUrl && imageUrl !== current?.imageUrl) {
        imageUrl = await persistImage(imageUrl, `${id ?? "nuevo"}-${name}`)
      }

      const values = { name, price, category, packSize:linkToId ? (currentIsPack ? linkedPackSize : 1) : packSize, groupKey, imageUrl, active: Boolean(input.active) }
      let savedId:number
      if (id) {
        await tx
          .update(products)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(products.id, id))
        savedId=id
      } else {
        const [row] = await tx.insert(products).values(values).returning({ id: products.id })
        savedId=row.id
      }
      if (linkToId) await linkPresentationPair(tx,{unitId:currentIsPack ? linkToId : savedId,packId:currentIsPack ? savedId : linkToId,packSize:linkedPackSize})
      return savedId
    })
    revalidateCatalog()
    return { ok: true, id: savedId }
  } catch (e) {
    if (e instanceof PresentationLinkError) return {ok:false,error:e.message}
    if (isUniqueViolation(e)) return { ok: false, error: "Ya existe otro producto con ese nombre." }
    const message = e instanceof Error ? e.message : ""
    if (message === "NOT_FOUND") return { ok: false, error: "El producto ya no existe." }
    if (message === "LINK_NOT_FOUND") return { ok: false, error: "No encontramos el producto a vincular." }
    if (message === "La URL no devolvió una imagen") return { ok: false, error: "La URL no devolvió una imagen." }
    throw e
  }
}

/** Deshacer la agrupación conserva el precio, la cantidad del pack y la foto. */
export async function unlinkProductPresentation(id:number):Promise<ActionResult> {
  await requireAdmin()
  try {await db.transaction(tx=>separatePresentation(tx,id));revalidateCatalog();return {ok:true}}
  catch(e) {if(e instanceof PresentationLinkError)return {ok:false,error:e.message};throw e}
}

export async function setProductActive(id: number, active: boolean): Promise<ActionResult> {
  await requireAdmin()
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Producto inválido." }
  const rows = await db
    .update(products)
    .set({ active: Boolean(active), updatedAt: new Date() })
    .where(eq(products.id, id))
    .returning({ id: products.id })
  if (!rows.length) return { ok: false, error: "El producto ya no existe." }
  revalidateCatalog()
  return { ok: true }
}

export type ProductOption = {
  id: number
  name: string
  price: number
  packSize: number
  label: string
  groupKey: string | null
  active: boolean
}

function toOption(p: Omit<ProductOption, "label">): ProductOption {
  return { ...p, label: presentationLabel(p.name, p.packSize) }
}

const optionColumns = {
  id: products.id,
  name: products.name,
  price: products.price,
  packSize: products.packSize,
  groupKey: products.groupKey,
  active: products.active,
}

/** Buscador para "vincular con otro producto". */
export async function searchProductsForLink(query: string, excludeId?: number | null): Promise<ProductOption[]> {
  await requireAdmin()
  const q = String(query ?? "").trim()
  if (q.length < 2) return []
  const rows = await db
    .select(optionColumns)
    .from(products)
    .where(and(eq(products.active,true),ilike(products.name, likePattern(q)), excludeId ? ne(products.id, Number(excludeId)) : undefined))
    .orderBy(asc(products.name))
    .limit(8)
  return rows.map(toOption)
}

/** Presentaciones de un grupo (para ver en el diálogo de edición). */
export async function getProductGroup(groupKey: string): Promise<ProductOption[]> {
  await requireAdmin()
  const key = normalizeGroupKey(groupKey ?? "")
  if (!key) return []
  const rows = await db
    .select(optionColumns)
    .from(products)
    .where(eq(products.groupKey, key))
    .orderBy(asc(products.packSize), asc(products.price))
    .limit(30)
  return rows.map(toOption)
}

// ---------------------------------------------------------------------------
// Búsqueda automática de imágenes
// ---------------------------------------------------------------------------

const imageHeaders = { "User-Agent": "TodoPack product catalog importer/1.0 (admin tool)" }

async function findProductImage(name: string) {
  const offUrl = new URL("https://world.openfoodfacts.org/cgi/search.pl")
  offUrl.search = new URLSearchParams({
    action: "process",
    json: "1",
    page_size: "5",
    search_terms: name,
    fields: "product_name,image_front_url,image_url",
  }).toString()
  const offResponse = await fetch(offUrl, { headers: imageHeaders, cache: "no-store" })
  if (offResponse.ok) {
    const data = await offResponse.json()
    const match = data.products?.find((product: { image_front_url?: string; image_url?: string }) =>
      Boolean(product.image_front_url || product.image_url),
    )
    if (match) return match.image_front_url || match.image_url
  }

  const commonsUrl = new URL("https://commons.wikimedia.org/w/api.php")
  commonsUrl.search = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `${name} product`,
    gsrnamespace: "6",
    gsrlimit: "5",
    prop: "imageinfo",
    iiprop: "url|mime|size",
    iiurlwidth: "900",
    format: "json",
    origin: "*",
  }).toString()
  const commonsResponse = await fetch(commonsUrl, { headers: imageHeaders, cache: "no-store" })
  if (!commonsResponse.ok) return null
  const data = await commonsResponse.json()
  const pages = Object.values(data.query?.pages ?? {}) as Array<{
    title: string
    imageinfo?: Array<{ thumburl?: string; mime?: string; size?: number }>
  }>
  const match = pages.find((page) => {
    const info = page.imageinfo?.[0]
    return Boolean(
      info?.thumburl &&
        info.mime?.startsWith("image/") &&
        (info.size ?? 0) < 10_000_000 &&
        !/logo|icon|flag|map|screenshot/i.test(page.title),
    )
  })
  return match?.imageinfo?.[0]?.thumburl ?? null
}

/**
 * Busca imágenes para un lote de productos activos sin imagen con id > afterId.
 * El cliente guarda el cursor (nextAfterId) para no reintentar siempre los mismos sin resultado.
 */
export type ImageBatchResult = {
  scanned: number
  imported: Array<{ id: number; name: string }>
  notFound: Array<{ id: number; name: string }>
  /** Cursor para el próximo lote (0 = volver a empezar). */
  nextAfterId: number
  done: boolean
}

export async function importMissingProductImages(batchSize = 20, afterId = 0): Promise<ActionResult<ImageBatchResult>> {
  await requireAdmin()
  const safeBatchSize = Math.min(Math.max(Math.floor(batchSize), 1), 30)
  const cursor = Number.isInteger(afterId) && afterId > 0 ? afterId : 0
  const missing = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(and(eq(products.active, true), isNull(products.imageUrl), gt(products.id, cursor)))
    .orderBy(products.id)
    .limit(safeBatchSize)

  const imported: Array<{ id: number; name: string }> = []
  const notFound: Array<{ id: number; name: string }> = []

  for (const product of missing) {
    try {
      // Se busca por el nombre sin la presentación ("COCA COLA 1.5L", no "... PACK X6").
      const sourceUrl = await findProductImage(parsePresentation(product.name).baseName)
      if (!sourceUrl) {
        notFound.push(product)
        continue
      }
      const imageUrl = await persistImage(sourceUrl, `${product.id}-${product.name}`)
      await db
        .update(products)
        .set({ imageUrl, updatedAt: new Date() })
        .where(and(eq(products.id, product.id), isNull(products.imageUrl)))
      imported.push(product)
    } catch {
      notFound.push(product)
    }
  }

  if (imported.length) revalidateCatalog()
  const done = missing.length < safeBatchSize
  return {
    ok: true,
    scanned: missing.length,
    imported,
    notFound,
    nextAfterId: done ? 0 : missing[missing.length - 1].id,
    done,
  }
}
