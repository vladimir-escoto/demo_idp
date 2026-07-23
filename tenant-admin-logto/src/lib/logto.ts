import { UserScope } from '@logto/next';

export const logtoConfig = {
  endpoint: process.env.LOGTO_ENDPOINT ?? 'https://logto.idp.tripleenable.com/',
  appId: process.env.LOGTO_APP_ID ?? '',
  appSecret: process.env.LOGTO_APP_SECRET ?? '',
  baseUrl: process.env.LOGTO_BASE_URL ?? 'http://localhost:3000',
  cookieSecret: process.env.LOGTO_COOKIE_SECRET ?? '',
  cookieSecure: process.env.NODE_ENV === 'production',
  scopes: [
    UserScope.Email,
    UserScope.Organizations,
    UserScope.OrganizationRoles,
  ],
};
