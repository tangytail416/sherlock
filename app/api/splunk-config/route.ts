import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/splunk-config - Get Splunk configuration
export async function GET() {
  try {
    const config = await prisma.splunkConfig.findFirst({
      where: { isActive: true },
    });

    return NextResponse.json({ config });
  } catch (error: any) {
    console.error('Error fetching Splunk config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Splunk configuration' },
      { status: 500 }
    );
  }
}

// POST /api/splunk-config - Create or update Splunk configuration
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { host, port, scheme, username, password, apiToken, excludedIndexes } = body;

    // Validation
    if (!host) {
      return NextResponse.json(
        { error: 'Host is required' },
        { status: 400 }
      );
    }

    if (!apiToken && (!username || !password)) {
      return NextResponse.json(
        { error: 'Either API token or username/password is required' },
        { status: 400 }
      );
    }

    // Deactivate existing configs
    await prisma.splunkConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    // Create new config
    const config = await prisma.splunkConfig.create({
      data: {
        host,
        port: port || 8089,
        scheme: scheme || 'https',
        username: username || null,
        password: password || null,
        apiToken: apiToken || null,
        excludedIndexes: excludedIndexes || '_*',
        isActive: true,
      },
    });

    // Return config without sensitive data
    const safeConfig = {
      ...config,
      password: config.password ? '********' : null,
      apiToken: config.apiToken ? '********' : null,
    };

    return NextResponse.json({ config: safeConfig }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating Splunk config:', error);
    return NextResponse.json(
      { error: 'Failed to create Splunk configuration', details: error.message },
      { status: 500 }
    );
  }
}
