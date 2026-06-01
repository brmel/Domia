import { container } from '@backend/container-root';
import { RunQueries } from '@backend/runs/RunQueries';
import { WorkflowQueries } from '@backend/workflows/WorkflowQueries';
import { APP_DISPLAY_NAME } from '@shared/defaults';

export interface ServerResponse {
    readonly status: number;
    readonly body: unknown;
}

/**
 * Read-only HTTP surface for the third entry point. Resolves the SAME backend
 * services from the SAME container as the desktop tRPC routers and the CLI —
 * the clean-boundary test: a new app needs zero backend changes.
 */
export async function handleDomiaRequest(pathname: string): Promise<ServerResponse> {
    switch (pathname) {
        case '/health':
            return { status: 200, body: { ok: true, app: APP_DISPLAY_NAME } };
        case '/runs':
            return { status: 200, body: await container.resolve(RunQueries).listRuns() };
        case '/workflows':
            return { status: 200, body: await container.resolve(WorkflowQueries).listDefinitions() };
        default:
            return { status: 404, body: { error: `Not found: ${pathname}` } };
    }
}
