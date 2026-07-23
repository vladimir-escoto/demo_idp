// @ts-nocheck — vendored from logto-io/logto packages/console (typechecked upstream)
import {
  ApplicationType,
  type ApplicationResponse,
  type SnakeCaseOidcConfig,
} from '@logto/schemas';
import { condArray } from '@silverhand/essentials';
import { useCallback, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { Trans, useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import Delete from '@/assets/icons/delete.svg?react';
import File from '@/assets/icons/file.svg?react';
import ApplicationIcon from '@/components/ApplicationIcon';
import DetailsForm from '@/components/DetailsForm';
import DetailsPageHeader from '@/components/DetailsPage/DetailsPageHeader';
import Drawer from '@/components/Drawer';
import UnsavedChangesAlertModal from '@/components/UnsavedChangesAlertModal';
import { ApplicationDetailsTabs, logtoThirdPartyGuideLink, protectedApp } from '@/consts';
import DeleteConfirmModal from '@/ds-components/DeleteConfirmModal';
import TabNav, { TabNavItem } from '@/ds-components/TabNav';
import TabWrapper from '@/ds-components/TabWrapper';
import useApi from '@/hooks/use-api';
import useDocumentationUrl from '@/hooks/use-documentation-url';
import useTenantPathname from '@/hooks/use-tenant-pathname';
import { applicationTypeI18nKey } from '@/types/applications';
import { trySubmitSafe } from '@/utils/form';

import BackchannelLogout from './BackchannelLogout';
import ConcurrentDeviceLimit from './ConcurrentDeviceLimit';
import EndpointsAndCredentials, { type ApplicationSecretRow } from './EndpointsAndCredentials';
import GuideDrawer from './GuideDrawer';
import RefreshTokenSettings from './RefreshTokenSettings';
import Settings from './Settings';
import TokenExchangeSettings from './TokenExchangeSettings';
import styles from './index.module.scss';
import { applicationFormDataParser, type ApplicationForm } from './utils';

type Props = {
  readonly data: ApplicationResponse;
  readonly secrets: ApplicationSecretRow[];
  readonly oidcConfig: SnakeCaseOidcConfig;
  readonly onApplicationUpdated: (application?: ApplicationResponse) => void | Promise<void>;
};

function ApplicationDetailsContent({ data, secrets, oidcConfig, onApplicationUpdated }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const { tab } = useParams();
  const { navigate } = useTenantPathname();
  const { getDocumentationUrl } = useDocumentationUrl();

  const formMethods = useForm<ApplicationForm>({
    defaultValues: applicationFormDataParser.fromResponse(data),
    mode: 'onBlur',
  });

  const {
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty },
  } = formMethods;

  const [isReadmeOpen, setIsReadmeOpen] = useState(false);
  const [isDeleteFormOpen, setIsDeleteFormOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const api = useApi();
  // Branding / permissions / access-control tabs are identity-admin surfaces
  // and are intentionally not exposed in the tenant portal.

  const onSubmit = handleSubmit(
    trySubmitSafe(async (formData) => {
      if (isSubmitting) {
        return;
      }

      const json = applicationFormDataParser.toRequestPayload(formData);

      const updatedData = await api
        .patch(`api/applications/${data.id}`, {
          json,
        })
        .json<ApplicationResponse>();

      reset(applicationFormDataParser.fromResponse(updatedData));
      await onApplicationUpdated(updatedData);
      toast.success(t('general.saved'));
    })
  );

  const onDelete = async () => {
    setIsDeleting(true);
    try {
      await api.delete(`api/applications/${data.id}`);
      setIsDeleted(true);
      setIsDeleteFormOpen(false);
      toast.success(t('application_details.application_deleted', { name: data.name }));
      navigate(`/applications${data.isThirdParty ? '/third-party-applications' : ''}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const onCloseDrawer = () => {
    // The guide drawer may have updated the application data
    void onApplicationUpdated();
    setIsReadmeOpen(false);
  };

  return (
    <>
      <DetailsPageHeader
        icon={
          <ApplicationIcon
            type={data.type}
            isThirdParty={data.isThirdParty}
            isDeviceFlow={data.customClientMetadata.isDeviceFlow}
          />
        }
        title={data.name}
        primaryTag={condArray(
          data.isThirdParty && t(`${applicationTypeI18nKey.thirdParty}.title`),
          t(`${applicationTypeI18nKey[data.type]}.title`),
          data.customClientMetadata.isDeviceFlow && t('application_details.device_flow_tag')
        )}
        identifier={{ name: 'App ID', value: data.id }}
        additionalActionButton={{
          title: 'application_details.check_guide',
          icon: <File />,
          onClick: () => {
            // Open IdP docs link in new tab if it's a third party app
            if (data.isThirdParty) {
              window.open(getDocumentationUrl(logtoThirdPartyGuideLink), '_blank');
              return;
            }
            // Open protected app docs link in new tab
            if (data.type === ApplicationType.Protected) {
              window.open(getDocumentationUrl(protectedApp), '_blank');
              return;
            }

            setIsReadmeOpen(true);
          },
        }}
        actionMenuItems={[
          {
            type: 'danger',
            title: 'general.delete',
            icon: <Delete />,
            onClick: () => {
              setIsDeleteFormOpen(true);
            },
          },
        ]}
      />
      <Drawer isOpen={isReadmeOpen} onClose={onCloseDrawer}>
        <GuideDrawer app={data} secrets={secrets} onClose={onCloseDrawer} />
      </Drawer>
      <DeleteConfirmModal
        isOpen={isDeleteFormOpen}
        isLoading={isDeleting}
        expectedInput={data.name}
        inputPlaceholder={t('application_details.enter_your_application_name')}
        className={styles.deleteConfirm}
        onCancel={() => {
          setIsDeleteFormOpen(false);
        }}
        onConfirm={onDelete}
      >
        <div className={styles.description}>
          <Trans components={{ span: <span className={styles.highlight} /> }}>
            {t('application_details.delete_description', { name: data.name })}
          </Trans>
        </div>
      </DeleteConfirmModal>
      <TabNav>
        <TabNavItem href={`/applications/${data.id}/${ApplicationDetailsTabs.Settings}`}>
          {t('application_details.settings')}
        </TabNavItem>
      </TabNav>
      <TabWrapper
        isActive={tab === ApplicationDetailsTabs.Settings}
        className={styles.tabContainer}
      >
        <FormProvider {...formMethods}>
          <DetailsForm
            isDirty={isDirty}
            isSubmitting={isSubmitting}
            onDiscard={reset}
            onSubmit={onSubmit}
          >
            <Settings data={data} />
            {data.type !== ApplicationType.Protected && (
              <EndpointsAndCredentials
                app={data}
                oidcConfig={oidcConfig}
                onApplicationUpdated={onApplicationUpdated}
              />
            )}
            {![ApplicationType.MachineToMachine, ApplicationType.Protected].includes(data.type) && (
              <RefreshTokenSettings data={data} />
            )}
            {data.type !== ApplicationType.MachineToMachine && <BackchannelLogout />}
            {data.type !== ApplicationType.Protected && <TokenExchangeSettings data={data} />}
            {![ApplicationType.MachineToMachine, ApplicationType.Protected].includes(data.type) && (
              <ConcurrentDeviceLimit />
            )}
          </DetailsForm>
        </FormProvider>
        {tab === ApplicationDetailsTabs.Settings && (
          <UnsavedChangesAlertModal hasUnsavedChanges={!isDeleted && isDirty} onConfirm={reset} />
        )}
      </TabWrapper>
    </>
  );
}

export default ApplicationDetailsContent;
