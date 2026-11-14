import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { validateDefinition } from '@/lib/workflows/engine.mjs';
import { AUDIT_EVENTS } from '@/lib/audit/events';
const fail = (error,status) => NextResponse.json({error},{status});
async function access(orgId) {
  const session = await getServerSession();
  if (!session?.user?.email) return {error:fail('Unauthorized',401)};
  const {user,role} = await resolveOrgRole(session.user.email,orgId);
  if (!user || !role) return {error:fail('Forbidden',403)};
  return {user,role};
}
export async function GET(_request,{params}) {
  const {orgId}=await params;const auth=await access(orgId);if(auth.error)return auth.error;
  const items=await prisma.workflowDefinition.findMany({where:{orgId},include:{stages:{orderBy:{position:'asc'}}},orderBy:{createdAt:'desc'}});
  return NextResponse.json({items});
}
export async function POST(request,{params}) {
  const {orgId}=await params;const auth=await access(orgId);if(auth.error)return auth.error;
  if(auth.role!=='super_admin')return fail('Forbidden',403);
  let body;try{body=await request.json();}catch{return fail('Invalid JSON',400)}
  const issue=validateDefinition(body);if(issue)return fail(issue,400);
  if(body.kind!=null && !["publish","decommission"].includes(body.kind))return fail("Invalid workflow kind",400);
  const approvers=[...new Set(body.stages.filter(s=>(s.approverType||'user')==='user').map(s=>s.approverUserId))];
  const departmentIds=[...new Set(body.departmentIds||[])],categories=[...new Set((body.categories||[]).map(c=>c.trim()))];
  try {
    const result=await prisma.$transaction(async tx=>{
      const members=await tx.organizationMember.findMany({where:{orgId,userId:{in:approvers}},select:{userId:true}});
      if(members.length!==approvers.length)throw new Error('INVALID_APPROVERS');
      if(departmentIds.length&&(await tx.department.count({where:{orgId,id:{in:departmentIds}}}))!==departmentIds.length)throw new Error('INVALID_DEPARTMENTS');
      const stages=body.stages.map((s,i)=>({position:i+1,name:s.name.trim(),approverType:s.approverType||'user',approverUserId:(s.approverType||'user')==='user'?s.approverUserId:null,approvalMode:s.approvalMode||'any'}));
      const item=await tx.workflowDefinition.create({data:{orgId,name:body.name.trim(),kind:body.kind||"publish",departmentIds,categories,stages:{create:stages}},include:{stages:true}});
      await tx.auditLog.create({data:{orgId,actorUserId:auth.user.id,action:AUDIT_EVENTS.WORKFLOW_DEFINITION_CHANGED,entityType:'workflow_definition',entityId:item.id,metadata:{stageCount:body.stages.length,approverTypes:stages.map(s=>s.approverType),departmentIds,categories}}});
      return item;
    },{isolationLevel:'Serializable'});
    return NextResponse.json(result,{status:201});
  }catch(error){if(error.message==='INVALID_APPROVERS')return fail('Approvers must belong to the organization',400);if(error.message==='INVALID_DEPARTMENTS')return fail('Unknown department',400);if(error.code==='P2002')return fail('Workflow name already exists',409);console.error('Workflow definition failed',error);return fail('Unable to create workflow',500)}
}
