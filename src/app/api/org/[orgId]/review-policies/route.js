import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {prisma} from '@/lib/prisma';
import {resolveOrgRole} from '@/lib/orgGuard';
import {validateReviewPolicy} from '@/lib/governance/reviewCycles.mjs';
import {AUDIT_EVENTS} from '@/lib/audit/events';
const fail=(error,status)=>NextResponse.json({error},{status});
async function auth(orgId){const session=await getServerSession();if(!session?.user?.email)return {error:fail('Unauthorized',401)};const {user,role}=await resolveOrgRole(session.user.email,orgId);return user&&role?{user,role}:{error:fail('Forbidden',403)};}
export async function GET(_req,{params}){const {orgId}=await params;const a=await auth(orgId);if(a.error)return a.error;if(a.role!=='super_admin'&&a.role!=='dept_admin')return fail('Forbidden',403);const items=await prisma.reviewPolicy.findMany({where:{orgId},orderBy:{createdAt:'desc'},take:100});return NextResponse.json({items});}
export async function POST(req,{params}){const {orgId}=await params;const a=await auth(orgId);if(a.error)return a.error;if(a.role!=='super_admin')return fail('Forbidden',403);let b;try{b=await req.json()}catch{return fail('Invalid JSON',400)}const issue=validateReviewPolicy(b);if(issue)return fail(issue,400);try{const item=await prisma.$transaction(async tx=>{const item=await tx.reviewPolicy.create({data:{orgId,name:b.name.trim(),intervalDays:b.intervalDays,reviewerType:b.reviewerType,escalateAfterDays:b.escalateAfterDays,departmentIds:b.departmentIds,categories:b.categories}});await tx.auditLog.create({data:{orgId,actorUserId:a.user.id,action:AUDIT_EVENTS.REVIEW_POLICY_CHANGED,entityType:'review_policy',entityId:item.id,metadata:{name:item.name}}});return item});return NextResponse.json(item,{status:201});}catch(e){if(e.code==='P2002')return fail('Policy name exists',409);console.error(e);return fail('Could not create policy',500)}}
