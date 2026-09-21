import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resultOk, resultErr, domiaError, moduleId } from '@domia/contracts';
import type { ModuleResult, SkillCard, SkillStep } from '@domia/contracts';

const SKILLS = moduleId('skills');
const SKILL_FILE = 'SKILL.md';
const STEPS_FILE = 'steps.json';

/** Parse the Agent Skills frontmatter (name/description/tags) plus the body. */
export function parseSkillMd(raw: string, fallbackName: string): { name: string; description: string; tags: string[]; body: string } {
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  const body = (fm ? raw.slice(fm[0].length) : raw).trim();
  const meta: Record<string, string> = {};
  for (const line of (fm?.[1] ?? '').split('\n')) {
    const m = /^([a-zA-Z_-]+):\s*(.*)$/.exec(line.trim());
    if (m?.[1] && m[2] !== undefined) meta[m[1].toLowerCase()] = m[2].trim();
  }
  const tags = (meta['tags'] ?? '').split(',').map((t) => t.trim().replace(/^\[|\]$/g, '')).filter(Boolean);
  return {
    name: meta['name'] ?? fallbackName,
    description: meta['description'] ?? body.split('\n')[0] ?? fallbackName,
    tags,
    body,
  };
}

export function renderSkillMd(card: Pick<SkillCard, 'name' | 'description' | 'tags' | 'body'>): string {
  const tags = card.tags.length ? `tags: ${card.tags.join(', ')}\n` : '';
  return `---\nname: ${card.name}\ndescription: ${card.description}\n${tags}---\n\n${card.body}\n`;
}

/**
 * Skills on disk: one folder per skill, portable to and from any Agent Skills host.
 * The library only reads and writes — offering, ranking and replay live elsewhere,
 * so storage can change without touching the agent-facing behaviour.
 */
export class SkillLibrary {
  constructor(private readonly root: string) {}

  async list(): Promise<ModuleResult<readonly SkillCard[]>> {
    let entries: string[];
    try {
      entries = (await readdir(this.root, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return resultOk([]); // no skills dir yet is a normal, empty state
    }
    const cards: SkillCard[] = [];
    for (const dir of entries) {
      const card = await this.read(dir);
      if (card.isOk() && card.value) cards.push(card.value);
    }
    return resultOk(cards);
  }

  async read(dirName: string): Promise<ModuleResult<SkillCard | null>> {
    const path = join(this.root, dirName);
    let raw: string;
    try {
      raw = await readFile(join(path, SKILL_FILE), 'utf8');
    } catch {
      return resultOk(null);
    }
    const parsed = parseSkillMd(raw, dirName);
    let steps: SkillStep[] = [];
    try {
      const stepsRaw = await readFile(join(path, STEPS_FILE), 'utf8');
      const decoded: unknown = JSON.parse(stepsRaw);
      if (Array.isArray(decoded)) steps = decoded as SkillStep[];
    } catch { /* instructional skill — no recorded steps */ }
    return resultOk({ ...parsed, steps, path });
  }

  async write(card: Pick<SkillCard, 'name' | 'description' | 'tags' | 'body' | 'steps'>): Promise<ModuleResult<SkillCard>> {
    const dirName = card.name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    const path = join(this.root, dirName);
    try {
      await mkdir(path, { recursive: true });
      await writeFile(join(path, SKILL_FILE), renderSkillMd(card), 'utf8');
      if (card.steps.length > 0) await writeFile(join(path, STEPS_FILE), JSON.stringify(card.steps, null, 2), 'utf8');
    } catch (e) {
      return resultErr(domiaError(SKILLS, 'IO', `failed to write skill '${card.name}'`, { cause: e }));
    }
    return resultOk({ ...card, path });
  }
}
