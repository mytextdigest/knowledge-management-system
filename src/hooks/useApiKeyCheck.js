'use client'

// Personal OpenAI keys were retired by the org-mandatory pivot — every key
// is now Organization-scoped (Organization.openaiApiKey), and missing-key
// enforcement happens server-side in (app)/org/[orgId]/layout.jsx, which
// redirects before an org page ever renders. This hook (and the modal it
// used to drive) has no personal key left to check, so it's a permanent
// no-op kept only so existing <Layout>/<TwoColumnLayout>/<SubscriptionLayout>
// call sites don't need to change.
export const useApiKeyCheck = () => {
  return {
    hasApiKey: true,
    isLoading: false,
    refreshApiKeyStatus: () => {},
  };
};
