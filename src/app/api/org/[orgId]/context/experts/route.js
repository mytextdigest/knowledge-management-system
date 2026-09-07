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
  const searchParams = new URL(req.url).searchParams;
  const query=searchParams.get('q')||'';
  const topicId=searchParams.get('topicId')||null;
  const limit=searchParams.get('limit')||20;
  const experts=await getAccessibleExperts({orgId,userId:user.id,query,topicId,isSuperAdmin:isSuperAdmin(role),limit});
  return NextResponse.json({ experts, viewerUserId: user.id, canAdminConfirm: role === "dept_admin" || isSuperAdmin(role) });
}
