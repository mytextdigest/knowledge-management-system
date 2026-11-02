"use client";

// Chip-style multi-select used for department/category scoping (review
// policies, approval workflows). An empty selection means "all".
export const CATEGORIES = ['Policies', 'SOPs', 'Reports', 'Meeting Knowledge', 'Product Knowledge', 'Historical Documents', 'Other'];

export default function ScopePicker({ legend, hint, options, selected, onChange }) {
  const toggle = (value) => onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  return <fieldset className="space-y-1">
    <legend className="text-sm font-medium">{legend}</legend>
    <p className="text-xs text-gray-500">{hint}</p>
    <div className="flex flex-wrap gap-2 pt-1">
      {options.map(({ value, label }) => <label key={value} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${selected.includes(value) ? 'border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' : ''}`}>
        <input type="checkbox" className="sr-only" checked={selected.includes(value)} onChange={() => toggle(value)} />{label}
      </label>)}
      {!options.length && <span className="text-sm text-gray-500">None available</span>}
    </div>
  </fieldset>;
}
