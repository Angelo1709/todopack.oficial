# Sincronización del stock y los precios de Gestión

El instalador, el script de Windows y las instrucciones de puesta en marcha están en [tools/stock-sync/README.md](../tools/stock-sync/README.md).

Flujo: `Gestion.mdb` → tarea de Windows cada 5 minutos → `POST /api/stock/sync` por HTTPS → PostgreSQL → catálogo y validación del carrito.

El panel **Stock** (`/admin/stock`, sólo administradores) compara cantidades de Gestión y de la web, muestra ID/código/nombre del origen, última lectura y recepción, y alerta cuando pasan 15 minutos sin recibir datos. Permite buscar y filtrar positivos, agotados, artículos sin producto web y cantidades diferentes. Los artículos nuevos se reciben aunque no exista aún un producto web; la sincronización no crea ni publica productos automáticamente. En **Productos** también se ve la cantidad y el ID de Gestión.

La cantidad actual conserva la unidad de medida de cada artículo del sistema antiguo. Cuando el programador termine el cambio a un SKU con stock en unidades, habrá que confirmar el nuevo esquema, los IDs y las escalas de precios antes de adaptar la conversión.

**Precios:** el script envía el precio final de cada artículo (`PrecioUnitario × (1 + IVA)`, con la tasa de la tabla `Iva`) y `applyStockSnapshot` lo guarda en `gestion_stock.price` y en `products.price` de lo vinculado, redondeado a pesos. Gestión manda: un precio editado en la web o importado por Excel se pisa en la siguiente sincronización. Sin precio en el origen (cero, o un sincronizador anterior que no lo envía) se conserva el de la web.

**Tienda:** sólo se publican artículos con foto (`articleHasPhoto` en `lib/catalog.ts`: alcanza con una presentación activa con imagen). Lo agotado no se oculta: se muestra en gris con "Sin stock", ordenado al final, y `createOrder` lo rechaza. Con `STOCK_SYNC_REQUIRED=true` el stock desconocido sigue oculto.

`STOCK_SYNC_REQUIRED=true` activa la disponibilidad obligatoria; debe habilitarse después del primer envío y de revisar los vínculos. No utiliza `active` para representar stock: las decisiones del administrador se conservan.

Las pruebas con la copia local y el catálogo inicial del repositorio verificaron 954 artículos recibidos, 673 productos vinculados automáticamente y 9 que requieren revisión. Esos conteos corresponden a la copia de prueba, no certifican el catálogo actual de producción. Los reportes y snapshots locales no se publican en Git.
