/* ---------------------------------------------------------------------------
   store.js — Los datos. Viven en el propio teléfono, en el almacenamiento del
   navegador. No se sube nada a ningún sitio.

   Dos decisiones que conviene entender antes de tocar nada:

   1. Los CICLOS NO SE GUARDAN. Un presupuesto recurrente (la quincena del
      salario) no tiene una lista de quincenas almacenadas: el ciclo al que
      pertenece un gasto se calcula a partir de su fecha. Así no hay nada que
      "cerrar" ni "abrir" cada quince días, y mirar una quincena vieja es
      simplemente filtrar por fechas.

   2. EL TIPO DE CAMBIO SE GUARDA EN CADA GASTO. Cuando se apunta una compra en
      dólares dentro de un presupuesto en colones, se guarda el tipo de cambio
      del día. Si mañana se cambia el tipo de cambio de la app, los gastos
      antiguos no se mueven — que es lo correcto: ya se pagaron a aquel precio.
--------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const KEY = 'controlgastos.v1';

  const CATEGORIAS = [
    { key: 'supermercado', nombre: 'Supermercado', emoji: '🛒', color: '#4ADE80' },
    { key: 'restaurante', nombre: 'Restaurante', emoji: '🍽️', color: '#FB923C' },
    { key: 'farmacia', nombre: 'Farmacia', emoji: '💊', color: '#38BDF8' },
    { key: 'combustible', nombre: 'Combustible', emoji: '⛽', color: '#FACC15' },
    { key: 'suscripciones', nombre: 'Suscripciones', emoji: '🔁', color: '#818CF8' },
    { key: 'uber-eats', nombre: 'Uber-Eats', emoji: '🛵', color: '#84CC16' },
    { key: 'uberdidi-rides', nombre: 'UberDidi-Rides', emoji: '🚕', color: '#60A5FA' },
    { key: 'quickpass', nombre: 'QuickPass', emoji: '🛣️', color: '#F59E0B' },
    { key: 'amazon', nombre: 'Amazon', emoji: '🛍️', color: '#FDBA74' },
    { key: 'transporte', nombre: 'Transporte', emoji: '🚌', color: '#A78BFA' },
    { key: 'servicios', nombre: 'Servicios', emoji: '💡', color: '#22D3EE' },
    { key: 'salud', nombre: 'Salud', emoji: '🏥', color: '#F472B6' },
    { key: 'ocio', nombre: 'Ocio', emoji: '🎬', color: '#C084FC' },
    { key: 'ropa', nombre: 'Ropa', emoji: '👕', color: '#FB7185' },
    { key: 'hogar', nombre: 'Hogar', emoji: '🏠', color: '#34D399' },
    { key: 'otros', nombre: 'Otros', emoji: '📦', color: '#94A3B8' }
  ];

  /* Sube este número al añadir categorías de fábrica nuevas.

     Hace falta porque las categorías se copian a los datos del usuario la
     primera vez y ahí se quedan: sin esto, quien ya tenga la app instalada no
     vería nunca las nuevas. Y se hace UNA sola vez por número, para que
     borrar una categoría a propósito no la resucite en el siguiente arranque. */
  const SEMILLA = 2;

  const COLORES_PRESUPUESTO = [
    '#34D399', '#38BDF8', '#FBBF24', '#F472B6', '#A78BFA', '#FB923C', '#4ADE80', '#22D3EE'
  ];

  const EMPTY = {
    version: 1,
    presupuestos: [],
    gastos: [],
    categorias: JSON.parse(JSON.stringify(CATEGORIAS)),
    ajustes: {
      monedaPorDefecto: 'CRC',
      tipoCambio: 510,          // colones por dólar; se edita en Ajustes
      tipoCambioAlDia: null     // fecha en que se actualizó por última vez
    },
    gmail: {
      clientId: '',             // el que se saca de Google Cloud; ver AJUSTES
      remitentes: [],           // vacío = los de fábrica (Bancos.REMITENTES)
      diasAtras: 30,            // solo el PRIMER import; luego son 7 días (ver gmail.js)
      revisarAlAbrir: 'cada6h', // 'siempre' | 'cada6h' | 'nunca'
      presupuestoPorDefecto: null,
      ultimaRevision: null,
      ultimoFallo: null         // por qué falló la última revisión automática
    },
    pendientes: [],             // gastos detectados en el correo, sin confirmar
    norecon: [],                // correos del banco que no se pudieron leer
    huellas: []                 // los que ya se apuntaron o descartaron
  };

  let data = null;

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' +
      Math.random().toString(36).slice(2, 7);
  }

  function load() {
    if (data) return data;
    try {
      const raw = localStorage.getItem(KEY);
      data = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(EMPTY));
    } catch (err) {
      console.error('No se pudieron leer los datos guardados', err);
      data = JSON.parse(JSON.stringify(EMPTY));
    }
    Object.keys(EMPTY).forEach((k) => { if (data[k] === undefined) data[k] = JSON.parse(JSON.stringify(EMPTY[k])); });
    Object.keys(EMPTY.ajustes).forEach((k) => {
      if (data.ajustes[k] === undefined) data.ajustes[k] = EMPTY.ajustes[k];
    });
    if (!data.categorias || !data.categorias.length) {
      data.categorias = JSON.parse(JSON.stringify(CATEGORIAS));
      data.semilla = SEMILLA;
    }
    migrar(data);
    if (sembrarCategorias(data)) { save(); }
    return data;
  }

  /* Añade las categorías de fábrica que hayan aparecido desde la última vez.
     Devuelve si tocó algo, para guardarlo. «Otros» siempre va al final. */
  function sembrarCategorias(d) {
    if ((d.semilla || 1) >= SEMILLA) return false;
    const tiene = {};
    d.categorias.forEach((c) => { tiene[c.key] = true; });
    CATEGORIAS.forEach((c) => {
      if (!tiene[c.key]) d.categorias.push(JSON.parse(JSON.stringify(c)));
    });
    // «Otros» siempre al final: es el cajón de sastre, no una categoría más.
    const otros = d.categorias.filter((c) => c.key === 'otros');
    d.categorias = d.categorias.filter((c) => c.key !== 'otros').concat(otros);
    d.semilla = SEMILLA;
    return true;
  }

  /* Al principio un gasto pertenecía a un solo presupuesto (`presupuestoId`).
     Ahora puede afectar a varios a la vez (`asignaciones`), porque una compra
     del viaje sale además de la quincena. Las copias de seguridad antiguas se
     convierten al abrirlas: no hay que hacer nada a mano. */
  function migrar(d) {
    /* Los gastos fijos empezaron siendo una lista sola en el presupuesto, que
       valía para todos los periodos a la vez. Ahora son de cada periodo, así
       que son un objeto `{inicioDelPeriodo: lista}`. Lo que hubiera en la forma
       antigua se pasa al periodo en curso, que es donde se estaba mirando. */
    (d.presupuestos || []).forEach((p) => {
      // La caja de otros gastos es posterior: los presupuestos de antes no la
      // traen y hay que dejarla vacía, no sin existir.
      if (!p.otros || Array.isArray(p.otros)) p.otros = {};
      if (!p.fijos) { p.fijos = {}; return; }
      if (!Array.isArray(p.fijos)) return;
      const lista = p.fijos;
      p.fijos = {};
      const clave = claveDeCiclo(p, cicloDe(p, D.hoy()));
      if (clave && lista.length) p.fijos[clave] = limpiarApuntes(lista, p.moneda, 'fijos');
    });

    /* Los remitentes pasaron de ser direcciones enteras a dominios, porque el
       BAC cambió su remite y la app dejó de ver sus compras sin dar ningún
       error (ver la cabecera de bancos.js). A quien tenga guardada una lista
       con direcciones se le convierte a dominios: se respeta lo que puso —los
       bancos que eligió— y se le arregla el problema de paso. */
    if (d.gmail && Array.isArray(d.gmail.remitentes) &&
        d.gmail.remitentes.some((r) => String(r).indexOf('@') >= 0)) {
      const dominios = [];
      d.gmail.remitentes.forEach((r) => {
        const dom = String(r).split('@').pop().trim().toLowerCase();
        if (dom && dominios.indexOf(dom) < 0) dominios.push(dom);
      });
      d.gmail.remitentes = dominios;
    }

    (d.gastos || []).forEach((g) => {
      if (!Array.isArray(g.asignaciones) || !g.asignaciones.length) {
        g.asignaciones = [{ presupuestoId: g.presupuestoId || null, monto: Number(g.monto) || 0 }];
      }
      if (g.presupuestoId !== undefined) delete g.presupuestoId;
    });
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(load()));
      return true;
    } catch (err) {
      alert('No se han podido guardar los datos: el almacenamiento del teléfono está lleno. ' +
        'Haz una copia de seguridad desde Ajustes y borra algún presupuesto antiguo.');
      return false;
    }
  }

  /* ---------- ajustes ------------------------------------------------------- */

  function ajustes() { return load().ajustes; }

  function setAjustes(cambios) {
    Object.assign(load().ajustes, cambios);
    save();
  }

  /* ---------- categorías ---------------------------------------------------- */

  function categorias() { return load().categorias; }

  function categoria(key) {
    return load().categorias.find((c) => c.key === key) ||
      { key: key || 'otros', nombre: 'Sin categoría', emoji: '❓', color: '#94A3B8' };
  }

  function claveDe(nombre) {
    return (nombre || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function addCategoria(nombre, emoji, color) {
    const d = load();
    let key = claveDe(nombre) || uid('cat');
    if (d.categorias.some((c) => c.key === key)) key = key + '-' + Math.random().toString(36).slice(2, 5);
    const item = { key, nombre: nombre.trim(), emoji: emoji || '🏷️', color: color || '#94A3B8' };
    d.categorias.push(item);
    save();
    return item;
  }

  function updateCategoria(key, cambios) {
    const item = load().categorias.find((c) => c.key === key);
    if (item) { Object.assign(item, cambios); save(); }
    return item;
  }

  /* Al borrar una categoría los gastos que la usaban pasan a "Otros": borrar
     una etiqueta no debe borrar dinero ni dejarlo huérfano. */
  function deleteCategoria(key) {
    const d = load();
    if (key === 'otros') return false;
    d.categorias = d.categorias.filter((c) => c.key !== key);
    d.gastos.forEach((g) => { if (g.categoria === key) g.categoria = 'otros'; });
    // Un tope de una categoría que ya no existe no se puede ni ver ni quitar.
    d.presupuestos.forEach((p) => { if (p.limites) delete p.limites[key]; });
    save();
    return true;
  }

  /* ---------- presupuestos -------------------------------------------------- */

  /* ---------- activo, vencido o desactivado ---------------------------------

     Un presupuesto puede estar en tres estados, y solo uno de ellos se guarda:

     - **activo** — el normal.
     - **vencido** — se calcula, no se guarda: un presupuesto de una vez cuya
       fecha de fin ya pasó. Se aparta solo, sin que haya que hacer nada.
     - **desactivado** — se guarda (`archivado`). Lo apaga uno a mano cuando ya
       no lo necesita.

     Los dos últimos salen del Resumen y de las listas donde se elige, pero
     **no se borra nada**: siguen enteros en el historial, se pueden consultar
     y se les pueden seguir apuntando gastos. Desactivar no es borrar.
  --------------------------------------------------------------------------- */

  function vencido(pre) {
    return !!pre && !pre.archivado && pre.tipo !== 'recurrente' &&
      !!pre.fin && pre.fin < D.hoy();
  }

  function estadoDePresupuesto(pre) {
    if (!pre) return 'activo';
    if (pre.archivado) return 'desactivado';
    if (vencido(pre)) return 'vencido';
    return 'activo';
  }

  function estaActivo(pre) { return estadoDePresupuesto(pre) === 'activo'; }

  /* Por defecto, solo los activos: es lo que hay que ofrecer para elegir y lo
     que se enseña en el Resumen. Con `todos` en cierto salen también los
     cerrados, que es lo que quiere el historial. */
  function presupuestos(todos) {
    const lista = load().presupuestos;
    return todos ? lista.slice() : lista.filter(estaActivo);
  }

  function presupuestosCerrados() {
    return load().presupuestos.filter((p) => !estaActivo(p));
  }

  function presupuesto(id) { return load().presupuestos.find((p) => p.id === id) || null; }

  function archivar(id, apagar) {
    const pre = presupuesto(id);
    if (!pre) return null;
    pre.archivado = !!apagar;
    pre.archivadoEn = apagar ? D.hoy() : null;
    save();
    return pre;
  }

  /* Al abrir un presupuesto cerrado no sirve de nada caer en el periodo de
     hoy, que estará vacío: se cae en el último que tuvo sentido. */
  function fechaDeReferencia(pre) {
    if (!pre) return D.hoy();
    if (pre.archivado && pre.archivadoEn) return pre.archivadoEn;
    if (vencido(pre)) return pre.fin;
    return D.hoy();
  }

  function cicloDeReferencia(pre) { return cicloDe(pre, fechaDeReferencia(pre)); }

  function addPresupuesto(borrador) {
    const d = load();
    const usados = d.presupuestos.length;
    const item = Object.assign({
      id: uid('pre'),
      tipo: 'puntual',
      periodo: 'quincenal',
      cortes: [1, 16],          // solo se usa con periodo 'personalizado'
      limites: {},              // { claveDeCategoria: tope por periodo }
      montos: {},               // { inicioDelPeriodo: importe propio de ESE periodo }
      fijos: {},                // { inicioDelPeriodo: [{id, nombre, monto, moneda, tipoCambio}] }
      otros: {},                // igual que fijos, pero para los imprevistos
      moneda: d.ajustes.monedaPorDefecto,
      color: COLORES_PRESUPUESTO[usados % COLORES_PRESUPUESTO.length],
      emoji: '💰',
      inicio: D.hoy(),
      fin: null,
      archivado: false,
      creadoEn: D.hoy()
    }, borrador);
    item.monto = Number(item.monto) || 0;
    if (!item.fijos || Array.isArray(item.fijos)) item.fijos = {};
    if (!item.otros || Array.isArray(item.otros)) item.otros = {};
    d.presupuestos.push(item);
    save();
    return item;
  }

  function updatePresupuesto(id, cambios) {
    const item = presupuesto(id);
    if (!item) return null;
    Object.assign(item, cambios);
    if (cambios.monto !== undefined) item.monto = Number(cambios.monto) || 0;
    save();
    return item;
  }

  /* Borrar un presupuesto se lleva los gastos que sólo estaban en él: un gasto
     sin presupuesto no significa nada. Los que además estaban en otro
     presupuesto NO se borran; sólo dejan de contar en este. */
  function deletePresupuesto(id) {
    const d = load();
    d.presupuestos = d.presupuestos.filter((p) => p.id !== id);
    d.gastos.forEach((g) => {
      g.asignaciones = asignaciones(g).filter((a) => a.presupuestoId !== id);
    });
    d.gastos = d.gastos.filter((g) => g.asignaciones.length);
    save();
  }

  /* Cuántos gastos se llevaría por delante y cuántos sólo perderían este
     presupuesto. Sirve para que el aviso de borrado diga la verdad. */
  function impactoDeBorrar(id) {
    let solos = 0;
    let compartidos = 0;
    load().gastos.forEach((g) => {
      if (!estaEn(g, id)) return;
      if (asignaciones(g).length > 1) compartidos++; else solos++;
    });
    return { solos, compartidos };
  }

  /* ---------- lo que NO son compras, DE CADA PERIODO -------------------------

     Hay dos cajas, y las dos funcionan exactamente igual por dentro:

     - **`fijos`** — el alquiler, la escuela, el préstamo, el internet. Se
       repiten y el importe se sabe de antemano.
     - **`otros`** — el imprevisto. La reparación del carro, el médico, la
       multa. **No se repiten**, y por eso no tienen el botón de copiar del
       periodo de al lado: copiar un imprevisto no significa nada.

     Esa es la única diferencia entre las dos, y vive en la pantalla, no aquí.
     Aquí abajo todo lleva un parámetro `caja` que dice en cuál se guarda.

     Lo que comparten es lo importante: **no son compras** y el importe se sabe.

     Dónde NO viven: en `gastos`. Meterlos ahí ensucia justo lo que sirve para
     decidir —el gráfico del día a día se convierte en un pico gigante el día
     3, el reparto por categoría lo domina el alquiler, y las baldosas del
     Resumen dicen que hoy se gastó una fortuna cuando lo único que pasó es que
     se pagó la casa—. Al vivir fuera, todo lo que recorre `gastos` (gráficos,
     categorías, topes, baldosas, «últimos gastos», lo que trae el correo) **no
     los ve siquiera**, sin tener que acordarse de filtrarlos en cada sitio.

     Dónde SÍ viven: en el periodo. `presupuesto.fijos` y `presupuesto.otros`
     son objetos `{inicioDelPeriodo: [{id, nombre, monto, moneda, tipoCambio}]}`,
     con la misma clave que los importes propios de un periodo (ver más abajo
     `claveDeCiclo`).

     **Cada uno lleva su moneda**, igual que las compras: hay recibos que se
     cobran en dólares (una suscripción, un seguro) dentro de un presupuesto en
     colones. Se guarda el importe tal cual se paga y el tipo de cambio del día,
     que se estampa y no se vuelve a mover; convertir al apuntarlo y guardar
     sólo el resultado perdería el dato de verdad —lo que cobran— y dejaría el
     recibo bailando cada vez que se toca el tipo en Ajustes.

     **Son de cada periodo, no del presupuesto**, y esto se hizo mal la primera
     vez: estaban en el presupuesto y valían para todas las quincenas a la vez.
     No sirve — cada quincena tiene los suyos, porque no todas traen los mismos
     recibos. Para no tener que reescribirlos cada quince días está
     `apuntesDelVecino`, que alimenta el botón «copiar los del periodo
     anterior»: explícito y de un toque, en vez de una herencia automática que
     luego nadie entiende de dónde sale. Sólo lo usa la caja `fijos`.

     Lo que sí hacen es **descontar del presupuesto**, y tienen que hacerlo: si
     de ₡500.000 hay ₡200.000 comprometidos, lo que queda para comprar son
     ₡300.000, y decir otra cosa sería mentir justo en el número que se mira.

     No hay casilla de «pagado» a propósito: el dinero está comprometido igual
     el día 1 que el 28, y una casilla más que marcar cada quincena es
     exactamente el trabajo que esta pantalla existe para ahorrar.
  --------------------------------------------------------------------------- */

  // Las dos cajas. Cualquier otro valor se trata como 'fijos', que es la que
  // existía antes y la que tienen los datos de siempre.
  const CAJAS = ['fijos', 'otros'];
  function nombreDeCaja(caja) { return CAJAS.indexOf(caja) >= 0 ? caja : 'fijos'; }

  /* `monedaPre` es la del presupuesto, y sólo se usa de red: los apuntes de
     antes de que hubiera monedas no la llevan, y todos aquellos se escribieron
     en la del presupuesto. */
  function limpiarApuntes(lista, monedaPre, caja) {
    const base = monedaPre === 'USD' ? 'USD' : 'CRC';
    const porDefecto = nombreDeCaja(caja) === 'otros' ? 'Otro gasto' : 'Gasto fijo';
    return (Array.isArray(lista) ? lista : []).map((f) => ({
      id: (f && f.id) || uid('apunte'),
      nombre: String((f && f.nombre) || '').trim() || porDefecto,
      monto: Number(f && f.monto) || 0,
      moneda: (f && (f.moneda === 'USD' || f.moneda === 'CRC')) ? f.moneda : base,
      // Sin estampar todavía va a 0, y entonces `convertir` usa el de hoy.
      tipoCambio: Number(f && f.tipoCambio) || 0
    })).filter((f) => f.monto > 0);
  }

  function apuntesDe(pre, ciclo, caja) {
    const clave = claveDeCiclo(pre, ciclo);
    if (!pre || !clave) return [];
    const c = nombreDeCaja(caja);
    return limpiarApuntes((pre[c] || {})[clave], pre.moneda, c);
  }

  /* Lo que este apunte le quita al presupuesto, en la moneda del presupuesto.
     Igual que con las compras, manda el tipo de cambio que se estampó al
     apuntarlo, no el de hoy. */
  function montoApuntadoEn(apunte, moneda) {
    if (!apunte) return 0;
    return convertir(apunte.monto, apunte.moneda || moneda, moneda, apunte.tipoCambio);
  }

  function totalApuntes(pre, ciclo, caja) {
    if (!pre) return 0;
    const suma = apuntesDe(pre, ciclo, caja)
      .reduce((s, f) => s + montoApuntadoEn(f, pre.moneda), 0);
    return D.redondear(suma, pre.moneda);
  }

  function setApuntes(presupuestoId, ciclo, caja, lista) {
    const pre = presupuesto(presupuestoId);
    const clave = claveDeCiclo(pre, ciclo);
    if (!pre || !clave) return null;
    const c = nombreDeCaja(caja);
    if (!pre[c] || Array.isArray(pre[c])) pre[c] = {};
    // El tipo de cambio se estampa aquí, que es la única puerta de escritura, y
    // siempre: haga falta convertir hoy o no, mañana puede hacer falta.
    const limpia = limpiarApuntes(lista, pre.moneda, c).map((f) => Object.assign({}, f, {
      tipoCambio: f.tipoCambio || Number(ajustes().tipoCambio) || 1
    }));
    if (limpia.length) pre[c][clave] = limpia;
    else delete pre[c][clave];
    save();
    return pre;
  }

  /* Los apuntes del periodo de al lado, para poder copiarlos sin reescribirlos.
     Se miran los dos lados: lo normal es traérselos del anterior, pero si se
     está rellenando una quincena vieja el que tiene los datos es el siguiente.

     Sólo tiene sentido con los fijos. Un imprevisto no se repite, así que
     ofrecer «copiar los del periodo anterior» en la caja de otros gastos sería
     invitar a apuntar dos veces algo que pasó una. */
  function apuntesDelVecino(pre, ciclo, caja) {
    const previo = cicloVecino(pre, ciclo, -1);
    const deAtras = previo ? apuntesDe(pre, previo, caja) : [];
    if (deAtras.length) return { lista: deAtras, ciclo: previo, direccion: -1 };
    const posterior = cicloVecino(pre, ciclo, +1);
    const deDelante = posterior ? apuntesDe(pre, posterior, caja) : [];
    if (deDelante.length) return { lista: deDelante, ciclo: posterior, direccion: +1 };
    return null;
  }

  /* Cuántos periodos llevan apuntes en esta caja. Sirve para avisar antes de
     borrar lo que se perdería al mover las fechas de los periodos. */
  function periodosConApuntes(pre, caja) {
    const c = nombreDeCaja(caja);
    const mapa = (pre && pre[c]) || {};
    if (Array.isArray(mapa)) return [];
    return Object.keys(mapa)
      .filter((k) => limpiarApuntes(mapa[k], pre.moneda, c).length).sort();
  }

  function olvidarApuntes(presupuestoId, caja) {
    const pre = presupuesto(presupuestoId);
    if (!pre) return null;
    pre[nombreDeCaja(caja)] = {};
    save();
    return pre;
  }

  /* ---------- ciclos -------------------------------------------------------- */

  /* En Costa Rica la quincena del salario va del 1 al 15 y del 16 al último día
     del mes, que es como pagan las empresas. No son "quince días desde que
     empezó el presupuesto". */
  function cicloDe(pre, fechaIso) {
    if (!pre) return null;
    const f = fechaIso || D.hoy();

    if (pre.tipo !== 'recurrente') {
      return {
        inicio: pre.inicio,
        fin: pre.fin || null,
        etiqueta: pre.fin ? D.fechaCorta(pre.inicio) + ' – ' + D.fechaCorta(pre.fin) : 'Desde ' + D.fecha(pre.inicio),
        unico: true
      };
    }

    const date = D.deIso(f);
    const anio = date.getFullYear();
    const mes = date.getMonth() + 1;
    const dia = date.getDate();
    const ultimo = D.ultimoDiaDelMes(anio, mes);
    const dos = (n) => String(n).padStart(2, '0');

    if (pre.periodo === 'semanal') {
      // La semana empieza el lunes. getDay() da 0 para el domingo.
      const desplazamiento = (date.getDay() + 6) % 7;
      const inicio = D.sumarDias(f, -desplazamiento);
      const fin = D.sumarDias(inicio, 6);
      return { inicio, fin, etiqueta: 'Semana del ' + D.fechaCorta(inicio) };
    }

    if (pre.periodo === 'mensual') {
      const inicio = anio + '-' + dos(mes) + '-01';
      const fin = anio + '-' + dos(mes) + '-' + dos(ultimo);
      return { inicio, fin, etiqueta: D.nombreMes(mes) + ' ' + anio };
    }

    if (pre.periodo === 'personalizado') return cicloPersonalizado(pre, f);

    // quincenal
    if (dia <= 15) {
      return {
        inicio: anio + '-' + dos(mes) + '-01',
        fin: anio + '-' + dos(mes) + '-15',
        etiqueta: '1 – 15 ' + D.nombreMes(mes)
      };
    }
    return {
      inicio: anio + '-' + dos(mes) + '-16',
      fin: anio + '-' + dos(mes) + '-' + dos(ultimo),
      etiqueta: '16 – ' + ultimo + ' ' + D.nombreMes(mes)
    };
  }

  /* Periodos que empiezan en los días del mes que uno elija.

     No todas las quincenas van del 1 al 15: pueden ir del 3 al 17 y del 18 al
     2 del mes siguiente. Con `cortes: [3, 18]` sale exactamente eso. Un solo
     corte da periodos mensuales que empiezan ese día; tres o más cortes
     también valen.

     Un corte que no existe en ese mes (31 en febrero) se recoge al último día
     del mes, que es lo que hace todo el mundo. */
  function cortesDe(pre) {
    const lista = (pre.cortes || [])
      .map((n) => Math.min(31, Math.max(1, Math.round(Number(n) || 0))))
      .filter((n) => n >= 1);
    const unicos = lista.filter((n, i) => lista.indexOf(n) === i).sort((a, b) => a - b);
    return unicos.length ? unicos : [1];
  }

  function cicloPersonalizado(pre, fechaIso) {
    const cortes = cortesDe(pre);
    const date = D.deIso(fechaIso);
    const anio = date.getFullYear();
    const mes = date.getMonth() + 1;

    // Todas las fechas de corte del mes anterior, este y el siguiente, en
    // orden. Con eso se sabe entre qué dos cortes cae la fecha, aunque el
    // periodo se salte de un mes al otro.
    const marcas = [];
    [-1, 0, 1].forEach((salto) => {
      const m = ((mes - 1 + salto) + 12) % 12 + 1;
      const a = anio + Math.floor((mes - 1 + salto) / 12);
      const ultimo = D.ultimoDiaDelMes(a, m);
      cortes.forEach((c) => {
        marcas.push(a + '-' + String(m).padStart(2, '0') + '-' + String(Math.min(c, ultimo)).padStart(2, '0'));
      });
    });
    marcas.sort();

    let inicio = marcas[0];
    let fin = null;
    for (let i = 0; i < marcas.length; i++) {
      if (marcas[i] <= fechaIso) inicio = marcas[i];
      else { fin = D.sumarDias(marcas[i], -1); break; }
    }
    if (!fin) fin = D.sumarDias(inicio, 30);

    return {
      inicio: inicio,
      fin: fin,
      etiqueta: D.fechaCorta(inicio) + ' – ' + D.fechaCorta(fin)
    };
  }

  function cicloActual(pre) { return cicloDe(pre, D.hoy()); }

  /* ---------- el importe de UN periodo suelto -------------------------------

     Un presupuesto que se repite lleva el mismo dinero cada periodo, y eso es
     lo normal. Pero una quincena puede traer aguinaldo y otra venir más
     floja: en `montos` se guarda el importe propio de ese periodo concreto,
     con la fecha en que empieza el periodo como clave.

     Es una excepción, no un cambio: el importe de siempre (`monto`) sigue
     mandando en todos los demás periodos, incluidos los que aún no han
     llegado. Quitar la excepción devuelve el periodo al de siempre.

     La clave es la fecha de inicio del periodo porque es lo único que lo
     identifica sin guardar los ciclos (ver la nota de arriba del archivo). Por
     eso, si se cambia cada cuánto se repite o los días de corte, las fechas de
     los periodos se mueven y las excepciones dejan de tener sentido: quien
     guarda ese cambio las borra a propósito, avisando antes.
  --------------------------------------------------------------------------- */

  /* La clave con la que se guarda cualquier cosa que sea DE UN PERIODO: su
     importe propio y sus gastos fijos.

     En los que se repiten es la fecha en que empieza el periodo, que es lo
     único que lo identifica sin guardar los ciclos. En los de una vez hay un
     solo periodo, así que se usa una clave fija: si se usara `inicio`, mover la
     fecha de inicio del presupuesto dejaría sus gastos fijos colgando de una
     fecha que ya no existe. */
  function claveDeCiclo(pre, ciclo) {
    if (!pre) return null;
    if (pre.tipo !== 'recurrente') return 'unico';
    return (ciclo && ciclo.inicio) ? ciclo.inicio : null;
  }

  function tieneMontoPropio(pre, ciclo) {
    if (!pre || pre.tipo !== 'recurrente') return false;
    const clave = claveDeCiclo(pre, ciclo);
    if (!clave) return false;
    return Number((pre.montos || {})[clave]) > 0;
  }

  function montoDeCiclo(pre, ciclo) {
    if (!pre) return 0;
    if (tieneMontoPropio(pre, ciclo)) return Number(pre.montos[claveDeCiclo(pre, ciclo)]);
    return Number(pre.monto) || 0;
  }

  /* Con 0 (o con el mismo importe de siempre) se quita la excepción. Poner a
     mano el mismo número que ya tenía el presupuesto no es una excepción: es
     no haber cambiado nada, y así ese periodo sigue al presupuesto si mañana
     se le sube el dinero a todos. */
  function setMontoDeCiclo(presupuestoId, ciclo, monto) {
    const pre = presupuesto(presupuestoId);
    const clave = claveDeCiclo(pre, ciclo);
    if (!pre || !clave) return null;
    if (!pre.montos) pre.montos = {};
    const n = Number(monto) || 0;
    if (n > 0 && n !== (Number(pre.monto) || 0)) pre.montos[clave] = n;
    else delete pre.montos[clave];
    save();
    return pre;
  }

  /* Las fechas de inicio de los periodos que tienen importe propio, en orden.
     Sirve para poder decir cuántos hay antes de borrarlos. */
  function periodosConMontoPropio(pre) {
    const montos = (pre && pre.montos) || {};
    return Object.keys(montos).filter((k) => Number(montos[k]) > 0).sort();
  }

  function olvidarMontosPropios(presupuestoId) {
    const pre = presupuesto(presupuestoId);
    if (!pre) return null;
    pre.montos = {};
    save();
    return pre;
  }

  /* Salta al ciclo anterior (-1) o al siguiente (+1). Se apoya en cicloDe con
     una fecha del ciclo vecino, para no repetir aquí las reglas del calendario.

     LAS DOS FLECHAS VAN SIEMPRE, y esto ya se hizo mal dos veces seguidas.

     Un presupuesto que se repite no tiene principio: se calcula el periodo que
     toque para la fecha que sea. Poner un tope sólo hacia atrás deja la
     navegación coja —hacia delante infinita, hacia atrás frenada— y eso se
     siente como una avería, no como una regla.

     Los dos intentos anteriores de frenarla y por qué fallaron:

     1. Un campo «empieza a contar desde», que venía con la fecha de hoy y de
        fábrica tapaba las quincenas anteriores, justo donde caen los gastos de
        la primera revisión del correo.
     2. El gasto más antiguo del presupuesto. Mejor, porque salía de los datos
        y no había nada que configurar, pero seguía atrancando: en un
        presupuesto SIN NINGÚN GASTO no había tope, así que la flecha de atrás
        no iba nunca — se podía avanzar al futuro y quedarse encerrado allí,
        sin manera de volver. Con gastos tampoco se podía mirar la quincena de
        antes de empezar a usar la app.

     Un periodo vacío no es un error que haya que impedir: se enseña vacío, que
     es la verdad, y «Ir al actual» devuelve a casa desde donde sea. */
  function cicloVecino(pre, ciclo, direccion) {
    if (!pre || pre.tipo !== 'recurrente' || !ciclo) return null;
    const f = direccion < 0 ? D.sumarDias(ciclo.inicio, -1) : D.sumarDias(ciclo.fin, 1);
    return cicloDe(pre, f);
  }

  function enCiclo(gasto, ciclo) {
    if (!ciclo) return true;
    if (ciclo.inicio && gasto.fecha < ciclo.inicio) return false;
    if (ciclo.fin && gasto.fecha > ciclo.fin) return false;
    return true;
  }

  /* ---------- gastos -------------------------------------------------------- */

  function gastos() { return load().gastos; }

  /* Convierte un importe de una moneda a otra con el tipo de cambio que se
     guardó en el gasto. Ese tipo se estampa al crearlo y no se vuelve a tocar:
     la compra ya se pagó a aquel precio. */
  function convertir(monto, desde, hasta, tipoCambio) {
    const n = Number(monto) || 0;
    if (desde === hasta) return n;
    const tc = Number(tipoCambio) || Number(ajustes().tipoCambio) || 1;
    if (desde === 'USD' && hasta === 'CRC') return D.redondear(n * tc, 'CRC');
    if (desde === 'CRC' && hasta === 'USD') return D.redondear(n / tc, 'USD');
    return n;
  }

  /* El importe total del gasto: lo que se pagó de verdad. Para los totales
     generales se cuenta UNA vez, aunque el gasto afecte a dos presupuestos. */
  function montoEnMonedaDe(gasto, moneda) {
    return convertir(gasto.monto, gasto.moneda, moneda, gasto.tipoCambio);
  }

  /* ---------- un gasto en varios presupuestos ------------------------------- */

  /* `asignaciones` dice cuánto se come el gasto de cada presupuesto, en la
     moneda del propio gasto. Hay dos formas de usarlo y las dos son legítimas:

     - **Completo en cada uno**: la cena del viaje sale de la quincena y además
       cuenta contra el presupuesto de Orlando. Los dos importes son el total.
     - **Repartido**: de una compra de ₡30.000, ₡20.000 son de la casa y
       ₡10.000 del viaje. Los importes suman el total.

     Lo que nunca se hace es sumar dos veces en los totales generales: esos
     usan `gasto.monto`, que es lo que salió del bolsillo. */
  function asignaciones(gasto) {
    return Array.isArray(gasto.asignaciones) ? gasto.asignaciones : [];
  }

  function presupuestosDe(gasto) {
    return asignaciones(gasto).map((a) => a.presupuestoId).filter(Boolean);
  }

  function primerPresupuesto(gasto) {
    const lista = presupuestosDe(gasto);
    return lista.length ? lista[0] : null;
  }

  function estaEn(gasto, presupuestoId) {
    return asignaciones(gasto).some((a) => a.presupuestoId === presupuestoId);
  }

  /* Lo que este gasto le quita a ESTE presupuesto, en la moneda del presupuesto. */
  function montoAsignadoEn(gasto, presupuestoId, moneda) {
    const a = asignaciones(gasto).find((x) => x.presupuestoId === presupuestoId);
    if (!a) return 0;
    return convertir(a.monto, gasto.moneda, moneda, gasto.tipoCambio);
  }

  /* Deja las asignaciones en forma válida: sin presupuestos que ya no existen,
     sin repetidos y con importes numéricos. Si se queda sin ninguna, se le
     pone el gasto entero en el primer presupuesto que haya, para que nunca
     exista un gasto huérfano. */
  function limpiarAsignaciones(lista, montoTotal) {
    const vistos = {};
    const salida = [];
    (lista || []).forEach((a) => {
      const id = a && a.presupuestoId;
      if (!id || vistos[id] || !presupuesto(id)) return;
      vistos[id] = true;
      salida.push({ presupuestoId: id, monto: Number(a.monto) || 0 });
    });
    if (!salida.length) {
      // Se prefiere uno activo: dejar el gasto colgando de un presupuesto
      // cerrado lo haría desaparecer del Resumen sin motivo.
      const primero = presupuestos()[0] || load().presupuestos[0];
      if (primero) salida.push({ presupuestoId: primero.id, monto: Number(montoTotal) || 0 });
    }
    return salida;
  }

  /* El orden de CUALQUIER lista de gastos, del más nuevo al más viejo. Vive
     aquí y no repartido por las pantallas para que la ficha del presupuesto y
     el Resumen no puedan ordenar distinto.

     Tres criterios, en este orden:

     1. **El día.** Es lo único que siempre se sabe.
     2. **La hora**, cuando se sabe. El correo del banco la trae y `bancos.js`
        ya la leía; lo que pasaba es que se tiraba al guardar el gasto, así que
        todas las compras de un mismo día quedaban empatadas y salían en el
        orden en que se apuntaron, no en el que ocurrieron.
     3. **El momento en que se escribió** (`ts`), sólo para deshacer empates.

     Los que no llevan hora van DESPUÉS de los que sí dentro de su día: no se
     sabe cuándo fueron, y colarlos arriba sería inventarse un orden. La cadena
     vacía ordena por debajo de cualquier «08:15» sola, sin caso aparte. */
  function porFechaYHora(a, b) {
    if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
    const ha = a.hora || '';
    const hb = b.hora || '';
    if (ha !== hb) return hb.localeCompare(ha);
    return (b.ts || 0) - (a.ts || 0);
  }

  function gastosDe(presupuestoId, ciclo) {
    return load().gastos
      .filter((g) => estaEn(g, presupuestoId))
      .filter((g) => enCiclo(g, ciclo))
      .sort(porFechaYHora);
  }

  function gasto(id) { return load().gastos.find((g) => g.id === id) || null; }

  function addGasto(entrada) {
    const d = load();
    const item = Object.assign({
      id: uid('gas'),
      moneda: d.ajustes.monedaPorDefecto,
      categoria: 'otros',
      comercio: '',
      nota: '',
      fecha: D.hoy(),
      hora: '',
      origen: 'manual',
      // El instante REAL en que se escribió, no la fecha elegida. Sólo se usa
      // para deshacer empates: el día y la hora del gasto ya los llevan `fecha`
      // y `hora`, así que `ts` no tiene que codificar nada más.
      ts: Date.now()
    }, entrada);
    item.hora = limpiarHora(item.hora);
    item.monto = Number(item.monto) || 0;
    // El tipo de cambio se estampa siempre, haga falta convertir o no: mañana
    // el gasto puede acabar en un presupuesto de la otra moneda.
    item.tipoCambio = Number(item.tipoCambio) || Number(d.ajustes.tipoCambio) || 1;
    item.asignaciones = limpiarAsignaciones(item.asignaciones, item.monto);
    d.gastos.push(item);
    save();
    return item;
  }

  /* 'HH:MM' en 24 horas, o cadena vacía si no se sabe. Nunca `undefined`: el
     orden compara horas como texto y un hueco tiene que ser comparable. */
  function limpiarHora(v) {
    const m = String(v || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return '';
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return '';
    return String(h).padStart(2, '0') + ':' + m[2];
  }

  function updateGasto(id, cambios) {
    const item = gasto(id);
    if (!item) return null;
    Object.assign(item, cambios);
    item.hora = limpiarHora(item.hora);
    item.monto = Number(item.monto) || 0;
    item.tipoCambio = Number(item.tipoCambio) || Number(ajustes().tipoCambio) || 1;
    item.asignaciones = limpiarAsignaciones(item.asignaciones, item.monto);
    save();
    return item;
  }

  function deleteGasto(id) {
    const d = load();
    d.gastos = d.gastos.filter((g) => g.id !== id);
    save();
  }

  /* ---------- saldos -------------------------------------------------------- */

  /* El resumen de un presupuesto dentro de un ciclo: cuánto había, cuánto se
     ha gastado, cuánto queda y a qué ritmo se puede gastar lo que queda. */
  function resumen(pre, ciclo) {
    const c = ciclo || cicloActual(pre);
    const lista = gastosDe(pre.id, c);
    const gastado = D.redondear(
      lista.reduce((suma, g) => suma + montoAsignadoEn(g, pre.id, pre.moneda), 0), pre.moneda);
    // El de siempre, salvo que ESTE periodo tenga uno propio. Todo lo que
    // enseña un importe de presupuesto sale de aquí, así que la excepción
    // llega sola al Resumen, a las tarjetas, a los gráficos y al texto que se
    // comparte, sin repetir la regla en cada sitio.
    const asignado = montoDeCiclo(pre, c);
    const propio = tieneMontoPropio(pre, c);

    /* Los gastos fijos y los otros gastos salen del presupuesto antes que nada:
       son dinero que ya está comprometido. `gastado` sigue significando lo
       mismo que siempre —compras, y solo compras—, así que ningún gráfico ni
       ningún tope cambia de sentido; lo que cambia es que `disponible` deja de
       contar un dinero que en realidad no está. */
    const fijos = totalApuntes(pre, c, 'fijos');
    const otros = totalApuntes(pre, c, 'otros');
    const noCompras = D.redondear(fijos + otros, pre.moneda);
    const paraCompras = D.redondear(asignado - noCompras, pre.moneda);
    const comprometido = D.redondear(noCompras + gastado, pre.moneda);
    const disponible = D.redondear(asignado - comprometido, pre.moneda);

    const hoy = D.hoy();
    let diasTotales = null;
    let diasRestantes = null;
    let porDia = null;

    if (c && c.inicio && c.fin) {
      diasTotales = D.diasEntre(c.inicio, c.fin);
      if (hoy > c.fin) diasRestantes = 0;
      else if (hoy < c.inicio) diasRestantes = diasTotales;
      else diasRestantes = D.diasEntre(hoy, c.fin);
      if (diasRestantes > 0 && disponible > 0) porDia = D.redondear(disponible / diasRestantes, pre.moneda);
    }

    return {
      ciclo: c,
      gastos: lista,
      numGastos: lista.length,
      asignado,
      asignadoPropio: propio,
      fijos,
      listaFijos: apuntesDe(pre, c, 'fijos'),
      otros,
      listaOtros: apuntesDe(pre, c, 'otros'),
      // Los dos juntos: es lo que hay que restar del presupuesto antes de saber
      // con cuánto se puede ir a comprar, y casi todas las pantallas lo quieren
      // así, de una pieza.
      noCompras,
      paraCompras,
      gastado,
      comprometido,
      disponible,
      // La barra mide el presupuesto ENTERO, lo comprometido incluido: si la
      // mitad del dinero ya está apartada, eso hay que verlo el día 1.
      consumido: D.porcentaje(comprometido, asignado),
      consumidoNoCompras: D.porcentaje(noCompras, asignado),
      excedido: comprometido > asignado,
      diasTotales,
      diasRestantes,
      porDia
    };
  }

  /* ---------- límites por categoría ----------------------------------------- */

  /* A partir de este porcentaje se avisa en ámbar. El mismo número se usa para
     la barra del presupuesto entero y para la de cada categoría: si fueran
     distintos, dos barras igual de llenas tendrían colores distintos y no se
     entendería por qué. */
  const AVISO = 85;

  function estadoDeTope(gastado, tope) {
    if (!tope) return 'ok';
    if (gastado >= tope) return 'pasado';
    return D.porcentaje(gastado, tope) >= AVISO ? 'aviso' : 'ok';
  }

  /* Los topes van por PERIODO, igual que el dinero del presupuesto: «del 3 al
     17 puedo gastar ₡15.000 en restaurantes» vuelve a empezar cada quincena.
     En un presupuesto de una vez hay un solo periodo, así que el tope vale
     para todo él. */
  function limitesDe(pre, ciclo) {
    const topes = (pre && pre.limites) || {};
    const claves = Object.keys(topes).filter((k) => Number(topes[k]) > 0);
    if (!claves.length) return [];

    const porClave = {};
    gastosDe(pre.id, ciclo).forEach((g) => {
      const k = g.categoria || 'otros';
      porClave[k] = (porClave[k] || 0) + montoAsignadoEn(g, pre.id, pre.moneda);
    });

    return claves.map((k) => {
      const tope = Number(topes[k]);
      const gastado = D.redondear(porClave[k] || 0, pre.moneda);
      return Object.assign({}, categoria(k), {
        limite: tope,
        gastado: gastado,
        restante: D.redondear(tope - gastado, pre.moneda),
        consumido: D.porcentaje(gastado, tope),
        estado: estadoDeTope(gastado, tope)
      });
    }).sort((a, b) => b.consumido - a.consumido);
  }

  /* El tope de UNA categoría, para avisar en el momento de apuntar el gasto.
     Devuelve null si esa categoría no tiene tope en ese presupuesto. */
  function limiteDe(pre, claveCategoria, ciclo) {
    if (!pre || !pre.limites || !Number(pre.limites[claveCategoria])) return null;
    return limitesDe(pre, ciclo).find((l) => l.key === claveCategoria) || null;
  }

  /* Para la tarjeta de la lista: si algo va mal, que se vea sin entrar. */
  function avisoDeLimites(pre, ciclo) {
    const lista = limitesDe(pre, ciclo);
    if (!lista.length) return null;
    const pasados = lista.filter((l) => l.estado === 'pasado').length;
    const cerca = lista.filter((l) => l.estado === 'aviso').length;
    if (!pasados && !cerca) return null;
    return { pasados, cerca, estado: pasados ? 'pasado' : 'aviso' };
  }

  function setLimite(presupuestoId, claveCategoria, monto) {
    const pre = presupuesto(presupuestoId);
    if (!pre) return null;
    if (!pre.limites) pre.limites = {};
    const n = Number(monto) || 0;
    if (n > 0) pre.limites[claveCategoria] = n;
    else delete pre.limites[claveCategoria];
    save();
    return pre;
  }

  /* Reparto por categoría dentro de un ciclo, de mayor a menor.

     Cada categoría sale dos veces: en la moneda del presupuesto (`total`) y en
     la de casa (`totalBase`), que es en la que se piensa. En un presupuesto en
     colones son el mismo número y sobra una; en uno en dólares es justo lo que
     hace falta para poder preguntar «¿y esto cuánto me costó de verdad?».

     Lo importante es CÓMO se convierte: compra a compra, cada una con el tipo
     de cambio que se le estampó el día que se pagó. Pasar al final el total de
     la categoría con el tipo de hoy daría otro número, y el malo: mezclaría
     compras hechas a precios distintos. */
  function porCategoria(pre, ciclo) {
    const lista = gastosDe(pre.id, ciclo);
    const base = ajustes().monedaPorDefecto || 'CRC';
    const mapa = {};
    const enCasa = {};
    lista.forEach((g) => {
      const key = g.categoria || 'otros';
      mapa[key] = (mapa[key] || 0) + montoAsignadoEn(g, pre.id, pre.moneda);
      enCasa[key] = (enCasa[key] || 0) + montoAsignadoEn(g, pre.id, base);
    });
    return Object.keys(mapa)
      .map((key) => Object.assign({}, categoria(key), {
        total: D.redondear(mapa[key], pre.moneda),
        totalBase: D.redondear(enCasa[key], base),
        monedaBase: base
      }))
      .sort((a, b) => b.total - a.total);
  }

  /* Gasto acumulado día a día dentro del ciclo. Alimenta el gráfico. */
  function porDia(pre, ciclo) {
    const c = ciclo || cicloActual(pre);
    if (!c || !c.inicio) return [];
    const finReal = c.fin || D.hoy();
    const lista = gastosDe(pre.id, c);
    const mapa = {};
    const cuantos = {};
    lista.forEach((g) => {
      mapa[g.fecha] = (mapa[g.fecha] || 0) + montoAsignadoEn(g, pre.id, pre.moneda);
      cuantos[g.fecha] = (cuantos[g.fecha] || 0) + 1;
    });

    const dias = [];
    let acumulado = 0;
    let cursor = c.inicio;
    let guardia = 0;
    while (cursor <= finReal && guardia++ < 400) {
      acumulado += mapa[cursor] || 0;
      dias.push({
        fecha: cursor,
        total: D.redondear(mapa[cursor] || 0, pre.moneda),
        n: cuantos[cursor] || 0,
        acumulado: D.redondear(acumulado, pre.moneda)
      });
      cursor = D.sumarDias(cursor, 1);
    }
    return dias;
  }

  /* ---------- gmail y bandeja de pendientes --------------------------------- */

  function gmail() { return load().gmail; }

  function setGmail(cambios) {
    Object.assign(load().gmail, cambios);
    save();
  }

  /* Sin lista propia se usan los remitentes de fábrica. Se guarda vacío en vez
     de copiarlos para que, si mañana se corrige una dirección en bancos.js, la
     corrección llegue sola a quien no la haya tocado. */
  function remitentes() {
    const propios = load().gmail.remitentes;
    return (propios && propios.length) ? propios : Bancos.REMITENTES.slice();
  }

  function pendientes() { return load().pendientes; }

  function pendiente(id) { return load().pendientes.find((p) => p.id === id) || null; }

  /* Devuelve false si ese movimiento ya se había apuntado, descartado o estaba
     esperando en la bandeja. Es lo que impide que el mismo gasto entre dos
     veces cuando el banco reenvía el aviso. */
  function addPendiente(datos) {
    const d = load();
    const huella = Bancos.huellaDe(datos);
    if (d.huellas.indexOf(huella) >= 0) return false;
    if (d.pendientes.some((p) => p.huella === huella)) return false;
    d.pendientes.push(Object.assign({ id: uid('pen'), huella: huella, visto: nowIso() }, datos));
    save();
    return true;
  }

  /* Quitar de la bandeja y recordar la huella, tanto si se apunta como si se
     descarta: en los dos casos ya está decidido y no debe volver a aparecer. */
  function cerrarPendiente(id) {
    const d = load();
    const item = pendiente(id);
    if (!item) return;
    if (item.huella && d.huellas.indexOf(item.huella) < 0) d.huellas.push(item.huella);
    if (d.huellas.length > 2000) d.huellas = d.huellas.slice(-2000);
    d.pendientes = d.pendientes.filter((p) => p.id !== id);
    save();
  }

  /* ---------- los correos que no se pudieron leer ---------------------------

     Antes la revisión decía «3 sin reconocer» y los tiraba. Eso es lo peor de
     los dos mundos: preocupa —parece que se han perdido tres compras— y no deja
     hacer nada al respecto, porque no se puede ni ver de qué correos hablaba.

     Ahora se guardan los cuatro datos que caben sin ocupar sitio: quién lo
     manda, el asunto, la fecha y el resumen corto que ya viene de Gmail. Con
     eso se ve en un vistazo si era una compra de verdad o el extracto del mes,
     y si era una compra se puede apuntar a mano desde ahí.

     El cuerpo del correo NO se guarda: ocuparía muchísimo y no hace falta para
     decidir. Para leerlo entero está el enlace al correo en Gmail.

     Se recuerda cuáles se descartaron —en `huellas`, con `nr|` delante— para
     que no vuelvan en cada revisión: siguen en el buzón y se leerían otra vez.
  --------------------------------------------------------------------------- */

  const TOPE_NORECON = 30;

  function noReconocidos() { return load().norecon || []; }

  function addNoReconocido(datos) {
    const d = load();
    if (!d.norecon) d.norecon = [];
    if (!datos || !datos.id) return false;
    if (d.huellas.indexOf('nr|' + datos.id) >= 0) return false;
    if (d.norecon.some((x) => x.id === datos.id)) return false;
    d.norecon.push(Object.assign({ visto: nowIso() }, datos));
    // Los más viejos se caen solos: esto es para mirar lo de estos días, no un
    // archivo de todo lo que el banco haya mandado nunca.
    if (d.norecon.length > TOPE_NORECON) d.norecon = d.norecon.slice(-TOPE_NORECON);
    save();
    return true;
  }

  function cerrarNoReconocido(id) {
    const d = load();
    if (d.huellas.indexOf('nr|' + id) < 0) d.huellas.push('nr|' + id);
    if (d.huellas.length > 2000) d.huellas = d.huellas.slice(-2000);
    d.norecon = (d.norecon || []).filter((x) => x.id !== id);
    save();
  }

  function nowIso() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString();
  }

  /* ---------- copia de seguridad -------------------------------------------- */

  function exportAll() { return JSON.stringify(load(), null, 2); }

  function importAll(json) {
    const parsed = JSON.parse(json);
    if (!parsed || !Array.isArray(parsed.presupuestos) || !Array.isArray(parsed.gastos)) {
      throw new Error('El archivo de copia no tiene el formato esperado.');
    }
    data = parsed;
    Object.keys(EMPTY).forEach((k) => { if (data[k] === undefined) data[k] = JSON.parse(JSON.stringify(EMPTY[k])); });
    if (!data.categorias || !data.categorias.length) data.categorias = JSON.parse(JSON.stringify(CATEGORIAS));
    // Hay que convertir aquí también, y no solo al abrir la app: una copia
    // guardada hace meses trae los gastos en el formato antiguo —y las
    // categorías de entonces— y `load` ya no vuelve a pasar por aquí.
    migrar(data);
    sembrarCategorias(data);
    save();
  }

  function clearAll() {
    data = JSON.parse(JSON.stringify(EMPTY));
    save();
  }

  function stats() {
    const d = load();
    return {
      presupuestos: d.presupuestos.length,
      gastos: d.gastos.length,
      categorias: d.categorias.length,
      pendientes: d.pendientes.length,
      sizeKb: Math.round((localStorage.getItem(KEY) || '').length / 1024)
    };
  }

  global.Store = {
    uid, load, save, claveDe,
    ajustes, setAjustes,
    categorias, categoria, addCategoria, updateCategoria, deleteCategoria,
    presupuestos, presupuesto, addPresupuesto, updatePresupuesto, deletePresupuesto, impactoDeBorrar,
    presupuestosCerrados, estadoDePresupuesto, estaActivo, vencido, archivar,
    fechaDeReferencia, cicloDeReferencia,
    cicloDe, cicloActual, cicloVecino, enCiclo, cortesDe,
    montoDeCiclo, tieneMontoPropio, setMontoDeCiclo, periodosConMontoPropio, olvidarMontosPropios,
    apuntesDe, totalApuntes, montoApuntadoEn, setApuntes, apuntesDelVecino,
    periodosConApuntes, olvidarApuntes,
    gastos, gasto, gastosDe, addGasto, updateGasto, deleteGasto, montoEnMonedaDe,
    asignaciones, presupuestosDe, primerPresupuesto, estaEn, montoAsignadoEn, convertir,
    porFechaYHora,
    gmail, setGmail, remitentes, pendientes, pendiente, addPendiente, cerrarPendiente,
    noReconocidos, addNoReconocido, cerrarNoReconocido,
    resumen, porCategoria, porDia,
    limitesDe, limiteDe, avisoDeLimites, setLimite, estadoDeTope, AVISO,
    exportAll, importAll, clearAll, stats,
    COLORES_PRESUPUESTO
  };

})(window);
