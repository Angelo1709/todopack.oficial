import { betterAuth } from "better-auth"
import { pool } from "@/lib/db"

// URL pública: BETTER_AUTH_URL o, en Railway, el dominio que asigna la plataforma.
const baseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined)

// Emails que quedan como admin al registrarse (separados por coma).
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
)

export const auth = betterAuth({
  database: pool,
  baseURL,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "customer", input: false },
      phone: { type: "string", required: false, input: true },
      address: { type: "string", required: false, input: true },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!adminEmails.has(user.email.toLowerCase())) return
          return { data: { ...user, role: "admin" } }
        },
      },
    },
  },
  trustedOrigins: [
    ...(baseURL ? [baseURL] : []),
    ...(process.env.NODE_ENV === "development" ? ["http://localhost:3000"] : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
})
