"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { saveOrderLocation, type FoundLocation } from "@/app/actions/reparto"
import { LocationPreview, LocationSearch } from "@/components/admin/location-search"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { orderLabel, type AdminOrder } from "@/lib/admin-orders-utils"
import { cn } from "@/lib/utils"
import { LocateFixed } from "lucide-react"

type OrderRef = Pick<AdminOrder, "id" | "customerName" | "address" | "location" | "locationStatus">

/** Botón + diálogo para ubicar (o corregir) en el mapa la dirección de un pedido. */
export function OrderLocationButton({
  order,
  label,
  variant = "outline",
  className,
}: {
  order: OrderRef
  label: string
  variant?: "outline" | "ghost"
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [found, setFound] = useState<FoundLocation | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    if (!found) return
    startTransition(async () => {
      try {
        const result = await saveOrderLocation(order.id, found.location)
        if (result.ok) {
          toast.success(`Pedido ${orderLabel(order.id)}: ubicación guardada`)
          setOpen(false)
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error("No pudimos guardar la ubicación. Revisá la conexión y probá de nuevo.")
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setFound(null)
      }}
    >
      <DialogTrigger render={<Button variant={variant} className={cn("h-9 px-3 sm:h-8", className)} />}>
        <LocateFixed />
        {label}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ubicar pedido {orderLabel(order.id)}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{order.customerName}</span> · {order.address}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <LocationSearch id={`ubicar-${order.id}`} defaultQuery={order.address} onFound={setFound} />
          <p className="text-xs text-muted-foreground">
            ¿No aparece o queda mal? Abrí Google Maps, mantené apretado sobre la casa y pegá acá las coordenadas
            que aparecen arriba (ej.: -33.5321, -61.1234) o el link para compartir.
          </p>
          {found ? (
            <LocationPreview location={found.location} precision={found.precision} label={found.label} />
          ) : order.location ? (
            <LocationPreview
              location={order.location}
              precision={order.locationStatus === "no_encontrada" || !order.locationStatus ? undefined : order.locationStatus}
              label="Ubicación actual"
            />
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" className="h-10 sm:h-8" />} disabled={pending}>
            Volver
          </DialogClose>
          <Button className="h-10 sm:h-8" disabled={!found || pending} onClick={save}>
            {pending && <Spinner aria-label="Guardando" />}
            {pending ? "Guardando..." : "Guardar ubicación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
