// E-4 / E11.4: one format allow-list for upload, the upload APIs and the
// SharePoint sync (src/lib/fileFormats.js).
// Run: npm run ekp:e:test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkFileFormat, fileExtension, isSupportedFile, SUPPORTED_EXTENSIONS } from "../../src/lib/fileFormats.js";

test("fileExtension: lower-case, last dot, ignores folders and dot-files", () => {
  assert.equal(fileExtension("Q3 Review.PDF"), ".pdf");
  assert.equal(fileExtension("archive.tar.gz"), ".gz");
  assert.equal(fileExtension("folder.v2/notes"), "");
  assert.equal(fileExtension(".gitignore"), "");
  assert.equal(fileExtension(""), "");
  assert.equal(fileExtension(undefined), "");
});

test("supported formats pass, whatever the case of the extension", () => {
  for (const name of ["a.pdf", "b.DOCX", "c.xlsx", "d.xls", "e.csv", "f.txt"]) {
    assert.equal(isSupportedFile(name), true, name);
  }
});

test("legacy binary Office files are refused with a save-as message", () => {
  const doc = checkFileFormat("Old policy.doc");
  assert.equal(doc.ok, false);
  assert.match(doc.reason, /Save it as \.docx/);
});

test("other formats are refused with a clear reason naming the extension", () => {
  const exe = checkFileFormat("setup.exe");
  assert.deepEqual(exe, { ok: false, ext: ".exe", reason: "KMS can't read .exe files yet." });
  assert.equal(checkFileFormat("README").reason, "KMS can't read files without an extension.");
});

test("every extension the allow-list accepts has an extraction branch in the worker", () => {
  const worker = readFileSync(new URL("../../worker/index.js", import.meta.url), "utf8");
  for (const ext of SUPPORTED_EXTENSIONS) {
    assert.ok(worker.includes(`"${ext}"`), `worker/index.js has no branch for ${ext}`);
  }
});

test("upload dialogs, upload APIs and the SharePoint sync all use the shared check", () => {
  const files = [
    "src/components/repository/UploadToRepositoryModal.jsx",
    "src/components/documents/FileUpload.jsx",
    "src/app/api/s3/upload/route.js",
    "src/app/api/documents/ingest/route.js",
    "src/app/api/documents/[id]/replace/route.js",
    "worker/index.js",
  ];
  for (const f of files) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    assert.match(src, /checkFileFormat\(/, `${f} doesn't call checkFileFormat`);
  }
});
