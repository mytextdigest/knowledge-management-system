"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Layers,
  MessageSquare,
  LayoutDashboard,
  Library,
  Settings,
  Plus,
  CreditCard,
  KeyRound,
  HelpCircle,
  Loader2,
  Shield,
  X,
} from "lucide-react";
import Image from "next/image";
import CreateOrgModal from "@/components/org/CreateOrgModal";
import LogoutButton from "@/components/ui/LogoutButton";
import { cn } from "@/lib/utils";

export default function AppSidebar({ orgId, isOpen, onClose }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();

  const [orgs, setOrgs] = useState([]);
  const [org, setOrg] = useState(null); // { name, role, hasApiKey }
  const [departments, setDepartments] = useState([]);

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [showCreateDept, setShowCreateDept] = useState(false);
  const [deptName, setDeptName] = useState("");
  const [creatingDept, setCreatingDept] = useState(false);

  const switcherRef = useRef(null);
  const userMenuRef = useRef(null);

  useEffect(() => {
    fetch("/api/org")
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setOrgs(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/org/${orgId}/settings`)
      .then((r) => r.json())
      .then((data) => !data.error && setOrg(data))
      .catch(() => {});
    fetch(`/api/org/${orgId}/department`)
      .then((r) => r.json())
      .then((data) => Array.isArray(data) && setDepartments(data))
      .catch(() => {});
  }, [orgId]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setSwitcherOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isOrgAdmin = org?.role === "super_admin" || org?.role === "dept_admin";
  const isSuperAdmin = org?.role === "super_admin";

  const createDepartment = async () => {
    if (!deptName.trim()) return;
    setCreatingDept(true);
    try {
      const res = await fetch(`/api/org/${orgId}/department`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: deptName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setDepartments((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
        setDeptName("");
        setShowCreateDept(false);
      }
    } finally {
      setCreatingDept(false);
    }
  };

  const navTo = (href) => {
    router.push(href);
    onClose?.();
  };

  const isActive = (href) => pathname === href;

  const primaryNav = orgId
    ? [
        ...(isOrgAdmin
          ? [{ label: "Dashboard", href: `/org/${orgId}/dashboard`, icon: LayoutDashboard }]
          : []),
        { label: "Knowledge Repository", href: `/org/${orgId}/repository`, icon: Library },
      ]
    : [];

  return (
    <>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <motion.aside
        initial={false}
        animate={{ x: isOpen ? 0 : undefined }}
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen w-[268px] flex-col bg-gray-900 text-gray-100",
          "transition-transform duration-200 lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1 text-gray-400 hover:bg-gray-800 lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>

        {/* App branding */}
        <div className="flex items-center gap-2.5 px-4 pt-5 pb-3">
          <Image src="/logo.png" alt="" width={40} height={40} className="object-contain" />
          <span className="text-xl font-bold tracking-wide text-white">KMS</span>
        </div>

        {/* Workspace switcher */}
        <div className="relative border-b border-gray-800 p-3" ref={switcherRef}>
          <button
            onClick={() => setSwitcherOpen((o) => !o)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-gray-800"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary-600">
              <Image src="/logo.png" alt="" width={20} height={20} className="object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {org?.name || "Loading..."}
              </p>
              <p className="text-xs text-gray-400">Workspace</p>
            </div>
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
          </button>

          <AnimatePresence>
            {switcherOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.12 }}
                className="absolute left-3 right-3 top-full z-50 mt-1 rounded-xl border border-gray-700 bg-gray-800 shadow-xl py-1"
              >
                {orgs.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => { window.location.href = `/api/org/enter/${o.id}`; }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-700",
                      o.id === orgId ? "text-primary-400 font-medium" : "text-gray-200"
                    )}
                  >
                    <Building2 className="h-4 w-4" />
                    <span className="truncate">{o.name}</span>
                  </button>
                ))}

                <div className="my-1 border-t border-gray-700" />

                <button
                  onClick={() => { setShowCreateOrgModal(true); setSwitcherOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700"
                >
                  <Plus className="h-4 w-4" />
                  Create Organization
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Scrollable nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {/* Org Chat - prominent */}
          {orgId && (
            <button
              onClick={() => navTo(`/org/${orgId}/chat`)}
              className={cn(
                "mb-3 flex w-full items-center gap-2.5 rounded-xl px-3 py-3 text-sm font-semibold shadow-sm transition-colors",
                isActive(`/org/${orgId}/chat`)
                  ? "bg-primary-600 text-white"
                  : "bg-primary-600/20 text-primary-300 hover:bg-primary-600/30"
              )}
            >
              <MessageSquare className="h-5 w-5" />
              Org Chat
            </button>
          )}

          {primaryNav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <button
                key={item.href}
                onClick={() => navTo(item.href)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  active ? "bg-gray-800 text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}

          {/* Departments */}
          {orgId && (
            <div className="mt-5">
              <div className="flex items-center justify-between px-3 pb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Departments
                </span>
                {isOrgAdmin && (
                  <button
                    onClick={() => setShowCreateDept((v) => !v)}
                    className="rounded p-0.5 text-gray-500 hover:bg-gray-800 hover:text-gray-200"
                    title="Create department"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {showCreateDept && (
                <div className="mb-2 flex gap-1.5 px-3">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Department name"
                    value={deptName}
                    onChange={(e) => setDeptName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createDepartment()}
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <button
                    onClick={createDepartment}
                    disabled={creatingDept || !deptName.trim()}
                    className="rounded-md bg-primary-600 px-2 text-xs text-white disabled:opacity-50"
                  >
                    {creatingDept ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                  </button>
                </div>
              )}

              {departments.length === 0 ? (
                <p className="px-3 py-1 text-xs text-gray-500">No departments yet.</p>
              ) : (
                departments.map((dept) => {
                  const href = `/org/${orgId}/department/${dept.id}`;
                  const active = isActive(href);
                  return (
                    <button
                      key={dept.id}
                      onClick={() => navTo(href)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors",
                        active ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800 hover:text-white"
                      )}
                    >
                      <Layers className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{dept.name}</span>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Org Settings */}
          {orgId && (
            <button
              onClick={() => navTo(`/org/${orgId}/settings`)}
              className={cn(
                "mt-5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive(`/org/${orgId}/settings`)
                  ? "bg-gray-800 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              )}
            >
              <Settings className="h-4 w-4" />
              Org Settings
            </button>
          )}
        </nav>

        {/* Bottom user menu */}
        <div className="relative border-t border-gray-800 p-3" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-gray-800"
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-700 text-sm font-semibold text-white">
              {session?.user?.email?.[0]?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-gray-200">{session?.user?.email}</p>
              {org?.role && (
                <p className="flex items-center gap-1 text-xs text-gray-500">
                  {isSuperAdmin && <Shield className="h-3 w-3" />}
                  {org.role.replace("_", " ")}
                </p>
              )}
            </div>
            <ChevronUp className="h-4 w-4 flex-shrink-0 text-gray-400" />
          </button>

          <AnimatePresence>
            {userMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                transition={{ duration: 0.12 }}
                className="absolute bottom-full left-3 right-3 z-50 mb-2 rounded-xl border border-gray-700 bg-gray-800 p-3 shadow-xl space-y-3"
              >
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Theme</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTheme("light")}
                      className={cn(
                        "flex-1 rounded-lg px-3 py-1.5 text-sm",
                        theme === "light" ? "bg-primary-600 text-white" : "bg-gray-700 text-gray-300"
                      )}
                    >
                      Light
                    </button>
                    <button
                      onClick={() => setTheme("dark")}
                      className={cn(
                        "flex-1 rounded-lg px-3 py-1.5 text-sm",
                        theme === "dark" ? "bg-primary-600 text-white" : "bg-gray-700 text-gray-300"
                      )}
                    >
                      Dark
                    </button>
                  </div>
                </div>

                <div className="border-t border-gray-700 pt-2 space-y-1.5">
                  {isSuperAdmin && (
                    <button
                      onClick={() => navTo(`/org/${orgId}/billing`)}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
                    >
                      <CreditCard className="h-4 w-4" />
                      Billing
                    </button>
                  )}
                  <button
                    onClick={() => navTo("/settings/change-password")}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
                  >
                    <KeyRound className="h-4 w-4" />
                    Change password
                  </button>
                  <button
                    onClick={() => window.open("https://www.mytextdigest.com/help", "_blank")}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-200 hover:bg-gray-700"
                  >
                    <HelpCircle className="h-4 w-4" />
                    Help & Support
                  </button>
                </div>

                <div className="border-t border-gray-700 pt-2">
                  <LogoutButton />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.aside>

      {showCreateOrgModal && (
        <CreateOrgModal
          onClose={() => setShowCreateOrgModal(false)}
          onCreate={(newOrg) => {
            router.push(`/onboarding/${newOrg.id}/billing`);
          }}
        />
      )}
    </>
  );
}
