# Portal de fotos

Ruta: `/admin/fotos`. Usa las cuentas administradoras existentes de TODO PACK.

Las fotos se cargan como candidatas privadas. **Confirmada** publica la imagen en
`products.image_url` de la presentación elegida y actualiza el catálogo. **Errada**
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
- Los reintentos de la misma imagen y producto no duplican archivos ni cambian
  decisiones existentes. No se asignan imágenes a todo un `groupKey`.
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

## Importar la revisión de Carrefour

```sh
PHOTO_REVIEW_DIR=/ruta/fotos-carrefour DATABASE_URL=... node scripts/import-photo-review.mjs
```

El importador cruza por nombre exacto, `groupKey` y `packSize`, nunca por el índice
del JSON como ID de base. Conserva confirmaciones y rechazos humanos cuando la firma
de la foto coincide con la revisión local. Las coincidencias automáticas quedan
pendientes. Reejecutarlo no pisa revisiones hechas después en la nube. Guarda el
informe en `importacion-nube.json` dentro de la carpeta fuente.

La migración `0009_portal_fotos.sql` se aplica al iniciar el servicio con `pnpm start`.
Verificación: `node scripts/check-photo-review.mjs`, `pnpm typecheck` y `pnpm build`.
