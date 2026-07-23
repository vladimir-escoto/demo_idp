'use client';

import Button from '@/ds-components/Button';
import Card from '@/ds-components/Card';
import CardTitle from '@/ds-components/CardTitle';
import Spacer from '@/ds-components/Spacer';

/** Temporary smoke-test page; replaced by the console shell + dashboard. */
export default function Home() {
  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <Card>
        <CardTitle title="general.settings_nav" subtitle="general.loading" />
        <Spacer />
        <Button title="general.create" type="primary" size="large" onClick={() => {}} />
      </Card>
    </div>
  );
}
