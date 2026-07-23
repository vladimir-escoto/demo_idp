// @ts-nocheck — adapted from logto-io/logto packages/console (pages/Applications):
// third-party / SAML / protected-app surfaces removed for the tenant portal.
import { ApplicationType, type Application } from '@logto/schemas';
import { type Nullable, cond } from '@silverhand/essentials';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import Plus from '@/assets/icons/plus.svg?react';
import ApplicationCreation from '@/components/ApplicationCreation';
import EmptyDataPlaceholder from '@/components/EmptyDataPlaceholder';
import { type SelectedGuide } from '@/components/Guide/GuideCard';
import ApplicationPreview from '@/components/ItemPreview/ApplicationPreview';
import LearnMore from '@/components/LearnMore';
import PageMeta from '@/components/PageMeta';
import { integrateLogto } from '@/consts';
import Button from '@/ds-components/Button';
import CardTitle from '@/ds-components/CardTitle';
import CopyToClipboard from '@/ds-components/CopyToClipboard';
import DynamicT from '@/ds-components/DynamicT';
import Table from '@/ds-components/Table';
import useTenantPathname from '@/hooks/use-tenant-pathname';
import pageLayout from '@/scss/page-layout.module.scss';

import GuideLibrary from './components/GuideLibrary';
import GuideLibraryModal from './components/GuideLibraryModal';
import useApplicationsData from './hooks/use-application-data';
import styles from './index.module.scss';

const applicationsPathname = '/applications';
const createApplicationPathname = `${applicationsPathname}/create`;
const buildDetailsPathname = (id: string) => `${applicationsPathname}/${id}`;

function Applications() {
  const { search } = useLocation();
  const { match, navigate } = useTenantPathname();
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });

  const isCreating = match(createApplicationPathname);
  const [selectedGuide, setSelectedGuide] = useState<Nullable<SelectedGuide>>();

  const { data, error, mutate, pagination, updatePagination } = useApplicationsData(false);

  const isLoading = !data && !error;
  const [applications, totalCount] = data ?? [];

  const onAppCreationCompleted = useCallback(
    (newApp?: Application) => {
      if (newApp) {
        if (selectedGuide === null || selectedGuide?.metadata.skipGuideAfterCreation) {
          navigate(`/applications/${newApp.id}`, { replace: true });
          setSelectedGuide(undefined);
          return;
        }
        if (selectedGuide) {
          navigate(`/applications/${newApp.id}/guide/${selectedGuide.id}`, { replace: true });
          setSelectedGuide(undefined);
          return;
        }
      }
      setSelectedGuide(undefined);
    },
    [navigate, selectedGuide]
  );

  const onCreate = useCallback(() => {
    navigate({
      pathname: createApplicationPathname,
      search,
    });
  }, [navigate, search]);

  return (
    <div className={pageLayout.container}>
      <PageMeta titleKey="applications.title" />
      <div className={pageLayout.headline}>
        <CardTitle
          title="applications.title"
          subtitle={
            <>
              <DynamicT forKey="applications.subtitle" />
              <LearnMore isRelativeDocUrl href={integrateLogto} />
            </>
          }
        />
        {!!totalCount && (
          <Button
            icon={<Plus />}
            type="primary"
            size="large"
            title="applications.create"
            onClick={onCreate}
          />
        )}
      </div>

      {!isLoading && !applications?.length && (
        <div className={styles.guideLibraryContainer}>
          <CardTitle
            className={styles.title}
            title="guide.app.select_framework_or_tutorial"
            subtitle="guide.app.modal_subtitle"
          />
          <GuideLibrary
            hasCardBorder
            hasCardButton
            className={styles.library}
            onSelectGuide={setSelectedGuide}
          />
        </div>
      )}
      {(isLoading || !!applications?.length) && (
        <Table
          isLoading={isLoading}
          className={pageLayout.table}
          rowGroups={[{ key: 'applications', data: applications }]}
          rowIndexKey="id"
          errorMessage={error?.body?.message ?? error?.message}
          placeholder={<EmptyDataPlaceholder />}
          columns={[
            {
              title: t('applications.application_name'),
              dataIndex: 'name',
              colSpan: 6,
              render: (data) => <ApplicationPreview data={data} />,
            },
            {
              title: t('applications.app_id'),
              dataIndex: 'id',
              colSpan: 10,
              render: ({ id }) => <CopyToClipboard value={id} variant="text" />,
            },
          ]}
          rowClickHandler={({ id }) => {
            navigate(buildDetailsPathname(id));
          }}
          pagination={{
            ...pagination,
            totalCount,
            onChange: updatePagination,
          }}
          onRetry={async () => mutate(undefined, true)}
        />
      )}
      <GuideLibraryModal
        isOpen={isCreating}
        onClose={() => {
          navigate(-1);
        }}
        onSelectGuide={setSelectedGuide}
      />
      {selectedGuide !== undefined && (
        <ApplicationCreation
          defaultCreateType={cond(
            selectedGuide?.metadata.target !== 'API' && selectedGuide?.metadata.target
          )}
          defaultCreateFrameworkName={selectedGuide?.metadata.name ?? undefined}
          isDefaultCreateThirdParty={false}
          isDefaultCreateDeviceFlow={false}
          onCompleted={onAppCreationCompleted}
        />
      )}
    </div>
  );
}

export default Applications;
