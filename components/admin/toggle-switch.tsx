"use client"

import { useId } from "react"
import { cn } from "@/lib/utils"

/** Interruptor prendido/apagado (role="switch"), con la etiqueta a la derecha. Área táctil de 44px. */
export function ToggleSwitch({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
  id?: string
}) {
  const labelId = useId()
  const descriptionId = useId()
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={description ? descriptionId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center gap-3 rounded-lg text-left disabled:opacity-60"
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5.5" : "translate-x-0.5",
          )}
        />
      </span>
      <span className="min-w-0">
        <span id={labelId} className="block text-sm font-semibold">
          {label}
        </span>
        {description && (
          <span id={descriptionId} className="block text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </button>
  )
}
