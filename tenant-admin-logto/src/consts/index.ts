export * from './env';

export const storageKeys = Object.freeze({
  appearanceMode: 'logto:tenant_admin:appearance_mode',
} as const);

export const requestTimeout = 20_000;

export const defaultPageSize = 20;

export const contactEmailLink = 'mailto:contact@logto.io';
