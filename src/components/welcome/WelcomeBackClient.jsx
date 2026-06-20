'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Building2, Plus, ArrowRight, Shield } from 'lucide-react';
import CreateOrgForm from '@/components/org/CreateOrgForm';
import { cn } from '@/lib/utils';

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  dept_admin: 'Dept Admin',
  employee: 'Employee',
  guest: 'Guest',
};

export default function WelcomeBackClient({ orgs }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg"
      >
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Pick an organization to continue, or create a new one.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => { window.location.href = `/api/org/enter/${org.id}`; }}
              className="flex w-full items-center justify-between rounded-xl border border-border bg-card p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{org.name}</p>
                  <span className={cn(
                    'inline-flex items-center gap-1 text-xs',
                    org.role === 'super_admin' ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500'
                  )}>
                    {org.role === 'super_admin' && <Shield className="h-3 w-3" />}
                    {ROLE_LABELS[org.role] ?? org.role}
                  </span>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-400" />
            </button>
          ))}
        </div>

        {creating ? (
          <div className="rounded-xl border border-border bg-card p-4">
            <CreateOrgForm
              submitLabel="Create organization"
              onSuccess={(org) => router.push(`/onboarding/${org.id}/billing`)}
            />
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border p-4 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" />
            Create new organization
          </button>
        )}
      </motion.div>
    </div>
  );
}
