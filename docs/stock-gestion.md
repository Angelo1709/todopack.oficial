# Sincronización del stock de Gestión

El instalador, el script de Windows y las instrucciones de puesta en marcha están en [tools/stock-sync/README.md](../tools/stock-sync/README.md).

Flujo: `Gestion.mdb` → tarea de Windows cada 5 minutos → `POST /api/stock/sync` por HTTPS → PostgreSQL → catálogo y validación del carrito.

`STOCK_SYNC_REQUIRED=true` activa la disponibilidad obligatoria; debe habilitarse después del primer envío y de revisar los vínculos. No utiliza `active` para representar stock: las decisiones del administrador se conservan.

Las pruebas con la copia local y el catálogo inicial del repositorio verificaron 954 artículos recibidos, 673 productos vinculados automáticamente y 9 que requieren revisión. Esos conteos corresponden a la copia de prueba, no certifican el catálogo actual de producción. Los reportes y snapshots locales no se publican en Git.
