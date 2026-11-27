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
      // Raw tags are already stored by the reader. A mapping failure is logged
      // and never fails the document's sync; the next sync or "Map now" retries.
      try {
        await db.$transaction(tx => reconcileSourceDocumentTerms(tx, {
          orgId, documentId: args.documentId, fieldBySourceName: mapping,
        }));
      } catch (error) {
        console.warn('C-8 tag mapping failed for document', args.documentId, error?.message);
      }
      return count;
    },
  };
}
