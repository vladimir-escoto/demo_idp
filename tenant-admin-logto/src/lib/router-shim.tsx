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

/** React-router style relative path resolution against the current pathname. */
export const resolveRelative = (href: string, pathname: string): string => {
  if (href.startsWith('/') || /^[a-z]+:/i.test(href)) {
    return href;
  }
  const [pathPart, ...rest] = href.split(/(?=[?#])/);
  const output = pathname.split('/').filter(Boolean);
  for (const segment of (pathPart ?? '').split('/')) {
    if (segment === '..') {
      output.pop();
    } else if (segment !== '.' && segment !== '') {
      output.push(segment);
    }
  }
  return `/${output.join('/')}${rest.join('')}`;
};

export type LinkProps = Omit<ComponentProps<typeof NextLink>, 'href'> & { to: To };

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(({ to, ...rest }, ref) => {
  const pathname = usePathname() ?? '/';
  return <NextLink ref={ref} href={resolveRelative(resolveTo(to), pathname)} {...rest} />;
});
Link.displayName = 'Link';

export const useLocation = () => {
  const pathname = usePathname() ?? '/';
  const searchParams = useNextSearchParams() ?? new URLSearchParams();

  return useMemo(() => {
    const search = searchParams.toString();
    return { pathname, search: search ? `?${search}` : '', hash: '', state: undefined, key: '' };
  }, [pathname, searchParams]);
};

export const useNavigate = () => {
  const router = useRouter();
  const pathname = usePathname() ?? '/';

  return useMemo(
    () =>
      (to: To | number, options?: { replace?: boolean }) => {
        if (typeof to === 'number') {
          router.back();
          return;
        }
        const href = resolveRelative(resolveTo(to), pathname);
        if (options?.replace) {
          router.replace(href);
        } else {
          router.push(href);
        }
      },
    [router, pathname]
  );
};

export const useParams = () => useNextParams();

export const useSearchParams = (): [URLSearchParams, (next: URLSearchParams) => void] => {
  const readOnly = useNextSearchParams() ?? new URLSearchParams();
  const pathname = usePathname() ?? '/';
  const router = useRouter();

  const params = useMemo(() => new URLSearchParams(readOnly.toString()), [readOnly]);

  const setParams = (next: URLSearchParams) => {
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return [params, setParams];
};
