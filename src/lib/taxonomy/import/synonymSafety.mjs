/** External imports cannot distinguish local aliases from previously imported aliases.
 * Preserve existing aliases; add missing ones; reject incompatible kind changes.
 * No deleteMany is permitted without an explicit provenance model/migration.
 */
export function planSafeSynonymUpserts(existing = [], desired = []) {
  const prior = new Map(existing.map(s => [s.normalizedLabel, s]));
  const additions = [];
  for (const synonym of desired) {
    const old = prior.get(synonym.normalizedLabel);
    if (old && old.kind !== synonym.kind) {
      throw new Error(`Synonym kind conflict requires review: ${synonym.normalizedLabel}`);
    }
    if (!old) additions.push(synonym);
  }
  return { additions, retained: existing.length };
}
