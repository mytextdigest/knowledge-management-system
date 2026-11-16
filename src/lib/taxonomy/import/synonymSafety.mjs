/** External imports cannot tell local aliases from previously imported ones,
 * so existing synonyms are always kept and only missing ones are added. A
 * label the file lists with a different kind (alt vs hidden) keeps its stored
 * kind and is reported as a conflict for the import summary.
 */
export function planSafeSynonymUpserts(existing = [], desired = []) {
  const prior = new Map(existing.map((s) => [s.normalizedLabel, s]));
  const additions = [];
  const conflicts = [];
  for (const synonym of desired) {
    const old = prior.get(synonym.normalizedLabel);
    if (!old) additions.push(synonym);
    else if (old.kind !== synonym.kind) conflicts.push({ ...synonym, existingKind: old.kind });
  }
  return { additions, conflicts, retained: existing.length };
}
