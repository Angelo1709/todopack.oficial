import Link from "next/link"
import { db } from "@/lib/db"
import { products } from "@/lib/db/schema"
import { and, asc, eq, ilike, isNull, sql } from "drizzle-orm"
import { CatalogToolbar } from "@/components/admin/catalog-toolbar"
import { ProductFilters, type ProductStatusFilter } from "@/components/admin/product-filters"
import { ProductList, type AdminProductRow } from "@/components/admin/product-list"
import { Button } from "@/components/ui/button"
import { isCategory } from "@/lib/categorize"
import { presentationLabel, unitPrice } from "@/lib/pack"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 30
const STATUSES: ProductStatusFilter[] = ["activos", "inactivos", "sin-imagen", "todos"]

type SearchParams = { q?: string; categoria?: string; estado?: string; page?: string }

function statusFilter(estado: ProductStatusFilter) {
  if (estado === "activos") return eq(products.active, true)
  if (estado === "inactivos") return eq(products.active, false)
  if (estado === "sin-imagen") return and(eq(products.active, true), isNull(products.imageUrl))
  return undefined
}

function pageHref(params: { q: string; categoria: string; estado: ProductStatusFilter }, page: number) {
  const qs = new URLSearchParams()
  if (params.q) qs.set("q", params.q)
  if (params.categoria) qs.set("categoria", params.categoria)
  if (params.estado !== "activos") qs.set("estado", params.estado)
  if (page > 1) qs.set("page", String(page))
  const s = qs.toString()
  return s ? `/admin/productos?${s}` : "/admin/productos"
}

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams
  const q = sp.q?.trim().slice(0, 100) ?? ""
  const categoria = sp.categoria && isCategory(sp.categoria) ? sp.categoria : ""
  const estado = STATUSES.find((s) => s === sp.estado) ?? "activos"
  const requestedPage = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1)

  const where = and(
    q ? ilike(products.name, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined,
    categoria ? eq(products.category, categoria) : undefined,
    statusFilter(estado),
  )

  const [[{ total }], [stats]] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(products).where(where),
    db
      .select({
        active: sql<number>`count(*) filter (where ${products.active})::int`,
        inactive: sql<number>`count(*) filter (where not ${products.active})::int`,
        withoutImage: sql<number>`count(*) filter (where ${products.active} and ${products.imageUrl} is null)::int`,
        grouped: sql<number>`count(distinct ${products.groupKey}) filter (where ${products.active})::int`,
      })
      .from(products),
  ])
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(requestedPage, totalPages)

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      category: products.category,
      packSize: products.packSize,
      groupKey: products.groupKey,
      imageUrl: products.imageUrl,
      active: products.active,
      groupSize: sql<number>`(select count(*)::int from products p2 where p2.group_key = ${products.groupKey})`,
    })
    .from(products)
    .where(where)
    .orderBy(asc(products.name))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)

  const list: AdminProductRow[] = rows.map((p) => ({
    ...p,
    groupSize: Number(p.groupSize) || 1,
    label: presentationLabel(p.name, p.packSize),
    unitPrice: unitPrice(p.price, p.packSize),
  }))
  const filters = { q, categoria, estado }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold">Productos</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {stats.active} activos · {stats.inactive} inactivos · {stats.withoutImage} sin imagen · {stats.grouped}{" "}
            artículos en la tienda
          </p>
        </div>
        <CatalogToolbar />
      </div>

      <ProductFilters key={`${q}|${categoria}|${estado}`} {...filters} total={total} />

      <ProductList products={list} />

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-3" aria-label="Paginación">
          <Button
            variant="outline"
            size="sm"
            render={<Link href={pageHref(filters, page - 1)} />}
            nativeButton={false}
            disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            render={<Link href={pageHref(filters, page + 1)} />}
            nativeButton={false}
            disabled={page >= totalPages}
            className={page >= totalPages ? "pointer-events-none opacity-50" : undefined}
          >
            Siguiente
          </Button>
        </nav>
      )}
    </div>
  )
}
