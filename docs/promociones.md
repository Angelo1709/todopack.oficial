# Promociones: descuento web, barra de anuncio y banners

Todo se maneja desde **Admin → Promociones** (`/admin/promociones`). Las ofertas de productos puntuales (20% OFF en uno, 2x1 en otro) siguen en Productos → Gestionar ofertas (`docs/ofertas.md`).

## Descuento en toda la tienda (descuento web)

Un porcentaje (1–50%) sobre **todos** los productos, sólo para los pedidos hechos en la web. Se prende y apaga con un interruptor; el porcentaje queda guardado aunque esté apagado.

- **No cambia los precios de la base** (ni los de lista ni los que manda Gestión): se aplica al mostrar y al cobrar. Al apagarlo todo vuelve a la normalidad.
- El cliente ve el precio de lista tachado y "-10% web" en cada tarjeta, el ahorro en el carrito y en el checkout ("10% OFF por comprar en la web −$ X") y, en la página del pedido, "Ahorraste $ X".
- **No se suma a la oferta de cada producto:** cada presentación paga el mayor descuento. Una oferta porcentual que no supera al descuento web queda tapada (no se anuncia). Un combo (2x1) va a precio de lista y lo suelto con el descuento web: el optimizador de precios elige lo más barato.
- Los **pedidos manuales** del panel no lo tienen (su precio arranca en el de lista).
- Cada pedido guarda `orders.web_discount_percent` y `orders.web_discount_amount` (pesos descontados frente al mismo carrito sin descuento web). El panel de pedidos muestra la etiqueta "-10% web" y Métricas suma lo descontado en el período.
- Si el admin cambia el descuento mientras alguien tiene el carrito armado, el carrito se actualiza solo (cada minuto o al volver a la pestaña) y `createOrder` rechaza un total viejo y pide confirmar otra vez.

Código: `lib/promo.ts` (configuración, puro), `effectivePrice`/`visibleOffer` en `lib/offers.ts`, `tierPrice`/`withoutWebDiscount` en `lib/pricing.ts`, `loadArticles` en `lib/catalog.ts` (pone `webDiscount` en cada presentación), `createOrder` en `app/actions/orders.ts`. Se guarda en `settings` (claves `webDiscountActive`, `webDiscountPercent`).

## Barra de anuncio

Una franja ámbar con un texto corto (hasta 120 caracteres) arriba de todas las páginas de la tienda (no en el panel). Si se deja vacío y el descuento está activo, dice "10% OFF en todos los pedidos hechos en la web". Componente `components/storefront/promo-bar.tsx`; claves `announcementActive`, `announcementText`.

Con el descuento activo y sin banners, la portada también muestra un bloque grande "10% OFF en todos tus pedidos · Exclusivo comprando en la web".

## Banners de la portada

Imágenes que sube el admin (p. ej. hechas en Canva) y se ven arriba de todo en la portada, en un carrusel que pasa solo cada 6 s (se detiene cuando la persona lo toca, y no se mueve con "reducir movimiento"). Mientras haya alguno visible ocupan el lugar del encabezado de bienvenida.

- Dos versiones por banner: **celular 1080 × 540 px** (2:1) y **computadora 1920 × 600 px** (16:5). Al menos una; si falta una se usa la otra. Se muestran completas (`object-contain`): una imagen con otra proporción no se recorta, se ve con bordes, y el panel avisa antes de subirla.
- JPG, PNG o WebP de hasta 8 MB cada una, máximo 12 banners. Se guardan en la base (`banners`, como las fotos de productos) y se sirven en `/api/banners/[id]/[celular|compu]` con caché inmutable; `next/image` las pasa a WebP al tamaño de cada pantalla. Para cambiar la imagen se sube otro banner.
- Texto alternativo ("¿Qué dice la imagen?") y link opcional: una página de la tienda (si se pega un link copiado de la tienda se guarda sólo la ruta, `/?q=fernet`) o un sitio externo (se abre en otra pestaña).
- Desde el panel se ordenan (subir/bajar), se pausan, se editan el texto y el link y se borran. Cada toque a un banner con link se mide en PostHog (`banner_clicked`).

Alta por `app/api/admin/banners` (route handler: las imágenes superan el límite de 1 MB de las server actions); el resto en `app/actions/promo.ts`. Migración `0016_promociones.sql`.

Verificación: `node scripts/check-offers.mjs` (precios con descuento web) y `node scripts/check-promo-actions.mjs` (acciones, subida y banners sobre una base en memoria), incluidos en `pnpm check`.
