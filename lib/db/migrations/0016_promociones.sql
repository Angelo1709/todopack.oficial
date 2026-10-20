-- Descuento web exclusivo (porcentaje general de la tienda, ver lib/promo.ts): cada pedido de la web
-- guarda el porcentaje que se le aplicó y cuántos pesos se descontaron (0 = sin descuento).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS web_discount_percent integer NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS web_discount_amount integer NOT NULL DEFAULT 0;

-- Banners de la portada: imágenes que sube el admin (p. ej. hechas en Canva), guardadas en la base
-- como las fotos de productos. Una versión para celular y otra para computadora (al menos una).
-- Las imágenes de un banner no cambian nunca: para cambiarlas se sube otro banner.
CREATE TABLE IF NOT EXISTS banners (
  id uuid PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  mobile_mime text CHECK (mobile_mime IN ('image/jpeg', 'image/png', 'image/webp')),
  mobile_data bytea CHECK (octet_length(mobile_data) BETWEEN 1 AND 8388608),
  desktop_mime text CHECK (desktop_mime IN ('image/jpeg', 'image/png', 'image/webp')),
  desktop_data bytea CHECK (octet_length(desktop_data) BETWEEN 1 AND 8388608),
  created_by text REFERENCES "user"(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (mobile_data IS NOT NULL OR desktop_data IS NOT NULL),
  CHECK ((mobile_data IS NULL) = (mobile_mime IS NULL) AND (desktop_data IS NULL) = (desktop_mime IS NULL))
);
CREATE INDEX IF NOT EXISTS banners_position_idx ON banners (position, created_at);
