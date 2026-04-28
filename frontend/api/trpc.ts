import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@apps/desktop/ipc/router';

export const trpc = createTRPCReact<AppRouter>();
