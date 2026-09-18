'use client';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Building2 } from 'lucide-react';
import CreateOrgForm from '@/components/org/CreateOrgForm';

export default function OnboardingStartClient() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 h-12 w-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Create your organization</h1>
          <p className="text-muted-foreground text-sm mt-3">
            Every workspace in KMS lives inside an organization. You'll become its admin, set up billing and an OpenAI key, and you're ready to go.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-lg p-6">
          <CreateOrgForm
            submitLabel="Create organization"
            onSuccess={(org) => router.push(`/onboarding/${org.id}/billing`)}
          />
        </div>
      </motion.div>
    </div>
  );
}
