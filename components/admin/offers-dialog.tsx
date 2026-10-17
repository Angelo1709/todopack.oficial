"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { listOffers, saveOffer, searchOfferProducts, toggleOffer } from "@/app/actions/offers"
import { offerLabel, offerTerms, type Offer } from "@/lib/offers"
import { presentationLabel } from "@/lib/pack"
import { formatPrice } from "@/lib/format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tag } from "lucide-react"
import { toast } from "sonner"

type Row = Awaited<ReturnType<typeof listOffers>>[number]
const initial: Offer = { title: "Oferta especial", kind: "percent", percent: 20, buy: 2, pay: 1, active: true }

export function OffersDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [results, setResults] = useState<Row[]>([])
  const [selected, setSelected] = useState<Row[]>([])
  const [query, setQuery] = useState("")
  const [form, setForm] = useState<Offer>(initial)
  const [pending, startTransition] = useTransition()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState("")

  async function reload() { setRows(await listOffers()) }
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true); setError("")
    listOffers().then((r) => { if (!cancelled) setRows(r) }).catch(() => { if (!cancelled) setError("No pudimos cargar las ofertas. Cerrá y volvé a abrir para reintentar.") }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open])
  useEffect(() => {
    let cancelled = false
    setResults([]); setSearchError(""); setSearching(query.trim().length >= 2)
    if (query.trim().length < 2) return
    const timer = setTimeout(() => {
      searchOfferProducts(query).then((r) => { if (!cancelled) setResults(r) }).catch(() => { if (!cancelled) setSearchError("No pudimos buscar productos. Probá de nuevo.") }).finally(() => { if (!cancelled) setSearching(false) })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])

  function run(action: () => Promise<void>) {
    startTransition(async () => { try { await action() } catch { toast.error("No pudimos guardar. Revisá tu conexión y probá de nuevo.") } })
  }
  function edit(row: Row) {
    setSelected([row]); setForm(row.offer ?? initial); setQuery(""); setResults([])
  }

  return <>
    <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}><Tag className="size-4" /> Gestionar ofertas</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Ofertas y descuentos</DialogTitle>
          <DialogDescription>Creá promociones por presentación y activalas cuando quieras. Cada presentación tiene una oferta; una nueva reemplaza la anterior.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-2">
          <form className="flex min-w-0 flex-col gap-3" onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              const result = await saveOffer(selected.map((r) => r.id), form)
              if (!result.ok) return void toast.error(result.error)
              toast.success(form.active ? "Oferta guardada y activa" : "Oferta guardada en pausa")
              setSelected([]); setForm(initial); setQuery(""); await reload(); router.refresh()
            })
          }}>
            <h2 className="font-semibold">Crear o editar oferta</h2>
            <label className="flex flex-col gap-1.5 text-sm">Título<Input value={form.title} maxLength={80} required disabled={pending} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-2">
              {(["percent", "bundle"] as const).map((kind) => <Button key={kind} type="button" disabled={pending} variant={form.kind === kind ? "default" : "outline"} onClick={() => setForm({ ...form, kind })}>{kind === "percent" ? "% de descuento" : "Llevás / pagás"}</Button>)}
            </div>
            {form.kind === "percent" ? <label className="flex flex-col gap-1.5 text-sm">Descuento (%)<Input type="number" min={1} max={99} required disabled={pending} value={form.percent} onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })} /></label> : <>
              <div className="flex flex-wrap gap-2">{[[2, 1], [3, 2], [4, 3]].map(([buy, pay]) => <Button key={buy} type="button" size="sm" disabled={pending} variant="outline" onClick={() => setForm({ ...form, buy, pay })}>{buy}x{pay}</Button>)}</div>
              <div className="grid grid-cols-2 gap-3">{(["buy", "pay"] as const).map((key) => <label key={key} className="flex flex-col gap-1.5 text-sm">{key === "buy" ? "Llevás" : "Pagás"}<Input type="number" min={key === "buy" ? 2 : 1} max={key === "buy" ? 20 : form.buy - 1} required disabled={pending} value={form[key]} onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })} /></label>)}</div>
            </>}
            <label className="flex flex-col gap-1.5 text-sm">Buscar productos<Input placeholder="Escribí al menos 2 letras" value={query} disabled={pending} onChange={(e) => setQuery(e.target.value)} /></label>
            {searching && <p className="text-xs text-muted-foreground">Buscando productos...</p>}
            {!searching && !searchError && query.trim().length >= 2 && !results.length && <p className="text-xs text-muted-foreground">No encontramos productos activos.</p>}
            {searchError && <p role="alert" className="text-sm text-destructive">{searchError}</p>}
            {results.length > 0 && <div className="max-h-40 overflow-y-auto rounded-lg border">{results.map((r) => <button type="button" disabled={pending} key={r.id} className="block w-full border-b p-2 text-left text-xs hover:bg-muted" onClick={() => setSelected((prev) => prev.some((p) => p.id === r.id) ? prev : [...prev, r])}>{r.name} · {formatPrice(r.price)} {selected.some((p) => p.id === r.id) ? "✓" : "+"}</button>)}</div>}
            <div className="flex flex-col gap-1">{selected.map((r) => <div key={r.id} className="flex items-start justify-between gap-2 rounded-lg bg-muted p-2 text-xs"><span>{r.name}{r.offer && <span className="block text-muted-foreground">Reemplazará: {offerLabel(r.offer)}</span>}</span><button type="button" disabled={pending} className="underline" onClick={() => setSelected((prev) => prev.filter((p) => p.id !== r.id))}>Quitar</button></div>)}</div>
            <div className="rounded-xl border border-primary bg-primary/5 p-3">
              <span className="inline-block rounded-lg bg-primary px-3 py-1 text-xl font-bold text-primary-foreground tabular-nums">{offerLabel(form)}</span>
              <p className="mt-2 text-sm font-semibold">{form.title}</p>
              <p className="text-xs text-muted-foreground">{offerTerms(form, selected[0] ? presentationLabel(selected[0].name, selected[0].packSize) : "presentación seleccionada")} No acumulable con otra oferta.</p>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} disabled={pending} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Activar al guardar</label>
            <Button disabled={pending || !selected.length} type="submit">{pending ? "Guardando..." : `Guardar oferta${selected.length ? ` (${selected.length})` : ""}`}</Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => { setSelected([]); setForm(initial); setQuery("") }}>Nueva oferta</Button>
          </form>
          <section className="flex min-w-0 flex-col gap-3">
            <h2 className="font-semibold">Ofertas guardadas</h2>
            {loading ? <p className="text-sm text-muted-foreground">Cargando ofertas...</p> : error ? <p role="alert" className="text-sm text-destructive">{error}</p> : !rows.length ? <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Todavía no creaste ofertas. Elegí un producto para empezar.</p> : rows.map((r) => r.offer && <article key={r.id} className="rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between gap-2"><span className="rounded-full bg-primary/15 px-2 py-1 text-sm font-bold">{offerLabel(r.offer)}</span><span className="text-xs text-muted-foreground">{!r.active ? "Producto oculto" : r.offer.active ? "Activa" : "En pausa"}</span></div>
              <p className="mt-2 text-sm font-medium wrap-anywhere">{r.name}</p>
              <p className="text-xs text-muted-foreground">{r.offer.title}</p>
              <div className="mt-3 flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => edit(r)}>Editar</Button><Button type="button" size="sm" variant={r.offer.active ? "outline" : "default"} disabled={pending} onClick={() => run(async () => { const result = await toggleOffer(r.id, !r.offer!.active); if (!result.ok) return void toast.error(result.error); await reload(); router.refresh(); toast.success(r.offer!.active ? "Oferta en pausa" : "Oferta activada") })}>{r.offer.active ? "Pausar" : "Activar"}</Button></div>
            </article>)}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  </>
}
