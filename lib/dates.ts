// Fechas en hora de Argentina: el servidor (Railway) corre en UTC.
export const AR_TIME_ZONE = "America/Argentina/Buenos_Aires"

/** Fecha de hoy en Argentina como "yyyy-mm-dd". */
export function todayAR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: AR_TIME_ZONE }).format(new Date())
}

/** Suma días a una fecha "yyyy-mm-dd". */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime())
}

/** "2026-09-26" -> "sáb 26 sept". */
export function formatDateAR(date: string, options?: Intl.DateTimeFormatOptions): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("es-AR", {
    timeZone: "UTC",
    ...(options ?? { weekday: "short", day: "numeric", month: "short" }),
  })
}
