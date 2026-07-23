import { type NextRequest, NextResponse } from 'next/server';

import { managementFetch, managementJson } from '@/lib/management';
import { getTenantSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Security proxy in front of the Logto Management API.
 *
 * The Management API is global; this proxy is what scopes the portal to the
 * signed-in admin's organization:
 *  - session (and `orgadmin` role) is required for every call;
 *  - `/api/organizations/{id}/...` paths must match the session org;
 *  - applications are "owned" by an org through `customData.orgId`, injected
 *    on create and verified on every read/write;
 *  - audit logs are filtered to the org's members and applications;
 *  - dashboard metrics are computed org-scoped (the upstream endpoint is
 *    global-only).
 * Anything not explicitly allowed is a 404.
 */

type Json = Record<string, unknown>;

type AppRow = {
  id: string;
  name: string;
  type: string;
  customData?: { orgId?: string };
  isThirdParty?: boolean;
};

type UserRow = {
  id: string;
  username?: string;
  primaryEmail?: string;
  createdAt?: number;
  lastSignInAt?: number;
};

const ALLOWED_APP_TYPES = new Set(['SPA', 'Native', 'Traditional', 'MachineToMachine']);

const jsonError = (status: number, code: string, message: string) =>
  NextResponse.json({ code, message }, { status });

/** Forwards a Management API response, keeping pagination headers. */
const forward = async (
  path: string,
  init?: Parameters<typeof managementFetch>[1]
): Promise<NextResponse> => {
  const upstream = await managementFetch(path, init);
  const body = await upstream.text();
  const headers = new Headers();
  const contentType = upstream.headers.get('content-type');
  const totalNumber = upstream.headers.get('total-number');
  if (contentType) headers.set('content-type', contentType);
  if (totalNumber) headers.set('total-number', totalNumber);
  // 204/205/304 must not carry a body (Response constructor throws otherwise).
  if ([204, 205, 304].includes(upstream.status)) {
    return new NextResponse(null, { status: upstream.status, headers });
  }
  return new NextResponse(body, { status: upstream.status, headers });
};

const pick = (source: Json, keys: string[]): Json =>
  Object.fromEntries(Object.entries(source).filter(([key]) => keys.includes(key)));

/** 30s cache of the org's member ids and app ids (used for log filtering). */
const orgSetsCache = new Map<string, { at: number; memberIds: Set<string>; appIds: Set<string> }>();

const getOrgSets = async (orgId: string) => {
  const cached = orgSetsCache.get(orgId);
  if (cached && Date.now() - cached.at < 30_000) {
    return cached;
  }
  const [members, apps] = await Promise.all([
    managementJson<UserRow[]>(`api/organizations/${orgId}/users`),
    managementJson<AppRow[]>('api/applications'),
  ]);
  const entry = {
    at: Date.now(),
    memberIds: new Set(members.map(({ id }) => id)),
    appIds: new Set(apps.filter((app) => app.customData?.orgId === orgId).map(({ id }) => id)),
  };
  orgSetsCache.set(orgId, entry);
  return entry;
};

/** Returns the app when it belongs to the org; otherwise undefined. */
const getOrgApp = async (appId: string, orgId: string): Promise<AppRow | undefined> => {
  const response = await managementFetch(`api/applications/${appId}`);
  if (!response.ok) return undefined;
  const app = (await response.json()) as AppRow;
  return app.customData?.orgId === orgId ? app : undefined;
};

// --- Org-scoped dashboard (computed; upstream /api/dashboard is global) ---

const DAY = 24 * 60 * 60 * 1000;

const startOfDay = (timestamp: number) => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const dashboard = async (orgId: string, segment: string, request: NextRequest) => {
  const users = await managementJson<UserRow[]>(`api/organizations/${orgId}/users`);
  const now = Date.now();
  const today = startOfDay(now);

  if (segment === 'total') {
    return NextResponse.json({ totalUserCount: users.length });
  }

  if (segment === 'new') {
    const createdWithin = (from: number, to: number) =>
      users.filter(({ createdAt }) => createdAt && createdAt >= from && createdAt < to).length;
    const todayCount = createdWithin(today, now + DAY);
    const yesterdayCount = createdWithin(today - DAY, today);
    const last7 = createdWithin(now - 7 * DAY, now + DAY);
    const previous7 = createdWithin(now - 14 * DAY, now - 7 * DAY);
    return NextResponse.json({
      today: { count: todayCount, delta: todayCount - yesterdayCount },
      last7Days: { count: last7, delta: last7 - previous7 },
    });
  }

  if (segment === 'active') {
    // Approximation from lastSignInAt (per-org sign-in aggregates are not
    // exposed by the Management API). Good enough for a self-service portal.
    const activeSince = (from: number, to = now + DAY) =>
      users.filter(
        ({ lastSignInAt }) => lastSignInAt && lastSignInAt >= from && lastSignInAt < to
      ).length;
    const dau = activeSince(today);
    const previousDau = activeSince(today - DAY, today);
    const wau = activeSince(now - 7 * DAY);
    const previousWau = activeSince(now - 14 * DAY, now - 7 * DAY);
    const mau = activeSince(now - 30 * DAY);
    const previousMau = activeSince(now - 60 * DAY, now - 30 * DAY);

    const requestedDate = request.nextUrl.searchParams.get('date');
    const curveEnd = requestedDate ? startOfDay(Date.parse(requestedDate) || now) : today;
    const dauCurve = Array.from({ length: 30 }, (_, index) => {
      const dayStart = curveEnd - (29 - index) * DAY;
      return {
        date: new Date(dayStart).toISOString().slice(0, 10),
        count: activeSince(dayStart, dayStart + DAY),
      };
    });

    return NextResponse.json({
      dau: { count: dau, delta: dau - previousDau },
      wau: { count: wau, delta: wau - previousWau },
      mau: { count: mau, delta: mau - previousMau },
      dauCurve,
    });
  }

  return jsonError(404, 'entity.not_found', 'Unknown dashboard segment.');
};

// --- Audit logs, org-filtered ---

const logs = async (orgId: string, request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const { memberIds, appIds } = await getOrgSets(orgId);

  const applicationId = params.get('applicationId');
  const userId = params.get('userId');

  if (applicationId && !appIds.has(applicationId)) {
    return jsonError(403, 'auth.forbidden', 'Application does not belong to this organization.');
  }
  if (userId && !memberIds.has(userId)) {
    return jsonError(403, 'auth.forbidden', 'User does not belong to this organization.');
  }
  if (applicationId || userId) {
    return forward(`api/logs?${params.toString()}`);
  }

  // No entity filter: fetch a window and filter it down to this org.
  const page = Number(params.get('page') ?? '1');
  const pageSize = Number(params.get('page_size') ?? '20');
  // Logto caps page_size at 100.
  const upstreamParams = new URLSearchParams({ page: '1', page_size: '100' });
  const logKey = params.get('logKey');
  if (logKey) upstreamParams.set('logKey', logKey);

  const window = await managementJson<Array<Json & { payload?: Json }>>(
    `api/logs?${upstreamParams.toString()}`
  );
  const filtered = window.filter((entry) => {
    const payload = entry.payload ?? {};
    const entryUser = typeof payload.userId === 'string' ? payload.userId : undefined;
    const entryApp = typeof payload.applicationId === 'string' ? payload.applicationId : undefined;
    return (entryUser && memberIds.has(entryUser)) || (entryApp && appIds.has(entryApp));
  });
  const start = (page - 1) * pageSize;
  return NextResponse.json(filtered.slice(start, start + pageSize), {
    headers: { 'total-number': String(filtered.length) },
  });
};

// --- Dispatcher ---

const handle = async (request: NextRequest, context: { params: { path: string[] } }) => {
  try {
    return await handleInner(request, context);
  } catch (error) {
    console.error('[tenant-proxy]', error);
    return jsonError(
      502,
      'proxy.upstream_error',
      error instanceof Error ? error.message : 'Upstream request failed.'
    );
  }
};

const handleInner = async (request: NextRequest, { params }: { params: { path: string[] } }) => {
  const session = await getTenantSession();
  if (!session) {
    return jsonError(401, 'auth.unauthorized', 'Sign in required.');
  }
  const { orgId, isOrgAdmin } = session;
  if (!orgId) {
    return jsonError(403, 'auth.forbidden', 'No organization is associated with this account.');
  }
  if (!isOrgAdmin) {
    return jsonError(403, 'auth.forbidden', 'Organization admin role required.');
  }

  const method = request.method.toUpperCase();
  const segments = params.path;
  const path = segments.join('/');
  const search = request.nextUrl.search;

  const readBody = async (): Promise<Json> => {
    try {
      return (await request.json()) as Json;
    } catch {
      return {};
    }
  };

  // Dashboard: api/dashboard/users/{total|new|active}
  if (method === 'GET' && segments[0] === 'api' && segments[1] === 'dashboard') {
    return dashboard(orgId, segments[3] ?? '', request);
  }

  // Audit logs
  if (method === 'GET' && path === 'api/logs') {
    return logs(orgId, request);
  }
  if (method === 'GET' && segments[0] === 'api' && segments[1] === 'logs' && segments.length === 3) {
    const entry = await managementJson<Json & { payload?: Json }>(`api/logs/${segments[2]}`);
    const payload = (entry.payload ?? {}) as Json;
    const { memberIds, appIds } = await getOrgSets(orgId);
    const entryUser = typeof payload.userId === 'string' ? payload.userId : undefined;
    const entryApp = typeof payload.applicationId === 'string' ? payload.applicationId : undefined;
    if ((entryUser && memberIds.has(entryUser)) || (entryApp && appIds.has(entryApp))) {
      return NextResponse.json(entry);
    }
    return jsonError(404, 'entity.not_found', 'Log entry not found.');
  }

  // Organization roles catalog (read-only)
  if (method === 'GET' && path === 'api/organization-roles') {
    return forward(`api/organization-roles${search}`);
  }

  // Sign-in experience (read-only; used for the MFA hint in org settings)
  if (method === 'GET' && path === 'api/sign-in-exp') {
    return forward('api/sign-in-exp');
  }

  // Public OIDC discovery document (used by the endpoints card / guides)
  if (method === 'GET' && path === 'oidc/.well-known/openid-configuration') {
    return forward('oidc/.well-known/openid-configuration');
  }

  // Organization-scoped paths: api/organizations/{id}/...
  if (segments[0] === 'api' && segments[1] === 'organizations') {
    const requestedOrg = segments[2];
    if (requestedOrg !== orgId) {
      return jsonError(403, 'auth.forbidden', 'Cross-organization access is not allowed.');
    }
    const rest = segments.slice(3).join('/');

    if (method === 'GET') {
      return forward(`${path}${search}`);
    }
    if (method === 'PATCH' && rest === '') {
      const body = pick(await readBody(), [
        'name',
        'description',
        'branding',
        'color',
        'isMfaRequired',
      ]);
      return forward(path, { method, body });
    }
    if (
      (method === 'POST' && rest === 'users') ||
      (method === 'PUT' && /^users\/[^/]+\/roles$/.test(rest)) ||
      (method === 'POST' && /^users\/[^/]+\/roles$/.test(rest)) ||
      (method === 'DELETE' && /^users\/[^/]+$/.test(rest))
    ) {
      const body = method === 'DELETE' ? undefined : await readBody();
      return forward(path, { method, body });
    }
    return jsonError(404, 'entity.not_found', 'Route not allowed.');
  }

  // Org member profile (read-only; only members of this organization)
  if (method === 'GET' && segments[0] === 'api' && segments[1] === 'users' && segments.length === 3) {
    const { memberIds } = await getOrgSets(orgId);
    if (!memberIds.has(segments[2])) {
      return jsonError(404, 'entity.not_found', 'User not found in this organization.');
    }
    return forward(path);
  }

  // Add member by exact identifier (portal-specific; avoids exposing the
  // global user directory to org admins).
  if (method === 'POST' && path === 'api/org-members') {
    const { identifier, organizationRoleIds } = (await readBody()) as {
      identifier?: string;
      organizationRoleIds?: string[];
    };
    if (!identifier) {
      return jsonError(400, 'request.invalid_input', 'identifier is required.');
    }
    const matches = await managementJson<UserRow[]>(
      `api/users?search=${encodeURIComponent(identifier)}`
    );
    const user = matches.find(
      ({ username, primaryEmail }) => username === identifier || primaryEmail === identifier
    );
    if (!user) {
      return jsonError(404, 'entity.not_found', 'No user found with that username or email.');
    }
    const addResponse = await managementFetch(`api/organizations/${orgId}/users`, {
      method: 'POST',
      body: { userIds: [user.id] },
    });
    if (!addResponse.ok && addResponse.status !== 422) {
      // 422 = already a member; treat as OK so roles can still be assigned.
      return jsonError(addResponse.status, 'request.failed', 'Could not add the user.');
    }
    if (organizationRoleIds?.length) {
      await managementFetch(`api/organizations/${orgId}/users/${user.id}/roles`, {
        method: 'PUT',
        body: { organizationRoleIds },
      });
    }
    orgSetsCache.delete(orgId);
    return NextResponse.json({ id: user.id });
  }

  // Applications hub (org ownership via customData.orgId)
  if (segments[0] === 'api' && segments[1] === 'applications') {
    const appId = segments[2];

    if (method === 'GET' && !appId) {
      const upstream = await managementJson<AppRow[]>(`api/applications${search}`);
      const scoped = upstream.filter((app) => app.customData?.orgId === orgId);
      return NextResponse.json(scoped, {
        headers: { 'total-number': String(scoped.length) },
      });
    }

    if (method === 'POST' && !appId) {
      const body = await readBody();
      const type = typeof body.type === 'string' ? body.type : '';
      if (!ALLOWED_APP_TYPES.has(type)) {
        return jsonError(400, 'request.invalid_input', 'Unsupported application type.');
      }
      const payload = {
        ...pick(body, ['name', 'description', 'type', 'oidcClientMetadata', 'customClientMetadata']),
        customData: { orgId },
      };
      orgSetsCache.delete(orgId);
      return forward('api/applications', { method: 'POST', body: payload });
    }

    if (appId) {
      const app = await getOrgApp(appId, orgId);
      if (!app) {
        return jsonError(404, 'entity.not_found', 'Application not found.');
      }
      const rest = segments.slice(3).join('/');

      if (method === 'GET') {
        return forward(`${path}${search}`);
      }
      if (method === 'PATCH' && rest === '') {
        const body = pick(await readBody(), [
          'name',
          'description',
          'oidcClientMetadata',
          'customClientMetadata',
        ]);
        return forward(path, { method, body });
      }
      if (method === 'DELETE' && rest === '') {
        orgSetsCache.delete(orgId);
        return forward(path, { method });
      }
      if (rest === 'secrets' && (method === 'GET' || method === 'POST')) {
        const body = method === 'POST' ? await readBody() : undefined;
        return forward(`${path}${search}`, { method, body });
      }
      if (/^secrets\/[^/]+$/.test(rest) && method === 'DELETE') {
        return forward(path, { method });
      }
    }
    return jsonError(404, 'entity.not_found', 'Route not allowed.');
  }

  return jsonError(404, 'entity.not_found', 'Route not allowed.');
};

export {
  handle as GET,
  handle as POST,
  handle as PATCH,
  handle as PUT,
  handle as DELETE,
};
