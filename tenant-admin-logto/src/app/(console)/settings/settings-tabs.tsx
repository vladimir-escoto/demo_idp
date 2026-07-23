'use client';

import { usePathname } from 'next/navigation';

import TabNav, { TabNavItem } from '@/ds-components/TabNav';

/** Mirrors the console's organization-details tabs (Settings / Branding). */
export default function SettingsTabs() {
  const pathname = usePathname() ?? '/settings';

  return (
    <TabNav>
      <TabNavItem href="/settings" isActive={pathname === '/settings'}>
        Settings
      </TabNavItem>
      <TabNavItem href="/settings/branding" isActive={pathname === '/settings/branding'}>
        Branding
      </TabNavItem>
    </TabNav>
  );
}
