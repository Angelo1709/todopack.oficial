# Vincular unitario y pack

En **Admin → Productos**, usar **Vincular pack** (o la búsqueda de vínculo dentro de **Editar**).

1. Buscar el otro producto por nombre y seleccionarlo.
2. Elegir cuál de los dos es el pack.
3. Indicar cuántas unidades contiene ese pack (2 a 1.000).
4. Revisar los dos precios y guardar.

Se conserva cada ID y su precio. El unitario representa 1 unidad y el pack la cantidad declarada. Ambos comparten el grupo del unitario, una tarjeta y una foto. Se prefiere la foto del unitario; si no hay, la del pack. Las fotos pendientes y erradas no se publican. El portal de fotos muestra el artículo una sola vez y conserva todas las candidatas y sus decisiones.

Ejemplo: unidad $1.200 y pack x20 $22.000. Para 21 unidades se cobran $23.200 (un pack y una unidad). La tienda, el carrito y el servidor calculan la combinación más barata de presentaciones para la cantidad pedida.

Si ya hay otro unitario o un pack del mismo tamaño en el grupo, el vínculo se rechaza con el nombre del producto en conflicto, para no ocultar un precio. Sólo se ofrecen productos activos. No se trasladan automáticamente otras presentaciones del grupo anterior del pack: el vínculo afecta al producto elegido.

Para deshacerlo, abrir **Editar → Separar este producto de la tarjeta**. Conserva el precio, la cantidad del pack y su foto, pero pasa a una tarjeta propia. Se puede volver a vincular. Los pedidos anteriores conservan sus presentaciones y precios guardados.

## Integración futura del sistema de gestión

Esta configuración establece equivalencias de venta (`group_key`, `pack_size`) y mantiene los IDs originales. Para un ERP que lleve un único stock en unidades, el artículo será el grupo y sus presentaciones serán tramos de precio: cada venta consume la cantidad total de unidades. La reserva y conciliación del stock requieren adaptar el puente al modelo que entregue el programador; vincular precios en la web no modifica el stock del ERP.

Validación: `npm run check` incluye acciones reales y consultas del catálogo sobre Postgres en memoria, con permisos aislados sólo para la prueba. Verifica fotos internas, vínculo desde ambos lados, x6/x20, cálculo mixto, conflictos con reversión completa, separación y revinculación.
