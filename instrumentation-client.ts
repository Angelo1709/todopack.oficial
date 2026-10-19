// Métricas con PostHog: corre en el navegador antes de que la página sea interactiva.
// Sin NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN no se carga nada (desarrollo, previews). Ver docs/metricas-posthog.md.
import posthog from "posthog-js"

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
const region = process.env.NEXT_PUBLIC_POSTHOG_REGION === "eu" ? "eu" : "us"

if (token) {
  try {
    posthog.init(token, {
      // Pasa por /ingest (rewrites de next.config.mjs): queda en nuestro dominio y los bloqueadores
      // de publicidad lo cortan menos.
      api_host: "/ingest",
      ui_host: `https://${region}.posthog.com`,
      defaults: "2026-05-30",
      // Perfiles sólo para cuentas: los visitantes anónimos igual cuentan en embudos y tendencias,
      // y no gastan cupo de perfiles.
      person_profiles: "identified_only",
      // Grabaciones de sesión: lo que se escribe (nombre, teléfono, dirección) se ve tapado.
      session_recording: { maskAllInputs: true },
      // El panel admin no es parte del recorrido del cliente.
      before_send: (event) => (window.location.pathname.startsWith("/admin") ? null : event),
      debug: process.env.NODE_ENV === "development",
    })
  } catch {
    // Las métricas nunca tienen que romper la tienda.
  }
}
