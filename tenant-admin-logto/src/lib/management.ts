/**
 * Server-side client for the Logto Management API using the M2M app
 * (client_credentials). The access token is cached in module scope and
 * refreshed one minute before expiry. Credentials never reach the browser.
 */

const endpoint = process.env.LOGTO_ENDPOINT ?? 'https://logto.idp.tripleenable.com/';
const clientId = process.env.LOGTO_M2M_CLIENT_ID ?? '';
const clientSecret = process.env.LOGTO_M2M_CLIENT_SECRET ?? '';
const resource = process.env.LOGTO_MANAGEMENT_API_RESOURCE ?? 'https://default.logto.app/api';

let tokenCache: { token: string; expiresAt: number } | undefined;

export async function getManagementToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const response = await fetch(new URL('oidc/token', endpoint), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource,
      scope: 'all',
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`M2M token request failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return tokenCache.token;
}

/** Performs a Management API request. `path` is like `api/organizations/x/users?a=b`. */
export async function managementFetch(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<Response> {
  const token = await getManagementToken();
  const { method = 'GET', body, headers = {} } = init;

  return fetch(new URL(path, endpoint), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
}

/** Convenience JSON helper that throws on non-2xx. */
export async function managementJson<T>(
  path: string,
  init?: Parameters<typeof managementFetch>[1]
): Promise<T> {
  const response = await managementFetch(path, init);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Management API ${init?.method ?? 'GET'} ${path} failed (${response.status}): ${body.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}
