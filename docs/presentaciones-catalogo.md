# Presentaciones del catálogo y nombres móviles

La tarjeta muestra el nombre completo, el precio de la presentación unitaria disponible y el precio total de cada pack, junto con su equivalente por unidad. Los nombres y precios pueden ocupar más líneas en pantallas angostas.

`200GR X20 UNIDADES`, `210G CAJAX28`, `500G X 20` y `500GR X6` son presentaciones de varios envases. La medida y el sabor siguen formando parte de la identidad del artículo. Una foto aprobada se comparte entre todas sus presentaciones.

El precio se conserva tal como está en la lista: 9 de Oro agridulce 200 g cuesta $1.200 la unidad y $22.000 el pack x20. Veintiuna unidades cuestan $23.200 (un pack y una unidad).

Los tripacks y el contenido de envases minoristas, como saquitos de café, se conservan como productos completos. No se inventa venta unitaria cuando la lista sólo contiene un pack.

La única presentación FRÍA se vincula al grupo de packs equivalente cuando no existe otra unidad regular. Si existe una tercera presentación unitaria regular, se conserva el precio FRÍA separado. CORONA y CORONA CERVEZA se comparan con la misma medida; no se eliminan tamaños, sabores ni la condición FRÍA para esa comparación.

## Auditoría

`node scripts/audit-presentations.mjs --output informe.json` consulta la base sin modificarla y guarda propuestas y presentaciones minoristas conservadas. Para auditar una captura anterior, agregar `--snapshot captura.json` (formato con `allProducts`).

La migración `0011_presentaciones_sin_pack.mjs` aplica estas correcciones dentro de una transacción y mantiene precios, nombres originales, fotos candidatas e historial. No cambia cantidades corregidas a mano y conserva grupos manuales. Las fotos aprobadas se comparten con el artículo resultante.

Verificación: `node scripts/check-presentation-audit.mjs` prueba precios mixtos, grupos y tamaños manuales, contenido minorista, foto única, FRÍA con y sin tercera unidad e idempotencia.
