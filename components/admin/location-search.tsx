"use client"

import { useState, useTransition } from "react"
import { findLocation, type FoundLocation } from "@/app/actions/reparto"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { googleMapsPointUrl, type LatLng } from "@/lib/route"
import { cn } from "@/lib/utils"
import { CircleCheck, ExternalLink, Search, TriangleAlert } from "lucide-react"

export type LocationPrecision = FoundLocation["precision"]

const PRECISION_LABEL: Record<LocationPrecision, string> = {
  exacta: "Encontramos la casa",
  aproximada: "Aproximada: encontramos la calle o la zona, no la casa",
  manual: "Cargada a mano",
}

/** Llama a `findLocation` (dirección, coordenadas o link) y guarda el error para mostrarlo. */
export function useLocationFinder(onFound: (found: FoundLocation) => void) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function find(query: string) {
    if (!query.trim() || pending) return
    startTransition(async () => {
      try {
        const result = await findLocation(query)
        if (result.ok) {
          setError(null)
          onFound(result.found)
        } else {
          setError(result.error)
        }
      } catch {
        setError("No pudimos buscar la ubicación. Revisá la conexión y probá de nuevo.")
      }
    })
  }

  return { pending, error, find }
}

/**
 * Busca una ubicación: dirección (en OpenStreetMap), coordenadas o link de Google Maps.
 * Cada resultado se entrega con `onFound`; el que lo usa decide si lo guarda.
 */
export function LocationSearch({
  id,
  defaultQuery,
  onFound,
  invalid,
  describedBy,
}: {
  id: string
  defaultQuery: string
  onFound: (found: FoundLocation) => void
  invalid?: boolean
  describedBy?: string
}) {
  const [query, setQuery] = useState(defaultQuery)
  const { pending, error, find } = useLocationFinder(onFound)
  const search = () => find(query)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <Input
          id={id}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter busca (y no manda el formulario de afuera).
            if (e.key === "Enter") {
              e.preventDefault()
              search()
            }
          }}
          autoComplete="off"
          placeholder="Calle y número, coordenadas o link de Google Maps"
          aria-invalid={invalid || error ? true : undefined}
          aria-describedby={describedBy}
          className="h-9 min-w-0"
        />
        <Button
          type="button"
          variant="outline"
          className="h-9 shrink-0 px-3"
          onClick={search}
          disabled={pending || !query.trim()}
        >
          {pending ? <Spinner aria-label="Buscando" /> : <Search />}
          {pending ? "Buscando..." : "Buscar"}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** Ubicación elegida: qué tan precisa es y un link para revisarla en Google Maps. */
export function LocationPreview({
  location,
  precision,
  label,
  className,
}: {
  location: LatLng
  precision?: LocationPrecision
  label?: string
  className?: string
}) {
  const approximate = precision === "aproximada"
  const Icon = approximate ? TriangleAlert : CircleCheck
  return (
    <div className={cn("flex flex-col gap-1 rounded-lg bg-muted p-3 text-sm", className)}>
      <p className="flex items-start gap-1.5">
        <Icon className={cn("mt-0.5 size-4 shrink-0", approximate ? "text-destructive" : "text-primary")} />
        <span className="min-w-0">
          {precision ? PRECISION_LABEL[precision] : "Ubicación cargada"}
          {label && <span className="block break-words text-xs text-muted-foreground">{label}</span>}
        </span>
      </p>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-5.5 text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">
          {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
        </span>
        <a
          href={googleMapsPointUrl(location)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-accent hover:underline"
        >
          <ExternalLink className="size-3" />
          Ver en Google Maps
        </a>
      </p>
    </div>
  )
}
