# Rank 12 / Rank 13 Integration Fix Notes

## Rank 12 — Knowledge Relationship Discovery
- Updated background candidate discovery to use an existing `projectId` as the durable project-association signal instead of requiring `Document.scope === "project"`.
- This preserves compatibility with legacy KMS documents that are `scope="private"` but legitimately belong to an organization project.
- Repository-published candidates remain supported.
- User-facing relationship reads remain protected by the existing RBAC/access filtering in `src/lib/knowledgeContext.js`.
- Added a static regression test ensuring legacy project-linked documents are supported and the old scope gate does not return.

## Rank 13 — Organizational Knowledge Graph
- Fixed expert edge rendering. `TopicExpertise.score` is an additive expertise score and is no longer multiplied by 100 and presented as a percentage.
- Expert edges now display `expertise score X.XX`; other normalized relationship weights continue to display as percentages.
- Added a static regression test for the expert-score presentation.

## Validation performed
- Rank 12 + Rank 13 tests: 13/13 passed.
- Rank 10 + Rank 11 regression tests: 36/36 passed.
- Combined tests executed in the supplied handoff source: 49/49 passed.
- A targeted ESLint command was started after tests, but the environment command timed out; no ESLint-pass claim is made in this handoff.

## Files changed
- `worker/knowledgeContext.js`
- `src/components/knowledge-graph/ProgressiveKnowledgeGraph.jsx`
- `scripts/task-13/tier2-relationships.static.test.mjs`
- `scripts/task-14/tier2-knowledge-graph.static.test.mjs`
- `RANK12_RANK13_FIX_NOTES.md`
