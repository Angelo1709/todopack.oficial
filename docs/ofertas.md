# Ofertas manuales

En Admin → Productos → Gestionar ofertas se pueden buscar presentaciones activas, seleccionar varias y guardar una oferta porcentual (1–99%) o llevás/pagás (2x1, 3x2, 4x3 o cantidades propias hasta 20). Se permite editar, activar o pausar cada presentación. La nueva oferta reemplaza la anterior; no cambia el precio de lista. Los productos ocultos conservan su oferta para cuando se reactiven.

La promoción se aplica sobre la misma presentación: 2x1 en Pack x6 requiere 12 unidades. Las cantidades sobrantes conservan el precio normal. El optimizador elige la combinación más barata entre presentaciones y promociones, sin acumular dos ofertas sobre una misma presentación. El descuento porcentual se redondea a pesos por presentación.

El catálogo muestra la etiqueta, el título y las condiciones de la oferta, y el precio anterior tachado para porcentajes. El filtro Ofertas conserva búsqueda, categorías y paginación. El carrito muestra el ahorro real para la cantidad elegida. El servidor vuelve a calcular con los precios vigentes; si cambian frente al total mostrado, se actualiza el carrito y se pide confirmar otra vez. Las unidades gratis se guardan como líneas de precio cero, con el mismo producto y tamaño de presentación. Se mantiene el control de disponibilidad de Gestión vigente en main.

Migración: `0015_ofertas.sql`, aplicada por el arranque habitual. Las pruebas de interfaz de este cambio usaron una base aislada en localhost, sin publicar promociones reales.

Referencias consultadas: https://www.coto.com.ar/ y https://promos.carrefour.com.ar/. Se tomó el criterio de beneficio destacado, condiciones junto al precio y acceso directo a ofertas, adaptado a los colores y tipografía de TODO PACK.

Verificación: `pnpm check`, `pnpm typecheck` y `next build --webpack`. El build predeterminado con Turbopack encontró una restricción del entorno para crear un proceso/puerto; Webpack compiló correctamente. Se probaron creación, búsqueda, pausa y reactivación en navegador, y catálogo a 375 px.
