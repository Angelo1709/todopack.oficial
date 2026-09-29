import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { OrderLocationButton } from "@/components/admin/order-location-dialog"
import { OrdersLocateButton } from "@/components/admin/orders-locate-button"
import { OrdersPrintButton } from "@/components/admin/orders-print-button"
import { orderLabel, type AdminOrder } from "@/lib/admin-orders-utils"
import type { DeliveryRoute, RouteEndpoint, RouteStop } from "@/lib/delivery-route"
import { formatPrice } from "@/lib/format"
import { DELIVERY_SLOT_LABEL, ORDER_STATUS_LABEL } from "@/lib/order-status"
import { ROUTE_PLACE_LABEL, formatKm, googleMapsDirectionsUrl, type RoutePlace } from "@/lib/route"
import {
  Banknote,
  Flag,
  Landmark,
  MapPin,
  MapPinOff,
  Moon,
  Navigation,
  Phone,
  Route as RouteIcon,
  Settings,
  StickyNote,
  Store,
  Sun,
  Warehouse,
} from "lucide-react"

const SLOT_ICON = { mediodia: Sun, noche: Moon } as const
const PLACE_ICON = { local: Store, deposito: Warehouse } as const

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

/** Vista "Recorrido": por franja, el orden de entregas que minimiza los km (ver lib/route.ts). */
export function OrdersRoute({
  routes,
  date,
  dateLabel,
  slotLabel,
}: {
  routes: DeliveryRoute[]
  date: string
  dateLabel: string
  slotLabel: string
}) {
  // Nunca buscados en el mapa (los "no encontrados" se ubican a mano).
  const unsearched = routes.flatMap((r) => r.unlocated).filter((o) => o.locationStatus === null).length
  const anyStops = routes.some((r) => r.ok && r.stops.length > 0)

  return (
    <section aria-labelledby="recorrido-titulo" className="flex flex-col gap-6 print:gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="hidden text-[10px] uppercase tracking-widest print:block">TodoPack Alcorta</p>
          <h2 id="recorrido-titulo" className="font-semibold print:font-serif print:text-2xl print:font-bold">
            Recorrido de reparto
          </h2>
          <p className="text-sm text-muted-foreground first-letter:uppercase print:text-base print:text-foreground">
            {dateLabel} · {slotLabel}
          </p>
          <p className="text-xs text-muted-foreground print:hidden">
            Ordenado para hacer la menor cantidad de km. Las distancias son en línea recta: por calle suelen ser un
            poco más.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {unsearched > 0 && <OrdersLocateButton date={date} count={unsearched} />}
          <Button
            variant="outline"
            className="h-9 px-3"
            render={<Link href="/admin/configuracion#recorrido" />}
            nativeButton={false}
          >
            <Settings />
            Salida y llegada
          </Button>
          <OrdersPrintButton disabled={!anyStops} />
        </div>
      </div>

      {routes.map((route) => (
        <SlotRoute key={route.slot} route={route} />
      ))}
    </section>
  )
}

function SlotRoute({ route }: { route: DeliveryRoute }) {
  const Icon = SLOT_ICON[route.slot]
  const slotName = route.slot === "mediodia" ? "el mediodía" : "la noche"

  return (
    <section aria-labelledby={`recorrido-${route.slot}`} className="break-inside-avoid-page">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h3 id={`recorrido-${route.slot}`} className="flex items-center gap-2 font-serif text-lg font-bold">
            <Icon className="size-4 text-primary" />
            {DELIVERY_SLOT_LABEL[route.slot]}
          </h3>
          <p className="text-sm text-muted-foreground">
            {route.ok && route.stops.length > 0 ? (
              <>
                <span className="tabular-nums">{plural(route.stops.length, "entrega", "entregas")}</span> ·{" "}
                <span className="font-semibold text-foreground tabular-nums">≈ {formatKm(route.totalKm)}</span>
              </>
            ) : (
              <span className="tabular-nums">{plural(route.pendingCount, "entrega pendiente", "entregas pendientes")}</span>
            )}
            {route.deliveredCount > 0 && (
              <span className="tabular-nums"> · {plural(route.deliveredCount, "ya entregado", "ya entregados")}</span>
            )}
          </p>
        </div>
        {route.ok && route.mapsUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 print:hidden">
            {route.mapsUrls.map((url, i) => (
              <Button
                key={url}
                className="h-9 px-3"
                variant={i === 0 ? "default" : "outline"}
                render={<a href={url} target="_blank" rel="noreferrer" />}
                nativeButton={false}
              >
                <RouteIcon />
                {route.mapsUrls.length === 1 ? "Abrir en Google Maps" : `Google Maps · tramo ${i + 1}`}
              </Button>
            ))}
          </div>
        )}
      </div>

      {!route.ok ? (
        <MissingPlaces missing={route.missing} />
      ) : route.stops.length === 0 && route.unlocated.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No hay entregas pendientes para {slotName}.
        </p>
      ) : route.stops.length > 0 ? (
        <ol className="flex flex-col gap-2">
          <EndpointRow kind="salida" endpoint={route.start} />
          {route.stops.map((stop, i) => (
            <StopRow key={stop.order.id} stop={stop} position={i + 1} />
          ))}
          {route.end ? (
            <EndpointRow kind="llegada" endpoint={route.end} km={route.returnKm} />
          ) : (
            <li className="flex items-center gap-3 px-4 py-2 text-sm text-muted-foreground">
              <Flag className="size-4 shrink-0" />
              Termina en la última entrega.
            </li>
          )}
        </ol>
      ) : null}

      {route.unlocated.length > 0 && <UnlocatedOrders orders={route.unlocated} />}
    </section>
  )
}

