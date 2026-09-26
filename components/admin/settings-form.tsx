"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { updateSettings } from "@/app/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import type { SettingKey, Settings } from "@/lib/settings"
import { normalizeWhatsAppNumber, whatsappUrl } from "@/lib/whatsapp"
import { ExternalLink, Landmark, MessageCircle } from "lucide-react"

type FieldErrors = Partial<Record<SettingKey, string>>

export function SettingsForm({ initial }: { initial: Settings }) {
  const [values, setValues] = useState<Settings>(initial)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [pending, startTransition] = useTransition()

  const normalized = values.whatsappNumber.trim() ? normalizeWhatsAppNumber(values.whatsappNumber) : ""
  const cbuDigits = values.bankCbu.replace(/\D/g, "").length

  function set(key: SettingKey, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const result = await updateSettings(values)
        if (result.ok) {
          setValues(result.values)
          setErrors({})
          toast.success("Configuración guardada")
        } else {
          setErrors(result.fieldErrors ?? {})
          toast.error(result.error)
        }
      } catch {
        toast.error("No pudimos guardar la configuración. Revisá la conexión y probá de nuevo.")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <MessageCircle className="size-4 text-primary" /> WhatsApp de la tienda
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          A este número los clientes te mandan el comprobante de transferencia y te consultan por sus pedidos.
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="whatsappNumber">Número de WhatsApp</Label>
          <Input
            id="whatsappNumber"
            name="whatsappNumber"
            inputMode="tel"
            autoComplete="off"
            placeholder="5493415551234"
            value={values.whatsappNumber}
            onChange={(e) => set("whatsappNumber", e.target.value)}
            aria-invalid={errors.whatsappNumber ? true : undefined}
            aria-describedby="whatsappNumber-help"
            className="h-9"
          />
          {errors.whatsappNumber ? (
            <p id="whatsappNumber-help" className="text-xs text-destructive">
              {errors.whatsappNumber}
            </p>
          ) : (
            <p id="whatsappNumber-help" className="text-xs text-muted-foreground">
              Con código de país y de área, sin 0 ni 15. Ej.: 5493415551234 (Argentina = 549 + área + número).
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-lg bg-muted p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Así queda el número para WhatsApp</p>
            <p className="font-mono break-all text-foreground">{normalized || "—"}</p>
          </div>
          {normalized ? (
            <Button
              variant="outline"
              className="h-9 px-3"
              render={
                <a
                  href={whatsappUrl(values.whatsappNumber, "Prueba desde el panel de TodoPack")}
                  target="_blank"
                  rel="noreferrer"
                />
              }
              nativeButton={false}
            >
              <ExternalLink />
              Probar link
            </Button>
          ) : (
            <Button variant="outline" className="h-9 px-3" disabled>
              <ExternalLink />
              Probar link
            </Button>
          )}
        </div>
        {!normalized && (
          <p className="mt-2 text-xs text-muted-foreground">
            Sin número, los clientes no van a poder mandarte el comprobante por WhatsApp.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <Landmark className="size-4 text-primary" /> Datos bancarios
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Se muestran al cliente cuando elige pagar por transferencia.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bankAlias">Alias</Label>
            <Input
              id="bankAlias"
              name="bankAlias"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="todopack.alcorta"
              value={values.bankAlias}
              onChange={(e) => set("bankAlias", e.target.value)}
              aria-invalid={errors.bankAlias ? true : undefined}
              className="h-9 font-mono"
            />
            {errors.bankAlias && <p className="text-xs text-destructive">{errors.bankAlias}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bankHolder">Titular de la cuenta</Label>
            <Input
              id="bankHolder"
              name="bankHolder"
              autoComplete="off"
              placeholder="TodoPack Alcorta"
              value={values.bankHolder}
              onChange={(e) => set("bankHolder", e.target.value)}
              aria-invalid={errors.bankHolder ? true : undefined}
              className="h-9"
            />
            {errors.bankHolder && <p className="text-xs text-destructive">{errors.bankHolder}</p>}
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="bankCbu">CBU / CVU</Label>
            <Input
              id="bankCbu"
              name="bankCbu"
              inputMode="numeric"
              autoComplete="off"
              placeholder="22 números"
              value={values.bankCbu}
              onChange={(e) => set("bankCbu", e.target.value)}
              aria-invalid={errors.bankCbu ? true : undefined}
              className="h-9 font-mono"
            />
            {errors.bankCbu ? (
              <p className="text-xs text-destructive">{errors.bankCbu}</p>
            ) : (
              <p className="text-xs text-muted-foreground tabular-nums">
                {cbuDigits > 0 ? `${cbuDigits}/22 números` : "Opcional si cargaste el alias."}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-muted p-4 text-sm">
          <p className="mb-2 text-xs text-muted-foreground">Así lo ve el cliente</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Alias</dt>
            <dd className="font-mono break-all text-foreground">{values.bankAlias.trim() || "—"}</dd>
            <dt className="text-muted-foreground">CBU</dt>
            <dd className="font-mono break-all text-foreground">{values.bankCbu.replace(/[\s.-]/g, "") || "—"}</dd>
            <dt className="text-muted-foreground">Titular</dt>
            <dd className="text-foreground">{values.bankHolder.trim() || "—"}</dd>
          </dl>
        </div>
      </section>

      <Button type="submit" size="lg" className="h-10 w-full sm:w-auto sm:self-end" disabled={pending}>
        {pending && <Spinner aria-label="Guardando" />}
        {pending ? "Guardando..." : "Guardar cambios"}
      </Button>
    </form>
  )
}
