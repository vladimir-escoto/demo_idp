'use client';

import LogtoLogo from '@/assets/images/logo.svg?react';
import Button from '@/ds-components/Button';
import DangerousRaw from '@/ds-components/DangerousRaw';
import Tag from '@/ds-components/Tag';

import styles from './index.module.scss';

type Props = {
  readonly orgName: string;
  readonly userDisplay: string;
  readonly onSignOut: () => Promise<void>;
};

export default function Topbar({ orgName, userDisplay, onSignOut }: Props) {
  return (
    <div className={styles.topbar}>
      <LogtoLogo className={styles.logo} />
      <div className={styles.line} />
      <div className={styles.text}>Tenant Admin</div>
      <Tag variant="cell">
        <span className={styles.orgName}>{orgName}</span>
      </Tag>
      <div className={styles.user}>
        <span className={styles.email}>{userDisplay}</span>
        <Button
          size="small"
          type="text"
          title={<DangerousRaw>Sign out</DangerousRaw>}
          onClick={() => {
            void onSignOut();
          }}
        />
      </div>
    </div>
  );
}
