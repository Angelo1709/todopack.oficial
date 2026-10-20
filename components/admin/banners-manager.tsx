"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { deleteBanner, moveBanner, setBannerActive, updateBanner } from "@/app/actions/promo"
import { ToggleSwitch } from "@/components/admin/toggle-switch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { ArrowDown, ArrowUp, ExternalLink, ImagePlus, Images, Lightbulb, Pencil, Trash2, TriangleAlert } from "lucide-react"

type Variant = "celular" | "compu"

export type AdminBanner = {
  id: string
  title: string
  link: string
  active: boolean
  mobileUrl: string | null
  desktopUrl: string | null
}

// Mismos tamaños que lib/banners.ts (BANNER_SIZES) y que la portada (aspect 2/1 y 16/5).
const SIZES: Record<Variant, { width: number; height: number; label: string; aspect: string }> = {
  celular: { width: 1080, height: 540, label: "Celular", aspect: "aspect-[2/1]" },
  compu: { width: 1920, height: 600, label: "Computadora", aspect: "aspect-[16/5]" },
}
const MAX_BYTES = 8 * 1024 * 1024
const TYPES = ["image/jpeg", "image/png", "image/webp"]

type Picked = { file: File; url: string; width: number; height: number }

/** Aviso si la imagen no tiene la proporción recomendada (se va a ver con bordes, sin recortarse). */
function aspectWarning(variant: Variant, picked: Picked) {
  const target = SIZES[variant].width / SIZES[variant].height
  const ratio = picked.width / picked.height
  if (Math.abs(ratio - target) / target < 0.08) return null
  return `Mide ${picked.width} × ${picked.height} px: ${ratio > target ? "es más ancha" : "es más alta"} que lo recomendado (${SIZES[variant].width} × ${SIZES[variant].height}). Se va a ver completa, pero con bordes ${ratio > target ? "arriba y abajo" : "a los costados"}.`
}

function ImagePicker({
  variant,
  picked,
  onPick,
  disabled,
}: {
  variant: Variant
  picked: Picked | null
  onPick: (picked: Picked | null) => void
  disabled: boolean
}) {
  const size = SIZES[variant]
  const inputRef = useRef<HTMLInputElement>(null)
  const warning = picked && aspectWarning(variant, picked)

  function choose(file: File | undefined) {
    if (!file) return
    if (!TYPES.includes(file.type)) return toast.error("Elegí una imagen JPG, PNG o WebP.")
    if (file.size > MAX_BYTES) return toast.error("La imagen puede pesar hasta 8 MB.")
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => onPick({ file, url, width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      toast.error("No pudimos abrir esa imagen. Probá exportarla de nuevo como PNG o JPG.")
    }
    img.src = url
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={`banner-${variant}`}>
        Imagen para {size.label.toLowerCase()}{" "}
        <span className="font-normal text-muted-foreground tabular-nums">
          ({size.width} × {size.height} px)
        </span>
      </Label>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className={cn(
          "relative w-full overflow-hidden rounded-lg border-2 border-dashed border-border bg-sidebar transition hover:border-primary disabled:opacity-60",
          size.aspect,
        )}
      >
        {picked ? (
          // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:), sin optimizar
          <img src={picked.url} alt="" className="absolute inset-0 size-full object-contain" />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm text-sidebar-foreground/80">
            <ImagePlus aria-hidden="true" className="size-6" />
            Elegir imagen
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        id={`banner-${variant}`}
        type="file"
        accept={TYPES.join(",")}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          choose(e.target.files?.[0])
          e.target.value = ""
        }}
      />
      {picked && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">{picked.file.name}</span>
          <button type="button" onClick={() => onPick(null)} disabled={disabled} className="min-h-8 shrink-0 font-medium underline">
            Quitar
          </button>
        </div>
      )}
      {warning && (
        <p className="flex gap-1.5 text-xs text-amber-800 dark:text-amber-300">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" /> {warning}
        </p>
      )}
    </div>
  )
}

