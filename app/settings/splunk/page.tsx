'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Database,
  Save,
  TestTube,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Trash2,
  ChevronDown,
  ChevronRight,
  Eye,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

interface SplunkConfig {
  id: string;
  host: string;
  port: number;
  scheme: string;
  username: string | null;
  password: string | null;
  apiToken: string | null;
  isActive: boolean;
  indexStructure: Record<string, Record<string, { fields: string[] }>> | null;
  structureFetchedAt: string | null;
  excludedIndexes: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function SplunkSettingsPage() {
  const [config, setConfig] = useState<SplunkConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [fetchingStructure, setFetchingStructure] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; version?: string } | null>(null);
  const [structureResult, setStructureResult] = useState<{ success: boolean; message: string; indexCount?: number; sourcetypeCount?: number } | null>(null);

  // Form state
  const [host, setHost] = useState('');
  const [port, setPort] = useState('8089');
  const [scheme, setScheme] = useState('https');
  const [authMethod, setAuthMethod] = useState<'token' | 'basic'>('token');
  const [apiToken, setApiToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [excludedIndexes, setExcludedIndexes] = useState('_*');
  const [expandedIndexes, setExpandedIndexes] = useState<Set<string>>(new Set());
  const [expandedSourcetypes, setExpandedSourcetypes] = useState<Set<string>>(new Set());
  const [editedStructure, setEditedStructure] = useState<Record<string, Record<string, { fields: string[] }>> | null>(null);
  const [savingStructure, setSavingStructure] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const toggleIndex = (index: string) => {
    const newExpanded = new Set(expandedIndexes);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedIndexes(newExpanded);
  };

  const toggleSourcetype = (key: string) => {
    const newExpanded = new Set(expandedSourcetypes);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedSourcetypes(newExpanded);
  };

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/splunk-config');
      if (response.ok) {
        const data = await response.json();
        if (data.config) {
          setConfig(data.config);
          setHost(data.config.host);
          setPort(String(data.config.port));
          setScheme(data.config.scheme);
          setAuthMethod(data.config.apiToken ? 'token' : 'basic');
          setExcludedIndexes(data.config.excludedIndexes || '_*');
          // Don't populate sensitive fields from masked values
          setUsername(data.config.username && data.config.username !== '********' ? data.config.username : '');
        }
      }
    } catch (error) {
      console.error('Error fetching config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!host) {
      toast.error('Host is required');
      return;
    }

    if (authMethod === 'token' && !apiToken) {
      toast.error('API Token is required');
      return;
    }

    if (authMethod === 'basic' && !username) {
      toast.error('Username is required');
      return;
    }

    setSaving(true);
    try {
      const body = {
        host,
        port: parseInt(port),
        scheme,
        apiToken: authMethod === 'token' ? apiToken : null,
        username: authMethod === 'basic' ? username : null,
        password: authMethod === 'basic' ? password : null,
        excludedIndexes: excludedIndexes || '_*',
      };

      const response = await fetch('/api/splunk-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        toast.success('Splunk configuration saved');
        fetchConfig();
        // Clear sensitive fields after save
        setApiToken('');
        setPassword('');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save configuration');
      }
    } catch (error) {
      toast.error('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!host) {
      toast.error('Host is required');
      return;
    }

    if (authMethod === 'token' && !apiToken) {
      toast.error('API Token is required');
      return;
    }

    if (authMethod === 'basic' && !username) {
      toast.error('Usernameare required');
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const body = {
        host,
        port: parseInt(port),
        scheme,
        apiToken: authMethod === 'token' ? apiToken : null,
        username: authMethod === 'basic' ? username : null,
        password: authMethod === 'basic' ? password : null,
      };

      const response = await fetch('/api/splunk-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setTestResult({
          success: true,
          message: data.message,
          version: data.version,
        });
        toast.success(data.message);
      } else {
        setTestResult({
          success: false,
          message: data.error || data.details || 'Connection failed',
        });
        toast.error('Connection failed');
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Network error occurred';
      setTestResult({ success: false, message: errorMessage });
      toast.error('Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!config) return;

    if (!confirm('Are you sure you want to delete this Splunk configuration?')) {
      return;
    }

    try {
      const response = await fetch(`/api/splunk-config/${config.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Configuration deleted');
        setConfig(null);
        setHost('');
        setPort('8089');
        setScheme('https');
        setApiToken('');
        setUsername('');
        setPassword('');
        setExcludedIndexes('_*');
      } else {
        toast.error('Failed to delete configuration');
      }
    } catch (error) {
      toast.error('Failed to delete configuration');
    }
  };

  const handleFetchStructure = async () => {
    if (!config) {
      toast.error('Please save Splunk configuration first');
      return;
    }

    setFetchingStructure(true);
    setStructureResult(null);

    try {
      const response = await fetch('/api/splunk-config/fetch-structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setStructureResult({
          success: true,
          message: data.message,
          indexCount: data.indexCount,
          sourcetypeCount: data.sourcetypeCount,
        });
        toast.success(`Fetched structure: ${data.indexCount} indexes, ${data.sourcetypeCount} sourcetypes`);
        // Refresh config to get updated structureFetchedAt
        fetchConfig();
      } else {
        setStructureResult({
          success: false,
          message: data.error || data.details || 'Failed to fetch structure',
        });
        toast.error('Failed to fetch structure');
      }
    } catch (error: any) {
      const errorMessage = error.message || 'Network error occurred';
      setStructureResult({ success: false, message: errorMessage });
      toast.error('Failed to fetch structure');
    } finally {
      setFetchingStructure(false);
    }
  };

  const getEditableStructure = () => {
    return editedStructure || config?.indexStructure || {};
  };

  const removeIndex = (indexToRemove: string) => {
    const structure = getEditableStructure();
    const newStructure = { ...structure };
    delete newStructure[indexToRemove];
    setEditedStructure(newStructure);
  };

  const removeSourcetype = (index: string, sourcetypeToRemove: string) => {
    const structure = getEditableStructure();
    const newStructure = { ...structure };
    if (newStructure[index]) {
      const newSourcetypes = { ...newStructure[index] };
      delete newSourcetypes[sourcetypeToRemove];
      newStructure[index] = newSourcetypes;
    }
    setEditedStructure(newStructure);
  };

  const removeField = (index: string, sourcetype: string, fieldToRemove: string) => {
    const structure = getEditableStructure();
    const newStructure = { ...structure };
    if (newStructure[index]?.[sourcetype]) {
      const newFields = newStructure[index][sourcetype].fields.filter(f => f !== fieldToRemove);
      newStructure[index] = {
        ...newStructure[index],
        [sourcetype]: { fields: newFields }
      };
    }
    setEditedStructure(newStructure);
  };

  const handleSaveStructure = async () => {
    if (!editedStructure) {
      toast.info('No changes to save');
      return;
    }

    setSavingStructure(true);
    try {
      const response = await fetch('/api/splunk-config/update-structure', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ structure: editedStructure }),
      });

      if (response.ok) {
        toast.success('Structure saved successfully');
        setEditedStructure(null);
        fetchConfig();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to save structure');
      }
    } catch (error) {
      toast.error('Failed to save structure');
    } finally {
      setSavingStructure(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="space-y-6">
          <div>
            <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">Splunk Configuration</h1>
            <p className="text-xs md:text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6">
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">Splunk Configuration</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Configure Splunk integration for automated security data queries
          </p>
        </div>
        {config && (
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Config
          </Button>
        )}
      </div>

      {config && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Splunk is configured and active. Agents will automatically execute queries during
            investigations.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Connection Settings
          </CardTitle>
          <CardDescription>
            Configure connection to your Splunk instance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="host">Host *</Label>
              <Input
                id="host"
                placeholder="splunk.example.com"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Hostname or IP address (no http://)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                type="number"
                placeholder="8089"
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">REST API port</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="scheme">Scheme</Label>
              <RadioGroup value={scheme} onValueChange={setScheme}>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="https" id="https" />
                    <Label htmlFor="https" className="font-normal">
                      HTTPS
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="http" id="http" />
                    <Label htmlFor="http" className="font-normal">
                      HTTP
                    </Label>
                  </div>
                </div>
              </RadioGroup>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
          <CardDescription>Choose authentication method</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={authMethod} onValueChange={(v) => setAuthMethod(v as 'token' | 'basic')}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="token" id="token" />
              <Label htmlFor="token" className="font-normal">
                API Token (Recommended)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="basic" id="basic" />
              <Label htmlFor="basic" className="font-normal">
                Username / Password
              </Label>
            </div>
          </RadioGroup>

          {authMethod === 'token' ? (
            <div className="space-y-2">
              <Label htmlFor="apiToken">API Token *</Label>
              <Input
                id="apiToken"
                type="password"
                placeholder="Enter your Splunk API token"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Generate a token in Splunk: Settings → Tokens
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  placeholder="splunk-user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {testResult && (
        <Alert variant={testResult.success ? 'default' : 'destructive'}>
          {testResult.success ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          <AlertDescription>{testResult.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button onClick={handleTest} disabled={testing} variant="outline">
          {testing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <TestTube className="mr-2 h-4 w-4" />
              Test Connection
            </>
          )}
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Configuration
            </>
          )}
        </Button>
      </div>

      {config && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Index Structure Discovery
              </CardTitle>
              <CardDescription>
                Fetch indexes, sourcetypes, and extracted fields from Splunk to improve agent understanding
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {config.structureFetchedAt && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    Structure last fetched: {new Date(config.structureFetchedAt).toLocaleString()}
                    {config.indexStructure && (
                      <span className="ml-2">
                        ({Object.keys(config.indexStructure).length} indexes,
                        {' '}{Object.values(config.indexStructure).reduce(
                          (acc, sourcetypes) => acc + Object.keys(sourcetypes).length,
                          0
                        )} sourcetypes)
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {structureResult && (
                <Alert variant={structureResult.success ? 'default' : 'destructive'}>
                  {structureResult.success ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <AlertDescription>{structureResult.message}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This process will:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Query Splunk for all available indexes (searches all time)</li>
                  <li>Discover sourcetypes within each index (searches all time)</li>
                  <li>Extract available fields per sourcetype (samples first 10000 events)</li>
                  <li>Store the structure for agents to reference</li>
                </ul>
                <p className="text-amber-600 dark:text-amber-400 mt-2">
                  Note: Field discovery samples the first 10000 events per sourcetype for optimal speed. This may take several minutes depending on the number of indexes and sourcetypes.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="excludedIndexes">Excluded Indexes</Label>
                <Input
                  id="excludedIndexes"
                  placeholder="_*, summary, test*"
                  value={excludedIndexes}
                  onChange={(e) => setExcludedIndexes(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated patterns to exclude (supports wildcards). Default: _* (excludes internal indexes)
                </p>
              </div>

              <Button
                onClick={handleFetchStructure}
                disabled={fetchingStructure}
                variant="secondary"
              >
                {fetchingStructure ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Fetching Structure...
                  </>
                ) : (
                  <>
                    <Database className="mr-2 h-4 w-4" />
                    Fetch Index Structure
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {config.indexStructure && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Discovered Structure
                </CardTitle>
                <CardDescription>
                  View the indexes, sourcetypes, and extracted fields fetched from Splunk
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {Object.entries(getEditableStructure() as Record<string, Record<string, { fields: string[] }>>).map(([index, sourcetypes]) => (
                    <div key={index} className="border rounded-lg overflow-hidden group">
                      <div
                        className="w-full px-4 py-3 flex items-center justify-between bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <button
                          onClick={() => toggleIndex(index)}
                          className="flex items-center gap-2 flex-1 text-left"
                        >
                          {expandedIndexes.has(index) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <span className="font-semibold">{index}</span>
                          <Badge variant="secondary">
                            {Object.keys(sourcetypes).length} sourcetype{Object.keys(sourcetypes).length !== 1 ? 's' : ''}
                          </Badge>
                        </button>
                        <button
                          onClick={() => removeIndex(index)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded"
                          title="Remove index"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </button>
                      </div>

                      {expandedIndexes.has(index) && (
                        <div className="p-4 space-y-3 bg-background">
                          {Object.entries(sourcetypes).map(([sourcetype, data]) => {
                            const key = `${index}:${sourcetype}`;
                            return (
                              <div key={key} className="border rounded-md overflow-hidden group/sourcetype">
                                <div className="w-full px-3 py-2 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors">
                                  <button
                                    onClick={() => toggleSourcetype(key)}
                                    className="flex items-center gap-2 flex-1 text-left"
                                  >
                                    {expandedSourcetypes.has(key) ? (
                                      <ChevronDown className="h-3 w-3" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3" />
                                    )}
                                    <code className="text-sm font-mono">{sourcetype}</code>
                                    <Badge variant="outline" className="text-xs">
                                      {data.fields.length} field{data.fields.length !== 1 ? 's' : ''}
                                    </Badge>
                                  </button>
                                  <button
                                    onClick={() => removeSourcetype(index, sourcetype)}
                                    className="opacity-0 group-hover/sourcetype:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded"
                                    title="Remove sourcetype"
                                  >
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </button>
                                </div>

                                {expandedSourcetypes.has(key) && (
                                  <div className="p-3 bg-background">
                                    <div className="text-xs text-muted-foreground mb-2">Extracted Fields:</div>
                                    <div className="flex flex-wrap gap-2">
                                      {data.fields.length > 0 ? (
                                        data.fields.map((field) => (
                                          <Badge
                                            key={field}
                                            variant="secondary"
                                            className="group/badge hover:pr-1 transition-all"
                                          >
                                            {field}
                                            <button
                                              onClick={() => removeField(index, sourcetype, field)}
                                              className="ml-1 opacity-0 group-hover/badge:opacity-100 transition-opacity"
                                              title="Remove field"
                                            >
                                              <X className="h-3 w-3 hover:text-destructive" />
                                            </button>
                                          </Badge>
                                        ))
                                      ) : (
                                        <span className="text-sm text-muted-foreground">No fields found</span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {Object.keys(config.indexStructure).length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No structure data available. Click "Fetch Index Structure" above to discover your Splunk data.
                  </div>
                )}

                {editedStructure && Object.keys(config.indexStructure).length > 0 && (
                  <div className="pt-4 border-t">
                    <Button onClick={handleSaveStructure} disabled={savingStructure}>
                      {savingStructure ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Important Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            • Configuration saved here takes precedence over environment variables
          </p>
          <p>
            • API tokens are more secure than username/password authentication
          </p>
          <p>
            • Ensure your Splunk service account has search permissions on required indexes
          </p>
          <p>
            • Required indexes: cloudtrail, vpcflow, cloudwatch, linux, windows, etc.
          </p>
          <p>
            • See{' '}
            <a
              href="https://github.com/your-repo/agentic-soc/blob/main/SPLUNK_SETUP.md"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              SPLUNK_SETUP.md
            </a>{' '}
            for detailed setup instructions
          </p>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
