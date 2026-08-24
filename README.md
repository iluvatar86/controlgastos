# Control de Gastos

Control de gastos por presupuestos, pensado para el móvil. Cuánto había,
cuánto llevas gastado y cuánto te queda.

- **Presupuestos que se repiten** (la quincena del salario) y **de una vez**
  (un viaje). Cada uno con su moneda: colones o dólares. Si tus quincenas no
  van del 1 al 15, eliges tú los días en que empieza cada periodo.
- **Un gasto puede contar en varios presupuestos**: entero en cada uno, o
  repartido entre ellos. En los totales generales sigue contando una vez.
- **Cada gasto lleva su categoría**: supermercado, restaurante, farmacia… y
  las que quieras añadir.
- **Topes por categoría**: «en esta quincena, ₡15.000 en restaurantes». Verde
  mientras haya margen, ámbar cuando queda poco y rojo al llegar o pasarte —y
  te avisa mientras apuntas el gasto, no después.
- **Compartir cómo va un presupuesto** por WhatsApp, correo o lo que tengas,
  con un resumen en texto. No se comparte la lista de gastos.
- **Historial**: los presupuestos de una vez se apartan solos cuando pasa su
  fecha de fin, y puedes desactivar los que ya no uses. Salen del Resumen pero
  quedan enteros, se pueden consultar y se pueden volver a activar.
- **Colones y dólares a la vez.** Si apuntas una compra en dólares dentro de
  un presupuesto en colones, se guarda el tipo de cambio de ese día con el
  gasto, así que el histórico no se mueve nunca.
- **Lee los correos de compra del banco.** Con permiso de solo lectura sobre
  Gmail, busca los avisos de BAC Credomatic, Davivienda y Promerica y te
  propone el gasto ya rellenado —comercio, importe, fecha y una categoría
  adivinada— en una bandeja. **Nada se apunta sin que lo confirmes.**
- **Funciona sin conexión** y se instala en el móvil como una app.

No usa ninguna librería y no hay que compilar nada: son archivos HTML, CSS y
JavaScript que se abren tal cual.

## Los datos son tuyos y están en tu teléfono

Todo se guarda en el propio navegador. No hay servidor, no hay cuenta y no se
sube nada a ningún sitio. La otra cara de eso: **si cambias de teléfono o
borras la app, los datos se van con ella.** En Ajustes hay «Descargar copia»;
merece la pena hacerlo de vez en cuando.

## Probarla en el ordenador

Un navegador no deja que una página instalable funcione abriéndola con doble
clic: necesita que alguien se la sirva. En la carpeta de arriba está
`servidor-local.ps1`, que hace exactamente eso y nada más.

Clic derecho sobre el archivo → «Ejecutar con PowerShell», y luego abrir
`http://localhost:8081/` en el navegador.
