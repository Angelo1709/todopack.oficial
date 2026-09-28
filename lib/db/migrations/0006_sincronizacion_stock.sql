-- Sincronización con el sistema de gestión del local (programa de escritorio con base Access).
-- Un script en la PC del local lee sus artículos (nombre, precio, stock) y los manda a /api/sistema/sincronizar.

-- Copia de los artículos del sistema, tal como llegaron en la última sincronización.
CREATE TABLE IF NOT EXISTS "system_articles" (
  "system_id" integer PRIMARY KEY,               -- IdArticulo del sistema
  "code" text NOT NULL DEFAULT '',                -- CodigoArticulo
  "name" text NOT NULL,
  "net_price" double precision NOT NULL,          -- PrecioUnitario (sin IVA)
  "iva" double precision NOT NULL,                -- alícuota en %, ej. 21
  "price" integer NOT NULL,                       -- precio final en pesos enteros (con IVA, redondeado)
  "stock" integer NOT NULL,
  -- Producto de la tienda (una presentación) vinculado. Único: cada producto, a lo sumo un artículo.
  "product_id" integer UNIQUE REFERENCES "products"("id") ON DELETE SET NULL,
  -- nombre: se vinculó solo por nombre · manual: lo vinculó el admin
  -- desvinculado: el admin sacó el vínculo (sin producto; no se vuelve a vincular solo)
  "link_source" text CHECK ("link_source" IN ('nombre', 'manual', 'desvinculado')),
  "seen_at" timestamptz NOT NULL,                 -- última sincronización que lo trajo
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Registro de cada sincronización recibida.
CREATE TABLE IF NOT EXISTS "stock_syncs" (
  "id" serial PRIMARY KEY,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "source" text NOT NULL DEFAULT '',              -- nombre de la PC que la mandó
  "articles" integer NOT NULL,                    -- artículos recibidos
  "linked" integer NOT NULL,                      -- vinculados a un producto de la tienda
  "new_links" integer NOT NULL,                   -- vinculados por nombre en esta sincronización
  "prices_updated" integer NOT NULL               -- productos a los que se les cambió el precio
);

CREATE INDEX IF NOT EXISTS "stock_syncs_received_idx" ON "stock_syncs" ("received_at" DESC);
