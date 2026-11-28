import { prisma } from '@/lib/prisma';
import { repositoryAccessWhere } from '@/lib/access/documentAccess';
import { authenticateReporting,pagination } from '@/lib/analytics/reporting.mjs';
import { dateWindow,reportCsv } from '@/lib/analytics/quality.mjs';
import { summarizeContentHealth } from '@/lib/analytics/contentHealth.mjs';
import { getSetting } from '@/lib/settings';
const headers={'Cache-Control':'no-store'};
const columns={metrics:['date','metric','departmentKey','sourceSystem','value'],searches:['date','kind','count'],documents:['id','filename','departmentId','sourceProvider','createdAt','contentUpdatedAt','lifecycle'],health:['id','departmentId','sourceProvider','ageDays','brokenLinks','stale','unowned','reviewOverdue','incomplete','duplicate']};
export async function GET(req,{params}){
 const key=await authenticateReporting(prisma,req.headers.get('authorization'));if(!key)return Response.json({error:'Unauthorized'},{status:401,headers});
 const {dataset}=await params;if(!Object.hasOwn(columns,dataset))return Response.json({error:'Not found'},{status:404,headers});
 const p=new URL(req.url).searchParams;if(p.has('orgId')&&p.get('orgId')!==key.orgId)return Response.json({error:'Forbidden'},{status:403,headers});
 let window,paging;try{window=dateWindow(p);paging=pagination(p);if(!['json','csv'].includes(p.get('format')||'json'))throw Error();}catch{return Response.json({error:'Invalid parameters'},{status:400,headers});}
 const {skip,take,page}=paging;const orgId=key.orgId;let rows;
 if(dataset==='metrics')rows=await prisma.analyticsDaily.findMany({where:{orgId,date:window},orderBy:[{date:'asc'},{id:'asc'}],skip,take:take+1,select:{date:true,metric:true,departmentKey:true,sourceSystem:true,value:true}});
 else if(dataset==='searches'){
  const raw=await prisma.$queryRaw`SELECT date_trunc('day', created_at) AS date, kind, count(*)::int AS count FROM "SearchEvent" WHERE org_id=${orgId} AND created_at>=${window.gte} AND created_at<${window.lt} GROUP BY 1,2 ORDER BY 1,2 OFFSET ${skip} LIMIT ${take+1}`;rows=raw;
 }else{
  const where={AND:[repositoryAccessWhere({orgId,role:'super_admin',userDeptIds:[]}),{createdAt:window}]};
  const select={id:true,filename:true,departmentId:true,sourceProvider:true,createdAt:true,contentUpdatedAt:true,lifecycle:true};
  if(dataset==='documents')rows=await prisma.document.findMany({where,orderBy:{id:'asc'},skip,take:take+1,select});
  else{const docs=await prisma.document.findMany({where,orderBy:{id:'asc'},skip,take:take+1,select:{...select,ownerId:true,category:true,summary:true,lifecycleSuggestion:true,nextReviewAt:true,stewards:{select:{userId:true}},reviewRecords:{select:{status:true,dueAt:true}},links:{select:{status:true}},duplicatesAsDocument:{select:{status:true}},duplicatesAsOriginal:{select:{status:true}}}});rows=summarizeContentHealth(docs,{metadataRules:await getSetting(orgId,'metadata.requiredFields')}).documents.map(d=>({id:d.id,departmentId:d.departmentId,sourceProvider:d.sourceProvider,ageDays:d.ageDays,brokenLinks:d.brokenLinks,...d.flags}));}
 }
 const more=rows.length>take;rows=rows.slice(0,take).map(r=>Object.fromEntries(columns[dataset].map(k=>[k,r[k] instanceof Date?r[k].toISOString():r[k]??null])));
 const active=await prisma.reportingApiKey.updateMany({where:{id:key.id,orgId,revokedAt:null},data:{lastUsedAt:new Date()}});
 if(!active.count)return Response.json({error:'Unauthorized'},{status:401,headers});
 const out={...headers,'X-Next-Page':more?String(page+1):''};
 if(p.get('format')==='csv')return new Response(reportCsv(rows,columns[dataset]),{headers:{...out,'Content-Type':'text/csv; charset=utf-8'}});
 return Response.json(rows,{headers:out});
}
