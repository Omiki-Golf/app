# Catálogo de campos para revisión

`recorridos-golf-comunidad-valenciana.json` conserva los datos aportados por el usuario en el archivo homónimo y en `consultar-recorridos-golf.html`, con fecha de consulta 28/09/2026. Se comprobó que ambos archivos contienen el mismo objeto JSON antes de incorporarlo.

- 35 campos del directorio, 34 con tarjetas; Cancha de Golf Gandía figura sin tarjeta extraíble.
- 380 tarjetas y 6.840 registros de hoyos. Se conservan recorridos, barras, categorías, valor de campo, slope, distancias, fuentes y notas originales.
- La Marquesa incluye el hoyo 9 con par 6 en ocho tarjetas. Se conserva ese valor, al igual que las tarjetas de 18 hoyos que repiten un recorrido físico de nueve.

Se consulta en Administración → Campos de golf → Catálogo para revisar. El componente y los datos se cargan al abrir esa vista. La pestaña permite descargar el JSON completo.

Este catálogo de consulta no inserta ni modifica `golf_courses`, `golf_holes` o `tees`. Los campos que utilizan las partidas siguen disponibles en «Campos en la aplicación». La solicitud es incorporar los adjuntos para revisarlos; no se han seleccionado ni reducido sus variantes al modelo de partidas.

Las pruebas `tests/admin-course-catalog.test.mjs` comprueban la huella del contenido original, el número de registros, las sumas de par y metros y los enlaces de origen. Para una futura actualización del catálogo, contrastar la nueva fuente y actualizar la huella y los recuentos de forma explícita.
