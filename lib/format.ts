export function formatPrice(pesos: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(pesos)
}

/** Número de pedido visible: 201 -> "00201". */
export function formatOrderNumber(id: number) {
  return String(id).padStart(5, "0")
}
