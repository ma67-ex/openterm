// Day-count math for bond/trading calcs. See lib/daycount.js.
import { CONVENTIONS } from '../lib/daycount.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(s) {
  if (!DATE_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}

export default async function handler(req, res) {
  const q = (k) => String(req.query?.[k] ?? new URL(req.url, 'http://x').searchParams.get(k) ?? '');
  const begin = parseDate(q('begin'));
  const end = parseDate(q('end'));
  const convention = q('convention').toUpperCase();

  if (!begin || !end) return res.status(400).json({ error: 'bad params', detail: 'begin and end must be YYYY-MM-DD' });
  if (!CONVENTIONS[convention]) {
    return res.status(400).json({ error: 'bad params', detail: `unknown convention, use one of: ${Object.keys(CONVENTIONS).join(', ')}` });
  }

  const conv = CONVENTIONS[convention];
  res.status(200).json({
    begin: q('begin'),
    end: q('end'),
    convention,
    days: conv.daysDiff(begin, end),
    years: conv.yearsDiff(begin, end),
  });
}
