import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { repositoryAccessWhere, getUserPrincipals } from '@/lib/access/documentAccess';
import { summarizeContentHealth, contentHealthCsv } from '@/lib/analytics/contentHealth.mjs';

const deny=(error,status)=>NextResponse.json({error},{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request,{params}) {
  const {orgId}=await params;
  const session=await getServerSession();
  if(!session?.user?.email) return deny('Unauthorized',401);
  const {user,role}=await resolveOrgRole(session.user.email,orgId);
  if(!user || !['super_admin','dept_admin'].includes(role)) return deny('Forbidden',403);
  const query=new URL(request.url).searchParams;
  const departmentId=query.get('departmentId')||null;
  const sourceSystem=query.get('sourceSystem')||null;
  const days=Number(query.get('days')||90);
  if(![30,90,365].includes(days)) return deny('Invalid period',400);
  const memberships=await prisma.departmentMember.findMany({where:{userId:user.id,department:{orgId}},select:{departmentId:true,role:true}});
  const userDeptIds=memberships.map(x=>x.departmentId);
  const adminDeptIds=memberships.filter(x=>x.role==='admin').map(x=>x.departmentId);
  if(role==='dept_admin' && (!adminDeptIds.length || departmentId && !adminDeptIds.includes(departmentId))) return deny('Forbidden',403);
  if(departmentId && !await prisma.department.findFirst({where:{id:departmentId,orgId},select:{id:true}})) return deny('Department not found',404);
  const principals=await getUserPrincipals(prisma,user.id,{orgId});
  const access=repositoryAccessWhere({orgId,role,userDeptIds,adminDeptIds,principals});
  const where={AND:[access,{orgId,deletedAt:null},...(role==='dept_admin'?[{departmentId:{in:departmentId?[departmentId]:adminDeptIds}}]:departmentId?[{departmentId}]:[]),...(sourceSystem?[{sourceProvider:sourceSystem}]:[])]};
  try {
    // Bound the response to avoid loading an entire large tenant into memory.
    const docs=await prisma.document.findMany({where,orderBy:{id:'asc'},take:2001,select:{id:true,filename:true,departmentId:true,sourceProvider:true,createdAt:true,contentUpdatedAt:true,lifecycleSuggestion:true,ownerId:true,category:true,summary:true,nextReviewAt:true,reviewRecords:{select:{status:true,dueAt:true}},links:{select:{status:true}},duplicatesAsDocument:{select:{status:true}},duplicatesAsOriginal:{select:{status:true}}}});
    if(docs.length>2000) return deny('Health dataset exceeds 2000 documents; narrow department or source filters',422);
    const recent=new Date(Date.now()-days*86400000);
    const scopedDocs=query.get('all')==='1' ? docs : docs.filter(d=>new Date(d.contentUpdatedAt||d.createdAt)>=recent);
    const report=summarizeContentHealth(scopedDocs);
    const metric=query.get('metric');
    if(metric) report.documents=report.documents.filter(d=>d.flags[metric]);
    if(query.get('format')==='csv') return new Response(contentHealthCsv(report.documents),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="kms-content-health.csv"','Cache-Control':'no-store'}});
    return NextResponse.json({...report,filters:{departmentId,sourceSystem,days,scope:role==='dept_admin'?'managed_departments':'organization'}},{headers:{'Cache-Control':'no-store'}});
  } catch(error) { console.error('D-M3 content health',error); return deny('Content health unavailable',500); }
}
