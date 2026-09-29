"use client"

import { useEffect, useRef, useState } from "react"
import type { CircleMarker, Map as LeafletMap } from "leaflet"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { LocateFixed, LocateOff } from "lucide-react"

export type RouteMapPoint = {
  lat: number
  lng: number
  /** Lo que va dentro del marcador: número de entrega, o inicial del lugar de salida / llegada. */
  label: string
  /** Texto del cartelito al tocar el marcador. */
  title: string
  kind: "salida" | "entrega" | "llegada"
}

const MARKER_CLASS: Record<RouteMapPoint["kind"], string> = {
  entrega:
    "grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm ring-2 ring-background tabular-nums",
  salida:
    "grid size-7 place-items-center rounded-full bg-foreground text-xs font-bold text-background shadow-sm ring-2 ring-background",
  llegada:
    "grid size-7 place-items-center rounded-full bg-foreground text-xs font-bold text-background shadow-sm ring-2 ring-background",
}

type LeafletModule = typeof import("leaflet")

/**
 * Mapa de OpenStreetMap con el recorrido: paradas numeradas en orden de visita y el camino calle por calle
 * (el mismo que se usó para ordenar, respetando las manos). `points` = salida, entregas y llegada;
 * `legPaths[i]` = camino de points[i] a points[i + 1] (null = línea recta).
 */
export function RouteMap({
  points,
  legPaths,
}: {
  points: RouteMapPoint[]
  legPaths: ([number, number][] | null)[]
}) {
  const container = useRef<HTMLDivElement>(null)
  const leaflet = useRef<LeafletModule | null>(null)
  const map = useRef<LeafletMap | null>(null)
  const me = useRef<CircleMarker | null>(null)
  const watch = useRef<number | null>(null)
  const [following, setFollowing] = useState(false)

  useEffect(() => {
    let cancelled = false
    import("leaflet").then((L) => {
      if (cancelled || !container.current) return
      leaflet.current = L
      const m = L.map(container.current, { scrollWheelZoom: false })
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m)

      legPaths.forEach((path, i) => {
        const from = points[i]
        const to = points[i + 1]
        if (!from || !to) return
        const coords: [number, number][] = path ?? [
          [from.lat, from.lng],
          [to.lat, to.lng],
        ]
        L.polyline(coords, {
          className: path ? "route-line" : "route-line route-line-recta",
          weight: 5,
          opacity: 0.85,
          lineJoin: "round",
        }).addTo(m)
      })

      // Si sale y vuelve al mismo lugar, un solo marcador.
      const shown = points.filter(
        (p, i) => !(p.kind === "llegada" && points[0] && p.lat === points[0].lat && p.lng === points[0].lng && i > 0),
      )
      for (const p of shown) {
        const badge = document.createElement("span")
        badge.className = MARKER_CLASS[p.kind]
        badge.textContent = p.label
        const icon = L.divIcon({ className: "", html: badge, iconSize: [28, 28], iconAnchor: [14, 14] })
        // El texto va como textContent: nombres y direcciones de clientes nunca se interpretan como HTML.
        const popup = document.createElement("div")
        popup.textContent = p.title
        L.marker([p.lat, p.lng], { icon, title: p.title, zIndexOffset: p.kind === "entrega" ? 100 : 0 })
          .bindPopup(popup)
          .addTo(m)
      }

      m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [28, 28] })
      map.current = m
    })
    return () => {
      cancelled = true
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
      watch.current = null
      me.current = null
      map.current?.remove()
      map.current = null
    }
  }, [points, legPaths])

  function stopFollowing() {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
    watch.current = null
    me.current?.remove()
    me.current = null
    setFollowing(false)
  }

  function follow() {
    if (following) return stopFollowing()
    if (!("geolocation" in navigator)) {
      toast.error("Este dispositivo no puede dar la ubicación.")
      return
    }
    setFollowing(true)
    let first = true
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        const L = leaflet.current
        const m = map.current
        if (!L || !m) return
        const at: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        if (me.current) me.current.setLatLng(at)
        else me.current = L.circleMarker(at, { radius: 8, className: "route-me" }).addTo(m)
        if (first) {
          m.setView(at, Math.max(m.getZoom(), 16))
          first = false
        }
      },
      () => {
        toast.error("No pudimos obtener tu ubicación: activá el GPS y dale permiso al navegador.")
        stopFollowing()
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    )
  }

  return (
    <div className="relative isolate overflow-hidden rounded-xl border border-border bg-muted print:hidden">
      <div ref={container} className="h-[55vh] max-h-[560px] min-h-72 w-full" aria-label="Mapa del recorrido" />
      <Button
        type="button"
        variant={following ? "default" : "outline"}
        className={cn("absolute right-3 bottom-8 z-[1000] h-9 px-3 shadow-sm", !following && "bg-card")}
        aria-pressed={following}
        onClick={follow}
      >
        {following ? <LocateOff /> : <LocateFixed />}
        {following ? "Dejar de seguirme" : "Mi ubicación"}
      </Button>
    </div>
  )
}
