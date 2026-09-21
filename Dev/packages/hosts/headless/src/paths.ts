import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ANCESTOR_LEVELS = 6;

function moduleDir(): string {
  if (typeof __dirname === 'string') return __dirname;
  return dirname(fileURLToPath(import.meta.url));
}

function packagedResourcesDir(): string | undefined {
  return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
}

export function installDirs(): readonly string[] {
  const dirs: string[] = [];
  let dir = moduleDir();
  for (let level = 0; level < ANCESTOR_LEVELS; level++) {
    dirs.push(dir);
    dir = dirname(dir);
  }
  const resources = packagedResourcesDir();
  if (resources) dirs.push(resources);
  return dirs;
}

export function installCandidates(name: string): readonly string[] {
  return installDirs().map((dir) => join(dir, name));
}
