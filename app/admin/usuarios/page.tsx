import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/session"
import { isSuperadmin } from "@/lib/roles"
import { listUsers } from "@/app/actions/users"
import { UsersPanel } from "@/components/admin/users-panel"

export const dynamic = "force-dynamic"

export default async function AdminUsersPage() {
  const me = await getSessionUser()
  if (!me || !isSuperadmin(me.role)) redirect("/admin")

  const users = await listUsers()
  return <UsersPanel users={users} currentUserId={me.id} />
}
