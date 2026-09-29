import "leaflet/dist/leaflet.css"
import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/session"
import { countPendingTransfers } from "@/app/actions/admin-orders"
import { SiteHeader } from "@/components/site-header"
import { AdminNav } from "@/components/admin/admin-nav"
import { isAdminRole, isSuperadmin } from "@/lib/roles"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect("/sign-in")
  if (!isAdminRole(user.role)) redirect("/")

  const pendingTransfers = await countPendingTransfers()

  return (
    <main className="min-h-dvh bg-background">
      {/* `contents` mantiene el header sticky; al imprimir (carga del día) se ocultan header y nav. */}
      <div className="contents print:hidden">
        <SiteHeader />
        <AdminNav pendingTransfers={pendingTransfers} showUsers={isSuperadmin(user.role)} />
      </div>
      {children}
    </main>
  )
}
