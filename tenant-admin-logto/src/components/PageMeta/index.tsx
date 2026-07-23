'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Replaces the console's react-helmet based PageMeta: sets document.title from
 * the same i18n title keys.
 */
type Props = {
  readonly titleKey: string | string[];
  readonly trackPageView?: boolean;
};

export default function PageMeta({ titleKey }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const keys = Array.isArray(titleKey) ? titleKey : [titleKey];
  const title = keys.map((key) => t(key as never)).join(' - ');

  useEffect(() => {
    document.title = `${title} · Tenant Admin`;
  }, [title]);

  return null;
}
