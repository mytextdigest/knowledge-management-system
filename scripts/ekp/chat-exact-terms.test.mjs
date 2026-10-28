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

test("listing questions: source words filter, quoted text is a phrase, the rest are words", async () => {
  const { parseListingQuestion, isDocumentListingQuestion: isListing } = await import("../../src/lib/keywordSearch.js");
  assert.deepEqual(parseListingQuestion('Are there any SharePoint pages with "KMS Test Page"?'), { sourceProvider: "sharepoint", contentType: "page", phrases: ["KMS Test Page"], terms: [] });
  assert.deepEqual(parseListingQuestion("Which SharePoint pages mention HERON?"), { sourceProvider: "sharepoint", contentType: "page", phrases: [], terms: ["heron"] });
  assert.deepEqual(parseListingQuestion("List SharePoint files about the release"), { sourceProvider: "sharepoint", contentType: "file", phrases: [], terms: ["release"] });
  assert.deepEqual(parseListingQuestion("Which pages don't mention what's new in HERON?").phrases, [], "apostrophes aren't quotes");
  assert.equal(isListing('Are there any SharePoint pages with "KMS Test Page"?'), true);
  assert.equal(isListing("Which SharePoint pages do we have?"), true);
});

test("source labels", async () => {
  const { sourceLabel } = await import("../../src/lib/documentListing.js");
  assert.equal(sourceLabel({ sourceProvider: "sharepoint", contentType: "page" }), "SharePoint page");
  assert.equal(sourceLabel({ sourceProvider: "sharepoint", contentType: "file" }), "SharePoint file");
  assert.equal(sourceLabel({ sourceProvider: "manual", contentType: "file" }), "uploaded file");
  assert.equal(sourceLabel({}), null);
});

test("listing: SharePoint pages only, phrase in title, nothing the user can't access", { skip: !RUN_DB_TESTS }, async () => {
  const { buildListing } = await import("../../src/lib/documentListing.js");
  const prisma = new PrismaClient();
  const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const TENANT = "11111111-1111-1111-1111-111111111111";
  try {
    await prisma.$transaction(async (db) => {
      const org = await db.organization.create({ data: { name: `list-${tag}` } });
      await db.orgIntegration.create({ data: { orgId: org.id, provider: "sharepoint", scopeConfig: { tenantId: TENANT, sites: [] }, accessToken: "x", tokenExpiry: new Date() } });
      const admin = await db.user.create({ data: { email: `admin-${tag}@contoso.test` } });
      const viewer = await db.user.create({ data: { email: `viewer-${tag}@contoso.test` } });
      await db.organizationMember.create({ data: { orgId: org.id, userId: viewer.id, role: "employee" } });
      await db.userIdentity.create({ data: { userId: viewer.id, provider: "entra", source: "email_match", tenantId: TENANT, externalId: "00000000-0000-0000-0000-0000000000e1" } });
      const mine = [["user", "00000000-0000-0000-0000-0000000000e1"]];
      const mk = async (filename, contentType, sourceProvider, text, acl) => {
        const d = await db.document.create({
          data: {
            filename, contentType, sourceProvider, userId: admin.id, orgId: org.id, scope: "repository", lifecycle: "published",
            ...(acl ? { aclSyncedAt: new Date(), acl: { create: acl.map(([principalType, principalId]) => ({ principalType, principalId })) } } : {}),
          },
        });
        await db.chunk.create({ data: { documentId: d.id, chunkIndex: 0, text } });
      };
      await mk(`Zed Test Page ${tag}`, "page", "sharepoint", "A page about testing.", mine);
      await mk(`Hidden Test Page ${tag}`, "page", "sharepoint", "Secret.", [["group", "eeeeeeee-0000-0000-0000-000000000099"]]);
      await mk(`notes-${tag}.docx`, "file", "sharepoint", `Mentions Zed Test Page ${tag} in passing.`, mine);
      await mk(`upload-${tag}.pdf`, "file", "manual", "Uploaded.", null);

      const ctx = { userId: viewer.id, orgId: org.id, db };
      const all = await buildListing("Which SharePoint pages do we have?", ctx);
      assert.deepEqual(all.rows.map((r) => r.filename), [`Zed Test Page ${tag}`], "pages only; the hidden page isn't listed");
      assert.match(all.block, /all SharePoint pages \(1\)/);

      const phrase = await buildListing(`Are there any SharePoint pages with "Zed Test Page ${tag}"?`, ctx);
      assert.deepEqual(phrase.rows.map((r) => r.filename), [`Zed Test Page ${tag}`], "the file that mentions it isn't a page");

      const anyKind = await buildListing(`Which documents mention "Zed Test Page ${tag}"?`, ctx);
      assert.deepEqual(anyKind.rows.map((r) => r.filename).sort(), [`Zed Test Page ${tag}`, `notes-${tag}.docx`].sort());
      assert.match(anyKind.block, /\(SharePoint page\)/);
      assert.equal(anyKind.missed, false);
      assert.equal((await buildListing(`Which documents mention "Nothing here ${tag}"?`, ctx)).missed, true);
      throw ROLLBACK;
    }, { timeout: 60_000, maxWait: 20_000 });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await prisma.$disconnect();
  }
});

test("access note: added when something wasn't found, not after a full answer", async () => {
  const { needsAccessNote, ACCESS_NOTE } = await import("../../src/lib/documentListing.js");
  for (const answer of [
    "I cannot answer that based on the organization's knowledge repository.",
    "No documents were found that mention **osprey**.",
    "### OSPREY Release\nThe context does not provide any information regarding the OSPREY release date.",
    "I couldn't find anything about PLOVER.",
  ]) assert.equal(needsAccessNote(answer), true, answer);
  for (const answer of [
    "The KMS Test Page describes KMS testing with MTD as a document intelligence platform.",
    "Project KESTREL is a personal onboarding plan for Employee One.",
  ]) assert.equal(needsAccessNote(answer), false, answer);
  assert.equal(needsAccessNote("Here is the list.", { listingMissed: true }), true, "a listing word with no matches");
  assert.equal(needsAccessNote(`Nothing found.\n\n${ACCESS_NOTE}`), false, "never twice");
});
