/* POST /api/cotizar: valida la solicitud, asigna asesor y envía correos.
 * Autenticación Microsoft Graph mediante certificado.
 * Variables:
 * MS_TENANT_ID, MS_CLIENT_ID, MS_CERT_THUMBPRINT,
 * MS_CERT_PRIVATE_KEY, MAIL_FROM, ASESOR_CORREO,
 * ASESOR_NOMBRE, MODO_PRUEBA, FRONTEND_ORIGINS.
 */

import C from '../js/cotizar-core.server.js';
import { asignar } from './_asesores.js';
import { createSign, randomUUID } from 'node:crypto';

const CATALOGO_URL = 'https://cotizador-st-ten.vercel.app/catalogo-web.json';
const MAIL_FROM = process.env.MAIL_FROM || 'mercadeo@solucionestubulares.com';
const LIMITE_POR_IP = 5;
const VENTANA_MS = 10 * 60 * 1000;

const visitas = new Map();
let catalogoCache = null;
let catalogoCacheHasta = 0;
let tokenCache = null;
let tokenCacheHasta = 0;

const ORIGENES = (
  process.env.FRONTEND_ORIGINS ||
  'https://solucionestubulares.com,https://www.solucionestubulares.com'
).split(',').map(x => x.trim()).filter(Boolean);

function cors(req, res) {
  const origen = req.headers.origin;
  if (origen && ORIGENES.includes(origen)) {
    res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

function responder(res, codigo, objeto) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(codigo).json(objeto);
}

function permitido(ip) {
  const ahora = Date.now();
  const lista = (visitas.get(ip) || []).filter(
    t => ahora - t < VENTANA_MS
  );

  if (lista.length >= LIMITE_POR_IP) {
    visitas.set(ip, lista);
    return false;
  }

  lista.push(ahora);
  visitas.set(ip, lista);

  if (visitas.size > 5000) visitas.clear();
  return true;
}

async function leerCuerpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);

  const partes = [];
  let tam = 0;

  for await (const parte of req) {
    tam += parte.length;
    if (tam > 100000) throw new Error('Solicitud demasiado grande');
    partes.push(parte);
  }

  return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}');
}

async function cargarCatalogo() {
  if (catalogoCache && Date.now() < catalogoCacheHasta) {
    return catalogoCache;
  }

  const respuesta = await fetch(CATALOGO_URL);
  if (!respuesta.ok) {
    throw new Error(`Catálogo HTTP ${respuesta.status}`);
  }

  const datos = await respuesta.json();
  const mapa = new Map((datos.productos || []).map(p => [p.ref, p]));

  catalogoCache = mapa;
  catalogoCacheHasta = Date.now() + 3600 * 1000;

  return mapa;
}

function b64(texto) {
  return Buffer.from(texto, 'utf8').toString('base64');
}

function encabezado(texto) {
  return /^[\x20-\x7e]*$/.test(texto)
    ? texto
    : `=?UTF-8?B?${b64(texto)}?=`;
}

function mime(m) {
  const limite = `st-${Date.now().toString(36)}`;
  const partes = texto => b64(texto).replace(/.{76}/g, '$&\r\n');

  return [
    `From: Soluciones Tubulares <${m.de}>`,
    `To: ${m.para}`,
    m.cco ? `Bcc: ${m.cco}` : null,
    m.responderA ? `Reply-To: ${m.responderA}` : null,
    `Subject: ${encabezado(m.asunto)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${limite}"`,
    '',
    `--${limite}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    partes(m.texto),
    `--${limite}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    partes(m.html),
    `--${limite}--`,
    ''
  ].filter(x => x !== null).join('\r\n');
}

