import { createTRPCReact } from '@trpc/react-query';
import { ipcLink } from 'trpc-electron/renderer';
import type { AppRouter } from '../../electron/router';

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
    links: [ipcLink()],
});
