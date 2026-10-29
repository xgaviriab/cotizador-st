// Datos del panel de uso: requiere la clave PANEL_KEY (?k=...).
import { list, get } from '@vercel/blob';

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  if (!process.env.PANEL_KEY || url.searchParams.get('k') !== process.env.PANEL_KEY) { res.status(401).json({ error: 'clave' }); return; }
  const dias = Math.min(120, Math.max(1, +url.searchParams.get('dias') || 30));
  const hoy = new Date();
  const prefijos = [];
  for (let i = 0; i < dias; i++) { const d = new Date(hoy.getTime() - i * 864e5); prefijos.push('ev/' + d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) + '/'); }
  const blobs = [];
  await Promise.all(prefijos.map(async prefix => {
    let cursor;
    do { const r = await list({ prefix, cursor, limit: 1000 }); blobs.push(...r.blobs); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
  }));
  const eventos = [];
  for (let i = 0; i < blobs.length; i += 25) {
    const lote = await Promise.all(blobs.slice(i, i + 25).map(async b => {
      try { const r = await get(b.pathname, { access: 'private' }); if (!r || r.statusCode !== 200) return null; return JSON.parse(await new Response(r.stream).text()); } catch { return null; }
    }));
    eventos.push(...lote.filter(Boolean));
  }
  eventos.sort((a, b) => b.ts - a.ts);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ generado: Date.now(), dias, eventos });
}
