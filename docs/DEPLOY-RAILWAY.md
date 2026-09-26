# Deploy en Railway

La app es un servicio Node (Next.js) + una base PostgreSQL de Railway. `railway.json` ya define todo lo del deploy:

| Paso | Comando | Qué hace |
|---|---|---|
| Build | `pnpm build` | compila Next.js (falla si hay errores de tipos) |
| Start | `pnpm start` | aplica las migraciones pendientes (con lock) y levanta `next start` en el `PORT` de Railway |
| Healthcheck | `GET /api/health` | responde 200 si la base contesta |

## 1. Crear el proyecto (una sola vez)

1. Subí el repo a GitHub (rama `main`).
2. En [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo** → elegí `todopack.oficial`.
3. En el mismo proyecto: **+ New** → **Database** → **PostgreSQL**.
4. En el servicio de la app → **Variables**, cargá:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia a la base, red privada) |
   | `BETTER_AUTH_SECRET` | un secreto largo: `openssl rand -base64 32` |
   | `ADMIN_EMAILS` | email(s) del dueño, separados por coma |
   | `BETTER_AUTH_URL` | solo si usás dominio propio: `https://tudominio.com.ar` |

5. Servicio de la app → **Settings** → **Networking** → **Generate Domain**. Sin `BETTER_AUTH_URL`, la app usa ese dominio (`RAILWAY_PUBLIC_DOMAIN`).
6. Railway despliega solo en cada push a `main`. El primer deploy crea las tablas.

## 2. Primeros pasos en la app

1. Entrá a `/sign-up` y registrate con un email de `ADMIN_EMAILS`: esa cuenta queda como admin.
2. **Panel admin → Configuración**: cargá el WhatsApp de la distribuidora (con código de país, ej. `5493415551234`), alias, CBU y titular. Son los datos que ve el cliente al pagar por transferencia.
3. **Panel admin → Productos → Importar Excel**: subí la lista de precios. Cada vez que cambien los precios, se vuelve a importar el Excel: actualiza precios y agrega los productos nuevos.

## Alternativa por CLI

```bash
railway login
railway init                 # crea el proyecto (o `railway link` para uno existente)
railway add --database postgres
railway up                   # sube y despliega el código local
railway domain               # genera el dominio público
```

Las variables se cargan desde el dashboard o con `railway variable set CLAVE=valor`.

## Mantenimiento

- **Migraciones**: cada cambio de esquema es un archivo nuevo `lib/db/migrations/NNNN_descripcion.sql`; se aplica solo en el próximo deploy.
- **Dar admin a otra cuenta**: agregar su email a `ADMIN_EMAILS` antes de que se registre, o correr `pnpm make-admin email@x.com` dentro del servicio (`railway ssh`).
- **Backups**: la base de Railway tiene backups en su pestaña **Backups** (según el plan).
- **Logs**: pestaña **Deployments** → **View logs** del servicio.
