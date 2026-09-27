# Rank 13 Knowledge Graph — Manager Feedback Redesign

## What changed
- Replaced the card/row representation with an interactive SVG node-and-edge graph.
- Added Org-wide and Dept-wise generation modes.
- Added an explicit Generate Graph first state and Regenerate action.
- Clicking a graph node now selects it and updates the Insights panel; it does not navigate away.
- Document navigation is only available through the explicit Open document button in Insights.
- Insights are derived from stored graph edges/evidence, so node selection, graph generation, filtering, and regeneration do not make LLM calls.
- Added lightweight source-version checking so the page can show a "new knowledge" regeneration banner after graph-relevant data changes.
- Preserved relationship provenance and correct expertise-score display.
- Department scope is applied at the source-document query before related graph edges are assembled.

## Validation
- Rank 12: 9/9 passing.
- Rank 13: 7/7 passing, including new interaction/insight regression checks.
- Rank 10: 28/28 passing.
- Rank 11: 8/8 passing.
- `node --check` passed for changed non-JSX JavaScript files.
- Targeted ESLint/full Next build could not be completed in the sandbox because the command timed out; run them locally before commit.
