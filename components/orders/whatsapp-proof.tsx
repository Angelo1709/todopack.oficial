import { Button } from "@/components/ui/button"
import { formatOrderNumber } from "@/lib/format"
import { transferProofWhatsappUrl } from "@/lib/order-messages"
import { cn } from "@/lib/utils"
import { MessageCircle } from "lucide-react"

/**
 * Botón grande para mandar el comprobante de transferencia por WhatsApp con el mensaje precargado.
 * Si la distribuidora no cargó su número, muestra cómo hacerlo a mano.
 */
export function WhatsappProofButton({
  whatsappNumber,
  order,
  className,
}: {
  whatsappNumber: string
  order: { id: number; total: number; customerName: string }
  className?: string
}) {
  const url = transferProofWhatsappUrl(whatsappNumber, order)

  if (!url) {
    return (
      <p className={cn("rounded-lg bg-muted p-4 text-sm text-muted-foreground", className)}>
        Enviá el comprobante al WhatsApp de la distribuidora indicando el número de pedido{" "}
        <span className="font-semibold text-foreground">#{formatOrderNumber(order.id)}</span>.
      </p>
    )
  }

  return (
    <Button
      render={<a href={url} target="_blank" rel="noreferrer" />}
      nativeButton={false}
      size="lg"
      className={cn("h-11 w-full gap-2 text-base", className)}
    >
      <MessageCircle className="size-5" />
      Enviar comprobante por WhatsApp
    </Button>
  )
}
