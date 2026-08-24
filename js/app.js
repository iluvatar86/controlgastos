/* ---------------------------------------------------------------------------
   app.js — Arranque y navegación entre pantallas.
--------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const el = D.el;
  const screen = document.getElementById('screen');
  const nav = document.getElementById('nav');

  const TABS = [
    {
      hash: '#/resumen', label: 'Resumen',
      icon: ['M4 19h16v2H4z', 'M6 11h3v6H6z', 'M10.5 7h3v10h-3z', 'M15 13h3v4h-3z']
    },
    {
      hash: '#/presupuestos', label: 'Presupuestos',
      icon: ['M4 5h13a2 2 0 0 1 2 2v1h-6a3 3 0 0 0 0 6h6v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
        'M14 10h7v2h-7a1 1 0 0 1 0-2z']
    },
    {
      hash: '#/nuevo', label: 'Apuntar',
      icon: ['M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z']
    },
    {
      hash: '#/ajustes', label: 'Ajustes',
      icon: ['M3 6h5v2H3z', 'M12 6h9v2h-9z', 'M8 4h4v6H8z',
        'M3 15h9v2H3z', 'M16 15h5v2h-5z', 'M12 13h4v6h-4z']
    }
  ];

  // Las pantallas que son un formulario a medias. Al salir de una de ellas por
  // otro sitio (una pestaña de abajo) el borrador se tira.
  const FORMULARIOS = ['presupuesto-nuevo', 'presupuesto-editar', 'nuevo', 'gasto'];

  /* Sin ningún presupuesto no hay resumen que enseñar: se entra por la lista,
     que es donde está el botón de crear el primero. */
  function pantallaDeInicio() {
    return Store.presupuestos().length ? 'resumen' : 'presupuestos';
  }

  function parseHash() {
    const parts = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    if (!parts.length) return { name: pantallaDeInicio(), args: [] };
    return { name: parts[0], args: parts.slice(1) };
  }

  // Qué pantalla se dibujó la última vez, para saber si esto es un cambio de
  // pantalla o sólo un refresco de la misma.
  let pantallaAnterior = null;

  function render() {
    const route = parseHash();
    const pantalla = route.name + '/' + route.args.join('/');
    const esRefresco = pantalla === pantallaAnterior;
    const alturaScroll = window.scrollY || document.documentElement.scrollTop || 0;
    let view;

    if (FORMULARIOS.indexOf(route.name) < 0) Views.olvidarBorradores();

    try {
      switch (route.name) {
        case 'presupuestos':
          view = Views.presupuestos();
          break;
        case 'presupuesto':
          view = Views.presupuestoDetalle(route.args[0]);
          break;
        case 'historial':
          view = Views.historial();
          break;
        case 'presupuesto-nuevo':
          view = Views.formPresupuesto(null);
          break;
        case 'presupuesto-editar':
          view = Views.formPresupuesto(route.args[0]);
          break;
        case 'nuevo':
          view = Views.formGasto({ presupuestoId: route.args[0] || null });
          break;
        case 'gasto':
          view = Views.formGasto({ id: route.args[0] });
          break;
        case 'categorias':
          view = Views.categoriasView();
          break;
        case 'bandeja':
          view = Gmail.bandeja();
          break;
        case 'ajustes':
          view = Views.ajustes();
          break;
        case 'resumen':
        default:
          view = Dashboard.view();
      }
    } catch (err) {
      console.error(err);
      view = el('div', [
        Views.helpers.header('Algo ha fallado'),
        el('section.card', [
          el('p', { text: 'La pantalla no se ha podido dibujar: ' + err.message }),
          el('a.btn', { href: '#/resumen', text: 'Volver al inicio' })
        ])
      ]);
    }

    D.clear(screen);
    screen.appendChild(view);

    // Al cambiar de pantalla se empieza por arriba. Si sólo se está
    // redibujando la misma —elegir una categoría, cambiar de quincena— hay que
    // quedarse donde estaba: saltar arriba desorienta.
    if (esRefresco) window.scrollTo(0, alturaScroll);
    else window.scrollTo(0, 0);

    pantallaAnterior = pantalla;
    paintNav(route.name);
  }

  function paintNav(current) {
    D.clear(nav);
    TABS.forEach((tab) => {
      const activa = ('#/' + current) === tab.hash;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = tab.icon.map((d) => '<path d="' + d + '" fill="currentColor"></path>').join('');
      nav.appendChild(el('a.tab', {
        href: tab.hash,
        class: 'tab' + (activa ? ' is-active' : ''),
        'aria-current': activa ? 'page' : null
      }, [svg, el('span', { text: tab.label })]));
    });
  }

  window.addEventListener('hashchange', render);

  // Avisa si se cierra la app con un gasto a medio escribir.
  window.addEventListener('beforeunload', (event) => {
    if (Views.hayBorrador()) { event.preventDefault(); event.returnValue = ''; }
  });

  render();

  /* Revisar el correo al abrir, si está puesto en Ajustes. Va después de
     dibujar y con un respiro por delante: primero que la app esté en pantalla,
     y ya luego que hable con Google. Nunca al revés. */
  setTimeout(() => {
    try { Gmail.revisionAutomatica(); } catch (err) { console.warn(err); }
  }, 400);

  /* ---------- instalación y funcionamiento sin conexión --------------------- */

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) =>
        console.warn('No se ha podido activar el modo sin conexión:', err));
    });
  }

  let installPrompt = null;
  const installBar = document.getElementById('install');

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    installBar.hidden = false;
  });

  installBar.querySelector('button.install-yes').addEventListener('click', async () => {
    installBar.hidden = true;
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt = null;
  });

  installBar.querySelector('button.install-no').addEventListener('click', () => {
    installBar.hidden = true;
  });

  window.addEventListener('appinstalled', () => { installBar.hidden = true; });

  global.App = { render: render };

})(window);
