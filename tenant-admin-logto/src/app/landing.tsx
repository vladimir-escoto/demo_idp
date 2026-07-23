'use client';

import Button from '@/ds-components/Button';
import Card from '@/ds-components/Card';
import DangerousRaw from '@/ds-components/DangerousRaw';
import InlineNotification from '@/ds-components/InlineNotification';

import styles from './landing.module.scss';

type Props = {
  readonly hasSessionWithoutOrg: boolean;
  readonly onSignIn: () => Promise<void>;
};

export default function Landing({ hasSessionWithoutOrg, onSignIn }: Props) {
  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <div className={styles.brand}>Tripleenable</div>
        <h1 className={styles.title}>Tenant Admin Dashboard</h1>
        <p className={styles.subtitle}>
          Manage your organization&apos;s applications, members, branding, and audit logs — powered
          by Logto.
        </p>
        {hasSessionWithoutOrg ? (
          <InlineNotification severity="alert">
            <DangerousRaw>
              Your account is not a member of any organization. Ask your identity administrator to
              add you to one.
            </DangerousRaw>
          </InlineNotification>
        ) : null}
        <Button
          size="large"
          type="branding"
          title={<DangerousRaw>Sign in with Logto</DangerousRaw>}
          onClick={() => {
            void onSignIn();
          }}
        />
      </Card>
    </div>
  );
}
