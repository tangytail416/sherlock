import { NextRequest, NextResponse } from 'next/server';
import { createSplunkClient } from '@/lib/splunk/client';

// POST /api/splunk-config/test - Test Splunk connection
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { host, port, scheme, username, password, apiToken } = body;

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

    // Create a temporary Splunk client with the provided config
    const splunkClient = createSplunkClient({
      host,
      port: port || 8089,
      scheme: scheme || 'https',
      username: username || undefined,
      password: password || undefined,
      token: apiToken || undefined,
    });

    // Test connection using the dedicated test method
    const result = await splunkClient.testConnection();

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        version: result.version,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.message,
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error('Error testing Splunk connection:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Unexpected error during connection test',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
