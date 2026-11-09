/* Lógica compartida del cotizador para el backend Vercel (ES Modules). */
const C = (() => {
  var LIMITE_PRODUCTOS = 80, CANT_MIN = 1, CANT_MAX = 100000;
  var PLAZOS = ['Contado', '15 días', '30 días', '45 días', '60 días'];

  function norm(t) { return String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  /* Valor numérico de "2", "2.00", "2,5", "1/2", "1-1/4" o "1 1/4" */
  function valor(t) {
    var s = String(t).replace(',', '.'), m;
    if ((m = /^(\d+)[ -](\d+)\/(\d+)$/.exec(s))) return +m[1] + m[2] / m[3];
    if ((m = /^(\d+)\/(\d+)$/.exec(s))) return m[1] / m[2];
    if (/^\d*\.?\d+$/.test(s)) return parseFloat(s);
    return NaN;
  }

  /* Convierte un texto en términos de búsqueda.
     - Medidas mixtas "1 1/4" se unen; "2 pulgadas", 2" y 2'' quedan como 2.
     - "50x50" queda como medida y además aporta 50 y 50.
     - Los números se comparan por valor: 2.0 = 2.00 = 2. */
  function terminos(texto) {
    var s = norm(texto)
      .replace(/(^|[^\d.,\/])(\d{1,2})[ -](\d{1,2}\/\d{1,2})(?![\d\/])/g, '$1$2-$3')
      .replace(/(\d)\s*(?:pulgadas?|pulg|''|"|”|″)/g, '$1in ')
      .replace(/(\d)\s*mm\b/g, '$1 ')
      .replace(/(\d)\s*[x×*]\s*(?=\d)/g, '$1x');
    var out = [];
    s.split(/[^a-z0-9.,\/x-]+/).forEach(function (w) {
      w = w.replace(/^[.,\/-]+|[.,\/-]+$/g, '');
      if (!w) return;
      var pulg = /^(.+)in$/.exec(w);
      if (pulg && !isNaN(valor(pulg[1]))) { out.push({t: 'in', v: valor(pulg[1])}); return; }
      if (/^\d+(?:[.,]\d+)?(?:x\d+(?:[.,]\d+)?)+$/.test(w)) {
        var partes = w.split('x');
        out.push({t: 'dim', v: partes.map(function (p) { return valor(p); }).join('x')});
        partes.forEach(function (p) { out.push({t: 'num', v: valor(p)}); });
      } else if (!isNaN(valor(w))) {
        out.push({t: 'num', v: valor(w)});
      } else if (/^[a-z]/.test(w)) {
        out.push({t: 'txt', v: w});
      } else {
        out.push({t: 'txt', v: w});
      }
    });
    return out;
  }

  /* Sinónimos de cómo escribe el cliente: todo se lleva a una raíz común */
  var SIN = {tuberia: 'tub', tuberias: 'tub', tubo: 'tub', tubos: 'tub', tubular: 'tub', cuadrado: 'cuad', cuadrada: 'cuad',
    redondo: 'red', redonda: 'red', rectangular: 'rect', galvanizado: 'galva', galvanizada: 'galva', galv: 'galva',
    estructural: 'estruct', lamina: 'lamin', laminas: 'lamin', angulo: 'angul', angulos: 'angul'};
  var VACIAS = {de: 1, para: 1, el: 1, la: 1, los: 1, las: 1, y: 1, en: 1, con: 1, un: 1, una: 1, por: 1};
  function raiz(w) { return SIN[w] || w; }

  /* Índice de un producto: términos de nombre, descripción de lista, ítem, medida y espesor */
  function indexar(p) {
    var ts = terminos([p.nombre, p.desc_lista, p.item, p.medida, p.espesor, p.linea, p.tipo, p.fabricante].join(' '));
    p._txt = []; p._num = []; p._dim = []; p._in = [];
    ts.forEach(function (x) {
      if (x.t === 'txt') p._txt.push(raiz(x.v));
      else if (x.t === 'num') p._num.push(x.v);
      else if (x.t === 'in') { p._in.push(x.v); p._num.push(x.v); }
      else p._dim.push(x.v);
    });
    p._item = norm(p.item);
    return p;
  }

  function preparar(q) {
    return terminos(q).filter(function (x) { return !(x.t === 'txt' && VACIAS[x.v]); })
      .map(function (x) { return x.t === 'txt' ? {t: 'txt', v: raiz(x.v)} : x; });
  }

  /* ¿El producto cumple todos los términos de la búsqueda? */
  function coincide(p, qs) {
    if (!qs.length) return true;
    if (!p._txt) indexar(p);
    return qs.every(function (x) {
      if (x.t === 'num') return p._num.indexOf(x.v) > -1 || p._item === String(x.v);
      if (x.t === 'dim') return p._dim.indexOf(x.v) > -1;
      if (x.t === 'in') {
        /* 2" también es el tubo de 50x50 mm (la medida comercial en pulgadas) */
        if (p._in.indexOf(x.v) > -1) return true;
        var mm = x.v * 25.4;
        return p._dim.some(function (d) { var a = parseFloat(d); return Math.abs(a - mm) <= 2.5; });
      }
      for (var i = 0; i < p._txt.length; i++) {
        var w = p._txt[i];
        if (w.indexOf(x.v) === 0 || (w.length >= 4 && x.v.indexOf(w) === 0)) return true;
      }
      return false;
    });
  }

  function buscar(productos, q) {
    var qs = preparar(q);
    return productos.filter(function (p) { return coincide(p, qs); });
  }

  /* ---------- Medidas y espesores: etiqueta limpia y orden natural ---------- */
  function etiquetaMedida(m) {
    var s = String(m || '').trim();
    if (!s) return '';
    s = s.replace(/^(\d)(\d\/\d)"$/, '$1 $2"');            // 21/2"  -> 2 1/2"
    s = s.replace(/(\d)\s*[xX]\s*(\d)/g, '$1x$2');           // 50X50  -> 50x50
    return s;
  }
  function ordenMedida(m) {
    var s = etiquetaMedida(m).replace(',', '.'), r;
    if ((r = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/.exec(s))) return [2, +r[1], +r[2]];
    if (/"$/.test(s)) {
      var f = /(?:(\d+) )?(\d+)\/(\d+)"$/.exec(s);
      if (f) return [1, (f[1] ? +f[1] : 0) + f[2] / f[3], 0];
      var n = parseFloat(s);
      if (!isNaN(n)) return [1, n, 0];
    }
    var mm = parseFloat(s);
    if (!isNaN(mm)) return [3, mm, 0];
    return [4, 0, 0];
  }
  function compararMedidas(a, b) {
    var x = ordenMedida(a), y = ordenMedida(b);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || String(a).localeCompare(String(b), 'es');
  }

  /* Espesor: "2.0 mm", "2.00 mm" y "2 mm" son el mismo chip; los calibres en pulgadas van aparte */
  /* Calibres de lámina a mm (los mismos de la guía de la página) */
  var CALIBRES = {10: 3.42, 11: 3.04, 12: 2.66, 13: 2.28, 14: 1.90, 16: 1.52, 18: 1.21, 20: 0.91, 22: 0.76, 24: 0.61, 26: 0.46, 28: 0.38, 30: 0.30};
  function claveEspesor(e) {
    var s = String(e || '').trim(), r;
    if (!s || /^mm$/i.test(s)) return '';
    if ((r = /^(?:cal\.?\s*)?\.(\d{2,3})"?$/i.exec(s)) || (r = /^cal\.?\s*\.(\d{2,3})/i.exec(s)) || (r = /^(0\d{2,3})\s*mm$/i.exec(s))) return 'cal.' + r[1];
    if ((r = /^(?:cal\.?\s*)?((?:\d+ )?\d+\/\d+)"?$/i.exec(s))) return 'in:' + r[1];
    if ((r = /^cal\.?\s*(\d+)$/i.exec(s)) && CALIBRES[r[1]]) return 'cg:' + r[1];
    if ((r = /^(?:cal\.?\s*)?(\d+(?:[.,]\d+)?)\s*(?:mm)?$/i.exec(s)) && (/mm$/i.test(s) || /[.,]/.test(r[1]))) return 'mm:' + parseFloat(r[1].replace(',', '.'));
    return 'otro:' + s;
  }
  function etiquetaEspesor(clave) {
    if (!clave) return '';
    var t = clave.slice(clave.indexOf(':') + 1);
    if (clave.indexOf('mm:') === 0) return Number(t).toLocaleString('es-CO', {minimumFractionDigits: 1, maximumFractionDigits: 2}) + ' mm';
    if (clave.indexOf('cal.') === 0) return 'Cal. .' + clave.slice(4) + '″';
    if (clave.indexOf('in:') === 0) return t + '″';
    if (clave.indexOf('cg:') === 0) return 'Calibre ' + t;
    return t;
  }
  function mmDeClave(clave) {
    var t = clave.slice(clave.indexOf(':') + 1);
    if (clave.indexOf('mm:') === 0) return +t;
    if (clave.indexOf('cal.') === 0) return parseFloat('0.' + clave.slice(4)) * 25.4;
    if (clave.indexOf('in:') === 0) return valor(t.replace(' ', '-')) * 25.4;
    if (clave.indexOf('cg:') === 0) return CALIBRES[t];
    return 1e9;
  }
  function compararEspesores(a, b) { return mmDeClave(a) - mmDeClave(b) || String(a).localeCompare(String(b)); }

  /* ---------- Solicitud ---------- */
  function limpiar(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }
  function celular(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('57') === 0) d = d.slice(2);
    return d;
  }

  /* Valida los datos del cliente y la lista. Devuelve {ok, errores, datos} con todo limpio. */
  function validar(e) {
    e = e || {};
    var err = {}, d = {
      nombre: limpiar(e.nombre, 120), empresa: limpiar(e.empresa, 120), nit: limpiar(e.nit, 30),
      telefono: celular(e.telefono), correo: limpiar(e.correo, 120).toLowerCase(), ciudad: limpiar(e.ciudad, 120),
      plazo: PLAZOS.indexOf(e.plazo) > -1 ? e.plazo : '', comentarios: limpiar(e.comentarios, 1000),
      autorizacion: e.autorizacion === true || e.autorizacion === 'true' || e.autorizacion === 'on',
      productos: [], libres: []
    };
    if (d.nombre.length < 2) err.nombre = 'Escribe tu nombre.';
    if (!/^3\d{9}$/.test(d.telefono)) err.telefono = 'Escribe un celular de 10 dígitos que empiece por 3.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.correo)) err.correo = 'Escribe un correo válido.';
    if (d.ciudad.length < 2) err.ciudad = 'Escribe la ciudad u obra de entrega.';
    if (!d.autorizacion) err.autorizacion = 'Marca la autorización para que podamos contactarte.';
    (Array.isArray(e.productos) ? e.productos : []).forEach(function (p) {
      var q = Math.floor(+p.cantidad);
      if (!p || !p.ref) return;
      if (!(q >= CANT_MIN && q <= CANT_MAX)) { err.productos = 'Las cantidades deben estar entre 1 y 100.000.'; return; }
      d.productos.push({ref: limpiar(p.ref, 40).replace(/[\[\]]/g, ''), item: limpiar(p.item, 20), nombre: limpiar(p.nombre, 160).replace(/[\[\]]/g, ''), linea: limpiar(p.linea, 60), cantidad: q, peso: +p.peso || 0});
    });
    String(e.libres || '').split(/\n/).forEach(function (l) {
      l = limpiar(l, 160).replace(/[\[\]]/g, '');
      if (!l) return;
      var m = /^(\d+)\s*(?:x|×|-|:)?\s+(.+)$/i.exec(l);
      var q = m ? Math.min(CANT_MAX, Math.max(CANT_MIN, +m[1])) : 1;
      d.libres.push({cantidad: q, texto: m ? m[2] : l});
    });
    if (!d.productos.length && !d.libres.length) err.productos = 'Agrega al menos un producto o escribe lo que necesitas.';
    if (d.productos.length + d.libres.length > LIMITE_PRODUCTOS) err.productos = 'Puedes enviar hasta 80 productos por solicitud.';
    return {ok: !Object.keys(err).length, errores: err, datos: d};
  }

  /* Número de solicitud WEB-AAMMDD-HHMM-XXX, en hora de Bogotá */
  function numeroSolicitud(fecha, sufijo) {
    var f = new Date((fecha || new Date()).getTime() - 5 * 3600 * 1000);
    var p = function (n) { return String(n).padStart(2, '0'); };
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = sufijo || '';
    while (s.length < 3) s += abc.charAt(Math.floor(Math.random() * abc.length));
    return 'WEB-' + p(f.getUTCFullYear() % 100) + p(f.getUTCMonth() + 1) + p(f.getUTCDate()) + '-' + p(f.getUTCHours()) + p(f.getUTCMinutes()) + '-' + s;
  }

  function lineasDe(d) {
    var ls = [];
    d.productos.forEach(function (p) { if (p.linea && ls.indexOf(p.linea) < 0) ls.push(p.linea); });
    if (d.libres.length) ls.push('Otros (escritos por el cliente)');
    return ls;
  }
  function pesoTotal(d) { return d.productos.reduce(function (s, p) { return s + (p.peso || 0) * p.cantidad; }, 0); }

  /* Correo para el asesor. Etiquetas exactas: las lee el importador del cotizador de asesores. */
  function correoAsesor(d, numero) {
    var v = function (x) { return x || '-'; };
    var prods = d.productos.map(function (p) { return p.cantidad + ' x ' + p.nombre + ' — Ítem ' + p.item + ' [' + p.ref + ']'; })
      .concat(d.libres.map(function (l) { return l.cantidad + ' x ' + l.texto + ' [ref ?]'; }));
    var filas = [
      'Nombre: ' + d.nombre,
      'Empresa: ' + v(d.empresa),
      'NIT/CC: ' + v(d.nit),
      'Teléfono: ' + d.telefono,
      'Correo: ' + d.correo,
      'Ciudad / entrega: ' + d.ciudad,
      'Plazo de pago deseado: ' + v(d.plazo),
      'Línea de productos: ' + v(lineasDe(d).join(', ')),
      'Productos:'
    ].concat(prods, [
      'Comentarios: ' + v(d.comentarios),
      'Solicitud: ' + numero + ' · Origen: Cotizador web'
    ]);
    var texto = filas.join('\n');
    var html = '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#14213A">' +
      filas.map(function (f) { return '<div>' + escHtml(f) + '</div>'; }).join('') + '</div>';
    return {asunto: 'Nueva solicitud de cotización de ' + d.nombre, texto: texto, html: html};
  }

  /* Copia para el cliente: lo que pidió, sin precios, y el siguiente paso */
  function correoCliente(d, numero) {
    var prods = d.productos.map(function (p) { return p.cantidad + ' x ' + p.nombre; })
      .concat(d.libres.map(function (l) { return l.cantidad + ' x ' + l.texto; }));
    var peso = pesoTotal(d);
    var filas = ['Hola, ' + d.nombre + ':', '',
      'Recibimos tu solicitud ' + numero + '. Un asesor comercial te contactará con tu cotización.', '',
      'Esto fue lo que nos pediste:'].concat(prods.map(function (x) { return '• ' + x; }),
      peso ? ['', 'Peso aproximado: ' + Math.round(peso).toLocaleString('es-CO') + ' kg'] : [],
      ['', 'Entrega en: ' + d.ciudad, '',
       'Si quieres adelantar, escríbele a tu asesor por WhatsApp al 317 341 1301 con el número de tu solicitud.',
       'Atención: lunes a viernes de 7:10 a. m. a 4:30 p. m. y sábados de 8:00 a. m. a 12:00 m.', '',
       'Soluciones Tubulares S.A. · www.solucionestubulares.com']);
    return {asunto: 'Recibimos tu solicitud ' + numero + ' · Soluciones Tubulares', texto: filas.join('\n'),
      html: '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#14213A">' + filas.map(function (f) { return f ? '<div>' + escHtml(f) + '</div>' : '<br>'; }).join('') + '</div>'};
  }

  function escHtml(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  return {
    norm: norm, terminos: terminos, indexar: indexar, buscar: buscar, preparar: preparar, coincide: coincide,
    etiquetaMedida: etiquetaMedida, compararMedidas: compararMedidas,
    claveEspesor: claveEspesor, etiquetaEspesor: etiquetaEspesor, compararEspesores: compararEspesores,
    validar: validar, numeroSolicitud: numeroSolicitud, correoAsesor: correoAsesor, correoCliente: correoCliente,
    pesoTotal: pesoTotal, lineasDe: lineasDe, celular: celular,
    PLAZOS: PLAZOS, LIMITE_PRODUCTOS: LIMITE_PRODUCTOS, CANT_MAX: CANT_MAX
  };
})();

export default C;
