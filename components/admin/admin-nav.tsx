"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ClipboardList, Package, Settings, Users } from "lucide-react"
import { cn } from "@/lib/utils"

const LINKS = [
  { href: "/admin", label: "Pedidos", icon: ClipboardList },
  { href: "/admin/productos", label: "Productos", icon: Package },
  { href: "/admin/configuracion", label: "Configuración", icon: Settings },
]

const USERS_LINK = { href: "/admin/usuarios", label: "Usuarios", icon: Users }

export function AdminNav({ showUsers = false }: { showUsers?: boolean }) {
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
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
