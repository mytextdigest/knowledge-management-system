export function parseAuditFilters(searchParams) {
  const pageValue = Number(searchParams.get('page') || 1);
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? Math.min(pageValue, 100000) : 1;
  const action = (searchParams.get('action') || '').trim().slice(0, 120);
  const entityType = (searchParams.get('entityType') || '').trim().slice(0, 80);
  const entityId = (searchParams.get('entityId') || '').trim().slice(0, 200);
  const from = parseDate(searchParams.get('from'), false);
  const to = parseDate(searchParams.get('to'), true);
  return { page, action, entityType, entityId, from, to };
}
function parseDate(value, endOfDay) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid date format. Use YYYY-MM-DD.');
  const date = new Date(value + (endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'));
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid date.');
  return date;
}
export function auditWhere(orgId, filters) {
  if (filters.from && filters.to && filters.from > filters.to) throw new Error('From date must not exceed to date.');
  return { orgId,
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.from || filters.to ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}),
  };
}
