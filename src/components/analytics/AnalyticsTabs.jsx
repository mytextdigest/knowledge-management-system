"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The analytics section's tab bar (WS-D §4.3). Tabs are separate pages so
// each keeps its own API and permission check; tabs a role can't open are
// hidden rather than shown disabled.
export default function AnalyticsTabs({ orgId, showGovernance = false }) {
  const pathname = usePathname();
  const tabs = [
    { label: "Search activity", href: `/org/${orgId}/analytics` },
    ...(showGovernance ? [{ label: "Governance", href: `/org/${orgId}/governance-metrics` }] : []),
  ];
  return (
    <nav aria-label="Analytics sections" className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300"
                : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
