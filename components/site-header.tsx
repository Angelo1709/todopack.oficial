"use client"

import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useCart } from "@/components/cart/cart-provider"
import { CartSheet } from "@/components/cart/cart-sheet"
import { authClient, useSession } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogOut, Package, ShieldCheck, User as UserIcon } from "lucide-react"
import { isAdminRole } from "@/lib/roles"

export function SiteHeader() {
  const { data: session, isPending } = useSession()
  const router = useRouter()
  const { count } = useCart()
  const user = session?.user as { name?: string; role?: string } | undefined

  async function handleSignOut() {
    await authClient.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-sidebar text-sidebar-foreground">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo-todopack.jpg"
            alt="TodoPack Alcorta"
            width={40}
            height={40}
            className="rounded-full ring-1 ring-primary/40"
          />
          <div className="hidden sm:block leading-tight">
            <span className="block font-serif text-lg font-bold">TodoPack Alcorta</span>
            <span className="block text-[10px] uppercase tracking-widest text-sidebar-foreground/60">
              Ventas por mayor y menor
            </span>
          </div>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <CartSheet>
            <Button variant="secondary" className="relative gap-2">
              <Package className="size-4" />
              <span className="hidden sm:inline">Carrito</span>
              {count > 0 && (
                <span className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </Button>
          </CartSheet>

          {isPending ? null : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon" className="rounded-full text-sidebar-foreground" />
                }
              >
                <UserIcon className="size-5" />
                <span className="sr-only">Mi cuenta</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="truncate">{user.name}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/mis-pedidos" />}>
                  <Package className="size-4" /> Mis pedidos
                </DropdownMenuItem>
                {isAdminRole(user.role) && (
                  <DropdownMenuItem render={<Link href="/admin" />}>
                    <ShieldCheck className="size-4" /> Panel admin
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="size-4" /> Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button render={<Link href="/sign-in" />} nativeButton={false} variant="default">
              Ingresar
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
