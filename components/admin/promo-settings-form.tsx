"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { updatePromoSettings } from "@/app/actions/promo"
import { ToggleSwitch } from "@/components/admin/toggle-switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { formatPrice } from "@/lib/format"
import { announcementOf, defaultAnnouncement, isWebDiscountPercent, MAX_ANNOUNCEMENT_LENGTH, MAX_WEB_DISCOUNT, type PromoSettings } from "@/lib/promo"
import { cn } from "@/lib/utils"
import { BadgePercent, Megaphone } from "lucide-react"

const QUICK_PERCENTS = [5, 10, 15, 20]
const EXAMPLE_PRICE = 10000

/** Descuento web general y barra de anuncio (Admin → Promociones). */
export function PromoSettingsForm({ initial }: { initial: PromoSettings }) {
  const [values, setValues] = useState(initial)
  const [percentDraft, setPercentDraft] = useState(String(initial.webDiscountPercent))
  const [saved, setSaved] = useState(initial)
  const [pending, startTransition] = useTransition()

  const percent = Number(percentDraft)
  const percentOk = isWebDiscountPercent(percent)
  const preview = announcementOf({ ...values, webDiscountPercent: percentOk ? percent : values.webDiscountPercent })
  const dirty = JSON.stringify({ ...values, webDiscountPercent: percent }) !== JSON.stringify(saved)

  function set<K extends keyof PromoSettings>(key: K, value: PromoSettings[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!percentOk) return toast.error(`El descuento tiene que ser un número entero entre 1 y ${MAX_WEB_DISCOUNT}%.`)
    startTransition(async () => {
      try {
        const result = await updatePromoSettings({ ...values, webDiscountPercent: percent })
        if (result.ok && result.values) {
          setValues(result.values)
          setSaved(result.values)
          setPercentDraft(String(result.values.webDiscountPercent))
          toast.success(
            result.values.webDiscountActive
              ? `Listo: ${result.values.webDiscountPercent}% OFF en toda la tienda`
              : "Promociones guardadas",
          )
        } else if (!result.ok) {
          toast.error(result.error)
        }
      } catch {
        toast.error("No pudimos guardar. Revisá la conexión y probá de nuevo.")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold">
            <BadgePercent className="size-4 text-primary" /> Descuento en toda la tienda
          </h2>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-semibold",
              saved.webDiscountActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {saved.webDiscountActive ? `Activo · ${saved.webDiscountPercent}% OFF` : "Apagado"}
          </span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Un descuento sobre todos los productos, para todos los pedidos hechos en la web. Los clientes ven el precio
          rebajado (con el anterior tachado) en el catálogo, el carrito y el checkout. Los pedidos que cargás a mano
          desde el panel no lo tienen.
        </p>

        <ToggleSwitch
          id="webDiscountActive"
          checked={values.webDiscountActive}
          onChange={(checked) => set("webDiscountActive", checked)}
          disabled={pending}
          label="Aplicar el descuento a todos los productos"
          description={values.webDiscountActive ? "Al guardar, todos los precios de la tienda bajan." : "Al guardar, los precios vuelven a los de lista."}
        />

        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="webDiscountPercent">Porcentaje de descuento</Label>
          <div className="flex flex-wrap items-center gap-2">
            {QUICK_PERCENTS.map((p) => (
              <Button
                key={p}
                type="button"
                variant={percent === p ? "default" : "outline"}
                aria-pressed={percent === p}
                onClick={() => setPercentDraft(String(p))}
                disabled={pending}
                className="h-11 min-w-14 rounded-full font-semibold tabular-nums"
              >
                {p}%
              </Button>
            ))}
            <div className="flex items-center gap-1.5">
              <Input
                id="webDiscountPercent"
                inputMode="numeric"
                value={percentDraft}
                onChange={(e) => setPercentDraft(e.target.value.replace(/\D/g, "").slice(0, 2))}
                aria-invalid={!percentOk || undefined}
                aria-describedby="webDiscountPercent-help"
                disabled={pending}
                className="h-11 w-20 text-center text-base font-semibold tabular-nums"
              />
              <span className="text-sm font-semibold">%</span>
            </div>
          </div>
          <p id="webDiscountPercent-help" className={cn("text-xs", percentOk ? "text-muted-foreground" : "text-destructive")}>
            {percentOk
              ? `Ej.: un producto de ${formatPrice(EXAMPLE_PRICE)} queda en ${formatPrice(Math.round((EXAMPLE_PRICE * (100 - percent)) / 100))}.`
              : `Ingresá un número entero entre 1 y ${MAX_WEB_DISCOUNT}.`}
          </p>
        </div>

        <p className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">No se suma a las ofertas de cada producto:</span> si un producto
          ya tiene su propia oferta (por ejemplo 20% OFF o un 2x1), se cobra la que más le conviene al cliente. Los precios
          de lista y los de Gestión no se tocan: al apagarlo todo vuelve a la normalidad.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <Megaphone className="size-4 text-primary" /> Barra de anuncio
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Una franja con un mensaje corto, arriba de todas las páginas de la tienda.
        </p>

        <ToggleSwitch
          id="announcementActive"
          checked={values.announcementActive}
          onChange={(checked) => set("announcementActive", checked)}
          disabled={pending}
          label="Mostrar la barra arriba de la tienda"
        />

        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="announcementText">Texto</Label>
          <Input
            id="announcementText"
            value={values.announcementText}
            onChange={(e) => set("announcementText", e.target.value)}
            maxLength={MAX_ANNOUNCEMENT_LENGTH}
            placeholder={defaultAnnouncement(percentOk ? percent : values.webDiscountPercent)}
            aria-describedby="announcementText-help"
            disabled={pending}
            className="h-11 text-base sm:text-sm"
          />
          <p id="announcementText-help" className="text-xs text-muted-foreground">
            Si lo dejás vacío y el descuento está activo, la barra dice «
            {defaultAnnouncement(percentOk ? percent : values.webDiscountPercent)}». {values.announcementText.length}/
            {MAX_ANNOUNCEMENT_LENGTH}
          </p>
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Así se ve</p>
          {preview ? (
            <div className="overflow-hidden rounded-lg bg-primary px-4 py-2 text-center text-sm font-bold text-primary-foreground">
              {preview}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border px-4 py-2 text-center text-sm text-muted-foreground">
              {values.announcementActive ? "Escribí un texto o activá el descuento." : "La barra está apagada."}
            </p>
          )}
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        {dirty && <span className="text-xs text-muted-foreground">Tenés cambios sin guardar</span>}
        <Button type="submit" disabled={pending || !percentOk} className="h-11 min-w-32 rounded-xl font-semibold">
          {pending && <Spinner />} Guardar
        </Button>
      </div>
    </form>
  )
}