function UploadForm({ disabled, onUploaded }: { disabled: boolean; onUploaded: () => void }) {
  const [images, setImages] = useState<Record<Variant, Picked | null>>({ celular: null, compu: null })
  const [title, setTitle] = useState("")
  const [link, setLink] = useState("")
  const [uploading, setUploading] = useState(false)
  const imagesRef = useRef(images)
  imagesRef.current = images

  // Libera las vistas previas al salir de la página.
  useEffect(() => () => Object.values(imagesRef.current).forEach((p) => p && URL.revokeObjectURL(p.url)), [])

  function pick(variant: Variant, picked: Picked | null) {
    const previous = images[variant]
    if (previous) URL.revokeObjectURL(previous.url)
    setImages((current) => ({ ...current, [variant]: picked }))
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!images.celular && !images.compu) return toast.error("Elegí al menos una imagen.")
    const form = new FormData()
    if (images.celular) form.set("celular", images.celular.file)
    if (images.compu) form.set("compu", images.compu.file)
    form.set("titulo", title)
    form.set("link", link)
    setUploading(true)
    try {
      const response = await fetch("/api/admin/banners", { method: "POST", body: form })
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) return toast.error(body.error ?? "No pudimos subir el banner. Volvé a intentar.")
      toast.success("Banner agregado: ya se ve en la portada")
      Object.values(images).forEach((p) => p && URL.revokeObjectURL(p.url))
      setImages({ celular: null, compu: null })
      setTitle("")
      setLink("")
      onUploaded()
    } catch {
      toast.error("No pudimos subir el banner. Revisá la conexión y probá de nuevo.")
    } finally {
      setUploading(false)
    }
  }

  const busy = disabled || uploading
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <ImagePlus aria-hidden="true" className="size-4 text-primary" /> Agregar un banner
      </h3>
      <div className="grid gap-4 sm:grid-cols-[2fr_3fr]">
        <ImagePicker variant="celular" picked={images.celular} onPick={(p) => pick("celular", p)} disabled={busy} />
        <ImagePicker variant="compu" picked={images.compu} onPick={(p) => pick("compu", p)} disabled={busy} />
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">Si subís una sola, se usa la misma en celular y en computadora.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="banner-title">¿Qué dice la imagen? (opcional)</Label>
          <Input
            id="banner-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Ej.: Nuevo Fernet 1L, ya disponible"
            disabled={busy}
            className="h-11 text-base sm:text-sm"
          />
          <p className="text-xs text-muted-foreground">Lo leen los celulares para personas ciegas y Google.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="banner-link">Al tocarlo, llevar a… (opcional)</Label>
          <Input
            id="banner-link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            maxLength={500}
            inputMode="url"
            placeholder="Pegá el link de una página de la tienda"
            disabled={busy}
            className="h-11 text-base sm:text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Abrí la tienda, buscá el producto o elegí la categoría y copiá el link de la barra del navegador.
          </p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || (!images.celular && !images.compu)} className="h-11 min-w-40 rounded-xl font-semibold">
          {uploading && <Spinner />} {uploading ? "Subiendo…" : "Agregar banner"}
        </Button>
      </div>
    </form>
  )
}

