import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ACTIVE_ORG_COOKIE } from "@/lib/activeOrgCookie";

export async function GET() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value || null;
  return NextResponse.json({ orgId });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ACTIVE_ORG_COOKIE);
  return res;
}
