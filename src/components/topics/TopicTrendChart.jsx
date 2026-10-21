"use client";

// Rank 16 — Topic Evolution Tracking (FR-3). A single-series line for one metric
// (volume or expert count) over a topic's snapshot history. Deliberately two separate
// charts rather than one dual-axis chart (documentCount and expertCount are different
// scales) — see the dataviz skill's "one axis" rule.
export default function TopicTrendChart({ title, series, valueKey, formatPeriod }) {
  const width = 560;
  const height = 120;
  const padX = 12;
  const padY = 16;

  const values = series.map((s) => Number(s[valueKey] || 0));
  const max = Math.max(1, ...values);
  const stepX = series.length > 1 ? (width - padX * 2) / (series.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = padX + i * stepX;
    const y = height - padY - (v / max) * (height - padY * 2);
    return { x, y, v, period: series[i].periodStart };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</h3>
      <div className="text-primary-600 dark:text-blue-400">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={`${title} over time`}>
          <line x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" />
          <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="4" fill="currentColor">
              <title>{`${formatPeriod(p.period)}: ${p.v}`}</title>
            </circle>
          ))}
        </svg>
      </div>
      {/* Table fallback — same data as the chart, for screen readers and non-visual review. */}
      <table className="mt-2 w-full text-xs text-gray-500 dark:text-gray-400">
        <caption className="sr-only">{title} by period</caption>
        <tbody>
          <tr>
            {series.map((s, i) => <td key={i} className="pr-3 py-0.5 whitespace-nowrap">{formatPeriod(s.periodStart)}</td>)}
          </tr>
          <tr>
            {series.map((s, i) => <td key={i} className="pr-3 font-medium text-gray-700 dark:text-gray-300">{s[valueKey]}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
