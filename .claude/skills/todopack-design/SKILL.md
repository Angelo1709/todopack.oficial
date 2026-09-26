---
name: todopack-design
description: Sistema de diseño de la tienda TODO PACK (TodoPack Alcorta). Usar SIEMPRE antes de crear o modificar cualquier pantalla, componente o estilo de la app (catálogo, carrito, checkout, mis pedidos, panel admin, emails o páginas nuevas) para que respete el diseño actual: paleta cálida ámbar/carbón de la tapita del logo, Playfair + Inter, tarjetas redondeadas, shadcn/ui base-nova y textos en español rioplatense.
---

# Diseño TODO PACK

La identidad sale del logo (`public/logo-todopack.jpg`): una **tapita de botella** carbón con borde ámbar/crema y un toque azul acero, tipografía serif clásica y la bajada "VENTAS POR MAYOR Y MENOR". El resultado es un almacén/distribuidora cálido y confiable, no una tienda genérica. Todo lo nuevo tiene que verse como si siempre hubiera estado ahí.

## 1. Tokens (no inventar colores)

Definidos en `app/globals.css` (Tailwind v4, `@theme inline`). Usá **siempre** las clases semánticas; nunca hex, `amber-500`, `stone-800`, etc.

| Rol | Clase | Valor (light) | Uso |
|---|---|---|---|
| Fondo página | `bg-background` | crema muy claro `oklch(0.98 0.006 85)` | fondo general |
| Texto | `text-foreground` | carbón cálido | texto principal |
| Superficie | `bg-card` + `border-border` | blanco | tarjetas, paneles, formularios |
| Primario | `bg-primary` / `text-primary` | **ámbar** `oklch(0.72 0.13 65)` | CTA, chip activo, badges de conteo, acentos del título |
| Texto sobre primario | `text-primary-foreground` | carbón (¡no blanco!) | botones primarios |
| Suave | `bg-muted` / `text-muted-foreground` | beige / gris cálido | textos secundarios, fondos de info |
| Acento | `bg-accent` / `text-accent` | azul acero `oklch(0.52 0.055 240)` | uso puntual (links informativos, gráficos) |
| Banda oscura | `bg-sidebar text-sidebar-foreground` | carbón `oklch(0.28 0.012 60)` | header y hero |
| Error | `text-destructive` / `variant="destructive"` | rojo | errores, cancelar |

- Tintes del primario: `bg-primary/5` (opción seleccionada), `bg-primary/15` (círculo de ícono de éxito), `ring-primary/40` (anillo del logo).
- Sobre la banda oscura el texto secundario es `text-sidebar-foreground/60` o `/70`.
- Radio base `--radius: 0.625rem`. Tarjetas y paneles `rounded-xl`, auth/modales destacados `rounded-2xl`, inputs/opciones `rounded-lg`, chips y badges `rounded-full`.
- Existe tema `.dark` pero la app se usa en claro; no agregues toggles de tema.

## 2. Tipografía

- **Playfair Display** (`font-serif`) solo para títulos: marca, `h1`, `h2` de secciones. Siempre `font-bold`.
  - Página: `font-serif text-2xl font-bold` · Hero: `font-serif text-3xl font-bold sm:text-4xl` · Sección: `font-serif text-lg|xl font-bold`.
- **Inter** (`font-sans`, default) para todo lo demás.
  - Títulos de panel dentro de una tarjeta: `font-semibold` (sans, no serif).
  - Secundario: `text-sm text-muted-foreground`; micro: `text-xs`; etiquetas de marca: `text-[10px] uppercase tracking-widest`.
- Precios y números: siempre `tabular-nums`, precio destacado `font-bold`. Formatear con `formatPrice()` de `lib/format.ts` (ARS sin centavos). Número de pedido con `formatOrderNumber()` → `#00201`.
- Palabra destacada en títulos de marca: `<span className="text-primary">TodoPack Alcorta</span>`.

## 3. Layout

- Contenedor: `mx-auto max-w-7xl px-4` (catálogo), `max-w-6xl` (admin), `max-w-5xl` (checkout), `max-w-4xl` (listas de pedidos), `max-w-md` (auth). Padding vertical de página `py-6`.
- Header `SiteHeader` sticky `h-16`, banda oscura, logo redondo 40px con `ring-1 ring-primary/40`, nombre en serif + bajada en mayúsculas espaciadas (oculta en mobile).
- Hero: banda `border-b border-border bg-sidebar text-sidebar-foreground`, `py-8`, título serif con acento ámbar y bajada `text-sm text-sidebar-foreground/70 max-w-2xl`.
- Barras pegajosas bajo el header: `sticky top-16 z-30 bg-background/90 backdrop-blur`.
- Grillas de productos: `grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`.
- Formularios de dos columnas + resumen: `grid gap-6 lg:grid-cols-[1fr_360px]`, resumen `lg:sticky lg:top-20 lg:self-start`.
- Mobile first: todo tiene que funcionar a 375px; los grupos de botones usan `flex flex-wrap gap-2`.

## 4. Recetas de componentes

Componentes base en `components/ui/` (shadcn estilo **base-nova** sobre `@base-ui/react`). No los edites; componé. Para que un `Button` sea link: `<Button render={<Link href="/x" />} nativeButton={false}>` (no existe `asChild`). Íconos: `lucide-react`, tamaño `size-4` (en botones `size-3.5`/`size-4`, decorativos grandes `size-10 opacity-30/40`).

