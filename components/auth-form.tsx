"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const isSignUp = mode === "sign-up"

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    const email = String(fd.get("email") || "")
    const password = String(fd.get("password") || "")

    try {
      if (isSignUp) {
        const name = String(fd.get("name") || "")
        const phone = String(fd.get("phone") || "")
        const address = String(fd.get("address") || "")
        const { error } = await authClient.signUp.email({
          email,
          password,
          name,
          // additionalFields
          phone,
          address,
        } as Parameters<typeof authClient.signUp.email>[0])
        if (error) throw new Error(error.message)
      } else {
        const { error } = await authClient.signIn.email({ email, password })
        if (error) throw new Error(error.message)
      }
      router.push("/")
      router.refresh()
    } catch (err) {
      toast.error(
        isSignUp
          ? "No pudimos crear la cuenta. Verificá los datos e intentá de nuevo."
          : "Email o contraseña incorrectos.",
      )
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-6 flex flex-col items-center gap-3">
        <Image
          src="/logo-todopack.jpg"
          alt="TodoPack Alcorta"
          width={72}
          height={72}
          className="rounded-full ring-1 ring-primary/40"
        />
        <span className="font-serif text-xl font-bold">TodoPack Alcorta</span>
      </Link>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="font-serif text-2xl font-bold">
          {isSignUp ? "Crear cuenta" : "Ingresar"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSignUp
            ? "Registrate para hacer pedidos y coordinar entregas."
            : "Accedé a tu cuenta para seguir comprando."}
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          {isSignUp && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nombre y apellido</Label>
              <Input id="name" name="name" required autoComplete="name" />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={isSignUp ? "new-password" : "current-password"}
            />
          </div>
          {isSignUp && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">Teléfono</Label>
                <Input id="phone" name="phone" type="tel" required autoComplete="tel" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="address">Dirección de entrega</Label>
                <Input id="address" name="address" required autoComplete="street-address" />
              </div>
            </>
          )}
          <Button type="submit" size="lg" disabled={loading} className="mt-2">
            {loading ? "Procesando..." : isSignUp ? "Crear cuenta" : "Ingresar"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          {isSignUp ? (
            <>
              ¿Ya tenés cuenta?{" "}
              <Link href="/sign-in" className="font-medium text-foreground underline underline-offset-4">
                Ingresá
              </Link>
            </>
          ) : (
            <>
              ¿No tenés cuenta?{" "}
              <Link href="/sign-up" className="font-medium text-foreground underline underline-offset-4">
                Registrate
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
