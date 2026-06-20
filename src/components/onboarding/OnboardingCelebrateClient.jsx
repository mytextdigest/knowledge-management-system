'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { PartyPopper, ArrowRight } from 'lucide-react';

export default function OnboardingCelebrateClient({ orgId }) {
  const router = useRouter();

  useEffect(() => {
    fetch('/api/onboarding/complete', { method: 'POST' }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md text-center"
      >
        <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <PartyPopper className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Setup complete!</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Your organization is ready — billing and your OpenAI key are configured. Time to get to work.
        </p>
        <button
          onClick={() => router.push(`/org/${orgId}`)}
          className="w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center gap-2 font-medium"
        >
          Go to home page
          <ArrowRight className="h-4 w-4" />
        </button>
      </motion.div>
    </div>
  );
}
