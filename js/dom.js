/* ---------------------------------------------------------------------------
   dom.js — Ayudas para construir la pantalla sin librerías, más el manejo de
   fechas y el formato de dinero.

   Sobre las fechas: en toda la app una fecha es un texto 'aaaa-mm-dd' y nunca
   un objeto Date guardado. new Date('2026-08-24') lo interpreta en hora de
   Greenwich, así que en Costa Rica (UTC-6) devuelve el día anterior a las 6 de
   la tarde. Por eso las fechas se parten a mano.
--------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  /* ---------- construir elementos ------------------------------------------ */

  /* el('div.clase', {atributos}, [hijos]) */
  function el(spec, props, children) {
    const parts = spec.split(/(?=[.#])/);
    const node = document.createElement(parts.shift() || 'div');
    parts.forEach((p) => {
      if (p[0] === '.') node.classList.add(p.slice(1));
      else node.id = p.slice(1);
    });

    if (props && (typeof props !== 'object' || Array.isArray(props))) {
      children = props;
      props = null;
    }

    if (props) {
      Object.keys(props).forEach((key) => {
        const value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
        else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else if (key === 'value') node.value = value;
        else if (key === 'checked' || key === 'disabled' || key === 'selected') node[key] = !!value;
        else node.setAttribute(key, value);
      });
    }

    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) { children.forEach((c) => append(node, c)); return; }
    node.appendChild(children instanceof Node ? children : document.createTextNode(String(children)));
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function svg(tag, attrs, children) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach((k) => {
      if (attrs[k] === null || attrs[k] === undefined) return;
      node.setAttribute(k, attrs[k]);
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c instanceof Node) node.appendChild(c);
      else if (c !== null && c !== undefined && c !== false) node.appendChild(document.createTextNode(String(c)));
    });
    return node;
  }

  /* ---------- fechas -------------------------------------------------------- */

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function hoy() {
    const now = new Date();
    return aIso(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  }

  /* 'aaaa-mm-dd' → Date local (mediodía, para que ningún cambio de horario de
     verano lo mueva al día de al lado). */
  function deIso(iso) {
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }

  function aIso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function sumarDias(iso, n) {
    const date = deIso(iso);
    date.setDate(date.getDate() + n);
    return aIso(date);
  }

  function sumarMeses(iso, n) {
    const date = deIso(iso);
    const dia = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + n);
    date.setDate(Math.min(dia, ultimoDiaDelMes(date.getFullYear(), date.getMonth() + 1)));
    return aIso(date);
  }

  function ultimoDiaDelMes(anio, mes) { return new Date(anio, mes, 0).getDate(); }

  /* Días entre dos fechas, contando las dos puntas: del 1 al 15 son 15 días. */
  function diasEntre(desdeIso, hastaIso) {
    const ms = deIso(hastaIso).getTime() - deIso(desdeIso).getTime();
    return Math.round(ms / 86400000) + 1;
  }

  function fecha(iso) {
    if (!iso) return '';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return d + '/' + m + '/' + y;
  }

  function fechaCorta(iso) {
    if (!iso) return '';
    const d = deIso(iso);
    return d.getDate() + ' ' + MESES[d.getMonth()];
  }

  function fechaLarga(iso) {
    if (!iso) return '';
    const d = deIso(iso);
    return d.getDate() + ' de ' + MESES_LARGOS[d.getMonth()] + ' de ' + d.getFullYear();
  }

  /* '22 de agosto', con el año sólo cuando no es el de ahora. En la lista de
     gastos casi todo es de este año y repetirlo en cada cabecera sobra. */
  function fechaMedia(iso) {
    if (!iso) return '';
    const d = deIso(iso);
    const mismoAnio = d.getFullYear() === new Date().getFullYear();
    return d.getDate() + ' de ' + MESES_LARGOS[d.getMonth()] + (mismoAnio ? '' : ' de ' + d.getFullYear());
  }

  function nombreMes(mes) { return MESES_LARGOS[mes - 1] || ''; }

  /* ---------- dinero -------------------------------------------------------- */

  const SIMBOLO = { CRC: '₡', USD: '$' };

  /* Los colones se escriben normalmente sin decimales; los dólares, con dos.
     Si un importe en colones trae céntimos se muestran, para no mentir. */
  function decimalesDe(monto, moneda) {
    if (moneda === 'USD') return 2;
    return Math.round(Number(monto) * 100) % 100 === 0 ? 0 : 2;
  }

  function dinero(monto, moneda) {
    const n = Number(monto) || 0;
    const cur = moneda === 'USD' ? 'USD' : 'CRC';
    const dec = decimalesDe(n, cur);
    const negativo = n < 0;
    const abs = Math.abs(n);
    const partes = abs.toFixed(dec).split('.');
    const enteros = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const texto = SIMBOLO[cur] + enteros + (partes[1] ? ',' + partes[1] : '');
    return (negativo ? '-' : '') + texto;
  }

  /* Versión corta para los gráficos: ₡125 mil, ₡1,2 M */
  function dineroCorto(monto, moneda) {
    const n = Math.abs(Number(monto) || 0);
    const cur = moneda === 'USD' ? 'USD' : 'CRC';
    const s = SIMBOLO[cur];
    if (cur === 'USD') {
      if (n >= 1000) return s + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.', ',') + 'k';
      return s + Math.round(n);
    }
    if (n >= 1000000) return s + (n / 1000000).toFixed(1).replace('.', ',') + ' M';
    if (n >= 1000) return s + Math.round(n / 1000) + ' mil';
    return s + Math.round(n);
  }

  /* Lee lo que se escribe en un campo de importe.

     Aquí conviven los dos formatos: en Costa Rica se escribe tanto ₡12.500,50
     como ₡12,500.50 —los bancos usan el segundo en sus correos—, así que no
     vale decidir de antemano cuál de los dos signos es el decimal. Las reglas
     son estas, y aguantan los dos:

     - Si aparecen el punto y la coma, el decimal es EL ÚLTIMO de los dos.
     - Si solo aparece uno, es decimal si deja una o dos cifras detrás, y de
       miles en cualquier otro caso: 12.500 son doce mil quinientos colones,
       no doce con cinco. */
  function leerImporte(texto) {
    let s = String(texto == null ? '' : texto).replace(/[^\d.,-]/g, '').trim();
    if (!s) return null;

    const coma = s.lastIndexOf(',');
    const punto = s.lastIndexOf('.');
    const separar = (corte) =>
      s.slice(0, corte).replace(/[.,]/g, '') + '.' + s.slice(corte + 1).replace(/[.,]/g, '');

    if (coma >= 0 && punto >= 0) {
      s = separar(Math.max(coma, punto));
    } else if (coma >= 0 || punto >= 0) {
      const corte = Math.max(coma, punto);
      const decimales = s.length - corte - 1;
      s = (decimales === 1 || decimales === 2) ? separar(corte) : s.replace(/[.,]/g, '');
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function redondear(monto, moneda) {
    const n = Number(monto) || 0;
    return moneda === 'USD' ? Math.round(n * 100) / 100 : Math.round(n);
  }

  function porcentaje(parte, total) {
    if (!total) return 0;
    return Math.round((parte / total) * 100);
  }

  global.D = {
    el, clear, svg,
    hoy, deIso, aIso, sumarDias, sumarMeses, ultimoDiaDelMes, diasEntre,
    fecha, fechaCorta, fechaMedia, fechaLarga, nombreMes,
    dinero, dineroCorto, leerImporte, redondear, porcentaje, SIMBOLO
  };

})(window);
