"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { read, utils } from "xlsx"
import { importProducts, type ImportRow } from "@/app/actions/admin"
import { Button } from "@/components/ui/button"
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

function pickField(row: Record<string, unknown>, keys: string[]): string | undefined {
  const entries = Object.entries(row)
  for (const wanted of keys) {
    const found = entries.find(([k]) => k.trim().toLowerCase().includes(wanted))
    if (found) return String(found[1] ?? "")
  }
  return undefined
}

function parsePrice(raw: string): number {
  // Handles "15000", "15.000", "$ 15000", "1.234,56"
  const cleaned = raw.replace(/[^\d.,]/g, "")
  if (!cleaned) return NaN
  let normalized = cleaned
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".")
  } else if ((cleaned.match(/\./g) || []).length > 1) {
    normalized = cleaned.replace(/\./g, "")
  } else if (/\.\d{3}$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, "")
  }
  return Math.round(Number(normalized))
}

export function ImportProducts() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [fileName, setFileName] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      const wb = read(buf)
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const json = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
      const parsed: ImportRow[] = []
      for (const r of json) {
        const name = pickField(r, ["descrip", "articulo", "producto", "detalle", "nombre"])
        const priceRaw = pickField(r, ["precio", "price", "importe", "valor"])
        if (!name || !priceRaw) continue
        const price = parsePrice(priceRaw)
        if (!name.trim() || !Number.isFinite(price) || price <= 0) continue
        parsed.push({ name: name.trim(), price })
      }
      if (parsed.length === 0) {
        toast.error("No se encontraron filas con 'Descripción' y 'Precio' válidas.")
        return
      }
      setRows(parsed)
    } catch {
      toast.error("No pudimos leer el archivo. Verificá que sea un .xlsx válido.")
    }
  }

  async function handleImport() {
    if (rows.length === 0) return
    setLoading(true)
    try {
      const res = await importProducts(rows)
      toast.success(
        `Importados: ${res.inserted} nuevos, ${res.updated} actualizados${
          res.skipped ? `, ${res.skipped} omitidos` : ""
        }.`,
      )
      setOpen(false)
      setRows([])
      setFileName("")
      if (inputRef.current) inputRef.current.value = ""
      router.refresh()
    } catch {
      toast.error("No se pudo completar la importación.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="gap-2" />}>
        <FileSpreadsheet className="size-4" /> Importar Excel
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar / actualizar productos</DialogTitle>
          <DialogDescription>
            Subí el Excel con columnas de <strong>Descripción</strong> y <strong>Precio</strong>. Los
            productos existentes se actualizan por nombre y los nuevos se agregan. Las categorías se
            asignan automáticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 p-8 text-center hover:bg-muted">
            <Upload className="size-6 text-muted-foreground" />
            <span className="text-sm font-medium">
              {fileName || "Elegí un archivo .xlsx"}
            </span>
            <span className="text-xs text-muted-foreground">Hacé clic para seleccionar</span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              className="hidden"
            />
          </label>

          {rows.length > 0 && (
            <div className="rounded-lg border border-border">
              <div className="border-b border-border px-3 py-2 text-sm font-medium">
                {rows.length} productos detectados
              </div>
              <ul className="max-h-48 divide-y divide-border overflow-y-auto text-sm">
                {rows.slice(0, 50).map((r, i) => (
                  <li key={i} className="flex justify-between gap-2 px-3 py-1.5">
                    <span className="line-clamp-1">{r.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      ${r.price.toLocaleString("es-AR")}
                    </span>
                  </li>
                ))}
              </ul>
              {rows.length > 50 && (
                <div className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
                  y {rows.length - 50} más...
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={loading || rows.length === 0}>
            {loading ? "Importando..." : `Importar ${rows.length || ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
