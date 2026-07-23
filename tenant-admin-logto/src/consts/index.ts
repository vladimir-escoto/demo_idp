export * from './env';
export * from './logs';
export * from './oidc';
export * from './page-tabs';
export * from './external-links';

export const storageKeys = Object.freeze({
  appearanceMode: 'logto:tenant_admin:appearance_mode',
} as const);

export const requestTimeout = 20_000;

export const defaultPageSize = 20;
