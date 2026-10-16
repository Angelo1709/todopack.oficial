"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useCart } from "@/components/cart/cart-provider"
import { CartSheet } from "@/components/cart/cart-sheet"
import { authClient, useSession } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LogOut, ReceiptText, Search, ShieldCheck, ShoppingCart, User as UserIcon, X } from "lucide-react"
import { isAdminRole } from "@/lib/roles"
import { PendingTransferNotice } from "@/components/orders/pending-transfer-notice"

/** Buscador del catálogo: lleva a la tienda con `?q=`. */
function CatalogSearch({ initial, className }: { initial: string; className?: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initial)
  useEffect(() => setValue(initial), [initial])

  function go(text: string) {
    const q = text.trim()
    router.push(q ? `/?q=${encodeURIComponent(q)}` : "/")
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        go(value)
      }}
      className={cn("flex h-10 items-center rounded-full bg-background pl-4 pr-1 text-foreground", className)}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar productos, marcas..."
        aria-label="Buscar productos"
        maxLength={100}
        enterKeyHint="search"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("")
            if (initial) go("")
          }}
          className="grid size-8 shrink-0 place-items-center text-muted-foreground hover:text-foreground"
          aria-label="Borrar búsqueda"
        >
          <X className="size-4" />
        </button>
      )}
      <button
        type="submit"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
        aria-label="Buscar"
      >
        <Search className="size-4" />
      </button>
    </form>
  )
}

/** `search` muestra el buscador del catálogo (en la tienda); `query` es la búsqueda actual. */
export function SiteHeader({ search = false, query = "" }: { search?: boolean; query?: string }) {
  const { data: session, isPending } = useSession()
  const router = useRouter()
  const { count, total } = useCart()
  const user = session?.user as { name?: string; role?: string } | undefined

  async function handleSignOut() {
    await authClient.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-border bg-sidebar text-sidebar-foreground">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/logo-todopack.jpg"
            alt="TodoPack Alcorta"
            width={40}
            height={40}
            className="size-10 rounded-full ring-1 ring-primary/40"
          />
          <div className="hidden sm:block leading-tight">
            <span className="block font-serif text-lg font-bold">TodoPack Alcorta</span>
            <span className="block text-[10px] uppercase tracking-widest text-sidebar-foreground/60">
              Ventas por mayor y menor
            </span>
          </div>
        </Link>

        {search && <CatalogSearch initial={query} className="mx-2 hidden max-w-xl flex-1 sm:flex" />}

        <div className="ml-auto flex items-center gap-2">
          <CartSheet>
            <Button variant="secondary" className="relative gap-2" aria-label="Carrito">
              <ShoppingCart className="size-4" />
              <span className="hidden tabular-nums sm:inline">{count > 0 ? formatPrice(total) : "Carrito"}</span>
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
                  <ReceiptText className="size-4" /> Mis pedidos
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
            <>
              {/* Sin cuenta también se ven los pedidos hechos desde este navegador. */}
              <Button
                render={<Link href="/mis-pedidos" />}
                nativeButton={false}
                variant="ghost"
                aria-label="Mis pedidos"
                className="gap-2 text-sidebar-foreground"
              >
                <ReceiptText className="size-4" />
                <span className="hidden sm:inline">Mis pedidos</span>
              </Button>
              <Button render={<Link href="/sign-in" />} nativeButton={false} variant="default">
                Ingresar
              </Button>
            </>
          )}
        </div>
      </div>
      {search && (
        <div className="mx-auto flex h-12 max-w-7xl items-start px-4 sm:hidden">
          <CatalogSearch initial={query} className="w-full" />
        </div>
      )}
    </header>
    <PendingTransferNotice signedIn={!isPending && Boolean(user)} />
    </>
  )
}
