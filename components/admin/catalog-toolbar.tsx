"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { importMissingProductImages } from "@/app/actions/catalog"
import { ImportProducts } from "@/components/admin/import-products"
import { ProductDialog } from "@/components/admin/product-dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { ImageDown, Plus } from "lucide-react"

// Cursor de "Buscar imágenes": cada lote sigue desde el último id revisado, así no se reintentan
// siempre los mismos productos sin resultado. Se guarda en el navegador (sin cambiar el esquema).
const CURSOR_KEY = "todopack-image-cursor"

function readCursor() {
  try {
    return Number(localStorage.getItem(CURSOR_KEY)) || 0
  } catch {
    return 0
  }
}

function writeCursor(value: number) {
  try {
    localStorage.setItem(CURSOR_KEY, String(value))
  } catch {
    // sin almacenamiento: se vuelve a empezar la próxima vez
  }
}

export function CatalogToolbar() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)

  function importImages() {
    startTransition(async () => {
      try {
        const res = await importMissingProductImages(20, readCursor())
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        writeCursor(res.nextAfterId)
        if (res.imported.length) toast.success(`Se cargaron ${res.imported.length} imágenes`)
        else if (res.scanned) toast.info("No se encontraron imágenes en este lote")
        if (res.notFound.length) {
          toast.warning(`${res.notFound.length} productos no tuvieron resultado: cargales la imagen a mano desde "Editar"`)
        }
        if (res.done) toast.info("Se revisaron todos los productos sin imagen. El próximo lote vuelve a empezar.")
        router.refresh()
      } catch {
        toast.error("No se pudieron buscar imágenes. Probá de nuevo.")
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button className="gap-2" onClick={() => setCreating(true)}>
        <Plus className="size-4" /> Nuevo producto
      </Button>
      <ImportProducts />
      <Button variant="outline" className="gap-2" onClick={importImages} disabled={pending}>
        <ImageDown className="size-4" /> {pending ? "Buscando..." : "Buscar imágenes"}
      </Button>
      <ProductDialog open={creating} onOpenChange={setCreating} product={null} />
    </div>
  )
}
