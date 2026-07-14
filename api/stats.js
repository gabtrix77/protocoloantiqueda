// GET /api/stats?p=SENHA&days=7 — devolve os contadores agregados pro painel admin.html

const KV_URL = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const senha = process.env.ADMIN_PASSWORD;
  if (!senha) return res.status(500).json({ error: 'config', msg: 'Defina a variável ADMIN_PASSWORD nas Environment Variables do projeto na Vercel.' });
  if (!KV_URL() || !KV_TOKEN()) return res.status(500).json({ error: 'config', msg: 'Banco não conectado. Na Vercel: aba Storage → Create Database → Upstash for Redis → Connect Project.' });
  if ((req.query.p || '') !== senha) return res.status(401).json({ error: 'senha' });

  let nDays = parseInt(req.query.days, 10);
  if (!Number.isFinite(nDays) || nDays < 1) nDays = 7;
  nDays = Math.min(nDays, 90);

  // lista de dias (fuso de Brasília), do mais recente pro mais antigo
  const days = [];
  const now = Date.now() - 3 * 3600 * 1000;
  for (let i = 0; i < nDays; i++) {
    days.push(new Date(now - i * 86400000).toISOString().slice(0, 10));
  }

  const cmds = days.map(d => ['HGETALL', 'funil:' + d]);
  let rows;
  try {
    const r = await fetch(KV_URL() + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KV_TOKEN(), 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds)
    });
    rows = await r.json();
  } catch (e) {
    return res.status(500).json({ error: 'kv', msg: String(e) });
  }

  // agrega tudo + série por dia
  const totals = {};
  const byDay = {};
  rows.forEach((row, i) => {
    const flat = row && row.result;
    if (!flat || !flat.length) return;
    const dayTotals = {};
    for (let j = 0; j < flat.length; j += 2) {
      const field = flat[j];
      const val = parseInt(flat[j + 1], 10) || 0;
      totals[field] = (totals[field] || 0) + val;
      dayTotals[field] = val;
    }
    byDay[days[i]] = { visit: dayTotals['visit:1'] || 0, checkout: dayTotals['step:checkout'] || 0 };
  });

  return res.status(200).json({ days: nDays, totals, byDay });
}
