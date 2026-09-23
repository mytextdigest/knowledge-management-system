import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

test(
  "13-A-F worker is multi-signal, project-aware, evidence-rich and background-compatible",
  () => {
    const s = read("worker/knowledgeContext.js");

    for (const token of [
      "topicOverlap",
      "entityOverlap",
      "projectContext",
      "lessonEvidence",
      "multi_signal_v1",
      "RELATIONSHIP_MIN_CONFIDENCE",
    ]) {
      assert.match(s, new RegExp(token));
    }

    assert.doesNotMatch(
      s,
      /doc\.scope !== ["']repository["']/
    );

    assert.doesNotMatch(
      s,
      /type:\s*["']contradicts["']/
    );
  }
);

test(
  "13-G org relationships endpoint composes relationship and conflict with RBAC",
  () => {
    const lib = read("src/lib/knowledgeContext.js");
    const route = read(
      "src/app/api/org/[orgId]/relationships/route.js"
    );

    assert.match(lib, /getAccessibleOrgRelationships/);
    assert.match(lib, /DocumentConflict/);
    assert.match(lib, /kind/);
    assert.match(lib, /accessSql/);
    assert.match(route, /resolveOrgRole/);
  }
);

test(
  "13-H document panel exposes type and evidence",
  () => {
    const s = read("src/app/(app)/document/page.jsx");

    assert.match(s, /related\.type/);
    assert.match(s, /sharedEntities/);
    assert.match(s, /Same project/);
  }
);

test(
  "13 project discovery supports legacy project-linked documents regardless of historical document scope",
  () => {
    const s = read("worker/knowledgeContext.js");

    assert.match(
      s,
      /const projectFilter = doc\.projectId/
    );

    assert.match(
      s,
      /doc\.projectId\n\s*\? \{ OR: \[\{ projectId: doc\.projectId \}/
    );

    assert.doesNotMatch(
      s,
      /doc\.scope === ["']project["'] && doc\.projectId/
    );
  }
);

test(
  "13-H document related-doc retrieval uses centralized Rank 12 confidence threshold",
  () => {
    const s = read("src/lib/knowledgeContext.js");

    assert.match(
      s,
      /RELATIONSHIP_MIN_CONFIDENCE/
    );

    assert.match(
      s,
      /RELATED_DOCUMENT_MIN_WEIGHT\s*=\s*RELATIONSHIP_MIN_CONFIDENCE/
    );

    assert.doesNotMatch(
      s,
      /RELATED_DOCUMENT_MIN_WEIGHT\s*=\s*0\.68/
    );
  }
);