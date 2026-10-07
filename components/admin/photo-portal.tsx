"use client"

import { useRef, useState } from "react"
import { Check, Images, Upload, X, RotateCcw, Search, FolderOpen, Download } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { PhotoCandidate, PhotoSnapshot, PhotoStatus } from "@/lib/photo-review-store"

const labels = { pendiente: "Pendiente", confirmada: "Confirmada", errada: "Errada" }
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()
const fileKey = (name: string) => normalize(name.replace(/\.(jpe?g|png|webp)$/i, ""))
const PAGE_SIZE = 24

export function PhotoPortal({ initial }: { initial: PhotoSnapshot }) {
  const [data, setData] = useState(initial)
  const [filter, setFilter] = useState("pendiente")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [uploadProduct, setUploadProduct] = useState("")
  const [progress, setProgress] = useState("")
  const [uploading, setUploading] = useState(false)
  const [failures, setFailures] = useState<string[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const byId = new Map(data.products.map((p) => [p.id, p]))

  async function request(url: string, options?: RequestInit) {
    const response = await fetch(url, options)
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || "No pudimos guardar. Volvé a intentar.")
    return body
  }
  async function decide(photo: PhotoCandidate, change: { status?: PhotoStatus; productId?: number | null }) {
    if (busy) return
    setBusy(photo.id)
    try {
      setData(await request("/api/admin/fotos", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: photo.id, version: photo.version, ...change }),
      }))
      toast.success(change.status === "confirmada" ? "Foto confirmada y publicada en la tienda." : "Decisión guardada.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "No pudimos guardar.") }
    finally { setBusy(null) }
  }
  async function refresh() {
    try { setData(await request("/api/admin/fotos")) }
    catch (error) { toast.error(error instanceof Error ? error.message : "No pudimos recargar.") }
  }
  async function upload() {
    if (!files.length || uploading) return
    setUploading(true); setFailures([])
    let added = 0, duplicate = 0
    const failed: string[] = []
    for (const [i, file] of files.entries()) {
      setProgress(`Cargando ${i + 1} de ${files.length}: ${file.name}`)
      try {
        if (file.size > 8 * 1024 * 1024) throw new Error("supera los 8 MB")
        const form = new FormData()
        form.set("foto", file)
        // Sólo un nombre de archivo idéntico vincula automáticamente. Cualquier
        // otra foto queda sin vincular para elegir el producto al revisarla.
        const exact = data.products.filter((p) => normalize(p.name) === fileKey(file.name))
        const productId = uploadProduct || (exact.length === 1 ? String(exact[0].id) : "")
        if (productId) form.set("producto", productId)
        const result = await request("/api/admin/fotos", { method: "POST", body: form })
        if (result.duplicate) duplicate++
        else added++
      } catch (error) { failed.push(`${file.name}: ${error instanceof Error ? error.message : "no se pudo cargar"}`) }
    }
    setProgress(`${added} fotos cargadas · ${duplicate} ya existentes · ${failed.length} con error`)
    setFailures(failed); setFiles([]); setUploading(false)
    if (fileInput.current) fileInput.current.value = ""
    if (folderInput.current) folderInput.current.value = ""
    setFilter("pendiente"); setSearch(""); setPage(1)
    await refresh()
    if (added) toast.success("Fotos cargadas para revisar. Todavía no se publicaron.")
  }
  function downloadPending() {
    const pending = data.products.filter((p) => !p.imageUrl).map((p) => ({
      ...p, fotos: data.candidates.filter((c) => c.productId === p.id).map((c) => ({ id: c.id, archivo: c.filename, estado: c.status })),
    }))
    const url = URL.createObjectURL(new Blob([JSON.stringify(pending, null, 2)], { type: "application/json" }))
    const link = document.createElement("a"); link.href = url; link.download = "productos-para-buscar-fotos.json"; link.click()
    URL.revokeObjectURL(url)
  }
  const term = normalize(search)
  const visible = data.candidates.filter((c) => (!filter || c.status === filter || (filter === "sin-vincular" && !c.productId))
    && normalize(`${c.filename} ${c.sourceTitle} ${byId.get(c.productId ?? 0)?.name ?? ""}`).includes(term))
  const withoutPhoto = data.products.filter((p) => !p.imageUrl && normalize(p.name).includes(term))
  const finding = filter === "por-buscar"
  const total = finding ? withoutPhoto.length : visible.length
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, pages)
  const start = (currentPage - 1) * PAGE_SIZE
  const stats = [
    [data.candidates.filter((c) => c.status === "pendiente").length, "Por revisar"],
    [data.candidates.filter((c) => c.published).length, "Publicadas"],
    [data.candidates.filter((c) => c.status === "errada").length, "Erradas"],
    [data.products.filter((p) => !p.imageUrl).length, "Productos sin foto"],
  ]

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-serif text-2xl font-bold">Portal de fotos</h1><p className="mt-1 text-sm text-muted-foreground">Cargá, vinculá y revisá. Solo las fotos que confirmás se muestran en la tienda.</p></div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={!!busy || uploading}><RotateCcw className="size-4" /> Recargar</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map(([count, label]) => <div key={label} className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-bold tabular-nums">{count}</p></div>)}</div>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">Cargar nuevas fotos</h2>
        <p className="mt-1 text-sm text-muted-foreground">Elegí archivos o una carpeta. JPG, PNG y WebP, hasta 8 MB por foto. Quedan pendientes hasta que las confirmes.</p>
        <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        <input ref={(element) => { folderInput.current = element; element?.setAttribute("webkitdirectory", "") }} type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []).filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name)))} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={uploading || !!busy}><Upload className="size-4" /> Elegir fotos</Button>
          <Button variant="outline" onClick={() => folderInput.current?.click()} disabled={uploading || !!busy}><FolderOpen className="size-4" /> Elegir carpeta</Button>
        </div>
        {files.length > 0 && <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm">{files.length} fotos seleccionadas</p>
          <label className="flex flex-col gap-1.5 text-sm">Vincular las fotos a un producto (opcional)
            <select className="h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3" value={uploadProduct} disabled={uploading} onChange={(e) => setUploadProduct(e.target.value)}>
              <option value="">Usar el nombre del archivo o elegir al revisar</option>
              {data.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <Button className="self-start" disabled={uploading || !!busy} onClick={upload}><Upload className="size-4" />{uploading ? "Cargando…" : `Cargar ${files.length} fotos para revisar`}</Button>
        </div>}
        {progress && <p role="status" className="mt-3 break-words text-sm text-muted-foreground">{progress}</p>}
        {failures.length > 0 && <details className="mt-2 text-sm text-destructive"><summary>Ver fotos que no se cargaron</summary><ul className="mt-2 space-y-1">{failures.map((f, i) => <li key={i} className="break-words">{f}</li>)}</ul></details>}
      </section>

      <div className="flex flex-wrap gap-2">{[
        ["pendiente", "Pendientes"], ["confirmada", "Confirmadas"], ["errada", "Erradas"],
        ["sin-vincular", "Sin vincular"], ["por-buscar", "Productos por buscar"], ["", "Todas las fotos"],
      ].map(([value, label]) => <button key={value} className={`rounded-full border px-3 py-1.5 text-sm ${filter === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`} onClick={() => { setFilter(value); setPage(1) }}>{label}</button>)}</div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input aria-label="Buscar fotos o productos" placeholder="Buscar producto, marca o archivo" className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} /></div>
        <span className="text-sm text-muted-foreground tabular-nums">{total} {finding ? "productos" : "fotos"}</span>
        <Button variant="outline" size="sm" onClick={downloadPending}><Download className="size-4" /> Pendientes</Button>
      </div>
      {finding ? <div className="grid gap-3 sm:grid-cols-2">{withoutPhoto.slice(start, start + PAGE_SIZE).map((p) => <article key={p.id} className="rounded-xl border border-border bg-card p-4"><h2 className="text-sm font-semibold">{p.name}</h2><p className="mt-1 text-xs text-muted-foreground">Sin foto publicada · {data.candidates.filter((c) => c.productId === p.id).length} candidatas</p></article>)}</div>
        : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.slice(start, start + PAGE_SIZE).map((photo) => {
          const product = byId.get(photo.productId ?? 0)
          return <article key={photo.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
            <a href={`/api/admin/fotos/${photo.id}`} target="_blank" rel="noopener" aria-label={`Ampliar foto ${photo.filename}`} className="block aspect-square bg-muted p-4"><img src={`/api/admin/fotos/${photo.id}`} alt={photo.sourceTitle || photo.filename} loading="lazy" className="size-full object-contain" /></a>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex flex-wrap gap-2 text-xs"><span className={`rounded-full px-2 py-1 ${photo.status === "errada" ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"}`}>{labels[photo.status]}</span>{photo.published && <span className="rounded-full bg-primary/15 px-2 py-1 text-foreground">Publicada en la tienda</span>}</div>
              <h2 className="text-sm font-semibold">{product?.name ?? "Elegí a qué producto corresponde"}</h2>
              {photo.sourceTitle && <p className="text-xs text-muted-foreground">Foto: {photo.sourceTitle}</p>}
              <p className="break-all text-xs text-muted-foreground">Archivo: {photo.filename}</p>
              <label className="flex min-w-0 flex-col gap-1.5 text-xs">Producto
                <select aria-label={`Producto de ${photo.filename}`} className="h-10 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-sm" value={photo.productId ?? ""} disabled={!!busy || uploading || photo.status === "confirmada"} onChange={(e) => decide(photo, { productId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Sin vincular</option>{data.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              {photo.status === "confirmada" && !photo.published && <p className="text-xs text-muted-foreground">Hay otra foto en el catálogo. Podés volver a publicar esta.</p>}
              {photo.status !== "confirmada" && product?.imageUrl && <p className="text-xs text-muted-foreground">Al confirmar, reemplazás la foto actual de este producto.</p>}
              <div className="mt-auto flex flex-wrap gap-2">
                <Button size="sm" disabled={!!busy || uploading || !photo.productId || photo.published} onClick={() => decide(photo, { status: "confirmada" })}><Check className="size-4" /> Confirmada</Button>
                <Button size="sm" variant="outline" className="text-destructive" disabled={!!busy || uploading || photo.status === "errada"} onClick={() => decide(photo, { status: "errada" })}><X className="size-4" /> Errada</Button>
                {photo.status !== "pendiente" && <Button size="sm" variant="ghost" disabled={!!busy || uploading} onClick={() => decide(photo, { status: "pendiente" })}><RotateCcw className="size-3.5" /> Volver a pendiente</Button>}
              </div>
              {busy === photo.id && <p className="text-xs text-muted-foreground" role="status">Guardando…</p>}
            </div>
          </article>
        })}</div>}
      {total === 0 && <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground"><Images className="size-10 opacity-40" /><p>No hay {finding ? "productos" : "fotos"} con estos filtros.</p></div>}
      {pages > 1 && <nav aria-label="Páginas de fotos" className="flex items-center justify-center gap-3"><Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</Button><span className="text-sm tabular-nums">{currentPage} de {pages}</span><Button variant="outline" size="sm" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Siguiente</Button></nav>}
      <p className="text-xs text-muted-foreground">Las fotos erradas se conservan para revisarlas. Volver a pendiente o marcar errada retira esa foto de la tienda si está publicada.</p>
    </div>
  )
}
