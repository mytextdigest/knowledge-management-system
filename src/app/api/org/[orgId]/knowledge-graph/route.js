import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { getKnowledgeGraph, getKnowledgeGraphSourceVersion, searchKnowledgeGraphNodes } from "@/lib/knowledgeGraph";
export async function GET(req,{params}){
 const session=await getServerSession(); if(!session?.user?.email)return NextResponse.json({error:"Unauthorized"},{status:401});
 const {orgId}=await params; const {user,role}=await resolveOrgRole(session.user.email,orgId); if(!user||!role)return NextResponse.json({error:"Forbidden"},{status:403});
 const sp=new URL(req.url).searchParams; const q=sp.get("q");
 if(q!==null){const nodes=await searchKnowledgeGraphNodes({orgId,userId:user.id,isSuperAdmin:isSuperAdmin(role),query:q,limit:20});return NextResponse.json({nodes});}
 const sourceVersion=await getKnowledgeGraphSourceVersion({orgId,userId:user.id,isSuperAdmin:isSuperAdmin(role)});
 if(sp.get("meta")==="1") return NextResponse.json({sourceVersion});
 const startNode=sp.get("start");
 const overview=sp.get("overview")==="1";
 if(!startNode&&!overview)return NextResponse.json({error:"start or overview is required"},{status:400});
 const data=await getKnowledgeGraph({orgId,userId:user.id,isSuperAdmin:isSuperAdmin(role),startNode:startNode||null,depth:sp.get("depth")||2,filters:{departmentId:sp.get("departmentId")||null,projectId:sp.get("projectId")||null,nodeType:sp.get("nodeType")||null,relationshipType:sp.get("relationshipType")||null,includeSuggested:sp.get("includeSuggested")==="1"}});
 return NextResponse.json({...data,sourceVersion});
}
