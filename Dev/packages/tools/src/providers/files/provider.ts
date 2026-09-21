import { readFile, writeFile, readdir, mkdir, stat } from 'node:fs/promises';
import { dirname, relative } from 'node:path';
import { z } from 'zod';
import { resultOk, resultErr, domiaError, moduleId } from '@domia/contracts';
import type {
  BindingIO, ModuleResult, SessionOptions, TargetSpec, ToolBinding, ToolCall, ToolManifest, ToolOutput, ToolProvider,
} from '@domia/contracts';
import { Sandbox, capText } from '../sandbox.js';

const TOOLS = moduleId('tools');
const MAX_READ_BYTES = 200_000;

const MANIFESTS: readonly ToolManifest[] = [
  { name: 'fs.read', description: 'Read a UTF-8 text file from the case workdir.', parameters: z.object({ path: z.string() }), output: z.unknown(), capabilities: ['fs'], risk: 'safe' },
  { name: 'fs.write', description: 'Write a UTF-8 text file in the case workdir (creates parent directories).', parameters: z.object({ path: z.string(), content: z.string() }), output: z.unknown(), capabilities: ['fs'], risk: 'guarded' },
  { name: 'fs.list', description: 'List entries under a directory in the case workdir.', parameters: z.object({ path: z.string().optional() }), output: z.unknown(), capabilities: ['fs'], risk: 'safe' },
];

/** Files, rooted at the case workdir. Path traversal is rejected by the Sandbox. */
export class FilesProvider implements ToolProvider {
  readonly id = 'files';
  readonly role = 'auxiliary' as const;
  readonly scope = 'session' as const;

  supports(_target: TargetSpec): boolean { return true; }
  manifests(_target: TargetSpec): readonly ToolManifest[] { return MANIFESTS; }

  async attach(_target: TargetSpec, _io: BindingIO, opts?: SessionOptions): Promise<ModuleResult<ToolBinding>> {
    if (!opts?.workdir) return resultErr(domiaError(TOOLS, 'BAD_CONFIG', 'files provider needs a workdir'));
    const sandbox = new Sandbox(opts.workdir);

    return resultOk({
      manifests: () => MANIFESTS,
      async execute(call: ToolCall): Promise<ModuleResult<ToolOutput>> {
        const contained = sandbox.contain(call.args['path'] as string | undefined);
        if (contained.isErr()) return resultErr(contained.error);
        const path = contained.value;

        try {
          switch (call.name) {
            case 'fs.read': {
              const info = await stat(path);
              if (info.size > MAX_READ_BYTES) return resultOk({ value: { path: relative(sandbox.root, path), truncated: true, content: capText(await readFile(path, 'utf8'), MAX_READ_BYTES) } });
              return resultOk({ value: { path: relative(sandbox.root, path), content: await readFile(path, 'utf8') } });
            }
            case 'fs.write': {
              await mkdir(dirname(path), { recursive: true });
              const content = String(call.args['content'] ?? '');
              await writeFile(path, content, 'utf8');
              return resultOk({ value: { path: relative(sandbox.root, path), bytes: Buffer.byteLength(content) } });
            }
            case 'fs.list': {
              const entries = await readdir(path, { withFileTypes: true });
              return resultOk({ value: { path: relative(sandbox.root, path) || '.', entries: entries.map((e) => ({ name: e.name, kind: e.isDirectory() ? 'dir' : 'file' })) } });
            }
            default:
              return resultErr(domiaError(TOOLS, 'UNKNOWN_TOOL', `files provider has no '${call.name}'`));
          }
        } catch (e) {
          // Missing file / permission → data the agent reacts to.
          return resultErr(domiaError(TOOLS, 'TOOL_FAILED', e instanceof Error ? e.message : String(e), { retryable: false }));
        }
      },
      async dispose(): Promise<void> { /* nothing retained */ },
    });
  }
}
