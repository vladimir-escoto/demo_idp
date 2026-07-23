'use client';

import { createContext } from 'react';

/**
 * Shim of the console's AppDataProvider: exposes the Logto tenant endpoint to
 * vendored components (endpoints card, guides). Value is inlined at build time
 * from NEXT_PUBLIC_LOGTO_ENDPOINT.
 */
type AppData = {
  /** The Logto instance endpoint (issuer base), e.g. https://logto.example.com/ */
  tenantEndpoint?: URL;
};

const endpoint = process.env.NEXT_PUBLIC_LOGTO_ENDPOINT;

export const AppDataContext = createContext<AppData>({
  tenantEndpoint: endpoint ? new URL(endpoint) : undefined,
});
