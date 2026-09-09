# Tier 1 — Automatic Knowledge Classification Implementation Tracker

Milestone: Task 8 — Automatic Knowledge Classification  
Branch: `feature/task-8-automatic-knowledge-classification`

| Task | Scope | Status | Completed / reviewed | Notes |
| --- | --- | --- | --- | --- |
| 8-A | Schema and migration | Complete | 2026-08-02 | Added classification, department-suggestion, duplicate, content-hash, and lifecycle-suggestion fields plus `DocumentDuplicate`. |
| 8-B | Automatic category classification | Complete | 2026-08-02; review fixes 2026-08-07 | Fixed enterprise taxonomy, confidence threshold, `Uncategorized` review state, and repository-visible UI status/confidence. |
| 8-C | Department suggestion | Complete | 2026-08-02; review fixes 2026-08-07 | Advisory suggestion only; existing/manual department is never overwritten automatically. Repository review controls are pre-filled with the suggestion and confidence. |
| 8-D | Duplicate / near-duplicate detection | Complete | 2026-08-02; review fixes 2026-08-07 | Exact hash + semantic similarity. Repository UI now exposes pending duplicate signals with one-click Confirm/Dismiss. |
| 8-E | Knowledge lifecycle staleness | Complete | 2026-08-02; review fixes 2026-08-07 | Stale-document job remains advisory. Repository lifecycle filter includes `Needs lifecycle review`; suggestion is dismissible. |
| 8-F | Reclassification after replacement | Complete | 2026-08-02 | Replacement resets classification signals and reruns the existing processing pipeline. |
| 8-G | Integration validation | Complete | 2026-08-07 | Unit suite plus opt-in DB integration test exercises `classifyDocument` and `detectDocumentDuplicates` and reads back `Document`/`DocumentDuplicate` rows. |
| 8-H | Documentation / delivery | Complete | 2026-08-07 | Review decisions and commands recorded here and in README. |

## Architecture decision — Topic reuse

`Topic` / `TopicDocument` remain the existing project/topic-clustering system. Task 8 does **not** create a parallel category table or reuse `Topic` rows for the fixed enterprise classification taxonomy. `Document.category` is intentionally independent metadata (`Policies`, `SOPs`, `Reports`, `Meeting Knowledge`, `Product Knowledge`, `Historical Documents`, `Other`). This avoids changing existing cluster semantics while allowing filtering and review at repository level.

## Open Question 1-A resolution — spreadsheet granularity

**Decision: classify spreadsheets once per document, not once per sheet.**

The spreadsheet extractor continues to preserve per-sheet metadata on chunks for retrieval, while Task 8 classification uses the combined document `fullText` and structured summary. Reasons:

1. Repository category and department are currently document-level fields in the schema and UI.
2. A single workbook is uploaded, permissioned, lifecycle-managed, duplicated, and replaced as one `Document`.
3. Per-sheet classification would require a separate persisted sheet-level classification model and UX, which is outside Task 8 and would make a single workbook appear to have conflicting repository categories.
4. Sheet metadata remains available for future sheet-level retrieval or a later schema extension.

## Classification spend boundary

Automatic LLM classification is limited to knowledge that can become visible in the organization repository:

- `scope=repository` documents with an organization; and
- project documents whose project has `scope=org`.

Private documents and project documents not promoted to org scope are skipped by `classifyDocument`, avoiding unnecessary LLM spend for content that never reaches the Repository UI.

## Validation

```powershell
npx prisma generate
npm run task8:test
$env:TASK8_INTEGRATION_DB="1"; npm run task8:test:integration
npx eslint src worker scripts/task-8
npm run dev
```

The DB integration test is opt-in because it creates and cleans up temporary organization/user/document rows in the configured database. Run it only against a development/test database.
