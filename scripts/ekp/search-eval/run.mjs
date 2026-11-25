// D-13: real F7-backed evaluation; requires an authenticated session and a
// seeded fixture corpus. Never treats prefilled rankings as search results.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const fixturePath = fileURLToPath(new URL('../p2/fixtures/m3-corpus/queries.json', import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
export function ndcgAt10(ranking, relevant) {
  const wanted = new Set(relevant);
  if (!wanted.size) return 0;
  const dcg = ranking.slice(0, 10).reduce((sum, id, i) => sum + (wanted.has(id) ? 1 / Math.log2(i + 2) : 0), 0);
  const ideal = Array.from({ length: Math.min(10, wanted.size) }, (_, i) => 1 / Math.log2(i + 2)).reduce((a,b) => a+b,0);
  return dcg / ideal;
}
export function evaluate(rows) {
  const count = rows.length;
  if (!count) throw Error('No evaluated queries');
  const scores = rows.map(row => ({ id: row.id, query: row.query, baselineNdcg10: ndcgAt10(row.baseline, row.relevant), ontologyNdcg10: ndcgAt10(row.ontology, row.relevant) }));
  const avg = name => scores.reduce((sum, r) => sum + r[name], 0) / count;
  return { count, baselineNdcg10: avg('baselineNdcg10'), ontologyNdcg10: avg('ontologyNdcg10'), rows: scores };
}
function arg(name, fallback = null) { const at = process.argv.indexOf(`--${name}`); return at < 0 ? fallback : process.argv[at+1]; }
function stableKey(filename) { return /^m3-\d{3}\.txt$/.test(filename || '') ? filename.slice(0, -4) : null; }
async function main() {
  const org = arg('org'), base = arg('base-url'), output = arg('out'), cookieName = arg('cookie-env', 'KMS_EVAL_COOKIE');
  const cookie = process.env[cookieName];
  if (!org || !base || !output || !cookie) throw Error('Usage: --org <id> --base-url <url> --out <json> [--cookie-env KMS_EVAL_COOKIE]. Provide session cookie via environment only.');
  const rows = [];
  for (const q of fixture.queries) {
    const row = { id: q.id, kind: q.kind || 'other', query: q.query, relevant: q.relevant };
    for (const mode of ['baseline','ontology']) {
      const response = await fetch(`${base.replace(/\/$/,'')}/api/org/${encodeURIComponent(org)}/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ query: q.query, scope: 'organization', limit: 20, ontologyEnabled: mode === 'ontology' }),
      });
      const payload = await response.json();
      if (!response.ok) throw Error(`${mode} search failed (${response.status}): ${payload.error || 'unknown error'}`);
      row[mode] = [...new Set((payload.results || []).map(r => stableKey(r.filename)).filter(Boolean))].slice(0, 10);
    }
    rows.push(row);
  }
  const result = { format: 'kms-search-eval-v1', org, generatedAt: new Date().toISOString(), queries: rows };
  writeFileSync(resolve(output), JSON.stringify(result, null, 2) + '\n');
  const scores = rows.map(row => ({ kind: row.kind, baseline: ndcgAt10(row.baseline, row.relevant), ontology: ndcgAt10(row.ontology, row.relevant) }));
  const summary = list => {
    const average = key => list.reduce((sum,row) => sum + row[key],0) / list.length;
    return { count: list.length, baselineNdcg10: average('baseline'), ontologyNdcg10: average('ontology'), delta: average('ontology') - average('baseline') };
  };
  // Per kind as well: label queries are the control (keyword search alone
  // should do well); synonym and narrower_synonym queries show what the ontology adds.
  const byKind = Object.fromEntries([...new Set(scores.map(s => s.kind))].map(kind => [kind, summary(scores.filter(s => s.kind === kind))]));
  console.log(JSON.stringify({ ...summary(scores), byKind }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1; });
