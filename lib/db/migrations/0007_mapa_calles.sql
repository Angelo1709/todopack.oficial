-- Mapa de calles de la zona (OpenStreetMap), para medir el recorrido por calle respetando las manos únicas.
-- Una sola fila: se reemplaza con "Actualizar calles" en /admin/configuracion (ver lib/street-map.ts).

CREATE TABLE IF NOT EXISTS "street_map" (
  "id" integer PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "fetched_at" timestamptz NOT NULL,
  "bbox" text NOT NULL,                 -- "sur,oeste,norte,este" de la zona descargada
  "ways" integer NOT NULL,              -- calles (vías de OpenStreetMap) transitables
  "one_ways" integer NOT NULL,          -- de esas, de mano única
  "graph" jsonb NOT NULL                -- {nodes: [[lat, lng], ...], edges: [[desde, hasta], ...]}
);
