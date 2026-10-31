export function validateReviewPolicy(p) {
 if(!p || typeof p.name!=='string'||!p.name.trim()||p.name.length>120)return 'Invalid policy name';
 if(!Number.isInteger(p.intervalDays)||p.intervalDays<1||p.intervalDays>3650)return 'Interval must be 1–3650 days';
 if(!['owner','steward'].includes(p.reviewerType))return 'Invalid reviewer type';
 if(!Number.isInteger(p.escalateAfterDays)||p.escalateAfterDays<1||p.escalateAfterDays>365)return 'Invalid escalation interval';
 if(!Array.isArray(p.departmentIds)||p.departmentIds.length>100||p.departmentIds.some(x=>typeof x!=='string'||!x))return 'Invalid department IDs';
 if(!Array.isArray(p.categories)||p.categories.length>100||p.categories.some(x=>typeof x!=='string'||!x))return 'Invalid categories';
 return null;
}
export function matchesPolicy(doc,p){return p.active && (!p.departmentIds.length||p.departmentIds.includes(doc.departmentId)) && (!p.categories.length||p.categories.includes(doc.category));}
export function addDays(date,days){return new Date(new Date(date).getTime()+days*86400000);}
export function reviewerFor(doc,p){return p.reviewerType==='owner'?doc.ownerId:(doc.stewards?.[0]?.userId||null);}
export function validOutcome(outcome){return ['valid','update','retire'].includes(outcome);}
