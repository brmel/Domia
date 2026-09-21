import { readdir, readFile } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resultOk, resultErr, domiaError, moduleId } from '@domia/contracts';
import type { DomiaModule, ModuleResult } from '@domia/contracts';

const HOST = moduleId('hosts');

interface PluginManifest {
  readonly name: string;
  readonly entry: string;
}

/**
 * A plugin is just a DomiaModule that happens to live outside this repo. It is
 * loaded through the same kernel and handed the same ModuleHost as a built-in, so
 * it can register at any extension point (tools, agents, belt tools, trace sinks)
 * with no privileged path — the extensibility story, proven by construction.
 */
export async function loadUserPlugins(dir: string | undefined): Promise<ModuleResult<readonly DomiaModule[]>> {
  if (!dir) return resultOk([]);
  let entries: string[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return resultOk([]); // no plugins directory is a normal, empty state
  }

  const loaded: DomiaModule[] = [];
  for (const name of entries) {
    const pluginDir = join(dir, name);
    let manifest: PluginManifest;
    try {
      manifest = JSON.parse(await readFile(join(pluginDir, 'domia-plugin.json'), 'utf8')) as PluginManifest;
    } catch {
      continue; // a directory without a manifest simply is not a plugin
    }
    const entry = isAbsolute(manifest.entry) ? manifest.entry : join(pluginDir, manifest.entry);
    try {
      const mod = (await import(pathToFileURL(entry).href)) as { default?: () => DomiaModule; plugin?: () => DomiaModule };
      const factory = mod.default ?? mod.plugin;
      if (typeof factory !== 'function') {
        return resultErr(domiaError(HOST, 'BAD_CONFIG', `plugin '${manifest.name}' must default-export a () => DomiaModule`));
      }
      loaded.push(factory());
    } catch (e) {
      return resultErr(domiaError(HOST, 'BAD_CONFIG', `failed to load plugin '${manifest.name}'`, { cause: e }));
    }
  }
  return resultOk(loaded);
}