function MissingPlaces({ missing }: { missing: RoutePlace[] }) {
  const names = missing.map((p) => ROUTE_PLACE_LABEL[p].toLowerCase())
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-center text-muted-foreground">
      <MapPinOff className="size-10 opacity-30" />
      <p className="max-w-md text-sm">
        Para armar el recorrido falta ubicar en el mapa {names.length === 2 ? "el local y el depósito" : `el ${names[0]}`}.
      </p>
      <Button
        variant="outline"
        className="mt-1 print:hidden"
        render={<Link href="/admin/configuracion#recorrido" />}
        nativeButton={false}
      >
        <Settings />
        Configurar salida y llegada
      </Button>
    </div>
  )
}

function EndpointRow({
  kind,
  endpoint,
  km,
}: {
  kind: "salida" | "llegada"
  endpoint: RouteEndpoint
  km?: number | null
}) {
  const Icon = PLACE_ICON[endpoint.place]
  return (
    <li className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3 print:rounded-none print:border-0 print:bg-transparent print:px-0 print:py-1">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {kind === "salida" ? "Sale del" : "Vuelve al"} {endpoint.label.toLowerCase()}
        </p>
        {endpoint.address && <p className="break-words text-xs text-muted-foreground">{endpoint.address}</p>}
      </div>
      {km != null && <p className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatKm(km)}</p>}
    </li>
  )
}

function PaymentLine({ order }: { order: AdminOrder }) {
  if (order.status === "pendiente_entrega") {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-foreground tabular-nums">
        <Banknote className="size-3.5" />
        {order.total > 0 ? `Cobrar ${formatPrice(order.total)}` : "Cobrar en efectivo"}
      </span>
    )
  }
  if (order.status === "pendiente_validacion") {
    return <Badge variant="outline">{ORDER_STATUS_LABEL.pendiente_validacion}</Badge>
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Landmark className="size-3.5" />
      Pagado por transferencia
    </span>
  )
}

function StopRow({ stop, position }: { stop: RouteStop; position: number }) {
  const { order } = stop
  return (
    <li className="break-inside-avoid rounded-xl border border-border bg-card p-4 print:rounded-none print:border-0 print:border-b print:px-0 print:py-2">
      <div className="flex items-start gap-3">
        <span className="hidden size-4 shrink-0 rounded-sm border border-foreground/60 print:mt-1 print:inline-block" />
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground tabular-nums">
          {position}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="font-semibold leading-tight">{order.customerName}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {orderLabel(order.id)} · {stop.legKm < 0.01 ? "misma dirección" : `a ${formatKm(stop.legKm)}`}
            </p>
          </div>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            <span className="break-words">{order.address}</span>
          </p>
          {order.phone && (
            <a
              href={`tel:${order.phone.replace(/[^\d+]/g, "")}`}
              className="mt-0.5 flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <Phone className="size-3.5 shrink-0" />
              <span className="tabular-nums">{order.phone}</span>
            </a>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <PaymentLine order={order} />
            {order.locationStatus === "aproximada" && <Badge variant="outline">Ubicación aproximada</Badge>}
          </div>
          {order.notes && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-muted px-3 py-2 text-sm">
              <StickyNote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 break-words">
                <span className="font-medium">Nota:</span> {order.notes}
              </span>
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 sm:justify-end print:hidden">
        {order.locationStatus === "aproximada" ? (
          <OrderLocationButton order={order} label="Corregir ubicación" />
        ) : (
          <OrderLocationButton order={order} label="Cambiar ubicación" variant="ghost" className="px-2 text-muted-foreground" />
        )}
        <Button
          variant="outline"
          className="h-9 px-3 sm:h-8"
          render={<a href={googleMapsDirectionsUrl(stop.location)} target="_blank" rel="noreferrer" />}
          nativeButton={false}
        >
          <Navigation />
          Cómo llegar
        </Button>
      </div>
    </li>
  )
}

function UnlocatedOrders({ orders }: { orders: AdminOrder[] }) {
  return (
    <div className="mt-4 rounded-xl border border-border bg-card p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <MapPinOff className="size-4 text-muted-foreground" />
        Sin ubicar: no entran en el recorrido ({orders.length})
      </h4>
      <ul className="mt-2 flex flex-col divide-y divide-border">
        {orders.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {o.customerName} <span className="text-xs font-normal text-muted-foreground tabular-nums">{orderLabel(o.id)}</span>
              </p>
              <p className="break-words text-xs text-muted-foreground">
                {o.address} ·{" "}
                {o.locationStatus === "no_encontrada" ? "no la encontramos en el mapa" : "todavía no se buscó en el mapa"}
              </p>
            </div>
            <OrderLocationButton order={o} label="Ubicar" className="print:hidden" />
          </li>
        ))}
      </ul>
    </div>
  )
}
