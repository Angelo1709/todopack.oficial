@AGENTS.md

# TODO PACK — tienda online mayorista

Tienda online de la distribuidora TODO PACK (bebidas, almacén, limpieza, descartables). Los clientes arman un carrito (sin necesidad de cuenta), eligen fecha y franja de entrega y medio de pago; el administrador gestiona pedidos, entregas y el catálogo. La interfaz y los mensajes al usuario están en **español (Argentina)**. Se despliega en **Railway**.

**Diseño:** antes de tocar cualquier UI leé la skill `.claude/skills/todopack-design/SKILL.md`.

## Stack

- **Next.js 16 (App Router) + React 19**, TypeScript. Leer `AGENTS.md`: esta versión de Next tiene cambios que rompen convenciones viejas; consultar `node_modules/next/dist/docs/` antes de usar APIs de Next.
- **Tailwind CSS v4** + componentes **shadcn/ui** (`components/ui/`, config en `components.json`).
- **PostgreSQL** con **Drizzle ORM** (`lib/db/`), driver `pg`.
- **Better Auth** (email + contraseña) en `lib/auth.ts`; ruta `app/api/auth/[...all]`. La cuenta es opcional para comprar.
- Imágenes de productos: se guarda la URL (`lib/storage.ts`); Vercel Blob solo si hay `BLOB_READ_WRITE_TOKEN`.
- Deploy: **Railway** (`railway.json`: build `pnpm build`, pre-deploy `pnpm db:migrate`, healthcheck `/api/health`).
- Gestor de paquetes: **pnpm** (versión fijada en `packageManager`; si no está instalado: `npx pnpm@12.3.4 ...`). Node 24.

## Comandos

```bash
pnpm install
pnpm db:local       # Postgres embebido (PGlite) en :5433, datos en .pglite/ — dejar corriendo
pnpm db:migrate     # aplica lib/db/migrations/*.sql pendientes
pnpm db:seed        # carga data/products.json
pnpm dev            # http://localhost:3000
pnpm typecheck      # tsc --noEmit (el build también falla con errores de tipos)
pnpm build
pnpm make-admin email@x.com   # o registrarse con un email listado en ADMIN_EMAILS
```

Los scripts `db:*` y `make-admin` leen `.env.local` si existe.

Otros scripts de datos:

```bash
node scripts/parse-products.mjs [ruta.xlsx]   # lista de precios Excel -> data/products.json
node scripts/gen-seed-sql.mjs                  # genera data/seed-N.sql
node scripts/import-product-images.mjs         # busca imágenes en Wikimedia (IMAGE_BATCH=n)
```

No hay tests ni drizzle-kit. **Migraciones:** SQL a mano en `lib/db/migrations/NNNN_descripcion.sql` (orden alfabético, se registran en `schema_migrations`). Todo cambio en `lib/db/schema.ts` lleva su migración nueva; nunca editar una migración ya aplicada.

## Estructura

- `app/page.tsx` — catálogo público (búsqueda, filtro por categoría, paginación de 24).
- `app/checkout`, `app/mis-pedidos` — compra y pedidos del cliente.
- `app/admin/` — panel (layout con guard de rol + `AdminNav`): `/admin` pedidos, `/admin/productos` catálogo, `/admin/configuracion` WhatsApp y datos bancarios. Componentes en `components/admin/`.
- `app/actions/` — server actions: `orders.ts` (cliente; `createOrder` acepta invitados), `admin-orders.ts` (pedidos, `requireAdmin()`), `catalog.ts` (productos, importación Excel, imágenes, `requireAdmin()`).
- `app/api/health` — healthcheck de Railway (hace `SELECT 1`).
- `components/cart/` — carrito en el cliente (context provider + sheet).
- `lib/db/schema.ts` — tablas: `user`, `session`, `account`, `verification` (Better Auth, columnas camelCase obligatorias) y `products`, `orders`, `order_items`, `settings`.
- `lib/order-status.ts` — estados, franjas, medios de pago, etiquetas y transiciones permitidas. Único lugar donde se definen.
- `lib/settings.ts` — `getSettings()` (WhatsApp, alias/CBU/titular) con valores por defecto.
- `lib/whatsapp.ts` — normaliza teléfonos AR y arma links `wa.me` con mensaje.
- `lib/categorize.ts` y `scripts/parse-products.mjs` — reglas de categorización por palabras clave. **Están duplicadas: si cambiás una, cambiá la otra.**
- `lib/categories.ts` — slug e imagen de respaldo por categoría (`public/categories/*.png`).
- `data/` — Excel de lista de precios y `products.json` generado.

## Reglas de negocio

- Precios en **pesos enteros** (`integer`), sin centavos. Formatear con `formatPrice` (`lib/format.ts`); número de pedido con `formatOrderNumber` → `00201`.
- **Presentaciones / packs:** `products.price` es el precio de la presentación completa y `pack_size` las unidades que incluye (1 = unidad). Productos con el mismo `group_key` son el mismo artículo en distintas presentaciones ("COCA COLA 1.5L UNIDAD" y "... PACK X6").
- Roles: `customer` (default) y `admin`, en `user.role`. Admin: `ADMIN_EMAILS` al registrarse o `pnpm make-admin`.
- Compra sin cuenta: `orders.userId` es null para invitados; `orders.public_token` permite ver el pedido sin sesión.
- Pedido (`lib/order-status.ts`): transferencia `pendiente_validacion → pagado → entregado`; efectivo `pendiente_entrega → pagado` (se cobra al entregar); cualquiera no finalizado → `cancelado`. Franja `delivery_slot` = `mediodia | noche`. El comprobante de transferencia lo manda el cliente por WhatsApp (link con mensaje precargado con el número de pedido).
- La fecha de entrega no puede ser pasada. Los ítems del pedido guardan copia de nombre, precio y pack al momento de compra.
- Los productos no se borran: se desactivan con `active = false`.

## Variables de entorno

Ver `.env.example`. Mínimo: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (en Railway se puede omitir: usa `RAILWAY_PUBLIC_DOMAIN`), `ADMIN_EMAILS`. `BLOB_READ_WRITE_TOKEN` es opcional. Nunca commitear `.env*` (salvo `.env.example`).

## Convenciones

- Server Components por defecto; `"use client"` solo donde hace falta interactividad.
- Acceso a datos con Drizzle desde server components o server actions, nunca desde el cliente.
- Toda server action nueva que modifique datos debe validar sesión/rol con `lib/session.ts`.
- Mensajes de error y textos de UI en español.
- Estilo existente: sin punto y coma, comillas dobles. Respetar el del archivo que se edita.
- `components/ui/` son componentes generados (shadcn base-nova sobre `@base-ui/react`): evitar editarlos. Para botones-link: `render={<Link href="..." />} nativeButton={false}` (no hay `asChild`).
