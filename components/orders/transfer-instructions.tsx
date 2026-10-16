"use client"

import { CopyButton } from "@/components/checkout/copy-button"
import { WhatsappProofButton } from "@/components/orders/whatsapp-proof"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"

export type BankInfo = { alias: string; cbu: string; holder: string }

/**
 * Datos para transferir (alias, CBU y titular con botón de copiar) y, si ya hay pedido, el botón
 * para mandar el comprobante por WhatsApp. Se usa en el checkout, en la pantalla de éxito y en
 * /pedido/[token], para que el cliente pueda volver a ver el alias aunque cierre la confirmación.
 */
export function TransferInstructions({
  bank,
  amount,
  order,
  whatsappNumber = "",
  className,
}: {
  bank: BankInfo
  /** Monto a transferir. */
  amount?: number
  /** Con pedido se muestra el botón del comprobante por WhatsApp. */
  order?: { id: number; total: number; customerName: string }
  whatsappNumber?: string
  className?: string
}) {
  const hasBankInfo = Boolean(bank.alias || bank.cbu || bank.holder)

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="rounded-lg bg-muted p-4 text-sm">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="font-medium">Datos para transferir</p>
          {amount !== undefined && amount > 0 && (
            <p className="flex items-center gap-1 text-muted-foreground">
              Total{" "}
              <span className="text-base font-bold tabular-nums text-foreground">{formatPrice(amount)}</span>
              <CopyButton value={String(amount)} label="monto" />
            </p>
          )}
        </div>
        {hasBankInfo ? (
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-muted-foreground">
            {bank.alias && (
              <>
                <dt>Alias</dt>
                <dd className="flex min-w-0 items-center gap-1">
                  <span className="break-all font-mono text-base font-semibold tracking-tight text-foreground">
                    {bank.alias}
                  </span>
                  <CopyButton value={bank.alias} label="alias" />
                </dd>
              </>
            )}
            {bank.cbu && (
              <>
                <dt>CBU</dt>
                <dd className="flex min-w-0 items-center gap-1">
                  <span className="break-all font-mono tracking-tight text-foreground">{bank.cbu}</span>
                  <CopyButton value={bank.cbu} label="CBU" />
                </dd>
              </>
            )}
            {bank.holder && (
              <>
                <dt>Titular</dt>
                <dd className="py-1 text-foreground">{bank.holder}</dd>
              </>
            )}
          </dl>
        ) : (
          <p className="text-muted-foreground">Pedinos los datos bancarios por WhatsApp.</p>
        )}
      </div>

      {order && (
        <>
          <WhatsappProofButton whatsappNumber={whatsappNumber} order={order} />
          <p className="text-center text-xs text-muted-foreground">
            Después de transferir, mandanos la captura del comprobante. El mensaje ya lleva tu número de pedido.
          </p>
        </>
      )}
    </div>
  )
}
