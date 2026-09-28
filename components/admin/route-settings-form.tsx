"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { updateRouteSettings, type FoundLocation } from "@/app/actions/reparto"
import { LocationPreview, useLocationFinder } from "@/components/admin/location-search"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import {
  ROUTE_PLACE_LABEL,
  formatLatLng,
  parseLatLng,
  type RouteEnd,
  type RoutePlace,
} from "@/lib/route"
import type { RouteSettingKey, RouteSettingsValues } from "@/lib/settings"
import { cn } from "@/lib/utils"
import { Flag, LocateFixed, Route, Search, Store, Warehouse, type LucideIcon } from "lucide-react"

type FieldErrors = Partial<Record<RouteSettingKey, string>>

const PLACE_ICON: Record<RoutePlace, LucideIcon> = { local: Store, deposito: Warehouse }
const ADDRESS_KEY = { local: "localAddress", deposito: "depotAddress" } as const
const LOCATION_KEY = { local: "localLocation", deposito: "depotLocation" } as const

/** Salida y llegada del recorrido de reparto, con el local y el depósito ubicados en el mapa. */
export function RouteSettingsForm({ initial }: { initial: RouteSettingsValues }) {
  const [values, setValues] = useState<RouteSettingsValues>(initial)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [pending, startTransition] = useTransition()

  function set(key: RouteSettingKey, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const result = await updateRouteSettings(values)
        if (result.ok) {
          setValues(result.values)
          setErrors({})
          toast.success("Recorrido guardado")
        } else {
          setErrors(result.fieldErrors ?? {})
          toast.error(result.error)
        }
      } catch {
        toast.error("No pudimos guardar el recorrido. Revisá la conexión y probá de nuevo.")
      }
    })
  }

  const start = values.routeStart as RoutePlace
  const end = values.routeEnd as RouteEnd

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <section id="recorrido" className="scroll-mt-24 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <Route className="size-4 text-primary" /> Recorrido de reparto
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          De dónde sale el auto y adónde vuelve. Con esto se ordenan las entregas de cada franja para hacer la menor
          cantidad de km (pestaña Recorrido del panel de pedidos).
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="routeCity">Localidad</Label>
          <Input
            id="routeCity"
            name="routeCity"
            autoComplete="off"
            placeholder="Alcorta, Santa Fe"
            value={values.routeCity}
            onChange={(e) => set("routeCity", e.target.value)}
            aria-invalid={errors.routeCity ? true : undefined}
            className="h-9"
          />
          {errors.routeCity ? (
            <p className="text-xs text-destructive">{errors.routeCity}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Se agrega a las direcciones de los pedidos que no la dicen, para encontrarlas en el mapa.
            </p>
          )}
        </div>

        <div className="mt-4 grid gap-4">
          {(["local", "deposito"] as const).map((place) => (
            <PlaceFields
              key={place}
              place={place}
              address={values[ADDRESS_KEY[place]]}
              location={values[LOCATION_KEY[place]]}
              onAddress={(v) => set(ADDRESS_KEY[place], v)}
              onLocation={(v) => set(LOCATION_KEY[place], v)}
              addressError={errors[ADDRESS_KEY[place]]}
              locationError={errors[LOCATION_KEY[place]]}
            />
          ))}
        </div>

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium">Sale de</legend>
          <div role="radiogroup" aria-label="Sale de" className="grid gap-2 sm:grid-cols-2">
            {(["local", "deposito"] as const).map((place) => (
              <ChoiceButton
                key={place}
                icon={PLACE_ICON[place]}
                title={ROUTE_PLACE_LABEL[place]}
                active={start === place}
                onClick={() => set("routeStart", place)}
              />
            ))}
          </div>
          {errors.routeStart && <p className="mt-1 text-xs text-destructive">{errors.routeStart}</p>}
        </fieldset>

        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium">Termina en</legend>
          <div role="radiogroup" aria-label="Termina en" className="grid gap-2 sm:grid-cols-3">
            {(["local", "deposito"] as const).map((place) => (
              <ChoiceButton
                key={place}
                icon={PLACE_ICON[place]}
                title={ROUTE_PLACE_LABEL[place]}
                hint="Vuelve al terminar"
                active={end === place}
                onClick={() => set("routeEnd", place)}
              />
            ))}
            <ChoiceButton
              icon={Flag}
              title="Última entrega"
              hint="No vuelve"
              active={end === "ultima"}
              onClick={() => set("routeEnd", "ultima")}
            />
          </div>
          {errors.routeEnd && <p className="mt-1 text-xs text-destructive">{errors.routeEnd}</p>}
        </fieldset>

        <p className="mt-4 rounded-lg bg-muted p-4 text-sm">
          <span className="text-muted-foreground">Así queda: </span>
          sale del {ROUTE_PLACE_LABEL[start]?.toLowerCase() ?? "—"}, hace las entregas en el orden más corto y{" "}
          {end === "ultima" ? "termina en la última entrega" : `vuelve al ${ROUTE_PLACE_LABEL[end]?.toLowerCase() ?? "—"}`}.
        </p>
      </section>

      <Button type="submit" size="lg" className="h-10 w-full sm:w-auto sm:self-end" disabled={pending}>
        {pending && <Spinner aria-label="Guardando" />}
        {pending ? "Guardando..." : "Guardar recorrido"}
      </Button>
    </form>
  )
}

