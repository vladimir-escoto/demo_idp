'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Bare app URL redirects to the Settings tab. Done client-side (router.replace)
 * because a server redirect() renders blank during client-side navigation
 * (e.g. right after "Finish and done" in the guide).
 */
export default function ApplicationIndexPage({ params }: { readonly params: { id: string } }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/applications/${params.id}/settings`);
  }, [params.id, router]);

  return null;
}
