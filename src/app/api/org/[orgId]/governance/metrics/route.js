import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { getSetting } from '@/lib/settings';
import { parseMetricsFilters, computeMetrics, metricsCsv } from '@/lib/governance/metrics.mjs';
const fail=(message,status)=>NextResponse.json({error:message},{status});
async function allRows(model,where,options={}){
 const rows=[];let cursor;
 while(true){const page=await model.findMany({where,...options,take:500,...(cursor?{skip:1,cursor:{id:cursor}}:{}) ,orderBy:{id:'asc'}});rows.push(...page);if(page.length<500)break;cursor=page.at(-1).id}
 return rows;
}
export async function GET(request,{params}){
 const {orgId}=await params;
 const session=await getServerSession();if(!session?.user?.email)return fail('Unauthorized',401);
 const {user,role}=await resolveOrgRole(session.user.email,orgId);
 if(!user||!['super_admin','dept_admin'].includes(role))return fail('Forbidden',403);
 let filters;try{filters=parseMetricsFilters(new URL(request.url).searchParams)}catch(e){return fail(e.message,400)}
 const {departmentId,from,to}=filters;
 // Department admins may only inspect their assigned department(s); until a central
 // department-scope guard is available, restrict reporting to super admins.
 if(role!=='super_admin')return fail('Super admin access required',403);
 const docWhere={orgId,scope:'repository',deletedAt:null,...(departmentId?{departmentId}:{})};
 const window={gte:from,lt:to};
 try{
  const documents=await allRows(prisma.document,docWhere,{select:{id:true,departmentId:true,ownerId:true,category:true,summary:true,filename:true,content:true,stewards:{select:{id:true}},summaryReview:{select:{status:true}}}});
  const ids=new Set(documents.map(d=>d.id));
  const reviews=(await allRows(prisma.reviewRecord,{orgId,createdAt:window},{include:{policy:{select:{name:true}}}})).filter(r=>ids.has(r.documentId));
  const workflows=(await allRows(prisma.workflowInstance,{orgId,createdAt:window},{include:{tasks:{select:{status:true,stage:{select:{name:true}}}}}})).filter(w=>ids.has(w.documentId));
  const audit=(await allRows(prisma.auditLog,{orgId,createdAt:window,action:{in:['document.archived','document.retired','document.deleted','document.restored','document.superseded','document.lifecycle_changed']}},{select:{id:true,action:true,createdAt:true,entityId:true}})).filter(a=>!departmentId||!a.entityId||ids.has(a.entityId));
  const [rules,requireSummaryApproval]=await Promise.all([getSetting(orgId,'metadata.requiredFields'),getSetting(orgId,'summary.requireApproval')]);
  const data={filters:{departmentId,from:from.toISOString().slice(0,10),to:new Date(to.getTime()-86400000).toISOString().slice(0,10)},...computeMetrics({documents,reviews,workflows,audit,rules,requireSummaryApproval})};
  if(new URL(request.url).searchParams.get('format')==='csv')return new Response(metricsCsv(data),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="governance-metrics.csv"','Cache-Control':'no-store'}});
  return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('Governance metrics failed',error);return fail('Unable to load governance metrics',500)}
}
