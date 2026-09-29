"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { refreshStreetMapAction } from "@/app/actions/reparto"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { dateInAR, timeInAR } from "@/lib/admin-orders-utils"
import { formatDateAR } from "@/lib/dates"
import { Map as MapIcon, RefreshCw } from "lucide-react"

type Info = { fetchedAt: string; ways: number; oneWays: number }

function when(iso: string) {
  const date = new Date(iso)
  return `${formatDateAR(dateInAR(date))} a las ${timeInAR(date)}`
}

/**
 * Mapa de calles de OpenStreetMap con el que se mide el recorrido (respetando las manos únicas).
 * Se baja de nuevo a mano, por ejemplo después de corregir calles en OpenStreetMap.
 */
export function StreetMapCard({ initial }: { initial: Info | null }) {
  const [info, setInfo] = useState<Info | null>(initial)
  const [pending, startTransition] = useTransition()

  function refresh() {
    startTransition(async () => {
      try {
        const result = await refreshStreetMapAction()
        if (result.ok) {
          setInfo(result.info)
          toast.success(`Calles actualizadas: ${result.info.ways}, ${result.info.oneWays} de mano única`)
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error("No pudimos actualizar las calles. Revisá la conexión y probá de nuevo.")
      }
    })
  }

  return (
    <section id="calles" className="scroll-mt-24 rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <MapIcon className="size-4 text-primary" /> Mapa de calles
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        El recorrido se mide por calle y respeta las manos únicas, con las calles de OpenStreetMap. Si corregís una
        calle en OpenStreetMap (por ejemplo, hacia dónde corre), tocá “Actualizar calles” para que el recorrido la use.
      </p>

      {info ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-muted p-4 text-sm">
          <dt className="text-muted-foreground">Actualizado</dt>
          <dd className="first-letter:uppercase">{when(info.fetchedAt)}</dd>
          <dt className="text-muted-foreground">Calles</dt>
          <dd className="tabular-nums">
            {info.ways} · {info.oneWays} de mano única
          </dd>
        </dl>
      ) : (
        <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
          Todavía no se bajaron las calles: el recorrido se mide en línea recta.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Calles © colaboradores de OpenStreetMap.</p>
        <Button type="button" variant={info ? "outline" : "default"} className="h-9 px-3" onClick={refresh} disabled={pending}>
          {pending ? <Spinner aria-label="Actualizando" /> : <RefreshCw />}
          {pending ? "Actualizando..." : info ? "Actualizar calles" : "Bajar calles"}
        </Button>
      </div>
    </section>
  )
}
