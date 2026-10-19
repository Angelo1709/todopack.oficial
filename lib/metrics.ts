import "server-only"
import { pool } from "@/lib/db"
import { addDays, AR_TIME_ZONE } from "@/lib/dates"
import { parsePresentation } from "@/lib/pack"
import type { OrderStatus } from "@/lib/order-status"

// Métricas de ventas del panel (/admin/metricas), calculadas con los pedidos de la base: incluyen los
// pedidos manuales y saben qué se cobró, cosa que PostHog no ve. Las visitas y el embudo: lib/posthog-api.ts.

export const METRIC_RANGES = [1, 7, 30, 90] as const
export type MetricRange = (typeof METRIC_RANGES)[number]

export function parseMetricRange(value: unknown): MetricRange {
  const n = Number(value)
  return METRIC_RANGES.find((r) => r === n) ?? 30
}

/** Período de `days` días que termina hoy (fechas de Argentina) y el anterior, del mismo largo. */
export type MetricPeriod = { days: number; from: string; to: string; prevFrom: string; prevTo: string }

export function metricPeriod(days: number, today: string): MetricPeriod {
  const from = addDays(today, -(days - 1))
  return { days, from, to: today, prevFrom: addDays(from, -days), prevTo: addDays(from, -1) }
}

/** Las fechas del período, de la primera a la última. */
export function periodDays(period: Pick<MetricPeriod, "from" | "to">): string[] {
  const days: string[] = []
  for (let day = period.from; day <= period.to; day = addDays(day, 1)) days.push(day)
  return days
}

export type SalesSummary = {
  /** Pedidos no cancelados. */
  orders: number
  revenue: number
  /** Pagado o entregado. */
  collected: number
  /** Todavía sin cobrar (transferencia por validar o efectivo por entregar). */
  pending: number
  cancelled: number
  webOrders: number
  manualOrders: number
  customers: number
  /** Clientes del período con al menos otro pedido (antes o en el período). */
  repeatCustomers: number
}

export type SalesDay = { day: string; orders: number; revenue: number }
export type SalesSplit = { key: string; orders: number; revenue: number }
export type TopProduct = { name: string; units: number; revenue: number; orders: number }

export type SalesMetrics = {
  current: SalesSummary
  previous: SalesSummary
  byDay: SalesDay[]
  byPayment: SalesSplit[]
  bySlot: SalesSplit[]
  topProducts: TopProduct[]
}

const COLLECTED: OrderStatus[] = ["pagado", "entregado"]
const PENDING: OrderStatus[] = ["pendiente_validacion", "pendiente_entrega"]
const CANCELLED: OrderStatus = "cancelado"

// Fecha del pedido en Argentina (el servidor y la base corren en UTC).
const DAY = `(o.created_at AT TIME ZONE '${AR_TIME_ZONE}')::date`
// Un cliente = su teléfono (sólo dígitos); sin teléfono (pedidos manuales), su cuenta o su nombre.
const CUSTOMER = `coalesce(nullif(regexp_replace(o.phone, '\\D', '', 'g'), ''), o."userId", lower(trim(o.customer_name)))`

async function summary(from: string, to: string): Promise<SalesSummary> {
  const { rows } = await pool.query(
    `WITH o AS (
      SELECT o.status, o.total, o.origin, ${CUSTOMER} AS customer, ${DAY} AS day
      FROM orders o
      WHERE ${DAY} <= $2::date
    ),
    period AS (SELECT * FROM o WHERE day >= $1::date),
    history AS (SELECT customer, count(*) AS n FROM o WHERE status <> $5 GROUP BY customer)
    SELECT
      count(*) FILTER (WHERE status <> $5)::int AS orders,
      coalesce(sum(total) FILTER (WHERE status <> $5), 0)::float8 AS revenue,
      coalesce(sum(total) FILTER (WHERE status = ANY($3)), 0)::float8 AS collected,
      coalesce(sum(total) FILTER (WHERE status = ANY($4)), 0)::float8 AS pending,
      count(*) FILTER (WHERE status = $5)::int AS cancelled,
      count(*) FILTER (WHERE status <> $5 AND origin = 'web')::int AS web_orders,
      count(*) FILTER (WHERE status <> $5 AND origin = 'manual')::int AS manual_orders,
      count(DISTINCT customer) FILTER (WHERE status <> $5)::int AS customers,
      count(DISTINCT customer) FILTER (
        WHERE status <> $5 AND customer IN (SELECT customer FROM history WHERE n > 1)
      )::int AS repeat_customers
    FROM period`,
    [from, to, COLLECTED, PENDING, CANCELLED],
  )
  const r = rows[0]
  return {
    orders: r.orders,
    revenue: r.revenue,
    collected: r.collected,
    pending: r.pending,
    cancelled: r.cancelled,
    webOrders: r.web_orders,
    manualOrders: r.manual_orders,
    customers: r.customers,
    repeatCustomers: r.repeat_customers,
  }
}

