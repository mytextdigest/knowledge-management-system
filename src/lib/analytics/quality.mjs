import { csvEscape } from './usageMetrics.mjs';
export function departmentScope(role, ids, requested) {
  if (role === 'super_admin') return requested ? { departmentId: requested } : {};
  if (role !== 'dept_admin' || !ids.length || (requested && !ids.includes(requested))) return null;
  return { departmentId: requested || { in: ids } };
}
export function reportCsv(rows, columns) {
  return [columns, ...rows.map(r => columns.map(k => r[k]))].map(r => r.map(csvEscape).join(',')).join('\r\n');
}
export function dateWindow(p, now = new Date()) {
  const end = p.get('to') || now.toISOString().slice(0,10);
  const start = p.get('from') || new Date(now.getTime()-29*86400000).toISOString().slice(0,10);
  const parse = s => { const d = new Date(s+'T00:00:00Z'); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(+d) || d.toISOString().slice(0,10)!==s) throw Error('Invalid date'); return d; };
  const gte=parse(start), lt=new Date(+parse(end)+86400000);
  if (+lt<=+gte || (+lt-+gte)/86400000>366) throw Error('Invalid date range');
  return {gte,lt};
}
export async function qualityMetrics(db, where) {
  const search={...where,kind:{in:['search','repository']}};
  const answers={...where,kind:'chat',answerShown:true};
  const [total, noResults, c1,c3,c10,reformed, dwell, known,low,feedback,queries] = await Promise.all([
    db.searchEvent.count({where:search}), db.searchEvent.count({where:{...search,resultCount:0}}),
    ...[1,3,10].map(rank=>db.searchEvent.count({where:{...search,clicks:{some:{rank:{gte:1,lte:rank}}}}})),
    db.searchEvent.count({where:{...search,previousEventId:{not:null}}}),
    db.searchClick.aggregate({where:{searchEvent:search,dwellSeconds:{not:null}},_avg:{dwellSeconds:true},_count:{dwellSeconds:true}}),
    db.searchEvent.count({where:{...answers,confidence:{in:['high','medium','low']}}}),
    db.searchEvent.count({where:{...answers,confidence:'low'}}),
    feedbackCounts(db,answers),
    db.searchEvent.groupBy({by:['normalizedQuery'],where:{...search,resultCount:0},_count:{_all:true},orderBy:{_count:{normalizedQuery:'desc'}},take:100})
  ]);
  const rate=(n,d)=>d?100*n/d:null;
  const votes=feedback;
  return {total,noResults,ctr1:rate(c1,total),ctr3:rate(c3,total),ctr10:rate(c10,total),reformulationRate:rate(reformed,total),averageDwellSeconds:dwell._avg.dwellSeconds,dwellSamples:dwell._count.dwellSeconds,lowConfidenceRate:rate(low,known),knownConfidenceAnswers:known,feedback:votes,noResultQueries:queries.map(r=>({query:r.normalizedQuery,count:r._count._all}))};
}
export async function linkedGaps(db, where) {
  const gaps=await db.knowledgeGap.findMany({where:{orgId:where.orgId},orderBy:{gapScore:'desc'},take:100});
  const ids=[...new Set(gaps.flatMap(g=>g.queryIds))];
  const events=await db.searchEvent.findMany({where:{...where,id:{in:ids}},select:{id:true,normalizedQuery:true,createdAt:true,resultCount:true,confidence:true}});
  const byId=new Map(events.map(e=>[e.id,e]));
  return gaps.flatMap(g=>{const queries=g.queryIds.map(id=>byId.get(id)).filter(Boolean);return queries.length?[{id:g.id,topic:queries[0].normalizedQuery,matchingQueries:queries.length,queries}]:[];});
}

// Aggregate drill-through: never expose individual event IDs or user identity.
export function metricScope(where, metric) {
  const search={...where,kind:{in:['search','repository']}};
  const answers={...where,kind:'chat',answerShown:true};
  switch(metric){
    case 'total': return search;
    case 'noResults': return {...search,resultCount:0};
    case 'ctr1': case 'ctr3': case 'ctr10': return {...search,clicks:{some:{rank:{gte:1,lte:Number(metric.slice(3))}}}};
    case 'reformulationRate': return {...search,previousEventId:{not:null}};
    case 'averageDwellSeconds': case 'dwellSamples': return {...search,clicks:{some:{dwellSeconds:{not:null}}}};
    case 'lowConfidenceRate': return {...answers,confidence:'low'};
    case 'knownConfidenceAnswers': return {...answers,confidence:{in:['high','medium','low']}};
    default: return null;
  }
}
export async function metricBreakdown(db,where,metric,page=1){
  const scope=metricScope(where,metric);if(!scope)throw Error('Unknown metric');
  const rows=await db.searchEvent.groupBy({by:['normalizedQuery'],where:scope,_count:{_all:true},orderBy:[{_count:{normalizedQuery:'desc'}},{normalizedQuery:'asc'}],skip:(page-1)*50,take:51});
  return {rows:rows.slice(0,50).map(r=>({query:r.normalizedQuery,count:r._count._all})),hasMore:rows.length>50,page};
}

async function feedbackCounts(db,answers){
 const votes=Object.create(null);let cursor;
 for(;;){const rows=await db.searchEvent.findMany({where:{...answers,orgMessage:{is:{feedback:{not:null}}}},orderBy:{id:'asc'},take:500,...(cursor?{cursor:{id:cursor},skip:1}:{}),select:{id:true,orgMessage:{select:{feedback:true}}}});for(const r of rows){const k=r.orgMessage?.feedback;if(k)votes[k]=(votes[k]||0)+1;}if(rows.length<500)break;cursor=rows.at(-1).id;}
 return votes;
}
