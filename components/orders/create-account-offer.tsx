import Link from "next/link"
import { Button } from "@/components/ui/button"
import { UserPlus } from "lucide-react"

/**
 * Invitación a crear cuenta después de comprar sin una. Los datos del formulario ya quedaron en
 * sessionStorage al confirmar el pedido (ver checkout-form): el registro los precarga.
 */
export function CreateAccountOffer() {
  return (
    <section className="mt-6 flex items-start gap-3 rounded-2xl bg-card p-5 shadow-card ring-1 ring-border/70">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <UserPlus className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">¿Querés crear una cuenta?</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Guardamos tus datos y tus pedidos para la próxima.</p>
        <Button render={<Link href="/sign-up?next=/mis-pedidos" />} nativeButton={false} className="mt-3 h-11 rounded-full px-5 font-semibold">
          Crear cuenta
        </Button>
      </div>
    </section>
  )
}