async function byDay(from: string, to: string): Promise<SalesDay[]> {
  const { rows } = await pool.query<SalesDay>(
    `SELECT to_char(${DAY}, 'YYYY-MM-DD') AS day, count(*)::int AS orders, sum(o.total)::float8 AS revenue
    FROM orders o
    WHERE o.status <> $3 AND ${DAY} BETWEEN $1::date AND $2::date
    GROUP BY 1`,
    [from, to, CANCELLED],
  )
  const found = new Map(rows.map((r) => [r.day, r]))
  return periodDays({ from, to }).map((day) => found.get(day) ?? { day, orders: 0, revenue: 0 })
}

async function splits(from: string, to: string): Promise<{ byPayment: SalesSplit[]; bySlot: SalesSplit[] }> {
  const { rows } = await pool.query<SalesSplit & { kind: string }>(
    `SELECT 'pago' AS kind, o.payment_method AS key, count(*)::int AS orders, sum(o.total)::float8 AS revenue
    FROM orders o WHERE o.status <> $3 AND ${DAY} BETWEEN $1::date AND $2::date GROUP BY o.payment_method
    UNION ALL
    SELECT 'franja', o.delivery_slot, count(*)::int, sum(o.total)::float8
    FROM orders o WHERE o.status <> $3 AND ${DAY} BETWEEN $1::date AND $2::date GROUP BY o.delivery_slot
    ORDER BY orders DESC`,
    [from, to, CANCELLED],
  )
  const pick = (kind: string) => rows.filter((r) => r.kind === kind).map(({ key, orders, revenue }) => ({ key, orders, revenue }))
  return { byPayment: pick("pago"), bySlot: pick("franja") }
}

/** Los artículos que más facturaron: las presentaciones del mismo artículo (unidad, pack) se suman. */
async function topProducts(from: string, to: string): Promise<TopProduct[]> {
  const { rows } = await pool.query<{ name: string; pack_size: number; units: number; revenue: number; orders: number }>(
    `SELECT
      (array_agg(i.name ORDER BY i.pack_size, i.name))[1] AS name,
      (array_agg(i.pack_size ORDER BY i.pack_size, i.name))[1] AS pack_size,
      sum(i.quantity * i.pack_size)::float8 AS units,
      sum(i.price * i.quantity)::float8 AS revenue,
      count(DISTINCT o.id)::int AS orders
    FROM order_items i
    JOIN orders o ON o.id = i.order_id
    LEFT JOIN products p ON p.id = i.product_id
    WHERE o.status <> $3 AND ${DAY} BETWEEN $1::date AND $2::date
    GROUP BY coalesce(p.group_key, 'nombre:' || i.name)
    ORDER BY revenue DESC, units DESC
    LIMIT 10`,
    [from, to, CANCELLED],
  )
  return rows.map((r) => {
    // Igual que en la tienda: sin "PACK X6" sólo si el nombre coincide con el pack guardado.
    const parsed = parsePresentation(r.name)
    return {
      name: parsed.packSize === r.pack_size ? parsed.baseName : r.name,
      units: r.units,
      revenue: r.revenue,
      orders: r.orders,
    }
  })
}

export async function getSalesMetrics(period: MetricPeriod): Promise<SalesMetrics> {
  const [current, previous, days, split, top] = await Promise.all([
    summary(period.from, period.to),
    summary(period.prevFrom, period.prevTo),
    byDay(period.from, period.to),
    splits(period.from, period.to),
    topProducts(period.from, period.to),
  ])
  return { current, previous, byDay: days, ...split, topProducts: top }
}