function ChoiceButton({
  icon: Icon,
  title,
  hint,
  active,
  onClick,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
        active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
      )}
    >
      <Icon className={cn("size-5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </button>
  )
}

/** Dirección (se muestra en el recorrido) y ubicación en el mapa de un punto fijo. */
function PlaceFields({
  place,
  address,
  location,
  onAddress,
  onLocation,
  addressError,
  locationError,
}: {
  place: RoutePlace
  address: string
  location: string
  onAddress: (value: string) => void
  onLocation: (value: string) => void
  addressError?: string
  locationError?: string
}) {
  const Icon = PLACE_ICON[place]
  const [found, setFound] = useState<FoundLocation | null>(null)
  const [pasted, setPasted] = useState("")
  const [searching, setSearching] = useState<"direccion" | "pegado" | null>(null)
  const finder = useLocationFinder((result) => {
    setFound(result)
    onLocation(formatLatLng(result.location))
    setPasted("")
  })
  const current = parseLatLng(location)
  const id = (name: string) => `${place}-${name}`

  function find(which: "direccion" | "pegado", query: string) {
    setSearching(which)
    finder.find(query)
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-primary" />
        {ROUTE_PLACE_LABEL[place]}
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("direccion")}>Dirección</Label>
        <div className="flex gap-2">
          <Input
            id={id("direccion")}
            autoComplete="off"
            placeholder="Calle y número"
            value={address}
            onChange={(e) => onAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                find("direccion", address)
              }
            }}
            aria-invalid={addressError ? true : undefined}
            className="h-9 min-w-0"
          />
          <Button
            type="button"
            variant="outline"
            className="h-9 shrink-0 px-3"
            disabled={finder.pending || !address.trim()}
            onClick={() => find("direccion", address)}
          >
            {finder.pending && searching === "direccion" ? <Spinner aria-label="Buscando" /> : <Search />}
            Ubicar
          </Button>
        </div>
        {addressError && <p className="text-xs text-destructive">{addressError}</p>}
      </div>

      {current ? (
        <LocationPreview
          location={current}
          precision={found?.precision}
          label={found?.label ?? "Ubicación guardada"}
        />
      ) : (
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Todavía no está ubicado en el mapa: escribí la dirección y tocá Ubicar.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id("coordenadas")} className="text-xs font-normal text-muted-foreground">
          ¿No aparece o quedó mal? En Google Maps mantené apretado sobre el lugar y pegá acá las coordenadas o el
          link para compartir.
        </Label>
        <div className="flex gap-2">
          <Input
            id={id("coordenadas")}
            autoComplete="off"
            placeholder="-33.5321, -61.1234"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                find("pegado", pasted)
              }
            }}
            className="h-9 min-w-0 font-mono"
          />
          <Button
            type="button"
            variant="outline"
            className="h-9 shrink-0 px-3"
            disabled={finder.pending || !pasted.trim()}
            onClick={() => find("pegado", pasted)}
          >
            {finder.pending && searching === "pegado" ? <Spinner aria-label="Buscando" /> : <LocateFixed />}
            Usar
          </Button>
        </div>
      </div>

      {(finder.error || locationError) && (
        <p className="text-xs text-destructive" role="alert">
          {finder.error ?? locationError}
        </p>
      )}
    </div>
  )
}
