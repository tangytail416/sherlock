import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertsTable } from '@/components/alerts/alerts-table';
import { prisma } from '@/lib/db';

async function getAlerts(take: number = 20, skip: number = 0) {
  try {
    const alerts = await prisma.alert.findMany({
      orderBy: { timestamp: 'desc' },
      take,
      skip,
      include: {
        investigations: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });
    return alerts;
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return [];
  }
}

async function getTotalCount() {
  try {
    return await prisma.alert.count();
  } catch (error) {
    console.error('Error counting alerts:', error);
    return 0;
  }
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string; offset?: string }>;
}) {
  const params = await searchParams;
  const limit = parseInt(params.limit || '25');
  const offset = parseInt(params.offset || '0');
  const alerts = await getAlerts(limit, offset);
  const totalCount = await getTotalCount();

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">Alerts</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Manage and review security alerts from all sources
          </p>
        </div>
        <Button asChild>
          <Link href="/alerts/new">
            <Plus className="h-4 w-4 mr-2" />
            Create Alert
          </Link>
        </Button>
      </div>

      <AlertsTable 
        alerts={alerts} 
        totalCount={totalCount}
        currentOffset={offset}
        currentLimit={limit}
      />
      </div>
    </div>
  );
}
