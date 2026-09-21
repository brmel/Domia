import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { ArtifactRef, BindingIO } from '@domia/contracts';
import type { McpClient } from './client.js';

const MIME: Record<string, string> = {
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.zip': 'application/zip',
  '.trace': 'application/vnd.playwright.trace', '.har': 'application/json',
};
// Playwright writes traces into a `traces/` subdir as .trace, video at the top level.
const MEDIA = new Set(['.webm', '.mp4', '.zip', '.har', '.trace']);

/**
 * Everything a devtools window shows, captured as run provenance: video, Playwright
 * trace, console messages and the network log. The agent can pull these on demand
 * (they are tools), and we snapshot them automatically at session end so a run's
 * diagnostics survive the browser it came from.
 */
export class DiagnosticsCollector {
  private videoStarted = false;
  private tracingStarted = false;

  constructor(private readonly client: McpClient, private readonly outDir: string, private readonly io: BindingIO) {}

  /** Best-effort start; a target that lacks the capability just records nothing. */
  async start(opts: { video?: boolean; trace?: boolean }): Promise<void> {
    if (opts.video) {
      const r = await this.client.callToolText('browser_start_video', {});
      this.videoStarted = r.isOk();
    }
    if (opts.trace) {
      const r = await this.client.callToolText('browser_start_tracing', {});
      this.tracingStarted = r.isOk();
    }
  }

  /** Console + network as text artifacts. Safe to call any time. */
  async collectLogs(): Promise<ArtifactRef[]> {
    const refs: ArtifactRef[] = [];
    const console_ = await this.client.callToolText('browser_console_messages', {});
    if (console_.isOk() && console_.value.trim()) {
      const ref = await this.save(Buffer.from(console_.value, 'utf8'), 'text/plain', 'file', 'console.log');
      if (ref) refs.push(ref);
    }
    const net = await this.client.callToolText('browser_network_requests', {});
    if (net.isOk() && net.value.trim()) {
      const ref = await this.save(Buffer.from(net.value, 'utf8'), 'text/plain', 'file', 'network.log');
      if (ref) refs.push(ref);
    }
    return refs;
  }

  /** Stop recorders and sweep every media file they produced into artifacts. */
  async finish(): Promise<ArtifactRef[]> {
    if (this.videoStarted) await this.client.callToolText('browser_stop_video', {}).catch(() => undefined);
    if (this.tracingStarted) await this.client.callToolText('browser_stop_tracing', {}).catch(() => undefined);
    const refs = await this.collectLogs();
    refs.push(...(await this.sweepMedia()));
    return refs;
  }

  /** Recursive — video sits at the top level, traces under `traces/`. */
  private async sweepMedia(dir = this.outDir, depth = 0): Promise<ArtifactRef[]> {
    const out: ArtifactRef[] = [];
    if (depth > 3) return out;
    try {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) { out.push(...(await this.sweepMedia(full, depth + 1))); continue; }
        const ext = extname(entry.name).toLowerCase();
        if (!MEDIA.has(ext)) continue;
        const bytes = await readFile(full);
        const kind = ext === '.webm' || ext === '.mp4' ? 'video' : 'file';
        const ref = await this.save(bytes, MIME[ext] ?? 'application/octet-stream', kind, entry.name);
        if (ref) out.push(ref);
      }
    } catch { /* diagnostics are best-effort, never fatal */ }
    return out;
  }

  private async save(bytes: Buffer, mime: string, kind: 'video' | 'file', label: string): Promise<ArtifactRef | undefined> {
    const saved = await this.io.saveArtifact(new Uint8Array(bytes), { kind, mime, label });
    return saved.isOk() ? saved.value : undefined;
  }
}
