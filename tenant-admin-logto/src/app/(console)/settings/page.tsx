'use client';

import Settings from '@/features/Organization/Settings';

import SettingsTabs from './settings-tabs';

export default function SettingsPage() {
  return (
    <>
      <SettingsTabs />
      <Settings />
    </>
  );
}
