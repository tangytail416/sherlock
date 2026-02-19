'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Database,
  Save,
  TestTube,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Network,
  Server,
  Eye,
  EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';

interface Neo4jConfig {
  id: string;
  uri: string;
  username: string;
  password: string;
  database: string;
  isActive: boolean;
  schemaInitialized: boolean;
  lastTestedAt: string | null;
  nodeCount: number | null;
  relationshipCount: number | null;
  lastStatsUpdate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PostgresInfo {
  connected: boolean;
  database: string;
  host: string;
  tables: number;
}

export default function DatabaseSettingsPage() {
  // Neo4j state
  const [neo4jConfig, setNeo4jConfig] = useState<Neo4jConfig | null>(null);
  const [neo4jUri, setNeo4jUri] = useState('bolt://localhost:7687');
  const [neo4jUsername, setNeo4jUsername] = useState('neo4j');
  const [neo4jPassword, setNeo4jPassword] = useState('');
  const [neo4jDatabase, setNeo4jDatabase] = useState('neo4j');
  const [showNeo4jPassword, setShowNeo4jPassword] = useState(false);

  // PostgreSQL state
  const [postgresInfo, setPostgresInfo] = useState<PostgresInfo | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [savingNeo4j, setSavingNeo4j] = useState(false);
  const [testingNeo4j, setTestingNeo4j] = useState(false);
  const [initializingSchema, setInitializingSchema] = useState(false);
  const [testingPostgres, setTestingPostgres] = useState(false);

  const [neo4jTestResult, setNeo4jTestResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);

  const [schemaStatus, setSchemaStatus] = useState<{
    initialized: boolean;
    statistics?: { nodeCount: number; relationshipCount: number; labelCounts: Record<string, number> };
  } | null>(null);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      // Fetch Neo4j config
      const neo4jResponse = await fetch('/api/neo4j-config');
      if (neo4jResponse.ok) {
        const data = await neo4jResponse.json();
        if (data.config) {
          setNeo4jConfig(data.config);
          setNeo4jUri(data.config.uri);
          setNeo4jUsername(data.config.username);
          setNeo4jDatabase(data.config.database);
        }
      }

      // Fetch schema status
      const schemaResponse = await fetch('/api/neo4j-config/initialize-schema');
      if (schemaResponse.ok) {
        const data = await schemaResponse.json();
        setSchemaStatus(data);
      }

      // Note: PostgreSQL info would come from environment variables
      // For display purposes, we'll show basic connection info
      setPostgresInfo({
        connected: true,
        database: 'agentic_soc',
        host: 'localhost:5432',
        tables: 0, // Could be fetched from a dedicated endpoint
      });
    } catch (error) {
      console.error('Error fetching configs:', error);
      toast.error('Failed to load database configurations');
    } finally {
      setLoading(false);
    }
  };

  const testNeo4jConnection = async () => {
    setTestingNeo4j(true);
    setNeo4jTestResult(null);

    try {
      const response = await fetch('/api/neo4j-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uri: neo4jUri,
          username: neo4jUsername,
          password: neo4jPassword,
          database: neo4jDatabase,
        }),
      });

      const data = await response.json();
      setNeo4jTestResult(data);

      if (data.success) {
        toast.success('Neo4j connection successful!');
      } else {
        toast.error('Neo4j connection failed');
      }
    } catch (error) {
      toast.error('Failed to test Neo4j connection');
      setNeo4jTestResult({
        success: false,
        message: 'Request failed',
      });
    } finally {
      setTestingNeo4j(false);
    }
  };

  const saveNeo4jConfig = async () => {
    if (!neo4jUri || !neo4jUsername || !neo4jPassword) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSavingNeo4j(true);

    try {
      const response = await fetch('/api/neo4j-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uri: neo4jUri,
          username: neo4jUsername,
          password: neo4jPassword,
          database: neo4jDatabase,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNeo4jConfig(data.config);
        toast.success('Neo4j configuration saved successfully');
        fetchConfigs(); // Refresh
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save configuration');
      }
    } catch (error) {
      toast.error('Failed to save Neo4j configuration');
    } finally {
      setSavingNeo4j(false);
    }
  };

  const initializeGraphSchema = async () => {
    setInitializingSchema(true);

    try {
      const response = await fetch('/api/neo4j-config/initialize-schema', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Graph schema initialized successfully');
        setSchemaStatus({
          initialized: true,
          statistics: data.statistics,
        });
        fetchConfigs(); // Refresh
      } else {
        toast.error(data.message || 'Failed to initialize schema');
      }
    } catch (error) {
      toast.error('Failed to initialize graph schema');
    } finally {
      setInitializingSchema(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">Database Settings</h1>
        <p className="text-xs md:text-sm text-muted-foreground">
          Configure PostgreSQL and Neo4j database connections for the agent memory system
        </p>
      </div>

      {/* PostgreSQL Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <Server className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle>PostgreSQL Database</CardTitle>
                <CardDescription>
                  Primary database for investigations, alerts, and query learning
                </CardDescription>
              </div>
            </div>
            {postgresInfo?.connected && (
              <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              PostgreSQL is configured via environment variables in <code className="px-1.5 py-0.5 bg-muted rounded">.env</code> file.
              Database connection: <code className="px-1.5 py-0.5 bg-muted rounded">DATABASE_URL</code>
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-muted-foreground">Host</Label>
              <p className="text-sm font-medium">{postgresInfo?.host || 'localhost:5432'}</p>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Database</Label>
              <p className="text-sm font-medium">{postgresInfo?.database || 'agentic_soc'}</p>
            </div>
          </div>

          <Separator />

          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <h4 className="font-medium text-sm">Features Stored in PostgreSQL:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Alerts, Investigations, and Reports</li>
              <li>Agent execution history and findings</li>
              <li>Saved queries with effectiveness scoring</li>
              <li>Query execution audit trail</li>
              <li>IOC whitelist and threat hunt data</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Neo4j Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                <Network className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <CardTitle>Neo4j Graph Database</CardTitle>
                <CardDescription>
                  Graph database for entity correlation and investigation memory
                </CardDescription>
              </div>
            </div>
            {neo4jConfig?.isActive && (
              <Badge variant="outline" className="border-purple-500 text-purple-600 dark:text-purple-400">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Active
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Priority:</strong> Configuration uses environment variables (.env) first, then falls back to database settings.
            </AlertDescription>
          </Alert>

          {/* Connection Form */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="neo4j-uri">Connection URI *</Label>
                <Input
                  id="neo4j-uri"
                  value={neo4jUri}
                  onChange={(e) => setNeo4jUri(e.target.value)}
                  placeholder="bolt://localhost:7687"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use bolt:// protocol for local or neo4j:// for cloud
                </p>
              </div>

              <div>
                <Label htmlFor="neo4j-username">Username *</Label>
                <Input
                  id="neo4j-username"
                  value={neo4jUsername}
                  onChange={(e) => setNeo4jUsername(e.target.value)}
                  placeholder="neo4j"
                />
              </div>

              <div>
                <Label htmlFor="neo4j-password">Password *</Label>
                <div className="relative">
                  <Input
                    id="neo4j-password"
                    type={showNeo4jPassword ? 'text' : 'password'}
                    value={neo4jPassword}
                    onChange={(e) => setNeo4jPassword(e.target.value)}
                    placeholder="Enter password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowNeo4jPassword(!showNeo4jPassword)}
                  >
                    {showNeo4jPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="col-span-2">
                <Label htmlFor="neo4j-database">Database Name</Label>
                <Input
                  id="neo4j-database"
                  value={neo4jDatabase}
                  onChange={(e) => setNeo4jDatabase(e.target.value)}
                  placeholder="neo4j"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Default is &quot;neo4j&quot; for community edition
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={testNeo4jConnection} disabled={testingNeo4j} variant="outline">
                {testingNeo4j ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <TestTube className="h-4 w-4 mr-2" />
                    Test Connection
                  </>
                )}
              </Button>

              <Button onClick={saveNeo4jConfig} disabled={savingNeo4j}>
                {savingNeo4j ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Configuration
                  </>
                )}
              </Button>
            </div>

            {/* Test Result */}
            {neo4jTestResult && (
              <Alert variant={neo4jTestResult.success ? 'default' : 'destructive'}>
                {neo4jTestResult.success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <AlertDescription>
                  <p className="font-medium">{neo4jTestResult.message}</p>
                  {neo4jTestResult.details && (
                    <div className="mt-2 text-xs space-y-1">
                      {neo4jTestResult.details.uri && (
                        <p>URI: {neo4jTestResult.details.uri}</p>
                      )}
                      {neo4jTestResult.details.database && (
                        <p>Database: {neo4jTestResult.details.database}</p>
                      )}
                      {neo4jTestResult.details.nodeCount !== undefined && (
                        <p>Nodes: {neo4jTestResult.details.nodeCount}</p>
                      )}
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Separator />

          {/* Schema Status */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Graph Schema</h3>
                <p className="text-sm text-muted-foreground">
                  Constraints and indexes for entity relationships
                </p>
              </div>
              {schemaStatus?.initialized ? (
                <Badge variant="outline" className="border-green-500 text-green-600">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Initialized
                </Badge>
              ) : (
                <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Not Initialized
                </Badge>
              )}
            </div>

            {schemaStatus?.statistics && (
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Total Nodes</p>
                  <p className="text-2xl font-bold">{schemaStatus.statistics.nodeCount}</p>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Relationships</p>
                  <p className="text-2xl font-bold">{schemaStatus.statistics.relationshipCount}</p>
                </div>
                <div className="bg-muted/50 p-3 rounded-lg">
                  <p className="text-xs text-muted-foreground">Node Types</p>
                  <p className="text-2xl font-bold">
                    {Object.keys(schemaStatus.statistics.labelCounts || {}).length}
                  </p>
                </div>
              </div>
            )}

            <Button
              onClick={initializeGraphSchema}
              disabled={initializingSchema}
              variant="outline"
              className="w-full"
            >
              {initializingSchema ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Initializing Schema...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {schemaStatus?.initialized ? 'Reinitialize Schema' : 'Initialize Schema'}
                </>
              )}
            </Button>
          </div>

          <Separator />

          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <h4 className="font-medium text-sm">Features Stored in Neo4j:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Investigation entity graphs (Users, IPs, Hosts, Services)</li>
              <li>Entity relationship mapping and correlation</li>
              <li>MITRE ATT&CK technique associations</li>
              <li>Campaign detection and multi-investigation patterns</li>
              <li>Entity behavior timelines and history</li>
            </ul>
          </div>

          {neo4jConfig && (
            <div className="text-xs text-muted-foreground">
              Last updated: {new Date(neo4jConfig.updatedAt).toLocaleString()}
              {neo4jConfig.lastTestedAt && (
                <> • Last tested: {new Date(neo4jConfig.lastTestedAt).toLocaleString()}</>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
