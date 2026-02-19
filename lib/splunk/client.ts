/**
 * Splunk Client for querying security data
 * Uses Splunk REST API to execute searches
 */

// Disable SSL verification for self-signed certificates (common in Splunk dev envs)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export interface SplunkConfig {
  host: string;
  port?: number;
  username?: string;
  password?: string;
  token?: string;
  scheme?: 'https' | 'http';
}

export interface SplunkSearchOptions {
  search: string;
  earliestTime?: string;
  latestTime?: string;
  maxResults?: number;
  outputMode?: 'json' | 'xml' | 'csv';
}

export interface SplunkSearchResult {
  results: any[];
  messages: any[];
  preview: boolean;
  initOffset: number;
}

export class SplunkClient {
  private config: Required<SplunkConfig>;
  private baseUrl: string;

  constructor(config: SplunkConfig) {
    this.config = {
      host: config.host,
      port: config.port || 8089,
      username: config.username || '',
      password: config.password || '',
      token: config.token || '',
      scheme: config.scheme || 'https',
    };

    this.baseUrl = `${this.config.scheme}://${this.config.host}:${this.config.port}`;
  }

  /**
   * Execute a search query against Splunk
   */
  async search(options: SplunkSearchOptions): Promise<SplunkSearchResult> {
    const {
      search,
      earliestTime = '-24h',
      latestTime = 'now',
      maxResults = 1000,
      outputMode = 'json',
    } = options;

    try {
      // Step 1: Create search job


      console.log('[Splunk] Oneshot search request:');
      console.log(`  Search: ${search}`);
      console.log(`  Earliest: ${options?.earliestTime || '-24h'}`);
      console.log(`  Latest: ${options?.latestTime || 'now'}`);
      console.log(`  Max results: ${options?.maxResults || 1000}`);
      const jobId = await this.createSearchJob({
        search,
        earliestTime,
        latestTime,
      });

      // Step 2: Wait for job to complete
      await this.waitForJob(jobId);

      // Step 3: Get results
      const results = await this.getResults(jobId, maxResults, outputMode);

      return results;
    } catch (error) {
      console.error('Splunk search error:', error);
      throw new Error(`Failed to execute Splunk search: ${error}`);
    }
  }

