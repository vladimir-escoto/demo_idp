import { type ReactNode } from 'react';

import 'overlayscrollbars/overlayscrollbars.css';
import '@/scss/normalized.scss';
import '@/scss/overlayscrollbars.scss';

import Providers from './providers';

export const metadata = {
  title: 'Tenant Admin · Tripleenable',
  description: 'Self-service admin portal for B2B organizations (Logto)',
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
