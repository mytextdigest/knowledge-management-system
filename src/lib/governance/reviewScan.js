import {prisma} from '@/lib/prisma';
import {notify} from '@/lib/notifications/notify';
import {matchesPolicy,reviewerFor,addDays} from './reviewCycles.mjs';
import {AUDIT_EVENTS} from '@/lib/audit/events';
// Invoke from a trusted scheduler/worker; never from a public unauthenticated route.
// Run in batches; re-check under Serializable transaction before creating records.
export async function scanDueReviews({orgId,actorUserId,now=new Date(),limit=100}){
 const policies=await prisma.reviewPolicy.findMany({where:{orgId,active:true},orderBy:{createdAt:'asc'}});
 const docs=await prisma.document.findMany({where:{orgId,scope:'repository',deletedAt:null,lifecycle:'published',OR:[{nextReviewAt:{lte:now}},{nextReviewAt:null}]},select:{id:true,ownerId:true,departmentId:true,category:true,createdAt:true,lastReviewedAt:true,nextReviewAt:true,stewards:{select:{userId:true}}},orderBy:{createdAt:'asc'},take:limit});
 let created=0,skipped=0;
 for(const doc of docs){const policy=policies.find(p=>matchesPolicy(doc,p));if(!policy){skipped++;continue;}const due=doc.nextReviewAt||addDays(doc.lastReviewedAt||doc.createdAt,policy.intervalDays);if(due>now){skipped++;continue;}const reviewerId=reviewerFor(doc,policy);if(!reviewerId){skipped++;continue;}
 try{const record=await prisma.$transaction(async tx=>{
  const live=await tx.document.findFirst({where:{id:doc.id,orgId,scope:'repository',deletedAt:null,lifecycle:'published'},select:{id:true,ownerId:true,departmentId:true,category:true,createdAt:true,lastReviewedAt:true,nextReviewAt:true,stewards:{select:{userId:true}}}});
   if(!live)return null;
   const activePolicy=await tx.reviewPolicy.findFirst({where:{id:policy.id,orgId,active:true}});
   if(!activePolicy||!matchesPolicy(live,activePolicy))return null;
   const liveDue=live.nextReviewAt||addDays(live.lastReviewedAt||live.createdAt,activePolicy.intervalDays);
   if(liveDue>now)return null;
   if(reviewerFor(live,activePolicy)!==reviewerId)return null;
  const open=await tx.reviewRecord.findFirst({where:{orgId,documentId:doc.id,status:'pending'},select:{id:true}});if(open)return null;
  const member=await tx.organizationMember.findUnique({where:{orgId_userId:{orgId,userId:reviewerId}},select:{userId:true}});if(!member)return null;
  const item=await tx.reviewRecord.create({data:{orgId,documentId:doc.id,policyId:policy.id,reviewerId,dueAt:due}});
  await tx.document.update({where:{id:doc.id},data:{nextReviewAt:due}});
  await tx.auditLog.create({data:{orgId,actorUserId,action:AUDIT_EVENTS.REVIEW_STARTED,entityType:'document',entityId:doc.id,metadata:{reviewId:item.id,policyId:policy.id}}});return item;
 },{isolationLevel:'Serializable'});if(record){created++;await notify({orgId,userIds:[reviewerId],type:'review.due',title:'Periodic document review due',body:'A document requires your review.',link:`/document?id=${encodeURIComponent(doc.id)}`});}else skipped++;}catch(e){if(e.code==='P2034'){skipped++;continue;}throw e;}
 }
 const overdue=await prisma.reviewRecord.findMany({where:{orgId,status:'pending',escalatedAt:null,dueAt:{lt:now}},include:{policy:true,document:{select:{departmentId:true}}},take:limit});
 let escalated=0;
 for(const record of overdue){if(addDays(record.dueAt,record.policy.escalateAfterDays)>now)continue;
 const claimed=await prisma.reviewRecord.updateMany({where:{id:record.id,status:'pending',escalatedAt:null},data:{escalatedAt:now}});if(claimed.count!==1)continue;escalated++;
 const admins=record.document.departmentId?await prisma.departmentMember.findMany({where:{departmentId:record.document.departmentId,role:'admin'},select:{userId:true}}):[];
 const ids=admins.map(x=>x.userId);if(!ids.length){const orgAdmins=await prisma.organizationMember.findMany({where:{orgId,role:'super_admin'},select:{userId:true}});ids.push(...orgAdmins.map(x=>x.userId));}
 await prisma.auditLog.create({data:{orgId,actorUserId,action:AUDIT_EVENTS.REVIEW_ESCALATED,entityType:'document',entityId:record.documentId,metadata:{reviewId:record.id}}});
 if(ids.length)await notify({orgId,userIds:ids,type:'review.overdue',title:'Document review overdue',body:'A periodic review is overdue.',link:`/document?id=${encodeURIComponent(record.documentId)}`});
 }
 return {created,skipped,escalated,scanned:docs.length};
}
