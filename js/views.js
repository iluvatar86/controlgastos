/* ---------------------------------------------------------------------------
   views.js — Las pantallas.

   Regla de la casa: nada se guarda sin que se pulse Guardar, y todo lo que se
   borra pide confirmación diciendo qué se va a llevar por delante.
--------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const el = D.el;

  const EMOJIS_PRESUPUESTO = ['💰', '🏠', '✈️', '🏖️', '🎓', '🚗', '🎁', '🛠️', '🍼', '💍', '🏥', '📱'];
  const EMOJIS_CATEGORIA = ['🛒', '🍽️', '💊', '⛽', '🚌', '💡', '🏥', '🎬', '👕', '🏠', '📦',
    '🏫', '🏦', '☕', '🎮', '📚', '🐶', '💇', '🧾', '🎂', '🏋️', '🎧'];

  /* Guía de configuración de la conexión con Gmail: `guia.html`, al lado de la
     app. La dirección es relativa a propósito, para que funcione igual en el
     servidor local, en la dirección publicada y en cualquier otra copia. */
  const GUIA_GMAIL = 'guia.html';

  /* Sin tildes y en minúsculas, para comparar lo que alguien escribe con lo que
     hay guardado: así «cafeteria» encuentra «Cafetería». El rango del `replace`
     son los acentos sueltos que deja `NFD` al separar la letra de su tilde.

     Lo usan el buscador de gastos y las sugerencias de comercio. */
  function sinTildes(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /* ---------- piezas sueltas ------------------------------------------------ */

  function header(titulo, sub, extra) {
    return el('div.top', [
      el('div.top-text', [
        el('h1', { text: titulo }),
        sub ? el('p.sub', { text: sub }) : null
      ]),
      extra || null
    ]);
  }

  function volver(href, texto) {
    return el('a.back', { href: href, text: '‹ ' + (texto || 'Volver') });
  }

  function campo(etiqueta, control, ayuda) {
    return el('label.field', [
      el('span', { text: etiqueta }),
      control,
      ayuda ? el('small.field-help', { text: ayuda }) : null
    ]);
  }

  function vacio(titulo, texto, accion) {
    return el('div.empty-state', [
      el('h2', { text: titulo }),
      el('p', { text: texto }),
      accion || null
    ]);
  }

  function segmentado(opciones, valor, alCambiar) {
    return el('div.seg', opciones.map((op) => el('button.seg-btn', {
      type: 'button',
      class: 'seg-btn' + (op.valor === valor ? ' is-active' : ''),
      text: op.texto,
      onclick: () => alCambiar(op.valor)
    })));
  }

  /* Barra de consumo. Verde mientras haya margen, ámbar cuando queda poco y
     rojo cuando se llegó al tope o se pasó. El umbral del ámbar vive en
     Store.AVISO para que todas las barras de la app cambien a la vez. */
  function barra(consumido, excedido, consumidoNoCompras) {
    const ancho = Math.min(100, Math.max(0, consumido));
    // El tramo de lo comprometido —fijos y otros gastos juntos— va apagado y
    // primero: no es una decisión de hoy, es dinero que ya estaba apartado
    // antes de salir a comprar. Los dos van en el mismo tramo porque para esta
    // barra significan lo mismo: dinero que no está para gastar.
    const apartado = Math.min(ancho, Math.max(0, consumidoNoCompras || 0));
    const estado = excedido ? ' is-over' : (consumido >= Store.AVISO ? ' is-warn' : '');
    return el('div.bar', { class: 'bar' + estado }, [
      apartado > 0 ? el('div.bar-fijos', { style: { width: apartado + '%' } }) : null,
      el('div.bar-fill', { class: 'bar-fill' + estado, style: { width: (ancho - apartado) + '%' } })
    ]);
  }

  /* La barra de un presupuesto, con su tramo de comprometido si lo tiene. Se
     usa en todas las tarjetas para que la misma barra signifique lo mismo en
     toda la app. */
  function barraDeResumen(r) {
    return barra(r.consumido, r.excedido, r.consumidoNoCompras);
  }

  function barraDeEstado(consumido, estado) {
    return barra(consumido, estado === 'pasado');
  }

  /* El pie de la tarjeta de un presupuesto: «₡120.000 en compras · ₡80.000
     comprometido». Vive aquí y no en cada pantalla porque lo usan la lista de
     presupuestos y el Resumen, y dos textos distintos para lo mismo se leen
     como dos cosas distintas.

     Con una sola caja se dice cuál es —«en fijos» informa más que «comprometido»—
     y con las dos se junta, o la línea no cabe en un móvil. */
  function pieDeTarjeta(r, pre) {
    if (!r.noCompras) {
      return D.dinero(r.gastado, pre.moneda) + ' de ' + D.dinero(r.asignado, pre.moneda);
    }
    const etiqueta = (r.fijos && r.otros) ? ' comprometido'
      : (r.fijos ? ' en fijos' : ' en otros gastos');
    return D.dinero(r.gastado, pre.moneda) + ' en compras · ' +
      D.dinero(r.noCompras, pre.moneda) + etiqueta;
  }

  /* Chapa para la tarjeta de la lista: que un tope pasado se vea sin entrar en
     el presupuesto. Si no hay nada que avisar, no ocupa sitio. */
  function chapaDeTopes(pre, ciclo) {
    const aviso = Store.avisoDeLimites(pre, ciclo);
    if (!aviso) return null;
    const texto = aviso.pasados
      ? (aviso.pasados === 1 ? '1 tope pasado' : aviso.pasados + ' topes pasados')
      : (aviso.cerca === 1 ? '1 tope al límite' : aviso.cerca + ' topes al límite');
    return el('span.chapa-tope', { class: 'chapa-tope is-' + aviso.estado, text: texto });
  }

  function chipCategoria(cat) {
    return el('span.cat-chip', [
      el('span.cat-emoji', { text: cat.emoji }),
      el('span', { text: cat.nombre })
    ]);
  }

  /* ---------- lista de presupuestos ----------------------------------------- */

  function presupuestos() {
    const activos = Store.presupuestos();
    const cerrados = Store.presupuestosCerrados();

    if (!activos.length && !cerrados.length) {
      return el('div', [
        header('Presupuestos'),
        vacio('Todavía no hay ningún presupuesto',
          'Un presupuesto es una bolsa de dinero con un tope: la quincena del salario, un viaje, una reforma. Los gastos se van descontando de ahí.',
          el('a.btn.btn-primary', { href: '#/presupuesto-nuevo', text: 'Crear el primero' }))
      ]);
    }

    return el('div', [
      header('Presupuestos', activos.length + (activos.length === 1 ? ' activo' : ' activos')),
      el('a.btn.btn-primary.btn-block', { href: '#/presupuesto-nuevo', text: '+ Nuevo presupuesto' }),

      activos.length ? el('ul.pre-list', activos.map((p) => tarjetaPresupuesto(p)))
        : vacio('No queda ninguno activo',
          'Los que tenías están en el historial. Puedes reactivar uno o crear otro.'),

      cerrados.length ? el('a.historial-link', { href: '#/historial' }, [
        el('div.historial-texto', [
          el('strong', { text: 'Historial' }),
          el('span', {
            text: cerrados.length + (cerrados.length === 1 ? ' presupuesto cerrado' : ' presupuestos cerrados') +
              ' · siguen guardados enteros'
          })
        ]),
        el('span.aviso-flecha', { text: '›' })
      ]) : null
    ]);
  }

  /* ---------- historial ------------------------------------------------------ */

  function historial() {
    const cerrados = Store.presupuestosCerrados();
    const vencidos = cerrados.filter((p) => Store.estadoDePresupuesto(p) === 'vencido');
    const apagados = cerrados.filter((p) => Store.estadoDePresupuesto(p) === 'desactivado');

    if (!cerrados.length) {
      return el('div', [
        volver('#/presupuestos', 'Presupuestos'),
        header('Historial'),
        vacio('Aquí no hay nada todavía',
          'Cuando un presupuesto de una vez pase su fecha de fin, o desactives uno que ya no necesites, aparecerá aquí con todos sus datos.')
      ]);
    }

    return el('div', [
      volver('#/presupuestos', 'Presupuestos'),
      header('Historial', 'Presupuestos cerrados. No se ha borrado nada.'),

      vencidos.length ? el('section.grupo-historial', [
        el('h2.grupo-titulo', { text: 'Vencidos' }),
        el('p.muted', { text: 'Pasó su fecha de fin. Salieron del Resumen solos.' }),
        el('ul.pre-list', vencidos.map((p) => tarjetaPresupuesto(p, { cerrado: true })))
      ]) : null,

      apagados.length ? el('section.grupo-historial', [
        el('h2.grupo-titulo', { text: 'Desactivados' }),
        el('p.muted', { text: 'Los apagaste tú. Puedes volver a activarlos cuando quieras.' }),
        el('ul.pre-list', apagados.map((p) => tarjetaPresupuesto(p, { cerrado: true })))
      ]) : null
    ]);
  }

  /* En el historial no vale enseñar el periodo de hoy —estaría vacío—, sino el
     último que tuvo sentido: el de la fecha de fin, o el del día en que se
     desactivó. */
  function tarjetaPresupuesto(pre, opciones) {
    const cerrado = opciones && opciones.cerrado;
    const r = Store.resumen(pre, cerrado ? Store.cicloDeReferencia(pre) : null);
    return el('li', [
      el('a.pre-card', {
        href: '#/presupuesto/' + pre.id,
        class: 'pre-card' + (cerrado ? ' is-cerrado' : ''),
        style: { borderLeftColor: pre.color }
      }, [
        el('div.pre-head', [
          el('span.pre-emoji', { text: pre.emoji || '💰' }),
          el('div.pre-title', [
            el('h3', { text: pre.nombre }),
            el('span.pre-cycle', { text: r.ciclo ? r.ciclo.etiqueta : '' })
          ]),
          el('div.pre-avail', [
            cerrado
              ? el('span.pre-avail-v.is-cerrado', { text: D.dinero(r.gastado, pre.moneda) })
              : el('span.pre-avail-v', {
                class: 'pre-avail-v' + (r.excedido ? ' is-over' : ''),
                text: D.dinero(r.disponible, pre.moneda)
              }),
            el('span.pre-avail-l', {
              text: cerrado ? 'gastado en total' : (r.excedido ? 'de más' : 'disponible')
            })
          ])
        ]),
        barraDeResumen(r),
        el('div.pre-foot', [
          el('span', { text: pieDeTarjeta(r, pre) }),
          el('span', { text: r.consumido + ' %' })
        ]),
        cerrado ? el('span.chapa-cerrado', { text: motivoDelCierre(pre) }) : chapaDeTopes(pre, r.ciclo)
      ])
    ]);
  }

  /* El aviso de la ficha explica por qué ya no está en el Resumen y da la
     salida: reactivarlo. Un presupuesto vencido se reactiva cambiándole la
     fecha de fin, no con un botón: si se pudiera «desvencer» sin tocar la
     fecha, al día siguiente volvería a vencer y parecería un fallo. */
  function avisoDeCierre(pre, estado) {
    if (estado === 'vencido') {
      return el('div.aviso-cierre', [
        el('p', {
          text: 'Este presupuesto venció el ' + D.fechaMedia(pre.fin) + ', así que ya no sale ' +
            'en el Resumen. Sigue entero aquí y le puedes seguir apuntando gastos.'
        }),
        el('a.btn.btn-small', {
          href: '#/presupuesto-editar/' + pre.id,
          text: 'Alargar la fecha de fin'
        })
      ]);
    }
    return el('div.aviso-cierre', [
      el('p', {
        text: 'Este presupuesto está desactivado' +
          (pre.archivadoEn ? ' desde el ' + D.fechaMedia(pre.archivadoEn) : '') +
          ', así que no sale en el Resumen. No se ha borrado nada.'
      }),
      el('button.btn.btn-small', {
        type: 'button', text: 'Volver a activarlo',
        onclick: () => {
          Store.archivar(pre.id, false);
          delete anclas[pre.id];
          location.hash = '#/presupuesto/' + pre.id;
          App.render();
        }
      })
    ]);
  }

  function motivoDelCierre(pre) {
    if (Store.estadoDePresupuesto(pre) === 'vencido') {
      return 'Venció el ' + D.fechaMedia(pre.fin);
    }
    return pre.archivadoEn ? 'Desactivado el ' + D.fechaMedia(pre.archivadoEn) : 'Desactivado';
  }

  /* ---------- detalle de un presupuesto ------------------------------------- */

  // Qué ciclo se está mirando en cada presupuesto. Se guarda una fecha de
  // dentro del ciclo, no el ciclo entero, para que lo calcule siempre cicloDe.
  const anclas = {};

  function presupuestoDetalle(id) {
    const pre = Store.presupuesto(id);
    if (!pre) {
      return el('div', [
        header('Presupuesto no encontrado'),
        el('a.btn', { href: '#/presupuestos', text: 'Volver a la lista' })
      ]);
    }

    const estado = Store.estadoDePresupuesto(pre);
    const cerrado = estado !== 'activo';
    // Un presupuesto cerrado se abre por su último periodo con sentido, no por
    // el de hoy, que estaría vacío.
    const ciclo = Store.cicloDe(pre, anclas[id] || Store.fechaDeReferencia(pre));
    const r = Store.resumen(pre, ciclo);
    const dias = Store.porDia(pre, ciclo);
    const esActual = !anclas[id] || Store.cicloActual(pre).inicio === ciclo.inicio;

    /* ---------- el gráfico de cada día manda sobre «En qué se fue» -----------

       Tocar una barra filtra el reparto por categorías a ese día. Las dos
       tarjetas se montan aquí juntas porque tienen que hablarse.

       Se repintan a mano, SIN pasar por `App.render()`, y eso es la clave: la
       pantalla entera son gráficos y tarjetas largas, así que rehacerla
       devolvería el scroll arriba justo cuando se acaba de tocar una barra que
       está a media pantalla. Además el gráfico guarda dentro qué día está
       marcado, y un `render` lo borraría. Es la misma razón por la que el
       gráfico ya se repintaba solo antes de esto. */
    let diaElegido = null;
    const cajaCategorias = el('div');

    // Un solo estado para las dos tarjetas: el día elegido es uno, y las dos
    // tienen que estar diciendo lo mismo al mismo tiempo.
    const quitarElDia = () => { if (panelDia) panelDia.elegirDia(null); };
    const opcionesDelFiltro = () => ({ fecha: diaElegido, alQuitarFiltro: quitarElDia });

    /* La de gastos se monta una sola vez y luego se le pasan listas: lleva
       dentro el campo de búsqueda, y rehacerla en cada tecla lo dejaría sin
       foco. Ver el comentario de `tarjetaDeGastos`. */
    const tarjetaGastos = tarjetaDeGastos(pre, {
      hayGastos: r.numGastos > 0,
      alQuitarFiltro: quitarElDia
    });

    function pintarFiltrables() {
      // Un día suelto es un ciclo de un solo día: `porCategoria` ya sabe
      // recortar por fechas, así que no hace falta nada nuevo en el almacén.
      const recorte = diaElegido ? { inicio: diaElegido, fin: diaElegido } : ciclo;
      const gastos = diaElegido ? r.gastos.filter((g) => g.fecha === diaElegido) : r.gastos;

      D.clear(cajaCategorias);
      cajaCategorias.appendChild(
        tarjetaDeCategorias(pre, Store.porCategoria(pre, recorte), opcionesDelFiltro()));

      tarjetaGastos.mostrar(gastos, diaElegido);
    }

    const panelDia = r.numGastos ? Charts.panelDiario({
      dias: dias,
      moneda: pre.moneda,
      pista: 'Toca una barra para ver ese día abajo.',
      alElegir: (fecha) => { diaElegido = fecha; pintarFiltrables(); }
    }) : null;

    pintarFiltrables();

    return el('div', [
      volver(cerrado ? '#/historial' : '#/presupuestos', cerrado ? 'Historial' : 'Presupuestos'),
      header(pre.emoji + '  ' + pre.nombre, textoDelTipo(pre),
        el('a.btn.btn-small', { href: '#/presupuesto-editar/' + pre.id, text: 'Editar' })),

      cerrado ? avisoDeCierre(pre, estado) : null,

      pre.tipo === 'recurrente' ? navegadorDeCiclo(pre, ciclo, id) : null,

      el('section.card.balance', [
        el('div.balance-main', [
          el('span.balance-v', {
            class: 'balance-v' + (r.excedido ? ' is-over' : ''),
            text: D.dinero(r.disponible, pre.moneda)
          }),
          // Con gastos fijos el número de arriba ya no es «lo que queda» a
          // secas, es lo que queda PARA COMPRAR. Decirlo evita la pregunta.
          el('span.balance-l', {
            text: r.excedido ? 'gastado de más'
              : (r.noCompras ? 'te queda para compras' : 'te queda disponible')
          })
        ]),
        barraDeResumen(r),
        baldosasDelBalance(pre, r),
        montoDelPeriodo(pre, ciclo, r),
        r.diasRestantes !== null && esActual ? ritmo(r, pre) : null,
        el('a.btn.btn-primary.btn-block', {
          href: '#/nuevo/' + pre.id, text: '+ Apuntar un gasto'
        })
      ]),

      tarjetaDeApuntes(pre, ciclo, r, 'fijos'),
      tarjetaDeApuntes(pre, ciclo, r, 'otros'),

      tarjetaDeLimites(pre, ciclo),

      r.numGastos ? el('section.card', [
        el('div.chart-head', [
          el('h2.card-title', { text: 'Cómo va el gasto' }),
          el('p.muted', {
            text: 'La línea de puntos es el ritmo que agota el presupuesto justo el último día.' +
              (r.noCompras ? ' Aquí solo entran las compras: lo comprometido ya está descontado.' : '')
          })
        ]),
        Charts.acumulado({
          dias: dias,
          // La meta es lo que queda PARA COMPRAR, no el presupuesto entero: la
          // línea solo dibuja compras, así que compararla con el total haría
          // parecer que sobra un dinero que ya está comprometido.
          meta: r.paraCompras,
          moneda: pre.moneda,
          diasTotales: r.diasTotales || dias.length,
          finIso: ciclo.fin
        }),
        el('p.legend-line', [el('span.legend-dash'), 'ritmo ideal'])
      ]) : null,

      r.numGastos ? el('section.card', [
        el('h2.card-title', { text: 'Gasto de cada día' }),
        panelDia
      ]) : null,

      r.numGastos ? cajaCategorias : null,

      tarjetaGastos,

      tarjetaCompartir(pre, ciclo)
    ]);
  }

  /* ---------- «En qué se fue» -----------------------------------------------

     En un presupuesto en colones no tiene ningún misterio: los números salen en
     colones y ya está.

     En uno en DÓLARES sí, y es lo que se pidió: la tarjeta salía en dólares, y
     lo que hace falta saber es cuánto costó **en colones**, que es la moneda en
     la que se piensa, con las compras en dólares convertidas y sumadas ahí
     dentro. Así que cuando el presupuesto no está en la moneda de casa, el
     número grande de cada categoría es el de casa y debajo, pequeño, queda el
     de la moneda del presupuesto.

     La conversión la hace `Store.porCategoria` compra a compra, cada una con su
     propio tipo de cambio (ver allí por qué no vale convertir el total).

     El resto de la ficha —el saldo, los gráficos, los gastos— se queda en la
     moneda del presupuesto a propósito: es su dinero y su tope, y pasarlo todo
     a colones convertiría un presupuesto de $2.000 en uno de ₡1.020.000 que él
     nunca fijó. Esta tarjeta es la única que responde a otra pregunta.

     **Puede enseñar un solo día.** Al tocar una barra de «Gasto de cada día»,
     esta tarjeta pasa a repartir SÓLO ese día. Es la pregunta que sigue
     naturalmente a la anterior: se ve un pico en el gráfico y lo próximo que
     uno quiere saber es en qué se fue ESE día. Antes había que bajar a la lista
     de gastos y sumarlo de cabeza.

     El porcentaje se calcula siempre contra lo que la tarjeta está enseñando,
     no contra el periodo: mirando un día, «32 %» significa un tercio de ese
     día. Contra el total del periodo saldrían porcentajes diminutos que no
     dicen nada. */
  function tarjetaDeCategorias(pre, cats, opciones) {
    const op = opciones || {};
    const base = (cats[0] && cats[0].monedaBase) ||
      Store.ajustes().monedaPorDefecto || 'CRC';
    const enCasa = pre.moneda !== base;

    // El anillo reparte por el mismo número que se enseña, o los trozos no
    // cuadrarían con los porcentajes de al lado.
    const partes = enCasa
      ? cats.map((c) => Object.assign({}, c, { total: c.totalBase }))
      : cats;
    const total = partes.reduce((s, c) => s + c.total, 0);

    const cabecera = el('div.card-head', [
      el('h2.card-title', { text: 'En qué se fue' }),
      // La salida del filtro va arriba y siempre visible: si estuviera al final
      // de una lista de quince categorías habría que buscarla.
      op.fecha ? el('button.link-soft.link-boton', {
        type: 'button', text: 'Todo el periodo', onclick: op.alQuitarFiltro
      }) : null
    ]);

    const marca = op.fecha
      ? el('p.filtro-dia', { text: 'Solo ' + etiquetaDeDia(op.fecha) })
      : null;

    /* Un día sin compras no es un error ni una tarjeta vacía: es una respuesta,
       y hay que darla. Sin esto la tarjeta desaparecería justo después de
       tocar la barra, que se lee como que algo se rompió. */
    if (!cats.length) {
      return el('section.card', [
        cabecera,
        marca,
        el('p.muted', {
          text: op.fecha ? 'Ese día no hubo compras.' : 'Todavía no hay compras en este periodo.'
        })
      ]);
    }

    return el('section.card', [
      cabecera,
      marca,
      enCasa ? el('p.muted', {
        text: 'En ' + (base === 'CRC' ? 'colones' : 'dólares') +
          ', con el tipo de cambio de cada compra.'
      }) : null,
      el('div.cat-split', [
        Charts.anillo(partes, { moneda: enCasa ? base : pre.moneda }),
        el('ul.cat-list', cats.map((c) => el('li.cat-row', {
          class: 'cat-row' + (enCasa ? ' is-doble' : '')
        }, [
          el('span.cat-dot', { style: { background: c.color } }),
          el('span.cat-emoji', { text: c.emoji }),
          el('span.cat-name', { text: c.nombre }),
          el('span.cat-total', [
            el('span', { text: D.dinero(enCasa ? c.totalBase : c.total, enCasa ? base : pre.moneda) }),
            enCasa ? el('span.cat-otra', { text: D.dinero(c.total, pre.moneda) }) : null
          ]),
          el('span.cat-pct', { text: D.porcentaje(enCasa ? c.totalBase : c.total, total) + ' %' })
        ])))
      ])
    ]);
  }

  /* ---------- los gastos fijos DE ESTE periodo ------------------------------

     Van justo debajo del saldo porque lo explican: sin esta tarjeta, el saldo
     enseña un número más bajo del que salía la cuenta y no hay dónde mirar por
     qué. Y van en su propio sitio, no mezclados con los gastos de abajo.

     Se apuntan **desde dentro del periodo**, no al crear el presupuesto: cada
     quincena tiene los suyos, porque no todas traen los mismos recibos. Para
     no reescribirlos cada quince días está el botón de copiar los del periodo
     de al lado — explícito y de un toque, en vez de una herencia automática
     que luego nadie entiende de dónde sale.

     Aquí no hay barra ni porcentaje a propósito: un gasto fijo no se «va
     consumiendo», está pagado y punto.
  --------------------------------------------------------------------------- */

  /* Las dos cajas comparten toda la maquinaria y se diferencian sólo en las
     palabras y en si dejan copiar del periodo de al lado.

     Copiar sólo tiene sentido en los fijos: el alquiler es el mismo cada
     quincena. Un imprevisto, por definición, no se repite — ofrecer «copiar los
     del periodo anterior» ahí sería invitar a apuntar dos veces algo que pasó
     una sola. */
  const CAJAS = {
    fijos: {
      clave: 'fijos',
      titulo: 'Gastos fijos del periodo',
      tituloEditor: 'Gastos fijos de ',
      anadir: '+ Añadir un gasto fijo',
      nombreFila: 'Nombre del gasto fijo',
      importeFila: 'Importe del gasto fijo',
      quitarFila: 'Quitar este gasto fijo',
      ejemplos: 'Alquiler, escuela, internet…',
      ayudaRecurrente: 'Estos son solo de este periodo. Los demás periodos no cambian.',
      ayudaPuntual: 'Lo que hay que pagar sí o sí dentro de este presupuesto y no es una compra.',
      ayudaCambio: 'Se guarda con estos gastos fijos: si mañana cambias el tipo en Ajustes, ' +
        'estos no se mueven.',
      alPasarse: 'Los gastos fijos suman ',
      copiaDelVecino: true
    },
    otros: {
      clave: 'otros',
      titulo: 'Otros gastos del periodo',
      tituloEditor: 'Otros gastos de ',
      anadir: '+ Añadir otro gasto',
      nombreFila: 'Nombre del gasto',
      importeFila: 'Importe del gasto',
      quitarFila: 'Quitar este gasto',
      ejemplos: 'Reparación del carro, médico…',
      ayudaRecurrente: 'Los imprevistos de este periodo: no son compras y no se repiten. ' +
        'Los demás periodos no cambian.',
      ayudaPuntual: 'Los imprevistos de este presupuesto: no son compras.',
      ayudaCambio: 'Se guarda con estos gastos: si mañana cambias el tipo en Ajustes, ' +
        'estos no se mueven.',
      alPasarse: 'Los otros gastos suman ',
      copiaDelVecino: false
    }
  };

  // Igual que con el importe del periodo: la clave lleva el periodo Y la caja
  // dentro, así que al cambiar de quincena —o al abrir la otra caja— el editor
  // se cierra solo en vez de quedarse abierto con la lista que no es.
  let apuntesAbierto = null;
  let apuntesBorrador = [];
  let apuntesCambio = '';

  /* Con qué tipo de cambio se abre el editor. Si los que ya están apuntados
     traen uno estampado, ése: se guardaron a ese precio y volver a abrirlos
     para cambiar un nombre no puede recalcularlos por detrás. Sólo cuando no
     hay ninguno se usa el de hoy. */
  function cambioDeApuntes(lista, pre) {
    const conCambio = (lista || []).find((f) =>
      f.tipoCambio > 0 && (f.moneda || pre.moneda) !== pre.moneda);
    return String(conCambio ? conCambio.tipoCambio : Store.ajustes().tipoCambio);
  }

  function tarjetaDeApuntes(pre, ciclo, r, caja) {
    const caso = CAJAS[caja];
    const total = caja === 'otros' ? r.otros : r.fijos;
    const guardados = caja === 'otros' ? r.listaOtros : r.listaFijos;
    const clave = pre.id + '|' + ((ciclo && ciclo.inicio) || 'unico') + '|' + caja;
    if (apuntesAbierto === clave) return apuntesEditor(pre, ciclo, r, clave, caja);

    const vecino = caso.copiaDelVecino ? Store.apuntesDelVecino(pre, ciclo, caja) : null;
    const abrir = (lista, cambio) => {
      apuntesAbierto = clave;
      apuntesBorrador = lista.map((f) => ({
        id: f.id, nombre: f.nombre, monto: String(f.monto), moneda: f.moneda || pre.moneda
      }));
      apuntesCambio = cambio || cambioDeApuntes(lista, pre);
      App.render();
    };
    const enBlanco = () => ({ id: Store.uid('apunte'), nombre: '', monto: '', moneda: pre.moneda });

    if (!total) {
      return el('section.card.fijos-vacio', [
        el('h2.card-title', { text: caso.titulo }),
        el('div.fijo-acciones', [
          el('button.link-boton', {
            type: 'button', text: caso.anadir,
            onclick: () => abrir([enBlanco()])
          }),
          vecino ? el('button.link-boton.link-copiar', {
            type: 'button',
            text: 'Copiar los de ' + vecino.ciclo.etiqueta + ' (' + vecino.lista.length + ')',
            // Copiados se llevan la moneda, pero no el tipo de cambio: son
            // recibos de OTRO periodo, y este se paga al precio de ahora.
            onclick: () => abrir(vecino.lista.map((f) => ({
              id: Store.uid('apunte'), nombre: f.nombre, monto: f.monto, moneda: f.moneda
            })), String(Store.ajustes().tipoCambio))
          }) : null
        ])
      ]);
    }

    return el('section.card', [
      el('div.card-head', [
        el('h2.card-title', { text: caso.titulo }),
        el('button.link-soft.link-boton', {
          type: 'button', text: 'Cambiar',
          onclick: () => abrir(guardados)
        })
      ]),
      el('ul.fijos', guardados.map((f) => {
        const otra = (f.moneda || pre.moneda) !== pre.moneda;
        return el('li.fijo', [
          el('span.fijo-nombre', { text: f.nombre }),
          // En otra moneda se enseñan las dos: lo que cobran, que es el dato
          // de verdad, y lo que le quita al presupuesto, que es lo que cuadra
          // con el total de abajo.
          el('span.fijo-monto', [
            el('span', { text: D.dinero(f.monto, f.moneda || pre.moneda) }),
            otra ? el('span.fijo-convertido', {
              text: D.dinero(Store.montoApuntadoEn(f, pre.moneda), pre.moneda)
            }) : null
          ])
        ]);
      })),
      el('div.fijo-total', [
        el('span', { text: 'Total comprometido' }),
        el('span', { text: D.dinero(total, pre.moneda) })
      ])
    ]);
  }

  /* Las baldosas de debajo del saldo. Crecen según lo que haya que contar, y
     no al revés: enseñar «Gastos fijos ₡0» en un presupuesto que no tiene
     ninguno es ocupar sitio para decir que no hay nada.

     Con las dos cajas llenas son cinco números. En dos columnas la quinta se
     quedaría sola en su fila, así que ocupa el ancho entero: el porcentaje es
     el que mejor aguanta ir en grande, porque es el resumen de los otros
     cuatro. */
  function baldosasDelBalance(pre, r) {
    const fijas = [dato('Presupuesto', D.dinero(r.asignado, pre.moneda), r.asignadoPropio)];
    if (r.fijos) fijas.push(dato('Gastos fijos', D.dinero(r.fijos, pre.moneda)));
    if (r.otros) fijas.push(dato('Otros gastos', D.dinero(r.otros, pre.moneda)));
    fijas.push(dato(r.noCompras ? 'Compras' : 'Gastado', D.dinero(r.gastado, pre.moneda)));
    fijas.push(dato('Consumido', r.consumido + ' %'));

    const forma = fijas.length === 5 ? ' is-cinco' : (fijas.length === 4 ? ' is-cuatro' : '');
    return el('div.balance-grid', { class: 'balance-grid' + forma }, fijas);
  }

  function etiquetaDelPeriodo(pre, ciclo) {
    if (pre.tipo !== 'recurrente') return 'este presupuesto';
    return ciclo && ciclo.etiqueta ? ciclo.etiqueta : 'este periodo';
  }

  /* El total se repinta a cada tecla sin rehacer la pantalla: volver a
     dibujarlo todo en mitad de una palabra deja el campo sin foco y en el
     móvil cierra el teclado. Lo mismo que hace el reparto de un gasto entre
     varios presupuestos. */
  function apuntesEditor(pre, ciclo, r, clave, caja) {
    const caso = CAJAS[caja];
    const lista = apuntesBorrador;
    const resumenApuntes = el('p.hint');
    const cerrar = () => {
      apuntesAbierto = null; apuntesBorrador = []; apuntesCambio = ''; App.render();
    };
    const refrescar = () => App.render();

    /* Lo que ya hay comprometido en la OTRA caja. Sin esto, cada editor
       compararía su suma contra el presupuesto entero y los dos dirían que
       caben, cuando juntos no caben. */
    const laOtra = caja === 'otros' ? r.fijos : r.otros;
    const techo = D.redondear(r.asignado - laOtra, pre.moneda);

    // Lo que una fila le quita al presupuesto, con el tipo de cambio que hay
    // ahora mismo en el campo. Mientras se escribe no hay nada estampado
    // todavía: eso pasa al guardar.
    const hayOtraMoneda = () => lista.some((f) => f.moneda !== pre.moneda);
    const tipoAhora = () => D.leerImporte(apuntesCambio) || Store.ajustes().tipoCambio;
    const enPresupuesto = (f) =>
      Store.convertir(D.leerImporte(f.monto) || 0, f.moneda, pre.moneda, tipoAhora());

    const inCambioApuntes = el('input', {
      type: 'text', inputmode: 'decimal', value: apuntesCambio,
      oninput: (e) => { apuntesCambio = e.target.value; pintarTotal(); }
    });

    function pintarTotal() {
      const suma = lista.reduce((s, f) => s + enPresupuesto(f), 0);
      const queda = D.redondear(techo - suma, pre.moneda);
      if (!suma) {
        resumenApuntes.className = 'hint';
        resumenApuntes.textContent = 'De momento no suman nada. Las filas sin importe no se guardan.';
        return;
      }
      // Cuando la otra caja ya tiene algo hay que decirlo, o el número contra
      // el que se compara parece sacado de la nada.
      const deQue = laOtra
        ? D.dinero(techo, pre.moneda) + ' que quedaban'
        : D.dinero(techo, pre.moneda);
      if (queda < 0) {
        resumenApuntes.className = 'hint is-error';
        resumenApuntes.textContent = 'Suman ' + D.dinero(suma, pre.moneda) + ', más que los ' +
          deQue + ' del periodo. Se pasa ' + D.dinero(Math.abs(queda), pre.moneda) +
          ' y no queda nada para comprar.';
        return;
      }
      resumenApuntes.className = 'hint';
      resumenApuntes.textContent = 'Suman ' + D.dinero(suma, pre.moneda) + ' de ' + deQue +
        ': quedan ' + D.dinero(queda, pre.moneda) + ' para comprar.';
    }

    pintarTotal();

    return el('section.card.fijos-editor', [
      el('h2.card-title', { text: caso.tituloEditor + etiquetaDelPeriodo(pre, ciclo) }),
      el('p.hint-box', {
        text: pre.tipo === 'recurrente' ? caso.ayudaRecurrente : caso.ayudaPuntual
      }),

      lista.length ? el('div.fijos-edit', lista.map((f) => el('div.fijo-edit', [
        el('input.fijo-edit-nombre', {
          type: 'text', value: f.nombre, placeholder: caso.ejemplos,
          'aria-label': caso.nombreFila,
          oninput: (e) => { f.nombre = e.target.value; }
        }),
        el('button.corte-quitar.fijo-quitar', {
          type: 'button', text: '×', 'aria-label': caso.quitarFila,
          onclick: () => { apuntesBorrador = lista.filter((x) => x !== f); refrescar(); }
        }),
        /* La moneda va en cada fila, no en la tarjeta entera: dentro de la
           misma quincena conviven el alquiler en colones y la suscripción en
           dólares. Los dos botones se ven siempre, aunque el presupuesto sea en
           colones — un desplegable escondido es justo lo que no se encuentra. */
        el('div.fijo-edit-fila', [
          segmentado([
            { valor: 'CRC', texto: '₡' },
            { valor: 'USD', texto: '$' }
          ], f.moneda, (v) => { f.moneda = v; refrescar(); }),
          el('input.in-amount-sm.fijo-edit-monto', {
            type: 'text', inputmode: 'decimal', value: f.monto, placeholder: '0',
            'aria-label': caso.importeFila,
            oninput: (e) => { f.monto = e.target.value; pintarTotal(); }
          })
        ])
      ]))) : null,

      el('button.btn.btn-small', {
        type: 'button', text: caso.anadir,
        onclick: () => {
          apuntesBorrador = lista.concat([
            { id: Store.uid('apunte'), nombre: '', monto: '', moneda: pre.moneda }
          ]);
          refrescar();
          // El teclado se abre en la fila nueva: si no, hay que buscarla y
          // tocarla, que en el móvil es un paso de más cada vez.
          setTimeout(() => {
            const filas = document.querySelectorAll('.fijo-edit-nombre');
            if (filas.length) filas[filas.length - 1].focus();
          }, 0);
        }
      }),

      hayOtraMoneda()
        ? campo('Tipo de cambio (colones por dólar)', inCambioApuntes, caso.ayudaCambio)
        : null,

      resumenApuntes,

      el('div.form-actions', [
        el('button.btn', { type: 'button', text: 'Cancelar', onclick: cerrar }),
        el('button.btn.btn-primary', {
          type: 'button', text: 'Guardar',
          onclick: () => {
            const tc = tipoAhora();
            if (hayOtraMoneda() && !(tc > 0)) {
              alert('El tipo de cambio tiene que ser un número mayor que cero.');
              return;
            }
            const limpia = lista
              .map((f) => ({
                id: f.id, nombre: f.nombre, monto: D.leerImporte(f.monto) || 0,
                moneda: f.moneda, tipoCambio: tc
              }))
              .filter((f) => f.monto > 0);
            // La comparación con el presupuesto va en su moneda, o un recibo en
            // dólares parecería ridículamente pequeño al lado de los colones.
            const suma = D.redondear(
              limpia.reduce((s, f) => s + Store.montoApuntadoEn(f, pre.moneda), 0), pre.moneda);
            // Se puede guardar igual —a veces la cuenta sale así de verdad—,
            // pero callarlo dejaría el periodo empezando en rojo sin explicación.
            if (suma > techo && !confirm(
              caso.alPasarse + D.dinero(suma, pre.moneda) + ', más que los ' +
              D.dinero(techo, pre.moneda) + (laOtra ? ' que quedaban' : '') +
              ' de este periodo. Se puede guardar, pero ' +
              'no quedará nada para comprar. ¿Sigo?')) return;
            Store.setApuntes(pre.id, ciclo, caja, limpia);
            cerrar();
          }
        })
      ])
    ]);
  }

  /* Los topes van justo debajo del saldo, antes que los gráficos: es lo que
     hay que mirar antes de gastar, no un dato para el final. Van ordenados por
     lo lleno que está cada uno, así que lo que está a punto de reventar sale
     arriba solo. */
  function tarjetaDeLimites(pre, ciclo) {
    const lista = Store.limitesDe(pre, ciclo);
    if (!lista.length) return null;

    return el('section.card', [
      el('div.card-head', [
        el('h2.card-title', { text: 'Topes por categoría' }),
        el('a.link-soft', { href: '#/presupuesto-editar/' + pre.id, text: 'Cambiar' })
      ]),
      el('ul.limites', lista.map((l) => el('li.limite', { class: 'limite is-' + l.estado }, [
        el('div.limite-head', [
          el('span.cat-emoji', { text: l.emoji }),
          el('span.cat-name', { text: l.nombre }),
          el('span.limite-restante', {
            class: 'limite-restante is-' + l.estado,
            text: l.estado === 'pasado'
              ? (l.gastado === l.limite ? 'justo en el tope' : D.dinero(Math.abs(l.restante), pre.moneda) + ' de más')
              : 'quedan ' + D.dinero(l.restante, pre.moneda)
          })
        ]),
        barraDeEstado(l.consumido, l.estado),
        el('div.limite-pie', [
          el('span', { text: D.dinero(l.gastado, pre.moneda) + ' de ' + D.dinero(l.limite, pre.moneda) }),
          el('span', { text: l.consumido + ' %' })
        ])
      ])))
    ]);
  }

  function dato(etiqueta, valor, marcado) {
    return el('div.stat', { class: 'stat' + (marcado ? ' is-propio' : '') }, [
      el('span.stat-v', { text: valor }),
      el('span.stat-l', { text: etiqueta })
    ]);
  }

  /* ---------- el presupuesto de UN periodo suelto ---------------------------

     El salario no siempre trae lo mismo: una quincena entra el aguinaldo y
     otra viene más floja. Aquí se le pone a ESE periodo su propio importe sin
     tocar los demás, que es lo que se quiere; cambiar el presupuesto entero
     desde «Editar» seguiría estando mal para el resto de quincenas.

     Se puede hacer en cualquier periodo, también en los ya pasados: corregir
     la quincena de julio es justo para lo que sirve.
  --------------------------------------------------------------------------- */

  // Qué periodo tiene el importe abierto para editar, y lo que se lleva
  // escrito. Fuera de la función porque App.render() rehace la pantalla
  // entera en cada tecla y si no, se cerraría solo.
  let montoAbierto = null;
  let montoBorrador = '';

  function montoDelPeriodo(pre, ciclo, r) {
    if (pre.tipo !== 'recurrente' || !ciclo || !ciclo.inicio) return null;

    // La clave lleva el periodo dentro: al pasar al periodo de al lado el
    // editor se cierra solo, en vez de quedarse abierto con el otro importe.
    const clave = pre.id + '|' + ciclo.inicio;
    const deSiempre = D.dinero(pre.monto, pre.moneda);
    const cerrar = () => { montoAbierto = null; montoBorrador = ''; App.render(); };

    if (montoAbierto !== clave) {
      return el('div.monto-periodo', [
        r.asignadoPropio ? el('p.monto-propio', {
          text: 'Este periodo tiene su propio presupuesto. Los demás siguen con ' + deSiempre + '.'
        }) : null,
        el('div.monto-acciones', [
          el('button.link-boton', {
            type: 'button',
            text: r.asignadoPropio ? 'Cambiarlo otra vez' : 'Cambiar solo este periodo',
            onclick: () => {
              montoAbierto = clave;
              montoBorrador = String(r.asignado);
              App.render();
            }
          }),
          r.asignadoPropio ? el('button.link-boton.link-deshacer', {
            type: 'button', text: 'Volver a ' + deSiempre,
            onclick: () => { Store.setMontoDeCiclo(pre.id, ciclo, 0); App.render(); }
          }) : null
        ])
      ]);
    }

    const inMonto = el('input.in-amount-sm', {
      type: 'text', inputmode: 'decimal', value: montoBorrador, placeholder: '0',
      'aria-label': 'Presupuesto de este periodo',
      oninput: (e) => { montoBorrador = e.target.value; }
    });

    return el('div.monto-periodo.is-abierto', [
      el('p.hint-box', {
        text: 'Cuánto dinero hay en ' + ciclo.etiqueta + ', solo en ese. ' +
          'Los demás periodos se quedan con ' + deSiempre + '.'
      }),
      el('div.monto-campo', [
        el('span.monto-simbolo', { text: pre.moneda === 'USD' ? '$' : '₡' }),
        inMonto
      ]),
      el('div.form-actions', [
        el('button.btn', { type: 'button', text: 'Cancelar', onclick: cerrar }),
        el('button.btn.btn-primary', {
          type: 'button', text: 'Guardar',
          onclick: () => {
            const v = D.leerImporte(montoBorrador);
            if (v === null || v <= 0) {
              alert('Escribe cuánto dinero hay en este periodo.');
              return;
            }
            Store.setMontoDeCiclo(pre.id, ciclo, v);
            cerrar();
          }
        })
      ])
    ]);
  }

  function textoDelTipo(pre) {
    if (pre.tipo !== 'recurrente') {
      return pre.fin ? 'Del ' + D.fecha(pre.inicio) + ' al ' + D.fecha(pre.fin) : 'Desde el ' + D.fecha(pre.inicio);
    }
    const nombres = { quincenal: 'Cada quincena', mensual: 'Cada mes', semanal: 'Cada semana' };
    const cada = pre.periodo === 'personalizado'
      ? 'Desde los días ' + Store.cortesDe(pre).join(' y ')
      : (nombres[pre.periodo] || 'Recurrente');
    return cada + ' · ' + D.dinero(pre.monto, pre.moneda);
  }

  function ritmo(r, pre) {
    if (r.excedido) {
      return el('p.pace.is-over', {
        text: 'Te has pasado ' + D.dinero(Math.abs(r.disponible), pre.moneda) +
          (r.diasRestantes > 0 ? ' y aún quedan ' + r.diasRestantes + ' días.' : '.')
      });
    }
    if (r.diasRestantes === 0) {
      return el('p.pace', { text: 'El periodo ya ha terminado.' });
    }
    return el('p.pace', {
      text: 'Quedan ' + r.diasRestantes + (r.diasRestantes === 1 ? ' día' : ' días') +
        (r.porDia ? ': puedes gastar ' + D.dinero(r.porDia, pre.moneda) + ' al día.' : '.')
    });
  }

  function navegadorDeCiclo(pre, ciclo, id) {
    const anterior = Store.cicloVecino(pre, ciclo, -1);
    const siguiente = Store.cicloVecino(pre, ciclo, +1);
    const hoyDentro = Store.enCiclo({ fecha: D.hoy() }, ciclo);

    return el('div.cycle-nav', [
      el('button.cycle-btn', {
        type: 'button', text: '‹', disabled: !anterior,
        'aria-label': 'Periodo anterior',
        onclick: () => { anclas[id] = anterior.inicio; App.render(); }
      }),
      el('div.cycle-label', [
        el('strong', { text: ciclo.etiqueta }),
        hoyDentro ? el('span.cycle-now', { text: 'periodo actual' }) :
          el('button.link-today', {
            type: 'button', text: 'Ir al actual',
            onclick: () => { delete anclas[id]; App.render(); }
          })
      ]),
      el('button.cycle-btn', {
        type: 'button', text: '›', disabled: !siguiente,
        'aria-label': 'Periodo siguiente',
        onclick: () => { anclas[id] = siguiente.inicio; App.render(); }
      })
    ]);
  }

  /* Los gastos van agrupados por día, con el total del día a la derecha. */
  /* `sinDias` quita las cabeceras de día. Se usa cuando la lista ya está
     filtrada a un solo día: la chapa de arriba de la tarjeta ya dice cuál es, y
     repetir la fecha dos centímetros más abajo sobra.

     `sinTotales` deja las cabeceras pero les quita el importe. Es para las
     búsquedas: ahí cada día enseña sólo los gastos que coinciden, y un número a
     la derecha de la fecha se leería como el total de ese día, que no lo es. */
  function listaDeGastos(lista, pre, opciones) {
    const op = opciones || {};
    if (op.sinDias) {
      return el('ul.gasto-list', lista.map((g) => filaDeGasto(g, pre)));
    }

    const grupos = [];
    lista.forEach((g) => {
      const ultimo = grupos[grupos.length - 1];
      if (ultimo && ultimo.fecha === g.fecha) ultimo.items.push(g);
      else grupos.push({ fecha: g.fecha, items: [g] });
    });

    return el('div.day-groups', grupos.map((grupo) => {
      const totalDia = grupo.items.reduce((s, g) => s + Store.montoAsignadoEn(g, pre.id, pre.moneda), 0);
      return el('div.day-group', [
        el('div.day-head', [
          el('span', { text: etiquetaDeDia(grupo.fecha) }),
          op.sinTotales ? null : el('span', { text: D.dinero(totalDia, pre.moneda) })
        ]),
        el('ul.gasto-list', grupo.items.map((g) => filaDeGasto(g, pre)))
      ]);
    }));
  }

  function etiquetaDeDia(iso) {
    if (iso === D.hoy()) return 'Hoy';
    if (iso === D.sumarDias(D.hoy(), -1)) return 'Ayer';
    return D.fechaMedia(iso);
  }

  /* ---------- la tarjeta de «Gastos» ---------------------------------------

     La lista de gastos uno a uno. Se puede estrechar de dos maneras:

     - Por **día**, y eso llega de fuera: lo manda el gráfico de arriba, y
       estrecha a la vez «En qué se fue». Las dos tarjetas responden a la misma
       pregunta desde dos lados —el reparto y el detalle—, así que filtrar sólo
       una dejaría media pantalla contestando de un día y la otra media del
       periodo entero.
     - Por **búsqueda**, y eso vive aquí dentro y sólo afecta a esta lista.

     Sólo puede haber una de las dos a la vez, y es a propósito: escribir suelta
     el día, y elegir un día borra lo escrito. Las dos juntas se ven exactamente
     igual que un buscador roto: se escribe «amazon», no sale nada, y la
     explicación es una chapa de fecha que se tocó hace diez minutos.

     Devuelve la tarjeta montada, con un método `mostrar(lista, dia)`. Se
     construye UNA vez y se le van pasando listas; por dentro sólo se repinta lo
     que cambia. Si la tarjeta entera se rehiciera, el campo de búsqueda sería un
     elemento nuevo en cada letra: perdería el foco y en el móvil se cerraría el
     teclado. Por lo mismo nada de esto pasa por `App.render()`. */
  function tarjetaDeGastos(pre, opciones) {
    const op = opciones || {};

    let lista = [];    // lo que llega del filtro de día, o el periodo entero
    let fecha = null;  // el día marcado en el gráfico, si hay alguno

    const titulo = el('h2.card-title', { text: 'Gastos' });
    const salida = el('button.link-soft.link-boton', {
      type: 'button', text: 'Todo el periodo', onclick: op.alQuitarFiltro
    });

    const campo = el('input.busca-campo', {
      type: 'text',
      placeholder: 'Buscar comercio, nota o categoría',
      autocomplete: 'off',
      spellcheck: 'false',
      // El teclado del móvil enseña una lupa en vez de un «Intro» que aquí no
      // haría nada: la lista se va estrechando mientras se escribe.
      enterkeyhint: 'search',
      oninput: () => {
        /* Escribir suelta el día, porque buscar es una pregunta sobre el
           periodo entero. Quitarlo acaba llamando a `mostrar`, que repinta:
           hacerlo también aquí sería pintar dos veces. */
        if (fecha) op.alQuitarFiltro();
        else pintar();
      }
    });

    const borrar = el('button.busca-x', {
      type: 'button', 'aria-label': 'Borrar la búsqueda', text: '✕',
      onclick: () => { campo.value = ''; campo.focus(); pintar(); }
    });

    const buscador = el('div.buscador', [campo, borrar]);
    buscador.hidden = !op.hayGastos;

    const chapa = el('p.filtro-dia');
    const suma = el('p.filtro-busca');
    const cajaLista = el('div');

    function pintar() {
      const escrito = campo.value.trim();
      const vistos = escrito ? lista.filter((g) => coincide(g, escrito)) : lista;

      // El número cuenta lo que se está enseñando, no lo que hay en el periodo:
      // si dice 12 y debajo hay 2 filas, el que manda es el número.
      titulo.textContent = 'Gastos' + (vistos.length ? ' (' + vistos.length + ')' : '');

      salida.hidden = !fecha;
      chapa.hidden = !fecha;
      if (fecha) chapa.textContent = 'Solo ' + etiquetaDeDia(fecha);

      /* Buscando, la pregunta de detrás casi siempre es «¿cuánto llevo en
         esto?». El total de lo que salió la contesta sin tener que sumar a
         mano. */
      suma.hidden = !(escrito && vistos.length);
      if (!suma.hidden) {
        const total = vistos.reduce((s, g) => s + Store.montoAsignadoEn(g, pre.id, pre.moneda), 0);
        suma.textContent = 'Suman ' + D.dinero(total, pre.moneda);
      }

      borrar.hidden = !escrito;

      D.clear(cajaLista);
      cajaLista.appendChild(vistos.length
        ? listaDeGastos(vistos, pre, { sinDias: !!fecha, sinTotales: !!escrito })
        : el('p.muted', { text: nadaQueEnsenar(escrito, fecha) }));
    }

    function nadaQueEnsenar(escrito, dia) {
      if (escrito) return 'Ningún gasto dice «' + escrito + '».';
      if (dia) return 'Ese día no hay gastos apuntados.';
      return 'Todavía no hay ningún gasto apuntado en este periodo.';
    }

    const card = el('section.card', [
      el('div.card-head', [titulo, salida]),
      buscador, chapa, suma, cajaLista
    ]);

    card.mostrar = function (nueva, dia) {
      lista = nueva || [];
      fecha = dia || null;
      // Elegir un día borra lo escrito, por lo de arriba.
      if (fecha) campo.value = '';
      pintar();
    };

    return card;
  }

  /* Busca donde está escrito lo que uno recuerda de una compra: el comercio, la
     nota y el nombre de la categoría. Varias palabras tienen que salir todas,
     pero en cualquier orden, para que «amaz prime» encuentre «Amazon Prime». */
  function coincide(g, escrito) {
    const heno = sinTildes([g.comercio, g.nota, Store.categoria(g.categoria).nombre].join(' '));
    return sinTildes(escrito).split(/\s+/).every((palabra) => heno.indexOf(palabra) >= 0);
  }

  /* En la lista de un presupuesto manda el importe que le quita A ESE
     presupuesto, que es el que explica el saldo. Debajo, y sólo cuando no
     coinciden, lo que se pagó de verdad: otra moneda, o un gasto repartido. */
  function filaDeGasto(g, pre) {
    const cat = Store.categoria(g.categoria);
    const asignado = Store.montoAsignadoEn(g, pre.id, pre.moneda);
    const pagado = D.dinero(g.monto, g.moneda);
    const propio = D.dinero(asignado, pre.moneda);
    const compartido = Store.asignaciones(g).length > 1;

    return el('li', [
      el('a.gasto-row', { href: '#/gasto/' + g.id }, [
        el('span.gasto-emoji', { style: { background: cat.color + '22' }, text: cat.emoji }),
        el('div.gasto-main', [
          el('span.gasto-name', { text: g.comercio || cat.nombre }),
          // La hora delante cuando se sabe: es lo que explica el orden dentro
          // del día, y sin verla parece que la lista está revuelta.
          el('span.gasto-meta', {
            text: (g.hora ? g.hora + ' · ' : '') + cat.nombre +
              (g.nota ? ' · ' + g.nota : '') + (g.origen === 'gmail' ? ' · del correo' : '')
          }),
          compartido ? el('span.chip-compartido', { text: 'En ' + Store.asignaciones(g).length + ' presupuestos' }) : null
        ]),
        el('div.gasto-amount', [
          el('span.gasto-v', { text: propio }),
          propio !== pagado ? el('span.gasto-conv', { text: 'de ' + pagado }) : null
        ])
      ])
    ]);
  }

  /* ---------- compartir el estado de un presupuesto ------------------------- */

  /* Se arma un texto plano y se le pasa al móvil para que lo mande por donde
     él quiera: WhatsApp, correo, Telegram, lo que tenga instalado.

     Texto y no una imagen a propósito: se lee en la notificación sin abrir
     nada, se puede copiar, y funciona igual en todos lados. */
  function textoDelEstado(pre, ciclo) {
    const r = Store.resumen(pre, ciclo);
    const cats = Store.porCategoria(pre, ciclo);
    const lineas = [];

    lineas.push((pre.emoji || '💰') + ' ' + pre.nombre);
    if (r.ciclo && r.ciclo.etiqueta) lineas.push(r.ciclo.etiqueta);
    lineas.push('');
    lineas.push('Presupuesto: ' + D.dinero(r.asignado, pre.moneda));

    /* Con dinero comprometido hace falta desglosar, o el texto no cuadra: quien
       lo lea vería un gastado pequeño y un disponible mucho menor de lo que
       tocaría, sin nada que lo explique. */
    if (r.noCompras) {
      if (r.fijos) {
        lineas.push('Gastos fijos: ' + D.dinero(r.fijos, pre.moneda));
        r.listaFijos.forEach((f) => {
          lineas.push('· ' + f.nombre + ': ' + D.dinero(f.monto, f.moneda || pre.moneda));
        });
      }
      if (r.otros) {
        lineas.push('Otros gastos: ' + D.dinero(r.otros, pre.moneda));
        r.listaOtros.forEach((f) => {
          lineas.push('· ' + f.nombre + ': ' + D.dinero(f.monto, f.moneda || pre.moneda));
        });
      }
      lineas.push('Para compras: ' + D.dinero(r.paraCompras, pre.moneda));
      lineas.push('Compras: ' + D.dinero(r.gastado, pre.moneda));
      lineas.push((r.excedido ? 'Pasado de: ' : 'Disponible: ') +
        D.dinero(Math.abs(r.disponible), pre.moneda));
      lineas.push('Consumido: ' + r.consumido + ' % del presupuesto');
    } else {
      lineas.push('Gastado: ' + D.dinero(r.gastado, pre.moneda) + ' (' + r.consumido + ' %)');
      lineas.push((r.excedido ? 'Pasado de: ' : 'Disponible: ') +
        D.dinero(Math.abs(r.disponible), pre.moneda));
    }

    if (r.diasRestantes !== null && r.diasRestantes > 0 && r.porDia) {
      lineas.push('Quedan ' + r.diasRestantes + (r.diasRestantes === 1 ? ' día' : ' días') +
        ': ' + D.dinero(r.porDia, pre.moneda) + ' al día');
    }

    const topes = Store.limitesDe(pre, ciclo);
    if (topes.length) {
      lineas.push('');
      lineas.push('Topes por categoría:');
      topes.forEach((t) => {
        // Un semáforo en texto: se entiende igual en WhatsApp que en la app.
        const marca = t.estado === 'pasado' ? '🔴' : (t.estado === 'aviso' ? '🟡' : '🟢');
        lineas.push(marca + ' ' + t.nombre + ': ' + D.dinero(t.gastado, pre.moneda) +
          ' de ' + D.dinero(t.limite, pre.moneda) + ' (' + t.consumido + ' %)');
      });
    }

    if (cats.length) {
      lineas.push('');
      lineas.push('En qué se fue:');
      cats.slice(0, 8).forEach((c) => {
        lineas.push('· ' + c.emoji + ' ' + c.nombre + ': ' + D.dinero(c.total, pre.moneda) +
          ' (' + D.porcentaje(c.total, r.gastado) + ' %)');
      });
      if (cats.length > 8) lineas.push('· … y ' + (cats.length - 8) + ' categorías más');
    }

    lineas.push('');
    lineas.push(r.numGastos + (r.numGastos === 1 ? ' gasto apuntado' : ' gastos apuntados') +
      ' · al ' + D.fechaMedia(D.hoy()));

    return lineas.join('\n');
  }

  function compartirEstado(pre, ciclo) {
    const texto = textoDelEstado(pre, ciclo);
    const titulo = pre.nombre + ' — ' + (ciclo && ciclo.etiqueta ? ciclo.etiqueta : 'estado');

    // En el móvil esto abre el menú de siempre: WhatsApp, correo, lo que haya.
    if (navigator.share) {
      navigator.share({ title: titulo, text: texto })
        .catch((err) => { if (err && err.name !== 'AbortError') respaldoDeCompartir(texto); });
      return;
    }
    respaldoDeCompartir(texto);
  }

  /* En el ordenador no hay menú de compartir: se copia al portapapeles y se
     ofrecen los dos destinos más habituales. */
  function respaldoDeCompartir(texto) {
    const copiar = navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(texto)
      : Promise.reject();

    copiar.then(() => alert('Copiado. Ya puedes pegarlo donde quieras.'))
      .catch(() => window.prompt('Copia este texto:', texto));
  }

  function enlacesDeCompartir(pre, ciclo) {
    const texto = textoDelEstado(pre, ciclo);
    const asunto = pre.nombre + ' — ' + (ciclo && ciclo.etiqueta ? ciclo.etiqueta : 'estado');
    return {
      whatsapp: 'https://wa.me/?text=' + encodeURIComponent(texto),
      correo: 'mailto:?subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(texto)
    };
  }

  function tarjetaCompartir(pre, ciclo) {
    const enlaces = enlacesDeCompartir(pre, ciclo);
    return el('details.compartir', [
      el('summary', { text: '↗  Compartir cómo va este presupuesto' }),
      el('div.compartir-body', [
        el('p.muted', {
          text: 'Se manda un resumen en texto: presupuesto, gastado, disponible y en qué se fue. ' +
            'No se comparte la lista de gastos uno a uno.'
        }),
        navigator.share ? el('button.btn.btn-primary.btn-block', {
          type: 'button', text: 'Compartir…',
          onclick: () => compartirEstado(pre, ciclo)
        }) : null,
        el('div.form-actions', [
          el('a.btn', { href: enlaces.whatsapp, target: '_blank', rel: 'noopener', text: 'WhatsApp' }),
          el('a.btn', { href: enlaces.correo, text: 'Correo' })
        ]),
        el('button.btn.btn-block', {
          type: 'button', text: 'Copiar el texto',
          onclick: () => respaldoDeCompartir(textoDelEstado(pre, ciclo))
        }),
        el('pre.compartir-vista', { text: textoDelEstado(pre, ciclo) })
      ])
    ]);
  }

  /* ---------- alta y edición de presupuesto --------------------------------- */

  let borradorPre = null;

  function formPresupuesto(id) {
    const editando = !!id;
    const marca = id || 'nuevo';

    if (!borradorPre || borradorPre.__marca !== marca) {
      const base = editando ? Store.presupuesto(id) : null;
      if (editando && !base) {
        return el('div', [header('Presupuesto no encontrado'),
          el('a.btn', { href: '#/presupuestos', text: 'Volver' })]);
      }
      // Copia propia de la lista de cortes y de los topes: si se toman tal
      // cual, editarlos cambiaría el presupuesto guardado aunque luego se
      // pulse Cancelar.
      borradorPre = base ? Object.assign({}, base, {
        cortes: (base.cortes || [1, 16]).slice(),
        limites: Object.assign({}, base.limites || {}),
        montos: Object.assign({}, base.montos || {})
      }) : {
        nombre: '',
        emoji: '💰',
        tipo: 'recurrente',
        periodo: 'quincenal',
        cortes: [1, 16],
        limites: {},
        monto: '',
        moneda: Store.ajustes().monedaPorDefecto,
        inicio: D.hoy(),
        fin: null,
        color: Store.COLORES_PRESUPUESTO[Store.presupuestos(true).length % Store.COLORES_PRESUPUESTO.length],
        archivado: false
      };
      borradorPre.__marca = marca;
    }

    const b = borradorPre;
    const refrescar = () => App.render();

    const inNombre = el('input', {
      type: 'text', value: b.nombre, placeholder: 'Quincena de agosto, Vacaciones en Orlando…',
      oninput: (e) => { b.nombre = e.target.value; }
    });

    const inMonto = el('input.in-amount-sm', {
      type: 'text', inputmode: 'decimal', value: b.monto === '' ? '' : String(b.monto),
      placeholder: '0',
      oninput: (e) => { b.monto = e.target.value; }
    });

    const inInicio = el('input', {
      type: 'date', value: b.inicio,
      onchange: (e) => { b.inicio = e.target.value; }
    });

    const inFin = el('input', {
      type: 'date', value: b.fin || '',
      onchange: (e) => { b.fin = e.target.value || null; }
    });

    return el('div', [
      volver(editando ? '#/presupuesto/' + id : '#/presupuestos'),
      header(editando ? 'Editar presupuesto' : 'Nuevo presupuesto'),

      el('section.card', [
        campo('Nombre', inNombre),

        el('div.field', [
          el('span', { text: 'Icono' }),
          el('div.emoji-grid', EMOJIS_PRESUPUESTO.map((e) => el('button.emoji-btn', {
            type: 'button', text: e,
            class: 'emoji-btn' + (b.emoji === e ? ' is-active' : ''),
            onclick: () => { b.emoji = e; refrescar(); }
          })))
        ]),

        el('div.field', [
          el('span', { text: 'Color' }),
          el('div.color-grid', Store.COLORES_PRESUPUESTO.map((c) => el('button.color-btn', {
            type: 'button', 'aria-label': 'Color ' + c,
            class: 'color-btn' + (b.color === c ? ' is-active' : ''),
            style: { background: c },
            onclick: () => { b.color = c; refrescar(); }
          })))
        ])
      ]),

      el('section.card', [
        el('h2.card-title', { text: '¿Se repite o es de una vez?' }),
        segmentado([
          { valor: 'recurrente', texto: 'Se repite' },
          { valor: 'puntual', texto: 'De una vez' }
        ], b.tipo, (v) => { b.tipo = v; refrescar(); }),

        b.tipo === 'recurrente' ? el('p.hint-box', {
          text: 'Cada periodo empieza con el presupuesto entero otra vez. Es lo que quieres para el salario: cada quincena vuelven a estar disponibles los mismos colones.'
        }) : el('p.hint-box', {
          text: 'Una única bolsa de dinero que se va agotando hasta que se acaba el plan. Es lo que quieres para un viaje o una compra grande.'
        }),

        b.tipo === 'recurrente' ? el('div.field', [
          el('span', { text: 'Cada cuánto' }),
          segmentado([
            { valor: 'quincenal', texto: 'Quincenal' },
            { valor: 'mensual', texto: 'Mensual' },
            { valor: 'semanal', texto: 'Semanal' },
            { valor: 'personalizado', texto: 'A mi manera' }
          ], b.periodo, (v) => { b.periodo = v; refrescar(); })
        ]) : null,

        b.tipo === 'recurrente' && b.periodo === 'quincenal' ? el('p.hint', {
          text: 'La quincena va del 1 al 15 y del 16 al último día del mes, como pagan aquí. Si las tuyas no caen en esos días, usa «A mi manera».'
        }) : null,

        b.tipo === 'recurrente' && b.periodo === 'personalizado' ? cortesEditor(b, refrescar) : null
      ]),

      el('section.card', [
        el('h2.card-title', {
          text: b.tipo === 'recurrente' ? 'Cuánto hay en cada periodo' : 'Cuánto hay en total'
        }),
        el('div.amount-row', [
          segmentado([
            { valor: 'CRC', texto: '₡ Colones' },
            { valor: 'USD', texto: '$ Dólares' }
          ], b.moneda, (v) => { b.moneda = v; refrescar(); }),
          inMonto
        ]),

        // Los periodos que tengan importe propio no se enteran de esto, y hay
        // que decirlo: si no, quien subiera aquí el sueldo pensaría que se lo
        // ha subido a todas las quincenas.
        b.tipo === 'recurrente' && Store.periodosConMontoPropio(b).length
          ? el('p.hint', { text: avisoDeMontosPropios(b) })
          : null,

        // En los que se repiten no se pregunta ninguna fecha: los periodos
        // los marcan el calendario o los días de corte, y hasta dónde se puede
        // retroceder sale del gasto más antiguo que haya.
        b.tipo === 'puntual' ? campo('Fecha de inicio', inInicio) : null,
        b.tipo === 'puntual' ? campo('Fecha de fin (opcional)', inFin,
          'Si la dejas en blanco, el presupuesto no caduca.') : null
      ]),

      limitesEditor(b, refrescar),

      el('div.sticky-save', [
        el('div.form-actions', [
          el('a.btn', { href: editando ? '#/presupuesto/' + id : '#/presupuestos', text: 'Cancelar' }),
          el('button.btn.btn-primary', {
            type: 'button', text: 'Guardar',
            onclick: () => guardarPresupuesto(id)
          })
        ])
      ]),

      editando ? el('section.card', [
        el('h2.card-title', {
          text: Store.presupuesto(id).archivado ? 'Está desactivado' : '¿Ya no lo necesitas?'
        }),
        el('p.muted', {
          text: Store.presupuesto(id).archivado
            ? 'No sale en el Resumen ni cuando eliges presupuesto para un gasto. Sigue entero en el historial.'
            : 'Desactivarlo lo saca del Resumen y de la lista donde eliges presupuesto, pero no borra nada: ' +
              'se queda entero en el historial y puedes volver a activarlo cuando quieras.'
        }),
        el('button.btn.btn-block', {
          type: 'button',
          text: Store.presupuesto(id).archivado ? 'Volver a activarlo' : 'Desactivar este presupuesto',
          onclick: () => {
            const apagado = Store.presupuesto(id).archivado;
            Store.archivar(id, !apagado);
            borradorPre = null;
            location.hash = apagado ? '#/presupuesto/' + id : '#/historial';
          }
        })
      ]) : null,

      editando ? el('details.danger-zone', [
        el('summary', { text: 'Borrar del todo' }),
        el('div.danger-body', [
          el('p.muted', {
            text: 'Esto sí borra. Si lo que quieres es dejar de verlo pero conservar los datos, ' +
              'desactívalo arriba en vez de borrarlo.'
          }),
          el('button.btn.btn-danger', {
            type: 'button', text: 'Borrar presupuesto',
            onclick: () => borrarPresupuesto(id)
          })
        ])
      ]) : null
    ]);
  }

  /* Los días del mes en los que empieza un periodo nuevo.

     Con 3 y 18 salen las quincenas del 3 al 17 y del 18 al 2 del mes que
     viene. Con un solo día salen periodos mensuales que empiezan ahí. Debajo
     se enseña el periodo que tocaría hoy: es la forma más rápida de ver que
     está bien puesto sin tener que guardar nada. */
  function cortesEditor(b, refrescar) {
    const cortes = (b.cortes && b.cortes.length ? b.cortes : [1]).slice();

    const vistaPrevia = Store.cicloDe(
      { tipo: 'recurrente', periodo: 'personalizado', cortes: cortes, inicio: b.inicio },
      D.hoy());

    return el('div.field', [
      el('span', { text: 'Días del mes en los que empieza un periodo' }),

      el('div.cortes', cortes.map((valor, i) => el('div.corte', [
        el('input.corte-num', {
          type: 'number', min: '1', max: '31', value: String(valor),
          'aria-label': 'Día de corte ' + (i + 1),
          onchange: (e) => {
            const n = Math.min(31, Math.max(1, Number(e.target.value) || 1));
            b.cortes = cortes.slice();
            b.cortes[i] = n;
            refrescar();
          }
        }),
        cortes.length > 1 ? el('button.corte-quitar', {
          type: 'button', text: '×', 'aria-label': 'Quitar este corte',
          onclick: () => {
            b.cortes = cortes.filter((x, j) => j !== i);
            refrescar();
          }
        }) : null
      ]))),

      cortes.length < 6 ? el('button.btn.btn-small', {
        type: 'button', text: '+ Añadir otro corte',
        onclick: () => {
          const siguiente = Math.min(31, (Math.max.apply(null, cortes) || 1) + 15);
          b.cortes = cortes.concat([siguiente]);
          refrescar();
        }
      }) : null,

      el('p.hint-box', {
        text: 'Con esto, el periodo de hoy iría del ' + D.fechaMedia(vistaPrevia.inicio) +
          ' al ' + D.fechaMedia(vistaPrevia.fin) + '.'
      }),

      el('small.field-help', {
        text: 'Si un día no existe en algún mes (el 31 en febrero), se usa el último día de ese mes.'
      })
    ]);
  }

  /* Topes por categoría dentro del presupuesto.

     Solo se enseñan las categorías que ya tienen tope, más un desplegable para
     añadir otra: poner las once categorías con su casilla haría la pantalla
     interminable para quien solo quiere limitar los restaurantes. */
  function limitesEditor(b, refrescar) {
    const puestos = Store.categorias().filter((c) => Number(b.limites[c.key]) > 0);
    const libres = Store.categorias().filter((c) => !Number(b.limites[c.key]));
    const porPeriodo = b.tipo === 'recurrente';

    const selNueva = el('select', {}, [el('option', { value: '', text: 'Elige una categoría…' })]
      .concat(libres.map((c) => el('option', { value: c.key, text: c.emoji + '  ' + c.nombre }))));

    return el('section.card', [
      el('h2.card-title', { text: 'Topes por categoría (opcional)' }),
      el('p.muted', {
        text: porPeriodo
          ? 'Un tope propio para lo que quieras vigilar. Vuelve a empezar en cada periodo, igual que el presupuesto: «del 3 al 17 puedo gastar ₡15.000 en restaurantes».'
          : 'Un tope propio para lo que quieras vigilar dentro de este presupuesto.'
      }),

      puestos.length ? el('div.limites-edit', puestos.map((c) => el('div.limite-edit', [
        el('span.limite-edit-cat', { text: c.emoji + ' ' + c.nombre }),
        el('input.in-amount-sm', {
          type: 'text', inputmode: 'decimal',
          value: String(b.limites[c.key]),
          'aria-label': 'Tope de ' + c.nombre,
          onchange: (e) => {
            const v = D.leerImporte(e.target.value);
            if (v === null || v <= 0) delete b.limites[c.key];
            else b.limites[c.key] = v;
            refrescar();
          }
        }),
        el('button.corte-quitar.limite-quitar', {
          type: 'button', text: '×', 'aria-label': 'Quitar el tope de ' + c.nombre,
          onclick: () => { delete b.limites[c.key]; refrescar(); }
        })
      ]))) : el('p.hint', { text: 'Todavía no hay ningún tope. El presupuesto funciona igual sin ellos.' }),

      libres.length ? el('div.limite-nuevo', [
        selNueva,
        el('button.btn.btn-small', {
          type: 'button', text: 'Añadir tope',
          onclick: () => {
            const key = selNueva.value;
            if (!key) { alert('Elige primero una categoría.'); return; }
            // Empieza con una décima parte del presupuesto: un número por el
            // que ir, mejor que un campo vacío. Se cambia encima.
            const total = D.leerImporte(b.monto) || 0;
            b.limites[key] = D.redondear(total ? total * 0.1 : (b.moneda === 'USD' ? 50 : 25000), b.moneda) || 1;
            refrescar();
          }
        })
      ]) : null
    ]);
  }

  /* Se nombran los periodos por su fecha de inicio, que es como se guardan.
     Hasta tres; a partir de ahí sólo el número, o la frase no se acabaría. */
  function avisoDeMontosPropios(b) {
    const propios = Store.periodosConMontoPropio(b);
    const cuantos = propios.length === 1
      ? 'Hay 1 periodo con su propio presupuesto'
      : 'Hay ' + propios.length + ' periodos con su propio presupuesto';
    const cuales = propios.length <= 3
      ? ' (' + propios.map((f) => 'el del ' + D.fechaMedia(f)).join(', ') + ')'
      : '';
    return cuantos + cuales + '. Cambiar el importe de aquí no los toca: ' +
      'siguen con el que les pusiste, hasta que los devuelvas al de siempre.';
  }

  /* Todo lo que es DE UN PERIODO —su importe propio y sus gastos fijos— se
     guarda con la fecha en que empieza ese periodo. Si se cambia cada cuánto se
     repite, o los días de corte, esas fechas dejan de existir y lo guardado se
     queda colgando: pegado a un periodo que ya no empieza ahí. Se borra, pero
     avisando y con la opción de no hacerlo — lo puso alguien a mano.

     Devuelve `true` si hay que borrarlo, `false` si no hay nada que borrar, y
     'cancelado' si se prefiere no guardar nada. */
  function avisoDeCalendario(id) {
    const pre = Store.presupuesto(id);
    const montos = Store.periodosConMontoPropio(pre).length;
    const fijos = Store.periodosConApuntes(pre, 'fijos').length;
    const otros = Store.periodosConApuntes(pre, 'otros').length;
    if (!montos && !fijos && !otros) return false;

    const partes = [];
    if (montos) {
      partes.push(montos === 1 ? 'un periodo con su propio presupuesto'
        : montos + ' periodos con su propio presupuesto');
    }
    if (fijos) {
      partes.push(fijos === 1 ? 'un periodo con gastos fijos apuntados'
        : fijos + ' periodos con gastos fijos apuntados');
    }
    if (otros) {
      partes.push(otros === 1 ? 'un periodo con otros gastos apuntados'
        : otros + ' periodos con otros gastos apuntados');
    }

    return confirm(
      'Vas a cambiar cada cuánto se repite, así que los periodos pasan a empezar en otras ' +
      'fechas. Tienes ' + partes.join(' y ') + ': se quedarían sin sitio, así que se van a ' +
      'perder. ¿Sigo?') ? true : 'cancelado';
  }

  function calendarioTocado(id, datos) {
    const antes = Store.presupuesto(id);
    if (!antes || antes.tipo !== 'recurrente' || datos.tipo !== 'recurrente') return false;
    if (antes.periodo !== datos.periodo) return true;
    return Store.cortesDe(antes).join(',') !== datos.cortes.join(',');
  }

  function guardarPresupuesto(id) {
    const b = borradorPre;
    if (!b.nombre.trim()) { alert('Ponle un nombre al presupuesto.'); return; }
    const monto = D.leerImporte(b.monto);
    if (monto === null || monto <= 0) { alert('Escribe cuánto dinero tiene el presupuesto.'); return; }
    if (!b.inicio) { alert('Falta la fecha de inicio.'); return; }
    if (b.tipo === 'puntual' && b.fin && b.fin < b.inicio) {
      alert('La fecha de fin es anterior a la de inicio.'); return;
    }

    const datos = {
      nombre: b.nombre.trim(),
      emoji: b.emoji,
      color: b.color,
      tipo: b.tipo,
      periodo: b.periodo,
      cortes: Store.cortesDe(b),
      limites: Object.assign({}, b.limites),
      monto: monto,
      moneda: b.moneda,
      inicio: b.inicio,
      fin: b.tipo === 'puntual' ? (b.fin || null) : null
    };

    const limpiar = id && calendarioTocado(id, datos) && avisoDeCalendario(id);
    if (limpiar === 'cancelado') return;

    const guardado = id ? Store.updatePresupuesto(id, datos) : Store.addPresupuesto(datos);
    if (limpiar) {
      Store.olvidarMontosPropios(guardado.id);
      Store.olvidarApuntes(guardado.id, 'fijos');
      Store.olvidarApuntes(guardado.id, 'otros');
    }
    borradorPre = null;
    location.hash = '#/presupuesto/' + guardado.id;
  }

  function borrarPresupuesto(id) {
    const pre = Store.presupuesto(id);
    const impacto = Store.impactoDeBorrar(id);
    let aviso = 'Se borrará «' + pre.nombre + '». Esto no se puede deshacer.';
    if (impacto.solos) {
      aviso = 'Se borrará «' + pre.nombre + '» y sus ' + impacto.solos + ' gastos.' +
        (impacto.compartidos ? ' Otros ' + impacto.compartidos + ' están también en otro presupuesto: esos se quedan.' : '') +
        ' Esto no se puede deshacer.';
    } else if (impacto.compartidos) {
      aviso = 'Se borrará «' + pre.nombre + '». Sus ' + impacto.compartidos +
        ' gastos están también en otro presupuesto, así que no se pierde ninguno.';
    }
    if (!confirm(aviso)) return;
    if (impacto.solos && !confirm('¿Seguro? Los ' + impacto.solos + ' gastos se van con él.')) return;
    Store.deletePresupuesto(id);
    borradorPre = null;
    location.hash = '#/presupuestos';
  }

  /* ---------- alta y edición de gasto --------------------------------------- */

  let borradorGasto = null;

  /* Lo que otra pantalla quiere dejar ya escrito en el próximo gasto nuevo.

     Lo usa la bandeja cuando se apunta a mano un correo que la app no supo
     leer: la fecha del correo y de qué banco venía se saben seguro, así que no
     hay por qué volver a escribirlos. El importe no, porque adivinarlo sería
     peor que dejarlo en blanco.

     Se gasta la primera vez que se usa, para que no reaparezca en el siguiente
     gasto que se apunte por su cuenta. */
  let semillaGasto = null;

  // Se tira el borrador que hubiera: si no, un gasto a medio escribir se
  // quedaría con su marca y la semilla no llegaría a aplicarse nunca.
  function sembrarGasto(datos) { semillaGasto = datos || null; borradorGasto = null; }

  function formGasto(opciones) {
    const id = opciones.id || null;
    const editando = !!id;
    const marca = id || ('nuevo:' + (opciones.presupuestoId || ''));
    const activos = Store.presupuestos();
    const cerrados = Store.presupuestosCerrados();

    if (!activos.length && !cerrados.length) {
      return el('div', [
        header('Apuntar un gasto'),
        vacio('Antes hace falta un presupuesto',
          'Los gastos se descuentan de un presupuesto, así que hay que crear al menos uno.',
          el('a.btn.btn-primary', { href: '#/presupuesto-nuevo', text: 'Crear un presupuesto' }))
      ]);
    }

    if (!borradorGasto || borradorGasto.__marca !== marca) {
      const base = editando ? Store.gasto(id) : null;
      if (editando && !base) {
        return el('div', [header('Gasto no encontrado'),
          el('a.btn', { href: '#/presupuestos', text: 'Volver' })]);
      }
      const preElegido = opciones.presupuestoId && Store.presupuesto(opciones.presupuestoId);
      const porDefecto = preElegido || activos[0] || cerrados[0];

      if (base) {
        const asigs = Store.asignaciones(base);
        borradorGasto = Object.assign({}, base, {
          monto: String(base.monto),
          presupuestos: asigs.map((a) => a.presupuestoId),
          // Si algún trozo no vale el total, es que el gasto está repartido.
          modo: asigs.some((a) => Math.abs(a.monto - base.monto) > 0.005) ? 'repartido' : 'completo',
          repartos: asigs.reduce((m, a) => { m[a.presupuestoId] = String(a.monto); return m; }, {})
        });
      } else {
        borradorGasto = {
          presupuestos: [porDefecto.id],
          modo: 'completo',
          repartos: {},
          monto: '',
          moneda: porDefecto.moneda,
          categoria: 'otros',
          comercio: '',
          nota: '',
          // Si se viene desde un presupuesto ya cerrado, hoy caería fuera de
          // su periodo y el gasto se guardaría sin aparecer en ningún sitio.
          // Se empieza por el último día que sí cuenta ahí.
          fecha: (preElegido && !Store.estaActivo(preElegido))
            ? Store.fechaDeReferencia(preElegido) : D.hoy(),
          tipoCambio: Store.ajustes().tipoCambio
        };

        if (semillaGasto) {
          if (semillaGasto.fecha) borradorGasto.fecha = semillaGasto.fecha;
          if (semillaGasto.nota) borradorGasto.nota = semillaGasto.nota;
          if (semillaGasto.comercio) borradorGasto.comercio = semillaGasto.comercio;
          if (semillaGasto.origenCorreo) borradorGasto.origenCorreo = semillaGasto.origenCorreo;
          semillaGasto = null;
        }
      }
      borradorGasto.__marca = marca;
    }

    const b = borradorGasto;

    /* A los presupuestos cerrados solo se llega a propósito: si el gasto ya
       está en uno, si se vino desde su ficha, o si se pulsa «mostrar los
       cerrados». Así no estorban en el caso normal, pero se puede seguir
       corrigiendo el viaje que ya terminó. */
    const cerradosVisibles = cerrados.filter((p) =>
      b.verCerrados || p.id === opciones.presupuestoId || b.presupuestos.indexOf(p.id) >= 0);
    const ocultos = cerrados.length - cerradosVisibles.length;
    const lista = activos.concat(cerradosVisibles);

    const elegidos = b.presupuestos.map((pid) => Store.presupuesto(pid)).filter(Boolean);
    const pre = elegidos[0] || lista[0];
    const destino = pre.id;
    const refrescar = () => App.render();

    const inMonto = el('input.in-amount', {
      type: 'text', inputmode: 'decimal', value: b.monto === '' ? '' : String(b.monto),
      placeholder: '0', 'aria-label': 'Importe',
      oninput: (e) => { b.monto = e.target.value; actualizarConversion(); }
    });

    /* ---------- los comercios de siempre --------------------------------------

       Esto era un `<datalist>`, que es el desplegable que trae el navegador de
       fábrica. En el móvil resultó inservible: Android lo pinta como una lista
       a pantalla completa que **tapa el teclado**. Se veían todos los
       comercios, sí, pero ya no se podía escribir — justo cuando el comercio
       que hace falta teclear es el que NO está en la lista.

       Ahora la lista la pintamos nosotros, debajo del campo y con tope de seis:
       cabe en la pantalla, deja el teclado a la vista y se va afinando según se
       escribe. Con el campo vacío salen los seis que más se repiten, que es
       casi siempre lo que se busca.

       Se repinta a mano, sin `App.render()`: rehacer la pantalla en mitad de
       una palabra deja el campo sin foco y en el móvil cierra el teclado. Es la
       misma razón por la que el total de los gastos fijos se pinta aparte. */
    const TOPE_SUGERENCIAS = 6;

    // Por veces usado, no por orden alfabético: lo que se repite es lo que se
    // va a volver a comprar.
    const usos = {};
    Store.gastos().forEach((g) => {
      if (g.comercio) usos[g.comercio] = (usos[g.comercio] || 0) + 1;
    });
    const comercios = Object.keys(usos)
      .sort((uno, otro) => (usos[otro] - usos[uno]) || uno.localeCompare(otro));

    // Se compara sin tildes y en minúsculas (`sinTildes`, arriba del todo),
    // para que «Cafetería» aparezca escribiendo «cafeteria».

    const sugerencias = el('div.sugerencias');
    sugerencias.hidden = true;

    const inComercio = el('input', {
      type: 'text', value: b.comercio, placeholder: 'Automercado, Soda La Casona…',
      autocomplete: 'off',
      oninput: (e) => { b.comercio = e.target.value; pintarSugerencias(); },
      onfocus: () => pintarSugerencias(),
      // Si se tapa con un clic fuera, la lista sobra. Al elegir una no salta:
      // el `preventDefault` de abajo impide que el campo pierda el foco.
      onblur: () => { sugerencias.hidden = true; }
    });

    function pintarSugerencias() {
      const escrito = sinTildes(inComercio.value);
      const utiles = comercios
        .filter((c) => !escrito || sinTildes(c).indexOf(escrito) >= 0)
        // Uno ya escrito entero no es una sugerencia, es lo que hay.
        .filter((c) => sinTildes(c) !== escrito)
        .slice(0, TOPE_SUGERENCIAS);

      sugerencias.innerHTML = '';
      if (!utiles.length) { sugerencias.hidden = true; return; }

      utiles.forEach((c) => {
        const fila = el('button.sugerencia', { type: 'button', text: c });
        fila.addEventListener('mousedown', (ev) => {
          // Sin esto el campo pierde el foco antes de que llegue el toque, y en
          // el móvil se cierra el teclado justo cuando aún se puede corregir.
          ev.preventDefault();
          inComercio.value = c;
          b.comercio = c;
          pintarSugerencias();
        });
        sugerencias.appendChild(fila);
      });
      sugerencias.hidden = false;
    }

    const inNota = el('input.note-input', {
      type: 'text', value: b.nota, placeholder: 'Opcional',
      oninput: (e) => { b.nota = e.target.value; }
    });

    const inFecha = el('input', {
      type: 'date', value: b.fecha,
      onchange: (e) => { b.fecha = e.target.value || D.hoy(); refrescar(); }
    });

    const inCambio = el('input', {
      type: 'text', inputmode: 'decimal', value: String(b.tipoCambio || Store.ajustes().tipoCambio),
      oninput: (e) => { b.tipoCambio = e.target.value; actualizarConversion(); }
    });

    const conversion = el('p.conversion');
    const sobrante = el('p.conversion');

    /* Un aviso por cada presupuesto que esté en otra moneda que el gasto. Con
       varios presupuestos elegidos pueden ser dos a la vez. */
    function actualizarConversion() {
      const monto = D.leerImporte(b.monto) || 0;
      const tc = D.leerImporte(b.tipoCambio) || Store.ajustes().tipoCambio;
      const otras = elegidos.filter((p) => p.moneda !== b.moneda);
      if (!otras.length || !monto) { conversion.textContent = ''; conversion.hidden = true; return; }
      conversion.hidden = false;
      conversion.textContent = otras.map((p) => {
        const trozo = b.modo === 'repartido' && elegidos.length > 1
          ? (D.leerImporte(b.repartos[p.id]) || 0) : monto;
        return 'En «' + p.nombre + '» contará como ' +
          D.dinero(Store.convertir(trozo, b.moneda, p.moneda, tc), p.moneda) + '.';
      }).join(' ');
    }

    /* Cuando se reparte a mano, decir cuánto falta o cuánto sobra. Sin esto es
       fácil dejarse colones por el camino sin enterarse. */
    function actualizarSobrante() {
      if (elegidos.length < 2 || b.modo !== 'repartido') { sobrante.hidden = true; return; }
      const monto = D.leerImporte(b.monto) || 0;
      const suma = elegidos.reduce((s, p) => s + (D.leerImporte(b.repartos[p.id]) || 0), 0);
      const resto = D.redondear(monto - suma, b.moneda);
      sobrante.hidden = false;
      if (Math.abs(resto) < 0.005) {
        sobrante.className = 'conversion is-ok';
        sobrante.textContent = 'Repartido del todo.';
      } else if (resto > 0) {
        sobrante.className = 'conversion';
        sobrante.textContent = 'Falta repartir ' + D.dinero(resto, b.moneda) + '.';
      } else {
        sobrante.className = 'conversion is-error';
        sobrante.textContent = 'Te has pasado ' + D.dinero(Math.abs(resto), b.moneda) + ' del total.';
      }
    }

    const vista = el('div', [
      volver(editando ? '#/presupuesto/' + destino : '#/resumen'),
      header(editando ? 'Editar gasto' : 'Apuntar un gasto'),

      el('section.card', [
        el('div.amount-box', [
          segmentado([
            { valor: 'CRC', texto: '₡' },
            { valor: 'USD', texto: '$' }
          ], b.moneda, (v) => { b.moneda = v; refrescar(); }),
          inMonto
        ]),
        elegidos.some((p) => p.moneda !== b.moneda)
          ? campo('Tipo de cambio (colones por dólar)', inCambio,
            'Se guarda con este gasto: si mañana cambias el tipo en Ajustes, este no se mueve.')
          : null,
        conversion
      ]),

      /* Segundo el comercio, la fecha y la nota: es lo que se está leyendo en
         el tiquete o en el aviso del banco, y lo único que hay que teclear.
         Detrás van las dos tarjetas que se contestan a toques —de qué
         presupuesto sale y de qué categoría es—, y la categoría la última
         porque es la que la app ya trae puesta. */
      el('section.card', [
        campo('Comercio', inComercio),
        sugerencias,
        campo('Fecha', inFecha),
        avisoDeFechaFuera(b, elegidos),
        b.fecha !== D.hoy() ? el('p.date-warning', [
          'Este gasto se apuntará el ' + D.fechaLarga(b.fecha) + '. ',
          el('button.link-today', {
            type: 'button', text: 'Volver a hoy',
            onclick: () => { b.fecha = D.hoy(); refrescar(); }
          })
        ]) : null,
        campo('Nota', inNota)
      ]),

      el('section.card', [
        el('h2.card-title', { text: '¿De qué presupuestos sale?' }),
        el('div.pre-chips', lista.map((p) => {
          const activo = b.presupuestos.indexOf(p.id) >= 0;
          return el('button.pre-chip', {
            type: 'button',
            class: 'pre-chip' + (activo ? ' is-active' : ''),
            'aria-pressed': activo ? 'true' : 'false',
            style: activo ? { borderColor: p.color, background: p.color + '22' } : null,
            onclick: () => {
              if (activo) {
                // Nunca dejar el gasto sin ningún presupuesto.
                if (b.presupuestos.length === 1) return;
                b.presupuestos = b.presupuestos.filter((x) => x !== p.id);
              } else {
                b.presupuestos = b.presupuestos.concat([p.id]);
                if (!editando && b.presupuestos.length === 1) b.moneda = p.moneda;
                if (!b.repartos[p.id]) b.repartos[p.id] = '';
              }
              refrescar();
            }
          }, [
            el('span.pre-chip-marca', { text: activo ? '✓' : '+' }),
            el('span', { text: (p.emoji || '💰') + ' ' + p.nombre }),
            Store.estaActivo(p) ? null : el('span.pre-chip-cerrado', { text: 'cerrado' })
          ]);
        })),

        ocultos ? el('button.link-soft.link-boton', {
          type: 'button',
          text: '+ Mostrar los ' + ocultos + (ocultos === 1 ? ' cerrado' : ' cerrados'),
          onclick: () => { b.verCerrados = true; refrescar(); }
        }) : null,

        elegidos.length > 1 ? el('div.field', [
          el('span', { text: '¿Cómo cuenta en cada uno?' }),
          segmentado([
            { valor: 'completo', texto: 'Completo en cada uno' },
            { valor: 'repartido', texto: 'Repartir el importe' }
          ], b.modo, (v) => { b.modo = v; refrescar(); })
        ]) : null,

        elegidos.length > 1 && b.modo === 'completo' ? el('p.hint-box', {
          text: 'El importe entero se descuenta de los ' + elegidos.length + ' presupuestos. ' +
            'Es lo que quieres cuando el mismo gasto tiene que aparecer en los dos sitios. ' +
            'En los totales generales sigue contando una sola vez.'
        }) : null,

        elegidos.length > 1 && b.modo === 'repartido' ? el('div.repartos', [
          el('p.hint-box', { text: 'Di cuánto le toca a cada uno. La suma tiene que dar el importe total.' }),
          el('div.reparto-lista', elegidos.map((p) => el('label.reparto-fila', [
            el('span.reparto-nombre', { text: (p.emoji || '💰') + ' ' + p.nombre }),
            el('input.in-amount-sm', {
              type: 'text', inputmode: 'decimal',
              value: b.repartos[p.id] || '',
              placeholder: '0',
              oninput: (e) => {
                b.repartos[p.id] = e.target.value;
                actualizarSobrante();
                actualizarConversion();
              }
            })
          ]))),
          el('button.btn.btn-small', {
            type: 'button', text: 'Repartir a partes iguales',
            onclick: () => {
              const monto = D.leerImporte(b.monto) || 0;
              const trozo = D.redondear(monto / elegidos.length, b.moneda);
              elegidos.forEach((p, i) => {
                // Al último se le da el resto, para que la suma cuadre exacta.
                b.repartos[p.id] = String(i === elegidos.length - 1
                  ? D.redondear(monto - trozo * (elegidos.length - 1), b.moneda)
                  : trozo);
              });
              refrescar();
            }
          }),
          sobrante
        ]) : null
      ]),

      el('section.card', [
        el('div.card-head', [
          el('h2.card-title', { text: 'Categoría' }),
          el('a.link-soft', { href: '#/categorias', text: 'Gestionar' })
        ]),
        el('div.cat-grid', Store.categorias().map((c) => el('button.cat-btn', {
          type: 'button',
          class: 'cat-btn' + (c.key === b.categoria ? ' is-active' : ''),
          style: c.key === b.categoria ? { borderColor: c.color, background: c.color + '22' } : null,
          onclick: () => { b.categoria = c.key; refrescar(); }
        }, [
          el('span.cat-btn-emoji', { text: c.emoji }),
          el('span.cat-btn-name', { text: c.nombre })
        ]))),
        avisoDeTope(b, elegidos, editando ? id : null)
      ]),

      el('div.sticky-save', [
        el('div.form-actions', [
          el('a.btn', {
            href: editando ? '#/presupuesto/' + destino : '#/resumen', text: 'Cancelar'
          }),
          el('button.btn.btn-primary', {
            type: 'button', text: 'Guardar',
            onclick: () => guardarGasto(id)
          })
        ])
      ]),

      editando ? el('button.btn.btn-danger.btn-block', {
        type: 'button', text: 'Borrar este gasto',
        onclick: () => {
          if (!confirm('¿Borrar este gasto?')) return;
          Store.deleteGasto(id);
          borradorGasto = null;
          location.hash = '#/presupuesto/' + destino;
        }
      }) : null
    ]);

    actualizarConversion();
    actualizarSobrante();
    return vista;
  }

  /* Un gasto fechado fuera del rango de su presupuesto se guarda, pero no
     aparece en ningún periodo de ese presupuesto: queda invisible. Pasa sobre
     todo con los cerrados —hoy cae fuera de un viaje que terminó en julio— y
     antes se guardaba sin decir nada. Ahora se avisa y se ofrece la fecha
     buena de un toque. */
  function avisoDeFechaFuera(b, elegidos, alCambiar) {
    /* Sólo los presupuestos de una vez tienen un rango fijo del que un gasto
       pueda salirse: fuera de `inicio…fin` no cuenta y punto.

       En los que se repiten no hay nada de qué avisar. Los periodos los marcan
       el calendario o los días de corte, así que cualquier fecha cae en alguno,
       y hasta dónde se puede retroceder sale del propio gasto más antiguo: al
       apuntar uno de julio, julio se vuelve visitable solo. */
    const fuera = elegidos.filter((p) => {
      if (p.tipo === 'recurrente') return false;
      if (p.inicio && b.fecha < p.inicio) return true;
      return !!(p.fin && b.fecha > p.fin);
    });
    if (!fuera.length) return null;

    const p = fuera[0];
    const arreglo = (p.fin && b.fecha > p.fin) ? p.fin : p.inicio;

    return el('p.date-warning.is-fuera', [
      'Esta fecha queda fuera de «' + p.nombre + '», que ' +
      (p.fin ? 'va del ' + D.fechaMedia(p.inicio) + ' al ' + D.fechaMedia(p.fin)
        : 'empieza el ' + D.fechaMedia(p.inicio)) +
      '. El gasto se guardaría pero no contaría ahí. ',
      el('button.link-today', {
        type: 'button', text: 'Usar el ' + D.fechaMedia(arreglo),
        onclick: () => { b.fecha = arreglo; (alCambiar || App.render)(); }
      }),
      fuera.length > 1 ? el('span', { text: ' (y otros ' + (fuera.length - 1) + ' igual)' }) : null
    ]);
  }

  /* Si la categoría elegida tiene tope en alguno de los presupuestos marcados,
     decirlo aquí mismo, contando ya este gasto. Enterarse después de guardar
     no sirve de nada: la gracia es saberlo antes de gastar.

     Al editar un gasto que ya está apuntado hay que descontarlo de lo gastado,
     o se contaría dos veces. */
  function avisoDeTope(b, elegidos, idEditando) {
    const monto = D.leerImporte(b.monto) || 0;
    const avisos = [];

    elegidos.forEach((p) => {
      const ciclo = Store.cicloDe(p, b.fecha);
      const tope = Store.limiteDe(p, b.categoria, ciclo);
      if (!tope) return;

      const trozo = (elegidos.length > 1 && b.modo === 'repartido')
        ? (D.leerImporte(b.repartos[p.id]) || 0) : monto;
      const suma = Store.convertir(trozo, b.moneda, p.moneda, D.leerImporte(b.tipoCambio));

      let yaContado = 0;
      if (idEditando) {
        const viejo = Store.gasto(idEditando);
        if (viejo && viejo.categoria === b.categoria && Store.enCiclo(viejo, ciclo)) {
          yaContado = Store.montoAsignadoEn(viejo, p.id, p.moneda);
        }
      }

      const total = D.redondear(tope.gastado - yaContado + suma, p.moneda);
      const estado = Store.estadoDeTope(total, tope.limite);
      const sobra = D.redondear(total - tope.limite, p.moneda);

      avisos.push({
        estado: estado,
        texto: estado === 'pasado'
          ? 'Con esto pasas el tope de ' + tope.nombre + ' en «' + p.nombre + '»: ' +
            D.dinero(total, p.moneda) + ' de ' + D.dinero(tope.limite, p.moneda) +
            (sobra > 0 ? ' (' + D.dinero(sobra, p.moneda) + ' de más).' : '.')
          : 'Tope de ' + tope.nombre + ' en «' + p.nombre + '»: ' +
            D.dinero(total, p.moneda) + ' de ' + D.dinero(tope.limite, p.moneda) +
            ' · quedarían ' + D.dinero(D.redondear(tope.limite - total, p.moneda), p.moneda) + '.'
      });
    });

    if (!avisos.length) return null;

    return el('div.topes-aviso', avisos.map((a) => el('p.tope-linea', {
      class: 'tope-linea is-' + a.estado, text: a.texto
    })));
  }

  function guardarGasto(id) {
    const b = borradorGasto;
    const monto = D.leerImporte(b.monto);
    if (monto === null || monto <= 0) { alert('Escribe cuánto costó.'); return; }
    if (!b.presupuestos.length) { alert('Elige de qué presupuesto sale.'); return; }

    let asignaciones;
    if (b.presupuestos.length === 1 || b.modo === 'completo') {
      asignaciones = b.presupuestos.map((pid) => ({ presupuestoId: pid, monto: monto }));
    } else {
      asignaciones = b.presupuestos.map((pid) => ({
        presupuestoId: pid, monto: D.leerImporte(b.repartos[pid]) || 0
      }));
      const suma = asignaciones.reduce((s, a) => s + a.monto, 0);
      const resto = D.redondear(monto - suma, b.moneda);
      if (Math.abs(resto) >= 0.005) {
        alert(resto > 0
          ? 'Falta repartir ' + D.dinero(resto, b.moneda) + '. La suma tiene que dar el importe total.'
          : 'El reparto se pasa ' + D.dinero(Math.abs(resto), b.moneda) + ' del importe total.');
        return;
      }
    }

    const datos = {
      asignaciones: asignaciones,
      monto: monto,
      moneda: b.moneda,
      categoria: b.categoria,
      comercio: b.comercio.trim(),
      nota: b.nota.trim(),
      fecha: b.fecha,
      tipoCambio: D.leerImporte(b.tipoCambio) || Store.ajustes().tipoCambio
    };

    /* La hora, sólo cuando se puede saber de verdad.

       Si el gasto es de HOY, es ahora: se apunta la compra al hacerla, y de eso
       depende que la lista del día salga en orden. Si es de un día pasado, no
       hay forma de saberlo, así que se deja en blanco y ese gasto se ordena
       después de los que sí tienen hora, que es la verdad.

       Antes aquí se falseaba `ts` con la fecha elegida a mediodía. Eso dejaba
       empatados todos los gastos de un mismo día y la lista salía en el orden
       en que se escribieron. Ya no hace falta: el día lo lleva `fecha`. */
    if (!id) datos.hora = (b.fecha === D.hoy()) ? D.horaAhora() : '';

    const destino = b.presupuestos[0];
    if (id) Store.updateGasto(id, datos); else Store.addGasto(datos);

    // Si esto venía de un correo que la app no supo leer, ya está resuelto: se
    // saca de esa lista para que no siga pidiendo que se decida algo.
    if (!id && b.origenCorreo) Store.cerrarNoReconocido(b.origenCorreo);

    borradorGasto = null;
    location.hash = '#/presupuesto/' + destino;
  }

  /* ---------- categorías ---------------------------------------------------- */

  let nuevaCategoria = null;

  function categoriasView() {
    if (!nuevaCategoria) nuevaCategoria = { nombre: '', emoji: '🏷️', color: '#94A3B8' };
    const b = nuevaCategoria;
    const refrescar = () => App.render();

    const inNombre = el('input', {
      type: 'text', value: b.nombre, placeholder: 'Peluquería, Mascotas…',
      oninput: (e) => { b.nombre = e.target.value; }
    });

    const usos = {};
    Store.gastos().forEach((g) => { usos[g.categoria] = (usos[g.categoria] || 0) + 1; });

    return el('div', [
      volver('#/ajustes', 'Ajustes'),
      header('Categorías', 'La etiqueta que se le pone a cada compra'),

      el('section.card', [
        el('h2.card-title', { text: 'Añadir una' }),
        campo('Nombre', inNombre),
        el('div.field', [
          el('span', { text: 'Icono' }),
          el('div.emoji-grid', EMOJIS_CATEGORIA.map((e) => el('button.emoji-btn', {
            type: 'button', text: e,
            class: 'emoji-btn' + (b.emoji === e ? ' is-active' : ''),
            onclick: () => { b.emoji = e; refrescar(); }
          })))
        ]),
        el('div.field', [
          el('span', { text: 'Color' }),
          el('div.color-grid', Store.COLORES_PRESUPUESTO.concat(['#F472B6', '#94A3B8']).map((c) =>
            el('button.color-btn', {
              type: 'button', 'aria-label': 'Color ' + c,
              class: 'color-btn' + (b.color === c ? ' is-active' : ''),
              style: { background: c },
              onclick: () => { b.color = c; refrescar(); }
            })))
        ]),
        el('button.btn.btn-primary', {
          type: 'button', text: 'Añadir categoría',
          onclick: () => {
            if (!b.nombre.trim()) { alert('Ponle un nombre a la categoría.'); return; }
            Store.addCategoria(b.nombre, b.emoji, b.color);
            nuevaCategoria = null;
            App.render();
          }
        })
      ]),

      el('section.card', [
        el('h2.card-title', { text: 'Las que ya tienes' }),
        el('ul.cat-manage', Store.categorias().map((c) => el('li.cat-manage-row', [
          el('span.cat-emoji', { text: c.emoji }),
          el('span.cat-name', { text: c.nombre }),
          el('span.ref', { text: (usos[c.key] || 0) + ' gastos' }),
          c.key === 'otros' ? el('span.ref', { text: 'fija' }) : el('button.link-danger', {
            type: 'button', text: 'Borrar',
            onclick: () => {
              const n = usos[c.key] || 0;
              const aviso = n
                ? 'Se borrará «' + c.nombre + '». Sus ' + n + ' gastos pasarán a Otros.'
                : 'Se borrará «' + c.nombre + '».';
              if (!confirm(aviso)) return;
              Store.deleteCategoria(c.key);
              App.render();
            }
          })
        ])))
      ])
    ]);
  }

  /* ---------- ajustes ------------------------------------------------------- */

  function ajustes() {
    const a = Store.ajustes();
    const s = Store.stats();

    const inCambio = el('input', {
      type: 'text', inputmode: 'decimal', value: String(a.tipoCambio),
      onchange: (e) => {
        const v = D.leerImporte(e.target.value);
        if (v === null || v <= 0) { alert('El tipo de cambio tiene que ser un número mayor que cero.'); return; }
        Store.setAjustes({ tipoCambio: v, tipoCambioAlDia: D.hoy() });
        App.render();
      }
    });

    const inArchivo = el('input', {
      type: 'file', accept: '.json,application/json',
      onchange: (e) => {
        const archivo = e.target.files && e.target.files[0];
        if (!archivo) return;
        const lector = new FileReader();
        lector.onload = () => {
          try {
            Store.importAll(String(lector.result));
            alert('Copia restaurada.');
            location.hash = '#/resumen';
            App.render();
          } catch (err) {
            alert('No se ha podido leer el archivo: ' + err.message);
          }
        };
        lector.readAsText(archivo);
      }
    });

    return el('div', [
      header('Ajustes'),

      el('section.card', [
        el('h2.card-title', { text: 'Moneda' }),
        el('div.field', [
          el('span', { text: 'Moneda por defecto de los presupuestos nuevos' }),
          segmentado([
            { valor: 'CRC', texto: '₡ Colones' },
            { valor: 'USD', texto: '$ Dólares' }
          ], a.monedaPorDefecto, (v) => { Store.setAjustes({ monedaPorDefecto: v }); App.render(); })
        ]),
        campo('Tipo de cambio (colones por dólar)', inCambio,
          a.tipoCambioAlDia ? 'Lo actualizaste el ' + D.fecha(a.tipoCambioAlDia) + '. Sólo afecta a los gastos nuevos.'
            : 'Sólo se usa cuando el gasto y el presupuesto están en monedas distintas.')
      ]),

      el('section.card', [
        el('h2.card-title', { text: 'Categorías' }),
        el('p.muted', { text: s.categorias + ' categorías. Puedes añadir las tuyas.' }),
        el('a.btn', { href: '#/categorias', text: 'Gestionar categorías' })
      ]),

      el('section.card', [
        el('h2.card-title', { text: 'Copia de seguridad' }),
        el('p.muted', {
          text: 'Los datos viven sólo en este teléfono. Si lo cambias o borras la app, se van con ella: guarda una copia de vez en cuando.'
        }),
        el('button.btn', { type: 'button', text: 'Descargar copia', onclick: descargarCopia }),
        el('div.field', [
          el('span', { text: 'Restaurar una copia (sustituye todo lo que hay ahora)' }),
          inArchivo
        ])
      ]),

      el('section.card', [
        el('h2.card-title', { text: 'Qué hay guardado' }),
        el('dl.facts', [
          el('div.fact', [el('dt', { text: 'Presupuestos' }), el('dd', { text: String(s.presupuestos) })]),
          el('div.fact', [el('dt', { text: 'Gastos' }), el('dd', { text: String(s.gastos) })]),
          el('div.fact', [el('dt', { text: 'Ocupan' }), el('dd', { text: s.sizeKb + ' KB' })])
        ]),
        el('details.danger-zone', [
          el('summary', { text: 'Empezar de cero' }),
          el('div.danger-body', [
            el('p.muted', { text: 'Borra todos los presupuestos, gastos y categorías propias. No se puede deshacer.' }),
            el('button.btn.btn-danger', {
              type: 'button', text: 'Borrarlo todo',
              onclick: () => {
                if (!confirm('Se borrarán todos los presupuestos y gastos.')) return;
                if (!confirm('¿Seguro del todo? Esto no se puede deshacer.')) return;
                Store.clearAll();
                location.hash = '#/resumen';
                App.render();
              }
            })
          ])
        ])
      ]),

      gmailAjustes(),

      pieDeVersion()
    ]);
  }

  /* ---------- qué versión se está usando -------------------------------------

     No se enseña una versión escrita a mano en el código, sino **la que el
     teléfono tiene guardada de verdad**: el nombre de la caja donde el modo sin
     conexión guarda los archivos es exactamente `controlgastos-vNN`.

     La diferencia importa, y es justo la pregunta que se quiere responder aquí.
     Una constante en el código diría la versión del archivo que se está
     leyendo; esto dice la que está instalada. Cuando uno se pregunta «¿tengo ya
     la versión nueva?», lo que quiere saber es lo segundo.

     Si no hay modo sin conexión —servidor local, o el navegador no lo permite—
     se lee el número del propio `sw.js`, que es donde vive. Nunca se inventa.
  --------------------------------------------------------------------------- */

  function pieDeVersion() {
    const linea = el('span.version-num', { text: 'comprobando…' });
    const nota = el('span.version-nota');
    const boton = el('button.link-boton', {
      type: 'button', text: 'Buscar una versión nueva',
      onclick: () => buscarVersionNueva(boton)
    });

    versionInstalada().then((v) => {
      linea.textContent = v.version || 'desconocida';
      nota.textContent = v.deLaCaja
        ? 'instalada en este teléfono · funciona sin conexión'
        : 'servida por la web · sin copia guardada todavía';
    }).catch(() => {
      linea.textContent = 'desconocida';
      nota.textContent = 'no se ha podido comprobar';
    });

    return el('section.card.pie-version', [
      el('h2.card-title', { text: 'Versión' }),
      el('p.version-linea', [
        el('strong', { text: 'Control de Gastos ' }),
        linea
      ]),
      nota,
      boton
    ]);
  }

  function versionInstalada() {
    const deSw = () => fetch('sw.js', { cache: 'no-store' })
      .then((r) => r.text())
      .then((t) => {
        const m = t.match(/VERSION\s*=\s*'([^']+)'/);
        return { version: m ? m[1].replace(/^controlgastos-/, '') : null, deLaCaja: false };
      });

    if (!('caches' in window)) return deSw();

    return caches.keys().then((nombres) => {
      // Durante una actualización pueden convivir dos: manda la más alta.
      const mias = nombres.filter((n) => n.indexOf('controlgastos-') === 0).sort(porNumero);
      if (!mias.length) return deSw();
      return { version: mias[mias.length - 1].replace(/^controlgastos-/, ''), deLaCaja: true };
    }).catch(deSw);
  }

  // 'controlgastos-v9' va ANTES que 'controlgastos-v22': comparados como texto
  // saldría al revés y se enseñaría la vieja.
  function porNumero(a, b) {
    const n = (s) => Number((s.match(/(\d+)\s*$/) || [0, 0])[1]);
    return n(a) - n(b);
  }

  /* Le pide al navegador que mire si hay una versión nueva, en vez de tener que
     cerrar la app del todo y volver a abrirla —que es lo que había que hacer
     antes y no es evidente que haga falta—. */
  function buscarVersionNueva(boton) {
    if (!('serviceWorker' in navigator)) {
      location.reload();
      return;
    }
    boton.textContent = 'Buscando…';
    boton.disabled = true;

    navigator.serviceWorker.getRegistration()
      .then((reg) => (reg ? reg.update() : null))
      .then(() => {
        boton.textContent = 'Recargando…';
        // Un respiro para que termine de guardarse lo que se haya bajado.
        setTimeout(() => location.reload(true), 800);
      })
      .catch(() => {
        boton.textContent = 'No se ha podido comprobar. Prueba a cerrar la app y abrirla.';
        boton.disabled = false;
      });
  }

  /* ---------- ajustes de Gmail ---------------------------------------------- */

  /* Un identificador mal pegado no da la cara hasta que Google contesta
     «Error 401: invalid_client» en una pantalla suya, que no explica nada y
     deja a uno sin saber qué mirar. Pegar esto en el móvil es fácil de fallar
     —son sesenta y pico caracteres— así que se revisa aquí mismo la forma y se
     dice qué falla en concreto.

     No impide guardarlo: si algún día Google cambia el formato, más vale un
     aviso que se pueda ignorar que un campo que no deje escribir. */
  const FORMA_CLIENT_ID = /^\d+-[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com$/;

  function avisoDelClientId(valor) {
    const v = (valor || '').trim();
    if (!v || FORMA_CLIENT_ID.test(v)) return null;

    let motivo;
    if (/^GOCSPX-/i.test(v)) {
      motivo = 'Eso es el «Client secret», no el «Client ID». Hace falta el otro, el largo que ' +
        'acaba en .apps.googleusercontent.com — el secret esta app no lo usa.';
    } else if (v.indexOf('.apps.googleusercontent.com') < 0) {
      motivo = 'Un identificador de Google acaba siempre en «.apps.googleusercontent.com», y éste no. ' +
        'Lo más probable es que la copia se cortara: vuelve a copiarlo entero desde Google Cloud.';
    } else if (/\s/.test(v)) {
      motivo = 'Se ha colado un espacio o un salto de línea. Cópialo otra vez.';
    } else {
      motivo = 'Esto no tiene la forma de un identificador de Google, que son unos números, un guion, ' +
        'letras y «.apps.googleusercontent.com» al final.';
    }

    return el('p.revision-estado.is-error', {
      text: motivo + ' (Ahora hay ' + v.length + ' caracteres; suelen ser unos 70.)'
    });
  }

  function gmailAjustes() {
    const g = Store.gmail();
    const pendientes = Store.pendientes().length;

    const inClientId = el('input', {
      type: 'text', value: g.clientId || '',
      placeholder: '000000000000-xxxxxxxx.apps.googleusercontent.com',
      autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
      // Se guarda mientras se escribe, pero la pantalla no se redibuja hasta
      // salir del campo: redibujar en cada tecla le quitaría el foco al campo
      // a media escritura. Así, pegar el código lo guarda de inmediato aunque
      // todavía no se vean los botones.
      oninput: (e) => { Store.setGmail({ clientId: e.target.value.trim() }); },
      onchange: () => App.render()
    });

    const inDias = el('input', {
      type: 'number', min: '1', max: '365', value: String(g.diasAtras || 30),
      onchange: (e) => {
        const v = Math.min(365, Math.max(1, Number(e.target.value) || 30));
        Store.setGmail({ diasAtras: v });
        App.render();
      }
    });

    const inRemitentes = el('textarea', {
      rows: '4', spellcheck: 'false', autocapitalize: 'off',
      value: Store.remitentes().join('\n'),
      onchange: (e) => {
        const lista = e.target.value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
        Store.setGmail({ remitentes: lista });
        App.render();
      }
    });

    /* Va dentro de un desplegable cerrado, y no es un capricho de orden: esta
       app la va a usar gente que no tiene nada que ver con Gmail ni con los
       tres bancos de la lista. Para ellos esto es ruido, y un botón que hable
       de leer correo asusta más que ayuda.

       Sin Client ID la app NO PUEDE hablar con Google: no pide permiso, no
       aparece la bandeja y no hay ninguna petición a ningún sitio. Es una app
       de gastos a mano y ya está. El identificador se guarda en el navegador
       de cada uno, nunca en el código, así que al publicarla no viaja. */
    return el('details.avanzado', { open: !!g.clientId }, [
      el('summary', [
        el('span.avanzado-titulo', { text: 'Leer los correos del banco' }),
        el('span.avanzado-nota', { text: g.clientId ? 'conectado' : 'opcional · apagado' })
      ]),
      el('div.avanzado-body', [
        el('p.muted', {
          text: 'La app puede leer los correos de compra de tu banco y proponerte el gasto ya rellenado. ' +
            'Pide permiso de solo lectura, busca únicamente los remitentes de la lista, y nada se apunta sin que lo confirmes.'
        }),
        el('p.muted', {
          text: 'Funciona con BAC Credomatic, Davivienda y Promerica, y necesita un identificador de Google ' +
            'que tienes que crear tú en tu propia cuenta. Mientras no lo pongas, la app no habla con Google en ningún momento.'
        }),

        el('a.link-guia', {
          href: GUIA_GMAIL,
          target: '_blank',
          rel: 'noopener noreferrer'
        }, [
          el('span.link-guia-texto', [
            el('strong', { text: 'Cómo conectarlo, paso a paso' }),
            el('span', { text: 'Diez minutos, gratis, se hace una sola vez' })
          ]),
          el('span.link-guia-flecha', { text: '↗', 'aria-hidden': 'true' })
        ]),

        campo('Identificador de Google (Client ID)', inClientId,
          g.clientId
            ? 'Guardado, ' + g.clientId.length + ' caracteres. Si lo cambias, se guarda solo.'
            : 'Pega aquí el código que acaba en .apps.googleusercontent.com. Se saca una vez desde Google Cloud.'),

        avisoDelClientId(g.clientId),

        g.clientId ? el('div.field', [
          el('span', { text: '¿Revisar el correo sola al abrir la app?' }),
          segmentado([
            { valor: 'cada6h', texto: 'Cada 6 h' },
            { valor: 'siempre', texto: 'Siempre' },
            { valor: 'nunca', texto: 'Nunca' }
          ], g.revisarAlAbrir || 'cada6h', (v) => { Store.setGmail({ revisarAlAbrir: v }); App.render(); }),
          el('small.field-help', {
            text: g.revisarAlAbrir === 'nunca'
              ? 'Solo se revisará cuando pulses el botón.'
              : (g.revisarAlAbrir === 'siempre'
                ? 'Revisa cada vez que abres la app. Gasta algo más de datos.'
                : 'Revisa al abrir la app, pero como mucho una vez cada seis horas. ' +
                  'Solo pide los correos nuevos desde la última vez, así que casi no gasta datos.')
          })
        ]) : null,

        // Una revisión automática que falla no interrumpe con ningún aviso. Si
        // no se dijera aquí, podría dejar de funcionar durante meses sin que
        // nadie se enterara.
        g.clientId && g.ultimoFallo ? el('p.revision-estado.is-error', {
          text: 'La última revisión automática no salió: ' + g.ultimoFallo
        }) : null,

        g.clientId && g.ultimaRevision ? el('p.hint', {
          text: 'Última revisión: ' + Gmail.cuandoFue(g.ultimaRevision) + '.'
        }) : null,

        g.clientId ? el('div.form-actions', [
          el('a.btn', { href: '#/bandeja', text: 'Bandeja' + (pendientes ? ' (' + pendientes + ')' : '') }),
          el('button.btn.btn-primary', {
            type: 'button', text: 'Revisar el correo',
            onclick: () => { location.hash = '#/bandeja'; setTimeout(() => Gmail.lanzarRevision(), 0); }
          })
        ]) : null,

        el('details.tech', [
          el('summary', { text: 'Ajustes finos' }),
          el('div.tech-body', [
            campo('Cuántos días mira el primer import', inDias,
              'Solo la primera vez. A partir de ahí cada revisión mira los últimos ' +
              Gmail.DIAS_MINIMOS + ' días, y estira más si llevabas tiempo sin abrir la app.'),
            el('div.field', [
              el('span', { text: 'Dominios que se buscan (uno por línea)' }),
              inRemitentes,
              el('small.field-help', {
                text: 'De fábrica vienen BAC Credomatic, Davivienda y Promerica. Va por dominio ' +
                  '—baccredomatic.cr— y no por dirección entera, para que siga funcionando ' +
                  'cuando el banco cambie desde qué buzón escribe. Si lo dejas vacío vuelven los de fábrica.'
              })
            ]),
            g.autorizado ? el('button.btn.btn-danger', {
              type: 'button', text: 'Quitar el permiso de Google',
              onclick: () => {
                if (!confirm('Se retirará el permiso. Tendrás que volver a darlo para revisar el correo.')) return;
                Gmail.desconectar();
                App.render();
              }
            }) : null
          ])
        ])
      ])
    ]);
  }

  function descargarCopia() {
    const blob = new Blob([Store.exportAll()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'controlgastos-' + D.hoy() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- salir de un formulario a medias -------------------------------- */

  function hayBorrador() {
    if (borradorGasto && D.leerImporte(borradorGasto.monto)) return true;
    if (borradorPre && borradorPre.nombre && borradorPre.nombre.trim()) return true;
    return false;
  }

  function olvidarBorradores() { borradorPre = null; borradorGasto = null; }

  global.Views = {
    presupuestos, presupuestoDetalle, formPresupuesto, formGasto,
    historial, categoriasView, ajustes,
    hayBorrador, olvidarBorradores, sembrarGasto,
    textoDelEstado, compartirEstado, enlacesDeCompartir,
    helpers: {
      header, volver, campo, vacio, segmentado, barra, barraDeResumen, barraDeEstado,
      pieDeTarjeta, dato,
      chipCategoria, chapaDeTopes, listaDeGastos, filaDeGasto
    }
  };

})(window);
