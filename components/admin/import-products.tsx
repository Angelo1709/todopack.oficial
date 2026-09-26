"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { read, utils } from "xlsx"
import {
  importProducts,
  previewImport,
  type ImportPreview,
  type ImportPreviewRow,
  type ImportPreviewStatus,
  type ImportRow,
} from "@/app/actions/catalog"
import { extractPriceRows } from "@/lib/price-list"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { FileSpreadsheet, Upload } from "lucide-react"

type Filter = "todos" | ImportPreviewStatus

const FILTERS: { value: Filter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "nuevo", label: "Nuevos" },
  { value: "actualiza", label: "Actualizan" },
  { value: "sin_cambios", label: "Sin cambios" },
]

function StatusCell({ row }: { row: ImportPreviewRow }) {
  if (row.status === "nuevo") return <Badge>Nuevo</Badge>
  if (row.status === "sin_cambios") return <span className="text-xs text-muted-foreground">Sin cambios</span>
  const priceChanged = row.previousPrice !== null && row.previousPrice !== row.price
  return (
    <div className="flex flex-col items-end gap-0.5 text-xs">
      {priceChanged && (
        <span className="tabular-nums">
          <span className="text-muted-foreground line-through">{formatPrice(row.previousPrice!)}</span>
          {" → "}
          <span className="font-semibold">{formatPrice(row.price)}</span>
        </span>
      )}
      {row.reactivates && <span className="text-muted-foreground">Se reactiva</span>}
      {row.classifies && <span className="text-muted-foreground">Se clasifica</span>}
    </div>
  )
}

export function ImportProducts() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [fileName, setFileName] = useState("")
  const [rows, setRows] = useState<ImportRow[]>([])
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [filter, setFilter] = useState<Filter>("todos")
  const [deactivate, setDeactivate] = useState(false)
  const [step, setStep] = useState<"idle" | "reading" | "importing">("idle")

  const visible = useMemo(
    () => (preview ? preview.rows.filter((r) => filter === "todos" || r.status === filter) : []),
    [preview, filter],
  )

  function reset() {
    setFileName("")
    setRows([])
    setPreview(null)
    setFilter("todos")
    setDeactivate(false)
    if (inputRef.current) inputRef.current.value = ""
  }

  function handleOpenChange(next: boolean) {
    if (step === "importing") return
    setOpen(next)
    if (!next) reset()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setPreview(null)
    setStep("reading")
    try {
      const wb = read(await file.arrayBuffer())
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const parsed = extractPriceRows(utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null }))
      if (parsed.rows.length === 0) {
        toast.error("No encontramos filas con descripción y precio. Revisá que el Excel tenga esas columnas.")
        return
      }
      const res = await previewImport(parsed.rows)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setRows(parsed.rows)
      setPreview({ ...res, skipped: res.skipped + parsed.skipped })
    } catch {
      toast.error("No pudimos leer el archivo. Verificá que sea un Excel (.xlsx) válido.")
    } finally {
      setStep("idle")
    }
  }

  async function handleImport() {
    if (!rows.length) return
    setStep("importing")
    try {
      const res = await importProducts(rows, { deactivateMissing: deactivate })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(
        `Importación lista: ${res.inserted} nuevos, ${res.updated} actualizados, ${res.unchanged} sin cambios.`,
      )
      if (res.deactivated) toast.info(`Se desactivaron ${res.deactivated} productos que no estaban en la lista.`)
      // preview.skipped suma las filas que descartó la lectura del Excel y las que descartó el servidor.
      const skipped = preview?.skipped ?? res.skipped
      if (skipped) toast.warning(`${skipped} filas omitidas (sin nombre o precio válido, o repetidas).`)
      setOpen(false)
      reset()
      router.refresh()
    } catch {
      toast.error("No se pudo completar la importación. Probá de nuevo.")
    } finally {
      setStep("idle")
    }
  }

  const counts = preview?.counts
  const totalChanges = counts ? counts.nuevo + counts.actualiza : 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" className="gap-2" />}>
        <FileSpreadsheet className="size-4" /> Importar Excel
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar lista de precios</DialogTitle>
          <DialogDescription>
            Subí el Excel con columnas de <strong>Descripción</strong> y <strong>Precio</strong>. Los productos se
            reconocen por nombre: a los existentes se les actualiza el precio (sin tocar categoría, presentación ni
            grupo) y los nuevos se agregan con categoría y presentación detectadas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 p-6 text-center hover:bg-muted">
            <Upload className="size-6 text-muted-foreground" />
            <span className="text-sm font-medium">{fileName || "Elegí un archivo .xlsx"}</span>
            <span className="text-xs text-muted-foreground">
              {step === "reading" ? "Leyendo y comparando con el catálogo..." : "Hacé clic para seleccionar"}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              disabled={step !== "idle"}
              className="hidden"
            />
          </label>

          {preview && counts && (
            <>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {FILTERS.map((f) => {
                  const n = f.value === "todos" ? preview.rows.length : counts[f.value]
                  return (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFilter(f.value)}
                      className={cn(
                        "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors",
                        filter === f.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {f.label} <span className="tabular-nums">({n})</span>
                    </button>
                  )
                })}
              </div>

              <ul className="max-h-[42dvh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {visible.length === 0 && (
                  <li className="px-3 py-6 text-center text-sm text-muted-foreground">No hay filas en este filtro.</li>
                )}
                {visible.map((r) => (
                  <li key={r.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-medium leading-tight">{r.name}</p>
                      <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
                        <span className={cn(r.packSize > 1 && "font-medium text-foreground")}>{r.label}</span>
                        {r.packSize > 1 && <span className="tabular-nums">≈ {formatPrice(r.unitPrice)} c/u</span>}
                        <span>· {r.category}</span>
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 text-right">
                      <span className="text-sm font-semibold tabular-nums">{formatPrice(r.price)}</span>
                      <StatusCell row={r} />
                    </div>
                  </li>
                ))}
              </ul>

              <label
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  deactivate ? "border-primary bg-primary/5" : "border-border",
                  preview.missingActive === 0 && "opacity-60",
                )}
              >
                <input
                  type="checkbox"
                  checked={deactivate}
                  onChange={(e) => setDeactivate(e.target.checked)}
                  disabled={preview.missingActive === 0}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  <span className="block text-sm font-medium">Desactivar productos que no están en esta lista</span>
                  <span className="block text-xs text-muted-foreground">
                    {preview.missingActive === 0
                      ? "Todos los productos activos están en el archivo."
                      : `${preview.missingActive} producto${preview.missingActive === 1 ? "" : "s"} activo${preview.missingActive === 1 ? "" : "s"} no aparece${preview.missingActive === 1 ? "" : "n"} en el archivo. No se borran: quedan ocultos en la tienda.`}
                  </span>
                </span>
              </label>

              {preview.skipped > 0 && (
                <p className="text-xs text-muted-foreground">
                  {preview.skipped} fila{preview.skipped === 1 ? "" : "s"} sin nombre o precio válido (o repetidas) se
                  van a omitir.
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={step === "importing"}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={step !== "idle" || !preview || (totalChanges === 0 && !deactivate)}>
            {step === "importing"
              ? "Importando..."
              : preview && totalChanges === 0 && !deactivate
                ? "Todo al día"
                : `Importar ${preview ? preview.rows.length : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
