import { cookies } from "next/headers";
import { encryptJson, decryptJson } from "@/lib/crypto";

// Bridges the one-time delegated OAuth flow (callback -> site picker ->
// confirm) without ever persisting the delegated token to the DB. Holds
// { orgId, tenantId, accessToken, exp } as an encrypted httpOnly cookie.
const SETUP_COOKIE = "sp_setup";
const SETUP_TTL_SECONDS = 10 * 60; // matches the delegated token's short usage window

export async function setSetupCookie({ orgId, tenantId, accessToken, expiresIn }) {
  const payload = encryptJson({
    orgId,
    tenantId,
    accessToken,
    exp: Date.now() + Math.min(expiresIn * 1000, SETUP_TTL_SECONDS * 1000),
  });
  const cookieStore = await cookies();
  cookieStore.set(SETUP_COOKIE, payload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SETUP_TTL_SECONDS,
  });
}

export async function readSetupCookie(orgId) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SETUP_COOKIE)?.value;
  if (!raw) return null;
  let payload;
  try {
    payload = decryptJson(raw);
  } catch {
    return null;
  }
  if (payload.orgId !== orgId) return null;
  if (payload.exp < Date.now()) return null;
  return payload;
}

export async function clearSetupCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SETUP_COOKIE);
}
