'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import BackButton from '@/components/ui/BackButton';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Loader2 } from 'lucide-react';

export default function OrgBillingPage() {
  const { orgId } = useParams();
  const router = useRouter();

  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    loadData();
  }, [orgId]);

  async function loadData() {
    try {
      const [plansRes, subRes] = await Promise.all([
        fetch('/api/plans'),
        fetch(`/api/subscription?orgId=${orgId}`)
      ]);

      if (subRes.status === 403) {
        setForbidden(true);
        return;
      }

      const plansData = await plansRes.json();
      const subData = await subRes.json();

      setPlans(plansData);
      setSubscription(subData);
    } catch (err) {
      console.error('Failed to load subscription data', err);
    } finally {
      setLoading(false);
    }
  }

  async function openPortal() {
    const res = await fetch('/api/stripe/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  }

  const currentPlan = subscription?.plan;

  if (forbidden) {
    return (
      <Layout orgId={orgId}>
        <div className="max-w-lg mx-auto text-center py-20">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Only the org's super admin can manage billing.
          </h1>
          <Button className="mt-6" onClick={() => router.push(`/org/${orgId}`)}>
            Back to Dashboard
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout orgId={orgId}>
      <div className="max-w-5xl mx-auto px-2 py-2">
        <BackButton href={`/org/${orgId}`} label="Back to Dashboard" className="mb-6" />

        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Billing
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage this organization's plan and payment method
          </p>
        </div>

        <div className="flex justify-center mb-10">
          <Button variant="outline" onClick={openPortal}>
            Manage billing & payment
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="grid gap-6 w-full max-w-4xl grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
              {plans.map((plan) => {
                const isCurrent = currentPlan && plan.id === currentPlan.id;
                const isLowerOrSame = currentPlan && plan.storageLimitGb <= currentPlan.storageLimitGb;
                const disabled = isLowerOrSame;

                return (
                  <motion.div
                    key={plan.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border rounded-lg p-6 bg-white dark:bg-gray-900"
                  >
                    <h2 className="text-lg font-semibold mb-1">{plan.name}</h2>
                    <p className="text-sm text-gray-500 mb-4">{plan.description}</p>
                    <p className="text-sm mb-2">
                      <strong>{plan.storageLimitGb} GB</strong> storage
                    </p>
                    <p className="text-xl font-bold mb-6">
                      ${(plan.priceCents / 100).toFixed(2)}
                      <span className="text-sm font-normal text-gray-500"> / {plan.billingInterval}</span>
                    </p>

                    {isCurrent ? (
                      <Button disabled className="w-full">Current Plan</Button>
                    ) : (
                      <Button className="w-full" disabled={disabled} onClick={openPortal}>
                        {disabled ? 'Not Available' : 'Upgrade'}
                      </Button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
