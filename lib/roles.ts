// Roles de usuario (columna user.role).
// superadmin: todo lo de admin + gestionar usuarios. admin: panel de pedidos y catálogo. customer: cliente.

export const ROLES = ["customer", "admin", "superadmin"] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABEL: Record<Role, string> = {
  customer: "Cliente",
  admin: "Administrador",
  superadmin: "Superadmin",
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "superadmin"
}

export function isSuperadmin(role: string | null | undefined): boolean {
  return role === "superadmin"
}
