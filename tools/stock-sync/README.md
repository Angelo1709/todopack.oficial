# Stock de Gestión → Todo Pack

Este paquete lee `Gestion.mdb` cada **5 minutos** y envía el inventario por HTTPS a la web. Usa Windows PowerShell 5.1 y Jet 4.0 de 32 bits, incluidos en la PC de prueba. No requiere Python, Node, Microsoft Access ni un driver PostgreSQL en la PC del negocio.

La base se abre con `Mode=Read`. Sólo se leen `Articulos.IdArticulo`, `CodigoArticulo`, `Nombre` y `ExistenciaActual`. No se envían clientes, ventas, proveedores, precios ni el archivo MDB. No se convierte ni modifica la base.

## 1. Preparar la web

Aplicar la rama/PR que incorpora la API y la migración `0013_stock_gestion.sql`. Railway aplica las migraciones al arrancar con `pnpm start`.

Configurar en las variables del servicio **de la web**:

```text
STOCK_SYNC_TOKEN=<clave aleatoria exclusiva, mínimo 32 caracteres>
STOCK_SYNC_SOURCE_ID=gestion-principal
STOCK_SYNC_REQUIRED=false
```

Generar una clave en la PC de desarrollo con:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Guardar esa misma clave para ingresarla en el instalador. No subirla al repositorio ni usar una variable `NEXT_PUBLIC_*`. La PC del propietario recibe esta clave limitada al inventario; la contraseña PostgreSQL queda únicamente en Railway.

## 2. Instalar en la PC del propietario

1. Copiar/descomprimir este paquete en esa PC.
2. Iniciar sesión con el usuario de Windows que utiliza Gestión.
3. Ejecutar `Instalar.cmd`. Ingresar la ruta **de la base activa** (por ejemplo `C:\Gestion\Gestion.mdb`), la URL pública de la web (`https://todopackoficial-production.up.railway.app`) y la clave anterior.
4. El instalador prueba la lectura y registra la tarea `TodoPack-StockSync`; luego inicia el primer envío.
5. Revisar `logs\sync.log` dentro de `%LOCALAPPDATA%\TodoPack\StockSync` y comprobar que aparezca `OK`.

Para otra frecuencia:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-StockSync.ps1 -IntervalMinutes 10
```

El intervalo inicial es 5 minutos. La tarea se ejecuta también al iniciar sesión, se recupera de ejecuciones omitidas y evita ejecuciones superpuestas. **Funciona mientras la PC esté encendida y ese usuario tenga sesión iniciada** (puede bloquear la pantalla). Si está apagada o sin Internet, reenvía un inventario nuevo en la siguiente ejecución disponible. No escribe ceros por un error de lectura o conexión.

La clave queda cifrada con DPAPI para ese usuario de Windows. En la PC del propietario hay que **volver a ejecutar el instalador e ingresar la clave**: no copiar `secret.txt` desde la PC de prueba. Reinstalar con el mismo usuario permite cambiar la URL, la clave o el intervalo.

## 3. Revisar los vínculos y activar el stock

Los primeros vínculos usan el nombre completo de la presentación (sólo normalizan espacios y mayúsculas). Después conservan el `IdArticulo`, incluso si cambia el nombre. No vinculan por parecido, categoría, pack o `group_key`. Los nombres repetidos o diferentes quedan sin vínculo.

Para obtener el reporte o vincular explícitamente nombres distintos, desde el repositorio en la PC de desarrollo con acceso a PostgreSQL:

```powershell
node --env-file-if-exists=.env.local scripts/stock-links.mjs report
node --env-file-if-exists=.env.local scripts/stock-links.mjs link ID_PRODUCTO_WEB ID_ARTICULO_GESTION
node --env-file-if-exists=.env.local scripts/stock-links.mjs unlink ID_PRODUCTO_WEB
```

Verificar que cada presentación esté vinculada con su equivalente real, especialmente unidad/pack. Los IDs de la web de producción pueden diferir de los del archivo de catálogo del repositorio.

Una vez revisado el reporte, cambiar **`STOCK_SYNC_REQUIRED=true` en Railway**. Desde ese momento:

- Se muestran únicamente presentaciones activas con stock positivo confirmado.
- Stock cero, negativo, artículos eliminados del inventario y productos sin vínculo se ocultan.
- Las categorías y la paginación usan el mismo filtro.
- Un carrito previo vuelve a consultar la disponibilidad al confirmar.
- Si reponen stock, el producto vuelve a aparecer en la próxima sincronización.

Con `false` se permite revisar los productos sin vínculo antes de activar el control obligatorio; los ceros y negativos conocidos igualmente se ocultan. La sincronización conserva precios, fotos, categorías, agrupaciones y la desactivación manual.

## 4. Diagnóstico y mantenimiento

- `Probar-Stock.cmd`: prueba local sin enviar nada.
- `Sincronizar-Ahora.cmd`: envío inmediato.
- `logs\sync.log`: ejecuciones, fallos y cantidad de vínculos; rota a `sync.log.1` al superar 2 MB.
- `last-success.json`: último envío confirmado.
- `GET /api/stock/sync` con `Authorization: Bearer <clave>`: último inventario, conteos y productos sin vínculo. Es privado y no se cachea.
- Programador de tareas → `TodoPack-StockSync`: resultado `0` = éxito; `1` = fallo.
- `Uninstall-StockSync.ps1`: elimina la tarea y conserva archivos y logs.

En `config.json`, `stockColumn` permite elegir `ExistenciaActual1` … `ExistenciaActual10` si se desea un depósito específico. En la copia de prueba, `ExistenciaActual` y `ExistenciaActual1` coinciden en todos los artículos. Confirmar la columna con el dueño si cambia la configuración de depósitos.

La API recibe un snapshot completo en una transacción; rechaza inventarios vacíos, cantidades desconocidas, IDs repetidos, origen incorrecto y capturas anteriores a la última. Los reintentos del mismo envío son idempotentes. Si el reloj está adelantado más de cinco minutos, corregir la hora de Windows.

La web conserva el último stock confirmado cuando no hay comunicación. Esta integración controla **disponibilidad positiva**, no reserva unidades ni descuenta pedidos web en el MDB. Puede haber cambios entre sincronizaciones, y varias compras simultáneas no constituyen una reserva de inventario.

## Verificación en desarrollo

```powershell
pnpm check:stock
pnpm typecheck
pnpm check
pnpm build
```

Una prueba con la base local puede generar un JSON fuera del control de versiones:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/stock-sync/Sync-Stock.ps1 -DryRun -ExportPath tools/stock-sync/test.snapshot.json
node scripts/check-stock-sync.mjs tools/stock-sync/test.snapshot.json reporte-local.json
```

No distribuir el MDB, snapshots, reportes, `config.json`, `secret.txt` ni logs junto con el paquete público. `allowLoopbackHttp=true` sirve sólo para pruebas en `localhost`; la instalación normal exige HTTPS y no sigue redirecciones.

Referencia del modo de lectura: [Microsoft OLE DB Provider for Microsoft Jet](https://learn.microsoft.com/en-us/office/client-developer/access/desktop-database-reference/microsoft-ole-db-provider-for-microsoft-jet).
