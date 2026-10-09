# Portal de fotos

Ruta: `/admin/fotos`. Usa las cuentas administradoras existentes de TODO PACK.

Las fotos se cargan como candidatas privadas. **Confirmada** publica la imagen en
`products.image_url` de todas las presentaciones del mismo artículo y actualiza el catálogo. **Errada**
la conserva para revisión y retira esa imagen si sigue publicada. **Volver a
pendiente** también retira la imagen cuando corresponde. Cambiar el producto de
una foto requiere que no esté confirmada.

Al reemplazar una foto por otra, una revisión de la foto anterior no retira la
imagen nueva. Se valida la versión de cada candidata para evitar que dos pestañas
sobrescriban decisiones sin recargar. El historial está en `product_photo_reviews`.

## Cargas futuras

- **Elegir fotos** permite cargar varios archivos. **Elegir carpeta** carga las
  imágenes de una carpeta y sus subcarpetas.
- JPG, PNG y WebP; hasta 8 MB por foto. Se verifica el formato por la cabecera del
  archivo, no por la extensión o el MIME declarado por el navegador.
- Se puede elegir un producto para todo el lote. Sin esa elección, sólo un nombre
  de archivo que coincida exactamente con el nombre del producto (normalizado)
  lo vincula automáticamente. Las otras imágenes aparecen en **Sin vincular**.
- Todas las cargas nuevas quedan pendientes. Vincular nunca confirma ni publica.
- Unidad y packs del mismo `groupKey` comparten una única foto pública. El portal
  muestra una tarjeta por artículo y permite elegir entre las fotos alternativas.
- Los reintentos de la misma imagen para cualquier presentación del artículo no
  duplican archivos ni cambian decisiones existentes. Los duplicados anteriores
  se conservan en el historial, pero se revisan una sola vez por imagen/artículo.
- **Productos por buscar** y la descarga de pendientes muestran productos sin
  imagen publicada, para trabajar con otra fuente.

## Persistencia y acceso

Las imágenes se guardan en PostgreSQL (`bytea`) junto con las candidatas; no dependen
del disco efímero de Railway. Esta implementación aprovecha el servicio existente
y no requiere un token de otro proveedor. La carga inicial ocupa aproximadamente
69 MB de archivos, más los metadatos y el historial; la base debe incluirse en los
backups habituales. Para grandes volúmenes futuros se puede migrar el contenido a
almacenamiento de objetos sin cambiar el flujo de confirmación.

`/api/admin/fotos` y las vistas previas requieren rol administrador. La ruta pública
`/api/fotos-productos/:id` sólo devuelve imágenes confirmadas que siguen vinculadas
en `products.image_url`. Se usa `no-store` para que retirar una foto no deje una
respuesta pública cacheada por el portal. Las mutaciones requieren origen del sitio.

## Cargar la carpeta del dueño (fuente de verdad)

El dueño junta fotos en una carpeta cuyo nombre de archivo es el del producto
("COCA COLA RETORNABLE VIDRIO 1.25L.jpg"). Esa carpeta manda sobre cualquier otra foto:

```sh
PHOTO_FOLDER=~/Desktop/"PAGINA TDP" DATABASE_URL=... node scripts/import-photo-folder.mjs           # sólo muestra qué haría
PHOTO_FOLDER=~/Desktop/"PAGINA TDP" DATABASE_URL=... APLICAR=1 node scripts/import-photo-folder.mjs # carga
```

`lib/photo-folder-match.ts` compara el nombre del archivo con los de los productos activos palabra
por palabra: tolera abreviaturas (CAB / CABERNET, C/ / CON, 3/4 / 750 ML), errores de una letra,
palabras de relleno (UNIDAD, VINO, FRÍA, CAJA…) y la cantidad del pack; no tolera otra variedad,
otro tamaño ni retornable contra descartable o lata contra botella.

- **Exacta:** se confirma y se publica en todo el artículo, aunque tuviera otra foto. Si coincide con
  más de un artículo (la versión FRÍA, o el mismo artículo cargado dos veces) va a todos.
- **Dudosa** (hasta 3 palabras distintas): queda pendiente en el portal, vinculada al más parecido.
- **Sin producto:** queda pendiente sin vincular.

Reejecutarlo no duplica fotos ni decisiones. El informe queda en `importacion-carpeta.json` dentro
de la carpeta (o en `PHOTO_IMPORT_REPORT`). Verificación: `node scripts/check-photo-folder.mjs`.

## Importar la revisión de Carrefour

```sh
PHOTO_REVIEW_DIR=/ruta/fotos-carrefour DATABASE_URL=... node scripts/import-photo-review.mjs
```

El importador cruza por nombre exacto, `groupKey` normalizado y `packSize`, nunca por el índice
del JSON como ID de base. Conserva confirmaciones y rechazos humanos cuando la firma
de la foto coincide con la revisión local. Las coincidencias automáticas quedan
pendientes. Reejecutarlo no pisa revisiones hechas después en la nube. Guarda el
informe en `importacion-nube.json` dentro de la carpeta fuente.

La migración `0010_fotos_por_articulo.mjs` unifica el orden del volumen en los grupos
(por ejemplo, Baggio multifruta 1 L) y comparte las fotos ya aprobadas entre las
presentaciones. Preserva tamaños, precios, sabores y variantes como FRÍA. Ante dos
fotos aprobadas, prioriza una elección humana y luego la más reciente. La unidad
7Up de 1,5 L rotulada FRÍA se unifica con el pack x6 por indicación expresa del
usuario (07/10/2026); sus precios siguen siendo $2.700 y $15.000. No borra
archivos ni decisiones. Ambas migraciones se aplican al iniciar con `pnpm start`.
Verificación: `node scripts/check-photo-review.mjs`, `pnpm typecheck` y `pnpm build`.
