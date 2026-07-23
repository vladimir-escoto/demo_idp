'use client';

/**
 * Replaces the console's react-router outlet context for organization pages.
 * Fetches the session's organization through the scoped proxy and exposes the
 * same shape the vendored Settings/Members/Branding components expect.
 */
import { type Organization } from '@logto/schemas';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import useSWR from 'swr';

import AppLoading from '@/components/AppLoading';
import { type RequestError } from '@/hooks/use-api';

import { type OrganizationDetailsOutletContext } from './types';

const OrgDetailsContext = createContext<OrganizationDetailsOutletContext | undefined>(undefined);

export function OrgDetailsProvider({
  orgId,
  children,
}: {
  readonly orgId: string;
  readonly children: ReactNode;
}) {
  const { data, mutate } = useSWR<Organization, RequestError>(`api/organizations/${orgId}`);

  const value = useMemo<OrganizationDetailsOutletContext | undefined>(
    () =>
      data && {
        data,
        jit: { emailDomains: [], ssoConnectorIds: [], roles: [] },
        isDeleting: false,
        onUpdated: (updated) => {
          void mutate(updated);
        },
      },
    [data, mutate]
  );

  if (!value) {
    return <AppLoading />;
  }

  return <OrgDetailsContext.Provider value={value}>{children}</OrgDetailsContext.Provider>;
}

export const useOrgOutletContext = (): OrganizationDetailsOutletContext => {
  const context = useContext(OrgDetailsContext);
  if (!context) {
    throw new Error('useOrgOutletContext must be used inside OrgDetailsProvider.');
  }
  return context;
};
