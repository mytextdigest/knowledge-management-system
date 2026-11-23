import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { repositoryAccessWhere, getUserPrincipals } from '@/lib/access/documentAccess';
import { summarizeContentHealth, contentHealthCsv } from '@/lib/analytics/contentHealth.mjs';
import { getSetting } from '@/lib/settings';

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
  const days=query.has('days') ? Number(query.get('days')) : null;
  if(days!==null && ![30,90,365].includes(days)) return deny('Invalid period',400);
  const memberships=await prisma.departmentMember.findMany({where:{userId:user.id,department:{orgId}},select:{departmentId:true,role:true}});
  const userDeptIds=memberships.map(x=>x.departmentId);
  const adminDeptIds=memberships.filter(x=>x.role==='admin').map(x=>x.departmentId);
  if(role==='dept_admin' && (!adminDeptIds.length || departmentId && !adminDeptIds.includes(departmentId))) return deny('Forbidden',403);
  if(departmentId && !await prisma.department.findFirst({where:{id:departmentId,orgId},select:{id:true}})) return deny('Department not found',404);
  const principals=await getUserPrincipals(prisma,user.id,{orgId});
  const access=repositoryAccessWhere({orgId,role,userDeptIds,adminDeptIds,principals});
  const where={AND:[access,{orgId,deletedAt:null},...(role==='dept_admin'?[{departmentId:{in:departmentId?[departmentId]:adminDeptIds}}]:departmentId?[{departmentId}]:[]),...(sourceSystem?[{sourceProvider:sourceSystem}]:[])]};
  try {
    // Stream document batches through the aggregator. No tenant-size 422 and
    // no unbounded document array for the interactive drill-through.
    const metadataRules = await getSetting(orgId, 'metadata.requiredFields');
    const metric = query.get('metric');
    const page = Math.max(1, Math.min(100000, Number(query.get('page')) || 1));
    const pageSize = 50;
    const csv = query.get('format') === 'csv';
    const counts = { total:0, stale:0, owned:0, reviewCurrent:0, reviewDue:0, reviewOverdue:0, brokenLinks:0, duplicates:0, complete:0 };
    const buckets = { under30:0, days30to90:0, over90:0 };
    const documents = [];
    let matching = 0, cursor;
    const recent = days === null || query.get('all') === '1' ? null : new Date(Date.now() - days * 86400000);
    for (;;) {
      const batch = await prisma.document.findMany({
        where: { AND: [...where.AND, ...(recent ? [{ OR: [{ contentUpdatedAt: { gte: recent } }, { contentUpdatedAt: null, createdAt: { gte: recent } }] }] : [])] },
        orderBy: { id: 'asc' }, take: 250,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id:true, filename:true, departmentId:true, sourceProvider:true, createdAt:true, contentUpdatedAt:true,
          lifecycleSuggestion:true, ownerId:true, category:true, summary:true, stewards:{select:{userId:true}}, nextReviewAt:true,
          reviewRecords:{select:{status:true,dueAt:true}}, links:{select:{status:true}},
          duplicatesAsDocument:{select:{status:true}}, duplicatesAsOriginal:{select:{status:true}} },
      });
      if (!batch.length) break;
      cursor = batch[batch.length - 1].id;
      const partial = summarizeContentHealth(batch, { metadataRules });
      for (const key of Object.keys(counts)) counts[key] += partial.counts[key];
      for (const key of Object.keys(buckets)) buckets[key] += partial.buckets[key];
      for (const row of partial.documents) {
        if (metric && !row.flags[metric]) continue;
        if (csv || (matching >= (page - 1) * pageSize && matching < page * pageSize)) documents.push(row);
        matching++;
      }
    }
    if (csv) return new Response(contentHealthCsv(documents), { headers: {
      'Content-Type':'text/csv; charset=utf-8', 'Content-Disposition':'attachment; filename="kms-content-health.csv"', 'Cache-Control':'no-store',
    } });
    return NextResponse.json({ counts, buckets, documents, pagination: { page, pageSize, matching, hasMore: matching > page * pageSize },
      filters: { departmentId, sourceSystem, days, scope: role === 'dept_admin' ? 'managed_departments' : 'organization', permittedDepartmentIds: role === 'dept_admin' ? adminDeptIds : null } },
      { headers: { 'Cache-Control':'no-store' } });
  } catch(error) { console.error('D-M3 content health',error); return deny('Content health unavailable',500); }
}
