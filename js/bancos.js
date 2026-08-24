/* ---------------------------------------------------------------------------
   bancos.js — Leer un correo de compra y sacar de él el gasto.

   Tres bancos, tres formatos distintos, comprobados con correos reales de
   agosto de 2026:

   - BAC Credomatic (notificacion@baccredomatic.cr) — tabla de etiquetas con
     dos puntos y el valor en la línea siguiente. «Monto: CRC 2,600.00».
   - Promerica (info@promerica.fi.cr) — tabla de etiquetas SIN dos puntos.
     «Monto» y debajo «CRC: 1.00». Trae además «Tipo de Comercio», que es la
     categoría del comercio según la tarjeta y sirve para adivinar la nuestra.
   - Davivienda / DAVIbank (alertas@davibank.cr) — no es tabla: es una frase
     corrida. «...realizada en X, el día 04/08/2026 a las 07:10 AM con su
     tarjeta ... terminada en 1234 ... por USD 8.00, fue aprobada.»

   Ojo con los importes: los tres escriben a la inglesa —CRC 2,600.00— aunque
   en Costa Rica también se escriba 2.600,00. De eso se encarga D.leerImporte,
   que aguanta los dos.

   Este archivo no toca la red ni el navegador: recibe texto y devuelve datos.
   Así se puede probar con un correo pegado a mano, sin conectar nada.
--------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  /* Los remitentes que se buscan en Gmail. Se pueden cambiar desde Ajustes:
     si cambias de banco, no hace falta tocar el código. */
  const REMITENTES = [
    'notificacion@baccredomatic.cr',
    'alertas@davibank.cr',
    'info@promerica.fi.cr'
  ];

  const MESES = {
    ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
    jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12
  };

  function sinTildes(texto) {
    return (texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function normalizar(texto) {
    return sinTildes(String(texto || '')).toUpperCase();
  }

  /* ---------- convertir el HTML del correo en texto ------------------------- */

  /* Los correos de los bancos son tablas HTML. Al pasarlas a texto hay que
     conservar los saltos de línea, porque la etiqueta y su valor viven en
     celdas distintas y sin el salto se pegarían en una sola línea. */
  function htmlATexto(html) {
    let t = String(html || '');
    t = t.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ');
    t = t.replace(/<br\s*\/?>/gi, '\n');
    t = t.replace(/<\/(p|div|tr|td|th|h[1-6]|li|table)>/gi, '\n');
    t = t.replace(/<[^>]+>/g, ' ');
    t = decodificarEntidades(t);
    t = t.replace(/ /g, ' ');
    t = t.replace(/[ \t]+/g, ' ');
    return t.split('\n').map((l) => l.trim()).filter((l) => l !== '').join('\n');
  }

  /* Los tags ya se han quitado antes de llegar aquí, así que esto sólo
     convierte &amp; y compañía en sus caracteres. */
  function decodificarEntidades(texto) {
    const caja = document.createElement('textarea');
    caja.innerHTML = texto;
    return caja.value;
  }

  /* ---------- leer etiquetas ------------------------------------------------ */

  function escaparRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* Busca «Etiqueta: valor» o «Etiqueta» con el valor en la línea siguiente.

     La etiqueta tiene que ocupar la línea entera o ir seguida de dos puntos.
     Si no, buscar «Fecha» encontraría también «Fecha/hora» y devolvería
     «/hora» como valor. */
  function valorDe(lineas, etiquetas) {
    for (let e = 0; e < etiquetas.length; e++) {
      const re = new RegExp('^\\s*' + escaparRegex(etiquetas[e]) + '\\s*(?::\\s*(.*))?$', 'i');
      for (let i = 0; i < lineas.length; i++) {
        const m = lineas[i].match(re);
        if (!m) continue;
        if (m[1] && m[1].trim()) return m[1].trim();
        for (let j = i + 1; j < lineas.length; j++) {
          if (lineas[j].trim()) return lineas[j].trim();
        }
      }
    }
    return '';
  }

  /* ---------- importe, fecha y tarjeta -------------------------------------- */

  /* «CRC 2,600.00», «CRC: 1.00», «USD 8.00», «₡12.500». */
  function leerMonto(texto) {
    const m = String(texto || '').match(
      /(CRC|USD|CR\$|US\$|₡|\$)\s*:?\s*(-?[\d][\d.,\s]*\d|\d)/i);
    if (!m) return null;
    const bruto = normalizar(m[1]);
    const moneda = (bruto === 'USD' || bruto === 'US$' || bruto === '$') ? 'USD' : 'CRC';
    const monto = D.leerImporte(m[2]);
    if (monto === null) return null;
    return { monto: monto, moneda: moneda };
  }

  /* Los tres formatos de fecha que mandan estos bancos:
     04/08/2026 · Ago 23, 2026 · 23 ago 2026 */
  function leerFecha(texto) {
    const t = sinTildes(String(texto || ''));

    let m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));

    m = t.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})\s*,\s*(\d{4})/);
    if (m && MESES[m[1].toLowerCase()]) return iso(Number(m[3]), MESES[m[1].toLowerCase()], Number(m[2]));

    m = t.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/);
    if (m && MESES[m[2].toLowerCase()]) return iso(Number(m[3]), MESES[m[2].toLowerCase()], Number(m[1]));

    return null;
  }

  function iso(anio, mes, dia) {
    if (!anio || !mes || !dia || mes > 12 || dia > 31) return null;
    return anio + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
  }

  function leerHora(texto) {
    const m = String(texto || '').match(/(\d{1,2}):(\d{2})\s*(AM|PM|a\.m\.|p\.m\.)?/i);
    if (!m) return '';
    let h = Number(m[1]);
    const sufijo = (m[3] || '').toUpperCase().replace(/\./g, '');
    if (sufijo.startsWith('P') && h < 12) h += 12;
    if (sufijo.startsWith('A') && h === 12) h = 0;
    return String(h).padStart(2, '0') + ':' + m[2];
  }

  /* «************1234», «****-****-****-1234», «terminada en 1234». */
  function leerTarjeta(texto) {
    let m = String(texto || '').match(/[*x]{3,}[-*x\s]*(\d{4})/i);
    if (m) return m[1];
    m = sinTildes(String(texto || '')).match(/terminada\s+en\s+(\d{4})/i);
    return m ? m[1] : '';
  }

  /* ---------- los tres lectores --------------------------------------------- */

  function leerBac(lineas, texto) {
    const monto = leerMonto(valorDe(lineas, ['Monto']));
    if (!monto) return null;
    const fechaCruda = valorDe(lineas, ['Fecha']);
    const tipo = valorDe(lineas, ['Tipo de Transacción', 'Tipo de Transaccion']);
    return {
      banco: 'BAC Credomatic',
      comercio: valorDe(lineas, ['Comercio']),
      ciudad: valorDe(lineas, ['Ciudad y país', 'Ciudad y pais']),
      fecha: leerFecha(fechaCruda),
      hora: leerHora(fechaCruda),
      tarjeta: leerTarjeta(texto),
      autorizacion: valorDe(lineas, ['Autorización', 'Autorizacion']),
      referencia: valorDe(lineas, ['Referencia']),
      tipo: tipo,
      tipoComercio: '',
      monto: monto.monto,
      moneda: monto.moneda,
      aprobada: !/ANULA|REVERS|RECHAZ|DENEG/i.test(normalizar(tipo))
    };
  }

  function leerPromerica(lineas, texto) {
    const monto = leerMonto(valorDe(lineas, ['Monto']));
    if (!monto) return null;
    const fechaCruda = valorDe(lineas, ['Fecha/hora', 'Fecha/Hora', 'Fecha']);
    return {
      banco: 'Promerica',
      comercio: valorDe(lineas, ['Comercio']),
      ciudad: valorDe(lineas, ['Ciudad/País', 'Ciudad/Pais']),
      fecha: leerFecha(fechaCruda),
      hora: leerHora(fechaCruda),
      tarjeta: leerTarjeta(texto),
      autorizacion: valorDe(lineas, ['Número de autorización', 'Numero de autorizacion']),
      referencia: valorDe(lineas, ['Número de referencia', 'Numero de referencia']),
      tipo: 'COMPRA',
      tipoComercio: valorDe(lineas, ['Tipo de Comercio']),
      monto: monto.monto,
      moneda: monto.moneda,
      aprobada: !/RECHAZ|DENEG|NO\s+FUE/i.test(normalizar(texto))
    };
  }

  /* Davivienda no da etiquetas: hay que leer la frase entera de una vez. */
  const FRASE_DAVI = new RegExp(
    'realizada\\s+en\\s+(.+?),\\s*el\\s+d[ií]a\\s+(\\d{1,2}\\/\\d{1,2}\\/\\d{4})' +
    '\\s+a\\s+las\\s+([\\d:]+\\s*[AP]M)' +
    '[\\s\\S]*?terminada\\s+en\\s+(\\d{4})' +
    '[\\s\\S]*?autorizaci[óo]n\\s+(\\S+)' +
    '[\\s\\S]*?referencia\\s+(\\S+)' +
    '[\\s\\S]*?por\\s+((?:CRC|USD|₡|\\$)\\s*[\\d.,]+)' +
    '\\s*,\\s*fue\\s+(\\w+)', 'i');

  function leerDavivienda(lineas, texto) {
    const plano = texto.replace(/\s+/g, ' ');
    const m = plano.match(FRASE_DAVI);
    if (!m) return null;
    const monto = leerMonto(m[7]);
    if (!monto) return null;
    const titular = /tarjeta\s+de\s+cr[ée]dito\s+adicional/i.test(plano) ? 'adicional' : 'titular';
    return {
      banco: 'Davivienda',
      comercio: m[1].trim(),
      ciudad: '',
      fecha: leerFecha(m[2]),
      hora: leerHora(m[3]),
      tarjeta: m[4],
      autorizacion: m[5],
      referencia: m[6],
      tipo: 'COMPRA (' + titular + ')',
      tipoComercio: '',
      monto: monto.monto,
      moneda: monto.moneda,
      aprobada: /APROBAD/i.test(sinTildes(m[8]))
    };
  }

  const LECTORES = [
    { dominio: 'baccredomatic', leer: leerBac },
    { dominio: 'promerica', leer: leerPromerica },
    { dominio: 'davibank', leer: leerDavivienda },
    { dominio: 'davivienda', leer: leerDavivienda }
  ];

  /* ---------- adivinar la categoría ----------------------------------------- */

  /* Nombres de comercio tal y como los escribe la tarjeta, en mayúsculas y sin
     tildes. Lo que no acierte se corrige en la bandeja con un toque, y es una
     decisión de quien apunta el gasto, no un fallo.

     **EL ORDEN DE ESTA LISTA IMPORTA.** Se devuelve la PRIMERA categoría que
     encaje, así que lo específico tiene que ir antes que lo general:

     - `uber-eats` antes que `uberdidi-rides`, o «DLC*UBER EATS» acabaría en
       viajes.
     - `suscripciones` antes que `amazon`, para que «AMAZON PRIME» sea una
       suscripción y «EBA*AMAZON» una compra.
     - `quickpass` antes que `transporte`, por «PARQUEO».

     Nada de poner «UBER» a secas en ningún sitio: se comería las tres
     categorías de Uber de golpe.

     Los nombres cortos son deliberados: la búsqueda es por trozos, así que
     `AUTO MERCADO` ya caza todas las sucursales. Ojo con los muy cortos
     (`MXM`, `PALI`, `EPA`), que pueden colarse dentro de otra palabra. */
  const PISTAS = [
    ['uber-eats', ['UBER EATS', 'UBEREATS', 'UE *COSTA RICA']],

    ['uberdidi-rides', ['UBER *TRIP', 'UBER RIDES', 'HELP.UBER', 'UBER TRIP', 'DIDI']],

    ['suscripciones', ['AMAZON PRIME', 'NETFLIX', 'SPOTIFY', 'DISNEY', 'HBOMAX', 'HBO MAX',
      'CRUNCHYROLL', 'GOOGLE', 'MICROSOFT', 'APPLE.COM', 'APPLE', 'YOUTUBE', 'LIGHTROOM',
      'WIKIPEDIA', 'PAYPAL *', 'SUSCRIPCION']],

    ['amazon', ['AMAZON', 'EBA*']],

    ['quickpass', ['QUICKPASS', 'QUICK PASS', 'COMPASS', 'PARQUEO', 'PARKING', 'PEAJE']],

    ['supermercado', ['AUTO MERCADO', 'AUTOMERCADO', 'FRESH MARKET', 'PERIMERCADO', 'PRICE SMART',
      'PRICESMART', 'MXM', 'PALI', 'WALMART', 'MAS X MENOS', 'MASXMENOS', 'MEGA SUPER',
      'MEGASUPER', 'SUPERMERCADO', 'GROCERY', 'SUPERMARKET']],

    ['restaurante', ['MC DONALD', 'MCDONALD', 'PAPA JOHNS', 'STARBUCKS', 'RESTAURANTE',
      'RESTAURANT', 'SODA', 'KFC', 'PIZZA', 'BURGER', 'SUBWAY', 'CAFE', 'TACO', 'ROSTIPOLLO',
      'SPOON', 'POPS', 'EATING', 'FOOD']],

    ['farmacia', ['FARMACIA', 'FARMAVALUE', 'FISCHEL', 'LA BOMBA', 'SUCRE', 'PHARMACY',
      'DRUG STORE']],

    ['combustible', ['DELTA', 'GASOLINERA', 'SERVICENTRO', 'ESTACION DE SERVICIO',
      'SERVICE STATION', 'FUEL', 'COMBUSTIBLE', 'PETROLEO']],

    ['servicios', ['A Y A', 'C.N.F.L', 'CNFL', 'ADT SECURITY', 'WEB COMUN', 'KOLBI', 'CLARO',
      'LIBERTY', 'CABLE', 'INTERNET', 'SEGURO', 'INS ']],

    ['ropa', ['OLD NAVY', 'ADIDAS', 'ZARA', 'FOREVER', 'SIMAN', 'NIKE', 'CLOTHING', 'APPAREL']],

    ['transporte', ['SINPE TP', 'TRANSPORTATION', 'TAXI', 'RIDE SHARING']],

    ['salud', ['CLINICA', 'HOSPITAL', 'LABORATORIO', 'MEDICO', 'DENTAL', 'OPTICA', 'MEDICAL']],

    ['ocio', ['CINEMARK', 'CINEPOLIS', 'MULTICINE', 'CINE', 'TEATRO', 'ENTERTAINMENT']],

    ['hogar', ['CONSTRUPLAZA', 'FERRETERIA', 'MONGE', 'GOLLO', 'HARDWARE', 'HOME']]
  ];

  function categoriaSugerida(comercio, tipoComercio) {
    const texto = normalizar((comercio || '') + ' ' + (tipoComercio || ''));
    const existentes = Store.categorias().map((c) => c.key);
    for (let i = 0; i < PISTAS.length; i++) {
      const clave = PISTAS[i][0];
      if (existentes.indexOf(clave) < 0) continue;
      const palabras = PISTAS[i][1];
      for (let j = 0; j < palabras.length; j++) {
        if (texto.indexOf(palabras[j]) >= 0) return clave;
      }
    }
    return 'otros';
  }

  /* ---------- la puerta de entrada ------------------------------------------ */

  /* correo: { de, asunto, cuerpo, esHtml, fechaCorreo }
     Devuelve el gasto detectado, o null si el correo no es de compra. */
  function leer(correo) {
    const texto = correo.esHtml === false ? String(correo.cuerpo || '') : htmlATexto(correo.cuerpo);
    const lineas = texto.split('\n');
    const de = String(correo.de || '').toLowerCase();

    let datos = null;
    for (let i = 0; i < LECTORES.length && !datos; i++) {
      if (de.indexOf(LECTORES[i].dominio) < 0) continue;
      datos = LECTORES[i].leer(lineas, texto);
    }

    // Si el remitente no dice nada (correo reenviado, banco nuevo), se prueban
    // los tres lectores a ver si alguno reconoce el formato.
    if (!datos) {
      for (let i = 0; i < LECTORES.length && !datos; i++) datos = LECTORES[i].leer(lineas, texto);
    }

    if (!datos || !datos.monto) return null;

    // Sin fecha en el cuerpo se usa la del propio correo: es del mismo día.
    if (!datos.fecha) datos.fecha = correo.fechaCorreo || D.hoy();

    datos.categoria = categoriaSugerida(datos.comercio, datos.tipoComercio);
    datos.comercio = limpiarComercio(datos.comercio);
    return datos;
  }

  /* Muchos nombres vienen limpios, pero otros arrastran la ciudad y el país
     pegados: «SINPE TP SAN JOSE CRI». Se quitan sólo los sufijos evidentes. */
  function limpiarComercio(nombre) {
    let n = String(nombre || '').replace(/\s+/g, ' ').trim();
    n = n.replace(/\s+(COSTA RICA|CRI|CR)\s*$/i, '');
    n = n.replace(/\s+SAN JOSE\s*$/i, '');
    return n.trim();
  }

  /* Dos correos del mismo movimiento tienen la misma autorización y la misma
     referencia. Con eso basta para no apuntar un gasto dos veces. */
  function huellaDe(datos) {
    return [
      normalizar(datos.banco),
      datos.autorizacion || '',
      datos.referencia || '',
      datos.monto,
      datos.moneda,
      datos.fecha
    ].join('|');
  }

  global.Bancos = {
    REMITENTES, leer, huellaDe, categoriaSugerida,
    htmlATexto, leerMonto, leerFecha, leerHora, leerTarjeta, valorDe
  };

})(window);
