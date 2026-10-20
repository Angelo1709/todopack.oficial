import {
  pgTable,
  text,
  timestamp,
  boolean,
  serial,
  integer,
  date,
  index,
  doublePrecision,
  jsonb,
  uuid,
  customType,
} from "drizzle-orm/pg-core"
import type { StreetGraph } from "../street-graph"

// Cualquier cambio acá necesita su migración SQL en lib/db/migrations/.

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" })

// ---- Better Auth tables (camelCase columns are required by Better Auth) ----

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("customer"), // 'customer' | 'admin'
  phone: text("phone"),
  address: text("address"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
})

// ---- App tables ----

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    price: integer("price").notNull(), // pesos enteros, precio de la presentación completa
    offer: jsonb("offer").$type<import("../offers").Offer>(),
    category: text("category").notNull().default("Otros"),
    imageUrl: text("image_url"),
    active: boolean("active").notNull().default(true),
    gestionArticleId: integer("gestion_article_id"),
    stockQuantity: doublePrecision("stock_quantity"),
    stockUpdatedAt: timestamp("stock_updated_at", { withTimezone: true }),
    // Presentaciones: "COCA COLA 1.5L UNIDAD" y "COCA COLA 1.5L PACK X6" comparten
    // groupKey; packSize = unidades que incluye el precio (1 = unidad suelta).
    groupKey: text("group_key"),
    packSize: integer("pack_size").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("products_category_idx").on(t.category), index("products_group_key_idx").on(t.groupKey), index("products_gestion_article_idx").on(t.gestionArticleId)],
)

export const gestionStock = pgTable("gestion_stock", {
  articleId: integer("article_id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  price: integer("price"), // precio final con IVA; null si Gestión no lo informó
  snapshotId: uuid("snapshot_id").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const stockSyncState = pgTable("stock_sync_state", {
  id: integer("id").primaryKey().default(1),
  sourceId: text("source_id").notNull(),
  snapshotId: uuid("snapshot_id").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  itemCount: integer("item_count").notNull(),
  matchedProducts: integer("matched_products").notNull(),
})

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    // Token aleatorio para que un cliente sin cuenta vea su pedido en /pedido/[token].
    publicToken: text("public_token").notNull().unique(),
    userId: text("userId").references(() => user.id, { onDelete: "set null" }), // null = compra como invitado
    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    address: text("address").notNull(),
    deliveryDate: date("delivery_date").notNull(),
    deliverySlot: text("delivery_slot").notNull(), // ver DELIVERY_SLOTS en lib/order-status.ts
    deliveryWindow: text("delivery_window"), // horario acordado al confirmar; null en pedidos anteriores
    paymentMethod: text("payment_method").notNull(), // 'efectivo' | 'transferencia'
    status: text("status").notNull(), // ver ORDER_STATUSES en lib/order-status.ts
    total: integer("total").notNull(),
    notes: text("notes"),
    // Ubicación de la entrega para el recorrido. locationStatus: ver LOCATION_STATUSES en lib/route.ts
    // (null = todavía no se buscó).
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    locationStatus: text("location_status"),
    // 'web' (checkout de la tienda) | 'manual' (cargado desde el panel). Ver ORDER_ORIGINS en lib/order-status.ts.
    origin: text("origin").notNull().default("web"),
    // Admin que cargó el pedido manual (null en los de la web).
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    // Descuento web (lib/promo.ts) aplicado al pedido: porcentaje y pesos descontados (0 = sin descuento).
    webDiscountPercent: integer("web_discount_percent").notNull().default(0),
    webDiscountAmount: integer("web_discount_amount").notNull().default(0),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("orders_delivery_date_idx").on(t.deliveryDate), index("orders_user_idx").on(t.userId)],
)

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: integer("product_id"),
  // Copia al momento de la compra.
  name: text("name").notNull(),
  price: integer("price").notNull(),
  packSize: integer("pack_size").notNull().default(1),
  quantity: integer("quantity").notNull(),
})

// Configuración editable desde el panel admin (WhatsApp, datos bancarios...). Ver lib/settings.ts.
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/** Banners de la portada que sube el admin (lib/banners.ts). Imágenes fijas: para cambiarlas se sube otro. */
export const banners = pgTable("banners", {
  id: uuid("id").primaryKey(),
  title: text("title").notNull().default(""), // qué dice la imagen (texto alternativo)
  link: text("link").notNull().default(""), // a dónde lleva al tocarlo ('' = a ningún lado)
  active: boolean("active").notNull().default(true),
  position: integer("position").notNull().default(0),
  mobileMime: text("mobile_mime"),
  mobileData: bytea("mobile_data"),
  desktopMime: text("desktop_mime"),
  desktopData: bytea("desktop_data"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/** Mapa de calles de la zona (una sola fila). Ver lib/street-map.ts y lib/street-graph.ts. */
export const streetMap = pgTable("street_map", {
  id: integer("id").primaryKey().default(1),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  bbox: text("bbox").notNull(), // "sur,oeste,norte,este"
  ways: integer("ways").notNull(),
  oneWays: integer("one_ways").notNull(),
  graph: jsonb("graph").$type<StreetGraph>().notNull(),
})

export type Product = typeof products.$inferSelect
export type Order = typeof orders.$inferSelect
export type OrderItem = typeof orderItems.$inferSelect
