import { z } from 'zod';
import type { Capability, ToolManifest } from '@domia/contracts';
import type { McpToolDef } from './client.js';
import { mcpParamsToZod } from './schemaMap.js';

/** playwright-mcp uses browser_* ; we expose browser.* so the router prefix works. */
export function mcpNameToDomia(name: string): string {
  return name.replace(/_/g, '.');
}
export function domiaNameToMcp(name: string): string {
  return name.replace(/\./g, '_');
}

/** `<server>.<tool>` — namespaced so mounted servers can't collide; safe chars only. */
export function namespacedToolName(server: string, tool: string): string {
  return `${server}.${tool.replace(/[^a-zA-Z0-9_.]/g, '_')}`;
}

const DANGEROUS = new Set(['browser.run.code.unsafe', 'browser.evaluate', 'browser.file.upload']);

function riskOf(name: string): ToolManifest['risk'] {
  if (DANGEROUS.has(name)) return 'dangerous';
  if (/navigate|click|type|press|select|drag|drop|fill|handle\.dialog/.test(name)) return 'guarded';
  return 'safe';
}

function capsOf(name: string): readonly Capability[] {
  if (/screenshot/.test(name)) return ['dom', 'vision'];
  if (/upload/.test(name)) return ['dom', 'fs'];
  if (/network/.test(name)) return ['dom', 'net'];
  return ['dom'];
}

export function mcpToManifest(def: McpToolDef): ToolManifest {
  const name = mcpNameToDomia(def.name);
  return {
    name,
    description: def.description ?? name,
    parameters: mcpParamsToZod(def.inputSchema), // D21 — real schema so the LLM knows the args
    output: z.unknown(),
    capabilities: capsOf(name),
    risk: riskOf(name),
    ...(name === 'browser.snapshot' || name === 'browser.take.screenshot' ? { parallelSafe: true } : {}),
  };
}
