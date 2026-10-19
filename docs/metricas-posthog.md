# Métricas con PostHog

La tienda manda eventos a [PostHog](https://posthog.com) para medir el embudo de ventas y el
comportamiento de los clientes. Sin configurar el token no se manda nada.

## 1. Conectar la cuenta (una sola vez)

1. Crear la cuenta en [posthog.com](https://posthog.com) (plan gratis: 1 millón de eventos y
   5.000 grabaciones por mes). Elegir región **US** o **EU** y anotarla.
2. En PostHog: **Settings → Project → Project token** (empieza con `phc_`). Es una clave pública,
   pensada para ir en el navegador.
3. En Railway, servicio de la app → **Variables**:

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | el token `phc_...` |
   | `NEXT_PUBLIC_POSTHOG_REGION` | `us` o `eu` (la de la cuenta) |

4. Redeploy. Estas variables se leen al compilar, así que hace falta un deploy nuevo después de cargarlas.
5. En PostHog: **Settings → Session replay → activar** para ver grabaciones de sesión.

Los eventos pasan por `/ingest` en nuestro dominio (proxy en `next.config.mjs`): los bloqueadores
de publicidad los cortan mucho menos que si fueran directo a PostHog.

## 2. Qué se mide

| Evento | Cuándo | Datos |
|---|---|---|
| `$pageview` | cada página vista (automático) | URL, origen (referrer), UTM, dispositivo |
| `products_searched` | una búsqueda | `query`, `results` (0 = lo piden y no lo tenés) |
| `category_selected` / `offers_viewed` | filtros del catálogo | `category` |
| `product_added` | agrega un artículo al carrito | `product_id`, `product_name`, `category`, `quantity`, `price`, `value` |
| `cart_updated` / `product_removed` | cambia cantidades o saca | igual que arriba + `previous_quantity` |
| `cart_viewed` | abre el carrito | `items_count`, `value` |
| `checkout_started` | entra a finalizar pedido con productos | `value`, `items_count`, `units` |
| `delivery_slot_selected` / `payment_method_selected` | elige franja / medio de pago | `slot` / `method` |
| `checkout_error` | el pedido no se pudo confirmar | `field`, `error` |
| `order_completed` | **venta cerrada** | `order_id`, `revenue` (ARS), `payment_method`, `delivery_slot`, `items_count`, `units`, `is_guest` |
| `payment_detail_copied` | copia alias/CBU/monto | `field` |
| `whatsapp_proof_clicked` | toca "Enviar comprobante por WhatsApp" | `order_id` |
| `signed_up` / `signed_in` | crea cuenta / ingresa | — |

Privacidad: nunca se mandan nombre, teléfono, email ni dirección. Las cuentas se vinculan sólo por
su id interno. En las grabaciones, lo que se escribe en los formularios aparece tapado, y los datos
de entrega de la página del pedido están excluidos (`ph-no-capture`). Los admins dejan de registrar
eventos en su navegador al ingresar, y el panel `/admin` nunca se mide. Si un admin usa la tienda
desde ese navegador después de cerrar sesión, tampoco se mide: es a propósito, para no mezclar
pruebas internas con clientes.

## 3. El embudo de ventas (armarlo en PostHog)

**Product analytics → New insight → Funnel**, con estos pasos en orden:

1. `$pageview` — visitó la tienda
2. `product_added` — agregó algo al carrito
3. `checkout_started` — fue a finalizar el pedido
4. `order_completed` — confirmó el pedido

Configuración recomendada: ventana de conversión de **1 día** (comprás en una visita) y otra de
**7 días** (vuelven a terminar la compra). Guardarlo en un dashboard "Ventas".

Cómo leerlo:

- **Visita → carrito** bajo (menos de 10–15%): el problema está en el catálogo (precios, fotos,
  búsqueda). Mirar `products_searched` con 0 resultados y las grabaciones de quienes no agregan nada.
- **Carrito → checkout** bajo: dudas con el precio final, el mínimo o la entrega. Revisar
  `cart_viewed` sin `checkout_started`.
- **Checkout → pedido** bajo: el formulario frena. Revisar `checkout_error` (qué campo falla) y ver
  grabaciones filtrando por "hizo `checkout_started` y no hizo `order_completed`".

## 4. Indicadores para el dashboard

| Indicador | Cómo se arma en PostHog |
|---|---|
| Visitantes únicos por día | Trends → `$pageview`, "Unique users" |
| Tasa de conversión | el embudo de arriba (% de punta a punta) |
| Ventas y facturación | Trends → `order_completed`: cantidad y "Sum of `revenue`" |
| Ticket promedio | Trends → `order_completed`, "Average of `revenue`" |
| Carritos abandonados | Funnel `product_added` → `order_completed`, mirar los que se cayeron |
| Productos más agregados | Trends → `product_added`, desglose por `product_name` |
| Lo que buscan y no hay | Trends → `products_searched` filtrado `results = 0`, desglose por `query` |
| Efectivo vs transferencia | Trends → `order_completed`, desglose por `payment_method` |
| Mediodía vs noche | Trends → `order_completed`, desglose por `delivery_slot` |
| Invitados vs cuentas | Trends → `order_completed`, desglose por `is_guest` |
| Celular vs compu | cualquier insight, desglose por "Device type" |
| De dónde llegan | Web analytics (pestaña propia de PostHog): canales, referrers y UTM |
| Vuelven a comprar | Retention → evento `order_completed` |

**Ventas cerradas de verdad:** `order_completed` es el pedido confirmado en la tienda. Que después
se haya pagado (transferencia validada o efectivo cobrado) está en el panel admin. El panel de
métricas propio (próxima etapa) va a cruzar las dos cosas.

## 5. Medir campañas (Instagram, WhatsApp, volantes)

Usar links con UTM para saber qué campaña trae ventas. PostHog los lee solo:

```
https://todopackoficial-production.up.railway.app/?utm_source=instagram&utm_medium=historia&utm_campaign=lanzamiento
https://todopackoficial-production.up.railway.app/?utm_source=whatsapp&utm_medium=estado&utm_campaign=ofertas-finde
https://todopackoficial-production.up.railway.app/?utm_source=volante&utm_medium=qr&utm_campaign=barrio-centro
```

Después, en el embudo o en Trends de `order_completed`, desglosar por `utm_source` / `utm_campaign`.
Para los volantes, generar un QR con el link con UTM.

## 6. Próxima etapa: panel propio en el admin

Una pestaña "Métricas" en `/admin` que combine los eventos de PostHog (vía su API) con los pedidos
de la base: embudo, facturación pagada, ticket promedio, productos estrella y lo buscado sin
resultados, sin salir del panel.
