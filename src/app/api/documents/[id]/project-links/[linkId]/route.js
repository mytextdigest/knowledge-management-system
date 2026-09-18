import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveOrgRole } from "@/lib/orgGuard";
import { canManageProjectLink, normalizeProjectLinkStatus } from "@/lib/knowledgeContextPolicy";

export async function PATCH(req,{params}){
 const session=await getServerSession(); if(!session?.user?.email) return NextResponse.json({error:'Unauthorized'},{status:401});
 const {id,linkId}=await params; const body=await req.json();
 const status=normalizeProjectLinkStatus(body.status);
 if(!status) return NextResponse.json({error:'Invalid status'},{status:400});
 const link=await prisma.documentProjectLink.findUnique({where:{id:linkId},include:{document:true}});
 if(!link||link.documentId!==id||!link.document.orgId) return NextResponse.json({error:'Not found'},{status:404});
 const {user,role}=await resolveOrgRole(session.user.email,link.document.orgId);
 if(!user||!canManageProjectLink({role,documentUserId:link.document.userId,userId:user.id})) return NextResponse.json({error:'Forbidden'},{status:403});
 const updated=await prisma.documentProjectLink.update({where:{id:linkId},data:{status},include:{project:{select:{id:true,name:true}}}});
 return NextResponse.json({link:updated});
}
