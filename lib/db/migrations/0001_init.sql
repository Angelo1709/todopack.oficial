-- Esquema inicial de TODO PACK. Debe coincidir con lib/db/schema.ts.

-- ---- Better Auth ----

CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  "image" text,
  "role" text NOT NULL DEFAULT 'customer',
  "phone" text,
  "address" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY,
  "expiresAt" timestamp NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamp,
  "refreshTokenExpiresAt" timestamp,
  "scope" text,
  "password" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");

-- ---- App ----

CREATE TABLE IF NOT EXISTS "products" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL UNIQUE,
  "price" integer NOT NULL,
  "category" text NOT NULL DEFAULT 'Otros',
  "image_url" text,
  "active" boolean NOT NULL DEFAULT true,
  "group_key" text,
  "pack_size" integer NOT NULL DEFAULT 1 CHECK ("pack_size" >= 1),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "products_category_idx" ON "products" ("category");
CREATE INDEX IF NOT EXISTS "products_group_key_idx" ON "products" ("group_key");

CREATE TABLE IF NOT EXISTS "orders" (
  "id" serial PRIMARY KEY,
  "public_token" text NOT NULL UNIQUE,
  "userId" text REFERENCES "user"("id") ON DELETE SET NULL,
  "customer_name" text NOT NULL,
  "phone" text NOT NULL,
  "email" text,
  "address" text NOT NULL,
  "delivery_date" date NOT NULL,
  "delivery_slot" text NOT NULL CHECK ("delivery_slot" IN ('mediodia', 'noche')),
  "payment_method" text NOT NULL CHECK ("payment_method" IN ('efectivo', 'transferencia')),
  "status" text NOT NULL CHECK (
    "status" IN ('pendiente_validacion', 'pendiente_entrega', 'pagado', 'entregado', 'cancelado')
  ),
  "total" integer NOT NULL,
  "notes" text,
  "paid_at" timestamptz,
  "delivered_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Los números de pedido se muestran con 5 dígitos: el primero es #00201.
SELECT setval(pg_get_serial_sequence('orders', 'id'), 200, true)
WHERE NOT EXISTS (SELECT 1 FROM "orders");

CREATE INDEX IF NOT EXISTS "orders_delivery_date_idx" ON "orders" ("delivery_date");
CREATE INDEX IF NOT EXISTS "orders_user_idx" ON "orders" ("userId");

CREATE TABLE IF NOT EXISTS "order_items" (
  "id" serial PRIMARY KEY,
  "order_id" integer NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "product_id" integer,
  "name" text NOT NULL,
  "price" integer NOT NULL,
  "pack_size" integer NOT NULL DEFAULT 1,
  "quantity" integer NOT NULL
);

CREATE INDEX IF NOT EXISTS "order_items_order_idx" ON "order_items" ("order_id");

CREATE TABLE IF NOT EXISTS "settings" (
  "key" text PRIMARY KEY,
  "value" text NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
