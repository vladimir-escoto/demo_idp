'use client';

/**
 * Cloud subscription shim for this self-hosted portal: every quota reads as
 * unlimited (null) and every limit check returns false, so no paywall branch
 * in the vendored components ever renders.
 */
import { createContext } from 'react';

const unlimitedQuota: Record<string, null> = new Proxy(
  {},
  {
    get: () => null,
  }
);

const defaultValue = {
  currentSku: { id: 'oss', name: 'OSS' },
  currentSubscription: { planId: 'oss', isEnterprisePlan: false },
  currentSubscriptionQuota: unlimitedQuota,
  currentSubscriptionUsage: {},
  hasSurpassedSubscriptionQuotaLimit: () => false,
  hasReachedSubscriptionQuotaLimit: () => false,
  mutateSubscriptionQuotaAndUsages: () => {},
  onCurrentSubscriptionUpdated: () => {},
};

export const SubscriptionDataContext = createContext(defaultValue);

export default function SubscriptionDataProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <SubscriptionDataContext.Provider value={defaultValue}>
      {children}
    </SubscriptionDataContext.Provider>
  );
}
