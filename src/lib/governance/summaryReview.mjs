import { createHash } from 'node:crypto';
export const summaryHash = (summary) => createHash('sha256').update(summary ?? '').digest('hex');
export const effectiveSummaryStatus = (summary, review) => {
  if (!summary?.trim()) return 'unavailable';
  return review?.status === 'approved' && review.summaryHash === summaryHash(summary)
    ? 'approved' : 'pending';
};
export const validateSummaryEdit = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 30000;
