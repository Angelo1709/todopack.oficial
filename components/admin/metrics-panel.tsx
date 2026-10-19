import Link from "next/link"
import { ExternalLink, TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDateAR } from "@/lib/dates"
import { formatPrice } from "@/lib/format"
import {
  DELIVERY_SLOT_LABEL,
  PAYMENT_METHOD_LABEL,
  isDeliverySlot,
  isPaymentMethod,
} from "@/lib/order-status"
import { METRIC_RANGES, periodDays, type MetricPeriod, type SalesMetrics, type SalesSplit } from "@/lib/metrics"
import type { TrafficItem, TrafficResult } from "@/lib/posthog-api"

// Panel de métricas (/admin/metricas). Sin JavaScript en el navegador: el período se cambia con links
// y los gráficos son barras de CSS.

const RANGE_LABEL: Record<number, string> = { 1: "Hoy", 7: "7 días", 30: "30 días", 90: "90 días" }
const PREVIOUS_LABEL: Record<number, string> = {
  1: "ayer",
  7: "los 7 días anteriores",
  30: "los 30 días anteriores",
  90: "los 90 días anteriores",
}
const SEGMENT_COLORS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"]

const numberFmt = new Intl.NumberFormat("es-AR")
const percentFmt = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 })
const formatNumber = (n: number) => numberFmt.format(n)
const ratio = (part: number, total: number) => (total > 0 ? part / total : 0)

