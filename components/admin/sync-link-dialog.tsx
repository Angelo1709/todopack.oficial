"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"
import {
  linkProduct,
  searchSystemArticles,
  unlinkProduct,
  type SystemArticleOption,
} from "@/app/actions/sistema"
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
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Link2, Search, Unlink } from "lucide-react"

type ProductRef = { id: number; name: string; price: number }

/** Primeras palabras del nombre: suele alcanzar para encontrar el mismo artículo en el sistema. */
function suggestedQuery(name: string) {
  return name.split(/\s+/).slice(0, 2).join(" ")
}

/** Vincular a mano un producto de la tienda con un artículo del sistema del local. */
export function LinkProductButton({ product }: { product: ProductRef }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(() => suggestedQuery(product.name))
  const [results, setResults] = useState<SystemArticleOption[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [searching, startSearch] = useTransition()
  const [saving, startSave] = useTransition()

  function search(q: string) {
    startSearch(async () => {
      try {
        setResults(await searchSystemArticles(q))
        setSelected(null)
      } catch {
        toast.error("No pudimos buscar en el sistema. Revisá la conexión y probá de nuevo.")
      }
    })
  }

  // Al abrir, busca con las primeras palabras del nombre.
  useEffect(() => {
    if (open && results === null) search(query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function save() {
    if (selected === null) return
    startSave(async () => {
      try {
        const result = await linkProduct(product.id, selected)
        if (result.ok) {
          toast.success(`${product.name}: vinculado`)
          setOpen(false)
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error("No pudimos vincular el producto. Revisá la conexión y probá de nuevo.")
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setResults(null)
          setSelected(null)
          setQuery(suggestedQuery(product.name))
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" className="h-9 px-3 sm:h-8" />}>
        <Link2 />
        Vincular
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vincular con el sistema del local</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{product.name}</span> · elegí el mismo artículo en el sistema.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            search(query)
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre en el sistema"
            aria-label="Buscar en el sistema del local"
            className="h-9 min-w-0"
          />
          <Button type="submit" variant="outline" className="h-9 shrink-0 px-3" disabled={searching}>
            {searching ? <Spinner aria-label="Buscando" /> : <Search />}
            Buscar
          </Button>
        </form>

        {results !== null &&
          (results.length === 0 ? (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              No hay artículos sin vincular con ese nombre. Probá con otra palabra.
            </p>
          ) : (
            <ul role="radiogroup" aria-label="Artículos del sistema" className="flex flex-col gap-1.5">
              {results.map((a) => (
                <li key={a.systemId}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected === a.systemId}
                    onClick={() => setSelected(a.systemId)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg border p-2.5 text-left transition-colors",
                      selected === a.systemId ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{a.name}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {a.code && `cód. ${a.code} · `}stock {a.stock}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{formatPrice(a.price)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ))}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" className="h-10 sm:h-8" />} disabled={saving}>
            Cancelar
          </DialogClose>
          <Button className="h-10 sm:h-8" onClick={save} disabled={selected === null || saving}>
            {saving && <Spinner aria-label="Vinculando" />}
            {saving ? "Vinculando..." : "Vincular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Sacar el vínculo (por ejemplo, si el emparejamiento por nombre se equivocó). */
export function UnlinkProductButton({ product }: { product: { id: number; name: string } }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function unlink() {
    startTransition(async () => {
      try {
        const result = await unlinkProduct(product.id)
        if (result.ok) {
          toast.success(`${product.name}: desvinculado`)
          setOpen(false)
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error("No pudimos desvincular el producto. Revisá la conexión y probá de nuevo.")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label={`Desvincular ${product.name}`} />
        }
      >
        <Unlink />
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>¿Desvincular {product.name}?</DialogTitle>
          <DialogDescription>
            Se va a vender sin control de stock y con el precio de la tienda. No se vuelve a vincular solo: si hace falta,
            lo vinculás a mano desde “Productos sin vincular”.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" className="h-10 sm:h-8" />} disabled={pending}>
            Volver
          </DialogClose>
          <Button variant="destructive" className="h-10 sm:h-8" onClick={unlink} disabled={pending}>
            {pending && <Spinner aria-label="Desvinculando" />}
            {pending ? "Desvinculando..." : "Sí, desvincular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
