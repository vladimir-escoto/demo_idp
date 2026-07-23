'use client';

/**
 * Read-only member profile for the tenant portal (the console's full
 * UserDetails is an identity-admin surface). Data comes through the scoped
 * proxy, which only serves users belonging to the session's organization.
 */
import { useParams } from 'next/navigation';
import useSWR from 'swr';

import { LocaleDateTime } from '@/components/DateTime';
import DetailsPage from '@/components/DetailsPage';
import DetailsPageHeader from '@/components/DetailsPage/DetailsPageHeader';
import FormCard from '@/components/FormCard';
import PageMeta from '@/components/PageMeta';
import UserAvatar from '@/components/UserAvatar';
import DangerousRaw from '@/ds-components/DangerousRaw';
import FormField from '@/ds-components/FormField';
import TextInput from '@/ds-components/TextInput';
import { type RequestError } from '@/hooks/use-api';
import { useOrgOutletContext } from '@/features/Organization/context';

type UserProfile = {
  id: string;
  username?: string;
  name?: string;
  primaryEmail?: string;
  primaryPhone?: string;
  avatar?: string;
  createdAt?: number;
  lastSignInAt?: number;
};

type OrgMember = UserProfile & {
  organizationRoles?: Array<{ id: string; name: string }>;
};

export default function MemberProfile() {
  const { id } = useParams<{ id: string }>();
  const { data: organization } = useOrgOutletContext();

  const { data: user, error, mutate } = useSWR<UserProfile, RequestError>(
    id && `api/users/${id}`
  );
  const { data: members } = useSWR<OrgMember[], RequestError>(
    `api/organizations/${organization.id}/users`
  );

  const roles = members?.find((member) => member.id === id)?.organizationRoles ?? [];
  const displayName = user?.name ?? user?.username ?? user?.primaryEmail ?? id;

  return (
    <DetailsPage
      backLink="/members"
      backLinkTitle={<DangerousRaw>Back to members</DangerousRaw>}
      isLoading={!user && !error}
      error={error}
      onRetry={() => {
        void mutate();
      }}
    >
      <PageMeta titleKey="tabs.members" />
      {user && (
        <>
          <DetailsPageHeader
            icon={<UserAvatar size="xlarge" user={user} />}
            title={displayName}
            primaryTag={roles.map(({ name }) => name).join(', ') || 'member'}
            identifier={{ name: 'User ID', value: user.id }}
          />
          <FormCard title="general.settings_nav">
            <FormField title={<DangerousRaw>Name</DangerousRaw>}>
              <TextInput readOnly value={user.name ?? ''} placeholder="-" />
            </FormField>
            <FormField title={<DangerousRaw>Username</DangerousRaw>}>
              <TextInput readOnly value={user.username ?? ''} placeholder="-" />
            </FormField>
            <FormField title={<DangerousRaw>Email</DangerousRaw>}>
              <TextInput readOnly value={user.primaryEmail ?? ''} placeholder="-" />
            </FormField>
            <FormField title={<DangerousRaw>Organization roles</DangerousRaw>}>
              <TextInput
                readOnly
                value={roles.map(({ name }) => name).join(', ')}
                placeholder="-"
              />
            </FormField>
            <FormField title={<DangerousRaw>Created at</DangerousRaw>}>
              <div>
                <LocaleDateTime>{user.createdAt ?? null}</LocaleDateTime>
              </div>
            </FormField>
          </FormCard>
        </>
      )}
    </DetailsPage>
  );
}
