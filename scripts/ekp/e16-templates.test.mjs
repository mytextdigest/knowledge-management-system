// EKP E-16 (E14): asset templates and the assets written from them.
// Pure rules always; with EKP_DB_TESTS=1 the template store also runs
// against the database inside a transaction that is rolled back.
// Run: npm run ekp:e:test   (EKP_DB_TESTS=1 for the database part)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  STARTER_TEMPLATES, TEMPLATE_FIELDS, renderAssetText, sectionKey, validateAssetInput, validateTemplateInput, versionChanged,
} from "../../src/lib/templates/assetTemplates.js";

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const HOW_TO = {
  name: "How-To Guide",
  sections: [
    { title: "Purpose", guidance: "Why", required: true },
    { title: "Before you start", guidance: "", required: false },
    { title: "Steps", guidance: "Numbered", required: true },
  ],
  requiredFields: ["departmentId"],
};

test("a template is validated; sections get stable keys; at least one section is required", () => {
  const { data } = validateTemplateInput(HOW_TO);
  assert.deepEqual(data.sections.map((s) => s.key), ["purpose", "before_you_start", "steps"]);
  assert.deepEqual(data.requiredFields, ["departmentId"]);
  assert.equal(sectionKey("Steps", new Set(["steps"])), "steps_2");

  assert.match(validateTemplateInput({ ...HOW_TO, name: " " }).error, /name/);
  assert.match(validateTemplateInput({ ...HOW_TO, sections: [] }).error, /at least one section/);
  assert.match(validateTemplateInput({ ...HOW_TO, sections: [{ title: "", required: true }] }).error, /needs a title/);
  assert.match(validateTemplateInput({ ...HOW_TO, sections: HOW_TO.sections.map((s) => ({ ...s, required: false })) }).error, /required/);
  assert.match(validateTemplateInput({ ...HOW_TO, requiredFields: ["ownerId"] }).error, /isn't a field/);
  assert.match(validateTemplateInput({ ...HOW_TO, sections: Array.from({ length: 21 }, (_, i) => ({ title: `S${i}`, required: true })) }).error, /at most 20/);
});

test("an edited section keeps its key, so it stays the same section across versions", () => {
  const v1 = validateTemplateInput(HOW_TO).data;
  const edited = validateTemplateInput({ ...v1, sections: v1.sections.map((s) => (s.key === "steps" ? { ...s, title: "Procedure" } : s)) }).data;
  assert.equal(edited.sections[2].key, "steps");
  assert.equal(edited.sections[2].title, "Procedure");
  assert.equal(versionChanged(v1, edited), true);
  assert.equal(versionChanged(v1, validateTemplateInput(v1).data), false, "a rename alone isn't a new version");
});

test("the four starter templates are valid", () => {
  assert.deepEqual(STARTER_TEMPLATES.map((t) => t.name), ["How-To Guide", "FAQ", "SOP", "Key Takeaways"]);
  for (const t of STARTER_TEMPLATES) assert.ok(validateTemplateInput(t).data, t.name);
  assert.deepEqual(TEMPLATE_FIELDS.map((f) => f.key), ["departmentId", "category"]);
});

test("an asset must fill the required sections and fields; empty optional sections are dropped", () => {
  const version = validateTemplateInput(HOW_TO).data;
  const ok = validateAssetInput(version, {
    title: " Reset a feeder relay ",
    departmentId: "dept1",
    sections: { purpose: "Restore power safely.", before_you_start: "  ", steps: "1. Isolate\r\n2. Reset", stray: "ignored" },
  });
  assert.deepEqual(ok.data, {
    title: "Reset a feeder relay",
    sections: { purpose: "Restore power safely.", steps: "1. Isolate\n2. Reset" },
    departmentId: "dept1",
    category: null,
  });
  assert.deepEqual(validateAssetInput(version, { ...ok.data, sections: { purpose: "x" } }), { error: '"Steps" is required.', field: "steps" });
  assert.deepEqual(validateAssetInput(version, { ...ok.data, departmentId: "" }), { error: "Choose a department.", field: "departmentId" });
  assert.equal(validateAssetInput(version, { ...ok.data, title: "" }).field, "title");
});

test("the asset's searchable text: title, template, then each filled section in template order", () => {
  const version = validateTemplateInput(HOW_TO).data;
  const text = renderAssetText(version, { title: "Reset a relay", sections: { steps: "1. Isolate", purpose: "Restore power." } }, "How-To Guide");
  assert.equal(text, "# Reset a relay\n\n_How-To Guide_\n\n## Purpose\n\nRestore power.\n\n## Steps\n\n1. Isolate");
});

test("wiring: assets are drafts in the repository, read as text, edited in their own version", () => {
  const create = read("src/app/api/org/[orgId]/assets/route.js");
  assert.match(create, /lifecycle: "draft"/);
  assert.match(create, /templateVersion: \{ connect: \{ id: version\.id \} \}/);
  assert.match(create, /role === "guest"/);
  const edit = read("src/app/api/documents/[id]/asset/route.js");
  assert.match(edit, /const version = doc\.templateVersion;/, "E14.4: the asset's own version, not the template's latest");
  assert.match(read("src/lib/templates/assetDocuments.js"), /lifecycle === "draft"/);
  const worker = read("worker/index.js");
  assert.match(worker, /TEXT_CONTENT_TYPES = new Set\(\["page", "article", "asset"\]\)/);
  assert.match(worker, /existingDoc\.contentType === "asset"\) \{[\s\S]*tx\.chunk\.deleteMany/, "a shorter edit drops its extra chunks");
  assert.match(read("src/lib/documentPipeline.js"), /doc\.contentType === "asset"\) return Boolean\(doc\.content\)/);
  const templates = read("src/app/api/org/[orgId]/templates/route.js");
  assert.match(templates, /if \(!isSuperAdmin\(role\)\) return NextResponse\.json\(\{ error: "Only a super admin can manage templates" \}/);
  assert.match(read("src/app/(app)/org/[orgId]/repository/page.jsx"), /<NewFromTemplateButton/);
  assert.match(read("src/app/(app)/document/page.jsx"), /doc\.contentType === "asset"[\s\S]*<AssetView/);
});

const DB = process.env.EKP_DB_TESTS === "1";

test("database: create, edit (new version), retire; an asset keeps its version", { skip: !DB && "set EKP_DB_TESTS=1" }, async () => {
  const { PrismaClient } = await import("@prisma/client");
  const { createTemplate, getTemplate, listTemplates, updateTemplate } = await import("../../src/lib/templates/templateStore.js");
  const { assetDocumentFields } = await import("../../src/lib/templates/assetDocuments.js");
  const prisma = new PrismaClient();
  const ROLLBACK = new Error("rollback");
  try {
    const member = await prisma.organizationMember.findFirst({ select: { orgId: true, userId: true } });
    assert.ok(member, "the database needs one organization member");
    const { orgId, userId } = member;
    await prisma.$transaction(async (tx) => {
      const name = `E16 test ${Date.now()}`;
      const data = validateTemplateInput({ ...HOW_TO, name }).data;
      const t = await createTemplate(tx, orgId, userId, data);
      assert.equal(t.versions[0].version, 1);
      await assert.rejects(createTemplate(tx, orgId, userId, data), (err) => err.code === "P2002", "names are unique per org");
      throw ROLLBACK;
    }, { timeout: 20000 }).catch((err) => { if (err !== ROLLBACK) throw err; });

    await prisma.$transaction(async (tx) => {
      const name = `E16 test ${Date.now()}`;
      const data = validateTemplateInput({ ...HOW_TO, name }).data;
      const t = await createTemplate(tx, orgId, userId, data);
      const v1 = t.versions[0];

      const version = v1;
      const asset = validateAssetInput(version, { title: "Reset a relay", departmentId: null, sections: { purpose: "Why.", steps: "1. Do it." } });
      // departmentId is required by this template: an asset without one is refused...
      assert.equal(asset.field, "departmentId");
      const ok = validateAssetInput({ ...version, requiredFields: [] }, { title: "Reset a relay", sections: { purpose: "Why.", steps: "1. Do it." } }).data;
      const doc = await tx.document.create({
        data: {
          ...assetDocumentFields(version, ok, name),
          scope: "repository", visibility: "private", lifecycle: "draft",
          organization: { connect: { id: orgId } }, user: { connect: { id: userId } }, owner: { connect: { id: userId } },
          templateVersion: { connect: { id: v1.id } },
        },
      });
      assert.equal(doc.contentType, "asset");
      assert.match(doc.content, /## Steps\n\n1\. Do it\./);

      // Rename only: same version.
      let r = await updateTemplate(tx, t, userId, { ...data, name: `${name} renamed` });
      assert.equal(r.newVersion, false);
      assert.equal(r.template.versions[0].version, 1);
      // Changed sections: version 2; the asset still points at version 1.
      const changed = validateTemplateInput({ ...data, sections: [...data.sections, { title: "Troubleshooting", required: false }] }).data;
      r = await updateTemplate(tx, r.template, userId, { ...changed, name: `${name} renamed` });
      assert.equal(r.newVersion, true);
      assert.equal(r.template.versions[0].version, 2);
      const again = await tx.document.findUnique({ where: { id: doc.id }, select: { templateVersion: { select: { version: true } } } });
      assert.equal(again.templateVersion.version, 1);

      // Listing: members see active ones; the admin list counts assets across versions.
      const all = await listTemplates(tx, orgId, { all: true });
      assert.equal(all.find((x) => x.id === t.id).assetCount, 1);
      await tx.assetTemplate.update({ where: { id: t.id }, data: { status: "retired" } });
      assert.equal((await listTemplates(tx, orgId)).some((x) => x.id === t.id), false, "retired: not offered");
      assert.ok(await getTemplate(tx, orgId, t.id));
      throw ROLLBACK;
    }, { timeout: 20000 }).catch((err) => { if (err !== ROLLBACK) throw err; });
  } finally {
    await prisma.$disconnect();
  }
});
