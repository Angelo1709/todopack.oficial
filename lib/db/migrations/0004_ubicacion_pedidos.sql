-- Ubicación de la entrega, para armar el recorrido de reparto (lib/route.ts).
-- location_status: exacta | aproximada | manual | no_encontrada. NULL = todavía no se buscó.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "lat" double precision;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "lng" double precision;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "location_status" text;

ALTER TABLE "orders" ADD CONSTRAINT "orders_location_check" CHECK (
  CASE
    WHEN "location_status" IS NULL OR "location_status" = 'no_encontrada' THEN "lat" IS NULL AND "lng" IS NULL
    WHEN "location_status" IN ('exacta', 'aproximada', 'manual') THEN
      "lat" IS NOT NULL AND "lng" IS NOT NULL AND "lat" BETWEEN -90 AND 90 AND "lng" BETWEEN -180 AND 180
    ELSE false
  END
);
