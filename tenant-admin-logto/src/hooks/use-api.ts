'use client';

import ky from 'ky';
import { useMemo } from 'react';
import { toast } from 'react-hot-toast';

import { requestTimeout } from '@/consts';

export type RequestErrorBody = { code: string; message: string; details?: string };

export class RequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body?: RequestErrorBody
  ) {
    super('Request error occurred.');
  }
}

export type StaticApiProps = {
  hideErrorToast?: boolean | string[];
  timeout?: number;
  signal?: AbortSignal;
};

/**
 * Ky instance hitting this portal's own `/api/tenant/*` proxy. The proxy holds
 * the M2M credentials server-side and scopes every call to the session's
 * organization, so resources keep the console's original shape
 * (e.g. `api/organizations/xxx/users`).
 */
const useApi = ({ hideErrorToast, timeout = requestTimeout, signal }: StaticApiProps = {}) => {
  const disableGlobalErrorHandling = hideErrorToast === true;
  const toastDisabledErrorCodes = Array.isArray(hideErrorToast) ? hideErrorToast : undefined;

  return useMemo(
    () =>
      ky.create({
        prefixUrl: '/api/tenant/',
        timeout,
        signal,
        hooks: {
          beforeError: [
            (error) => {
              if (disableGlobalErrorHandling) {
                return error;
              }
              void (async () => {
                try {
                  const data = (await error.response.clone().json()) as RequestErrorBody;
                  if (toastDisabledErrorCodes?.includes(data.code)) {
                    return;
                  }
                  toast.error([data.message, data.details].filter(Boolean).join('\n'));
                } catch {
                  toast.error(`Request error (status ${error.response.status})`);
                }
              })();
              return error;
            },
          ],
        },
      }),
    [disableGlobalErrorHandling, toastDisabledErrorCodes, timeout, signal]
  );
};

export default useApi;
