/* ---------------------------------------------------------------------------
   gmail.js — Conexión con Gmail y bandeja de gastos detectados.

   Cómo funciona, en corto: se pide permiso de SOLO LECTURA sobre Gmail con el
   botón de siempre de Google, se buscan únicamente los correos de los bancos
   de la lista, se lee cada uno con bancos.js y lo que se reconoce cae en una
   bandeja. Nada entra en un presupuesto sin que se confirme a mano.

   Tres cosas que conviene saber y que no son fallos:

   1. **Esto solo mira el correo cuando la app está abierta.** Una app web no
      puede leer el buzón con la app cerrada; no hay forma de hacerlo sin poner
      un servidor por medio. No se pierde ningún gasto: cada revisión mira los
      últimos 30 días y descarta lo que ya se decidió.
   2. **El permiso de Google caduca al cabo de una hora.** Mientras la sesión
      de Google siga abierta en el navegador se renueva sola y sin preguntar
      nada. Si no, hay que volver a pulsar Conectar.
   3. **El Client ID no es una contraseña.** Va a la vista en la app a
      propósito: es como se identifican las aplicaciones web ante Google. Lo
      que protege la cuenta es que Google solo acepta ese identificador desde
      la dirección web que se autorizó al crearlo.
--------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const el = D.el;

  const PERMISO = 'https://www.googleapis.com/auth/gmail.readonly';
  const CONECTOR = 'https://accounts.google.com/gsi/client';
  const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
  const MAXIMO_CORREOS = 100;

  let token = null;
  let caduca = 0;
  let cargando = null;

  /* ---------- permiso de Google --------------------------------------------- */

  function cargarConector() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (cargando) return cargando;
    cargando = new Promise((cumplir, fallar) => {
      const s = document.createElement('script');
      s.src = CONECTOR;
      s.async = true;
      s.defer = true;
      s.onload = () => cumplir();
      s.onerror = () => {
        cargando = null;
        fallar(new Error('No se ha podido cargar el conector de Google. Comprueba que hay conexión a internet.'));
      };
      document.head.appendChild(s);
    });
    return cargando;
  }

  function hayPermiso() { return !!token && Date.now() < caduca - 60000; }

  /* modo 'silencioso' no enseña ninguna ventana: sirve cuando ya se dio el
     permiso alguna vez y solo hace falta renovarlo. */
  function pedirPermiso(modo) {
    if (hayPermiso()) return Promise.resolve(token);

    const clientId = (Store.gmail().clientId || '').trim();
    if (!clientId) {
      return Promise.reject(new Error(
        'Falta el identificador de Google. Se pone en Ajustes → Conectar con Gmail.'));
    }

    /* Si no tiene ni la forma, no vale la pena ir a Google: contestaría
       «Error 401: invalid_client» en una pantalla suya que no explica nada.
       Mejor decirlo aquí, donde está el campo que hay que corregir. */
    if (!/^\d+-[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
      return Promise.reject(new Error(
        'El identificador de Google no tiene la forma correcta: debe acabar en ' +
        '«.apps.googleusercontent.com». Revísalo en Ajustes; lo más probable es que ' +
        'se cortara al pegarlo.'));
    }

    return cargarConector().then(() => new Promise((cumplir, fallar) => {
      const cliente = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: PERMISO,
        prompt: modo === 'silencioso' ? '' : 'consent',
        callback: (respuesta) => {
          if (respuesta.error) { fallar(new Error(explicar(respuesta.error))); return; }
          token = respuesta.access_token;
          caduca = Date.now() + (Number(respuesta.expires_in) || 3600) * 1000;
          Store.setGmail({ autorizado: true });
          cumplir(token);
        },
        error_callback: (err) => fallar(new Error(explicar(err && err.type)))
      });
      cliente.requestAccessToken();
    }));
  }

  function explicar(codigo) {
    const c = String(codigo || '');
    if (c === 'popup_closed' || c === 'popup_closed_by_user') return 'Se cerró la ventana de Google sin dar el permiso.';
    if (c === 'popup_failed_to_open') return 'El navegador ha bloqueado la ventana de Google. Vuelve a pulsar el botón.';
    if (c === 'access_denied') return 'Google no ha dado el permiso. Si la app está en modo de pruebas, tu cuenta tiene que estar en la lista de usuarios de prueba.';
    if (c === 'invalid_client') return 'Google no reconoce este identificador. Cópialo otra vez desde Google Cloud → Clients: suele ser que se cortó al pegarlo, o que se pegó el «Client secret» en su lugar.';
    return 'Google no ha dado el permiso' + (c ? ' (' + c + ').' : '.');
  }

  function desconectar() {
    if (token && window.google && google.accounts && google.accounts.oauth2) {
      try { google.accounts.oauth2.revoke(token); } catch (err) { /* da igual */ }
    }
    token = null;
    caduca = 0;
    Store.setGmail({ autorizado: false });
  }

  /* ---------- hablar con Gmail ---------------------------------------------- */

  function api(camino) {
    return fetch(API + camino, { headers: { Authorization: 'Bearer ' + token } })
      .then((r) => {
        if (r.status === 401) {
          token = null;
          throw new Error('El permiso de Google ha caducado. Vuelve a pulsar «Conectar con Gmail».');
        }
        if (r.status === 403) {
          throw new Error('Google ha rechazado la petición. Comprueba que la API de Gmail está activada en el proyecto ' +
            'y que tu cuenta está en la lista de usuarios de prueba.');
        }
        if (!r.ok) throw new Error('Gmail ha respondido con un error ' + r.status + '.');
        return r.json();
      });
  }

  /* Gmail devuelve el texto en base64 con dos letras cambiadas (- y _ en vez
     de + y /) y a veces sin el relleno del final. Y hay que decodificarlo como
     UTF-8 o las tildes salen rotas. */
  function decodificar(dato) {
    let s = String(dato || '').replace(/-/g, '+').replace(/_/g, '/');
    s += '='.repeat((4 - s.length % 4) % 4);
    const binario = atob(s);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  /* Un correo puede venir en varios trozos anidados. Se prefiere el HTML, que
     es donde estos bancos ponen la tabla con los datos. */
  function cuerpoDe(parte) {
    let html = '';
    let plano = '';
    (function recorrer(p) {
      if (!p) return;
      const tipo = String(p.mimeType || '').toLowerCase();
      if (p.body && p.body.data) {
        if (tipo === 'text/html' && !html) html = decodificar(p.body.data);
        else if (tipo === 'text/plain' && !plano) plano = decodificar(p.body.data);
      }
      (p.parts || []).forEach(recorrer);
    })(parte);
    return html ? { cuerpo: html, esHtml: true } : { cuerpo: plano, esHtml: false };
  }

  function cabecera(parte, nombre) {
    const lista = (parte && parte.headers) || [];
    const buscada = nombre.toLowerCase();
    for (let i = 0; i < lista.length; i++) {
      if (String(lista[i].name).toLowerCase() === buscada) return lista[i].value;
    }
    return '';
  }

  /* La fecha del propio correo, en horario de aquí. Solo se usa de respaldo,
     cuando el cuerpo no trae fecha. */
  function fechaDelCorreo(mensaje) {
    const ms = Number(mensaje.internalDate);
    if (!ms) return D.hoy();
    return D.aIso(new Date(ms));
  }

  /* Dos formas de buscar, y la diferencia importa cuando esto se hace solo:

     - **A fondo** (el botón): los últimos 30 días enteros. Vale para recuperar
       cualquier cosa que se hubiera perdido.
     - **Solo lo nuevo** (la revisión automática): desde la última vez. Gmail
       entiende `after:` con segundos, así que se le pide exactamente eso.

     Sin esto, revisar al abrir la app se bajaría cien correos cada vez y se
     comería los datos del móvil para no encontrar nada nuevo casi nunca.

     Se dejan DOS DÍAS de solape hacia atrás a propósito: un correo puede
     entregarse con retraso y aparecer con fecha anterior a la última revisión.
     Volver a leerlo no cuesta nada —la huella impide que se duplique— pero
     perderlo sí. */
  const SOLAPE_DIAS = 2;

  function consulta(desdeIso) {
    const remitentes = Store.remitentes();
    const de = '(' + remitentes.map((r) => 'from:' + r).join(' OR ') + ')';

    if (desdeIso) {
      const desde = new Date(desdeIso).getTime() - SOLAPE_DIAS * 86400000;
      return de + ' after:' + Math.floor(desde / 1000);
    }
    const dias = Number(Store.gmail().diasAtras) || 30;
    return de + ' newer_than:' + dias + 'd';
  }

  /* Revisa el correo y deja en la bandeja lo que reconozca.

     opciones.alAvanzar(hechos, total) se llama en cada correo, para la barra.
     opciones.soloNuevo mira solo desde la última revisión.
     opciones.silencioso no abre ninguna ventana de Google: si el permiso no se
     puede renovar sin preguntar, falla y ya está. Es lo que hace falta en la
     revisión automática, donde no ha habido ningún toque del usuario. */
  function revisar(opciones) {
    const op = opciones || {};
    const alAvanzar = op.alAvanzar;
    const g = Store.gmail();
    const primeraVez = !g.autorizado;

    if (op.silencioso && primeraVez) {
      return Promise.reject(new Error('Todavía no has dado permiso a Google.'));
    }

    const desde = op.soloNuevo ? g.ultimaRevision : null;

    return pedirPermiso((primeraVez && !op.silencioso) ? 'interactivo' : 'silencioso')
      .then(() => api('/messages?maxResults=' + MAXIMO_CORREOS + '&q=' + encodeURIComponent(consulta(desde))))
      .then((lista) => {
        const ids = lista.messages || [];
        const cuenta = { total: ids.length, nuevos: 0, repetidos: 0, noReconocidos: 0 };

        // De uno en uno a propósito: lanzar cien peticiones a la vez hace que
        // Google devuelva errores de "demasiadas peticiones".
        return ids.reduce((cadena, item, i) => cadena.then(() => {
          if (alAvanzar) alAvanzar(i + 1, ids.length);
          return api('/messages/' + item.id + '?format=full').then((mensaje) => {
            const cuerpo = cuerpoDe(mensaje.payload);
            const datos = Bancos.leer({
              de: cabecera(mensaje.payload, 'From'),
              asunto: cabecera(mensaje.payload, 'Subject'),
              cuerpo: cuerpo.cuerpo,
              esHtml: cuerpo.esHtml,
              fechaCorreo: fechaDelCorreo(mensaje)
            });
            if (!datos) { cuenta.noReconocidos++; return; }
            datos.mensajeId = item.id;
            if (Store.addPendiente(datos)) cuenta.nuevos++; else cuenta.repetidos++;
          });
        }), Promise.resolve()).then(() => {
          Store.setGmail({ ultimaRevision: new Date().toISOString(), ultimoFallo: null });
          return cuenta;
        });
      });
  }

  /* ---------- la bandeja ----------------------------------------------------- */

  let ultimoResumen = null;
  let revisando = false;

  function estadoDeRevision() { return { revisando: revisando, resumen: ultimoResumen }; }

  /* La revisión de siempre: la que lanza el botón. Va a fondo —los 30 días— y
     sí puede abrir la ventana de Google, porque viene de un toque. */
  function lanzarRevision(despues) {
    if (revisando) return;
    revisando = true;
    ultimoResumen = { texto: 'Conectando con Gmail…', error: false };
    App.render();

    revisar({
      alAvanzar: (hechos, total) => {
        ultimoResumen = { texto: 'Leyendo correo ' + hechos + ' de ' + total + '…', error: false };
        const aviso = document.querySelector('.revision-estado');
        if (aviso) aviso.textContent = ultimoResumen.texto;
      }
    }).then((cuenta) => {
      revisando = false;
      ultimoResumen = { texto: resumenLegible(cuenta), error: false };
      if (despues) despues();
      App.render();
    }).catch((err) => {
      revisando = false;
      ultimoResumen = { texto: err.message, error: true };
      Store.setGmail({ ultimoFallo: err.message });
      App.render();
    });
  }

  /* ---------- revisar sola al abrir la app ---------------------------------- */

  const HORAS_DE_ESPERA = 6;

  /* ¿Toca revisar ahora? Separado de la revisión en sí para poder comprobarlo
     sin tener que hablar con Google. */
  function tocaRevisar(ahora) {
    const g = Store.gmail();
    if (!g.clientId) return { toca: false, motivo: 'sin identificador de Google' };
    if (!g.autorizado) return { toca: false, motivo: 'todavía no se ha dado el permiso' };

    const modo = g.revisarAlAbrir || 'cada6h';
    if (modo === 'nunca') return { toca: false, motivo: 'apagado en Ajustes' };
    if (modo === 'siempre') return { toca: true, motivo: 'cada vez que se abre' };

    if (!g.ultimaRevision) return { toca: true, motivo: 'nunca se ha revisado' };
    const pasadas = ((ahora || Date.now()) - new Date(g.ultimaRevision).getTime()) / 3600000;
    if (pasadas >= HORAS_DE_ESPERA) return { toca: true, motivo: 'han pasado ' + Math.floor(pasadas) + ' h' };
    return { toca: false, motivo: 'se revisó hace menos de ' + HORAS_DE_ESPERA + ' h' };
  }

  /* Se llama al arrancar la app. Es deliberadamente MUDA:

     - no abre ninguna ventana de Google (no ha habido ningún toque del
       usuario, así que el navegador la bloquearía de todos modos);
     - si falla, no interrumpe con ningún aviso: se guarda el motivo y se ve en
       Ajustes y en la bandeja, donde está el botón para hacerlo a mano;
     - solo redibuja la pantalla si de verdad encontró algo, para no dar un
       salto delante de las narices de quien está leyendo. */
  function revisionAutomatica() {
    if (revisando) return Promise.resolve(null);
    const decision = tocaRevisar();
    if (!decision.toca) return Promise.resolve(null);

    revisando = true;
    return revisar({ soloNuevo: true, silencioso: true })
      .then((cuenta) => {
        revisando = false;
        ultimoResumen = { texto: resumenLegible(cuenta), error: false };
        if (cuenta.nuevos) App.render();
        return cuenta;
      })
      .catch((err) => {
        revisando = false;
        Store.setGmail({ ultimoFallo: err.message });
        console.warn('La revisión automática del correo no salió:', err.message);
        return null;
      });
  }

  function resumenLegible(c) {
    if (!c.total) return 'No hay ningún correo nuevo de los bancos.';
    const partes = [];
    partes.push(c.nuevos ? c.nuevos + (c.nuevos === 1 ? ' gasto nuevo' : ' gastos nuevos') : 'ningún gasto nuevo');
    if (c.repetidos) partes.push(c.repetidos + ' ya estaban');
    if (c.noReconocidos) partes.push(c.noReconocidos + ' sin reconocer');
    return 'Revisados ' + c.total + ' correos: ' + partes.join(', ') + '.';
  }

  function bandeja() {
    const lista = Store.pendientes().slice().sort((a, b) =>
      (b.fecha + (b.hora || '')).localeCompare(a.fecha + (a.hora || '')));
    const presupuestos = Store.presupuestos();

    return el('div', [
      Views.helpers.volver('#/resumen', 'Resumen'),
      Views.helpers.header('Gastos detectados en el correo',
        lista.length ? lista.length + (lista.length === 1 ? ' esperando' : ' esperando') : 'Nada esperando'),

      barraDeRevision(),

      !presupuestos.length ? Views.helpers.vacio('Antes hace falta un presupuesto',
        'Los gastos detectados tienen que ir a algún sitio.',
        el('a.btn.btn-primary', { href: '#/presupuesto-nuevo', text: 'Crear un presupuesto' })) : null,

      !lista.length && presupuestos.length ? Views.helpers.vacio('La bandeja está vacía',
        'Cuando revises el correo, las compras que reconozca aparecerán aquí para que las confirmes.') : null,

      lista.length && presupuestos.length ? el('div.pendientes', lista.map(
        (p) => tarjetaPendiente(p, presupuestos))) : null,

      lista.length > 1 ? el('button.btn.btn-danger.btn-block', {
        type: 'button', text: 'Descartar los ' + lista.length,
        onclick: () => {
          if (!confirm('Se descartarán los ' + lista.length + ' gastos de la bandeja. No se apuntará ninguno.')) return;
          Store.pendientes().slice().forEach((p) => Store.cerrarPendiente(p.id));
          App.render();
        }
      }) : null
    ]);
  }

  function barraDeRevision() {
    const g = Store.gmail();
    return el('section.card', [
      el('button.btn.btn-primary.btn-block', {
        type: 'button',
        disabled: revisando,
        text: revisando ? 'Revisando…' : 'Revisar el correo ahora',
        onclick: () => lanzarRevision()
      }),
      ultimoResumen ? el('p.revision-estado', {
        class: 'revision-estado' + (ultimoResumen.error ? ' is-error' : ''),
        text: ultimoResumen.texto
      }) : null,
      g.ultimaRevision ? el('p.hint', {
        text: 'Última revisión: ' + cuandoFue(g.ultimaRevision) +
          (g.revisarAlAbrir === 'nunca' ? '' : ' · también revisa sola al abrir la app')
      }) : el('p.hint', {
        text: 'Solo se leen los correos de los bancos de la lista, y solo para leerlos.'
      }),

      // Si la revisión automática falló, aquí es donde se entera uno: no
      // interrumpe, pero tampoco se queda callada para siempre.
      g.ultimoFallo && !revisando ? el('p.revision-estado.is-error', {
        text: 'La última revisión automática no salió: ' + g.ultimoFallo +
          ' Prueba con el botón de arriba.'
      }) : null
    ]);
  }

  function cuandoFue(iso) {
    const d = new Date(iso);
    const dia = D.aIso(d);
    const hora = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (dia === D.hoy()) return 'hoy a las ' + hora;
    if (dia === D.sumarDias(D.hoy(), -1)) return 'ayer a las ' + hora;
    return D.fechaMedia(dia) + ' a las ' + hora;
  }

  function tarjetaPendiente(p, presupuestos) {
    // El presupuesto que se recordó de la última vez puede haberse desactivado
    // desde entonces. Si ya no está en la lista, se cae al primero: sin esto
    // el gasto se apuntaría a un presupuesto que ni siquiera se ve.
    const disponibles = presupuestos.map((x) => x.id);
    let elegido = p.presupuestoId || Store.gmail().presupuestoPorDefecto;
    if (disponibles.indexOf(elegido) < 0) elegido = presupuestos[0].id;

    // Lo que se toca en la tarjeta se guarda aquí hasta que se pulse Apuntar.
    const cambios = {
      comercio: p.comercio,
      monto: String(p.monto),
      presupuestoId: elegido,
      categoria: p.categoria || 'otros'
    };

    const inComercio = el('input', {
      type: 'text', value: cambios.comercio, placeholder: 'Comercio',
      oninput: (e) => { cambios.comercio = e.target.value; }
    });

    const inMonto = el('input.in-amount-sm', {
      type: 'text', inputmode: 'decimal', value: cambios.monto,
      oninput: (e) => { cambios.monto = e.target.value; }
    });

    const selPresupuesto = el('select', {
      onchange: (e) => { cambios.presupuestoId = e.target.value; }
    }, presupuestos.map((x) => el('option', {
      value: x.id, selected: x.id === cambios.presupuestoId, text: (x.emoji || '') + ' ' + x.nombre
    })));

    const selCategoria = el('select', {
      onchange: (e) => { cambios.categoria = e.target.value; }
    }, Store.categorias().map((c) => el('option', {
      value: c.key, selected: c.key === cambios.categoria, text: c.emoji + '  ' + c.nombre
    })));

    return el('article.card.pendiente', [
      el('div.pendiente-head', [
        el('span.banco-chip', { text: p.banco }),
        el('span.ref', {
          text: D.fechaMedia(p.fecha) + (p.hora ? ' · ' + p.hora : '') +
            (p.tarjeta ? ' · ****' + p.tarjeta : '')
        })
      ]),

      p.aprobada === false ? el('p.date-warning', {
        text: 'Este movimiento no aparece como aprobado en el correo (' + (p.tipo || 'sin tipo') +
          '). Míralo antes de apuntarlo.'
      }) : null,

      el('div.pendiente-linea', [
        el('div.field', [el('span', { text: 'Comercio' }), inComercio]),
        el('div.field.field-monto', [
          el('span', { text: 'Importe (' + (p.moneda === 'USD' ? 'dólares' : 'colones') + ')' }),
          inMonto
        ])
      ]),

      el('div.pendiente-linea', [
        el('div.field', [el('span', { text: 'Presupuesto' }), selPresupuesto]),
        el('div.field', [el('span', { text: 'Categoría' }), selCategoria])
      ]),

      el('div.form-actions', [
        el('button.btn', {
          type: 'button', text: 'Descartar',
          onclick: () => {
            Store.cerrarPendiente(p.id);
            App.render();
          }
        }),
        el('button.btn.btn-primary', {
          type: 'button', text: 'Apuntar',
          onclick: () => apuntar(p, cambios)
        })
      ])
    ]);
  }

  function apuntar(p, cambios) {
    const monto = D.leerImporte(cambios.monto);
    if (monto === null || monto <= 0) { alert('El importe no se entiende.'); return; }

    Store.addGasto({
      asignaciones: [{ presupuestoId: cambios.presupuestoId, monto: monto }],
      monto: monto,
      moneda: p.moneda,
      categoria: cambios.categoria,
      comercio: (cambios.comercio || '').trim(),
      nota: p.banco + (p.tarjeta ? ' ****' + p.tarjeta : ''),
      fecha: p.fecha,
      origen: 'gmail',
      ts: D.deIso(p.fecha).getTime()
    });

    // Se recuerda el presupuesto elegido: lo normal es que el siguiente vaya
    // al mismo, y así no hay que tocarlo en cada tarjeta.
    Store.setGmail({ presupuestoPorDefecto: cambios.presupuestoId });
    Store.cerrarPendiente(p.id);
    App.render();
  }

  global.Gmail = {
    bandeja, revisar, lanzarRevision, revisionAutomatica, tocaRevisar,
    desconectar, hayPermiso, estadoDeRevision, barraDeRevision, cuandoFue,
    consulta, HORAS_DE_ESPERA, PERMISO
  };

})(window);
