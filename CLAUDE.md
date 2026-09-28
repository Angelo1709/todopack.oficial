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
- Deploy: **Railway** (`railway.json`: build `pnpm build`, start `pnpm start` = migraciones + `next start`, healthcheck `/api/health`). El `preDeployCommand` de Railway no se ejecutaba: por eso las migraciones corren al arrancar.
- Gestor de paquetes: **pnpm** (versión fijada en `packageManager`; si no está instalado: `npx pnpm@12.3.4 ...`). Node 24.

## Comandos

```bash
pnpm install
pnpm db:local       # Postgres embebido (PGlite) en :5433, datos en .pglite/ — dejar corriendo
pnpm db:migrate     # aplica lib/db/migrations/*.sql pendientes
pnpm db:seed        # carga data/products.json
pnpm dev            # http://localhost:3000
pnpm typecheck      # tsc --noEmit (el build también falla con errores de tipos)
pnpm check          # verificaciones de packs/categorías, precios por tramos y recorrido de reparto
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

No hay tests ni drizzle-kit. **Migraciones:** en `lib/db/migrations/`, orden alfabético, se registran en `schema_migrations` y corren al arrancar (`pnpm start`). `NNNN_descripcion.sql` para esquema; `NNNN_descripcion.mjs` para migraciones de datos (exporta `default async (client) => {}`, puede importar `lib/*.ts`). Todo cambio en `lib/db/schema.ts` lleva su migración nueva; nunca editar una migración ya aplicada.

## Estructura

- `app/page.tsx` — catálogo público (búsqueda, filtro por categoría, paginación de 24).
- `app/checkout`, `app/mis-pedidos` — compra y pedidos del cliente.
- `app/admin/` — panel (layout con guard de rol + `AdminNav`): `/admin` pedidos, `/admin/productos` catálogo, `/admin/configuracion` WhatsApp, datos bancarios y salida/llegada del recorrido, `/admin/usuarios` (solo superadmin). Componentes en `components/admin/`.
- `app/actions/` — server actions: `orders.ts` (cliente; `createOrder` acepta invitados), `admin-orders.ts` (pedidos, `requireAdmin()`), `catalog.ts` (productos, importación Excel, imágenes, `requireAdmin()`), `users.ts` (usuarios, `requireSuperadmin()`), `reparto.ts` (recorrido: buscar ubicaciones, corregir la de un pedido, salida/llegada; `requireAdmin()`). Ojo: un archivo `route.ts` dentro de `app/` es un Route Handler, no usar ese nombre para acciones.
- `app/api/health` — healthcheck de Railway (hace `SELECT 1`).
- `components/cart/` — carrito en el cliente (context provider + sheet).
- `lib/db/schema.ts` — tablas: `user`, `session`, `account`, `verification` (Better Auth, columnas camelCase obligatorias) y `products`, `orders`, `order_items`, `settings`.
- `lib/order-status.ts` — estados, franjas, medios de pago, etiquetas y transiciones permitidas. Único lugar donde se definen.
- `lib/settings.ts` — `getSettings()` (WhatsApp, alias/CBU/titular) con valores por defecto.
- `lib/whatsapp.ts` — normaliza teléfonos AR y arma links `wa.me` con mensaje.
- `lib/dates.ts` — `todayAR()`, `addDays`, `formatDateAR`. El servidor corre en UTC: nunca calcular "hoy" con `new Date()` local.
- `lib/pack.ts` — detecta la presentación en el nombre de la lista ("PACK X6" → 6) y arma el `group_key`.
- `lib/pricing.ts` — **precio por tramos** (compartido navegador/servidor): combinación más barata de presentaciones para N unidades.
- `lib/catalog.ts` — arma los artículos (grupo de presentaciones activas) para el catálogo y `createOrder`.
- `lib/price-list.ts` — lee la lista de precios Excel (detecta columnas). `lib/categorize.ts` — categorías por palabras clave.
  Estos `lib/*.ts` los importan también los scripts `.mjs` (Node 24 ejecuta TS quitando tipos): sin alias `@/` ni sintaxis TS no borrable.
- `lib/categories.ts` — slug e imagen de respaldo por categoría (`public/categories/*.png`).
- `lib/route.ts` — **recorrido de reparto** (puro, lo importa `scripts/check-route.mjs`): distancias, orden de visita que minimiza los km (exacto hasta 12 paradas, aproximado con más), lectura de coordenadas/links pegados y links de Google Maps. `lib/delivery-route.ts` arma el recorrido de una franja; `lib/geocode.ts` busca direcciones en Nominatim (OpenStreetMap, gratis: máx. 1 pedido/s); `lib/order-location.ts` guarda la ubicación de cada pedido.
- `data/` — Excel de lista de precios y `products.json` generado.

## Reglas de negocio

- Precios en **pesos enteros** (`integer`), sin centavos. Formatear con `formatPrice` (`lib/format.ts`); número de pedido con `formatOrderNumber` → `00201`.
- **Presentaciones / packs:** cada fila de `products` es una presentación de la lista (`price` = precio de la presentación completa, `pack_size` = unidades que incluye). Filas con el mismo `group_key` son el mismo artículo ("7UP 1.5L UNIDAD" y "7UP 1.5L PACK X6"); en la tienda se muestran como un solo producto.
- **Precio por tramos:** el cliente elige unidades y se cobra la combinación más barata (unidad $1.100 + pack x6 $6.000 → 7 u. = $7.100). La presentación más chica marca el paso (si solo hay pack x6, se compra de a 6). El carrito guarda unidades por artículo; `createOrder` recalcula y guarda los ítems desglosados por presentación ("1 × PACK X6" + "1 × UNIDAD").
- **Importar Excel:** actualiza precios por nombre exacto; los productos nuevos o nunca clasificados (`group_key` NULL) toman categoría/pack/grupo detectados; los ya clasificados conservan lo editado a mano.
- Roles (`lib/roles.ts`, columna `user.role`): `customer` (default), `admin` (panel de pedidos y catálogo) y `superadmin` (además gestiona usuarios en `/admin/usuarios`: crear cuentas, cambiar rol admin/cliente, resetear contraseñas). Usar `isAdminRole()` / `requireAdmin()` y `requireSuperadmin()`, nunca comparar `role === "admin"`. `SUPERADMIN_EMAILS` da superadmin al registrarse y al iniciar sesión; `ADMIN_EMAILS` da admin al registrarse; `pnpm make-admin` promueve a admin.
- Compra sin cuenta: `orders.userId` es null para invitados; `orders.public_token` permite ver el pedido sin sesión.
- Pedido (`lib/order-status.ts`): transferencia `pendiente_validacion → pagado → entregado`; efectivo `pendiente_entrega → pagado` (se cobra al entregar); cualquiera no finalizado → `cancelado`. Franja `delivery_slot` = `mediodia | noche`. El comprobante de transferencia lo manda el cliente por WhatsApp (link con mensaje precargado con el número de pedido).
- **Recorrido de reparto** (pestaña Recorrido del panel, un solo vehículo): sale del local o del depósito y termina en uno de los dos o en la última entrega (`/admin/configuracion`, claves `route*`/`local*`/`depot*` de `settings`). Entran los pedidos todavía por entregar (`!isFinalStatus`). Cada pedido se ubica una sola vez (`orders.lat/lng/location_status`): al crearlo (`after()`), reusando la de otro pedido con la misma dirección, o a mano desde el panel. Distancias en línea recta.
- La fecha de entrega no puede ser pasada. Los ítems del pedido guardan copia de nombre, precio y pack al momento de compra.
- Los productos no se borran: se desactivan con `active = false`.

## Variables de entorno

Ver `.env.example`. Mínimo: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (en Railway se puede omitir: usa `RAILWAY_PUBLIC_DOMAIN`), `SUPERADMIN_EMAILS` (y opcional `ADMIN_EMAILS`). `BLOB_READ_WRITE_TOKEN` es opcional. Nunca commitear `.env*` (salvo `.env.example`).

## Convenciones

- Server Components por defecto; `"use client"` solo donde hace falta interactividad.
- Acceso a datos con Drizzle desde server components o server actions, nunca desde el cliente.
- Toda server action nueva que modifique datos debe validar sesión/rol con `lib/session.ts`.
- Mensajes de error y textos de UI en español.
- Estilo existente: sin punto y coma, comillas dobles. Respetar el del archivo que se edita.
- `components/ui/` son componentes generados (shadcn base-nova sobre `@base-ui/react`): evitar editarlos. Para botones-link: `render={<Link href="..." />} nativeButton={false}` (no hay `asChild`).
