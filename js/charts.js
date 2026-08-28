/* ---------------------------------------------------------------------------
   charts.js — Gráficos en SVG, escritos a mano. Sin librerías.

   Los dos que importan:

   - acumulado(): lo gastado día a día frente a la línea recta que llevaría a
     gastar justo el presupuesto el último día. Es el gráfico útil de verdad:
     si la línea de verdad va por encima de la de puntos, se va a acabar el
     dinero antes de la fecha.
   - barrasDiarias(): cuánto se gastó cada día. Sirve para ver los picos.
--------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const svg = D.svg;

  const ANCHO = 320;
  const ALTO = 150;
  const IZQ = 6;
  const DER = 6;
  const ARRIBA = 12;
  const ABAJO = 20;

  function lienzo(clase) {
    return svg('svg', {
      viewBox: '0 0 ' + ANCHO + ' ' + ALTO,
      class: 'chart' + (clase ? ' ' + clase : ''),
      role: 'img'
    }, []);
  }

  function escalaY(maximo) {
    const alto = ALTO - ARRIBA - ABAJO;
    return (valor) => ARRIBA + alto - (maximo ? (valor / maximo) * alto : 0);
  }

  function escalaX(n) {
    const ancho = ANCHO - IZQ - DER;
    return (i) => IZQ + (n <= 1 ? ancho / 2 : (i / (n - 1)) * ancho);
  }

  /* ---------- gasto acumulado contra el ritmo ideal -------------------------- */

  function acumulado(opciones) {
    const dias = opciones.dias || [];
    const meta = Number(opciones.meta) || 0;
    const moneda = opciones.moneda;
    const diasTotales = opciones.diasTotales || dias.length;
    const hoy = D.hoy();

    const g = lienzo('chart-acumulado');
    if (!dias.length) return g;

    const maxReal = dias.reduce((m, d) => Math.max(m, d.acumulado), 0);
    const maximo = Math.max(maxReal, meta) * 1.08 || 1;
    const y = escalaY(maximo);
    const x = escalaX(diasTotales);

    // Rejilla: sólo tres líneas. Más ensucia en una pantalla de móvil.
    [0, 0.5, 1].forEach((f) => {
      g.appendChild(svg('line', {
        x1: IZQ, x2: ANCHO - DER, y1: y(maximo * f), y2: y(maximo * f), class: 'chart-grid'
      }));
    });

    // Línea de puntos: el ritmo que agota el presupuesto justo el último día.
    if (meta > 0) {
      g.appendChild(svg('line', {
        x1: x(0), y1: y(0), x2: x(diasTotales - 1), y2: y(meta), class: 'chart-ideal'
      }));
    }

    // Sólo se dibuja hasta hoy: prolongar la línea plana hasta fin de mes
    // haría creer que ya se sabe que no se va a gastar más.
    const hasta = dias.filter((d) => d.fecha <= hoy);
    const trazo = (hasta.length ? hasta : [dias[0]]);
    const puntos = trazo.map((d, i) => x(i) + ',' + y(d.acumulado));

    const excedido = trazo.length && trazo[trazo.length - 1].acumulado > meta && meta > 0;

    g.appendChild(svg('polygon', {
      points: x(0) + ',' + y(0) + ' ' + puntos.join(' ') + ' ' + x(trazo.length - 1) + ',' + y(0),
      class: 'chart-area' + (excedido ? ' is-over' : '')
    }));

    g.appendChild(svg('polyline', {
      points: puntos.join(' '),
      class: 'chart-line' + (excedido ? ' is-over' : '')
    }));

    const ultimo = trazo[trazo.length - 1];
    g.appendChild(svg('circle', {
      cx: x(trazo.length - 1), cy: y(ultimo.acumulado), r: 3.2,
      class: 'chart-dot' + (excedido ? ' is-over' : '')
    }));

    // Etiquetas: el tope del presupuesto arriba, las fechas abajo.
    if (meta > 0) {
      g.appendChild(svg('text', {
        x: ANCHO - DER, y: y(meta) - 4, 'text-anchor': 'end', class: 'chart-tick'
      }, D.dineroCorto(meta, moneda)));
    }
    g.appendChild(svg('text', {
      x: IZQ, y: ALTO - 6, class: 'chart-tick'
    }, D.fechaCorta(dias[0].fecha)));

    if (opciones.finIso) {
      g.appendChild(svg('text', {
        x: ANCHO - DER, y: ALTO - 6, 'text-anchor': 'end', class: 'chart-tick'
      }, D.fechaCorta(opciones.finIso)));
    }

    g.appendChild(svg('text', {
      x: Math.min(Math.max(x(trazo.length - 1), 30), ANCHO - 30),
      y: Math.max(y(ultimo.acumulado) - 8, 10),
      'text-anchor': 'middle',
      class: 'chart-value'
    }, D.dineroCorto(ultimo.acumulado, moneda)));

    return g;
  }

  /* ---------- gasto de cada día --------------------------------------------- */

  function barrasDiarias(opciones) {
    const dias = opciones.dias || [];
    const moneda = opciones.moneda;
    const hoy = D.hoy();
    const elegido = opciones.elegido || null;
    const alTocar = opciones.alTocar;

    const g = lienzo('chart-barras');
    if (!dias.length) return g;

    const maximo = dias.reduce((m, d) => Math.max(m, d.total), 0) || 1;
    const y = escalaY(maximo);
    const ancho = ANCHO - IZQ - DER;
    const paso = ancho / dias.length;
    const grosor = Math.max(2, Math.min(paso - 2, 16));

    g.appendChild(svg('line', {
      x1: IZQ, x2: ANCHO - DER, y1: y(0), y2: y(0), class: 'chart-grid'
    }));

    dias.forEach((d, i) => {
      const cx = IZQ + paso * i + paso / 2;
      const alto = Math.max(d.total > 0 ? 1.5 : 0, y(0) - y(d.total));
      if (alto <= 0) return;
      const suyo = d.fecha === elegido;
      g.appendChild(svg('rect', {
        x: cx - grosor / 2,
        y: y(0) - alto,
        width: grosor,
        height: alto,
        rx: Math.min(2, grosor / 2),
        class: 'chart-bar' + (d.fecha === hoy ? ' is-today' : '') +
          (suyo ? ' is-sel' : (elegido ? ' is-dim' : ''))
      }));
    });

    /* Zonas para tocar: una por día, del alto entero del gráfico y del ancho
       de toda la columna, no solo de la barra.

       Con catorce días la barra mide unos doce píxeles: con el dedo no se
       acierta. Además así los días SIN gasto —que no dibujan barra— también
       se pueden tocar y pueden decir que no hubo nada. */
    if (alTocar) {
      dias.forEach((d, i) => {
        const zona = svg('rect', {
          x: IZQ + paso * i,
          y: ARRIBA,
          width: paso,
          height: y(0) - ARRIBA,
          class: 'chart-hit',
          role: 'button',
          tabindex: '0',
          'aria-label': D.fechaMedia(d.fecha) + ': ' +
            (d.total ? D.dinero(d.total, moneda) : 'sin gastos')
        }, [svg('title', {}, D.fechaMedia(d.fecha) + ' · ' +
          (d.total ? D.dinero(d.total, moneda) : 'sin gastos'))]);
        zona.addEventListener('click', () => alTocar(d));
        zona.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); alTocar(d); }
        });
        g.appendChild(zona);
      });
    }

    // Una etiqueta cada pocos días, o se pisan unas con otras.
    const cada = Math.max(1, Math.ceil(dias.length / 6));
    dias.forEach((d, i) => {
      if (i % cada !== 0 && i !== dias.length - 1) return;
      g.appendChild(svg('text', {
        x: IZQ + paso * i + paso / 2,
        y: ALTO - 6,
        'text-anchor': 'middle',
        class: 'chart-tick'
      }, D.deIso(d.fecha).getDate()));
    });

    g.appendChild(svg('text', {
      x: ANCHO - DER, y: 10, 'text-anchor': 'end', class: 'chart-tick'
    }, 'máx. ' + D.dineroCorto(maximo, moneda)));

    return g;
  }

  /* Gráfico de barras + la línea que dice cuánto se gastó el día que se toca.

     Se redibuja solo el gráfico, no la pantalla entera: pasar por App.render()
     haría saltar el scroll y perder el hilo de lo que se estaba mirando. */
  function panelDiario(opciones) {
    const dias = opciones.dias || [];
    const moneda = opciones.moneda;
    // Quien lo monta puede enterarse de qué día se tocó, para enseñar ese día
    // en otro sitio de la pantalla. Y puede cambiar la frase de abajo, porque
    // el toque no significa lo mismo en el Resumen que dentro de un
    // presupuesto, donde además filtra la tarjeta de categorías.
    const alElegir = opciones.alElegir;
    const pista = opciones.pista || 'Toca una barra para ver el gasto de ese día.';
    let elegido = null;

    const caja = D.el('div.chart-panel');
    const hueco = D.el('div.chart-hueco');
    const pie = D.el('p.chart-caption');

    function etiquetaDelDia(iso) {
      if (iso === D.hoy()) return 'Hoy';
      if (iso === D.sumarDias(D.hoy(), -1)) return 'Ayer';
      return D.fechaMedia(iso);
    }

    function escribirPie() {
      const d = dias.find((x) => x.fecha === elegido);
      if (!d) {
        pie.className = 'chart-caption';
        pie.textContent = pista;
        return;
      }
      if (!d.total) {
        pie.className = 'chart-caption is-elegido';
        pie.textContent = etiquetaDelDia(d.fecha) + ' · sin gastos';
        return;
      }
      pie.className = 'chart-caption is-elegido';
      pie.textContent = etiquetaDelDia(d.fecha) + ' · ' + D.dinero(d.total, moneda) +
        (d.n ? ' · ' + d.n + (d.n === 1 ? ' gasto' : ' gastos') : '');
    }

    function pintar() {
      D.clear(hueco);
      hueco.appendChild(barrasDiarias({
        dias: dias,
        moneda: moneda,
        elegido: elegido,
        alTocar: (d) => {
          // Tocar el mismo día otra vez lo deselecciona.
          elegir((elegido === d.fecha) ? null : d.fecha);
        }
      }));
    }

    function elegir(fecha) {
      elegido = fecha || null;
      pintar();
      escribirPie();
      if (alElegir) alElegir(elegido);
    }

    pintar();
    escribirPie();
    caja.appendChild(hueco);
    caja.appendChild(pie);

    /* Se cuelga del nodo para poder quitar la selección desde fuera —desde el
       «Ver todo el periodo» de la tarjeta de abajo—, que si no se quedaría la
       barra marcada mientras el reparto ya enseña el periodo entero. */
    caja.elegirDia = elegir;
    return caja;
  }

  /* ---------- anillo de categorías ------------------------------------------ */

  /* Un anillo, no un queso: el hueco del centro se aprovecha para el total, que
     es el dato que se mira primero. */
  function anillo(partes, opciones) {
    const total = partes.reduce((s, p) => s + p.total, 0);
    const tam = 132;
    const radio = 52;
    const grosor = 15;
    const centro = tam / 2;

    const g = svg('svg', {
      viewBox: '0 0 ' + tam + ' ' + tam,
      class: 'donut',
      role: 'img'
    }, []);

    if (!total) return g;

    const circunferencia = 2 * Math.PI * radio;
    let recorrido = 0;

    partes.forEach((p) => {
      const fraccion = p.total / total;
      if (fraccion <= 0) return;
      g.appendChild(svg('circle', {
        cx: centro, cy: centro, r: radio,
        fill: 'none',
        stroke: p.color,
        'stroke-width': grosor,
        'stroke-dasharray': (fraccion * circunferencia - 1.5) + ' ' + circunferencia,
        'stroke-dashoffset': -recorrido * circunferencia,
        transform: 'rotate(-90 ' + centro + ' ' + centro + ')'
      }));
      recorrido += fraccion;
    });

    g.appendChild(svg('text', {
      x: centro, y: centro - 1, 'text-anchor': 'middle', class: 'donut-total'
    }, D.dineroCorto(total, opciones && opciones.moneda)));
    g.appendChild(svg('text', {
      x: centro, y: centro + 13, 'text-anchor': 'middle', class: 'donut-label'
    }, 'gastado'));

    return g;
  }

  global.Charts = { acumulado, barrasDiarias, panelDiario, anillo };

})(window);
