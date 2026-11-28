import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { resolveOrgRole } from '@/lib/orgGuard';
import { logAudit } from '@/lib/auditLog';
import { newKey,hashKey } from '@/lib/analytics/reporting.mjs';
const headers={'Cache-Control':'no-store'};
const select={id:true,name:true,keyPrefix:true,createdAt:true,lastUsedAt:true,revokedAt:true};
async function auth(params){const {orgId}=await params;const s=await getServerSession();if(!s?.user?.email)return {error:401};const {user,role}=await resolveOrgRole(s.user.email,orgId);return role==='super_admin'&&user?{orgId,user}:{error:403};}
const deny=status=>Response.json({error:status===401?'Unauthorized':'Forbidden'},{status,headers});
export async function GET(req,{params}){const a=await auth(params);if(a.error)return deny(a.error);return Response.json(await prisma.reportingApiKey.findMany({where:{orgId:a.orgId},select,orderBy:{createdAt:'desc'}}),{headers});}
export async function POST(req,{params}){const a=await auth(params);if(a.error)return deny(a.error);const body=await req.json().catch(()=>null);const name=typeof body?.name==='string'?body.name.trim():'';if(!name||name.length>100)return Response.json({error:'Invalid name'},{status:400,headers});const key=newKey();const row=await prisma.reportingApiKey.create({data:{orgId:a.orgId,name,keyHash:hashKey(key),keyPrefix:key.slice(0,8),createdById:a.user.id},select});await logAudit({orgId:a.orgId,actorUserId:a.user.id,action:'config.changed',entityType:'ReportingApiKey',entityId:row.id,metadata:{operation:'created'}});return Response.json({...row,key},{status:201,headers});}
export async function DELETE(req,{params}){const a=await auth(params);if(a.error)return deny(a.error);const id=new URL(req.url).searchParams.get('id');if(!id)return Response.json({error:'Missing id'},{status:400,headers});const result=await prisma.reportingApiKey.updateMany({where:{id,orgId:a.orgId,revokedAt:null},data:{revokedAt:new Date()}});if(!result.count)return Response.json({error:'Not found'},{status:404,headers});await logAudit({orgId:a.orgId,actorUserId:a.user.id,action:'config.changed',entityType:'ReportingApiKey',entityId:id,metadata:{operation:'revoked'}});return Response.json({revoked:true},{headers});}
