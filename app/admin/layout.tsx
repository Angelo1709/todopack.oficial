import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/session"
import { countPendingTransfers } from "@/app/actions/admin-orders"
import { SiteHeader } from "@/components/site-header"
import { AdminNav } from "@/components/admin/admin-nav"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect("/sign-in")
  if (user.role !== "admin") redirect("/")

  const pendingTransfers = await countPendingTransfers()

  return (
    <main className="min-h-dvh bg-background">
      {/* `contents` mantiene el header sticky; al imprimir (carga del día) se ocultan header y nav. */}
      <div className="contents print:hidden">
        <SiteHeader />
        <AdminNav pendingTransfers={pendingTransfers} />
      </div>
      {children}
    </main>
  )
}
