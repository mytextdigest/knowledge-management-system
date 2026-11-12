import { reconcileSourceDocumentTerms } from './sourceTagSync.mjs';

/**
 * Opt-in C-8 bridge. Does not change existing SharePoint extraction.
 * fieldBySourceName: approved SharePoint INTERNAL column -> MetadataField.id.
 * A null reader result means the Graph item was missing, NOT an empty snapshot.
 */
export function createTaxonomyAwareSourceTagReader({ reader, db, orgId, fieldBySourceName = {} }) {
  if (!reader || typeof reader.sync !== 'function') throw new Error('SharePoint reader required');
  if (!db || typeof db.$transaction !== 'function') throw new Error('Prisma transaction support required');
  if (!orgId) throw new Error('Organization ID required');
  if (!fieldBySourceName || typeof fieldBySourceName !== 'object' || Array.isArray(fieldBySourceName)) throw new Error('Invalid SharePoint field mapping');
  const mapping = Object.fromEntries(Object.entries(fieldBySourceName).map(([name, id]) => {
    if (!name || typeof id !== 'string' || !id.trim()) throw new Error('Invalid SharePoint field mapping entry');
    return [name, id];
  }));
  return {
    async sync(args) {
      const count = await reader.sync(args);
      if (count === null || Object.keys(mapping).length === 0) return count;
      // Raw tags are persisted by the existing reader before reconciliation.
      // Failure propagates to the existing per-document catch; raw tags survive.
      await db.$transaction(tx => reconcileSourceDocumentTerms(tx, {
        orgId, documentId: args.documentId, fieldBySourceName: mapping,
        authoritativeSnapshot: true,
      }));
      return count;
    },
  };
}
