// Textos de pedidos que se usan en más de una pantalla (éxito del checkout, /pedido/[token], mis pedidos).
import { formatOrderNumber, formatPrice } from "@/lib/format"
import { whatsappUrl } from "@/lib/whatsapp"
import type { OrderStatus, PaymentMethod } from "@/lib/order-status"

type ProofOrder = { id: number; total: number; customerName: string }

/** Mensaje precargado para mandar el comprobante de transferencia por WhatsApp. */
export function transferProofMessage(order: ProofOrder): string {
  // formatPrice usa espacio duro ("$ 15.000"); en el mensaje va un espacio común.
  const total = formatPrice(order.total).replace(/ /g, " ")
  return `¡Hola! Realicé el pedido #${formatOrderNumber(order.id)} por ${total} a nombre de ${order.customerName.trim()}. Debajo adjunto el comprobante de la transferencia.`
}

/** Link wa.me con el mensaje del comprobante, o null si la distribuidora no cargó su WhatsApp. */
export function transferProofWhatsappUrl(whatsappNumber: string, order: ProofOrder): string | null {
  if (!whatsappNumber.replace(/\D/g, "")) return null
  return whatsappUrl(whatsappNumber, transferProofMessage(order))
}

/** Una línea que explica qué sigue según el estado del pedido. */
export function orderStatusHint(method: PaymentMethod, status: OrderStatus): string {
  if (status === "cancelado") return "Este pedido fue cancelado. Si tenés dudas, escribinos por WhatsApp."
  if (method === "transferencia") {
    if (status === "pendiente_validacion") {
      return "Cuando recibamos el comprobante y confirmemos la transferencia, preparamos tu pedido."
    }
    if (status === "pagado") return "Confirmamos tu pago. Te llevamos el pedido en la fecha y franja elegidas."
    return "Tu pedido fue entregado. ¡Gracias por tu compra!"
  }
  if (status === "pendiente_entrega") {
    return "Te llevamos el pedido en la fecha y franja elegidas. Pagás en efectivo al recibirlo."
  }
  return "Pedido entregado y cobrado. ¡Gracias por tu compra!"
}

/** "Pack x6" para presentaciones de más de una unidad, salvo que el nombre ya lo diga. */
export function packLabel(name: string, packSize: unknown): string | null {
  const size = Number(packSize)
  if (!Number.isInteger(size) || size <= 1) return null
  if (new RegExp(`x\\s*${size}\\b`, "i").test(name)) return null
  return `Pack x${size}`
}
