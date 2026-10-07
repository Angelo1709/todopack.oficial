"use client"

import { startTransition as transition,useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  getProductGroup,
  saveProduct,
  searchProductsForLink,
  unlinkProductPresentation,
  type ProductOption,
} from "@/app/actions/catalog"
import { CATEGORY_ORDER, categorize } from "@/lib/categorize"
import { categoryImage } from "@/lib/categories"
import { normalizeGroupKey, parsePresentation, presentationLabel, unitPrice } from "@/lib/pack"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Link2, Search, Sparkles, X } from "lucide-react"

export type AdminProduct = {
  id: number
  name: string
  price: number
  category: string
  packSize: number
  groupKey: string | null
  imageUrl: string | null
  active: boolean
}

type FormState = {
  name: string
  price: string
  category: string
  packSize: string
  groupKey: string
  imageUrl: string
  active: boolean
}

function initialState(product: AdminProduct | null): FormState {
  if (!product) {
    return { name: "", price: "", category: "Otros", packSize: "1", groupKey: "", imageUrl: "", active: true }
  }
  return {
    name: product.name,
    price: String(product.price),
    category: product.category,
    packSize: String(product.packSize),
    groupKey: product.groupKey ?? "",
    imageUrl: product.imageUrl ?? "",
    active: product.active,
  }
}

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export function ProductDialog({
  open,
  onOpenChange,
  product,
  focusLink=false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = producto nuevo */
  product: AdminProduct | null
  focusLink?:boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        {/* key: al abrir otro producto el formulario arranca de cero */}
        {open && <ProductForm key={product?.id ?? "nuevo"} product={product} focusLink={focusLink} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function ProductForm({ product, focusLink,onDone }: { product: AdminProduct | null; focusLink:boolean;onDone: () => void }) {
  const router = useRouter()
  const isNew = product === null
  const [form, setForm] = useState<FormState>(() => initialState(product))
  // En un producto nuevo, categoría / presentación / grupo se detectan del nombre hasta que se tocan a mano.
  const [autoDetect, setAutoDetect] = useState(isNew)
  const [linkTo, setLinkTo] = useState<ProductOption | null>(null)
  const [currentIsPack,setCurrentIsPack]=useState(true)
  const [linkUnits,setLinkUnits]=useState("")
  const [searching,setSearching]=useState(false)
  const [searchError,setSearchError]=useState("")
  const [search, setSearch] = useState("")
  const [results, setResults] = useState<ProductOption[]>([])
  const [group, setGroup] = useState<ProductOption[]>([])
  const [imageError, setImageError] = useState(false)
  const [pending, startTransition] = useTransition()

  const debouncedSearch = useDebounced(search, 250)
  const effectiveGroupKey = normalizeGroupKey(form.groupKey) || parsePresentation(form.name).groupKey
  const debouncedGroupKey = useDebounced(effectiveGroupKey, 300)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function detectFromName(name: string) {
    const p = parsePresentation(name)
    setForm((f) => ({ ...f, packSize: String(p.packSize), groupKey: p.groupKey, category: categorize(name) }))
    setLinkTo(null)
  }

  function handleNameChange(name: string) {
    set("name", name)
    if (autoDetect) detectFromName(name)
  }

  function touchDetected<K extends "category" | "packSize" | "groupKey">(key: K, value: FormState[K]) {
    setAutoDetect(false)
    set(key, value)
  }

  useEffect(() => {
    let cancelled = false
    const q = debouncedSearch.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false);setSearchError("")
      return
    }
    setSearching(true);setSearchError("");setResults([])
    transition(async()=>{
      try {const r=await searchProductsForLink(q,product?.id);if(!cancelled)setResults(r)}
      catch {if(!cancelled)setSearchError("No pudimos buscar. Revisá la conexión o tu sesión y probá de nuevo.")}
      finally {if(!cancelled)setSearching(false)}
    })
    return () => {
      cancelled = true
    }
  }, [debouncedSearch, product?.id])

  useEffect(() => {
    let cancelled = false
    if (!debouncedGroupKey) {
      setGroup([])
      return
    }
    transition(async()=>{
      try {const r=await getProductGroup(debouncedGroupKey);if(!cancelled)setGroup(r)}
      catch {if(!cancelled)setGroup([])}
    })
    return () => {
      cancelled = true
    }
  }, [debouncedGroupKey])

  function chooseLink(option: ProductOption) {
    setAutoDetect(false)
    setLinkTo(option)
    const isPack=Number(form.packSize)>1
    setCurrentIsPack(isPack)
    const count=isPack ? Number(form.packSize) : option.packSize
    setLinkUnits(count>1 ? String(count) : "")
    setSearch("")
    setResults([])
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const price = Number(form.price)
    const packSize = Number(form.packSize)
    if (!form.name.trim()) return toast.error("Escribí el nombre del producto.")
    if (!Number.isInteger(price) || price <= 0) return toast.error("El precio tiene que ser un número entero mayor a 0.")
    if (!Number.isInteger(packSize) || packSize < 1) return toast.error("Las unidades por presentación tienen que ser 1 o más.")
    if (linkTo && (!Number.isInteger(Number(linkUnits))||Number(linkUnits)<2||Number(linkUnits)>1000)) return toast.error("Indicá cuántas unidades trae el pack: entre 2 y 1.000.")
    startTransition(async () => {
      try {
        const res = await saveProduct({
          id: product?.id ?? null,
          name: form.name,
          price,
          category: form.category,
          packSize,
          groupKey: form.groupKey,
          imageUrl: form.imageUrl,
          active: form.active,
          linkToId: linkTo?.id ?? null,
          linkCurrentIsPack:currentIsPack,
          linkPackSize:linkTo ? Number(linkUnits) : undefined,
        })
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        toast.success(linkTo ? "Unitario y pack vinculados: una tarjeta y una foto" : isNew ? "Producto creado" : "Cambios guardados")
        onDone()
        router.refresh()
      } catch {
        toast.error("No se pudo guardar el producto. Probá de nuevo.")
      }
    })
  }

  const price = Number(form.price)
  const packSize = Number(form.packSize)
  const showUnit = Number.isInteger(packSize) && packSize > 1 && price > 0
  const siblings = group.filter((g) => g.id !== product?.id)
  const nameChanged = product !== null && form.name.trim() !== product.name
  const previewSrc = form.imageUrl.trim() && !imageError ? form.imageUrl.trim() : categoryImage(form.category)
  function unlink() {
    if(!product)return
    startTransition(async()=>{
      try {const res=await unlinkProductPresentation(product.id);if(!res.ok){toast.error(res.error);return}
        toast.success("Producto separado: conserva su precio y su foto");onDone();router.refresh()}
      catch {toast.error("No pudimos separar el producto. Probá de nuevo.")}
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{focusLink ? "Vincular unitario y pack" : isNew ? "Nuevo producto" : "Editar producto"}</DialogTitle>
        <DialogDescription>
          {focusLink ? "Buscá el otro producto, elegí cuál es el pack y indicá cuántas unidades trae. Revisá los precios y guardá el vínculo." : isNew
            ? "Categoría, presentación y grupo se completan solos a partir del nombre; podés corregirlos."
            : "Los cambios se ven en la tienda al guardar. Los productos no se borran: se desactivan."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="product-name">Nombre</Label>
          <Input
            id="product-name"
            value={form.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Ej: COCA COLA 1.5L PACK X6"
            maxLength={200}
            autoFocus={isNew}
          />
          {nameChanged && (
            <p className="text-xs text-muted-foreground">
              Ojo: la importación del Excel reconoce los productos por nombre. Si lo cambiás, la próxima lista lo
              va a tomar como un producto nuevo.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-price">Precio (pesos)</Label>
          <Input
            id="product-price"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={form.price}
            onChange={(e) => set("price", e.target.value)}
            className="tabular-nums"
          />
          <p className="text-xs text-muted-foreground">Precio de la presentación completa.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-pack">Unidades por presentación</Label>
          <Input
            id="product-pack"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            step={1}
            value={form.packSize}
            disabled={Boolean(linkTo)||pending}
            onChange={(e) => touchDetected("packSize", e.target.value)}
            className="tabular-nums"
          />
          <p className="text-xs text-muted-foreground tabular-nums">
            {linkTo ? "Las unidades se definen abajo, en el vínculo entre unitario y pack." : showUnit
              ? `${presentationLabel(form.name, packSize)} · ≈ ${formatPrice(unitPrice(price, packSize))} c/u`
              : "1 = unidad suelta; 6 = pack x6."}
          </p>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Categoría</Label>
          <Select value={form.category} onValueChange={(v) => v && touchDetected("category", String(v))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_ORDER.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <section className="flex flex-col gap-3 rounded-lg bg-muted p-3 sm:col-span-2">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="product-group">Grupo (mismo artículo en otras presentaciones)</Label>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  setAutoDetect(false)
                  detectFromName(form.name)
                }}
                disabled={!form.name.trim()}
                title="Recalcular categoría, presentación y grupo a partir del nombre"
              >
                <Sparkles className="size-3" /> Detectar
              </Button>
            </div>
            <Input
              id="product-group"
              value={form.groupKey}
              onChange={(e) => {
                setLinkTo(null)
                touchDetected("groupKey", e.target.value)
              }}
              placeholder={parsePresentation(form.name).groupKey || "se calcula del nombre"}
              className="bg-background font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Un mismo artículo se muestra en una tarjeta, con una foto y precios según la cantidad de unidades.
            </p>
          </div>

          {linkTo ? (
            <div className="rounded-lg border border-primary bg-primary/5 p-3 text-sm">
              <div className="flex items-start gap-2">
              <Link2 className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 wrap-anywhere">
                Se vincula con <strong>{linkTo.name}</strong>
              </span>
              <Button type="button" variant="ghost" size="icon-xs" onClick={() => setLinkTo(null)} aria-label="Cancelar este vínculo" disabled={pending}>
                <X />
              </Button>
              </div>
              <p id="pack-role-label" className="mt-3 text-sm font-medium">¿Cuál es el pack?</p>
              <div role="radiogroup" aria-labelledby="pack-role-label" className="mt-2 grid gap-2">
                {[true,false].map(role=><button key={String(role)} type="button" role="radio" aria-checked={currentIsPack===role} disabled={pending}
                  onClick={()=>{setCurrentIsPack(role);const count=role ? Number(form.packSize) : linkTo.packSize;setLinkUnits(count>1?String(count):"")}}
                  className={cn("min-w-0 rounded-lg border p-2 text-left text-xs wrap-anywhere",currentIsPack===role ? "border-primary bg-primary/5" : "border-border bg-background")}>
                  <span className="block font-medium">{role ? "Este producto es el pack" : "El producto elegido es el pack"}</span>
                  <span className="block mt-1">{role ? form.name : linkTo.name} · {formatPrice(role ? price : linkTo.price)}</span>
                </button>)}
              </div>
              <div className="mt-3 flex flex-col gap-1.5">
                <Label htmlFor="link-pack-units">¿Cuántas unidades trae ese pack?</Label>
                <Input id="link-pack-units" type="number" inputMode="numeric" min={2} max={1000} step={1} value={linkUnits} onChange={e=>setLinkUnits(e.target.value)} placeholder="Ej: 6 o 20" disabled={pending}/>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">El otro producto será el unitario (1 unidad). Al guardar, comparten la foto del unitario; si no tiene, se usa la del pack. Los dos precios se conservan.</p>
              {Number(linkUnits)>=2 && <p className="mt-2 text-xs font-medium">Una tarjeta: unidad {formatPrice(currentIsPack ? linkTo.price : price)} · pack x{linkUnits} {formatPrice(currentIsPack ? price : linkTo.price)}.</p>}
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Vincular con otro producto: buscalo por nombre..."
                className="bg-background pl-8"
                aria-label="Buscar producto para vincular"
                autoFocus={focusLink}
                disabled={pending}
              />
              {searching && <p role="status" className="mt-2 text-xs text-muted-foreground">Buscando productos...</p>}
              {searchError && <p role="alert" className="mt-2 text-xs text-destructive">{searchError}</p>}
              {!searching && !searchError && debouncedSearch.trim().length>=2 && !results.length && <p className="mt-2 text-xs text-muted-foreground">No encontramos productos activos con ese nombre.</p>}
              {results.length > 0 && (
                <ul className="mt-1 max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => chooseLink(r)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                      >
                        <span className="min-w-0 wrap-anywhere">{r.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {r.label} · {formatPrice(r.price)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium">Otras presentaciones del grupo</p>
            {siblings.length === 0 ? (
              <p className="text-xs text-muted-foreground">Ninguna: se muestra como producto único.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {siblings.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 rounded-md bg-background px-2 py-1.5 text-xs">
                    <span className="min-w-0 wrap-anywhere">
                      <span className="font-medium">{s.label}</span> · {s.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                      {!s.active && <Badge variant="outline">Inactivo</Badge>}
                      {formatPrice(s.price)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {product && siblings.length>0 && !linkTo && <div className="mt-2">
              <Button type="button" variant="outline" size="sm" onClick={unlink} disabled={pending}>Separar este producto de la tarjeta</Button>
              <p className="mt-1 text-xs text-muted-foreground">Conserva su precio, unidades por presentación y foto. Después podés volver a vincularlo.</p>
            </div>}
          </div>
        </section>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="product-image">Imagen (URL)</Label>
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL externa de cualquier dominio */}
            <img
              src={previewSrc}
              alt=""
              className="size-16 shrink-0 rounded-lg border border-border bg-muted object-cover"
              onError={() => setImageError(true)}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Input
                id="product-image"
                type="url"
                value={form.imageUrl}
                onChange={(e) => {
                  setImageError(false)
                  set("imageUrl", e.target.value)
                }}
                placeholder="https://..."
              />
              <p className={cn("text-xs", imageError ? "text-destructive" : "text-muted-foreground")}>
                {imageError
                  ? "No pudimos cargar esa imagen. Revisá el link."
                  : "Pegá el link de una imagen. Sin imagen se usa la de la categoría."}
              </p>
            </div>
          </div>
        </div>

        <label
          className={cn(
            "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors sm:col-span-2",
            form.active ? "border-primary bg-primary/5" : "border-border",
          )}
        >
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => set("active", e.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium">Activo</span>
            <span className="block text-xs text-muted-foreground">
              {form.active ? "Se muestra en la tienda." : "Oculto en la tienda (no se borra)."}
            </span>
          </span>
        </label>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando..." : isNew ? "Crear producto" : "Guardar cambios"}
        </Button>
      </DialogFooter>
    </form>
  )
}
