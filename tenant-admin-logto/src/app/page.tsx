import { redirect } from 'next/navigation';

import { getTenantSession } from '@/lib/session';

import { signInAction } from './actions';
import Landing from './landing';

/** Landing: authenticated org members go straight to the dashboard. */
export default async function Home() {
  const session = await getTenantSession();
  const hasOrg = Boolean(session?.orgId);

  if (hasOrg) {
    redirect('/dashboard');
  }

  return <Landing hasSessionWithoutOrg={Boolean(session)} onSignIn={signInAction} />;
}
