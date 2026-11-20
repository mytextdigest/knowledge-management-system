// The signed-in user for the route under test: set globalThis.__testSessionEmail.
export async function getServerSession() {
  const email = globalThis.__testSessionEmail;
  return email ? { user: { email } } : null;
}
export default function NextAuth() { throw new Error("NextAuth isn't available in route tests"); }
