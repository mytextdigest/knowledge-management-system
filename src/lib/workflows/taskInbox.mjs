export const TASK_FILTERS = Object.freeze(['pending','completed','all']);
export function normalizeTaskFilter(value) { return TASK_FILTERS.includes(value) ? value : 'pending'; }
export function taskWhere({orgId,userId,filter='pending'}) {
 if (!orgId || !userId) throw new Error('Missing task scope');
 const where = {assigneeId:userId,instance:{orgId}};
 if (filter==='pending') where.status='pending';
 else if (filter==='completed') where.status={not:'pending'};
 return where;
}
export function validateTaskDecision(action,comment) {
 if (!['approve','reject','request_changes'].includes(action)) return 'Invalid action';
 if (comment!=null && (typeof comment!=='string' || comment.length>2000)) return 'Comment must be 2000 characters or fewer';
 if (action!=='approve' && (!comment || !comment.trim())) return 'A reason is required for rejection or change requests';
 return null;
}
