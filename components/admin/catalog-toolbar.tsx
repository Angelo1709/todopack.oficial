"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { importMissingProductImages } from "@/app/actions/catalog"
import { ImportProducts } from "@/components/admin/import-products"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

export function CatalogToolbar() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function importImages() {
    startTransition(async () => {
      try {
        const result = await importMissingProductImages(20)
        if (result.imported.length) {
          toast.success(`Se cargaron ${result.imported.length} imágenes`)
        } else {
          toast.info("No se encontraron nuevas imágenes en este lote")
        }
        if (result.notFound.length) {
          toast.warning(`${result.notFound.length} productos requieren búsqueda manual`)
        }
        router.refresh()
      } catch {
        toast.error("No se pudo importar imágenes")
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ImportProducts />
      <Button variant="outline" onClick={importImages} disabled={pending}>
        Buscar imágenes
      </Button>
    </div>
  )
}
