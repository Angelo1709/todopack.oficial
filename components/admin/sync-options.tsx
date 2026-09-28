"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { updateSyncOptions } from "@/app/actions/sistema"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { Eye, EyeOff, PencilLine, RefreshCw, type LucideIcon } from "lucide-react"

type Options = { stockInStore: boolean; pricesFromSystem: boolean }

function Choice({
  icon: Icon,
  title,
  hint,
  active,
  disabled,
  loading,
  onClick,
}: {
  icon: LucideIcon
  title: string
  hint: string
  active: boolean
  disabled: boolean
  loading: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-60",
        active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
      )}
    >
      {loading ? <Spinner className="size-5 shrink-0 text-primary" /> : <Icon className="size-5 shrink-0 text-primary" />}
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  )
}

/** Stock en la tienda (sí/no) y de dónde salen los precios. Cada opción se guarda al tocarla. */
export function SyncOptions(initial: Options) {
  const [values, setValues] = useState<Options>(initial)
  const [saving, setSaving] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save(next: Options, key: string, message: string) {
    const previous = values
    setValues(next)
    setSaving(key)
    startTransition(async () => {
      try {
        const result = await updateSyncOptions(next)
        if (result.ok) toast.success(message)
        else {
          setValues(previous)
          toast.error(result.error)
        }
      } catch {
        setValues(previous)
        toast.error("No pudimos guardar el cambio. Revisá la conexión y probá de nuevo.")
      } finally {
        setSaving(null)
      }
    })
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 font-semibold">Opciones</h2>

      <p id="stock-label" className="mb-2 text-sm font-medium">
        Stock
      </p>
      <div role="radiogroup" aria-labelledby="stock-label" className="grid gap-2 sm:grid-cols-2">
        <Choice
          icon={EyeOff}
          title="Sólo en el panel"
          hint="La tienda vende todo; el stock lo ves acá para comprobar que cierra."
          active={!values.stockInStore}
          disabled={pending}
          loading={saving === "stock-off"}
          onClick={() =>
            values.stockInStore &&
            save({ ...values, stockInStore: false }, "stock-off", "Listo: el stock se ve sólo en el panel")
          }
        />
        <Choice
          icon={Eye}
          title="Mostrar en la tienda"
          hint="Lo que no tiene stock aparece como “Sin stock” y no se puede comprar."
          active={values.stockInStore}
          disabled={pending}
          loading={saving === "stock-on"}
          onClick={() =>
            !values.stockInStore &&
            save({ ...values, stockInStore: true }, "stock-on", "Listo: la tienda ya muestra el stock")
          }
        />
      </div>

      <p id="precios-label" className="mb-2 mt-5 text-sm font-medium">
        Precios
      </p>
      <div role="radiogroup" aria-labelledby="precios-label" className="grid gap-2 sm:grid-cols-2">
        <Choice
          icon={RefreshCw}
          title="Del sistema del local"
          hint="Precio de venta con IVA. Si lo cambiás en la tienda, la próxima sincronización lo pisa."
          active={values.pricesFromSystem}
          disabled={pending}
          loading={saving === "precios-on"}
          onClick={() =>
            !values.pricesFromSystem &&
            save(
              { ...values, pricesFromSystem: true },
              "precios-on",
              "Listo: los precios se actualizan en la próxima sincronización",
            )
          }
        />
        <Choice
          icon={PencilLine}
          title="Los cargo yo"
          hint="La sincronización trae sólo el stock. Los precios, desde Productos o la lista de Excel."
          active={!values.pricesFromSystem}
          disabled={pending}
          loading={saving === "precios-off"}
          onClick={() =>
            values.pricesFromSystem &&
            save({ ...values, pricesFromSystem: false }, "precios-off", "Listo: los precios los manejás desde la tienda")
          }
        />
      </div>
    </section>
  )
}
