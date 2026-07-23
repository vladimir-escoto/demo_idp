'use client';

/**
 * Simplified replacement of the console's AppError (which depends on
 * @logto/react sign-out): renders the request error inside the layout.
 */
type Props = {
  readonly title?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly callStack?: string;
  readonly children?: React.ReactNode;
};

export default function AppError({ title, errorCode, errorMessage, callStack }: Props) {
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ font: 'var(--font-title-2)', color: 'var(--color-text)' }}>
        {title ?? 'Something went wrong'}
      </h2>
      <p style={{ font: 'var(--font-body-2)', color: 'var(--color-text-secondary)' }}>
        {[errorCode, errorMessage].filter(Boolean).join(': ')}
      </p>
      {callStack ? (
        <details style={{ marginTop: 16, color: 'var(--color-text-secondary)' }}>
          <summary>Call stack</summary>
          <pre style={{ whiteSpace: 'pre-wrap', font: 'var(--font-body-3)' }}>{callStack}</pre>
        </details>
      ) : null}
    </div>
  );
}
