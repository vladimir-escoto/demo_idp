'use client';

/**
 * Portal-specific replacement of the console's AddMembersToOrganization.
 * The console modal browses the GLOBAL user directory (fine for a super
 * admin, wrong for a B2B org admin), so this version adds members by exact
 * username/email through the proxy's `api/org-members` endpoint.
 */
import { type Organization, type OrganizationRole } from '@logto/schemas';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import ReactModal from 'react-modal';
import useSWR from 'swr';

import Button from '@/ds-components/Button';
import DangerousRaw from '@/ds-components/DangerousRaw';
import FormField from '@/ds-components/FormField';
import ModalLayout from '@/ds-components/ModalLayout';
import Select from '@/ds-components/Select';
import TextInput from '@/ds-components/TextInput';
import useApi, { type RequestError } from '@/hooks/use-api';
import modalStyles from '@/scss/modal.module.scss';

type Props = {
  readonly organization: Organization;
  readonly isOpen: boolean;
  readonly onClose: () => void;
};

function AddMembersToOrganization({ organization, isOpen, onClose }: Props) {
  const { t } = useTranslation(undefined, { keyPrefix: 'admin_console' });
  const api = useApi();
  const [identifier, setIdentifier] = useState('');
  const [roleId, setRoleId] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: roles } = useSWR<OrganizationRole[], RequestError>('api/organization-roles');

  const submit = async () => {
    if (!identifier || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post('api/org-members', {
        json: { identifier, organizationRoleIds: roleId ? [roleId] : [] },
      });
      toast.success(t('general.saved'));
      setIdentifier('');
      setRoleId(undefined);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ReactModal
      isOpen={isOpen}
      className={modalStyles.content}
      overlayClassName={modalStyles.overlay}
      onRequestClose={onClose}
    >
      <ModalLayout
        title="organization_details.add_members_to_organization"
        subtitle={
          <DangerousRaw>
            Enter the exact username or email of an existing account to add it to “
            {organization.name}”.
          </DangerousRaw>
        }
        footer={
          <Button
            type="primary"
            title="general.add"
            isLoading={isSubmitting}
            disabled={!identifier}
            onClick={() => {
              void submit();
            }}
          />
        }
        onClose={onClose}
      >
        <FormField isRequired title="general.name">
          <TextInput
            placeholder="username or email@company.com"
            value={identifier}
            onChange={({ currentTarget }) => {
              setIdentifier(currentTarget.value);
            }}
          />
        </FormField>
        <FormField title="organization_details.roles">
          <Select
            isClearable
            options={(roles ?? []).map(({ id, name }) => ({ value: id, title: name }))}
            value={roleId}
            onChange={(value) => {
              setRoleId(value);
            }}
          />
        </FormField>
      </ModalLayout>
    </ReactModal>
  );
}

export default AddMembersToOrganization;
