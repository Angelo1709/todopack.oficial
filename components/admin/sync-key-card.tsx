"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { generateSyncKey } from "@/app/actions/sistema"
import { CopyButton } from "@/components/checkout/copy-button"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Download, KeyRound } from "lucide-react"

function configText(origin: string, key: string) {
  return [
    "# Sincronizador TODO PACK: copiá este archivo en la carpeta del sincronizador de la PC del local.",
    `URL=${origin}/api/sistema/sincronizar`,
    `CLAVE=${key}`,
    "# Ruta de la base del sistema. Vacía = se busca sola (C:\\Gestion\\Gestion.mdb y otras ubicaciones comunes).",
    "BASE=",
    "",
  ].join("\r\n")
}

/**
 * Clave con la que la PC del local manda los datos (sólo superadmin). Se muestra una sola vez, junto con
 * el config.txt listo para descargar; generar otra deja sin efecto la anterior.
 */
export function SyncKeyCard({ hasKey }: { hasKey: boolean }) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function generate() {
    startTransition(async () => {
      try {
        const result = await generateSyncKey()
        if (result.ok) setKey(result.key)
        else toast.error(result.error)
      } catch {
        toast.error("No pudimos generar la clave. Revisá la conexión y probá de nuevo.")
      }
    })
  }

  function download() {
    if (!key) return
    const blob = new Blob([configText(window.location.origin, key)], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "config.txt"
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <KeyRound className="size-4 text-primary" /> Clave de la PC del local
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {hasKey
          ? "Ya hay una clave configurada. Generá otra sólo si la perdiste o hay que instalar el sincronizador en otra PC: la anterior deja de funcionar."
          : "Generá la clave y descargá el config.txt para instalar el sincronizador en la PC del local."}
      </p>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setKey(null)
        }}
      >
        <DialogTrigger render={<Button variant={hasKey ? "outline" : "default"} className="h-9 px-3" />}>
          <KeyRound />
          {hasKey ? "Generar clave nueva" : "Generar clave"}
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          {key ? (
            <>
              <DialogHeader>
                <DialogTitle>Clave generada</DialogTitle>
                <DialogDescription>
                  Descargá el config.txt ahora: la clave no se vuelve a mostrar. Copialo en la carpeta del sincronizador
                  de la PC del local.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-1 rounded-lg bg-muted p-3">
                <span className="min-w-0 flex-1 break-all font-mono text-sm">{key}</span>
                <CopyButton value={key} label="clave" />
              </div>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" className="h-10 sm:h-8" />}>Cerrar</DialogClose>
                <Button className="h-10 sm:h-8" onClick={download}>
                  <Download />
                  Descargar config.txt
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{hasKey ? "¿Generar una clave nueva?" : "Generar clave"}</DialogTitle>
                <DialogDescription>
                  {hasKey
                    ? "La PC del local va a dejar de sincronizar hasta que le copies el config.txt nuevo."
                    : "Con esta clave la PC del local manda el stock y los precios a la tienda."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" className="h-10 sm:h-8" />} disabled={pending}>
                  Volver
                </DialogClose>
                <Button className="h-10 sm:h-8" onClick={generate} disabled={pending}>
                  {pending && <Spinner aria-label="Generando" />}
                  {pending ? "Generando..." : "Generar"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
