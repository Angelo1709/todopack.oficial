import {
  pgTable,
  text,
  timestamp,
  boolean,
  serial,
  integer,
  date,
  index,
} from "drizzle-orm/pg-core"

// Cualquier cambio acá necesita su migración SQL en lib/db/migrations/.

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
    category: text("category").notNull().default("Otros"),
    imageUrl: text("image_url"),
    active: boolean("active").notNull().default(true),
    // Presentaciones: "COCA COLA 1.5L UNIDAD" y "COCA COLA 1.5L PACK X6" comparten
    // groupKey; packSize = unidades que incluye el precio (1 = unidad suelta).
    groupKey: text("group_key"),
    packSize: integer("pack_size").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("products_category_idx").on(t.category), index("products_group_key_idx").on(t.groupKey)],
)

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
    paymentMethod: text("payment_method").notNull(), // 'efectivo' | 'transferencia'
    status: text("status").notNull(), // ver ORDER_STATUSES en lib/order-status.ts
    total: integer("total").notNull(),
    notes: text("notes"),
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

export type Product = typeof products.$inferSelect
export type Order = typeof orders.$inferSelect
export type OrderItem = typeof orderItems.$inferSelect
