import { betterAuth } from "better-auth"
import { pool } from "@/lib/db"

// URL pública: BETTER_AUTH_URL o, en Railway, el dominio que asigna la plataforma.
const baseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined)

function emailList(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

// Emails (separados por coma) que reciben ese rol al registrarse.
// SUPERADMIN_EMAILS además se aplica al iniciar sesión, por si la cuenta ya existía.
const superadminEmails = emailList(process.env.SUPERADMIN_EMAILS)
const adminEmails = emailList(process.env.ADMIN_EMAILS)

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
          const email = user.email.toLowerCase()
          if (superadminEmails.has(email)) return { data: { ...user, role: "superadmin" } }
          if (adminEmails.has(email)) return { data: { ...user, role: "admin" } }
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          if (superadminEmails.size === 0) return
          await pool.query(
            `UPDATE "user" SET role = 'superadmin', "updatedAt" = now()
             WHERE id = $1 AND role <> 'superadmin' AND lower(email) = ANY($2)`,
            [session.userId, [...superadminEmails]],
          )
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
