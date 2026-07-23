'use client';

import { type ReactNode } from 'react';

import ConsoleSidebar from '@/components/ConsoleSidebar';
import Topbar from '@/components/Topbar';
import OverlayScrollbar from '@/ds-components/OverlayScrollbar';

import appStyles from './app-content.module.scss';
import contentStyles from './console-content.module.scss';

type Props = {
  readonly orgName: string;
  readonly userDisplay: string;
  readonly onSignOut: () => Promise<void>;
  readonly children: ReactNode;
};

/** Clone of the console's AppContent/ConsoleContent shell (same SCSS). */
export default function ConsoleShell({ orgName, userDisplay, onSignOut, children }: Props) {
  return (
    <div className={appStyles.app}>
      <Topbar orgName={orgName} userDisplay={userDisplay} onSignOut={onSignOut} />
      <div className={contentStyles.content}>
        <ConsoleSidebar />
        <OverlayScrollbar className={contentStyles.overlayScrollbarWrapper}>
          <div className={contentStyles.main}>{children}</div>
        </OverlayScrollbar>
      </div>
    </div>
  );
}
