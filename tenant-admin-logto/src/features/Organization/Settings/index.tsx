// @ts-nocheck — vendored from logto-io/logto packages/console (typechecked upstream)
import { type Organization, type SignInExperience } from '@logto/schemas';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { Trans, useTranslation } from 'react-i18next';
import { useOrgOutletContext } from '../context';
import useSWR from 'swr';

import DetailsForm from '@/components/DetailsForm';
import FormCard from '@/components/FormCard';
import UnsavedChangesAlertModal from '@/components/UnsavedChangesAlertModal';
import { organizationsFeatureLink } from '@/consts';
import CodeEditor from '@/ds-components/CodeEditor';
import FormField from '@/ds-components/FormField';
import InlineNotification from '@/ds-components/InlineNotification';
import Switch from '@/ds-components/Switch';
import TextInput from '@/ds-components/TextInput';
import TextLink from '@/ds-components/TextLink';
import useApi, { type RequestError } from '@/hooks/use-api';
import { trySubmitSafe } from '@/utils/form';
import { isJsonObject } from '@/utils/json';

import { type OrganizationDetailsOutletContext } from '../types';
import { assembleData, normalizeData, type FormData } from '../utils';

import styles from './index.module.scss';

function Settings() {
  const { isDeleting, data, jit, onUpdated } = useOrgOutletContext();
  const { data: signInExperience } = useSWR<SignInExperience, RequestError>('api/sign-in-exp');
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const form = useForm<FormData>({
    defaultValues: normalizeData(data, {
      emailDomains: jit.emailDomains.map(({ emailDomain }) => emailDomain),
      roles: jit.roles.map(({ id, name }) => ({ value: id, title: name })),
      ssoConnectorIds: jit.ssoConnectorIds,
    }),
  });
  const {
    register,
    reset,
    control,
    handleSubmit,
    formState: { isDirty, isSubmitting, errors },
    watch,
  } = form;
  const [isMfaRequired] = watch(['isMfaRequired']);
  const api = useApi();

  const onSubmit = handleSubmit(
    trySubmitSafe(async (data) => {
      if (isSubmitting) {
        return;
      }

      // JIT provisioning stays out of the tenant portal scope (identity-admin
      // concern); only the org profile is patched here.
      const updatedData = await api
        .patch(`api/organizations/${data.id}`, {
          json: assembleData(data),
        })
        .json<Organization>();

      reset(normalizeData(updatedData, { emailDomains: [], roles: [], ssoConnectorIds: [] }));
      toast.success(t('general.saved'));
      onUpdated(updatedData);
    })
  );

  return (
    <DetailsForm
      isDirty={isDirty}
      isSubmitting={isSubmitting}
      onDiscard={reset}
      onSubmit={onSubmit}
    >
      <FormCard
        title="general.settings_nav"
        description="organization_details.settings_description"
        learnMoreLink={{ href: organizationsFeatureLink }}
      >
        <FormField isRequired title="general.name">
          <TextInput
            placeholder={t('organization_details.name_placeholder')}
            error={Boolean(errors.name)}
            {...register('name', { required: true })}
          />
        </FormField>
        <FormField title="general.description">
          <TextInput
            placeholder={t('organization_details.description_placeholder')}
            {...register('description')}
          />
        </FormField>
        <FormField
          title="organization_details.custom_data"
          tip={t('organization_details.custom_data_tip')}
        >
          <Controller
            name="customData"
            control={control}
            rules={{
              validate: (value) =>
                isJsonObject(value ?? '') ? true : t('organization_details.invalid_json_object'),
            }}
            render={({ field }) => (
              <CodeEditor language="json" {...field} error={errors.customData?.message} />
            )}
          />
        </FormField>
        <FormField title="organization_details.mfa.title" tip={t('organization_details.mfa.tip')}>
          <Switch
            label={t('organization_details.mfa.description')}
            {...register('isMfaRequired')}
          />
          {isMfaRequired && signInExperience?.mfa.factors.length === 0 && (
            <InlineNotification severity="alert" className={styles.mfaWarning}>
              <Trans i18nKey="admin_console.organization_details.mfa.no_mfa_warning" />
            </InlineNotification>
          )}
        </FormField>
      </FormCard>
      <UnsavedChangesAlertModal hasUnsavedChanges={!isDeleting && isDirty} />
    </DetailsForm>
  );
}

export default Settings;
