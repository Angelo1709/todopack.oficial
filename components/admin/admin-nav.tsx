"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ClipboardList, Package, Settings, Users, Images } from "lucide-react"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/admin", label: "Pedidos", icon: ClipboardList },
  { href: "/admin/productos", label: "Productos", icon: Package },
  { href: "/admin/fotos", label: "Fotos", icon: Images },
  { href: "/admin/configuracion", label: "Configuración", icon: Settings },
]

const USERS_LINK = { href: "/admin/usuarios", label: "Usuarios", icon: Users }

export function AdminNav({
  pendingTransfers = 0,
  showUsers = false,
}: {
  pendingTransfers?: number
  showUsers?: boolean
}) {
  const pathname = usePathname()
  const links = showUsers ? [...LINKS, USERS_LINK] : LINKS

  return (
    <nav className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
        {links.map((l) => {
          const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href)
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <l.icon className="size-4" /> {l.label}
              {l.href === "/admin" && pendingTransfers > 0 && (
                <span
                  className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground tabular-nums"
                  title={`${pendingTransfers} ${pendingTransfers === 1 ? "transferencia" : "transferencias"} por validar`}
                >
                  {pendingTransfers > 99 ? "99+" : pendingTransfers}
                  <span className="sr-only"> por validar</span>
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
