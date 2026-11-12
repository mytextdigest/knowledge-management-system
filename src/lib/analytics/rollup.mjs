import { dailyUsage } from './usageMetrics.mjs';

// The AnalyticsDaily unique key does not include role. Role breakdown is served
// from scoped raw events rather than silently overwriting rows with distinct roles.
const metricKeys = ['searches','questions','events','activeUsers','clicks','ctr','bounceRate','p50LatencyMs','p95LatencyMs','p50FirstTokenMs','p95FirstTokenMs'];
export async function rollupUsageDay(db, {orgId, date, departmentId = null}) {
  if (!orgId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Valid orgId and UTC date required');
  const start = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0,10)!==date) throw new Error('Invalid date');
  const end = new Date(start.getTime()+86400000);
  const where={orgId,createdAt:{gte:start,lt:end},...(departmentId?{departmentId}:{})};
  const events=[];
  // Stable cursor avoids skipping records if a prior page changes during a run.
  let cursor;
  do {
    const page=await db.searchEvent.findMany({where,select:{id:true,userId:true,kind:true,query:true,normalizedQuery:true,latencyMs:true,firstTokenMs:true,createdAt:true},orderBy:{id:'asc'},take:500,...(cursor?{cursor:{id:cursor},skip:1}:{})});
    events.push(...page);
    cursor=page.length===500?page[page.length-1].id:null;
  } while(cursor);
  const clicks=[];
  for(let i=0;i<events.length;i+=500) {
    const ids=events.slice(i,i+500).map(e=>e.id);
    if(!ids.length) continue;
    let clickCursor;
    do {
      const page=await db.searchClick.findMany({where:{searchEventId:{in:ids}},select:{id:true,searchEventId:true},orderBy:{id:'asc'},take:500,...(clickCursor?{cursor:{id:clickCursor},skip:1}:{})});
      clicks.push(...page);
      clickCursor=page.length===500?page[page.length-1].id:null;
    }while(clickCursor);
  }
  const summary=dailyUsage(events,clicks)[0] || {};
  // Idempotent upserts; sourceSystem=all because SearchEvent has no sourceSystem column.
  const departmentKey=departmentId || 'all';
  await db.$transaction(async tx=>{
    for(const metric of metricKeys) {
      await tx.analyticsDaily.upsert({
        where:{orgId_date_metric_departmentKey_sourceSystem:{orgId,date:start,metric,departmentKey,sourceSystem:'all'}},
        create:{orgId,date:start,metric,departmentKey,sourceSystem:'all',value:summary[metric] ?? 0},
        update:{value:summary[metric] ?? 0,computedAt:new Date()},
      });
    }
  });
  return {date,departmentKey,events:events.length,metrics:metricKeys.length};
}


// F3 job entry point. Recomputing a short rolling window accommodates late clicks.
// Includes per-department rows, but never adds together distinct active-user counts.
export async function rollupUsageRange(db, { orgId, days = 3, now = new Date() }) {
  if (!orgId || !Number.isInteger(days) || days < 1 || days > 90) throw new Error('Invalid usage rollup scope');
  const anchor = new Date(now);
  if (Number.isNaN(anchor.getTime())) throw new Error('Invalid rollup timestamp');
  anchor.setUTCHours(0, 0, 0, 0);
  const departments = await db.department.findMany({ where: { orgId }, select: { id: true } });
  const results = [];
  for (let offset = 0; offset < days; offset++) {
    const day = new Date(anchor.getTime() - offset * 86400000).toISOString().slice(0, 10);
    results.push(await rollupUsageDay(db, { orgId, date: day }));
    for (const department of departments) results.push(await rollupUsageDay(db, { orgId, date: day, departmentId: department.id }));
  }
  return { days, departments: departments.length, rollups: results.length, metricRows: results.reduce((n, r) => n + r.metrics, 0) };
}