export function MetricsPanel({
  period,
  sales,
  traffic,
  posthogUrl,
  showSetup,
}: {
  period: MetricPeriod
  sales: SalesMetrics
  /** null = PostHog sin configurar en el servidor. */
  traffic: TrafficResult | null
  posthogUrl: string | null
  /** Mostrar los pasos técnicos para conectar PostHog (superadmin). */
  showSetup: boolean
}) {
  const { current, previous } = sales
  const vs = PREVIOUS_LABEL[period.days]
  const ticket = current.orders ? Math.round(current.revenue / current.orders) : 0
  const prevTicket = previous.orders ? Math.round(previous.revenue / previous.orders) : 0

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold">Métricas</h1>
          <p className="text-sm text-muted-foreground">
            {period.days === 1
              ? `Hoy, ${formatDateAR(period.to, { weekday: "long", day: "numeric", month: "long" })}`
              : `Del ${formatDateAR(period.from)} al ${formatDateAR(period.to)}`}
          </p>
        </div>
        <RangeTabs days={period.days} />
      </div>

      <section aria-labelledby="ventas" className="flex flex-col gap-4">
        <SectionTitle id="ventas" title="Ventas" subtitle="Pedidos de la tienda y cargados a mano, sin los cancelados." />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Pedidos" value={formatNumber(current.orders)} change={change(current.orders, previous.orders, vs)} />
          <Kpi label="Facturación" value={formatPrice(current.revenue)} change={change(current.revenue, previous.revenue, vs)} />
          <Kpi label="Ticket promedio" value={current.orders ? formatPrice(ticket) : "—"} change={current.orders ? change(ticket, prevTicket, vs) : null} />
          <Kpi
            label="Cobrado"
            value={formatPrice(current.collected)}
            hint={current.pending > 0 ? `Falta cobrar ${formatPrice(current.pending)}` : current.orders ? "Todo cobrado" : undefined}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {[
            `${formatNumber(current.webOrders)} de la tienda`,
            `${formatNumber(current.manualOrders)} cargados a mano`,
            `${formatNumber(current.customers)} ${current.customers === 1 ? "cliente" : "clientes"}${
              current.repeatCustomers ? ` (${formatNumber(current.repeatCustomers)} ya habían comprado)` : ""
            }`,
            `${formatNumber(current.cancelled)} ${current.cancelled === 1 ? "cancelado" : "cancelados"}`,
          ].join(" · ")}
        </p>

        {period.days > 1 && (
          <Card title="Pedidos por día">
            <DayBars
              days={sales.byDay.map((d) => ({
                day: d.day,
                value: d.orders,
                title: `${formatDateAR(d.day)}: ${formatNumber(d.orders)} ${d.orders === 1 ? "pedido" : "pedidos"} · ${formatPrice(d.revenue)}`,
              }))}
              colorClass="bg-chart-1"
              emptyText="Todavía no hay pedidos en este período."
              summary="pedidos"
            />
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Productos más vendidos" subtitle="Ordenados por lo que facturaron.">
            {sales.topProducts.length ? (
              <RankBars
                items={sales.topProducts.map((p) => ({
                  label: p.name,
                  value: p.revenue,
                  detail: `${formatPrice(p.revenue)} · ${formatNumber(p.units)} u. · ${formatNumber(p.orders)} ${p.orders === 1 ? "pedido" : "pedidos"}`,
                }))}
              />
            ) : (
              <Empty>Sin productos vendidos en este período.</Empty>
            )}
          </Card>
          <div className="flex flex-col gap-4">
            <Card title="Cómo pagan">
              <SplitBar items={splitItems(sales.byPayment, (k) => (isPaymentMethod(k) ? PAYMENT_METHOD_LABEL[k] : k))} />
            </Card>
            <Card title="Para cuándo piden">
              <SplitBar items={splitItems(sales.bySlot, (k) => (isDeliverySlot(k) ? DELIVERY_SLOT_LABEL[k] : k))} />
            </Card>
          </div>
        </div>
      </section>

      <section aria-labelledby="visitas" className="flex flex-col gap-4">
        <SectionTitle
          id="visitas"
          title="Visitas a la tienda"
          subtitle="Cuánta gente entra a la web y en qué paso se queda (PostHog)."
        />
        <TrafficSection period={period} traffic={traffic} posthogUrl={posthogUrl} showSetup={showSetup} />
      </section>
    </div>
  )
}

function TrafficSection({
  period,
  traffic,
  posthogUrl,
  showSetup,
}: {
  period: MetricPeriod
  traffic: TrafficResult | null
  posthogUrl: string | null
  showSetup: boolean
}) {
  if (!traffic) {
    return (
      <Card title="Falta conectar PostHog">
        {showSetup ? (
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>
              En PostHog: <b>Settings → Personal API keys → Create key</b>, con el permiso <b>Query: Read</b> y acceso sólo a
              este proyecto.
            </li>
            <li>
              En Railway, Variables del servicio: <code>POSTHOG_PERSONAL_API_KEY</code> con esa clave y{" "}
              <code>POSTHOG_PROJECT_ID</code> con el número de proyecto.
            </li>
            <li>Railway vuelve a desplegar solo. Detalle en docs/metricas-posthog.md.</li>
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            Las visitas y el embudo de la tienda todavía no están conectados. Pedíselo a quien administra la web.
          </p>
        )}
      </Card>
    )
  }

  if (!traffic.ok) {
    return (
      <Card title="No se pudieron leer las visitas">
        <p className="text-sm text-muted-foreground">{traffic.error}</p>
        {posthogUrl && <PostHogLink href={posthogUrl} />}
      </Card>
    )
  }

  const { funnel, perDay, devices, origins, emptySearches } = traffic.data
  const [visitors, added, checkout, ordered] = funnel
  const steps = [
    { label: "Entraron a la tienda", value: visitors },
    { label: "Agregaron algo al carrito", value: added },
    { label: "Fueron a finalizar el pedido", value: checkout },
    { label: "Confirmaron el pedido", value: ordered },
  ]

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Visitantes" value={formatNumber(visitors)} hint="Personas distintas" />
        <Kpi label="Agregaron al carrito" value={formatNumber(added)} hint={visitors ? `${percentFmt.format(ratio(added, visitors))} de los visitantes` : undefined} />
        <Kpi label="Conversión" value={visitors ? percentFmt.format(ratio(ordered, visitors)) : "—"} hint="Visitantes que confirmaron un pedido" />
        <Kpi
          label="Carritos sin terminar"
          value={formatNumber(Math.max(0, added - ordered))}
          hint="Agregaron productos y no confirmaron"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Embudo de ventas" subtitle="De la visita al pedido confirmado, en el mismo día.">
          <ol className="flex flex-col gap-3">
            {steps.map((step, i) => {
              const lost = i > 0 ? steps[i - 1].value - step.value : 0
              return (
                <li key={step.label}>
                  {i > 0 && lost > 0 && (
                    <p className="mb-1 text-xs text-muted-foreground">
                      Se fueron {formatNumber(lost)} ({percentFmt.format(ratio(lost, steps[i - 1].value))})
                    </p>
                  )}
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">
                      {i + 1}. {step.label}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <b>{formatNumber(step.value)}</b>
                      {i > 0 && visitors > 0 && (
                        <span className="text-muted-foreground"> · {percentFmt.format(ratio(step.value, visitors))}</span>
                      )}
                    </span>
                  </div>
                  <Bar fraction={ratio(step.value, visitors)} colorClass="bg-chart-2" />
                </li>
              )
            })}
          </ol>
        </Card>

        {period.days > 1 && (
          <Card title="Visitantes por día">
            <DayBars
              days={periodDays(period).map((day) => ({
              day,
                value: perDay[day] ?? 0,
                title: `${formatDateAR(day)}: ${formatNumber(perDay[day] ?? 0)} visitantes`,
              }))}
              colorClass="bg-chart-2"
              emptyText="Todavía no hay visitas en este período."
              summary="visitantes"
            />
          </Card>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Desde dónde entran">
          <SplitBar items={mergeItems(devices, deviceLabel).map((d) => ({ ...d, detail: `${formatNumber(d.value)} visitantes` }))} />
        </Card>
        <Card title="Cómo llegan">
          {origins.length ? (
            <RankBars
              items={mergeItems(origins, originLabel)
                .slice(0, 8)
                .map((o) => ({ ...o, detail: `${formatNumber(o.value)} visitantes` }))}
            />
          ) : (
            <Empty>Sin visitas en este período.</Empty>
          )}
        </Card>
        <Card title="Buscaron y no encontraron" subtitle="Ideas para sumar al catálogo.">
          {emptySearches.length ? (
            <ul className="flex flex-wrap gap-2">
              {emptySearches.slice(0, 20).map((s) => (
                <li key={s.label} className="rounded-full border border-border bg-muted px-3 py-1 text-sm">
                  {s.label} <span className="text-muted-foreground tabular-nums">× {formatNumber(s.value)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nadie buscó algo que no esté en la tienda.</Empty>
          )}
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Datos de PostHog, se actualizan cada 10 minutos. No cuentan a los admins ni a quien bloquea el seguimiento, así que pueden
        dar menos pedidos que la sección Ventas.{" "}
        {posthogUrl && <PostHogLink href={posthogUrl} inline />}
      </p>
    </>
  )
}

function RangeTabs({ days }: { days: number }) {
  return (
    <nav aria-label="Período" className="flex rounded-xl border border-border bg-card p-1 shadow-card">
      {METRIC_RANGES.map((r) => (
        <Link
          key={r}
          href={`/admin/metricas?dias=${r}`}
          aria-current={r === days ? "page" : undefined}
          className={cn(
            "flex h-11 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors sm:flex-none",
            r === days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {RANGE_LABEL[r]}
        </Link>
      ))}
    </nav>
  )
}

function SectionTitle({ id, title, subtitle }: { id: string; title: string; subtitle: string }) {
  return (
    <div>
      <h2 id={id} className="font-serif text-xl font-bold">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <div>
        <h3 className="font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-sm text-muted-foreground">{children}</p>
}

type Change = { pct: number | null; text: string } | null

function change(currentValue: number, previousValue: number, vs: string): Change {
  if (!currentValue && !previousValue) return null
  if (!previousValue) return { pct: null, text: `Sin datos de ${vs}` }
  const pct = (currentValue - previousValue) / previousValue
  const sign = pct > 0 ? "+" : ""
  return { pct, text: `${sign}${percentFmt.format(pct)} vs. ${vs}` }
}

function Kpi({ label, value, hint, change }: { label: string; value: string; hint?: string; change?: Change }) {
  const up = change?.pct != null && change.pct > 0
  const down = change?.pct != null && change.pct < 0
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4 shadow-card">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="font-serif text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
      {change && (
        <p className={cn("flex items-center gap-1 text-xs", up && "text-chart-3", down && "text-destructive", !up && !down && "text-muted-foreground")}>
          {up && <TrendingUp className="size-3.5 shrink-0" aria-hidden />}
          {down && <TrendingDown className="size-3.5 shrink-0" aria-hidden />}
          {change.text}
        </p>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Bar({ fraction, colorClass }: { fraction: number; colorClass: string }) {
  return (
    <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className={cn("h-full rounded-full", colorClass)} style={{ width: `${Math.min(100, Math.max(0, fraction * 100))}%` }} />
    </div>
  )
}

function RankBars({ items }: { items: { label: string; value: number; detail: string }[] }) {
  const max = Math.max(...items.map((i) => i.value), 0)
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, i) => (
        <li key={`${item.label}-${i}`} className="text-sm">
          <p className="font-medium wrap-anywhere">{item.label}</p>
          <p className="text-xs text-muted-foreground tabular-nums">{item.detail}</p>
          <Bar fraction={ratio(item.value, max)} colorClass="bg-chart-1" />
        </li>
      ))}
    </ol>
  )
}

function SplitBar({ items }: { items: { label: string; value: number; detail?: string }[] }) {
  const total = items.reduce((sum, i) => sum + i.value, 0)
  if (!total) return <Empty>Sin datos en este período.</Empty>
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
        {items.map((item, i) => (
          <div key={item.label} className={SEGMENT_COLORS[i % SEGMENT_COLORS.length]} style={{ width: `${ratio(item.value, total) * 100}%` }} />
        ))}
      </div>
      <ul className="flex flex-col gap-1.5 text-sm">
        {items.map((item, i) => (
          <li key={item.label} className="flex items-center gap-2">
            <span className={cn("size-2.5 shrink-0 rounded-full", SEGMENT_COLORS[i % SEGMENT_COLORS.length])} aria-hidden />
            <span className="font-medium">{item.label}</span>
            <span className="ml-auto text-right text-muted-foreground tabular-nums">
              {percentFmt.format(ratio(item.value, total))}
              {item.detail && ` · ${item.detail}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function DayBars({
  days,
  colorClass,
  emptyText,
  summary,
}: {
  days: { day: string; value: number; title: string }[]
  colorClass: string
  emptyText: string
  /** Qué se cuenta, para el texto que leen los lectores de pantalla. */
  summary: string
}) {
  const max = Math.max(...days.map((d) => d.value), 0)
  if (!max) return <Empty>{emptyText}</Empty>
  const best = days.reduce((a, b) => (b.value > a.value ? b : a))
  const total = days.reduce((sum, d) => sum + d.value, 0)
  return (
    <div>
      <div
        role="img"
        aria-label={`Total ${formatNumber(total)} ${summary}. El día con más fue el ${formatDateAR(best.day)}, con ${formatNumber(best.value)}.`}
        className="flex h-32 items-end gap-px"
      >
        {days.map((d) => (
          <div key={d.day} title={d.title} className="flex h-full min-w-0 flex-1 items-end">
            <div
              className={cn("w-full rounded-t-sm", d.value ? colorClass : "bg-muted")}
              style={{ height: d.value ? `${Math.max(4, ratio(d.value, max) * 100)}%` : "2px" }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{formatDateAR(days[0].day, { day: "numeric", month: "short" })}</span>
        <span>
          Máx. {formatNumber(max)} el {formatDateAR(best.day, { day: "numeric", month: "short" })}
        </span>
        <span>{formatDateAR(days[days.length - 1].day, { day: "numeric", month: "short" })}</span>
      </div>
    </div>
  )
}

function PostHogLink({ href, inline = false }: { href: string; inline?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn("inline-flex items-center gap-1 font-medium text-accent underline-offset-4 hover:underline", !inline && "min-h-11")}
    >
      Ver más en PostHog <ExternalLink className="size-3.5" aria-hidden />
    </a>
  )
}

function splitItems(rows: SalesSplit[], label: (key: string) => string) {
  return rows.map((r) => ({
    label: label(r.key),
    value: r.orders,
    detail: `${formatNumber(r.orders)} ${r.orders === 1 ? "pedido" : "pedidos"} · ${formatPrice(r.revenue)}`,
  }))
}

/** Junta valores con la misma etiqueta (p. ej. instagram.com y l.instagram.com → Instagram) y ordena. */
function mergeItems(items: TrafficItem[], label: (raw: string) => string): TrafficItem[] {
  const merged = new Map<string, number>()
  for (const item of items) merged.set(label(item.label), (merged.get(label(item.label)) ?? 0) + item.value)
  return [...merged].map(([l, value]) => ({ label: l, value })).sort((a, b) => b.value - a.value)
}

function deviceLabel(raw: string): string {
  if (raw === "Mobile") return "Celular"
  if (raw === "Desktop") return "Compu"
  if (raw === "Tablet") return "Tablet"
  return raw || "Sin dato"
}

function originLabel(raw: string): string {
  const domain = raw.toLowerCase().replace(/^www\./, "")
  if (!domain) return "Sin dato"
  if (domain === "$direct") return "Directo (link guardado o escrito)"
  if (domain.includes("instagram")) return "Instagram"
  if (domain.includes("facebook") || domain === "fb.com" || domain.endsWith(".fb.com")) return "Facebook"
  if (domain.includes("whatsapp") || domain === "wa.me") return "WhatsApp"
  if (/(^|\.)google\./.test(domain)) return "Google"
  if (domain.includes("tiktok")) return "TikTok"
  if (domain === "t.co" || domain === "x.com" || domain.includes("twitter")) return "X (Twitter)"
  return domain
}
