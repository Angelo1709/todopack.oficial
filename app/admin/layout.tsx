import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/session"
import { SiteHeader } from "@/components/site-header"
import { AdminNav } from "@/components/admin/admin-nav"
import { isAdminRole, isSuperadmin } from "@/lib/roles"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect("/sign-in")
  if (!isAdminRole(user.role)) redirect("/")

  return (
    <main className="min-h-dvh bg-background">
      <SiteHeader />
      <AdminNav showUsers={isSuperadmin(user.role)} />
      {children}
    </main>
  )
}
