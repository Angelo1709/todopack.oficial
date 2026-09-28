import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { and, asc, desc, eq, ilike, isNotNull, sql } from "drizzle-orm"
import { SyncKeyCard } from "@/components/admin/sync-key-card"
import { LinkProductButton, UnlinkProductButton } from "@/components/admin/sync-link-dialog"
import { SyncOptions } from "@/components/admin/sync-options"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { dateInAR, timeInAR } from "@/lib/admin-orders-utils"
import { db } from "@/lib/db"
import { products, stockSyncs, systemArticles } from "@/lib/db/schema"
import { formatDateAR } from "@/lib/dates"
import { formatPrice } from "@/lib/format"
import { isAdminRole, isSuperadmin } from "@/lib/roles"
import { getSessionUser } from "@/lib/session"
import { getSyncConfig } from "@/lib/settings"
import { SYNC_STALE_MINUTES } from "@/lib/stock-sync"
import { cn } from "@/lib/utils"
import { Boxes, Clock, Link2, MonitorOff, PackageX, RefreshCw, Search } from "lucide-react"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Sistema del local — Panel TodoPack",
}

const PAGE_SIZE = 30
const FILTERS = ["todos", "sin-stock", "con-stock"] as const
type StockFilter = (typeof FILTERS)[number]
const FILTER_LABEL: Record<StockFilter, string> = { todos: "Todos", "sin-stock": "Sin stock", "con-stock": "Con stock" }

type SearchParams = { q?: string; stock?: string; page?: string }

function href(params: { q: string; stock: StockFilter }, page = 1) {
  const qs = new URLSearchParams()
  if (params.q) qs.set("q", params.q)
  if (params.stock !== "todos") qs.set("stock", params.stock)
  if (page > 1) qs.set("page", String(page))
  const s = qs.toString()
  return s ? `/admin/sistema?${s}#vinculados` : "/admin/sistema#vinculados"
}

/** "hace 4 min" / "hace 2 h" / "hace 3 días". */
function agoLabel(minutes: number) {
  if (minutes < 1) return "hace menos de un minuto"
  if (minutes < 60) return `hace ${minutes} min`
  if (minutes < 60 * 24) return `hace ${Math.floor(minutes / 60)} h`
  const days = Math.floor(minutes / (60 * 24))
  return `hace ${days} ${days === 1 ? "día" : "días"}`
}