function BannerRow({
  banner,
  position,
  total,
  busy,
  run,
}: {
  banner: AdminBanner
  position: number
  total: number
  busy: boolean
  run: (action: () => Promise<{ ok: boolean; error?: string }>, success?: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [title, setTitle] = useState(banner.title)
  const [link, setLink] = useState(banner.link)
  useEffect(() => {
    setTitle(banner.title)
    setLink(banner.link)
  }, [banner.title, banner.link])

  return (
    <li className={cn("rounded-lg border border-border bg-background p-3 sm:p-4", !banner.active && "opacity-75")}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="grid w-full shrink-0 grid-cols-[2fr_3fr] items-start gap-2 sm:w-72">
          {(["celular", "compu"] as const).map((variant) => {
            const url = variant === "celular" ? (banner.mobileUrl ?? banner.desktopUrl) : (banner.desktopUrl ?? banner.mobileUrl)
            const own = variant === "celular" ? banner.mobileUrl : banner.desktopUrl
            return (
              <figure key={variant} className="min-w-0">
                <div className={cn("relative overflow-hidden rounded-md bg-sidebar", SIZES[variant].aspect)}>
                  {url && (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura del panel
                    <img src={url} alt="" loading="lazy" className="absolute inset-0 size-full object-contain" />
                  )}
                </div>
                <figcaption className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {SIZES[variant].label}
                  {!own && " (usa la otra)"}
                </figcaption>
              </figure>
            )
          })}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted-foreground tabular-nums">
                {position} de {total} · {banner.active ? "Se muestra" : "Pausado"}
              </p>
              <p className="font-medium wrap-anywhere">{banner.title || <span className="text-muted-foreground">Sin descripción</span>}</p>
              {banner.link ? (
                <a href={banner.link} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 text-xs text-muted-foreground underline">
                  <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
                  <span className="truncate">{banner.link}</span>
                </a>
              ) : (
                <p className="text-xs text-muted-foreground">No lleva a ningún lado</p>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11"
                disabled={busy || position === 1}
                onClick={() => run(() => moveBanner(banner.id, -1))}
                aria-label={`Mover el banner ${position} antes`}
              >
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11"
                disabled={busy || position === total}
                onClick={() => run(() => moveBanner(banner.id, 1))}
                aria-label={`Mover el banner ${position} después`}
              >
                <ArrowDown aria-hidden="true" />
              </Button>
            </div>
          </div>

          <ToggleSwitch
            checked={banner.active}
            disabled={busy}
            onChange={(active) => run(() => setBannerActive(banner.id, active), active ? "Banner visible en la portada" : "Banner pausado")}
            label={banner.active ? "Se muestra en la portada" : "Pausado (no se muestra)"}
          />

          {editing ? (
            <form
              className="flex flex-col gap-3 rounded-lg bg-muted p-3"
              onSubmit={(e) => {
                e.preventDefault()
                run(async () => {
                  const result = await updateBanner(banner.id, { title, link })
                  if (result.ok) setEditing(false)
                  return result
                }, "Banner actualizado")
              }}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`title-${banner.id}`}>¿Qué dice la imagen?</Label>
                <Input id={`title-${banner.id}`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} disabled={busy} className="h-11 bg-background text-base sm:text-sm" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`link-${banner.id}`}>Al tocarlo, llevar a…</Label>
                <Input id={`link-${banner.id}`} value={link} maxLength={500} inputMode="url" onChange={(e) => setLink(e.target.value)} disabled={busy} placeholder="Vacío = no lleva a ningún lado" className="h-11 bg-background text-base sm:text-sm" />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" className="h-11" onClick={() => setEditing(false)} disabled={busy}>
                  Cancelar
                </Button>
                <Button type="submit" className="h-11" disabled={busy}>
                  Guardar
                </Button>
              </div>
            </form>
          ) : confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm">
              <span className="mr-auto font-medium">¿Borrar este banner? No se puede deshacer.</span>
              <Button type="button" variant="ghost" className="h-11" onClick={() => setConfirmDelete(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="h-11"
                disabled={busy}
                onClick={() => run(() => deleteBanner(banner.id), "Banner borrado")}
              >
                Sí, borrar
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-11 gap-1.5" onClick={() => setEditing(true)} disabled={busy}>
                <Pencil aria-hidden="true" /> Editar texto o link
              </Button>
              <Button type="button" variant="ghost" className="h-11 gap-1.5 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>
                <Trash2 aria-hidden="true" /> Borrar
              </Button>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

/** Banners de la portada (Admin → Promociones): subir, ordenar, pausar, editar y borrar. */
export function BannersManager({ banners, max }: { banners: AdminBanner[]; max: number }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const visible = banners.filter((b) => b.active).length

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    startTransition(async () => {
      try {
        const result = await action()
        if (!result.ok) return void toast.error(result.error ?? "No pudimos guardar. Volvé a intentar.")
        if (success) toast.success(success)
        router.refresh()
      } catch {
        toast.error("No pudimos guardar. Revisá la conexión y probá de nuevo.")
      }
    })
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <Images className="size-4 text-primary" /> Banners de la portada
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Imágenes que se muestran arriba de todo en la tienda, una tras otra: un producto nuevo, una promo, un aviso.
        Mientras haya alguno visible, ocupan el lugar del encabezado de bienvenida.
      </p>

      <div className="mb-4 flex gap-3 rounded-lg bg-primary/10 p-3 text-sm ring-1 ring-primary/20">
        <Lightbulb aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="font-semibold">Cómo hacerlos en Canva</p>
          <p className="text-muted-foreground">
            Crear un diseño → Tamaño personalizado:{" "}
            <span className="font-medium text-foreground tabular-nums">1080 × 540 px</span> para celular (la mayoría de
            los clientes) y <span className="font-medium text-foreground tabular-nums">1920 × 600 px</span> para
            computadora. Dejá los textos grandes y en el centro, lejos de los bordes. Descargalo como PNG o JPG.
          </p>
        </div>
      </div>

      <UploadForm disabled={pending || banners.length >= max} onUploaded={() => router.refresh()} />
      {banners.length >= max && (
        <p className="mt-2 text-xs text-muted-foreground">Llegaste al máximo de {max} banners: borrá alguno que ya no uses para subir otro.</p>
      )}

      <div className="mt-6">
        <h3 className="mb-2 text-sm font-semibold">
          Tus banners{" "}
          <span className="font-normal text-muted-foreground tabular-nums">
            ({visible} {visible === 1 ? "visible" : "visibles"} de {banners.length})
          </span>
        </h3>
        {banners.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Todavía no subiste banners. Mientras tanto, la portada muestra el encabezado de siempre (con el descuento web
            si está activo).
          </p>
        ) : (
          <ol aria-busy={pending} className="flex flex-col gap-3">
            {banners.map((banner, i) => (
              <BannerRow key={banner.id} banner={banner} position={i + 1} total={banners.length} busy={pending} run={run} />
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
