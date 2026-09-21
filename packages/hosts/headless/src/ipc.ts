import type { ApiResult, DomiaApi } from '@domia/contracts';

const INVOKE = [
  'cases.create', 'cases.get', 'cases.list', 'cases.update', 'cases.archive', 'cases.validate', 'cases.captureAuth',
  'runs.start', 'runs.pause', 'runs.resume', 'runs.cancel', 'runs.answer', 'runs.get', 'runs.list',
  'plans.get', 'plans.history',
  'traces.timeline', 'traces.artifact',
  'tools.catalog',
  'audits.sweep', 'audits.list', 'audits.get',
  'agents.providers', 'agents.models',
  'memories.list', 'memories.save', 'memories.remove',
  'skills.list', 'skills.get', 'skills.relevant',
  'settings.get', 'settings.patch',
] as const;

const WATCH = ['runs.watch', 'plans.watch'] as const;

export type InvokePath = (typeof INVOKE)[number];
export type WatchPath = (typeof WATCH)[number];

export interface ApiRouter {
  readonly invokePaths: readonly InvokePath[];
  readonly watchPaths: readonly WatchPath[];
  invoke(path: string, args: readonly unknown[]): Promise<ApiResult<unknown>>;
  watch(path: string, args: readonly unknown[], onEvent: (event: unknown) => void, signal: AbortSignal): ApiResult<void>;
}

type Method = (...args: unknown[]) => unknown;

function bind(api: DomiaApi, path: string): Method | undefined {
  const [ns, method] = path.split('.');
  const target = (api as unknown as Record<string, Record<string, unknown> | undefined>)[ns ?? ''];
  const fn = target?.[method ?? ''];
  return typeof fn === 'function' ? (fn as Method).bind(target) : undefined;
}

const notFound = (kind: string, path: string): ApiResult<never> => ({ ok: false, error: { code: 'NOT_FOUND', message: `no ${kind} '${path}'` } });

export function createApiRouter(api: DomiaApi): ApiRouter {
  return {
    invokePaths: INVOKE,
    watchPaths: WATCH,
    async invoke(path, args) {
      if (!(INVOKE as readonly string[]).includes(path)) return notFound('invokable', path);
      const fn = bind(api, path);
      if (!fn) return notFound('invokable', path);
      return (await fn(...args)) as ApiResult<unknown>;
    },
    watch(path, args, onEvent, signal) {
      if (!(WATCH as readonly string[]).includes(path)) return notFound('watchable', path);
      const fn = bind(api, path);
      if (!fn) return notFound('watchable', path);
      const iterable = fn(...args, signal) as AsyncIterable<unknown>;
      void (async () => { for await (const event of iterable) onEvent(event); })().catch(() => undefined);
      return { ok: true, data: undefined };
    },
  };
}
