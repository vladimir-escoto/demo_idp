'use client';

/**
 * Shim of the console hook: self-host has exactly one domain — the Logto
 * endpoint itself (no cloud custom-domain machinery).
 */
import { useContext, useMemo } from 'react';

import { AppDataContext } from '@/contexts/AppDataProvider';

const useAvailableDomains = (): string[] => {
  const { tenantEndpoint } = useContext(AppDataContext);

  return useMemo(() => (tenantEndpoint ? [tenantEndpoint.host] : []), [tenantEndpoint]);
};

export default useAvailableDomains;
