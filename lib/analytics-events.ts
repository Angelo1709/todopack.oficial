// Catálogo de eventos de PostHog: un solo lugar con los nombres, así el embudo no se rompe por un typo.
// Sin dependencias: lo usan el navegador (lib/analytics.ts) y el servidor (panel de métricas, lib/posthog-api.ts).
export const EVENTS = {
  /** Agregó un artículo al carrito (botón "Agregar" o primera unidad). */
  productAdded: "product_added",
  /** Cambió la cantidad de un artículo que ya estaba en el carrito. */
  cartUpdated: "cart_updated",
  productRemoved: "product_removed",
  cartViewed: "cart_viewed",
  /** Búsqueda con su cantidad de resultados (las de 0 resultados = productos que piden y no hay). */
  productsSearched: "products_searched",
  categorySelected: "category_selected",
  offersViewed: "offers_viewed",
  /** Tocó un banner de la portada con link (`position` 1, 2...; `banner_id`, nunca datos personales). */
  bannerClicked: "banner_clicked",
  /** Abrió el checkout con productos en el carrito. */
  checkoutStarted: "checkout_started",
  /** Tocó "Confirmar pedido" (antes de validar): separa al que abandona el formulario del que lo intenta y falla. */
  checkoutSubmitted: "checkout_submitted",
  paymentMethodSelected: "payment_method_selected",
  deliverySlotSelected: "delivery_slot_selected",
  /** Un campo no pasó la validación (`source`: "formulario" en el navegador, "servidor" al confirmar). */
  checkoutError: "checkout_error",
  /** Pedido confirmado (venta cerrada desde la tienda). Lleva el monto en `revenue`. */
  orderCompleted: "order_completed",
  paymentDetailCopied: "payment_detail_copied",
  whatsappProofClicked: "whatsapp_proof_clicked",
  signedUp: "signed_up",
  signedIn: "signed_in",
} as const

export type EventName = (typeof EVENTS)[keyof typeof EVENTS]

/** Pasos del embudo de ventas, en orden (mismo embudo que el tablero de PostHog). */
export const FUNNEL_EVENTS = ["$pageview", EVENTS.productAdded, EVENTS.checkoutStarted, EVENTS.orderCompleted] as const

/** Embudo de carritos: de agregar un producto a confirmar, para ver en qué paso se pierden los carritos. */
export const CART_FUNNEL_EVENTS = [
  EVENTS.productAdded,
  EVENTS.cartViewed,
  EVENTS.checkoutStarted,
  EVENTS.checkoutSubmitted,
  EVENTS.orderCompleted,
] as const
