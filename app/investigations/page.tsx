import { prisma } from '@/lib/db';
import { InvestigationsFilters } from '@/components/investigations/investigations-filters';

async function getInvestigations() {
  try {
    const investigations = await prisma.investigation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        alert: {
          select: {
            id: true,
            title: true,
            severity: true,
            source: true,
          },
        },
        agentExecutions: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });
    return investigations;
  } catch (error) {
    console.error('Error fetching investigations:', error);
    return [];
  }
}

export default async function InvestigationsPage() {
  const investigations = await getInvestigations();

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">Investigations</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Track and manage AI-powered security investigations
            </p>
          </div>
        </div>

        <InvestigationsFilters investigations={investigations} />
      </div>
    </div>
  );
}
