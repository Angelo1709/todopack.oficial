"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { locateOrdersForDate } from "@/app/actions/reparto"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Search } from "lucide-react"

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

/** Busca en el mapa los pedidos por entregar del día que todavía no tienen ubicación (≈ 1 segundo por pedido). */
export function OrdersLocateButton({ date, count }: { date: string; count: number }) {
  const [pending, startTransition] = useTransition()

  function run() {
    startTransition(async () => {
      try {
        const result = await locateOrdersForDate(date)
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        const { located, approximate, notFound, failed, remaining } = result.summary
        const parts = [
          located && plural(located, "ubicado", "ubicados"),
          approximate && plural(approximate, "aproximado (revisalo)", "aproximados (revisalos)"),
          notFound && plural(notFound, "sin encontrar", "sin encontrar"),
        ].filter(Boolean)
        if (failed > 0) {
          toast.warning(`No pudimos consultar el mapa para ${plural(failed, "pedido", "pedidos")}. Probá de nuevo en un rato.`)
        } else if (remaining > 0) {
          toast.info(`${parts.length ? `${parts.join(", ")}. ` : ""}Quedan ${remaining}: tocá de nuevo para seguir.`)
        } else if (notFound > 0 || approximate > 0) {
          toast.warning(`${parts.join(", ")}.${notFound > 0 ? " Ubicá a mano los que no encontramos." : ""}`)
        } else {
          toast.success(parts.length ? `Listo: ${parts.join(", ")}.` : "No quedaban pedidos por ubicar.")
        }
      } catch {
        toast.error("No pudimos buscar las ubicaciones. Revisá la conexión y probá de nuevo.")
      }
    })
  }

  return (
    <Button variant="outline" className="h-9 px-3" onClick={run} disabled={pending}>
      {pending ? <Spinner aria-label="Buscando" /> : <Search />}
      {pending ? `Buscando ${plural(count, "dirección", "direcciones")}...` : `Buscar en el mapa (${count})`}
    </Button>
  )
}
