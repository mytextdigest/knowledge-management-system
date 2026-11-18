import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const fixture=JSON.parse(readFileSync(process.argv[2]||fileURLToPath(new URL('./fixture.json',import.meta.url)),'utf8'));
export function evaluate(cases,k=10){
  const rows=cases.map(c=>{const relevant=new Set(c.relevantIds);const returned=c.returnedIds.slice(0,k);const hits=returned.filter(x=>relevant.has(x)).length;
    const first=returned.findIndex(x=>relevant.has(x));return {id:c.id,precision:hits/k,recall:relevant.size?hits/relevant.size:1,reciprocalRank:first<0?0:1/(first+1)};});
  const avg=key=>rows.length?rows.reduce((n,r)=>n+r[key],0)/rows.length:0;
  return {count:rows.length,k,precisionAtK:avg('precision'),recallAtK:avg('recall'),mrr:avg('reciprocalRank'),rows};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  if(!Array.isArray(fixture.cases)||fixture.cases.some(c=>!c.id||!c.query||!Array.isArray(c.relevantIds)||!Array.isArray(c.returnedIds)))throw Error('Invalid evaluation fixture');
  console.log(JSON.stringify(evaluate(fixture.cases),null,2));
}
