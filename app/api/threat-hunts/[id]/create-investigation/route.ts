import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: threatHuntId } = await params;
    const body = await request.json();
    const { findingId } = body;

    if (!findingId) {
      return NextResponse.json({ error: 'Finding ID is required' }, { status: 400 });
    }

    const finding = await prisma.threatHunt.findFirst({
      where: { id: threatHuntId },
      include: {
        findings: {
          where: { id: findingId },
        },
      },
    });

    if (!finding || finding.findings.length === 0) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
    }

    // Get AI provider from threat hunt config
    const config = finding.config as any;
    const aiProvider = config?.aiProvider || 'glm';
    const modelUsed = config?.modelUsed || 'glm-4-plus';

    const f = finding.findings[0] as any;

    if (f.investigationId) {
      return NextResponse.json({ error: 'Investigation already exists' }, { status: 400 });
    }

    // Use existing alert if already present, otherwise create new one
    let alertId = f.alertId;

    if (!alertId) {
      const alert = await prisma.alert.create({
        data: {
          source: 'Threat Hunt',
          severity: f.severity,
          title: `[Threat Hunt] ${f.findingType}: ${f.description.substring(0, 100)}`,
          description: f.description,
          rawData: {
            finding: f,
            threat_hunt_id: threatHuntId,
          } as any,
          status: 'new',
        },
      });
      alertId = alert.id;
    }

    const investigation = await prisma.investigation.create({
      data: {
        alertId: alertId,
        status: 'pending',
        priority: f.severity,
        aiProvider,
        modelUsed,
      },
    });

    // Update the finding with the investigation ID
    await prisma.threatHunt.update({
      where: { id: threatHuntId },
      data: {
        findings: {
          update: {
            where: { id: findingId },
            data: { investigationId: investigation.id },
          },
        },
      },
    });

    return NextResponse.json(investigation, { status: 201 });
  } catch (error) {
    console.error('Error creating investigation from finding:', error);
    return NextResponse.json(
      { error: 'Failed to create investigation' },
      { status: 500 }
    );
  }
}
