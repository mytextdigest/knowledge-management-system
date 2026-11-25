// EKP E-12: shared bits of the SAML Jackson routes (src/app/api/oauth/*).

import { NextResponse } from "next/server";

/** An HTML page Jackson builds (an auto-submitting form). */
export function htmlResponse(html) {
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/** Back to the sign-in page with an error code it knows. */
export function signInError(req, code = "SamlFailed") {
  return NextResponse.redirect(new URL(`/auth/signin?error=${code}`, process.env.NEXTAUTH_URL || req.url), 303);
}

/** A form or query body as a plain object. */
export async function readParams(req) {
  if (req.method === "GET") return Object.fromEntries(new URL(req.url).searchParams);
  const type = req.headers.get("content-type") || "";
  if (type.includes("application/json")) return (await req.json().catch(() => ({}))) || {};
  const form = await req.formData().catch(() => null);
  return form ? Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])) : {};
}
