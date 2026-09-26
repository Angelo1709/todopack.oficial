// Modelo de estados de un pedido. Único lugar donde se definen estados, franjas y transiciones.
//
// Transferencia: pendiente_validacion -> pagado -> entregado
// Efectivo:      pendiente_entrega -> pagado   (se cobra al entregar: "pagado" es el estado final)
// Cualquier pedido no finalizado puede pasar a "cancelado".

export const PAYMENT_METHODS = ["efectivo", "transferencia"] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const DELIVERY_SLOTS = ["mediodia", "noche"] as const
export type DeliverySlot = (typeof DELIVERY_SLOTS)[number]

export const ORDER_STATUSES = [
  "pendiente_validacion",
  "pendiente_entrega",
  "pagado",
  "entregado",
  "cancelado",
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
}

export const DELIVERY_SLOT_LABEL: Record<DeliverySlot, string> = {
  mediodia: "Mediodía",
  noche: "Noche",
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pendiente_validacion: "Pago pendiente de validación",
  pendiente_entrega: "Pendiente de entrega",
  pagado: "Pagado",
  entregado: "Entregado",
  cancelado: "Cancelado",
}

const FLOW: Record<PaymentMethod, OrderStatus[]> = {
  transferencia: ["pendiente_validacion", "pagado", "entregado"],
  efectivo: ["pendiente_entrega", "pagado"],
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return PAYMENT_METHODS.includes(value as PaymentMethod)
}

export function isDeliverySlot(value: unknown): value is DeliverySlot {
  return DELIVERY_SLOTS.includes(value as DeliverySlot)
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus)
}

export function initialStatus(method: PaymentMethod): OrderStatus {
  return FLOW[method][0]
}

/** Etapas del flujo para ese medio de pago (sin "cancelado"), útil para dibujar un progreso. */
export function statusFlow(method: PaymentMethod): OrderStatus[] {
  return FLOW[method]
}

export function isFinalStatus(method: PaymentMethod, status: OrderStatus): boolean {
  return status === "cancelado" || FLOW[method].at(-1) === status
}

/** Estados a los que puede pasar un pedido desde `status`. */
export function nextStatuses(method: PaymentMethod, status: OrderStatus): OrderStatus[] {
  if (isFinalStatus(method, status)) return []
  const flow = FLOW[method]
  const next = flow[flow.indexOf(status) + 1]
  return next ? [next, "cancelado"] : ["cancelado"]
}

export function canTransition(method: PaymentMethod, from: OrderStatus, to: OrderStatus): boolean {
  return nextStatuses(method, from).includes(to)
}

/** Texto del botón que lleva un pedido al estado `to`. */
export function transitionLabel(method: PaymentMethod, to: OrderStatus): string {
  if (to === "cancelado") return "Cancelar pedido"
  if (to === "pagado") return method === "transferencia" ? "Validar pago" : "Entregado y cobrado"
  if (to === "entregado") return "Marcar entregado"
  return ORDER_STATUS_LABEL[to]
}

export function statusVariant(status: OrderStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "pagado":
    case "entregado":
      return "default"
    case "cancelado":
      return "destructive"
    case "pendiente_entrega":
      return "secondary"
    default:
      return "outline"
  }
}
