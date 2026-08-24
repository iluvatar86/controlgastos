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
    '☕', '🎮', '📚', '🐶', '💇', '🧾', '🎂', '🏋️', '🎧'];

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
  function barra(consumido, excedido) {
    const ancho = Math.min(100, Math.max(0, consumido));
    const estado = excedido ? ' is-over' : (consumido >= Store.AVISO ? ' is-warn' : '');
    return el('div.bar', { class: 'bar' + estado }, [
      el('div.bar-fill', { class: 'bar-fill' + estado, style: { width: ancho + '%' } })
    ]);
  }

  function barraDeEstado(consumido, estado) {
    return barra(consumido, estado === 'pasado');
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
        barra(r.consumido, r.excedido),
        el('div.pre-foot', [
          el('span', { text: D.dinero(r.gastado, pre.moneda) + ' de ' + D.dinero(r.asignado, pre.moneda) }),
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
    const cats = Store.porCategoria(pre, ciclo);
    const dias = Store.porDia(pre, ciclo);
    const esActual = !anclas[id] || Store.cicloActual(pre).inicio === ciclo.inicio;

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
          el('span.balance-l', { text: r.excedido ? 'gastado de más' : 'te queda disponible' })
        ]),
        barra(r.consumido, r.excedido),
        el('div.balance-grid', [
          dato('Presupuesto', D.dinero(r.asignado, pre.moneda)),
          dato('Gastado', D.dinero(r.gastado, pre.moneda)),
          dato('Consumido', r.consumido + ' %')
        ]),
        r.diasRestantes !== null && esActual ? ritmo(r, pre) : null,
        el('a.btn.btn-primary.btn-block', {
          href: '#/nuevo/' + pre.id, text: '+ Apuntar un gasto'
        })
      ]),

      tarjetaDeLimites(pre, ciclo),

      r.numGastos ? el('section.card', [
        el('div.chart-head', [
          el('h2.card-title', { text: 'Cómo va el gasto' }),
          el('p.muted', { text: 'La línea de puntos es el ritmo que agota el presupuesto justo el último día.' })
        ]),
        Charts.acumulado({
          dias: dias,
          meta: r.asignado,
          moneda: pre.moneda,
          diasTotales: r.diasTotales || dias.length,
          finIso: ciclo.fin
        }),
        el('p.legend-line', [el('span.legend-dash'), 'ritmo ideal'])
      ]) : null,

      r.numGastos ? el('section.card', [
        el('h2.card-title', { text: 'Gasto de cada día' }),
        Charts.panelDiario({ dias: dias, moneda: pre.moneda })
      ]) : null,

      cats.length ? el('section.card', [
        el('h2.card-title', { text: 'En qué se fue' }),
        el('div.cat-split', [
          Charts.anillo(cats, { moneda: pre.moneda }),
          el('ul.cat-list', cats.map((c) => el('li.cat-row', [
            el('span.cat-dot', { style: { background: c.color } }),
            el('span.cat-emoji', { text: c.emoji }),
            el('span.cat-name', { text: c.nombre }),
            el('span.cat-total', { text: D.dinero(c.total, pre.moneda) }),
            el('span.cat-pct', { text: D.porcentaje(c.total, r.gastado) + ' %' })
          ])))
        ])
      ]) : null,

      el('section.card', [
        el('h2.card-title', { text: 'Gastos' + (r.numGastos ? ' (' + r.numGastos + ')' : '') }),
        r.numGastos ? listaDeGastos(r.gastos, pre) :
          el('p.muted', { text: 'Todavía no hay ningún gasto apuntado en este periodo.' })
      ]),

      tarjetaCompartir(pre, ciclo)
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

  function dato(etiqueta, valor) {
    return el('div.stat', [
      el('span.stat-v', { text: valor }),
      el('span.stat-l', { text: etiqueta })
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
  function listaDeGastos(lista, pre) {
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
          el('span', { text: D.dinero(totalDia, pre.moneda) })
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
          el('span.gasto-meta', {
            text: cat.nombre + (g.nota ? ' · ' + g.nota : '') + (g.origen === 'gmail' ? ' · del correo' : '')
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
    lineas.push('Gastado: ' + D.dinero(r.gastado, pre.moneda) + ' (' + r.consumido + ' %)');
    lineas.push((r.excedido ? 'Pasado de: ' : 'Disponible: ') +
      D.dinero(Math.abs(r.disponible), pre.moneda));

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
        limites: Object.assign({}, base.limites || {})
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

        campo(b.tipo === 'recurrente' ? 'Empieza a contar desde' : 'Fecha de inicio', inInicio),
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

    const guardado = id ? Store.updatePresupuesto(id, datos) : Store.addPresupuesto(datos);
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

    const comercios = Array.from(new Set(Store.gastos().map((g) => g.comercio).filter(Boolean))).sort();
    const listaId = 'comercios-conocidos';

    const inComercio = el('input', {
      type: 'text', value: b.comercio, placeholder: 'Automercado, Soda La Casona…',
      list: listaId,
      oninput: (e) => { b.comercio = e.target.value; }
    });

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

      el('section.card', [
        el('h2.card-title', { text: '¿De qué presupuestos sale?' }),
        el('p.muted', { text: 'Puedes marcar más de uno: una cena del viaje sale de la quincena y además cuenta contra el viaje.' }),
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

      el('section.card', [
        campo('Comercio', inComercio),
        el('datalist', { id: listaId }, comercios.map((c) => el('option', { value: c }))),
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
    const fuera = elegidos.filter((p) => {
      if (p.inicio && b.fecha < p.inicio) return true;
      if (p.tipo !== 'recurrente' && p.fin && b.fecha > p.fin) return true;
      return false;
    });
    if (!fuera.length) return null;

    const p = fuera[0];
    const rango = p.fin
      ? 'va del ' + D.fechaMedia(p.inicio) + ' al ' + D.fechaMedia(p.fin)
      : 'empieza el ' + D.fechaMedia(p.inicio);
    const arreglo = (p.fin && b.fecha > p.fin) ? p.fin : p.inicio;

    return el('p.date-warning.is-fuera', [
      'Esta fecha queda fuera de «' + p.nombre + '», que ' + rango + '. ' +
      'El gasto se guardaría pero no contaría ahí. ',
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

    // La hora de creación se calcula a partir de la fecha elegida, no del
    // momento de escribirlo: de eso depende el orden de la lista cuando se
    // rellenan gastos de días pasados.
    if (!id) datos.ts = D.deIso(b.fecha).getTime();

    const destino = b.presupuestos[0];
    if (id) Store.updateGasto(id, datos); else Store.addGasto(datos);
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

      gmailAjustes()
    ]);
  }

  /* ---------- ajustes de Gmail ---------------------------------------------- */

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

        campo('Identificador de Google (Client ID)', inClientId,
          g.clientId
            ? 'Guardado. Si lo cambias, se guarda solo.'
            : 'Pega aquí el código que acaba en .apps.googleusercontent.com. Se saca una vez desde Google Cloud.'),

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
            campo('Cuántos días atrás mirar en cada revisión', inDias),
            el('div.field', [
              el('span', { text: 'Remitentes que se buscan (uno por línea)' }),
              inRemitentes,
              el('small.field-help', {
                text: 'De fábrica vienen BAC Credomatic, Davivienda y Promerica. Si lo dejas vacío vuelven los de fábrica.'
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
    hayBorrador, olvidarBorradores,
    textoDelEstado, compartirEstado, enlacesDeCompartir,
    helpers: {
      header, volver, campo, vacio, segmentado, barra, barraDeEstado, dato,
      chipCategoria, chapaDeTopes, listaDeGastos, filaDeGasto
    }
  };

})(window);
