"use client";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// Tab bar for the document page's right panel. tabs: [{ id, label, icon, count? }].
// Stays on one row. KMS: below 56rem the inactive tabs show only their icon
// (label in the tooltip), so every tab stays visible; it still scrolls
// sideways if even that doesn't fit.
export default function DocumentTabs({ tabs, activeTab, onChange }) {
  return (
    <div className="@container min-w-0">
    <div role="tablist" className="flex items-center gap-1 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
      {tabs.map(({ id, label, icon: Icon, count }) => {
        const active = activeTab === id;
        return (
          <Button
            key={id}
            role="tab"
            aria-selected={active}
            variant={active ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onChange(id)}
            title={label}
            aria-label={label}
            className={cn(
              "shrink-0 flex items-center gap-2 whitespace-nowrap",
              !active && "@max-4xl:px-2",
              active ? "text-white dark:text-gray-200" : "text-gray-600 dark:text-gray-400"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className={active ? undefined : "hidden @4xl:inline"}>{label}</span>
            {count > 0 && (
              <span className={cn(
                "min-w-5 h-5 px-1.5 inline-flex items-center justify-center text-[11px] font-medium rounded-full",
                active ? "bg-white/20" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
              )}>
                {count}
              </span>
            )}
          </Button>
        );
      })}
    </div>
    </div>
  );
}
