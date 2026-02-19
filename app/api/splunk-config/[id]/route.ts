import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/splunk-config/[id] - Get a specific Splunk configuration
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const config = await prisma.splunkConfig.findUnique({
      where: { id: params.id },
    });

    if (!config) {
      return NextResponse.json(
        { error: 'Configuration not found' },
        { status: 404 }
      );
    }

    // Return config without sensitive data
    const safeConfig = {
      ...config,
      password: config.password ? '********' : null,
      apiToken: config.apiToken ? '********' : null,
    };

    return NextResponse.json({ config: safeConfig });
  } catch (error: any) {
    console.error('Error fetching Splunk config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch configuration' },
      { status: 500 }
    );
  }
}

// PATCH /api/splunk-config/[id] - Update Splunk configuration
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const body = await request.json();
    const { host, port, scheme, username, password, apiToken, isActive } = body;

    const existing = await prisma.splunkConfig.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Configuration not found' },
        { status: 404 }
      );
    }

    // If activating this config, deactivate others
    if (isActive === true) {
      await prisma.splunkConfig.updateMany({
        where: { id: { not: params.id } },
        data: { isActive: false },
      });
    }

    const config = await prisma.splunkConfig.update({
      where: { id: params.id },
      data: {
        host: host !== undefined ? host : existing.host,
        port: port !== undefined ? port : existing.port,
        scheme: scheme !== undefined ? scheme : existing.scheme,
        username: username !== undefined ? username : existing.username,
        password: password !== undefined ? password : existing.password,
        apiToken: apiToken !== undefined ? apiToken : existing.apiToken,
        isActive: isActive !== undefined ? isActive : existing.isActive,
      },
    });

    // Return config without sensitive data
    const safeConfig = {
      ...config,
      password: config.password ? '********' : null,
      apiToken: config.apiToken ? '********' : null,
    };

    return NextResponse.json({ config: safeConfig });
  } catch (error: any) {
    console.error('Error updating Splunk config:', error);
    return NextResponse.json(
      { error: 'Failed to update configuration', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/splunk-config/[id] - Delete Splunk configuration
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    await prisma.splunkConfig.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting Splunk config:', error);
    return NextResponse.json(
      { error: 'Failed to delete configuration' },
      { status: 500 }
    );
  }
}
