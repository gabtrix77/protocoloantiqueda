// POST /api/track — recebe eventos do quiz e incrementa contadores no Redis (Upstash via Vercel Storage)
// Não guarda nenhum dado pessoal: só contadores agregados por dia.

const KV_URL = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// tipos de evento aceitos
const TYPES = new Set(['visit', 'step', 'ans', 'cta']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!KV_URL() || !KV_TOKEN()) return res.status(200).json({ ok: false, error: 'storage_nao_configurado' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const events = (body && Array.isArray(body.e)) ? body.e.slice(0, 20) : [];
  if (!events.length) return res.status(200).json({ ok: true, n: 0 });

  // dia no fuso de Brasília
  const day = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

  const cmds = [['SADD', 'funil:days', day]];
  for (const ev of events) {
    const t = String(ev.t || '');
    if (!TYPES.has(t)) continue;
    const k = String(ev.k || '').slice(0, 48).replace(/[^\w\-<>+.]/g, '');
    if (!k) continue;
    cmds.push(['HINCRBY', 'funil:' + day, t + ':' + k, 1]);
  }
  if (cmds.length === 1) return res.status(200).json({ ok: true, n: 0 });

  try {
    await fetch(KV_URL() + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KV_TOKEN(), 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds)
    });
  } catch (e) { /* nunca devolve erro pro quiz */ }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, n: cmds.length - 1 });
}
