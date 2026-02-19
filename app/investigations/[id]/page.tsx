import { InvestigationDetailClient } from '@/components/investigations/investigation-detail-client';

export default async function InvestigationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <InvestigationDetailClient id={id} />;
}
