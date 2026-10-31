import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {prisma} from '@/lib/prisma';
import {resolveOrgRole} from '@/lib/orgGuard';
const fail=(error,status)=>NextResponse.json({error},{status});
export async function GET(req,{params}){const {orgId}=await params;const session=await getServerSession();if(!session?.user?.email)return fail('Unauthorized',401);const {user,role}=await resolveOrgRole(session.user.email,orgId);if(!user||!role)return fail('Forbidden',403);const admin=role==='super_admin'||role==='dept_admin';const status=new URL(req.url).searchParams.get('status')||'pending';if(!['pending','valid','update','retire','all'].includes(status))return fail('Invalid status',400);const items=await prisma.reviewRecord.findMany({where:{orgId,...(!admin?{reviewerId:user.id}:{}),...(status!=='all'?{status}:{})},select:{id:true,status:true,dueAt:true,escalatedAt:true,completedAt:true,documentId:true,reviewerId:true,policy:{select:{name:true,intervalDays:true}},document:{select:{filename:true,lifecycle:true}}},orderBy:{dueAt:'asc'},take:100});return NextResponse.json({items});}
