import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AlertsTable } from '@/components/alerts/alerts-table';
import { prisma } from '@/lib/db';

async function getAlerts() {
  try {
    const alerts = await prisma.alert.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100,
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

export default async function AlertsPage() {
  const alerts = await getAlerts();

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

      <AlertsTable alerts={alerts} />
      </div>
    </div>
  );
}
