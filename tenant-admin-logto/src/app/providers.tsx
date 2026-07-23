'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import ReactModal from 'react-modal';
import { SWRConfig } from 'swr';

import { AppThemeProvider } from '@/contexts/AppThemeProvider';
import useSwrOptions from '@/hooks/use-swr-options';
import initI18n from '@/i18n/init';

function SwrProvider({ children }: { readonly children: ReactNode }) {
  const options = useSwrOptions();
  return <SWRConfig value={options}>{children}</SWRConfig>;
}

/**
 * Client-side bootstrap, mirroring the console SPA: i18n loads before anything
 * renders (avoids hydration mismatches), then theme + SWR + toast providers.
 */
export default function Providers({ children }: { readonly children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    ReactModal.setAppElement(document.body);
    void initI18n().then(() => {
      setIsReady(true);
    });
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    <AppThemeProvider>
      <SwrProvider>{children}</SwrProvider>
      <Toaster position="bottom-center" />
    </AppThemeProvider>
  );
}
