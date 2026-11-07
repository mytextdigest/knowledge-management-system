# Workstream C — Taxonomy & Semantic Layer: Design Review

**Status:** Draft for manager approval; implementation exists but final acceptance remains conditional.

## Purpose
Provide an organization-scoped vocabulary and metadata layer while retaining the existing document classification path. Support managed term sets, hierarchical terms, metadata fields, and manual document tagging.

## Model and responsibilities
- `TermSet`: organization-scoped vocabulary; distinguish managed versus read-only sets.
- `Term`: normalized label, parent relationship, status and ordering; avoid duplicate active siblings.
- `MetadataField`: binds a field key to one term set; supports single/multi selection, required flag, and facet configuration.
- `DocumentTerm`: associates a document, field, and term; preserves source and acceptance status.

## Security and audit expectations
- Only organization super admins may create or change taxonomy configuration.
- Read access must be scoped to the organization.
- Document tagging requires document visibility and edit rights, not merely org membership.
- Every successful configuration/tag mutation should generate an actor- and org-scoped audit record.
- Cross-organization IDs must be rejected without exposing data.

## Compatibility and migration
- Keep the existing category classification path while dual-writing compatible taxonomy assignments.
- Seed/backfill is explicitly opt-in, dry-run by default. Inspect eligible rows and use a safe database snapshot before `--apply`.
- Do not execute migrations or backfills as part of verification.

## Acceptance criteria
1. Super admin can create a term set, term, and metadata field; unauthorized member cannot mutate them.
2. A document editor can assign a term; it remains selected after closing and reopening.
3. A user without document access cannot read or write its tags.
4. Deprecated terms cannot be newly assigned.
5. Required and single/multi field rules are enforced, including when automated assignments already exist.
6. Audit events persist and include correct actor, organization, and entity.
7. C3 dry-run and subsequent approved apply reconcile document category with taxonomy without duplicates or cross-org leakage.
8. Build and static checks pass; PR targets `dev` with only Workstream C files.

## Open decision
Decide whether a manually selected value should supersede an automated accepted value on a single-value field, and how source provenance is preserved. Existing C5 code can retain a different non-manual accepted assignment, so this case requires a policy and test before sign-off.
