import { z } from 'zod';
import { resultOk, resultErr, domiaError, moduleId } from '@domia/contracts';
import type {
  BindingIO, ModuleResult, NativeSnapshot, Observation, SessionOptions,
  TargetSpec, ToolBinding, ToolCall, ToolManifest, ToolOutput, ToolProvider,
} from '@domia/contracts';
import { htmlToMarkdown, type Extracted } from './html.js';

const TOOLS = moduleId('tools');
const MAX_BYTES = 2_000_000;
const SNAPSHOT_CHARS = 12_000;
const DEFAULT_TIMEOUT_MS = 20_000;
const UA = 'Mozilla/5.0 (compatible; DomiaScraper/1.0; +https://domia.dev)';

const MANIFESTS: readonly ToolManifest[] = [
  {
    name: 'fetch.get',
    description: 'HTTP GET a URL (or the current page) and return its content as markdown, plain text, and extracted links. No browser — fast for static/server-rendered pages; use a browser driver for JS-rendered content.',
    parameters: z.object({ url: z.string().url().optional(), timeoutMs: z.number().int().positive().optional() }),
    output: z.unknown(),
    capabilities: ['net', 'dom'],
    risk: 'safe',
  },
  {
    name: 'fetch.links',
    description: 'List the links (href + text) extracted from the current page.',
    parameters: z.object({}),
    output: z.unknown(),
    capabilities: ['net'],
    risk: 'safe',
  },
];

interface FetchState {
  url: string;
  status: number;
  extracted: Extracted;
  snapshotText: string;
}

async function fetchPage(url: string, timeoutMs: number): Promise<ModuleResult<FetchState>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' } });
    const reader = res.body?.getReader();
    let received = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > MAX_BYTES) { await reader.cancel(); break; }
        chunks.push(value);
      }
    }
    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
    const extracted = htmlToMarkdown(html, res.url || url);
    return resultOk({ url: res.url || url, status: res.status, extracted, snapshotText: extracted.markdown });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return resultErr(domiaError(TOOLS, aborted ? 'TOOL_TIMEOUT' : 'TOOL_FAILED', aborted ? `fetch timed out after ${timeoutMs}ms` : `fetch failed: ${e instanceof Error ? e.message : String(e)}`, { retryable: aborted }));
  } finally {
    clearTimeout(timer);
  }
}

function observationOf(state: FetchState, prev: string | undefined): Observation {
  const snapshot: NativeSnapshot = { kind: 'native', text: state.snapshotText.slice(0, SNAPSHOT_CHARS) };
  return { snapshot, url: state.url, title: state.extracted.title, changedSinceLast: snapshot.text !== prev };
}

function payloadOf(state: FetchState): ToolOutput['value'] {
  return {
    url: state.url,
    status: state.status,
    title: state.extracted.title,
    markdown: state.extracted.markdown,
    text: state.extracted.text,
    links: state.extracted.links,
    truncated: state.extracted.markdown.length > SNAPSHOT_CHARS,
  };
}

/**
 * Browserless web scraper: HTTP GET → markdown/text/links. A `role:'target'` driver
 * alternative to playwright-mcp, selected by `SessionOptions.driver` or config.
 */
export class FetchScrapeProvider implements ToolProvider {
  readonly id = 'fetch-scrape';
  readonly role = 'target' as const;
  readonly scope = 'session' as const;

  supports(target: TargetSpec): boolean { return target.kind === 'web'; }
  manifests(_target: TargetSpec): readonly ToolManifest[] { return MANIFESTS; }

  async attach(target: TargetSpec, _io: BindingIO, _opts?: SessionOptions): Promise<ModuleResult<ToolBinding>> {
    if (target.kind !== 'web') return resultErr(domiaError(TOOLS, 'BAD_CONFIG', `fetch-scrape cannot serve target '${target.kind}'`));

    const first = await fetchPage(target.url, DEFAULT_TIMEOUT_MS);
    if (first.isErr()) return resultErr(first.error);
    let state = first.value;
    let prevSnapshot = state.snapshotText;

    return resultOk({
      manifests: () => MANIFESTS,
      observe: async (): Promise<ModuleResult<Observation>> => {
        const obs = observationOf(state, prevSnapshot);
        prevSnapshot = obs.snapshot.text;
        return resultOk(obs);
      },
      async execute(call: ToolCall): Promise<ModuleResult<ToolOutput>> {
        if (call.name === 'fetch.links') return resultOk({ value: { links: state.extracted.links } });
        if (call.name !== 'fetch.get') return resultErr(domiaError(TOOLS, 'UNKNOWN_TOOL', `fetch-scrape has no '${call.name}'`));

        const url = (call.args['url'] as string | undefined) ?? state.url;
        const timeoutMs = (call.args['timeoutMs'] as number | undefined) ?? call.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const r = await fetchPage(url, timeoutMs);
        if (r.isErr()) return resultErr(r.error);
        state = r.value;
        const observation = observationOf(state, prevSnapshot);
        prevSnapshot = observation.snapshot.text;
        return resultOk({ value: payloadOf(state), observation });
      },
      async dispose(): Promise<void> {},
    });
  }
}
