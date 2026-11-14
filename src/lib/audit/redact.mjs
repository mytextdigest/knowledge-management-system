// Recursive redaction for audit snapshots. Never persist credentials in audit JSON.
const SECRET_KEY = /(?:password|passwd|secret|token|api[_-]?key|authorization|cookie|private[_-]?key|client[_-]?secret|credential|access[_-]?key|refresh[_-]?key)/i;
export function redactAuditValue(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => redactAuditValue(item, seen));
    seen.delete(value);
    return result;
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SECRET_KEY.test(key) ? "[REDACTED]" : redactAuditValue(item, seen);
  }
  seen.delete(value);
  return result;
}
