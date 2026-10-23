// A-14: no-copy mode settings and source streaming rules
// (src/lib/connectors/sharepointSettings.js, src/lib/documentSource.js).
// Run: npm run ekp:a14:test
import test from "node:test";
import assert from "node:assert/strict";
import {
  pickSharePointSettings,
  sharePointSettings,
  validateSharePointSettingsPatch,
} from "../../src/lib/connectors/sharepointSettings.js";
import { canStreamFromSource, sourcePreviewUrl } from "../../src/lib/documentSource.js";

test("settings: absent means today's behaviour (keep copies, include pages)", () => {
  assert.deepEqual(sharePointSettings({ sites: [] }), { storeOriginals: true, syncPages: true });
  assert.deepEqual(sharePointSettings(null), { storeOriginals: true, syncPages: true });
  assert.deepEqual(sharePointSettings({ storeOriginals: false, syncPages: false }), { storeOriginals: false, syncPages: false });
});

test("settings patch: booleans only, only known keys, something to change", () => {
  assert.deepEqual(validateSharePointSettingsPatch({ storeOriginals: false }), { data: { storeOriginals: false } });
  assert.ok(validateSharePointSettingsPatch({ storeOriginals: "no" }).error);
  assert.ok(validateSharePointSettingsPatch({ tenantId: "x" }).error, "can't overwrite connection fields");
  assert.ok(validateSharePointSettingsPatch({}).error);
});

test("settings survive a re-confirm of sites", () => {
  assert.deepEqual(pickSharePointSettings({ tenantId: "t", sites: [], storeOriginals: false }), { storeOriginals: false });
  assert.deepEqual(pickSharePointSettings(undefined), {});
});

test("streaming: only SharePoint documents with no stored copy and a known drive", () => {
  const sp = { sourceProvider: "sharepoint", externalId: "i", externalContainerId: "d", filePath: null };
  assert.equal(canStreamFromSource(sp), true);
  assert.equal(canStreamFromSource({ ...sp, filePath: "uploads/x" }), false, "a stored copy is served from S3");
  assert.equal(canStreamFromSource({ ...sp, externalContainerId: null }), false);
  assert.equal(canStreamFromSource({ ...sp, sourceProvider: "manual" }), false);
  assert.equal(sourcePreviewUrl("doc1", { download: true }), "/api/documents/doc1/preview?download=1");
});
