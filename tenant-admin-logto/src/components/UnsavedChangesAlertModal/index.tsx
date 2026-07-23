/**
 * Shim: the console version blocks in-app navigation via react-router's
 * useBlocker, which has no Next.js equivalent in this portal. We fall back to
 * the browser-native beforeunload prompt only.
 */
'use client';

import { useEffect } from 'react';

type Props = {
  readonly hasUnsavedChanges: boolean;
  readonly parentPath?: string;
  readonly onConfirm?: () => void;
};

export default function UnsavedChangesAlertModal({ hasUnsavedChanges }: Props) {
  useEffect(() => {
    if (!hasUnsavedChanges) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [hasUnsavedChanges]);

  return null;
}
