"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Check, Copy } from "lucide-react"

/** Botón chico para copiar un dato (alias, CBU) al portapapeles. `label` en minúscula salvo siglas. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(`${label.charAt(0).toUpperCase()}${label.slice(1)} copiado`)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("No pudimos copiarlo. Seleccioná el texto y copialo a mano.")
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={copy}
      aria-label={`Copiar ${label}`}
      className="shrink-0 text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
    </Button>
  )
}
