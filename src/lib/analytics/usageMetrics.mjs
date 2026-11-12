// D-M2: pure, deterministic metric calculations. UTC days, no user identities in outputs.
export const utcDay = (value) => new Date(value).toISOString().slice(0, 10);
export function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index), fraction = index - lower;
  return Math.round((sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * fraction) * 10) / 10;
}
export function summarizeUsage(events, clicks = []) {
  const eligible = events.filter(e => typeof e.query === 'string' && e.query.trim());
  const ids = new Set(eligible.map(e => e.id));
  const clicked = new Set(clicks.filter(c => ids.has(c.searchEventId)).map(c => c.searchEventId));
  const latencies = eligible.map(e => e.latencyMs).filter(Number.isFinite);
  const firstTokens = eligible.map(e => e.firstTokenMs).filter(Number.isFinite);
  const count = eligible.length;
  const queries = new Map();
  for (const e of eligible) {
    const query = (e.normalizedQuery || e.query).trim().toLowerCase();
    queries.set(query, (queries.get(query) || 0) + 1);
  }
  return {
    searches: eligible.filter(e => e.kind !== 'chat').length,
    questions: eligible.filter(e => e.kind === 'chat').length,
    events: count,
    activeUsers: new Set(eligible.map(e => e.userId).filter(Boolean)).size,
    clicks: clicked.size,
    ctr: count ? clicked.size / count : 0,
    bounceRate: count ? eligible.filter(e => !clicked.has(e.id)).length / count : 0,
    p50LatencyMs: percentile(latencies, .5), p95LatencyMs: percentile(latencies, .95),
    p50FirstTokenMs: percentile(firstTokens, .5), p95FirstTokenMs: percentile(firstTokens, .95),
    topQueries: [...queries].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,10).map(([query,count])=>({query,count})),
  };
}
export function dailyUsage(events, clicks = []) {
  const byDay = new Map();
  for (const e of events) {
    const day = utcDay(e.createdAt);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(e);
  }
  return [...byDay].sort(([a],[b])=>a.localeCompare(b)).map(([date,rows])=>({date,...summarizeUsage(rows,clicks)}));
}
export function csvEscape(value) { const s=String(value ?? ''); return /[",\r\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s; }
export function usageCsv(rows) {
  const cols=['date','searches','questions','events','activeUsers','clicks','ctr','bounceRate','p50LatencyMs','p95LatencyMs','p50FirstTokenMs','p95FirstTokenMs'];
  return [cols.join(','),...rows.map(row=>cols.map(k=>csvEscape(row[k])).join(','))].join('\r\n')+'\r\n';
}
