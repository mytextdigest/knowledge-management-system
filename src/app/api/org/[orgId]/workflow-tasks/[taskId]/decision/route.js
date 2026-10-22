import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { decide, validateDecommissionTarget } from '@/lib/workflows/engine.mjs';
import { validateTaskDecision } from '@/lib/workflows/taskInbox.mjs';
import { AUDIT_EVENTS } from '@/lib/audit/events';
import { notify } from '@/lib/notifications/notify';
const fail=(error,status)=>NextResponse.json({error},{status});
export async function POST(request,{params}){
 const {orgId,taskId}=await params;
 const session=await getServerSession();if(!session?.user?.email)return fail('Unauthorized',401);
 const {user,role}=await resolveOrgRole(session.user.email,orgId);if(!user||!role)return fail('Forbidden',403);
 let body;try{body=await request.json()}catch{return fail('Invalid JSON',400)}
 const validationError=validateTaskDecision(body?.action,body?.comment);if(validationError)return fail(validationError,400);
 try{
 const result=await prisma.$transaction(async tx=>{
  const task=await tx.workflowTask.findFirst({where:{id:taskId,instance:{orgId}},include:{instance:{include:{definition:{include:{stages:{orderBy:{position:'asc'}}}}}}}});
  if(!task)throw new Error('NOT_FOUND');
  const instance=task.instance;
  const transition=decide({actorId:user.id,submittedById:instance.submittedById,assigneeId:task.assigneeId,status:instance.status,taskStatus:task.status,action:body.action,position:instance.currentPosition,totalStages:instance.definition.stages.length});
  if(transition.error)throw new Error('INVALID_TRANSITION');
  if(task.stageId!==instance.definition.stages[instance.currentPosition-1]?.id)throw new Error('INVALID_TRANSITION');
  const claim=await tx.workflowTask.updateMany({where:{id:task.id,status:'pending',assigneeId:user.id},data:{status:transition.taskStatus,decidedAt:new Date()}});
  if(claim.count!==1)throw new Error('CONFLICT');
  const updated=await tx.workflowInstance.updateMany({where:{id:instance.id,status:'in_review',currentPosition:instance.currentPosition},data:{status:transition.instanceStatus,currentPosition:transition.nextPosition}});
  if(updated.count!==1)throw new Error('CONFLICT');
  await tx.workflowDecision.create({data:{instanceId:instance.id,taskId:task.id,actorId:user.id,action:body.action,comment:body.comment?.trim()||null}});
  let nextAssigneeId=null;
  if(transition.instanceStatus==='in_review'){
   const next=instance.definition.stages[transition.nextPosition-1];
   if(next.approverUserId===instance.submittedById)throw new Error('SELF_APPROVAL');
   const membership=await tx.organizationMember.findUnique({where:{orgId_userId:{orgId,userId:next.approverUserId}},select:{userId:true}});
   if(!membership)throw new Error('MISSING_APPROVER');
   await tx.workflowTask.create({data:{instanceId:instance.id,stageId:next.id,assigneeId:next.approverUserId}});
   nextAssigneeId=next.approverUserId;
  }
  if(transition.instanceStatus==='approved' && instance.definition.kind==='decommission'){
   const doc=await tx.document.findFirst({where:{id:instance.documentId,orgId,scope:'repository',deletedAt:null},select:{lifecycle:true}});
   if(!doc || !validateDecommissionTarget(doc.lifecycle,instance.targetLifecycle))throw new Error('DECOMMISSION_CONFLICT');
   const applied=await tx.document.updateMany({where:{id:instance.documentId,orgId,scope:'repository',deletedAt:null,lifecycle:doc.lifecycle},data:{lifecycle:instance.targetLifecycle}});
   if(applied.count!==1)throw new Error('DECOMMISSION_CONFLICT');
   await tx.auditLog.create({data:{orgId,actorUserId:user.id,action:instance.targetLifecycle==='archived'?AUDIT_EVENTS.DOCUMENT_ARCHIVED:AUDIT_EVENTS.DOCUMENT_RETIRED,entityType:'document',entityId:instance.documentId,metadata:{workflowInstanceId:instance.id,approvedBy:user.id}}});
  }
  const action=body.action==='approve'?AUDIT_EVENTS.WORKFLOW_APPROVED:body.action==='reject'?AUDIT_EVENTS.WORKFLOW_REJECTED:AUDIT_EVENTS.WORKFLOW_CHANGES_REQUESTED;
  await tx.auditLog.create({data:{orgId,actorUserId:user.id,action,entityType:'document',entityId:instance.documentId,metadata:{workflowInstanceId:instance.id,taskId}}});
  return {status:transition.instanceStatus,nextAssigneeId,submitterId:instance.submittedById,documentId:instance.documentId};
 },{isolationLevel:'Serializable'});
 const recipients=result.nextAssigneeId?[result.nextAssigneeId]:[result.submitterId];
 await notify({orgId,userIds:recipients,type:result.nextAssigneeId?'workflow.task_assigned':'workflow.decided',title:result.nextAssigneeId?'Document review assigned':'Document workflow updated',body:result.nextAssigneeId?'A document is awaiting your review.':`Workflow status: ${result.status}`,link:`/document?id=${encodeURIComponent(result.documentId)}`});
 return NextResponse.json({status:result.status});
 }catch(error){if(error.message==='NOT_FOUND')return fail('Not found',404);if(error.message==='INVALID_TRANSITION')return fail('Task is not pending or not assigned to you',403);if(['CONFLICT','SELF_APPROVAL','MISSING_APPROVER','DECOMMISSION_CONFLICT'].includes(error.message)||error.code==='P2034'||error.code==='P2002')return fail('Workflow changed; reload and retry',409);console.error('Workflow decision failed',error);return fail('Unable to record decision',500)}
}
