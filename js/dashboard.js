/* ---------------------------------------------------------------------------
   dashboard.js — La pantalla de Resumen, que es por donde se entra.

   Aquí se mezclan presupuestos que pueden estar en monedas distintas, así que
   todo se pasa a la moneda por defecto (los colones) para poder sumarlo. Cada
   gasto se convierte con el tipo de cambio que se guardó con él; sólo los que
   no tienen ninguno usan el tipo de cambio de hoy.
--------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const el = D.el;

  function monedaBase() { return Store.ajustes().monedaPorDefecto || 'CRC'; }

  function enBase(gasto) {
    return Store.montoEnMonedaDe(gasto, monedaBase());
  }

  /* El Resumen cuenta SOLO los gastos de presupuestos activos.

     Si contara también los de un presupuesto vencido o desactivado, las
     baldosas y la lista de presupuestos dirían cosas distintas: el viaje ya no
     aparecería abajo pero su dinero seguiría sumando arriba, sin que nada lo
     explicara. Lo cerrado se consulta entero en el historial.

     Un gasto que está en dos presupuestos cuenta mientras al menos uno siga
     activo: el dinero sigue saliendo de un presupuesto vivo. */
  function gastosActivos() {
    const vivos = {};
    Store.presupuestos().forEach((p) => { vivos[p.id] = true; });
    return Store.gastos().filter((g) => Store.presupuestosDe(g).some((id) => vivos[id]));
  }

  function sumaEntre(desde, hasta) {
    const base = monedaBase();
    const total = gastosActivos()
      .filter((g) => g.fecha >= desde && g.fecha <= hasta)
      .reduce((s, g) => s + enBase(g), 0);
    return D.redondear(total, base);
  }

  function view() {
    const base = monedaBase();
    const lista = Store.presupuestos();
    const hoy = D.hoy();
    const primeroDelMes = hoy.slice(0, 8) + '01';

    if (!lista.length) {
      return el('div', [
        Views.helpers.header('Resumen'),
        Views.helpers.vacio('Empieza creando un presupuesto',
          'Puede ser la quincena del salario, un viaje o cualquier bolsa de dinero con un tope. Los gastos se van descontando de ahí.',
          el('a.btn.btn-primary', { href: '#/presupuesto-nuevo', text: 'Crear un presupuesto' }))
      ]);
    }

    const hoyTotal = sumaEntre(hoy, hoy);
    const mesTotal = sumaEntre(primeroDelMes, hoy);
    const semanaTotal = sumaEntre(D.sumarDias(hoy, -6), hoy);

    return el('div', [
      Views.helpers.header('Resumen', D.fechaLarga(hoy)),

      avisoDeBandeja(),
      avisoDeCorreoParado(),

      el('div.tiles', [
        baldosa('Hoy', D.dinero(hoyTotal, base)),
        baldosa('Últimos 7 días', D.dinero(semanaTotal, base)),
        baldosa('Este mes', D.dinero(mesTotal, base)),
        baldosa('Presupuestos', String(lista.length))
      ]),

      el('a.btn.btn-primary.btn-block', { href: '#/nuevo', text: '+ Apuntar un gasto' }),

      el('section.card', [
        el('h2.card-title', { text: 'Gasto de los últimos 14 días' }),
        Charts.panelDiario({ dias: ultimosDias(14), moneda: base })
      ]),

      el('section.card', [
        el('h2.card-title', { text: 'Tus presupuestos' }),
        el('ul.pre-list', lista.map(tarjeta))
      ]),

      ultimosGastos()
    ]);
  }

  /* Si hay compras detectadas en el correo esperando, lo primero que se ve al
     abrir la app es eso. Un aviso escondido en Ajustes no lo vería nadie. */
  function avisoDeBandeja() {
    const n = Store.pendientes().length;
    if (!n) return null;
    return el('a.aviso-bandeja', { href: '#/bandeja' }, [
      el('span.aviso-num', { text: String(n) }),
      el('div.aviso-texto', [
        // El número lo lleva la chapa de al lado; repetirlo aquí sobra.
        el('strong', { text: n === 1 ? 'Una compra detectada en el correo' : 'Compras detectadas en el correo' }),
        el('span', { text: 'Toca para revisarlas y apuntarlas' })
      ]),
      el('span.aviso-flecha', { text: '›' })
    ]);
  }

  /* Si la revisión del correo lleva fallando, hay que decirlo AQUÍ.

     Este fue el fallo de verdad, y no es de los que rompen nada: el aviso
     existía, pero solo dentro de la bandeja, que es justo la pantalla a la que
     nadie entra cuando no aparece nada nuevo. Desde el Resumen —donde se está
     todo el día— «Google ya no me deja leer el correo» y «hoy no has comprado
     nada» se veían exactamente igual: en silencio.

     Una app que deja de funcionar tiene que decirlo en la pantalla que se mira,
     no en la que habría que abrir para descubrirlo. */
  function avisoDeCorreoParado() {
    const g = Store.gmail();
    if (!g.clientId || !g.autorizado || !g.ultimoFallo) return null;

    return el('a.aviso-bandeja.is-error', { href: '#/bandeja' }, [
      el('span.aviso-num.is-error', { text: '!' }),
      el('div.aviso-texto', [
        el('strong', { text: 'No se está leyendo el correo' }),
        el('span', { text: g.ultimoFallo })
      ]),
      el('span.aviso-flecha', { text: '›' })
    ]);
  }

  function baldosa(etiqueta, valor) {
    return el('div.tile', [
      el('span.tile-v', { text: valor }),
      el('span.tile-l', { text: etiqueta })
    ]);
  }

  function ultimosDias(n) {
    const base = monedaBase();
    const mapa = {};
    const cuantos = {};
    gastosActivos().forEach((g) => {
      mapa[g.fecha] = (mapa[g.fecha] || 0) + enBase(g);
      cuantos[g.fecha] = (cuantos[g.fecha] || 0) + 1;
    });
    const dias = [];
    for (let i = n - 1; i >= 0; i--) {
      const f = D.sumarDias(D.hoy(), -i);
      dias.push({ fecha: f, total: D.redondear(mapa[f] || 0, base), n: cuantos[f] || 0, acumulado: 0 });
    }
    return dias;
  }

  /* La misma tarjeta que en la pestaña de Presupuestos, para que no haya dos
     formas distintas de leer lo mismo. */
  function tarjeta(pre) {
    const r = Store.resumen(pre);
    return el('li', [
      el('a.pre-card', { href: '#/presupuesto/' + pre.id, style: { borderLeftColor: pre.color } }, [
        el('div.pre-head', [
          el('span.pre-emoji', { text: pre.emoji || '💰' }),
          el('div.pre-title', [
            el('h3', { text: pre.nombre }),
            el('span.pre-cycle', { text: r.ciclo ? r.ciclo.etiqueta : '' })
          ]),
          el('div.pre-avail', [
            el('span.pre-avail-v', {
              class: 'pre-avail-v' + (r.excedido ? ' is-over' : ''),
              text: D.dinero(r.disponible, pre.moneda)
            }),
            el('span.pre-avail-l', { text: r.excedido ? 'de más' : 'disponible' })
          ])
        ]),
        Views.helpers.barraDeResumen(r),
        el('div.pre-foot', [
          el('span', {
            text: r.diasRestantes !== null && r.diasRestantes > 0 && r.porDia
              ? D.dinero(r.porDia, pre.moneda) + ' al día durante ' + r.diasRestantes + ' días'
              : Views.helpers.pieDeTarjeta(r, pre)
          }),
          el('span', { text: r.consumido + ' %' })
        ]),
        Views.helpers.chapaDeTopes(pre, r.ciclo)
      ])
    ]);
  }

  function ultimosGastos() {
    const lista = gastosActivos()
      .slice()
      // El mismo orden que dentro del presupuesto, y desde el mismo sitio: dos
      // listas de lo mismo ordenadas distinto se leen como un fallo.
      .sort(Store.porFechaYHora)
      .slice(0, 12);

    if (!lista.length) return null;

    return el('section.card', [
      el('h2.card-title', { text: 'Últimos gastos' }),
      el('ul.gasto-list', lista.map((g) => {
        const cat = Store.categoria(g.categoria);
        const dentro = Store.presupuestosDe(g).map((id) => Store.presupuesto(id)).filter(Boolean);
        const donde = dentro.length
          ? dentro[0].nombre + (dentro.length > 1 ? ' +' + (dentro.length - 1) : '')
          : 'sin presupuesto';
        return el('li', [
          el('a.gasto-row', { href: '#/gasto/' + g.id }, [
            el('span.gasto-emoji', { style: { background: cat.color + '22' }, text: cat.emoji }),
            el('div.gasto-main', [
              el('span.gasto-name', { text: g.comercio || cat.nombre }),
              el('span.gasto-meta', { text: D.fechaCorta(g.fecha) + ' · ' + donde })
            ]),
            el('div.gasto-amount', [
              el('span.gasto-v', { text: D.dinero(g.monto, g.moneda) })
            ])
          ])
        ]);
      }))
    ]);
  }

  global.Dashboard = { view };

})(window);
