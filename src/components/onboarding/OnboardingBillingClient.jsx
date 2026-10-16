'use client';

import { useState } from 'react';
import { CreditCard } from 'lucide-react';

export default function OnboardingBillingClient({ orgId, plans }) {
  const [interval, setInterval] = useState('month');
  const [loadingPlanId, setLoadingPlanId] = useState(null);
  const [error, setError] = useState('');

  const filteredPlans = plans.filter((plan) => plan.billingInterval === interval);

  const subscribe = async (planId) => {
    setError('');
    setLoadingPlanId(planId);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, orgId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to start checkout.'); return; }
      window.location.href = data.url;
    } catch {
      setError('Failed to start checkout.');
      setLoadingPlanId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 h-12 w-12 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <CreditCard className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Choose a plan for your organization</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Billing is tied to this organization, not your personal account.
          </p>
        </div>

        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-lg border p-1">
            <button
              onClick={() => setInterval('month')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${interval === 'month' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval('year')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${interval === 'year' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
            >
              Yearly
            </button>
          </div>
        </div>

        {error && <p className="text-center text-sm text-red-600 mb-4">{error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPlans.map((plan) => (
            <div key={plan.id} className="border rounded-lg p-6">
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <p className="text-sm text-gray-500">{plan.description}</p>
              <p className="mt-3">Storage: <strong>{plan.storageLimitGb} GB</strong></p>
              <p className="mt-4 text-2xl font-bold">
                ${(plan.priceCents / 100).toFixed(2)}
                <span className="text-sm font-normal text-gray-500"> / {plan.billingInterval}</span>
              </p>
              <button
                onClick={() => subscribe(plan.id)}
                disabled={loadingPlanId === plan.id}
                className="mt-6 w-full bg-blue-600 text-white py-2 rounded-md disabled:opacity-60"
              >
                {loadingPlanId === plan.id ? 'Starting checkout...' : 'Subscribe'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
