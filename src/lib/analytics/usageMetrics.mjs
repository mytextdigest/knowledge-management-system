// D-M2 (E29): pure usage and adoption metric calculations. UTC days. Outputs
// are aggregates only; no user identity leaves this module.
//
// Definitions (WS-D §3):
// - A search is a `search` or `repository` event; a question is a `chat` event.
// - Click-through rate = searches with at least one result click / searches.
// - Bounce (DS-3) = a search with no click and no follow-up search or question
//   by the same user within 60 s / searches.
// - Time to answer (E29.2) = query to first result click for a search, query
//   to first answer token for a question.

export const FOLLOW_UP_MS = 60_000;

// Stored per (date, departmentKey) in AnalyticsDaily. ADDITIVE metrics can be
// summed across days and departments; the others are per-day figures.
export const ADDITIVE_METRICS = [
  'events', 'searches', 'questions', 'clickedSearches', 'bouncedSearches',
  'timeToAnswerCount', 'timeToAnswerSumMs', 'latencyCount', 'latencySumMs',
];
export const DAY_ONLY_METRICS = ['activeUsers', 'p50LatencyMs', 'p95LatencyMs', 'p50TimeToAnswerMs', 'p95TimeToAnswerMs'];
export const STORED_METRICS = [...ADDITIVE_METRICS, ...DAY_ONLY_METRICS];

export const utcDay = (value) => new Date(value).toISOString().slice(0, 10);

export function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index), fraction = index - lower;
  return Math.round((sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * fraction) * 10) / 10;
}

const isSearch = (e) => e.kind !== 'chat';

/**
 * Metrics for one group of events.
 * @param events      the group's events { id, userId, kind, createdAt, latencyMs, firstTokenMs }
 * @param firstClicks Map searchEventId -> time of its first click
 * @param followedUp  Set of event ids followed by another event of the same user within 60 s
 */
export function computeMetrics(events, firstClicks = new Map(), followedUp = new Set()) {
  const searches = events.filter(isSearch);
  const questions = events.filter((e) => !isSearch(e));
  const clicked = searches.filter((e) => firstClicks.has(e.id));
  const bounced = searches.filter((e) => !firstClicks.has(e.id) && !followedUp.has(e.id));
  const timeToAnswer = [
    ...clicked.map((e) => new Date(firstClicks.get(e.id)).getTime() - new Date(e.createdAt).getTime()),
    ...questions.map((e) => e.firstTokenMs),
  ].filter((ms) => Number.isFinite(ms) && ms >= 0);
  const latencies = events.map((e) => e.latencyMs).filter(Number.isFinite);
  return {
    events: events.length,
    searches: searches.length,
    questions: questions.length,
    clickedSearches: clicked.length,
    bouncedSearches: bounced.length,
    timeToAnswerCount: timeToAnswer.length,
    timeToAnswerSumMs: timeToAnswer.reduce((a, b) => a + b, 0),
    latencyCount: latencies.length,
    latencySumMs: latencies.reduce((a, b) => a + b, 0),
    activeUsers: new Set(events.map((e) => e.userId).filter(Boolean)).size,
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    p50TimeToAnswerMs: percentile(timeToAnswer, 0.5),
    p95TimeToAnswerMs: percentile(timeToAnswer, 0.95),
  };
}

/** Ids of `events` followed by an event in `laterEvents` of the same user within 60 s. */
export function followUpIds(events, laterEvents = events) {
  const byUser = new Map();
  for (const e of laterEvents) {
    if (!e.userId) continue;
    if (!byUser.has(e.userId)) byUser.set(e.userId, []);
    byUser.get(e.userId).push(new Date(e.createdAt).getTime());
  }
  const result = new Set();
  for (const e of events) {
    const times = byUser.get(e.userId);
    if (!times) continue;
    const at = new Date(e.createdAt).getTime();
    if (times.some((t) => t > at && t - at <= FOLLOW_UP_MS)) result.add(e.id);
  }
  return result;
}

/** One day's metrics, in total and by the searcher's role (E29.3). */
export function computeDay(events, firstClicks, followedUp) {
  const byRole = {};
  for (const role of new Set(events.map((e) => e.role || 'unknown'))) {
    byRole[role] = computeMetrics(events.filter((e) => (e.role || 'unknown') === role), firstClicks, followedUp);
  }
  return { total: computeMetrics(events, firstClicks, followedUp), byRole };
}

/** Rates derived from additive counts, so they stay correct when summed. */
export function withRates(m) {
  return {
    ...m,
    ctr: m.searches ? m.clickedSearches / m.searches : 0,
    bounceRate: m.searches ? m.bouncedSearches / m.searches : 0,
    avgTimeToAnswerMs: m.timeToAnswerCount ? Math.round(m.timeToAnswerSumMs / m.timeToAnswerCount) : null,
    avgLatencyMs: m.latencyCount ? Math.round(m.latencySumMs / m.latencyCount) : null,
  };
}

/** Sum additive metrics across rows (days or departments). */
export function sumMetrics(list) {
  const out = Object.fromEntries([...ADDITIVE_METRICS, 'activeUsers'].map((k) => [k, 0]));
  for (const m of list) for (const k of Object.keys(out)) out[k] += Number(m?.[k] || 0);
  return out;
}

export function csvEscape(value) {
  let s = String(value ?? '');
  // Spreadsheet formula injection: query text is user input.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export const CSV_COLUMNS = ['date', 'searches', 'questions', 'activeUsers', 'clickedSearches', 'ctr', 'bouncedSearches', 'bounceRate', 'avgTimeToAnswerMs', 'avgLatencyMs'];

export function usageCsv(rows, columns = CSV_COLUMNS) {
  return [columns.join(','), ...rows.map((row) => columns.map((k) => csvEscape(row[k])).join(','))].join('\r\n') + '\r\n';
}
