import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { newId } from '@domia/kernel';
import { resultOk, resultErr, domiaError, moduleId, brandId } from '@domia/contracts';
import type { CaseId, MemoryCard, MemoryDraft, MemoryId, ModuleResult, Store } from '@domia/contracts';

const MEMORY = moduleId('memory');

/**
 * Memories are markdown files a human can read and edit; SQLite holds only the
 * index. Bodies stay on disk so the corpus is inspectable and portable — the same
 * ethos as Agent Skills.
 */
export class MemoryStore {
  constructor(private readonly root: string, private readonly store: Store) {}

  private dirFor(caseId: CaseId): string { return join(this.root, String(caseId)); }

  async save(caseId: CaseId, draft: MemoryDraft): Promise<ModuleResult<MemoryCard>> {
    if (!draft.title.trim()) return resultErr(domiaError(MEMORY, 'INVALID_ARGS', 'memory needs a title'));
    const id = brandId<'MemoryId'>(newId(10));
    const dir = this.dirFor(caseId);
    const bodyPath = join(dir, `${id}.md`);
    const now = new Date().toISOString();
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(bodyPath, `# ${draft.title}\n\n${draft.body}\n`, 'utf8');
    } catch (e) {
      return resultErr(domiaError(MEMORY, 'IO', 'failed to write memory', { cause: e }));
    }
    const tags = draft.tags ?? [];
    const inserted = await this.store.memories.insert({ id, caseId, title: draft.title, tags, bodyPath, createdAt: now, updatedAt: now });
    if (inserted.isErr()) return resultErr(inserted.error);
    return resultOk({ id, title: draft.title, tags, body: draft.body, updatedAt: now });
  }

  async list(caseId: CaseId): Promise<ModuleResult<readonly MemoryCard[]>> {
    const rows = await this.store.memories.byCase(caseId);
    if (rows.isErr()) return resultErr(rows.error);
    const cards: MemoryCard[] = [];
    for (const r of rows.value) {
      const raw = await readFile(r.bodyPath, 'utf8').catch(() => '');
      // Strip the `# title` heading we write on save so the body round-trips clean.
      const body = raw.replace(/^#\s.*\n+/, '').trim();
      cards.push({ id: r.id, title: r.title, tags: r.tags, body, updatedAt: r.updatedAt });
    }
    return resultOk(cards);
  }

  async remove(id: MemoryId, caseId: CaseId): Promise<ModuleResult<void>> {
    const rows = await this.store.memories.byCase(caseId);
    if (rows.isOk()) {
      const row = rows.value.find((r) => r.id === id);
      if (row) await rm(row.bodyPath, { force: true }).catch(() => undefined);
    }
    return this.store.memories.remove(id);
  }
}
