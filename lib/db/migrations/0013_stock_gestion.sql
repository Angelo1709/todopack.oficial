-- Espejo del inventario: sólo el receptor de stock escribe estas tablas.
CREATE TABLE gestion_stock (
  article_id integer PRIMARY KEY CHECK (article_id > 0),
  code text NOT NULL,
  name text NOT NULL,
  name_key text NOT NULL,
  quantity double precision NOT NULL,
  snapshot_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gestion_stock_name_key_idx ON gestion_stock(name_key);

CREATE TABLE stock_sync_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  source_id text NOT NULL,
  snapshot_id uuid NOT NULL,
  captured_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  item_count integer NOT NULL,
  matched_products integer NOT NULL
);

ALTER TABLE products ADD COLUMN gestion_article_id integer;
ALTER TABLE products ADD COLUMN stock_quantity double precision;
ALTER TABLE products ADD COLUMN stock_updated_at timestamptz;
CREATE INDEX products_gestion_article_idx ON products(gestion_article_id);
