# Workstream C-M3 consolidated patch — review handoff

Base: `feature/ekp-ws-c` at `4256bbf` (uploaded `KMS-C-M3-BASE.zip`).
Status: **implementation candidate, NOT merged, NOT live-DB verified**.

## Included
- C-10 term embedding batches, top-40 shortlist, LLM allowlisted term IDs, configurable-safe confidence defaults, `DocumentTerm` suggestions and non-fatal classifier integration.
- Review UI + document-manager PATCH accept/dismiss, with source-system/manual tag protection.
- Topic-to-term candidate API: super-admin-only GET/POST/PATCH, explicit approval, local editable term sets only.
- C-11 label/synonym/narrower expansion, RBAC-filtered tag-only chunk retrieval, bounded ontology boosts and offline nDCG@10 calculator.
- Unit tests, no schema migrations.

## Local application (do not execute until reviewed)
1. Verify branch `feature/ekp-ws-c` and clean tracked working tree; keep six untracked backups and stashes.
2. Extract patch into repo root; the ZIP contains only changed/new paths, not node_modules or secrets.
3. Run `node --test scripts/ekp/p2/c10-c11.test.mjs` and `npx eslint worker/classify.js src/lib/hybridSearch.js src/lib/taxonomy/autoTag.mjs src/lib/taxonomy/ontologySearch.mjs 'src/app/api/org/[orgId]/documents/[documentId]/taxonomy/route.js' 'src/app/api/org/[orgId]/taxonomy/candidates/route.js' src/components/taxonomy/DocumentTaggingPanel.jsx`.
4. Run existing F1 access parity and C-M2 taxonomy regression suites, then `npm run build`.
5. Validate classification and search with an isolated test DB/org and authorized roles. DO NOT run against shared production or staging DB without permission.
6. Run the D-13 fixture/runner on the same 20–30 real queries in both baseline and ontology modes, then use `node scripts/ekp/search-eval/compare-ontology.mjs <results.json>` to compute measured nDCG@10. **No evaluation improvement is claimed without results.**
7. Measure 500 documents / 30 minutes separately; no throughput claim has been established.

## Known review gates
- D-13 real fixture/runner is not in the uploaded C branch; coordinate with Simran before final evaluation.
- Term embeddings are lazily refreshed when a document is classified, not proactively after import; first-run embedding cost must be measured.
- Search query expansion increases keyword queries and tag-only retrieval cost; benchmark with realistic 2,600-term taxonomy.
- Live DB integration, RBAC E2E, concurrency and UI browser review have **not** been performed in this offline build.
- Keep C-M3 tracker as TODO/IN_PROGRESS until verified and merged.
