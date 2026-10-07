-- Las candidatas se guardan fuera del catálogo público. Sólo una confirmación
-- explícita escribe products.image_url; los archivos sobreviven a los despliegues.
CREATE TABLE product_photo_candidates (
  id uuid PRIMARY KEY,
  product_id integer REFERENCES products(id) ON DELETE SET NULL,
  filename text NOT NULL,
  source_title text NOT NULL DEFAULT '',
  source_url text,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  image_data bytea NOT NULL CHECK (octet_length(image_data) BETWEEN 1 AND 8388608),
  sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'confirmada', 'errada')),
  version integer NOT NULL DEFAULT 1,
  created_by text REFERENCES "user"(id) ON DELETE SET NULL,
  reviewed_by text REFERENCES "user"(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX product_photo_dedup_idx ON product_photo_candidates (coalesce(product_id, 0), sha256);
CREATE INDEX product_photo_status_idx ON product_photo_candidates (status, created_at);
CREATE INDEX product_photo_product_idx ON product_photo_candidates (product_id);

CREATE TABLE product_photo_reviews (
  id bigserial PRIMARY KEY,
  candidate_id uuid NOT NULL REFERENCES product_photo_candidates(id),
  product_id integer REFERENCES products(id) ON DELETE SET NULL,
  status text NOT NULL,
  reviewed_by text REFERENCES "user"(id) ON DELETE SET NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
