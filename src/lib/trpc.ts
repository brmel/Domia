import { createTRPCClient } from '@trpc/client';
import { ipcLink } from 'trpc-electron/renderer';
import type { AppRouter } from '../../electron/router';

const isElectron = typeof window !== 'undefined' && 'electronTRPC' in window;

function createMockClient(): ReturnType<typeof createTRPCClient<AppRouter>> {
    const handler = {
        get(_target: unknown, prop: string): unknown {
            if (prop === 'test') {
                return new Proxy({}, {
                    get(_t: unknown, method: string): unknown {
                        if (method === 'run') {
                            return {
                                mutate: async () => {
                                    return { success: false, error: 'Running in browser-only mode' };
                                }
                            };
                        }
                        if (method === 'cancel') {
                            return {
                                mutate: async () => {
                                    return { success: false };
                                }
                            };
                        }
                        if (method === 'onUpdate') {
                            return {
                                subscribe: () => ({
                                    unsubscribe: () => { }
                                })
                            };
                        }
                        return () => Promise.resolve({});
                    }
                });
            }
            if (prop === 'desktop') {
                return new Proxy({}, {
                    get(_t: unknown, method: string): unknown {
                        if (method === 'getSources') {
                            return {
                                query: async () => {
                                    return [];
                                }
                            };
                        }
                        return () => Promise.resolve([]);
                    }
                });
            }
            return () => Promise.resolve({});
        }
    };
    return new Proxy({}, handler) as ReturnType<typeof createTRPCClient<AppRouter>>;
}

export const trpc = isElectron
    ? createTRPCClient<AppRouter>({
        links: [ipcLink()],
    })
    : createMockClient();
