import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole } from "@/lib/orgGuard";
import { repositoryAccessWhere, getUserPrincipals } from "@/lib/access/documentAccess";
const fail = (message,status=400) => NextResponse.json({error:message},{status});
async function context(orgId,documentId) {
 const session=await getServerSession(); if(!session?.user?.email)return {error:fail("Unauthorized",401)};
 const {user,role}=await resolveOrgRole(session.user.email,orgId); if(!user||!role)return {error:fail("Forbidden",403)};
 const memberships=await prisma.departmentMember.findMany({where:{userId:user.id},select:{departmentId:true,role:true}});
 const principals=await getUserPrincipals(prisma,user.id,{orgId});
 const where=repositoryAccessWhere({orgId,role,userId:user.id,userDeptIds:memberships.map(x=>x.departmentId),adminDeptIds:memberships.filter(x=>x.role==="admin").map(x=>x.departmentId),principals});
 const document=await prisma.document.findFirst({where:{AND:[where,{id:documentId,orgId,deletedAt:null}]},select:{id:true,userId:true,departmentId:true}});
 if(!document)return {error:fail("Document not found or inaccessible",404)};
 return {user,role,document,memberships};
}
export async function GET(_req,{params}) {
 const {orgId,documentId}=await params;const a=await context(orgId,documentId);if(a.error)return a.error;
 const fields=await prisma.metadataField.findMany({where:{orgId},include:{termSet:{select:{id:true,name:true,terms:{select:{id:true,label:true,status:true},orderBy:{label:"asc"}}}},documentTerms:{where:{documentId,status:"accepted"},include:{term:{select:{id:true,label:true,status:true}}}}},orderBy:{name:"asc"}});
 return NextResponse.json({fields});
}
export async function PUT(req,{params}) {
 const {orgId,documentId}=await params;const a=await context(orgId,documentId);if(a.error)return a.error;
 const isDeptAdmin=a.role==="dept_admin" && a.document.departmentId && a.memberships.some(x=>x.departmentId===a.document.departmentId&&x.role==="admin");
 if(a.role!=="super_admin"&&!isDeptAdmin&&a.document.userId!==a.user.id)return fail("Not permitted to tag this document",403);
 const b=await req.json().catch(()=>({}));if(typeof b.fieldId!=="string"||!Array.isArray(b.termIds)||b.termIds.length>50||b.termIds.some(x=>typeof x!=="string"))return fail("Invalid field or terms");
 const ids=[...new Set(b.termIds)];
 const field=await prisma.metadataField.findFirst({where:{id:b.fieldId,orgId},include:{termSet:true}});
 if(!field)return fail("Field not found",404);
 if(field.termSet.readOnly)return fail("Externally managed field",403);
 if(!field.multi&&ids.length>1)return fail("Field accepts one term");
 if(field.required&&ids.length===0)return fail("Required field cannot be cleared");
 const terms=await prisma.term.findMany({where:{id:{in:ids},termSetId:field.termSetId,status:"active"},select:{id:true}});
 if(terms.length!==ids.length)return fail("Invalid or deprecated term");
 const result=await prisma.$transaction(async tx=>{
  // A single-value field cannot accept a conflicting automatic/external assignment.
  // Preserve provenance: do not silently delete or overwrite non-manual records.
  if (!field.multi) {
   const otherAccepted=await tx.documentTerm.findMany({
    where:{documentId,fieldId:field.id,status:"accepted",source:{not:"manual"}},
    select:{termId:true}
   });
   if (otherAccepted.some(x=>!ids.includes(x.termId))) {
    throw new Error("TAXONOMY_SINGLE_VALUE_CONFLICT");
   }
  }
  const before=await tx.documentTerm.findMany({where:{documentId,fieldId:field.id,source:"manual"},select:{termId:true}});
  await tx.documentTerm.deleteMany({where:{documentId,fieldId:field.id,source:"manual"}});
  // Do not overwrite provenance or acceptance state of non-manual assignments.
  for (const termId of ids) {
   const existing = await tx.documentTerm.findUnique({where:{documentId_fieldId_termId:{documentId,fieldId:field.id,termId}}});
   if (!existing) await tx.documentTerm.create({data:{documentId,fieldId:field.id,termId,source:"manual",status:"accepted",createdById:a.user.id,acceptedById:a.user.id,acceptedAt:new Date()}});
   else if (existing.status!=="accepted") await tx.documentTerm.update({where:{id:existing.id},data:{status:"accepted",acceptedById:a.user.id,acceptedAt:new Date()}});
  }
  await tx.auditLog.create({data:{orgId,actorUserId:a.user.id,action:"taxonomy.document_tags.updated",entityType:"Document",entityId:documentId,before:{fieldId:field.id,manualTermIds:before.map(x=>x.termId)},after:{fieldId:field.id,termIds:ids}}});
  return {termIds:ids};
 }).catch(error=>{
  if(error?.message==="TAXONOMY_SINGLE_VALUE_CONFLICT") return null;
  throw error;
 });
 if(!result)return fail("This single-value field already has a different accepted non-manual tag. Review that assignment before changing it.",409);
 return NextResponse.json(result);
}
