"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { getImageProps } from "next/image"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { EVENTS, track } from "@/lib/analytics"
import { cn } from "@/lib/utils"

/** Un banner de la portada (Admin → Promociones), listo para mostrar. Ver lib/banners.ts. */
export type StoreBanner = {
  id: string
  title: string
  /** null = no lleva a ningún lado. */
  href: string | null
  external: boolean
  /** Si el admin subió una sola versión, las dos URLs son la misma imagen. */
  mobileUrl: string
  desktopUrl: string
}

const AUTOPLAY_MS = 6000

// Celular: a todo el ancho. Desde sm: dentro del contenedor de 7xl con 16px de margen a cada lado.
const MOBILE_SIZES = "100vw"
const DESKTOP_SIZES = "(min-width: 1280px) 1248px, calc(100vw - 2rem)"

/** Imagen para celular (2:1) y otra para computadora (16:5) con <picture>: el navegador baja sólo una. */
function BannerPicture({ banner, first }: { banner: StoreBanner; first: boolean }) {
  const common = { alt: banner.title, fill: true }
  const {
    props: { srcSet: desktop },
  } = getImageProps({ ...common, src: banner.desktopUrl, sizes: DESKTOP_SIZES })
  const {
    props: { srcSet: mobile, ...rest },
  } = getImageProps({
    ...common,
    src: banner.mobileUrl,
    sizes: MOBILE_SIZES,
    // Con dos fuentes no se puede usar preload: el primero se pide con prioridad, los demás al acercarse.
    loading: first ? "eager" : "lazy",
    fetchPriority: first ? "high" : "auto",
  })
  return (
    <picture>
      <source media="(min-width: 640px)" srcSet={desktop} sizes={DESKTOP_SIZES} />
      {/* object-contain: si la imagen no tiene la proporción recomendada no se recorta su texto. */}
      <img {...rest} srcSet={mobile} alt={banner.title} className="object-contain" />
    </picture>
  )
}

export function BannerCarousel({ banners }: { banners: StoreBanner[] }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const indexRef = useRef(0)
  // Pasa solo hasta que la persona lo toca, lo desliza o llega con el teclado.
  const [autoplay, setAutoplay] = useState(true)
  const [hovered, setHovered] = useState(false)
  const count = banners.length

  const go = useCallback(
    (target: number, byUser = true) => {
      const el = trackRef.current
      if (!el || count < 2) return
      const next = (target + count) % count
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      el.scrollTo({ left: next * el.clientWidth, behavior: reduce ? "auto" : "smooth" })
      if (byUser) setAutoplay(false)
    },
    [count],
  )

  useEffect(() => {
    if (!autoplay || hovered || count < 2) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") go(indexRef.current + 1, false)
    }, AUTOPLAY_MS)
    return () => clearInterval(timer)
  }, [autoplay, hovered, count, go])

  function onScroll() {
    const el = trackRef.current
    if (!el || !el.clientWidth) return
    const current = Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)))
    indexRef.current = current
    setIndex(current)
  }

  if (!count) return null

  return (
    <section
      aria-roledescription="carrusel"
      aria-label="Novedades y promociones"
      className="relative overflow-hidden sm:rounded-2xl sm:shadow-raised"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setAutoplay(false)}
    >
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={() => setAutoplay(false)}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scrollbar-none"
      >
        {banners.map((banner, i) => {
          const picture = <BannerPicture banner={banner} first={i === 0} />
          const onClick = () => track(EVENTS.bannerClicked, { banner_id: banner.id, position: i + 1 })
          return (
            <div
              key={banner.id}
              role="group"
              aria-roledescription="banner"
              aria-label={count > 1 ? `${i + 1} de ${count}` : undefined}
              className="relative aspect-[2/1] w-full shrink-0 snap-center bg-sidebar sm:aspect-[16/5]"
            >
              {banner.href && banner.external ? (
                <a href={banner.href} target="_blank" rel="noopener noreferrer" onClick={onClick} className="absolute inset-0">
                  {picture}
                </a>
              ) : banner.href ? (
                <Link href={banner.href} onClick={onClick} className="absolute inset-0">
                  {picture}
                </Link>
              ) : (
                picture
              )}
            </div>
          )
        })}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Banner anterior"
            className="absolute left-3 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-foreground shadow-raised backdrop-blur transition hover:bg-white sm:grid"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Banner siguiente"
            className="absolute right-3 top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-foreground shadow-raised backdrop-blur transition hover:bg-white sm:grid"
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
          <div className="absolute inset-x-0 bottom-1 flex justify-center">
            {banners.map((banner, i) => (
              <button
                key={banner.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Ver banner ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className="grid size-6 place-items-center"
              >
                <span
                  className={cn(
                    "h-2 rounded-full bg-white shadow ring-1 ring-black/20 transition-all",
                    i === index ? "w-5" : "w-2 opacity-60",
                  )}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
