import {NextResponse} from 'next/server';
import {getServerSession} from 'next-auth';
import {resolveOrgRole} from '@/lib/orgGuard';
import {scanDueReviews} from '@/lib/governance/reviewScan';
export async function POST(_request,{params}){const {orgId}=await params;const session=await getServerSession();if(!session?.user?.email)return NextResponse.json({error:'Unauthorized'},{status:401});const {user,role}=await resolveOrgRole(session.user.email,orgId);if(!user||role!=='super_admin')return NextResponse.json({error:'Forbidden'},{status:403});try{return NextResponse.json(await scanDueReviews({orgId,actorUserId:user.id}));}catch(e){console.error('Review scan failed',e);return NextResponse.json({error:'Scan failed'},{status:500})}}
