// Registra el uso del cotizador (apertura, PDF, WhatsApp, resumen) en Vercel Blob privado.
import { put } from '@vercel/blob';

const TIPOS = new Set(['apertura', 'pdf', 'whatsapp', 'resumen']);
const txt = (v, n = 120) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, n);
const num = v => (Number.isFinite(+v) ? Math.round(+v) : 0);

async function leer(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 60000) throw new Error('grande'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  let b;
  try { b = await leer(req); } catch { res.status(400).end(); return; }
  if (!b || !TIPOS.has(b.tipo)) { res.status(400).end(); return; }
  const ahora = new Date();
  const ev = {
    tipo: b.tipo, ts: ahora.getTime(),
    asesor: txt(b.asesor, 80) || 'Sin nombre', asesorTel: txt(b.asesorTel, 20), asesorEmail: txt(b.asesorEmail, 80),
    dev: txt(b.dev, 16), movil: !!b.movil,
  };
  if (b.cot && typeof b.cot === 'object') {
    const c = b.cot;
    ev.cot = {
      num: txt(c.num, 40), cliente: txt(c.cliente), nit: txt(c.nit, 30), contacto: txt(c.contacto, 80), telefono: txt(c.telefono, 20), ciudad: txt(c.ciudad, 80),
      pago: txt(c.pago, 20), lista: txt(c.lista, 20),
      lineas: (Array.isArray(c.lineas) ? c.lineas : []).slice(0, 80).map(l => ({ item: txt(l.item, 20), desc: txt(l.desc, 120), qty: +l.qty || 0, lista: txt(l.lista, 20), net: num(l.net), tot: num(l.tot) })),
      base: num(c.base), iva: num(c.iva), total: num(c.total), peso: num(c.peso),
    };
  }
  const dia = ahora.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  await put(`ev/${dia}/${ev.ts}-${ev.tipo}.json`, JSON.stringify(ev), { access: 'private', addRandomSuffix: true, contentType: 'application/json' });
  res.status(204).end();
}
