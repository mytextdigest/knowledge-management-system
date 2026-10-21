import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import OpenAI from "openai";
import { resolveOrgRole, isSuperAdmin } from "@/lib/orgGuard";
import { getAccessibleExperts } from "@/lib/knowledgeContext";
import { resolveOpenAIKey } from "@/utils/key_helper";

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

  // Rank topics by meaning rather than requiring an exact substring match -
  // falls back to word-based text matching (inside getAccessibleExperts) if
  // no key is configured or the embedding call fails.
  let queryEmbedding = null;
  const trimmedQuery = query.trim();
  if (trimmedQuery) {
    try {
      const apiKey = await resolveOpenAIKey({ userId: user.id, orgId });
      if (apiKey) {
        const openai = new OpenAI({ apiKey });
        const embRes = await openai.embeddings.create({ model: "text-embedding-3-small", input: trimmedQuery });
        queryEmbedding = embRes.data[0].embedding;
      }
    } catch (err) {
      console.error("Expert search embedding failed, falling back to text search:", err);
    }
  }

  const experts=await getAccessibleExperts({orgId,userId:user.id,query,topicId,isSuperAdmin:isSuperAdmin(role),limit,queryEmbedding});
  return NextResponse.json({ experts, viewerUserId: user.id, canAdminConfirm: role === "dept_admin" || isSuperAdmin(role) });
}
