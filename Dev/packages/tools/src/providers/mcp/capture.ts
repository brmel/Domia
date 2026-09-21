import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { ArtifactRef, BindingIO } from '@domia/contracts';

const IMAGE = new Set(['.png', '.jpg', '.jpeg']);
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

/**
 * playwright-mcp writes screenshots into the session output dir and returns text.
 * This turns those files into trace artifacts so a run's visual record is part of
 * its provenance (the filmstrip) instead of being thrown away with the temp dir.
 */
export class ScreenshotCollector {
  private seen = new Set<string>();

  constructor(private readonly outDir: string, private readonly io: BindingIO) {}

  /** Save any image written since the last sweep. Never throws — capture is best-effort. */
  async collect(label: string): Promise<ArtifactRef | undefined> {
    try {
      const files = await readdir(this.outDir);
      const fresh: { path: string; mtime: number }[] = [];
      for (const f of files) {
        if (!IMAGE.has(extname(f).toLowerCase()) || this.seen.has(f)) continue;
        const p = join(this.outDir, f);
        fresh.push({ path: p, mtime: (await stat(p)).mtimeMs });
        this.seen.add(f);
      }
      if (fresh.length === 0) return undefined;
      fresh.sort((a, b) => b.mtime - a.mtime);
      const newest = fresh[0]!;
      const bytes = await readFile(newest.path);
      const saved = await this.io.saveArtifact(new Uint8Array(bytes), {
        kind: 'screenshot',
        mime: MIME[extname(newest.path).toLowerCase()] ?? 'image/png',
        label,
      });
      return saved.isOk() ? saved.value : undefined;
    } catch {
      return undefined;
    }
  }
}