  /**
   * Test connection to Splunk server
   */
  async testConnection(): Promise<{ success: boolean; message: string; version?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/services/server/info?output_mode=json`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 401) {
          return {
            success: false,
            message: 'Authentication failed. Please check your credentials.',
          };
        }
        const errorText = await response.text().catch(() => response.statusText);
        return {
          success: false,
          message: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const data = await response.json();
      const version = data.entry?.[0]?.content?.version || 'Unknown';

      return {
        success: true,
        message: `Successfully connected to Splunk ${version}`,
        version,
      };
    } catch (error: any) {
      // Handle common network errors
      if (error.cause) {
        const code = error.cause.code;
        const causeMessage = error.cause.message || '';

        if (code === 'ECONNREFUSED') {
          return {
            success: false,
            message: `Connection refused. Please verify the host (${this.config.host}) and port (${this.config.port}) are correct.`,
          };
        }
        if (code === 'ENOTFOUND') {
          return {
            success: false,
            message: `Host not found: ${this.config.host}. Please check the hostname.`,
          };
        }
        if (
          code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
          code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
          code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
          causeMessage.includes('self-signed certificate')
        ) {
          return {
            success: false,
            message: 'SSL certificate verification failed. Self-signed certificates detected. Please either:\n1. Use HTTP instead of HTTPS (set scheme to "http")\n2. Add your certificate to system trust store\n3. Contact your Splunk administrator for a properly signed certificate',
          };
        }
        if (code === 'ETIMEDOUT' || code === 'ECONNRESET') {
          return {
            success: false,
            message: 'Connection timeout. Please check network connectivity and firewall settings.',
          };
        }
      }

      return {
        success: false,
        message: `Connection error: ${error.message || 'Unknown error'}`,
      };
    }
  }

  /**
   * Create a search job in Splunk
   */
  private async createSearchJob(params: {
    search: string;
    earliestTime: string;
    latestTime: string;
  }): Promise<string> {
    const body = new URLSearchParams({
      search: params.search,
      earliest_time: params.earliestTime,
      latest_time: params.latestTime,
      output_mode: 'json',
    });

    const response = await fetch(`${this.baseUrl}/services/search/jobs`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Failed to create search job (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.sid; // Search ID
  }

  /**
   * Wait for search job to complete
   */
  private async waitForJob(jobId: string, maxWait = 60000): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second

    while (Date.now() - startTime < maxWait) {
      const status = await this.getJobStatus(jobId);

      if (status.isDone) {
        return;
      }

      if (status.isFailed) {
        throw new Error('Search job failed');
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error('Search job timed out');
  }

  /**
   * Get status of a search job
   */
  private async getJobStatus(jobId: string): Promise<{
    isDone: boolean;
    isFailed: boolean;
    progress: number;
  }> {
    const response = await fetch(
      `${this.baseUrl}/services/search/jobs/${jobId}?output_mode=json`,
      {
        headers: this.getHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }

    const data = await response.json();
    const entry = data.entry[0];

    return {
      isDone: entry.content.isDone,
      isFailed: entry.content.isFailed,
      progress: parseFloat(entry.content.doneProgress) * 100,
    };
  }

  /**
   * Get results from a completed search job
   */
  private async getResults(
    jobId: string,
    maxResults: number,
    outputMode: string
  ): Promise<SplunkSearchResult> {
    const url = `${this.baseUrl}/services/search/jobs/${jobId}/results?output_mode=${outputMode}&count=${maxResults}`;

    const response = await fetch(url, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get results: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      results: data.results || [],
      messages: data.messages || [],
      preview: data.preview || false,
      initOffset: data.init_offset || 0,
    };
  }

  /**
   * Get HTTP headers for authentication
   */
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    } else if (this.config.username && this.config.password) {
      const credentials = btoa(`${this.config.username}:${this.config.password}`);
      headers['Authorization'] = `Basic ${credentials}`;
    }

    return headers;
  }

  /**
   * Execute a one-shot search (blocking, for simple queries)
   */
  async oneshot(search: string, options?: Partial<SplunkSearchOptions>): Promise<any[]> {
    const url = `${this.baseUrl}/services/search/jobs/oneshot`;
    const body = new URLSearchParams({
      search,
      earliest_time: options?.earliestTime || '-24h',
      latest_time: options?.latestTime || 'now',
      output_mode: options?.outputMode || 'json',
      count: String(options?.maxResults || 1000),
    });

    console.log('[Splunk] Oneshot search request:');
    console.log(`  URL: ${url}`);
    console.log(`  Search: ${search}`);
    console.log(`  Earliest: ${options?.earliestTime || '-24h'}`);
    console.log(`  Latest: ${options?.latestTime || 'now'}`);
    console.log(`  Max results: ${options?.maxResults || 1000}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: body.toString(),
      });

      console.log(`[Splunk] Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        console.error('[Splunk] Error response body:', errorText);
        throw new Error(`Oneshot search failed: ${response.statusText}\nDetails: ${errorText}`);
      }

      const data = await response.json();
      const results = data.results || [];
      console.log(`[Splunk] Query successful: ${results.length} results returned`);
      return results;
    } catch (error: any) {
      console.error('[Splunk] Oneshot search error:', error);
      throw error;
    }
  }
}

/**
 * Create a Splunk client from database config, environment variables, or custom config
 * Priority: customConfig > database > environment variables
 */
export function createSplunkClient(customConfig?: Partial<SplunkConfig>): SplunkClient {
  const config: SplunkConfig = {
    host: customConfig?.host || process.env.SPLUNK_HOST || 'localhost',
    port: customConfig?.port || Number(process.env.SPLUNK_PORT) || 8089,
    username: customConfig?.username || process.env.SPLUNK_USER || undefined,
    password: customConfig?.password || process.env.SPLUNK_PASSWORD || undefined,
    token: customConfig?.token || process.env.SPLUNK_API_TOKEN || undefined,
    scheme: customConfig?.scheme || (process.env.SPLUNK_SCHEME as 'https' | 'http') || 'https',
  };

  return new SplunkClient(config);
}

/**
 * Create a Splunk client from database configuration (async)
 * Falls back to environment variables if no database config exists
 */
export async function createSplunkClientFromDB(): Promise<SplunkClient | null> {
  try {
    // Dynamic import to avoid circular dependency
    const { prisma } = await import('@/lib/db');

    const dbConfig = await prisma.splunkConfig.findFirst({
      where: { isActive: true },
    });

    if (dbConfig) {
      return createSplunkClient({
        host: dbConfig.host,
        port: dbConfig.port,
        scheme: dbConfig.scheme as 'https' | 'http',
        username: dbConfig.username || undefined,
        password: dbConfig.password || undefined,
        token: dbConfig.apiToken || undefined,
      });
    }

    // Fallback to environment variables
    if (process.env.SPLUNK_HOST) {
      return createSplunkClient();
    }

    return null;
  } catch (error) {
    console.error('Error loading Splunk config from database:', error);
    // Fallback to environment variables
    if (process.env.SPLUNK_HOST) {
      return createSplunkClient();
    }
    return null;
  }
}
