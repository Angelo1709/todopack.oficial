import { OrdersPrintButton } from "@/components/admin/orders-print-button"
import type { LoadLine } from "@/lib/admin-orders-utils"
import { Truck } from "lucide-react"

/** "Carga del día": productos consolidados de los pedidos no cancelados, lista para imprimir. */
export function OrdersLoadingSheet({
  lines,
  dateLabel,
  slotLabel,
  ordersCount,
}: {
  lines: LoadLine[]
  dateLabel: string
  slotLabel: string
  ordersCount: number
}) {
  return (
    <section
      aria-labelledby="carga-titulo"
      className="rounded-xl border border-border bg-card p-4 sm:p-5 print:rounded-none print:border-0 print:p-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="hidden text-[10px] uppercase tracking-widest print:block">TodoPack Alcorta</p>
          <h2 id="carga-titulo" className="font-semibold print:font-serif print:text-2xl print:font-bold">
            Carga del día
          </h2>
          <p className="text-sm text-muted-foreground first-letter:uppercase print:text-base print:text-foreground">
            {dateLabel} · {slotLabel}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {ordersCount} {ordersCount === 1 ? "pedido" : "pedidos"} · {lines.length}{" "}
            {lines.length === 1 ? "producto" : "productos"}
          </p>
        </div>
        <OrdersPrintButton disabled={lines.length === 0} />
      </div>

      {lines.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-center text-muted-foreground">
          <Truck className="size-10 opacity-30" />
          <p className="text-sm">No hay nada para cargar en esta fecha y franja.</p>
        </div>
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground print:text-foreground">
              <th className="hidden w-7 py-2 print:table-cell">
                <span className="sr-only">Cargado</span>
              </th>
              <th className="py-2 pr-3 font-medium">Producto</th>
              <th className="px-3 py-2 text-right font-medium">Cantidad</th>
              <th className="py-2 pl-3 text-right font-medium">Unidades</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className="break-inside-avoid border-b border-border last:border-0">
                <td className="hidden py-2 align-top print:table-cell">
                  <span className="inline-block size-4 rounded-sm border border-foreground/60" />
                </td>
                <td className="py-2 pr-3">{l.name}</td>
                <td className="px-3 py-2 text-right align-top font-semibold tabular-nums">{l.quantity}</td>
                <td className="py-2 pl-3 text-right align-top whitespace-nowrap text-muted-foreground tabular-nums print:text-foreground">
                  {l.packSize > 1 ? `${l.units} u.` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Cantidad = packs, cajas o unidades sueltas pedidas. No incluye pedidos cancelados.
      </p>
    </section>
  )
}
