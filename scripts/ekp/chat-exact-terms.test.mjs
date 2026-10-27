// Chat answers (WS-A testing follow-up, 2026-10-27): distinctive words of a
// question keep a place in the results, "which documents mention X"
// questions get a per-word list, and both only ever use documents the user
// can access. DB case runs inside a transaction that is always rolled back.
// Run: EKP_DB_TESTS=1 npm run ekp:chat:test
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { exactQueryTerms, isDocumentListingQuestion } from "../../src/lib/keywordSearch.js";
import { pinExactMatches } from "../../src/lib/hybridSearch.js";
import { formatKeywordMatches } from "../../src/lib/documentListing.js";
import { orgExactTermSearch } from "../../src/lib/vectorSearch.js";

const RUN_DB_TESTS = process.env.EKP_DB_TESTS === "1";
const ROLLBACK = Symbol("rollback");

test("distinctive words: no stop words or question words; capital 3-letter acronyms kept", () => {
  assert.deepEqual(
    exactQueryTerms("KESTREL OSPREY HERON  PLOVER  KMS Test Page, can you find me and list me pages or documents with these keywords."),
    ["kestrel", "osprey", "heron", "plover", "kms", "test"]
  );
  assert.deepEqual(exactQueryTerms("What is the api for it?"), [], "lowercase 3-letter words aren't acronyms");
  assert.deepEqual(exactQueryTerms("Q3-2026 plan, version 2026"), ["q3-2026", "plan", "version"], "bare numbers are skipped");
});

test("listing questions are told apart from content questions", () => {
  for (const q of ["Which documents mention OSPREY?", "List all files about the NYPA RFP", "find me pages with these keywords: HERON"]) {
    assert.equal(isDocumentListingQuestion(q), true, q);
  }
  for (const q of ["What is Project KESTREL?", "When is the HERON winter break?", "Show me the release checklist"]) {
    assert.equal(isDocumentListingQuestion(q), false, q);
  }
});

test("exact matches take at most half the slots, ahead of the rest, without duplicates", () => {
  const rows = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => ({ id, document_id: id }));
  const exact = [{ id: "x1", document_id: "x" }, { id: "b2", document_id: "b" }, { id: "y1", document_id: "y" }, { id: "z1", document_id: "z" }, { id: "w1", document_id: "w" }, { id: "v1", document_id: "v" }];
  const out = pinExactMatches(rows, exact, 8);
  assert.deepEqual(out.map((r) => r.document_id), ["x", "y", "z", "w", "a", "b", "c", "d"]);
  assert.equal(out.filter((r) => r.pinnedByExactTerm).length, 4);
  assert.deepEqual(pinExactMatches(rows, [], 8), rows);
});

test("keyword matches block: documents per word, none found, too many", () => {
  const block = formatKeywordMatches({
    terms: [{ term: "kestrel", documentCount: 1 }, { term: "osprey", documentCount: 0 }, { term: "kms", documentCount: 40 }],
    rows: [{ exactTerm: "kestrel", filename: "only-emp1.docx" }, { exactTerm: "kestrel", filename: "only-emp1.docx" }],
  });
  assert.equal(block, [
    "Keyword matches (exact words, in documents this user can access):",
    '- "kestrel": only-emp1.docx',
    '- "osprey": no documents',
    '- "kms": found in 40 documents (too many to list)',
  ].join("\n"));
  assert.equal(formatKeywordMatches({ terms: [], rows: [] }), "");
});

test("exact-word search: whole words only, counts and matches only accessible documents", { skip: !RUN_DB_TESTS }, async () => {
  const prisma = new PrismaClient();
  const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const TENANT = "11111111-1111-1111-1111-111111111111";
  try {
    await prisma.$transaction(async (db) => {
      const org = await db.organization.create({ data: { name: `chat-${tag}` } });
      await db.orgIntegration.create({ data: { orgId: org.id, provider: "sharepoint", scopeConfig: { tenantId: TENANT, sites: [] }, accessToken: "x", tokenExpiry: new Date() } });
      const admin = await db.user.create({ data: { email: `admin-${tag}@contoso.test` } });
      const viewer = await db.user.create({ data: { email: `viewer-${tag}@contoso.test` } });
      await db.organizationMember.create({ data: { orgId: org.id, userId: viewer.id, role: "employee" } });
      await db.userIdentity.create({ data: { userId: viewer.id, provider: "entra", source: "email_match", tenantId: TENANT, externalId: "00000000-0000-0000-0000-0000000000e1" } });
      const doc = async (filename, text, acl) => {
        const d = await db.document.create({
          data: {
            filename, userId: admin.id, orgId: org.id, scope: "repository", lifecycle: "published",
            ...(acl ? { aclSyncedAt: new Date(), acl: { create: acl.map(([principalType, principalId]) => ({ principalType, principalId })) } } : {}),
          },
        });
        await db.chunk.create({ data: { documentId: d.id, chunkIndex: 0, text } });
        return d;
      };
      await doc(`mine-${tag}.docx`, `Project Zephyrine${tag} onboarding plan.`, [["user", "00000000-0000-0000-0000-0000000000e1"]]);
      await doc(`hidden-${tag}.docx`, `Release Quokkalite${tag} checklist.`, [["group", "eeeeeeee-0000-0000-0000-000000000099"]]);
      await doc(`public-${tag}.txt`, `The Zephyrine${tag}s are mentioned here only as part of a longer word.`, null);

      const q = `Which documents mention Zephyrine${tag} or Quokkalite${tag}?`;
      const r = await orgExactTermSearch(q, { userId: viewer.id, orgId: org.id, db, maxDocsPerTerm: 25 });
      const byTerm = Object.fromEntries(r.terms.map((t) => [t.term, t.documentCount]));
      assert.equal(byTerm[`zephyrine${tag}`], 1, "whole word only: 'Zephyrine…s' doesn't count");
      assert.equal(byTerm[`quokkalite${tag}`], 0, "a document the viewer can't access isn't counted");
      assert.deepEqual(r.rows.map((x) => x.filename), [`mine-${tag}.docx`]);
      throw ROLLBACK;
    }, { timeout: 60_000, maxWait: 20_000 });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await prisma.$disconnect();
  }
});
