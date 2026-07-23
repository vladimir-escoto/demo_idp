'use client';

type Props = {
  readonly className?: string;
};

export default function NotFoundContent({ className }: Props) {
  return (
    <div className={className} style={{ padding: 24, color: 'var(--color-text-secondary)' }}>
      Not found.
    </div>
  );
}
