import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateQueryForm } from '@/components/queries/create-query-form';

export default function NewQueryPage() {
  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/queries">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Query</h1>
          <p className="text-muted-foreground">Add a new Splunk query to your library</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Query Details</CardTitle>
          <CardDescription>
            Create a custom Splunk query to detect threats and suspicious activities.
            This query can be reused in threat hunts and executed on-demand.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateQueryForm />
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
