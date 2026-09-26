"use client"

import { Button } from "@/components/ui/button"
import { Printer } from "lucide-react"

export function OrdersPrintButton({ disabled }: { disabled?: boolean }) {
  return (
    <Button variant="outline" className="h-9 px-3 print:hidden" disabled={disabled} onClick={() => window.print()}>
      <Printer />
      Imprimir
    </Button>
  )
}