function base64url(valor) {
  return Buffer.from(valor)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function thumbprintBase64Url(valor) {
  const limpio = String(valor || '').replace(/[:\s]/g, '');

  if (/^[a-fA-F0-9]{40}$/.test(limpio)) {
    return base64url(Buffer.from(limpio, 'hex'));
  }

  const normalizado = String(valor || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  return base64url(Buffer.from(normalizado, 'base64'));
}

/* Genera el JWT firmado con el certificado */
function crearClientAssertion(tenantId, clientId, thumbprint, privateKey) {
  const ahora = Math.floor(Date.now() / 1000);

  const audiencia =
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;

  const encabezadoJWT = {
    alg: 'RS256',
    typ: 'JWT',
    x5t: thumbprintBase64Url(thumbprint)
  };

  const claims = {
    aud: audiencia,
    iss: clientId,
    sub: clientId,
    jti: randomUUID(),
    nbf: ahora - 60,
    exp: ahora + 600
  };

  const contenido =
    `${base64url(JSON.stringify(encabezadoJWT))}.` +
    `${base64url(JSON.stringify(claims))}`;

  const clave = String(privateKey || '')
    .replace(/\\n/g, '\n')
    .trim();

  if (
    !clave.includes('-----BEGIN PRIVATE KEY-----') &&
    !clave.includes('-----BEGIN RSA PRIVATE KEY-----')
  ) {
    throw new Error(
      'MS_CERT_PRIVATE_KEY no contiene una clave privada PEM válida'
    );
  }

  const firmador = createSign('RSA-SHA256');
  firmador.update(contenido);
  firmador.end();

  const firma = firmador.sign(clave);

  return `${contenido}.${base64url(firma)}`;
}

/* Obtiene el token de Microsoft Graph usando el certificado */
async function tokenGraph() {
  if (tokenCache && Date.now() < tokenCacheHasta) {
    return tokenCache;
  }

  const tenantId = process.env.MS_TENANT_ID;
  const clientId = process.env.MS_CLIENT_ID;
  const thumbprint = process.env.MS_CERT_THUMBPRINT;
  const privateKey = process.env.MS_CERT_PRIVATE_KEY;

  if (!tenantId || !clientId || !thumbprint || !privateKey) {
    throw new Error(
      'Faltan variables de autenticación por certificado en Vercel'
    );
  }

  const endpoint =
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;

  const assertion = crearClientAssertion(
    tenantId,
    clientId,
    thumbprint,
    privateKey
  );

  const respuesta = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
      client_assertion_type:
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion
    })
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    console.error(
      'Microsoft token endpoint:',
      respuesta.status,
      detalle.slice(0, 1500)
    );
    throw new Error(`Token Microsoft HTTP ${respuesta.status}`);
  }

  const datos = await respuesta.json();

  tokenCache = datos.access_token;
  tokenCacheHasta =
    Date.now() + Math.max(60, (datos.expires_in || 3600) - 120) * 1000;

  return tokenCache;
}

async function enviarCorreo(m) {
  const token = await tokenGraph();

  const respuesta = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(m.de)}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/plain'
      },
      body: b64(mime(m))
    }
  );

  if (respuesta.status !== 202) {
    throw new Error(
      `Microsoft Graph sendMail HTTP ${respuesta.status}`
    );
  }
}

