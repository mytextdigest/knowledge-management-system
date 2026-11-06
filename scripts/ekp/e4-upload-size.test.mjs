// EQ-5 (Workstream E): one 100 MB upload limit for the upload dialogs, the
// presign policy and the ingest/replace APIs (src/lib/fileFormats.js).
// Run: npm run ekp:e:test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkFileSize, MAX_UPLOAD_BYTES, MAX_UPLOAD_TEXT } from "../../src/lib/fileFormats.js";

const MB = 1024 * 1024;
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("the limit is 100 MB, said as such", () => {
  assert.equal(MAX_UPLOAD_BYTES, 100 * MB);
  assert.equal(MAX_UPLOAD_TEXT, "100 MB");
});

test("files up to and including the limit pass; an unknown size is left to S3 and ingest", () => {
  assert.equal(checkFileSize(0).ok, true);
  assert.equal(checkFileSize(45 * MB).ok, true);
  assert.equal(checkFileSize(100 * MB).ok, true);
  assert.equal(checkFileSize(undefined).ok, true);
});

test("a larger file is refused with its size, the limit and the SharePoint route", () => {
  const r = checkFileSize(142 * MB);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "This file is 142 MB. Uploads are limited to 100 MB; for larger files, sync them from SharePoint.");
  // just over the limit never reads as "100 MB"
  assert.match(checkFileSize(100 * MB + 1).reason, /^This file is 101 MB\./);
});

test("presign refuses early with 413 and caps the S3 policy at the same limit", () => {
  const route = read("src/app/api/s3/upload/route.js");
  assert.match(route, /checkFileSize\(fileSize\)/);
  assert.match(route, /code: "FILE_TOO_LARGE" \}, \{ status: 413 \}/);
  assert.match(route, /\["content-length-range", 0, MAX_UPLOAD_BYTES\]/);
  assert.doesNotMatch(route, /10 \* 1024 \* 1024/);
});

test("ingest and replace check the stored object's size", () => {
  assert.match(read("src/app/api/documents/ingest/route.js"), /checkFileSize\(fileSizeBytes\)/);
  assert.match(read("src/app/api/documents/[id]/replace/route.js"), /checkFileSize\(head\.ContentLength\)/);
});

test("both dialogs check the size on selection, show the limit, and send the size to presign", () => {
  const modal = read("src/components/repository/UploadToRepositoryModal.jsx");
  assert.match(modal, /checkFileSize\(file\.size\)/);
  assert.match(modal, /\{MAX_UPLOAD_TEXT\} each/);
  assert.match(modal, /fileSize: fileItem\.file\.size/);

  const dialog = read("src/components/documents/FileUpload.jsx");
  assert.match(dialog, /checkFileSize\(file\.size\)/);
  assert.match(dialog, /\{MAX_UPLOAD_TEXT\} each/);
  assert.doesNotMatch(dialog, /maxFileSize/);

  const project = read("src/app/(app)/project/page.jsx");
  assert.match(project, /fileSize: file\.size/);
  assert.match(project, /throw new Error\(presignData\?\.error \|\| "Failed to prepare upload"\)/);
});
