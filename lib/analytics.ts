// Métricas de producto con PostHog (se inicializa en instrumentation-client.ts).
// Sin NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN no se manda nada: todas estas funciones no hacen nada.
//
// Nunca mandar datos personales (nombre, teléfono, email, dirección): sólo ids, cantidades y montos.
// Embudo de ventas recomendado en PostHog (docs/metricas-posthog.md):
//   $pageview → product_added → checkout_started → order_completed
import posthog from "posthog-js"
import { isAdminRole } from "@/lib/roles"

/** Catálogo de eventos: un solo lugar con los nombres, así el embudo no se rompe por un typo. */
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
  /** Abrió el checkout con productos en el carrito. */
  checkoutStarted: "checkout_started",
  paymentMethodSelected: "payment_method_selected",
  deliverySlotSelected: "delivery_slot_selected",
  checkoutError: "checkout_error",
  /** Pedido confirmado (venta cerrada desde la tienda). Lleva el monto en `revenue`. */
  orderCompleted: "order_completed",
  paymentDetailCopied: "payment_detail_copied",
  whatsappProofClicked: "whatsapp_proof_clicked",
  signedUp: "signed_up",
  signedIn: "signed_in",
} as const

type EventName = (typeof EVENTS)[keyof typeof EVENTS]
type Props = Record<string, string | number | boolean | null | undefined>

function enabled(): boolean {
  return typeof window !== "undefined" && Boolean(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) && posthog.__loaded
}

export function track(event: EventName, props?: Props) {
  if (!enabled()) return
  try {
    posthog.capture(event, props)
  } catch {
    // Las métricas nunca tienen que romper la compra.
  }
}

/**
 * Vincula la sesión con la cuenta (id de Better Auth, nunca email ni nombre). Los admins y superadmins
 * dejan de registrar eventos en ese navegador para no inflar las métricas de clientes.
 */
export function identifyUser(user: { id: string; role?: string | null }) {
  if (!enabled()) return
  try {
    if (isAdminRole(user.role)) {
      posthog.opt_out_capturing()
      return
    }
    if (posthog.get_distinct_id() !== user.id) posthog.identify(user.id, { role: user.role ?? "customer" })
  } catch {
    // ignore
  }
}

/** Al cerrar sesión: la próxima visita vuelve a ser anónima. */
export function resetAnalytics() {
  if (!enabled()) return
  try {
    posthog.reset()
  } catch {
    // ignore
  }
}
