// Datos de rentabilidad para asesores autorizados. GET ?a=ASESOR_KEY devuelve {ref:[costo, fuente]}.
// POST ?k=PANEL_KEY con el JSON los guarda. Se guardan en Vercel Blob privado; nunca en el repositorio.
import { put, get } from '@vercel/blob';
const RUTA = 'cfg/rentab.json';

async function leer(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 3e6) throw new Error('grande'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST') {
    if (!process.env.PANEL_KEY || url.searchParams.get('k') !== process.env.PANEL_KEY) { res.status(401).json({ error: 'clave' }); return; }
    let b; try { b = await leer(req); } catch { res.status(400).end(); return; }
    if (!b || typeof b.c !== 'object' || Object.keys(b.c).length < 500) { res.status(400).json({ error: 'datos' }); return; }
    await put(RUTA, JSON.stringify(b), { access: 'private', contentType: 'application/json', allowOverwrite: true, addRandomSuffix: false });
    res.status(200).json({ ok: true, n: Object.keys(b.c).length });
    return;
  }
  if (req.method !== 'GET') { res.status(405).end(); return; }
  if (!process.env.ASESOR_KEY || url.searchParams.get('a') !== process.env.ASESOR_KEY) { res.status(401).json({ error: 'clave' }); return; }
  try {
    const r = await get(RUTA, { access: 'private' });
    if (!r || r.statusCode !== 200) { res.status(404).json({ error: 'sin datos' }); return; }
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(await new Response(r.stream).text());
  } catch { res.status(500).json({ error: 'lectura' }); }
}
