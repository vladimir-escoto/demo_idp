'use client';

import { createContext } from 'react';

/**
 * Shim of the console's cloud multi-tenant context: this portal always runs
 * against a single self-hosted tenant, so the default value is enough and no
 * provider is mounted.
 */
type TenantsContextValue = {
  currentTenantId: string;
  isDevTenant: boolean;
  currentTenant?: undefined;
};

export const TenantsContext = createContext<TenantsContextValue>({
  currentTenantId: 'default',
  isDevTenant: false,
});
