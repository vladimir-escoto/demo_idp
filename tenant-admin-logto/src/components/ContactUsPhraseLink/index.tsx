import { contactEmailLink } from '@/consts';

/** Simplified: plain mailto link (the cloud version opens a contact modal). */
export default function ContactUsPhraseLink({
  children,
}: {
  readonly children?: React.ReactNode;
}) {
  return <a href={contactEmailLink}>{children}</a>;
}
