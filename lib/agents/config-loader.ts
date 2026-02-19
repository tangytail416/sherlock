import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import type { AgentConfig } from './types';

const AGENTS_DIR = path.join(process.cwd(), 'agents');

// Cache for loaded agent configs
const configCache = new Map<string, AgentConfig>();

/**
 * Load all agent configurations from the agents directory
 */
export async function loadAllAgentConfigs(): Promise<Map<string, AgentConfig>> {
  try {
    const files = await fs.readdir(AGENTS_DIR);
    const yamlFiles = files.filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'));

    const configs = new Map<string, AgentConfig>();

    for (const file of yamlFiles) {
      try {
        const config = await loadAgentConfig(file.replace(/\.ya?ml$/, ''));
        if (config && config.enabled !== false) {
          configs.set(config.name, config);
        }
      } catch (error) {
        console.error(`Failed to load agent config from ${file}:`, error);
      }
    }

    return configs;
  } catch (error) {
    console.error('Failed to load agent configs:', error);
    return new Map();
  }
}

/**
 * Load a single agent configuration by name
 */
export async function loadAgentConfig(agentName: string): Promise<AgentConfig | null> {
  // Check cache first
  if (configCache.has(agentName)) {
    return configCache.get(agentName)!;
  }

  try {
    const filePath = path.join(AGENTS_DIR, `${agentName}.yaml`);
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const config = yaml.load(fileContent) as AgentConfig;

    // Validate required fields
    if (!config.name || !config.type || !config.model || !config.prompts) {
      throw new Error(`Invalid agent config for ${agentName}: missing required fields`);
    }

    // Cache the config
    configCache.set(agentName, config);

    return config;
  } catch (error) {
    console.error(`Failed to load config for agent ${agentName}:`, error);
    return null;
  }
}

/**
 * Get agents by type
 */
export async function getAgentsByType(
  type: AgentConfig['type']
): Promise<AgentConfig[]> {
  const allConfigs = await loadAllAgentConfigs();
  return Array.from(allConfigs.values()).filter((config) => config.type === type);
}

/**
 * Get agents by capability
 */
export async function getAgentsByCapability(capability: string): Promise<AgentConfig[]> {
  const allConfigs = await loadAllAgentConfigs();
  return Array.from(allConfigs.values()).filter((config) =>
    config.capabilities?.includes(capability)
  );
}

/**
 * Check if an agent should be triggered for an alert
 */
export function shouldTriggerAgent(
  config: AgentConfig,
  alertType: string,
  alertSeverity: string
): boolean {
  if (!config.triggers || config.triggers.length === 0) {
    return false;
  }

  return config.triggers.some((trigger) => {
    const typeMatches = trigger.alert_type === '*' || trigger.alert_type === alertType;
    const severityMatches =
      !trigger.severity ||
      trigger.severity.length === 0 ||
      trigger.severity.includes('*') ||
      trigger.severity.includes(alertSeverity);

    return typeMatches && severityMatches;
  });
}

/**
 * Clear the config cache (useful for testing or hot-reloading)
 */
export function clearConfigCache(): void {
  configCache.clear();
}
