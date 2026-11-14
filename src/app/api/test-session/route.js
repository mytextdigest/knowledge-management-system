import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// ✅ add this line for dynamic execution
export const dynamic = "force-dynamic";

export async function GET(req) {
  const session = await getServerSession(authOptions);
  return new Response(JSON.stringify(session), { status: 200 });
}