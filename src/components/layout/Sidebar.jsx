"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  FileText,
  Upload,
  Star,
  Folder,
  Calendar,
  Building2,
  MessageSquare,
  Users,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const Sidebar = ({
  isOpen,
  onToggle,
  activeFilter,
  onFilterChange,
  documentStats,
  className,
}) => {
  const pathname = usePathname();

  const orgMatch = pathname?.match(/^\/org\/([^/]+)/);
  const orgId = orgMatch?.[1];

  const menuItems = [
    {
      id: "all",
      label: "All Documents",
      icon: FileText,
      count: documentStats?.total || 0,
    },
    {
      id: "recent",
      label: "Recent",
      icon: Calendar,
      count: documentStats?.recent || 0,
    },
    {
      id: "starred",
      label: "Starred",
      icon: Star,
      count: documentStats?.starred || 0,
    },
  ];

  const fileTypes = [
    { id: "pdf", label: "PDF Files", count: documentStats?.pdf || 0 },
    { id: "docx", label: "Word Documents", count: documentStats?.docx || 0 },
    { id: "txt", label: "Text Files", count: documentStats?.txt || 0 },
    { id: "xlsx", label: "Excel Spreadsheets", count: documentStats?.xlsx || 0 },
    { id: "csv", label: "CSV Files", count: documentStats?.csv || 0 },
  ];

  const orgLinks = orgId
    ? [
        {
          label: "Knowledge Repository",
          href: `/org/${orgId}/repository`,
          icon: Building2,
        },
        {
          label: "Enterprise Chat",
          href: `/org/${orgId}/chat`,
          icon: MessageSquare,
        },
        {
          label: "Departments",
          href: `/org/${orgId}/departments`,
          icon: Users,
        },
        {
          label: "Members / Settings",
          href: `/org/${orgId}/settings`,
          icon: Settings,
        },
      ]
    : [];

  return (
    <>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={onToggle}
        />
      )}

      <motion.aside
        initial={{ x: -300 }}
        animate={{ x: isOpen ? 0 : -300 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className={cn(
          "fixed left-0 top-16 z-30 h-[calc(100vh-4rem)] w-64 border-r border-gray-200 bg-white",
          "dark:border-gray-800 dark:bg-gray-900",
          "lg:relative lg:top-0 lg:h-[calc(100vh-4rem)] lg:translate-x-0",
          className
        )}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-gray-200 p-4 dark:border-gray-800">
            <Button className="w-full" size="sm">
              <Upload className="mr-2 h-4 w-4" />
              Upload Document
            </Button>
          </div>

          <nav className="flex-1 overflow-y-auto p-4">
            {orgLinks.length > 0 ? (
              <div className="mb-6 space-y-1">
                <h3 className="px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Organization
                </h3>

                {orgLinks.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center rounded-lg px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300"
                          : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                      )}
                    >
                      <Icon className="mr-3 h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}

            <div className="space-y-1">
              <h3 className="px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Documents
              </h3>

              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeFilter === item.id;

                return (
                  <motion.button
                    key={item.id}
                    onClick={() => onFilterChange?.(item.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-center">
                      <Icon className="mr-3 h-4 w-4" />
                      {item.label}
                    </div>

                    {item.count > 0 && (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        {item.count}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>

            <div className="mt-6 space-y-1">
              <h3 className="px-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                File Types
              </h3>

              {fileTypes.map((type) => (
                <motion.button
                  key={type.id}
                  onClick={() => onFilterChange?.(`type:${type.id}`)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex items-center">
                    <Folder className="mr-3 h-4 w-4" />
                    {type.label}
                  </div>

                  {type.count > 0 && (
                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                      {type.count}
                    </span>
                  )}
                </motion.button>
              ))}
            </div>
          </nav>

          <div className="border-t border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Storage Used</span>
              <span>2.4 GB / 10 GB</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-1.5 rounded-full bg-primary-600"
                style={{ width: "24%" }}
              />
            </div>
          </div>
        </div>
      </motion.aside>
    </>
  );
};

export default Sidebar;