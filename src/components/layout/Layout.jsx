'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Menu } from 'lucide-react';
import AppSidebar from './AppSidebar';
import { Button } from '@/components/ui/Button';
import { ToastProvider } from '@/components/ui/Toast';
import ApiKeyRequiredModal from '@/components/modals/ApiKeyRequiredModal';
import { useApiKeyCheck } from '@/hooks/useApiKeyCheck';
import { cn } from '@/lib/utils';

const Layout = ({ children, className, orgId: orgIdProp, fullBleed = false }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [resolvedOrgId, setResolvedOrgId] = useState(orgIdProp || null);
  const { hasApiKey, isLoading, refreshApiKeyStatus } = useApiKeyCheck();

  useEffect(() => {
    if (orgIdProp) {
      setResolvedOrgId(orgIdProp);
      return;
    }
    fetch('/api/org/active')
      .then((r) => r.json())
      .then((data) => data?.orgId && setResolvedOrgId(data.orgId))
      .catch(() => {});
  }, [orgIdProp]);

  if (isLoading) {
    return (
      <ToastProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading...</p>
          </div>
        </div>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <ApiKeyRequiredModal
        isOpen={hasApiKey === false}
        onApiKeySet={refreshApiKeyStatus}
      />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <AppSidebar
          orgId={resolvedOrgId}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <Button
          variant="ghost"
          size="icon"
          className="fixed top-4 left-4 z-20 lg:hidden bg-white dark:bg-gray-800 shadow-md"
          onClick={() => setSidebarOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>

        <motion.main
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className={cn("min-h-screen lg:pl-[268px]", className)}
        >
          {fullBleed ? (
            children
          ) : (
            <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
              {children}
            </div>
          )}
        </motion.main>
      </div>
    </ToastProvider>
  );
};

export default Layout;
