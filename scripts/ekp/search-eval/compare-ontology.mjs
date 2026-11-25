// C-11 offline nDCG@10 comparison. Input must be genuine D-13 evaluation
// results: { queries:[{query, relevant:[docId,...], baseline:[docId,...], ontology:[docId,...]}] }.
// Never invent a performance improvement or run against live data by default.
import { readFileSync } from 'node:fs';
export function ndcgAt10(ranking, relevant) {
  const wanted = new Set(relevant);
  if (!wanted.size) return 0;
  const dcg = ranking.slice(0,10).reduce((sum,id,i) => sum + (wanted.has(id) ? 1 / Math.log2(i+2) : 0),0);
  const ideal = Array.from({length:Math.min(10,wanted.size)},(_,i) => 1/Math.log2(i+2)).reduce((a,b)=>a+b,0);
  return dcg/ideal;
}
export function evaluate(queries) {
  if (!Array.isArray(queries) || queries.length < 20 || queries.length > 30) throw new Error('Provide 20–30 real evaluation queries');
  const rows = queries.map(q => {
    if (!q.query || !Array.isArray(q.relevant) || !Array.isArray(q.baseline) || !Array.isArray(q.ontology)) throw new Error('Each query needs query, relevant, baseline and ontology');
    return { query:q.query, baseline:ndcgAt10(q.baseline,q.relevant), ontology:ndcgAt10(q.ontology,q.relevant) };
  });
  const avg = key => rows.reduce((sum,row)=>sum+row[key],0)/rows.length;
  return { count:rows.length, baselineNdcg10:avg('baseline'), ontologyNdcg10:avg('ontology'), delta:avg('ontology')-avg('baseline'), rows };
}
if (process.argv[1]?.endsWith('compare-ontology.mjs')) {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node scripts/ekp/search-eval/compare-ontology.mjs <real-d13-results.json>'); process.exitCode=2; }
  else { try { console.log(JSON.stringify(evaluate(JSON.parse(readFileSync(file,'utf8')).queries),null,2)); } catch(e) { console.error(e.message); process.exitCode=1; } }
}
