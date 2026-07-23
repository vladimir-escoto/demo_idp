'use client';

/**
 * In the original console this hook prefixes paths with the cloud tenant id.
 * This portal is single-tenant per deployment, so paths pass through as-is.
 */
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import { resolveTo, type To } from '@/lib/router-shim';

const useTenantPathname = () => {
  const pathname = usePathname();
  const router = useRouter();

  const match = useCallback(
    (path: string) => pathname === path || pathname.startsWith(`${path}/`),
    [pathname]
  );

  const getTo = useCallback((to: To): To => to, []);

  const getPathname = useCallback((path: string) => path, []);

  const navigate = useCallback(
    (to: To | number, options?: { replace?: boolean }) => {
      if (typeof to === 'number') {
        router.back();
        return;
      }
      if (options?.replace) {
        router.replace(resolveTo(to));
      } else {
        router.push(resolveTo(to));
      }
    },
    [router]
  );

  const getUrl = useCallback(
    (path = '') => new URL(path, typeof window === 'undefined' ? 'http://localhost' : window.location.origin),
    []
  );

  return useMemo(
    () => ({ match, getTo, getPathname, navigate, getUrl, currentTenantId: 'default' }),
    [match, getTo, getPathname, navigate, getUrl]
  );
};

export default useTenantPathname;
