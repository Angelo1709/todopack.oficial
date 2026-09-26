"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { authClient } from "@/lib/auth-client"
import { claimOrders } from "@/app/actions/orders"
import {
  clearSignUpPrefill,
  forgetOrderTokens,
  getRememberedOrderTokens,
  readSignUpPrefill,
  type SignUpPrefill,
} from "@/lib/guest-orders"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

function authErrorMessage(code: string | undefined, isSignUp: boolean): string {
  switch (code) {
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "Ya hay una cuenta con ese email. Ingresá con tu contraseña."
    case "PASSWORD_TOO_SHORT":
      return "La contraseña tiene que tener al menos 8 caracteres."
    case "INVALID_EMAIL":
      return "Revisá el email."
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Email o contraseña incorrectos."
    default:
      return isSignUp
        ? "No pudimos crear la cuenta. Verificá los datos e intentá de nuevo."
        : "Email o contraseña incorrectos."
  }
}

/** Asocia a la cuenta recién ingresada los pedidos hechos sin cuenta desde este navegador. */
async function claimGuestOrders() {
  const tokens = getRememberedOrderTokens()
  if (tokens.length === 0) return
  try {
    const res = await claimOrders(tokens)
    forgetOrderTokens(res.tokens)
    if (res.claimed > 0) {
      toast.success(
        res.claimed === 1 ? "Sumamos tu pedido a tu cuenta." : `Sumamos ${res.claimed} pedidos a tu cuenta.`,
      )
    }
  } catch {
    // Si falla, los tokens quedan guardados y se reintenta en el próximo ingreso.
  }
}

export function AuthForm({ mode, next = "/" }: { mode: "sign-in" | "sign-up"; next?: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [prefill, setPrefill] = useState<SignUpPrefill | null>(null)
  const isSignUp = mode === "sign-up"
  const nextQuery = next !== "/" ? `?next=${encodeURIComponent(next)}` : ""

  // Precarga del registro con los datos del último pedido (sessionStorage, nunca por URL).
  useEffect(() => {
    if (isSignUp) setPrefill(readSignUpPrefill())
  }, [isSignUp])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const email = String(fd.get("email") || "").trim()
    const password = String(fd.get("password") || "")

    if (isSignUp) {
      const digits = String(fd.get("phone") || "").replace(/\D/g, "").length
      if (digits < 8 || digits > 15) {
        toast.error("Revisá el teléfono: tiene que tener al menos 8 números")
        document.getElementById("phone")?.focus()
        return
      }
    }

    setLoading(true)
    try {
      if (isSignUp) {
        const name = String(fd.get("name") || "").trim()
        const phone = String(fd.get("phone") || "").trim()
        const address = String(fd.get("address") || "").trim()
        const { error } = await authClient.signUp.email({
          email,
          password,
          name,
          // additionalFields
          phone,
          ...(address ? { address } : {}),
        } as Parameters<typeof authClient.signUp.email>[0])
        if (error) throw new Error(error.code)
        clearSignUpPrefill()
      } else {
        const { error } = await authClient.signIn.email({ email, password })
        if (error) throw new Error(error.code)
      }
      await claimGuestOrders()
      router.push(next)
      router.refresh()
    } catch (err) {
      toast.error(authErrorMessage(err instanceof Error ? err.message : undefined, isSignUp))
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
          className="size-18 rounded-full ring-1 ring-primary/40"
        />
        <span className="font-serif text-xl font-bold">TodoPack Alcorta</span>
      </Link>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="font-serif text-2xl font-bold">{isSignUp ? "Crear cuenta" : "Ingresar"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSignUp
            ? "Guardamos tus datos y tus pedidos para que la próxima compra sea más rápida."
            : "Accedé a tu cuenta para ver tus pedidos y comprar más rápido."}
        </p>
        {isSignUp && prefill && (
          <p className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            Completamos el formulario con los datos de tu pedido. Solo falta elegir una contraseña.
          </p>
        )}

        {/* key: remonta los campos cuando llega la precarga para que tomen los valores. */}
        <form key={prefill ? "prefill" : "empty"} onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          {isSignUp && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Nombre y apellido</Label>
              <Input
                id="name"
                name="name"
                required
                maxLength={120}
                autoComplete="name"
                defaultValue={prefill?.name}
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={prefill?.email}
            />
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
              autoFocus={Boolean(isSignUp && prefill?.email)}
            />
            {isSignUp && <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>}
          </div>
          {isSignUp && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  required
                  maxLength={30}
                  autoComplete="tel"
                  defaultValue={prefill?.phone}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="address">
                  Dirección de entrega <span className="font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="address"
                  name="address"
                  maxLength={300}
                  autoComplete="street-address"
                  defaultValue={prefill?.address}
                />
              </div>
            </>
          )}
          <Button type="submit" size="lg" disabled={loading} className="mt-2">
            {loading ? (isSignUp ? "Creando cuenta..." : "Ingresando...") : isSignUp ? "Crear cuenta" : "Ingresar"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          {isSignUp ? (
            <>
              ¿Ya tenés cuenta?{" "}
              <Link
                href={`/sign-in${nextQuery}`}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Ingresá
              </Link>
            </>
          ) : (
            <>
              ¿No tenés cuenta?{" "}
              <Link
                href={`/sign-up${nextQuery}`}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Registrate
              </Link>
            </>
          )}
        </p>
      </div>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        No hace falta cuenta para comprar.{" "}
        <Link href="/" className="font-medium text-foreground underline underline-offset-4">
          Seguí comprando
        </Link>
      </p>
    </div>
  )
}
