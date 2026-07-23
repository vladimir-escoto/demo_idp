'use client';

/**
 * Minimal react-router-dom API surface backed by Next.js, so the Logto console
 * components can be reused without editing their imports (webpack aliases
 * `react-router-dom` to this module).
 */
import NextLink from 'next/link';
import {
  usePathname,
  useRouter,
  useParams as useNextParams,
  useSearchParams as useNextSearchParams,
} from 'next/navigation';
import { type ComponentProps, forwardRef, useMemo } from 'react';

export type To = string | { pathname?: string; search?: string; hash?: string };

export const resolveTo = (to: To): string =>
  typeof to === 'string' ? to : `${to.pathname ?? ''}${to.search ?? ''}${to.hash ?? ''}`;

export type LinkProps = Omit<ComponentProps<typeof NextLink>, 'href'> & { to: To };

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(({ to, ...rest }, ref) => (
  <NextLink ref={ref} href={resolveTo(to)} {...rest} />
));
Link.displayName = 'Link';

export const useLocation = () => {
  const pathname = usePathname();
  const searchParams = useNextSearchParams();

  return useMemo(() => {
    const search = searchParams.toString();
    return { pathname, search: search ? `?${search}` : '', hash: '', state: undefined, key: '' };
  }, [pathname, searchParams]);
};

export const useNavigate = () => {
  const router = useRouter();

  return useMemo(
    () =>
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
};

export const useParams = () => useNextParams();

export const useSearchParams = (): [URLSearchParams, (next: URLSearchParams) => void] => {
  const readOnly = useNextSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const params = useMemo(() => new URLSearchParams(readOnly.toString()), [readOnly]);

  const setParams = (next: URLSearchParams) => {
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return [params, setParams];
};
