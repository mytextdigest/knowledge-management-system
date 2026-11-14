import { getSetting } from '@/lib/settings';
import { evaluateCompleteness } from '@/lib/governance/completeness.mjs';
import { requiresSummaryApproval } from '@/lib/governance/summaryApprovalRules.mjs';
import { effectiveSummaryStatus } from '@/lib/governance/summaryReview.mjs';
export async function publishingCompleteness(doc) {
  const [rules, requireSummaryApproval] = await Promise.all([
    getSetting(doc.orgId, 'metadata.requiredFields'),
    getSetting(doc.orgId, 'summary.requireApproval'),
  ]);
  return evaluateCompleteness(doc, rules, {
    requireSummaryApproval: requiresSummaryApproval(requireSummaryApproval, doc),
    summaryStatus: effectiveSummaryStatus(doc.summary, doc.summaryReview),
  });
}
export const PUBLISH_SELECT = {
  id: true, orgId: true, scope: true, deletedAt: true, lifecycle: true,
  filename: true, ownerId: true, departmentId: true, category: true,
  summary: true, content: true, stewards: { select: { userId: true } },
  summaryReview: true,
};
