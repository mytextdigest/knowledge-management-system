import { requiresSummaryApproval } from './summaryApprovalRules.mjs';
import { evaluateCompleteness } from './completeness.mjs';
export function parseMetricsFilters(params) {
 const departmentId=params.get('departmentId')||null;
 if (departmentId && (departmentId.length>150 || !/^[a-zA-Z0-9_-]+$/.test(departmentId))) throw new Error('Invalid department');
 const parse=(key,defaultValue)=>{const raw=params.get(key);if(!raw)return defaultValue;if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))throw new Error(`Invalid ${key}`);const d=new Date(`${raw}T00:00:00.000Z`);if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==raw)throw new Error(`Invalid ${key}`);return d;};
 const now=new Date();const from=parse('from',new Date(now.getTime()-90*86400000));const toDay=parse('to',now);const to=new Date(toDay.getTime()+86400000);
 if(from>=to || to.getTime()-from.getTime()>366*86400000)throw new Error('Date range must be 1–366 days');
 return {departmentId,from,to};
}
const pct=(num,den)=>den?Math.round(num*10000/den)/100:null;
const round=n=>n===null?null:Math.round(n*100)/100;
export function computeMetrics({documents=[],reviews=[],workflows=[],audit=[],rules=[],requireSummaryApproval=false,now=new Date()}) {
 const byDoc=new Map(documents.map(d=>[d.id,d]));
 const owner=new Map();const departments=new Map();
 const ownerKey=d=>d.ownerId||'unassigned',deptKey=d=>d.departmentId||'unassigned';
 const group=(map,key)=>{if(!map.has(key))map.set(key,{total:0,owned:0,complete:0,overdue:0});return map.get(key)};
 let owned=0,complete=0;
 for(const d of documents){const isOwned=!!d.ownerId;const isComplete=evaluateCompleteness(d,rules,{requireSummaryApproval:requiresSummaryApproval(requireSummaryApproval,d),summaryStatus:d.summaryReview?.status}).complete;
  owned+=Number(isOwned);complete+=Number(isComplete);
  for(const [map,key] of [[owner,ownerKey(d)],[departments,deptKey(d)]]){const g=group(map,key);g.total++;g.owned+=Number(isOwned);g.complete+=Number(isComplete)};
 }
 let completed=0,onTime=0,overdue=0;const policies=new Map();
 for(const r of reviews){const d=byDoc.get(r.documentId);if(!d)continue;
  const p=policies.get(r.policyId)||{policyId:r.policyId,policyName:r.policy?.name||r.policyId,completed:0,onTime:0,overdue:0};
  if(r.completedAt){completed++;p.completed++;if(new Date(r.completedAt)<=new Date(r.dueAt)){onTime++;p.onTime++}}
  else if(r.status==='pending'&&new Date(r.dueAt)<now){overdue++;p.overdue++;group(owner,ownerKey(d)).overdue++;group(departments,deptKey(d)).overdue++}
  policies.set(r.policyId,p);
 }
 const wfStages=new Map();let approved=0,rejected=0,totalApprovalMs=0;
 for(const w of workflows){if(w.status==='in_review'){const key=w.tasks?.find(t=>t.status==='pending')?.stage?.name||`Stage ${w.currentPosition}`;wfStages.set(key,(wfStages.get(key)||0)+1)}
  if(w.status==='approved'){approved++;totalApprovalMs+=Math.max(0,new Date(w.updatedAt)-new Date(w.createdAt))}
  if(w.status==='rejected')rejected++;
 }
 const decommission=new Map();for(const a of audit){const date=new Date(a.createdAt).toISOString().slice(0,10);const k=`${date}|${a.action}`;decommission.set(k,(decommission.get(k)||0)+1)}
 const groups=map=>[...map].map(([id,g])=>({id,...g,ownershipPercent:pct(g.owned,g.total),completenessPercent:pct(g.complete,g.total)})).sort((a,b)=>a.id.localeCompare(b.id));
 return {documents:{total:documents.length,owned,ownershipPercent:pct(owned,documents.length),complete,completenessPercent:pct(complete,documents.length),byDepartment:groups(departments),byOwner:groups(owner)},reviews:{completed,onTime,onTimePercent:pct(onTime,completed),overdue,byPolicy:[...policies.values()].map(p=>({...p,onTimePercent:pct(p.onTime,p.completed)}))},workflows:{inProgressByStage:[...wfStages].map(([stage,count])=>({stage,count})),approved,rejected,rejectionRatePercent:pct(rejected,approved+rejected),averageApprovalHours:approved?round(totalApprovalMs/approved/3600000):null},decommission:{byDayAndAction:[...decommission].map(([key,count])=>{const [date,action]=key.split('|');return {date,action,count}}).sort((a,b)=>a.date.localeCompare(b.date))}};
}
export function metricsCsv(data){
 const rows=[['section','group','metric','value']];const add=(s,g,k,v)=>rows.push([s,g,k,v??'']);
 for(const [k,v] of Object.entries(data.documents))if(!Array.isArray(v))add('documents','all',k,v);
 for(const group of ['byDepartment','byOwner'])for(const r of data.documents[group])for(const [k,v] of Object.entries(r))if(k!=='id')add('documents',`${group}:${r.id}`,k,v);
 for(const [k,v] of Object.entries(data.reviews))if(!Array.isArray(v))add('reviews','all',k,v);
 for(const r of data.reviews.byPolicy)for(const [k,v] of Object.entries(r))if(k!=='policyId'&&k!=='policyName')add('reviews',`policy:${r.policyName}`,k,v);
 for(const [k,v] of Object.entries(data.workflows))if(!Array.isArray(v))add('workflows','all',k,v);
 for(const r of data.workflows.inProgressByStage)add('workflows',r.stage,'inProgress',r.count);
 for(const r of data.decommission.byDayAndAction)add('decommission',r.date,r.action,r.count);
 return rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\r\n')+'\r\n';
}