**Tarjeta / panel**
```tsx
<section className="rounded-xl border border-border bg-card p-5">
  <h2 className="mb-4 font-semibold">Datos de entrega</h2>
  ...
</section>
```

**Tarjeta de producto**: `group overflow-hidden rounded-xl border bg-card hover:shadow-md`; imagen `aspect-square bg-muted` con `group-hover:scale-105`; categoría como pastilla `absolute left-2 top-2 rounded-full bg-background/85 px-2 py-0.5 text-[10px] backdrop-blur`; nombre `line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-tight`; fila inferior precio `font-bold tabular-nums` + botón `size="sm"` "Sumar" con `Plus` que pasa a `Check` 1s al agregar. Sin imagen → `categoryImage(category)` de `lib/categories.ts`.

**Chips de filtro** (scroll horizontal `flex gap-2 overflow-x-auto pb-1`):
```tsx
className={cn(
  "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors",
  active ? "border-primary bg-primary text-primary-foreground"
         : "border-border bg-card text-muted-foreground hover:text-foreground",
)}
```

**Opción seleccionable** (medio de pago, franja, presentación): botón `flex items-center gap-3 rounded-lg border p-3 text-left transition-colors`, activo `border-primary bg-primary/5`, ícono `size-5 text-primary`, título `text-sm font-medium` + ayuda `text-xs text-muted-foreground`.

**Bloque informativo** (datos bancarios, avisos): `rounded-lg bg-muted p-4 text-sm`; pares clave/valor con `dl grid grid-cols-[auto_1fr] gap-x-3 gap-y-1`, valores copiables en `font-mono text-foreground`.

**Estado vacío**: `flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground` + ícono grande tenue + frase corta + CTA opcional.

**Éxito / confirmación**: centrado `max-w-lg py-16`, círculo `size-14 rounded-full bg-primary/15 text-primary` con `Check`, título serif, texto `text-muted-foreground` con el dato clave en `font-semibold text-foreground`.

**Stat tiles (admin)**: `grid grid-cols-2 gap-3 lg:grid-cols-4`; cada una `rounded-xl border bg-card p-4`, ícono+label `text-xs text-muted-foreground`, valor `mt-2 text-xl font-bold tabular-nums`.

**Fila de pedido (admin)**: tarjeta `rounded-xl border bg-card p-5`; número de orden en círculo `size-8 rounded-full bg-primary text-primary-foreground font-bold`; links de dirección (Google Maps) y teléfono `text-sm text-muted-foreground hover:text-foreground` con íconos `MapPin`/`Phone` `size-3.5`; ítems en `border-y py-2 text-sm` con cantidad `font-medium text-foreground`; acciones a la derecha `ml-auto flex flex-wrap gap-2` con `size="sm"`.

**Badges de estado**: `<Badge variant={statusVariant(status)}>{ORDER_STATUS_LABEL[status]}</Badge>` desde `lib/order-status.ts` (no hardcodear textos ni colores de estado). Medio de pago con ícono `Banknote` (efectivo) / `Landmark` (transferencia).

**Formularios**: campo = `flex flex-col gap-1.5` con `<Label>` + `<Input>`; grilla `grid gap-4 sm:grid-cols-2`, campos largos `sm:col-span-2`. Botón de envío `size="lg"`, `w-full` en columnas angostas; texto de carga en gerundio ("Enviando...", "Importando...").

**Feedback**: `toast` de `sonner` (`toast.success/error/info/warning`), ya montado arriba al centro con `richColors`. Mensajes de error concretos y en español.

**Carrito**: `Sheet` lateral `sm:max-w-md`; ítems `rounded-lg border p-2`; stepper `rounded-md border` con botones `size-7` `Minus`/`Plus`; total `text-base font-bold` en el footer.

## 5. Voz y textos

- Español de Argentina con **voseo**: "Sumá", "Elegí", "Finalizá tu pedido", "¿No tenés cuenta? Registrate".
- Cercano y directo, oraciones cortas, sin tecnicismos. Botones con verbo: "Confirmar pedido", "Validar pago", "Seguir comprando".
- Moneda con `formatPrice`, fechas con `toLocaleDateString("es-AR", ...)`.
- Presentaciones: "Unidad", "Pack x6", "Caja x12"; mostrar precio por unidad como `≈ $1.250 c/u` en `text-xs text-muted-foreground`.

## 6. No hacer

- Colores fuera de los tokens, gradientes llamativos, sombras fuertes (máximo `shadow-sm`, `hover:shadow-md`).
- Serif en textos de cuerpo, botones o tablas.
- Texto blanco sobre ámbar (el primario lleva `text-primary-foreground`, carbón).
- Nuevas librerías de UI o de íconos; editar `components/ui/`.
- Esquinas cuadradas o mezclar radios arbitrarios (`rounded-[7px]`).
- Textos en inglés visibles para el usuario.

## Checklist antes de terminar una pantalla

1. ¿Sólo clases semánticas de color? 2. ¿Títulos en `font-serif font-bold`, resto Inter? 3. ¿Tarjetas `rounded-xl border bg-card`? 4. ¿Precios con `formatPrice` + `tabular-nums`? 5. ¿Estado vacío y de carga resueltos? 6. ¿Se ve bien a 375px? 7. ¿Textos con voseo y sin inglés?
