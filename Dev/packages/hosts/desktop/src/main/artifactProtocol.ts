import { protocol, net } from 'electron';
import { pathToFileURL } from 'node:url';
import type { Store } from '@domia/contracts';

export const ARTIFACT_SCHEME = 'domia-artifact';

export function registerArtifactScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ARTIFACT_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

export function serveArtifacts(store: Store): void {
  protocol.handle(ARTIFACT_SCHEME, async (request) => {
    const sha256 = new URL(request.url).hostname;
    const row = await store.artifacts.bySha(sha256);
    if (row.isErr() || !row.value) return new Response('artifact not found', { status: 404 });
    return net.fetch(pathToFileURL(row.value.path).toString());
  });
}
