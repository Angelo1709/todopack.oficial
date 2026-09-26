export const ORDER_STATUS_LABEL: Record<string, string> = {
  nuevo: "Nuevo",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
}

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pendiente: "Pago pendiente",
  pagado: "Pagado",
  rechazado: "Rechazado",
}

export function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "entregado":
      return "default"
    case "cancelado":
      return "destructive"
    case "en_camino":
      return "secondary"
    default:
      return "outline"
  }
}
