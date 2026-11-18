// EKP E-12: one-time setup of SAML Jackson's tables in the `jackson` schema
// of the database (outside Prisma). The app never creates or changes them
// (manualMigration), so run this once per database, after telling the team.
//
//   node --env-file=.env scripts/ekp/e12-jackson-setup.mjs           # check only (read-only)
//   node --env-file=.env scripts/ekp/e12-jackson-setup.mjs --apply   # create schema + tables
//
// Needs SAML_JACKSON_DB_URL (Neon's direct, unpooled URL),
// SAML_JACKSON_CLIENT_SECRET_VERIFIER, SAML_JACKSON_ENCRYPTION_KEY and
// NEXTAUTH_URL. Afterwards `npm run ekp:migration:diff` must still report no
// drift (Prisma only looks at the `public` schema).

import pg from "pg";
import { isSamlAvailable, jacksonOptions } from "../../src/lib/sso/jackson.js";

const apply = process.argv.includes("--apply");

if (!isSamlAvailable()) {
  console.error("Set SAML_JACKSON_DB_URL, SAML_JACKSON_CLIENT_SECRET_VERIFIER, SAML_JACKSON_ENCRYPTION_KEY and NEXTAUTH_URL first.");
  process.exit(1);
}

async function report(client) {
  const schema = await client.query("select 1 from information_schema.schemata where schema_name = 'jackson'");
  const tables = await client.query(
    "select table_name from information_schema.tables where table_schema = 'jackson' order by table_name"
  );
  console.log(`jackson schema: ${schema.rowCount ? "exists" : "missing"}`);
  console.log(`jackson tables: ${tables.rows.map((r) => r.table_name).join(", ") || "none"}`);
  return { schema: schema.rowCount > 0, tables: tables.rows.map((r) => r.table_name) };
}

const client = new pg.Client({ connectionString: process.env.SAML_JACKSON_DB_URL });
await client.connect();
try {
  const before = await report(client);
  if (!apply) {
    const ready = before.schema && ["jackson_index", "jackson_store", "jackson_ttl"].every((t) => before.tables.includes(t));
    console.log(ready ? "Ready." : "Not set up. Run again with --apply (after telling the team).");
    process.exit(0);
  }
  await client.query("create schema if not exists jackson");
  console.log("Creating Jackson's tables…");
  const { default: jackson } = await import("@boxyhq/saml-jackson");
  const start = jackson.default ?? jackson;
  await start(jacksonOptions({ manualMigration: false }));
  await report(client);
  console.log("Done. Now check `npm run ekp:migration:diff` reports no drift.");
} finally {
  await client.end();
}
process.exit(0);
