'use client';

import { useTranslation } from 'react-i18next';

import BarGraphIcon from '@/assets/icons/bar-graph.svg?react';
import BoxIcon from '@/assets/icons/box.svg?react';
import GearIcon from '@/assets/icons/gear.svg?react';
import ListIcon from '@/assets/icons/list.svg?react';
import OrganizationIcon from '@/assets/icons/organization.svg?react';
import OverlayScrollbar from '@/ds-components/OverlayScrollbar';
import useTenantPathname from '@/hooks/use-tenant-pathname';

import Item from './components/Item';
import Section from './components/Section';
import styles from './index.module.scss';

type IconComponent = typeof BarGraphIcon;

type SidebarItem = { key: string; Icon: IconComponent; path: string };
type SidebarSection = { key: string; items: SidebarItem[] };

const sections: SidebarSection[] = [
  {
    key: 'overview',
    items: [{ key: 'dashboard', Icon: BarGraphIcon, path: '/dashboard' }],
  },
  {
    key: 'tenant',
    items: [
      { key: 'applications', Icon: BoxIcon, path: '/applications' },
      { key: 'members', Icon: OrganizationIcon, path: '/members' },
      { key: 'audit_logs', Icon: ListIcon, path: '/audit-logs' },
      { key: 'org_settings', Icon: GearIcon, path: '/settings' },
    ],
  },
];

export default function ConsoleSidebar() {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console.tab_sections' });
  const { match } = useTenantPathname();

  return (
    <div className={styles.sidebar}>
      <OverlayScrollbar className={styles.menu}>
        <div className={styles.menuContent}>
          {sections.map(({ key, items }) => (
            <Section key={key} title={t(key)}>
              {items.map(({ key: itemKey, Icon, path }) => (
                <Item
                  key={itemKey}
                  titleKey={itemKey}
                  icon={<Icon />}
                  path={path}
                  isActive={match(path)}
                />
              ))}
            </Section>
          ))}
        </div>
      </OverlayScrollbar>
    </div>
  );
}
