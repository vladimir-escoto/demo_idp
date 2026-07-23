import { getLogtoContext } from '@logto/next/server-actions';
import { cookies } from 'next/headers';

import { logtoConfig } from './logto';

export const ORG_COOKIE = 'tenant_admin_org';

export type TenantSession = {
  userId: string;
  name?: string;
  email?: string;
  /** Organizations the user belongs to (ids from the ID token claims). */
  organizations: string[];
  /** Selected organization for this session (cookie override, validated). */
  orgId?: string;
  /** Whether the user holds the `orgadmin` role in the selected organization. */
  isOrgAdmin: boolean;
};

/**
 * Resolves the signed-in user and their organization context from the Logto
 * session. The org id NEVER comes from client input except as a cookie that is
 * validated against the token's `organizations` claim.
 */
export async function getTenantSession(): Promise<TenantSession | undefined> {
  const { isAuthenticated, claims } = await getLogtoContext(logtoConfig);

  if (!isAuthenticated || !claims) {
    return undefined;
  }

  const organizations = Array.isArray(claims.organizations)
    ? (claims.organizations as string[])
    : [];
  const organizationRoles = Array.isArray(claims.organization_roles)
    ? (claims.organization_roles as string[])
    : [];

  const requested = cookies().get(ORG_COOKIE)?.value;
  const orgId =
    requested && organizations.includes(requested) ? requested : organizations[0];

  return {
    userId: claims.sub,
    name: typeof claims.name === 'string' ? claims.name : undefined,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    organizations,
    orgId,
    isOrgAdmin: Boolean(orgId) && organizationRoles.includes(`${orgId}:orgadmin`),
  };
}
