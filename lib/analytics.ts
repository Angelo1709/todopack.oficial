// Métricas de producto con PostHog (se inicializa en instrumentation-client.ts).
// Sin NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN no se manda nada: todas estas funciones no hacen nada.
//
// Nunca mandar datos personales (nombre, teléfono, email, dirección): sólo ids, cantidades y montos.
// Embudo de ventas recomendado en PostHog (docs/metricas-posthog.md):
//   $pageview → product_added → checkout_started → order_completed
import posthog from "posthog-js"
import { isAdminRole } from "@/lib/roles"
import { EVENTS, type EventName } from "@/lib/analytics-events"

export { EVENTS }

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
