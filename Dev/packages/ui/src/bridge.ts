import type { ApiResult } from '@domia/contracts';

export interface DomiaBridge {
  invoke(path: string, args: readonly unknown[]): Promise<unknown>;
  watch(path: string, args: readonly unknown[], onEvent: (event: unknown) => void): () => void;
}

declare global {
  interface Window {
    domia: DomiaBridge;
  }
}

export async function invoke<T>(path: string, ...args: unknown[]): Promise<ApiResult<T>> {
  return (await window.domia.invoke(path, args)) as ApiResult<T>;
}

export function watch(path: string, args: readonly unknown[], onEvent: (event: unknown) => void): () => void {
  return window.domia.watch(path, args, onEvent);
}

export function unwrap<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}
