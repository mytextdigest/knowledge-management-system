import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { getAccessibleExperts } from "@/lib/knowledgeContext";

export async function GET(req, { params }) {
  const session=await getServerSession();
  if(!session?.user?.email) return NextResponse.json({error:'Unauthorized'},{status:401});
  const {orgId}=await params;
  const {user,role}=await resolveOrgRole(session.user.email,orgId);
  if(!user||!role) return NextResponse.json({error:'Forbidden'},{status:403});
  const query=new URL(req.url).searchParams.get('q')||'';
  if(query.trim().length<2) return NextResponse.json({experts:[]});
  const experts=await getAccessibleExperts({orgId,userId:user.id,query,isSuperAdmin:isSuperAdmin(role)});
  return NextResponse.json({experts});
}
