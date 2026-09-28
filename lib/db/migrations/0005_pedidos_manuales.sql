-- Pedidos cargados a mano desde el panel (teléfono, mostrador...), además de los de la tienda web.
-- origin: 'web' (checkout) | 'manual' (panel). created_by: admin que lo cargó (null en los web).

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "origin" text NOT NULL DEFAULT 'web';
ALTER TABLE "orders" ADD CONSTRAINT "orders_origin_check" CHECK ("origin" IN ('web', 'manual'));

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "created_by" text REFERENCES "user"("id") ON DELETE SET NULL;
