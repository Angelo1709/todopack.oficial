import Link from "next/link"
import { pool } from "@/lib/db"
import { getSessionUser } from "@/lib/session"
import { isAdminRole } from "@/lib/roles"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export const dynamic = "force-dynamic"
const PAGE_SIZE = 40
type Params = { q?: string; estado?: string; page?: string }
type Row = {
  article_id: number; code: string; name: string; quantity: number
  updated_at: Date; current: boolean; linked: number; differences: number
  web: { id: number; name: string; quantity: number | null; active: boolean }[]
}
const date = (value: Date) => value.toLocaleString("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires", hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
})

export default async function StockPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getSessionUser()
  if (!user) redirect("/sign-in")
  if (!isAdminRole(user.role)) redirect("/")
  const sp = await searchParams
  const q = sp.q?.trim().slice(0, 100) ?? ""
  const estado = ["positivo", "agotado", "sin-vincular", "diferencias"].includes(sp.estado ?? "") ? sp.estado! : "todos"
  const requestedPage = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1)
  const [stateResult, countsResult] = await Promise.all([
    pool.query("SELECT * FROM stock_sync_state WHERE id=1"),
    pool.query(`SELECT count(*)::int total, count(*) FILTER(WHERE quantity>0)::int positive,
      count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM products p WHERE p.gestion_article_id=g.article_id))::int unlinked
      FROM gestion_stock g WHERE snapshot_id=(SELECT snapshot_id FROM stock_sync_state WHERE id=1)`),
  ])
  const state = stateResult.rows[0]
  const counts = countsResult.rows[0]
  const stale = !state || Date.now() - new Date(state.received_at).getTime() > 15 * 60_000
  const base = `WITH inventory AS (
    SELECT g.*, g.snapshot_id=s.snapshot_id AS current,
      count(p.id)::int AS linked,
      count(p.id) FILTER(WHERE p.stock_quantity IS DISTINCT FROM g.quantity)::int AS differences,
      coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'quantity',p.stock_quantity,'active',p.active)
        ORDER BY p.name) FILTER(WHERE p.id IS NOT NULL),'[]'::jsonb) AS web
    FROM gestion_stock g LEFT JOIN stock_sync_state s ON s.id=1
    LEFT JOIN products p ON p.gestion_article_id=g.article_id
    GROUP BY g.article_id,s.snapshot_id
  )`
  const conditions = ["(name ILIKE $1 OR code ILIKE $1 OR article_id::text=$2)"]
  if (estado === "positivo") conditions.push("quantity>0 AND current")
  if (estado === "agotado") conditions.push("quantity<=0")
  if (estado === "sin-vincular") conditions.push("linked=0")
  if (estado === "diferencias") conditions.push("differences>0")
  const where = conditions.join(" AND ")
  const args = [`%${q.replace(/[\\%_]/g, "\\$&")}%`, q]
  const totalResult = await pool.query(`${base} SELECT count(*)::int total FROM inventory WHERE ${where}`, args)
  const total = totalResult.rows[0].total as number
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE)), page = Math.min(requestedPage, pages)
  const rows = (await pool.query<Row>(`${base} SELECT * FROM inventory WHERE ${where} ORDER BY name,article_id LIMIT $3 OFFSET $4`, [...args,PAGE_SIZE,(page-1)*PAGE_SIZE])).rows
  function href(next: number) {
    const params = new URLSearchParams({ q, estado, page: String(next) })
    return `/admin/stock?${params}`
  }
  return <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="font-serif text-2xl font-bold">Control de stock</h1>
        <p className="text-sm text-muted-foreground">Compará lo recibido de Gestión con las cantidades de la web.</p></div>
      <Button render={<Link href={href(page)} />} nativeButton={false} variant="outline">Actualizar vista</Button>
    </div>
    <section className="rounded-xl border border-border bg-card p-4 text-sm">
      <p className={stale ? "font-semibold text-destructive" : "font-semibold"}>
        {!state ? "Todavía no se recibió stock" : stale ? "Sincronización atrasada: revisá la PC del local" : "Sincronización al día"}
      </p>
      {state && <><p>Última lectura en la PC: {date(new Date(state.captured_at))}</p>
        <p>Recibida en la nube: {date(new Date(state.received_at))} · Origen: {state.source_id}</p></>}
      <p className="mt-2 text-muted-foreground">Actualización cada 5 minutos. La cantidad corresponde al artículo tal como lo guarda Gestión; hoy cada presentación puede tener su propio stock.</p>
    </section>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[["Artículos recibidos",counts.total],["Con stock",counts.positive],["Sin producto web",counts.unlinked],["Presentaciones vinculadas",state?.matched_products ?? 0]].map(([label,value]) =>
        <div key={label} className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-bold tabular-nums">{value}</p></div>)}
    </div>
    <form className="flex flex-wrap gap-2" action="/admin/stock">
      <Input name="q" defaultValue={q} placeholder="Nombre, código o ID de Gestión" aria-label="Buscar stock" className="min-w-48 flex-1" />
      <select name="estado" defaultValue={estado} aria-label="Filtrar stock" className="rounded-lg border border-border bg-card px-3 text-sm">
        <option value="todos">Todos</option><option value="positivo">Con stock</option><option value="agotado">Cero o negativo</option>
        <option value="sin-vincular">Sin producto web</option><option value="diferencias">Cantidades diferentes</option>
      </select><Button type="submit">Buscar</Button>
    </form>
    <p className="text-sm text-muted-foreground">{total} resultados · Los artículos nuevos de Gestión aparecen acá aunque todavía no tengan un producto en la web.</p>
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {rows.map(row => <li key={row.article_id} className="p-4">
        <div className="flex flex-wrap justify-between gap-2"><div><p className="text-sm font-semibold">{row.name}</p>
          <p className="text-xs text-muted-foreground">Gestión #{row.article_id} · Código: {row.code || "sin código"}</p></div>
          <p className="text-sm font-semibold tabular-nums">Stock Gestión: {row.quantity.toLocaleString("es-AR")}</p></div>
        {!row.current && <p className="mt-1 text-sm text-destructive">Ausente en la última lectura; stock puesto en cero.</p>}
        {!row.linked && <p className="mt-2 text-sm text-muted-foreground">Sin producto vinculado en la web.</p>}
        {row.web.map(p => <div key={p.id} className="mt-2 rounded-lg bg-muted p-3 text-sm">
          <Link href={`/admin/productos?q=${encodeURIComponent(p.name)}&estado=todos`} className="underline">{p.name}</Link>
          <p className="tabular-nums">Stock web: {p.quantity === null ? "desconocido" : p.quantity.toLocaleString("es-AR")} · {p.quantity === row.quantity ? "Coincide" : "Cantidad diferente"}
            {!p.active ? " · Desactivado manualmente" : (p.quantity ?? 0) <= 0 ? " · Oculto por stock" : " · Con stock disponible"}</p>
        </div>)}
        <p className="mt-2 text-xs text-muted-foreground">Última actualización: {date(new Date(row.updated_at))}</p>
      </li>)}
      {!rows.length && <li className="p-8 text-center text-muted-foreground">No hay artículos con estos filtros.</li>}
    </ul>
    <div className="flex items-center justify-center gap-4 text-sm">
      {page>1 && <Link href={href(page-1)} className="underline">Anterior</Link>}
      <span>Página {page} de {pages}</span>{page<pages && <Link href={href(page+1)} className="underline">Siguiente</Link>}
    </div>
  </div>
}
