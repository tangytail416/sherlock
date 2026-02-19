import { InvestigationConversationView } from '@/components/investigations/conversation-view-compact';

export default async function InvestigationBetaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <InvestigationConversationView id={id} />;
}
