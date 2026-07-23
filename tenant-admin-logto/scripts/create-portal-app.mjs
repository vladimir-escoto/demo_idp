/**
 * One-time bootstrap: creates (or reuses) the portal's own OIDC app in Logto
 * ("Tenant Admin Portal", Traditional Web) and writes its credentials into
 * .env.local. Reads the M2M credentials from .env.local — run from the
 * tenant-admin-logto directory: `node scripts/create-portal-app.mjs`
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP_NAME = 'Tenant Admin Portal';
const REDIRECT_URIS = [
  'http://localhost:3000/callback',
  'https://tenant.idp.tripleenable.com/callback',
];
const POST_LOGOUT_URIS = ['http://localhost:3000/', 'https://tenant.idp.tripleenable.com/'];

const envPath = fileURLToPath(new URL('../.env.local', import.meta.url));
const envText = readFileSync(envPath, 'utf8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()])
);

const endpoint = env.LOGTO_ENDPOINT;

const tokenResponse = await fetch(new URL('oidc/token', endpoint), {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    Authorization: `Basic ${Buffer.from(
      `${env.LOGTO_M2M_CLIENT_ID}:${env.LOGTO_M2M_CLIENT_SECRET}`
    ).toString('base64')}`,
  },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    resource: env.LOGTO_MANAGEMENT_API_RESOURCE,
    scope: 'all',
  }),
});

if (!tokenResponse.ok) {
  console.error('Token request failed:', tokenResponse.status, await tokenResponse.text());
  process.exit(1);
}

const { access_token: token } = await tokenResponse.json();
const api = async (path, init = {}) => {
  const response = await fetch(new URL(path, endpoint), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status}: ${await response.text()}`);
  }
  return response.json();
};

const apps = await api('api/applications');
let app = apps.find(({ name }) => name === APP_NAME);

if (app) {
  console.log(`Found existing "${APP_NAME}" (${app.id}); ensuring redirect URIs.`);
  await api(`api/applications/${app.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      oidcClientMetadata: {
        ...app.oidcClientMetadata,
        redirectUris: [...new Set([...(app.oidcClientMetadata?.redirectUris ?? []), ...REDIRECT_URIS])],
        postLogoutRedirectUris: [
          ...new Set([
            ...(app.oidcClientMetadata?.postLogoutRedirectUris ?? []),
            ...POST_LOGOUT_URIS,
          ]),
        ],
      },
    }),
  });
  app = await api(`api/applications/${app.id}`);
} else {
  app = await api('api/applications', {
    method: 'POST',
    body: JSON.stringify({
      name: APP_NAME,
      type: 'Traditional',
      description: 'B2B tenant admin dashboard (demo_idp/tenant-admin-logto)',
      oidcClientMetadata: {
        redirectUris: REDIRECT_URIS,
        postLogoutRedirectUris: POST_LOGOUT_URIS,
      },
    }),
  });
  console.log(`Created "${APP_NAME}" (${app.id}).`);
}

const nextEnv = envText
  .replace(/^LOGTO_APP_ID=.*$/m, `LOGTO_APP_ID=${app.id}`)
  .replace(/^LOGTO_APP_SECRET=.*$/m, `LOGTO_APP_SECRET=${app.secret}`);
writeFileSync(envPath, nextEnv);
console.log(`.env.local updated with app id ${app.id}.`);
