@AGENTS.md

# TODO PACK — tienda online mayorista

Tienda online de la distribuidora TODO PACK (bebidas, almacén, limpieza, descartables). Los clientes arman un carrito, eligen fecha de entrega y medio de pago; el administrador gestiona pedidos, entregas y el catálogo. La interfaz y los mensajes al usuario están en **español (Argentina)**.

## Stack

- **Next.js 16 (App Router) + React 19**, TypeScript. Leer `AGENTS.md`: esta versión de Next tiene cambios que rompen convenciones viejas; consultar `node_modules/next/dist/docs/` antes de usar APIs de Next.
- **Tailwind CSS v4** + componentes **shadcn/ui** (`components/ui/`, config en `components.json`).
- **PostgreSQL** con **Drizzle ORM** (`lib/db/`), driver `pg`.
- **Better Auth** (email + contraseña) en `lib/auth.ts`; ruta `app/api/auth/[...all]`.
- **Vercel Blob** para imágenes de productos y comprobantes de pago.
- **eve** (framework de agentes) para el agente de imágenes en `agent/`.
- Gestor de paquetes: **pnpm**. El proyecto se generó originalmente con v0 (por eso aparecen `V0_*` en variables y logs `[v0]`).

## Comandos

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # ojo: next.config tiene ignoreBuildErrors: true
pnpm exec tsc --noEmit   # chequeo de tipos real (el build no lo hace)
```

Scripts de datos (requieren `DATABASE_URL`):

```bash
node scripts/parse-products.mjs [ruta.xlsx]   # lista de precios Excel -> data/products.json
node scripts/seed-products.mjs                 # upsert de data/products.json en la tabla products
node scripts/gen-seed-sql.mjs                  # genera data/seed-N.sql
node scripts/import-product-images.mjs         # busca imágenes en Wikimedia (IMAGE_BATCH=n)
```

No hay tests ni drizzle-kit configurados; las tablas se crearon a mano. Si cambiás `lib/db/schema.ts`, escribí también el SQL de migración correspondiente.

## Estructura

- `app/page.tsx` — catálogo público (búsqueda, filtro por categoría, paginación de 24).
- `app/checkout`, `app/mis-pedidos` — compra y pedidos del cliente.
- `app/admin` — panel de administración (`components/admin/`).
- `app/actions/orders.ts`, `app/actions/admin.ts` — server actions. Las de admin llaman a `requireAdmin()`; las de cliente a `requireUser()` (`lib/session.ts`).
- `app/s/` + `app/_components/` — chat con el agente de imágenes (solo admins).
- `components/cart/` — carrito en el cliente (context provider + sheet).
- `lib/db/schema.ts` — tablas: `user`, `session`, `account`, `verification` (Better Auth, columnas camelCase obligatorias) y `products`, `orders`, `order_items`.
- `lib/categorize.ts` y `scripts/parse-products.mjs` — reglas de categorización por palabras clave. **Están duplicadas: si cambiás una, cambiá la otra.**
- `lib/categories.ts` — slug e imagen de respaldo por categoría (`public/categories/*.png`).
- `agent/` — agente eve: `instructions.md` (prompt), `tools/` (listar productos sin imagen, guardar imagen en Blob), `channels/eve.ts` (auth: solo rol `admin`).
- `data/` — Excel de lista de precios y `products.json` generado.

## Reglas de negocio

- Precios en **pesos enteros** (`integer`), sin centavos. Formatear con `lib/format.ts`.
- Roles: `customer` (default) y `admin`, en la columna `user.role`. Un admin se asigna directamente en la base.
- Pedido: `status` = `nuevo | en_camino | entregado | cancelado`; `paymentStatus` = `pendiente | pagado | rechazado`; `paymentMethod` = `efectivo | transferencia` (transferencia lleva comprobante). Etiquetas visibles en `lib/order-labels.ts`.
- La fecha de entrega no puede ser pasada. Los ítems del pedido guardan copia de nombre y precio al momento de compra.
- Los productos no se borran: se desactivan con `active = false`.

## Variables de entorno

Ver `.env.example`. Mínimo para desarrollo local: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, y `BLOB_READ_WRITE_TOKEN` para subir imágenes. Nunca commitear `.env*` (salvo `.env.example`).

## Convenciones

- Server Components por defecto; `"use client"` solo donde hace falta interactividad.
- Acceso a datos con Drizzle desde server components o server actions, nunca desde el cliente.
- Toda server action nueva que modifique datos debe validar sesión/rol con `lib/session.ts`.
- Mensajes de error y textos de UI en español.
- Estilo existente: sin punto y coma en `app/`, `components/`, `lib/`; con punto y coma en `agent/`. Respetar el del archivo que se edita.
- `components/ai-elements/` y `components/ui/` son componentes generados (shadcn / AI Elements): evitar editarlos salvo que sea necesario.
