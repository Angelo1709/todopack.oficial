"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { setProductActive } from "@/app/actions/catalog"
import { ProductDialog, type AdminProduct } from "@/components/admin/product-dialog"
import { categoryImage } from "@/lib/categories"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Eye, EyeOff, Link2,PackageSearch, Pencil } from "lucide-react"

export type AdminProductRow = AdminProduct & {
  /** "Unidad", "Pack x6"... */
  label: string
  unitPrice: number
  /** Cantidad de productos con el mismo group_key (incluido este). */
  groupSize: number
}

export function ProductList({ products }: { products: AdminProductRow[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<AdminProduct | null>(null)
  const [open, setOpen] = useState(false)
  const [linking,setLinking]=useState(false)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [, startTransition] = useTransition()

  function edit(product: AdminProduct,link=false) {
    setEditing(product)
    setLinking(link)
    setOpen(true)
  }

  function toggleActive(product: AdminProductRow) {
    setPendingId(product.id)
    startTransition(async () => {
      try {
        const res = await setProductActive(product.id, !product.active)
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        toast.success(product.active ? "Producto desactivado: ya no se muestra en la tienda" : "Producto activado")
        router.refresh()
      } catch {
        toast.error("No se pudo actualizar el producto.")
      } finally {
        setPendingId(null)
      }
    })
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
        <PackageSearch className="size-10 opacity-40" />
        <p>No hay productos con estos filtros.</p>
      </div>
    )
  }

  return (
    <>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {products.map((p) => (
          <li
            key={p.id}
            className={cn(
              "grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 p-3 sm:grid-cols-[3rem_minmax(0,1fr)_auto_auto]",
              !p.active && "bg-muted/40",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- URL externa de cualquier dominio */}
            <img
              src={p.imageUrl || categoryImage(p.category)}
              alt=""
              loading="lazy"
              className={cn("size-12 rounded-lg border border-border bg-muted object-cover", !p.active && "opacity-50")}
            />
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-medium leading-tight">{p.name}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                <span>{p.category}</span>
                <span>·</span>
                <span className={cn(p.packSize > 1 && "font-medium text-foreground")}>{p.label}</span>
                {p.groupSize > 1 && (
                  <Badge variant="secondary" title={`Grupo: ${p.groupKey}`}>
                    {p.groupSize} presentaciones
                  </Badge>
                )}
                {!p.active && <Badge variant="outline">Inactivo</Badge>}
                {!p.imageUrl && p.active && <span className="italic">sin imagen</span>}
              </p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title="Grupo">
                {p.groupKey ?? "sin grupo"}
              </p>
            </div>
            <div className="col-start-2 text-left sm:col-start-auto sm:text-right">
              <p className="text-sm font-semibold tabular-nums">{formatPrice(p.price)}</p>
              {p.packSize > 1 && (
                <p className="text-xs text-muted-foreground tabular-nums">≈ {formatPrice(p.unitPrice)} c/u</p>
              )}
            </div>
            <div className="col-start-2 flex flex-wrap gap-2 sm:col-start-auto sm:justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => toggleActive(p)}
                disabled={pendingId === p.id}
                aria-label={p.active ? `Desactivar ${p.name}` : `Activar ${p.name}`}
              >
                {p.active ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                {p.active ? "Desactivar" : "Activar"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => edit(p)} aria-label={`Editar ${p.name}`}>
                <Pencil className="size-3.5" /> Editar
              </Button>
              <Button size="sm" variant="outline" onClick={()=>edit(p,true)} aria-label={`Vincular unitario y pack de ${p.name}`} disabled={!p.active}>
                <Link2 className="size-3.5"/> Vincular pack
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <ProductDialog open={open} onOpenChange={setOpen} product={editing} focusLink={linking} />
    </>
  )
}
