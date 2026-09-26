import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/session"
import { SiteHeader } from "@/components/site-header"
import { AdminNav } from "@/components/admin/admin-nav"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser()
  if (!user) redirect("/sign-in")
  if (user.role !== "admin") redirect("/")

  return (
    <main className="min-h-dvh bg-background">
      <SiteHeader />
      <AdminNav />
      {children}
    </main>
  )
}
