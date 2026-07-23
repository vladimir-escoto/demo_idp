import { redirect } from 'next/navigation';

export default function ApplicationIndexPage({ params }: { params: { id: string } }) {
  redirect(`/applications/${params.id}/settings`);
}
