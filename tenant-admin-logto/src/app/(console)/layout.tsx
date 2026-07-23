import { redirect } from 'next/navigation';
import { type ReactNode } from 'react';

import ConsoleShell from '@/layouts/ConsoleShell';
import { managementJson } from '@/lib/management';
import { getTenantSession } from '@/lib/session';

import { signOutAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: { readonly children: ReactNode }) {
  const session = await getTenantSession();

  if (!session?.orgId) {
    redirect('/');
  }

  let orgName = session.orgId;
  try {
    const organization = await managementJson<{ name: string }>(
      `api/organizations/${session.orgId}`
    );
    orgName = organization.name;
  } catch {
    // Keep the id as a fallback label; the proxy will surface real errors.
  }

  return (
    <ConsoleShell
      orgName={orgName}
      userDisplay={session.name ?? session.email ?? session.userId}
      onSignOut={signOutAction}
    >
      {session.isOrgAdmin ? (
        children
      ) : (
        <div style={{ padding: 24 }}>
          Your account belongs to “{orgName}” but does not have the <code>orgadmin</code> role, so
          the tenant admin portal is read-blocked. Ask an organization admin to grant you access.
        </div>
      )}
    </ConsoleShell>
  );
}
