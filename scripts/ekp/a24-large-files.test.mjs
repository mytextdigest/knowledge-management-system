// A-24: large-file guard (src/lib/connectors/sharepointLargeFiles.js and the
// maxFileSizeMb setting in sharepointSettings.js). DB cases run inside a
// transaction that is always rolled back.
// Run: EKP_DB_TESTS=1 npm run ekp:a24:test
import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { exceedsSizeLimit, sharePointSettings, validateSharePointSettingsPatch } from "../../src/lib/connectors/sharepointSettings.js";
import { tooLargeFileWrites, isTooLargeToIndex, TOO_LARGE } from "../../src/lib/connectors/sharepointLargeFiles.js";

const RUN_DB_TESTS = process.env.EKP_DB_TESTS === "1";
const ROLLBACK = Symbol("rollback");
const MB = 1024 * 1024;

test("size limit: 200 MB by default, per integration, strict above", () => {
  assert.equal(sharePointSettings({}).maxFileSizeMb, 200);
  assert.equal(exceedsSizeLimit(200 * MB, {}), false);
  assert.equal(exceedsSizeLimit(200 * MB + 1, {}), true);
  assert.equal(exceedsSizeLimit(8 * 1024 * MB, {}), true, "an 8 GB video");
  assert.equal(exceedsSizeLimit(300 * MB, { maxFileSizeMb: 500 }), false);
  assert.equal(exceedsSizeLimit(undefined, {}), false, "no size reported: not treated as large");
});

test("size limit setting: whole megabytes from 1 to 10240", () => {
  assert.deepEqual(validateSharePointSettingsPatch({ maxFileSizeMb: 500 }), { data: { maxFileSizeMb: 500 } });
  for (const bad of [0, -5, 1.5, "500", 10_241, null]) {
    assert.ok(validateSharePointSettingsPatch({ maxFileSizeMb: bad }).error, String(bad));
  }
});

test("chunk job leaves a too-large file alone unless a copy exists", () => {
  assert.equal(isTooLargeToIndex({ status: TOO_LARGE, filePath: null }), true);
  assert.equal(isTooLargeToIndex({ status: TOO_LARGE, filePath: "uploads/x" }), false);
  assert.equal(isTooLargeToIndex({ status: "ready", filePath: null }), false);
});

test("too-large file: recorded with link and permissions, no file, no chunks; a file that grew loses its chunks", { skip: !RUN_DB_TESTS }, async () => {
  const prisma = new PrismaClient();
  const tag = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  try {
    await prisma.$transaction(async (db) => {
      const org = await db.organization.create({ data: { name: `a24-${tag}` } });
      const dept = await db.department.create({ data: { orgId: org.id, name: `Eng ${tag}` } });
      const admin = await db.user.create({ data: { email: `a24-${tag}@contoso.test`, storageUsedBytes: 1000n } });
      const run = async (writes) => { for (const w of writes) await w; };
      const aclRows = [{ principalType: "group", principalId: "eeeeeeee-0000-0000-0000-000000000002" }];
      const createFields = (externalId) => ({
        filename: `${externalId}.mp4`, visibility: "private", scope: "repository", lifecycle: "draft",
        sourceProvider: "sharepoint", externalId, orgId: org.id, departmentId: dept.id, userId: admin.id,
      });

      // A new 8 GB video.
      await run(tooLargeFileWrites(db, {
        existing: null, modifiedAt: "2026-10-28T10:00:00Z", sourceFields: { externalUrl: "https://x/video.mp4" },
        aclRows, createFields: createFields(`video-${tag}`), connectedByUserId: admin.id,
      }));
      const video = await db.document.findFirst({ where: { externalId: `video-${tag}` }, include: { acl: true, chunks: true } });
      assert.deepEqual([video.status, video.filePath, video.lifecycle, video.externalUrl], [TOO_LARGE, null, "draft", "https://x/video.mp4"]);
      assert.equal(video.acl.length, 1);
      assert.ok(video.aclSyncedAt);
      assert.equal(video.chunks.length, 0);

      // A file indexed before that grew past the limit: chunks and copy accounting go.
      const doc = await db.document.create({
        data: { ...createFields(`grown-${tag}`), filePath: "uploads/grown.pdf", content: "old text", status: "ready", lifecycle: "published" },
      });
      await db.chunk.create({ data: { documentId: doc.id, chunkIndex: 0, text: "old text" } });
      await run(tooLargeFileWrites(db, {
        existing: { id: doc.id }, modifiedAt: "2026-10-28T11:00:00Z", sourceFields: {}, aclRows,
        createFields: null, connectedByUserId: admin.id, freedBytes: 400n,
      }));
      const grown = await db.document.findUnique({ where: { id: doc.id }, include: { chunks: true } });
      assert.deepEqual([grown.status, grown.filePath, grown.content, grown.lifecycle], [TOO_LARGE, null, null, "published"]);
      assert.equal(grown.chunks.length, 0);
      assert.equal((await db.user.findUnique({ where: { id: admin.id } })).storageUsedBytes, 600n);
      throw ROLLBACK;
    }, { timeout: 60_000, maxWait: 20_000 });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  } finally {
    await prisma.$disconnect();
  }
});
