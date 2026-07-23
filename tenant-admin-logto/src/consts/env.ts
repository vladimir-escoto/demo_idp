// This portal is always an OSS-style, single-tenant deployment.
export const isCloud = false;
export const isDevFeaturesEnabled = false;
export const isProduction = process.env.NODE_ENV === 'production';
