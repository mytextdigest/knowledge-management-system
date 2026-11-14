// Generate a migration from the shared database to prisma/schema.prisma, safely.
//
//   node scripts/ekp/migration-diff.mjs --check                 # print pending SQL, write nothing
//   node scripts/ekp/migration-diff.mjs --name ekp_p2_e_source_tags_media
//   (--schema <path> compares another schema file instead of prisma/schema.prisma)
//
// Why: some indexes exist in the database but can't be declared in Prisma (the
// ivfflat vector index on Chunk), so a plain `prisma migrate diff` always adds
// `DROP INDEX` for them. This strips those known lines and stops if the SQL
// drops or alters anything else. Read-only against the database; it never
// applies a migration (run `npx prisma migrate deploy` after the PR merges).
//
// Uses DATABASE_URL from .env, never a stray one exported in the shell.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Indexes created by raw SQL migrations that Prisma can't express.
const UNDECLARABLE_INDEXES = [
  "Chunk_embedding_vec_idx", // 20260617000000_add_chunk_embedding_vec_index (ivfflat)
];

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1]?.startsWith("--") ? true : all[i + 1] ?? true]);
    return pairs;
  }, [])
);

function databaseUrlFromDotEnv() {
  const line = readFileSync(".env", "utf8").split("\n").find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL not found in .env");
  return line.slice("DATABASE_URL=".length).trim().replace(/^"(.*)"$/, "$1");
}

const isKnownDrop = (stmt) =>
  UNDECLARABLE_INDEXES.some((name) => new RegExp(`^DROP INDEX "public"\\."${name}";$`).test(stmt.trim()));

try {
  if (!args.check && (typeof args.name !== "string" || !/^[a-z0-9_]+$/.test(args.name))) {
    throw new Error("Pass --check, or --name <snake_case_name>");
  }

  const env = { ...process.env };
  delete env.DATABASE_URL; // the shell's copy can be a stale snapshot of .env
  const sql = execFileSync(
    "npx",
    ["prisma", "migrate", "diff", "--from-url", databaseUrlFromDotEnv(), "--to-schema-datamodel", args.schema || "prisma/schema.prisma", "--script"],
    { env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }
  );

  // Statements are separated by blank lines; comment headers ("-- DropIndex") go with their statement.
  const statements = sql.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const kept = statements.filter((s) => !isKnownDrop(s.replace(/^--.*\n/gm, "")));
  const body = kept.map((s) => s.replace(/^--.*\n/gm, "").trim()).filter((s) => s && !s.startsWith("-- This is an empty migration"));

  const risky = body.filter((s) => /^(DROP|ALTER TABLE .* (DROP|ALTER COLUMN)|TRUNCATE)/m.test(s));
  const stripped = statements.length - kept.length;
  if (stripped) console.error(`Stripped ${stripped} known undeclarable index drop(s): ${UNDECLARABLE_INDEXES.join(", ")}`);

  if (!body.length) {
    console.log("No schema changes: the database matches prisma/schema.prisma.");
    process.exit(0);
  }
  if (risky.length) {
    console.error("\nThe SQL drops or alters existing objects. Phase 2 changes must be additive; check for drift before continuing:\n");
    console.error(risky.join("\n\n"));
    process.exit(1);
  }

  const out = kept.join("\n\n") + "\n";
  if (args.check) {
    console.log(out);
    process.exit(0);
  }

  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const dir = path.join("prisma", "migrations", `${stamp}_${args.name}`);
  if (existsSync(dir)) throw new Error(`${dir} already exists`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "migration.sql"), out);
  console.log(`Wrote ${dir}/migration.sql. Review it, then open a schema-only PR into dev.`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
