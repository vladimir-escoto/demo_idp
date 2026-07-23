export * from './env';
export * from './logs';

/** Docs paths used by vendored components (relative to docs.logto.io). */
export const auditLogs = '/developers/audit-logs';
export const organizationsFeatureLink = '/organizations';
export const organizationBrandingLink =
  '/end-user-flows/organization-experience/organization-branding';

export const storageKeys = Object.freeze({
  appearanceMode: 'logto:tenant_admin:appearance_mode',
} as const);

export const requestTimeout = 20_000;

export const defaultPageSize = 20;

export const contactEmailLink = 'mailto:contact@logto.io';
