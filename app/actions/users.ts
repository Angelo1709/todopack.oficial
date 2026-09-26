"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { account, orders, session, user } from "@/lib/db/schema"
import { requireSuperadmin } from "@/lib/session"
import { and, asc, count, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

// Roles que el superadmin puede asignar desde el panel (superadmin solo por SUPERADMIN_EMAILS).
export type AssignableRole = "admin" | "customer"

function isAssignableRole(value: unknown): value is AssignableRole {
  return value === "admin" || value === "customer"
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Los errores esperados se devuelven (no se tiran): en producción Next oculta el mensaje de los throw.
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string }

function passwordError(password: string): string | null {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres"
  if (password.length > 128) return "La contraseña es demasiado larga"
  return null
}

export async function listUsers() {
  await requireSuperadmin()
  const orderCounts = db
    .select({ userId: orders.userId, total: count().as("total") })
    .from(orders)
    .groupBy(orders.userId)
    .as("order_counts")

  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      createdAt: user.createdAt,
      orders: sql<number>`coalesce(${orderCounts.total}, 0)::int`,
    })
    .from(user)
    .leftJoin(orderCounts, eq(orderCounts.userId, user.id))
    .orderBy(sql`case ${user.role} when 'superadmin' then 0 when 'admin' then 1 else 2 end`, asc(user.name))
}

export type CreateUserInput = {
  name: string
  email: string
  phone?: string
  password: string
  role: AssignableRole
}

export async function createUser(input: CreateUserInput): Promise<ActionResult<{ id: string }>> {
  await requireSuperadmin()

  const name = input.name?.trim()
  const email = input.email?.trim().toLowerCase()
  const phone = input.phone?.trim() || undefined
  if (!name) return { ok: false, error: "Falta el nombre" }
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: "El email no es válido" }
  const pwError = passwordError(input.password ?? "")
  if (pwError) return { ok: false, error: pwError }
  if (!isAssignableRole(input.role)) return { ok: false, error: "Rol inválido" }

  const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email))
  if (existing) return { ok: false, error: "Ya existe un usuario con ese email" }

  // Better Auth crea el usuario y su cuenta con la contraseña hasheada.
  const created = await auth.api.signUpEmail({
    body: { name, email, password: input.password, phone },
  })
  const userId = created.user.id

  await db.update(user).set({ role: input.role, updatedAt: new Date() }).where(eq(user.id, userId))
  // signUpEmail inicia sesión automáticamente: esa sesión no la usa nadie.
  await db.delete(session).where(eq(session.userId, userId))

  revalidatePath("/admin/usuarios")
  return { ok: true, id: userId }
}

export async function setUserRole(userId: string, role: AssignableRole): Promise<ActionResult> {
  const me = await requireSuperadmin()
  if (!isAssignableRole(role)) return { ok: false, error: "Rol inválido" }
  if (userId === me.id) return { ok: false, error: "No podés cambiar tu propio rol" }

  const [target] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId))
  if (!target) return { ok: false, error: "El usuario no existe" }
  if (target.role === "superadmin") return { ok: false, error: "No se puede cambiar el rol de un superadmin" }

  await db.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, userId))
  revalidatePath("/admin/usuarios")
  return { ok: true }
}

export async function resetUserPassword(userId: string, password: string): Promise<ActionResult> {
  const me = await requireSuperadmin()
  const pwError = passwordError(password ?? "")
  if (pwError) return { ok: false, error: pwError }

  const [target] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId))
  if (!target) return { ok: false, error: "El usuario no existe" }
  if (target.role === "superadmin" && userId !== me.id) {
    return { ok: false, error: "No se puede cambiar la contraseña de otro superadmin" }
  }

  const ctx = await auth.$context
  const hash = await ctx.password.hash(password)
  const updated = await db
    .update(account)
    .set({ password: hash, updatedAt: new Date() })
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .returning({ id: account.id })
  if (updated.length === 0) return { ok: false, error: "El usuario no tiene contraseña configurada" }

  // Cierra las sesiones abiertas de ese usuario (salvo que sea uno mismo).
  if (userId !== me.id) await db.delete(session).where(eq(session.userId, userId))
  return { ok: true }
}
