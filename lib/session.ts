import { auth } from "@/lib/auth"
import { headers } from "next/headers"

export type SessionUser = {
  id: string
  name: string
  email: string
  role: string
  phone?: string | null
  address?: string | null
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  return session.user as unknown as SessionUser
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new Error("Unauthorized")
  return user
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role !== "admin") throw new Error("Forbidden")
  return user
}
