import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { AUDIT_EVENTS } from '@/lib/audit/events';
import { notify } from '@/lib/notifications/notify';
import { validateDecommissionTarget } from '@/lib/workflows/engine.mjs';
const fail=(error,status)=>NextResponse.json({error},{status});
async function access(id){
 const session=await getServerSession();if(!session?.user?.email)return {error:fail('Unauthorized',401)};
 const doc=await prisma.document.findFirst({where:{id,scope:'repository',deletedAt:null},select:{id:true,orgId:true,userId:true,ownerId:true}});
 if(!doc?.orgId)return {error:fail('Not found',404)};
 const {user,role}=await resolveOrgRole(session.user.email,doc.orgId);if(!user||!role)return {error:fail('Forbidden',403)};
 return {doc,user,role};
}
export async function GET(_request,{params}){
 const {id}=await params;const auth=await access(id);if(auth.error)return auth.error;
 if(auth.role!=='super_admin'&&auth.doc.userId!==auth.user.id&&auth.doc.ownerId!==auth.user.id){
   const assigned=await prisma.workflowTask.findFirst({where:{assigneeId:auth.user.id,instance:{documentId:id,orgId:auth.doc.orgId}},select:{id:true}});
   if(!assigned)return fail('Forbidden',403);
 }
 const items=await prisma.workflowInstance.findMany({where:{documentId:id,orgId:auth.doc.orgId},include:{tasks:{include:{stage:true},orderBy:{createdAt:'asc'}},decisions:{orderBy:{createdAt:'asc'}}},orderBy:{createdAt:'desc'},take:30});
 return NextResponse.json({items});
}
export async function POST(request,{params}){
 const {id}=await params;const auth=await access(id);if(auth.error)return auth.error;
 if(auth.role!=='super_admin'&&auth.doc.userId!==auth.user.id&&auth.doc.ownerId!==auth.user.id)return fail('Forbidden',403);
 let body;try{body=await request.json()}catch{return fail('Invalid JSON',400)}
 if(typeof body?.definitionId!=='string'||!body.definitionId)return fail('definitionId required',400);
 try{
 const result=await prisma.$transaction(async tx=>{
   const doc=await tx.document.findFirst({where:{id,orgId:auth.doc.orgId,scope:'repository',deletedAt:null},select:{id:true,lifecycle:true}});
   if(!doc)throw new Error('DOCUMENT_GONE');
   const active=await tx.workflowInstance.findFirst({where:{documentId:id,orgId:auth.doc.orgId,status:'in_review'},select:{id:true}});
   if(active)throw new Error('ALREADY_ACTIVE');
   const definition=await tx.workflowDefinition.findFirst({where:{id:body.definitionId,orgId:auth.doc.orgId,active:true},include:{stages:{orderBy:{position:'asc'}}}});
   if(!definition?.stages.length)throw new Error('INVALID_DEFINITION');
   if(definition.kind==='decommission' && !validateDecommissionTarget(doc.lifecycle,body.targetLifecycle))throw new Error('INVALID_TARGET');
   if(definition.kind!=='decommission' && body.targetLifecycle)throw new Error('INVALID_TARGET');
   if(definition.stages.some(s=>s.approverUserId===auth.user.id))throw new Error('SELF_APPROVAL');
   const members=await tx.organizationMember.findMany({where:{orgId:auth.doc.orgId,userId:{in:definition.stages.map(s=>s.approverUserId)}},select:{userId:true}});
   if(new Set(members.map(m=>m.userId)).size!==new Set(definition.stages.map(s=>s.approverUserId)).size)throw new Error('INVALID_APPROVERS');
   const instance=await tx.workflowInstance.create({data:{orgId:auth.doc.orgId,documentId:id,definitionId:definition.id,submittedById:auth.user.id,targetLifecycle:definition.kind==='decommission'?body.targetLifecycle:null,tasks:{create:{stageId:definition.stages[0].id,assigneeId:definition.stages[0].approverUserId}}}});
   await tx.auditLog.create({data:{orgId:auth.doc.orgId,actorUserId:auth.user.id,action:AUDIT_EVENTS.WORKFLOW_SUBMITTED,entityType:'document',entityId:id,metadata:{workflowInstanceId:instance.id}}});
   return {instance,assigneeId:definition.stages[0].approverUserId};
 },{isolationLevel:'Serializable'});
 await notify({orgId:auth.doc.orgId,userIds:[result.assigneeId],type:'workflow.task_assigned',title:'Document review assigned',body:'A document is awaiting your approval.',link:`/document?id=${encodeURIComponent(id)}`});
 return NextResponse.json({id:result.instance.id,status:'in_review'},{status:201});
 }catch(error){if(['DOCUMENT_GONE','ALREADY_ACTIVE','SELF_APPROVAL','INVALID_DEFINITION','INVALID_APPROVERS','INVALID_TARGET'].includes(error.message))return fail(error.message,error.message==='ALREADY_ACTIVE'?409:400);if(error.code==='P2034')return fail('Concurrent submission; retry',409);console.error('Workflow submit failed',error);return fail('Unable to submit workflow',500)}
}