export default async function handler(req, res) {
  cors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return responder(res, 405, {
      ok: false,
      error: 'Método no permitido.'
    });
  }

  const ip = String(
    req.headers['x-forwarded-for'] ||
    req.socket?.remoteAddress ||
    ''
  ).split(',')[0].trim();

  if (!permitido(ip)) {
    return responder(res, 429, {
      ok: false,
      error: 'Recibimos varias solicitudes seguidas desde tu conexión. Espera unos minutos o escríbenos por WhatsApp al 317 341 1301.'
    });
  }

  let cuerpo;

  try {
    cuerpo = await leerCuerpo(req);
  } catch {
    return responder(res, 400, {
      ok: false,
      error: 'No pudimos leer la solicitud.'
    });
  }

  if (cuerpo?.website) {
    return responder(res, 200, {
      ok: true,
      numero: C.numeroSolicitud()
    });
  }

  const validacion = C.validar(cuerpo);

  if (!validacion.ok) {
    return responder(res, 400, {
      ok: false,
      error: Object.values(validacion.errores).join(' '),
      errores: validacion.errores
    });
  }

  const datos = validacion.datos;

  let catalogo;

  try {
    catalogo = await cargarCatalogo();
  } catch (error) {
    console.error(
      'cotizar: no se pudo cargar el catálogo',
      error.message
    );

    return responder(res, 503, {
      ok: false,
      error: 'El catálogo no está disponible temporalmente. Inténtalo de nuevo en unos minutos.'
    });
  }

  const faltantes = [];

  datos.productos = datos.productos.map(p => {
    const producto = catalogo.get(p.ref);

    if (!producto) {
      faltantes.push(p.nombre || p.ref);
      return null;
    }

    return {
      ref: producto.ref,
      item: producto.item || '-',
      nombre: producto.nombre,
      linea: producto.linea,
      cantidad: p.cantidad,
      peso: producto.peso_kg || 0
    };
  }).filter(Boolean);

  if (faltantes.length) {
    return responder(res, 409, {
      ok: false,
      error: `Algunos productos ya no están en el catálogo (${faltantes.slice(0, 3).join(', ')}). Recarga la página y vuelve a agregarlos.`
    });
  }

  const numero = C.numeroSolicitud();
  const asesor = asignar(datos);
  const alAsesor = C.correoAsesor(datos, numero);
  const alCliente = C.correoCliente(datos, numero);

  const modoPrueba =
    process.env.MODO_PRUEBA === '1' ||
    !(
      process.env.MS_TENANT_ID &&
      process.env.MS_CLIENT_ID &&
      process.env.MS_CERT_THUMBPRINT &&
      process.env.MS_CERT_PRIVATE_KEY
    );

  if (modoPrueba) {
  let autenticacion = {
    probada: false,
    mensaje: 'No se realizó la autenticación. Verifica las variables de Microsoft.'
  };

  const certificadoConfigurado =
    process.env.MS_TENANT_ID &&
    process.env.MS_CLIENT_ID &&
    process.env.MS_CERT_THUMBPRINT &&
    process.env.MS_CERT_PRIVATE_KEY;

  if (certificadoConfigurado) {
    try {
      await tokenGraph();

      autenticacion = {
        probada: true,
        ok: true,
        mensaje: 'Microsoft aceptó la autenticación mediante certificado.'
      };

    } catch (error) {
      console.error(
        'cotizar: error de autenticación Microsoft',
        error.message
      );

      return responder(res, 502, {
        ok: false,
        numero,
        error: 'No fue posible autenticar la aplicación con Microsoft. Revisa los Runtime Logs de Vercel.'
      });
    }
  }

  return responder(res, 200, {
    ok: true,
    numero,
    prueba: true,
    autenticacion,
    correo: {
      de: MAIL_FROM,
      para: asesor.correo,
      cco: 'mercadeo@solucionestubulares.com',
      asunto: alAsesor.asunto,
      texto: alAsesor.texto
    },
    copiaCliente: {
      para: datos.correo,
      asunto: alCliente.asunto,
      texto: alCliente.texto
    }
  });
}

  try {
    await enviarCorreo({
      de: MAIL_FROM,
      para: asesor.correo,
      cco: 'mercadeo@solucionestubulares.com',
      responderA: datos.correo,
      asunto: alAsesor.asunto,
      texto: alAsesor.texto,
      html: alAsesor.html
    });
  } catch (error) {
    console.error(
      'cotizar: fallo correo asesor',
      numero,
      error.message
    );

    return responder(res, 502, {
      ok: false,
      error: 'No pudimos enviar tu solicitud en este momento. Inténtalo de nuevo o escríbenos por WhatsApp al 317 341 1301.'
    });
  }

  try {
    await enviarCorreo({
      de: MAIL_FROM,
      para: datos.correo,
      responderA: asesor.correo,
      asunto: alCliente.asunto,
      texto: alCliente.texto,
      html: alCliente.html
    });
  } catch (error) {
    console.error(
      'cotizar: fallo copia cliente',
      numero,
      error.message
    );
  }

  return responder(res, 200, {
    ok: true,
    numero
  });
}