export default async function AdminSistemaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await getSessionUser()
  if (!user) redirect("/sign-in")
  if (!isAdminRole(user.role)) redirect("/")

  const sp = await searchParams
  const q = sp.q?.trim().slice(0, 100) ?? ""
  const stock = FILTERS.find((f) => f === sp.stock) ?? "todos"
  const requestedPage = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1)

  const linkedWhere = and(
    eq(products.active, true),
    q ? ilike(products.name, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined,
    stock === "sin-stock" ? sql`${systemArticles.stock} <= 0` : undefined,
    stock === "con-stock" ? sql`${systemArticles.stock} > 0` : undefined,
  )

  const [config, [lastSync], [counts], unlinked, [{ linkedTotal }]] = await Promise.all([
    getSyncConfig(),
    db.select().from(stockSyncs).orderBy(desc(stockSyncs.receivedAt)).limit(1),
    db
      .select({
        active: sql<number>`count(*)::int`,
        linked: sql<number>`count(${systemArticles.systemId})::int`,
        noStock: sql<number>`count(*) filter (where ${systemArticles.stock} <= 0)::int`,
      })
      .from(products)
      .leftJoin(systemArticles, eq(systemArticles.productId, products.id))
      .where(eq(products.active, true)),
    db
      .select({ id: products.id, name: products.name, price: products.price })
      .from(products)
      .leftJoin(systemArticles, eq(systemArticles.productId, products.id))
      .where(and(eq(products.active, true), sql`${systemArticles.systemId} is null`))
      .orderBy(asc(products.name))
      .limit(100),
    db
      .select({ linkedTotal: sql<number>`count(*)::int` })
      .from(products)
      .innerJoin(systemArticles, eq(systemArticles.productId, products.id))
      .where(linkedWhere),
  ])

  const totalPages = Math.max(1, Math.ceil(linkedTotal / PAGE_SIZE))
  const page = Math.min(requestedPage, totalPages)
  const linked = await db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      systemName: systemArticles.name,
      systemCode: systemArticles.code,
      stock: systemArticles.stock,
      linkSource: systemArticles.linkSource,
    })
    .from(products)
    .innerJoin(systemArticles, eq(systemArticles.productId, products.id))
    .where(linkedWhere)
    .orderBy(asc(products.name))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)

  const [{ systemArticlesTotal }] = await db
    .select({ systemArticlesTotal: sql<number>`count(*)::int` })
    .from(systemArticles)
    .where(lastSync ? eq(systemArticles.seenAt, lastSync.receivedAt) : isNotNull(systemArticles.seenAt))

  const minutesAgo = lastSync ? Math.floor((Date.now() - lastSync.receivedAt.getTime()) / 60_000) : null
  const stale = minutesAgo !== null && minutesAgo >= SYNC_STALE_MINUTES
  const lastLabel = lastSync
    ? `${formatDateAR(dateInAR(lastSync.receivedAt))} a las ${timeInAR(lastSync.receivedAt)}`
    : null

  const tiles = [
    {
      label: "Última sincronización",
      value: minutesAgo === null ? "Nunca" : agoLabel(minutesAgo),
      hint: lastLabel ?? "Todavía no llegaron datos",
      icon: Clock,
      alert: stale || minutesAgo === null,
    },
    {
      label: "Artículos del sistema",
      value: String(systemArticlesTotal),
      hint: lastSync?.source ? `Desde ${lastSync.source}` : undefined,
      icon: Boxes,
    },
    {
      label: "Productos vinculados",
      value: `${counts.linked} de ${counts.active}`,
      hint: "Activos en la tienda",
      icon: Link2,
    },
    {
      label: "Sin stock",
      value: String(counts.noStock),
      hint: config.stockInStore ? "No se pueden comprar" : "Sólo se ve en el panel",
      icon: PackageX,
    },
  ]

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="font-serif text-2xl font-bold">Sistema del local</h1>
        <p className="text-sm text-muted-foreground">
          Stock y precios que manda el sistema de gestión de la PC del local, cada 10 minutos.
        </p>
      </div>

      {minutesAgo === null ? (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <RefreshCw className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-semibold">Todavía no llegaron datos del sistema del local</p>
            <p className="text-muted-foreground">
              {config.syncKeyHash
                ? "Instalá el sincronizador en la PC del local con el config.txt que descargaste al generar la clave."
                : "Primero generá la clave (abajo, sólo superadmin) y después instalá el sincronizador en la PC del local."}
            </p>
          </div>
        </div>
      ) : (
        stale && (
          <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <MonitorOff className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="text-sm">
              <p className="font-semibold">Hace {agoLabel(minutesAgo).replace("hace ", "")} que no llegan datos</p>
              <p className="text-muted-foreground">
                Revisá que la PC del local esté prendida y con internet. Mientras tanto, la tienda usa el último stock y
                los últimos precios que llegaron.
              </p>
            </div>
          </div>
        )
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <t.icon className={cn("size-4 shrink-0", t.alert && "text-destructive")} />
              <span className="text-xs leading-tight">{t.label}</span>
            </div>
            <p className="mt-2 text-xl font-bold tabular-nums">{t.value}</p>
            {t.hint && <p className="text-xs text-muted-foreground">{t.hint}</p>}
          </div>
        ))}
      </div>

      <SyncOptions stockInStore={config.stockInStore} pricesFromSystem={config.pricesFromSystem} />

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 font-semibold">
          Productos sin vincular <span className="tabular-nums text-muted-foreground">({counts.active - counts.linked})</span>
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          No aparecen en el sistema del local con el mismo nombre. Se venden sin control de stock y con el precio de la
          tienda. Vinculalos a mano con el artículo que corresponde.
        </p>
        {unlinked.length === 0 ? (
          <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            {lastSync ? "Todos los productos activos están vinculados." : "Se completa cuando llegue la primera sincronización."}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {unlinked.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{formatPrice(p.price)} en la tienda</p>
                </div>
                {lastSync && <LinkProductButton product={p} />}
              </li>
            ))}
          </ul>
        )}
        {counts.active - counts.linked > unlinked.length && (
          <p className="mt-2 text-xs text-muted-foreground">Se muestran los primeros {unlinked.length}.</p>
        )}
      </section>

      <section id="vinculados" className="scroll-mt-24 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 font-semibold">Vinculados</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Stock y precio que tiene cada producto según el sistema del local.
        </p>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <form action="/admin/sistema" className="flex min-w-0 flex-1 gap-2">
            {stock !== "todos" && <input type="hidden" name="stock" value={stock} />}
            <Input
              name="q"
              defaultValue={q}
              placeholder="Buscar producto..."
              aria-label="Buscar producto vinculado"
              className="h-9 min-w-0 flex-1"
            />
            <Button type="submit" variant="outline" className="h-9 px-3">
              <Search />
              Buscar
            </Button>
          </form>
          <div role="group" aria-label="Stock" className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
            {FILTERS.map((f) => (
              <Link
                key={f}
                href={href({ q, stock: f })}
                scroll={false}
                aria-current={stock === f ? "true" : undefined}
                className={cn(
                  "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors",
                  stock === f
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {FILTER_LABEL[f]}
              </Link>
            ))}
          </div>
        </div>

        {linked.length === 0 ? (
          <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            {lastSync ? "No hay productos vinculados con estos filtros." : "Todavía no llegaron datos del sistema."}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {linked.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                <div className="min-w-0 flex-1 basis-60">
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    En el sistema: {p.systemName}
                    {p.systemCode && <span className="tabular-nums"> · cód. {p.systemCode}</span>}
                    {p.linkSource === "manual" && " · vinculado a mano"}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{formatPrice(p.price)}</span>
                {p.stock > 0 ? (
                  <Badge variant="secondary" className="tabular-nums">
                    Stock {p.stock}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="tabular-nums">
                    Sin stock{p.stock < 0 ? ` (${p.stock})` : ""}
                  </Badge>
                )}
                <UnlinkProductButton product={p} />
              </li>
            ))}
          </ul>
        )}
        {totalPages > 1 && (
          <nav className="mt-3 flex items-center justify-center gap-3" aria-label="Paginación">
            <Button
              variant="outline"
              size="sm"
              render={<Link href={href({ q, stock }, page - 1)} scroll={false} />}
              nativeButton={false}
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
              render={<Link href={href({ q, stock }, page + 1)} scroll={false} />}
              nativeButton={false}
              className={page >= totalPages ? "pointer-events-none opacity-50" : undefined}
            >
              Siguiente
            </Button>
          </nav>
        )}
      </section>

      {isSuperadmin(user.role) && <SyncKeyCard hasKey={Boolean(config.syncKeyHash)} />}
    </div>
  )
}
