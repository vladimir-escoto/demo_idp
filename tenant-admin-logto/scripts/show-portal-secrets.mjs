/** Prints the portal app's secrets list (name + value + expiry) for .env setup. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../.env.local', import.meta.url));
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()])
);

const tokenResponse = await fetch(new URL('oidc/token', env.LOGTO_ENDPOINT), {
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
const { access_token: token } = await tokenResponse.json();

const appId = env.LOGTO_APP_ID;
const response = await fetch(new URL(`api/applications/${appId}/secrets`, env.LOGTO_ENDPOINT), {
  headers: { Authorization: `Bearer ${token}` },
});
console.log(JSON.stringify(await response.json(), null, 2));
