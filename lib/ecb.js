// ECB Statistical Data Warehouse (SDW) CSV endpoint, no API key required.
// Ported from ErTasselli/OpenTerminal (MIT), server/src/providers/ecb.ts, verified live 2026-10-15.
// Every ECB dataflow has a different column layout (dimension columns vary per flow),
// so TIME_PERIOD/OBS_VALUE are located by header name rather than fixed index.

const BASE = 'https://data-api.ecb.europa.eu/service/data';

export async function series(flowRef, key, lastN = 260) {
  const url = `${BASE}/${flowRef}/${key}?format=csvdata&lastNObservations=${lastN}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`ecb ${r.status} for ${flowRef}/${key}`);
  const lines = (await r.text()).trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].split(',');
  const timeIdx = header.indexOf('TIME_PERIOD');
  const valueIdx = header.indexOf('OBS_VALUE');
  if (timeIdx === -1 || valueIdx === -1) return [];

  const points = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const date = cols[timeIdx];
    const raw = cols[valueIdx];
    // Number('') is 0, not NaN: a provisional/missing ECB observation leaves
    // OBS_VALUE empty, so the blank check must come before Number() or a
    // missing point silently becomes a real zero.
    if (!date || !raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    points.push({ date, value });
  }
  return points.slice(-lastN);
}

export async function latest(flowRef, key) {
  const points = await series(flowRef, key, 5);
  return points.length ? points[points.length - 1] : null;
}
