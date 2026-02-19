import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateAlertForm } from '@/components/alerts/create-alert-form';

export default function NewAlertPage() {
  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/alerts">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Alert</h1>
          <p className="text-muted-foreground">Manually create a new security alert</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alert Details</CardTitle>
          <CardDescription>
            Enter the details of the security alert. This can be used for manual alert creation
            or testing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateAlertForm />
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
