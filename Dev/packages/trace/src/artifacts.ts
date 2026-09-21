import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { resultErr, resultOk, domiaError, moduleId, brandId } from '@domia/contracts';
import type { ArtifactId, ArtifactMeta, ArtifactRef, ModuleResult } from '@domia/contracts';
import { newId } from '@domia/kernel';

const TRACE = moduleId('trace');

/** Content-addressed on disk: <dir>/<ab>/<sha256>. Dedupe by hash. */
export class ArtifactStore {
  private readonly byId = new Map<string, { path: string; ref: ArtifactRef }>();
  constructor(private readonly dir: string) {}

  async save(data: Uint8Array | ReadableStream<Uint8Array>, meta: ArtifactMeta): Promise<ModuleResult<ArtifactRef>> {
    try {
      const bytes = data instanceof Uint8Array ? data : await streamToBytes(data);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const sub = sha256.slice(0, 2);
      const path = join(this.dir, sub, sha256);
      if (!existsSync(path)) {
        await mkdir(join(this.dir, sub), { recursive: true });
        await writeFile(path, bytes);
      }
      const id = brandId<'ArtifactId'>(newId(12));
      const ref: ArtifactRef = { id, kind: meta.kind, mime: meta.mime, bytes: bytes.byteLength, sha256, ...(meta.label ? { label: meta.label } : {}) };
      this.byId.set(id, { path, ref });
      return resultOk(ref);
    } catch (e) {
      return resultErr(domiaError(TRACE, 'IO', 'failed to save artifact', { cause: e }));
    }
  }

  async open(id: ArtifactId): Promise<ModuleResult<ReadableStream<Uint8Array>>> {
    const entry = this.byId.get(id);
    if (!entry) return resultErr(domiaError(TRACE, 'NOT_FOUND', `artifact '${id}' not found`));
    try {
      const bytes = await readFile(entry.path);
      return resultOk(Readable.toWeb(Readable.from(bytes)) as ReadableStream<Uint8Array>);
    } catch (e) {
      return resultErr(domiaError(TRACE, 'IO', 'failed to open artifact', { cause: e }));
    }
  }
}

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}
