// Browser-native logger. The renderer must not pull node-only logging deps
// (pino resolves its node entry under the Electron-renderer build and drags in
// `os`/`fs`, which crashes the sandboxed renderer). Same call shape as before:
// logger.error({ err }, 'message').
type LogFn = (objOrMsg: unknown, msg?: string) => void;

const isDev = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);

function make(method: 'debug' | 'info' | 'warn' | 'error', enabled: boolean): LogFn {
    return (objOrMsg, msg) => {
        if (!enabled) return;
        if (msg !== undefined) console[method](msg, objOrMsg);
        else console[method](objOrMsg);
    };
}

export const logger = {
    debug: make('debug', isDev),
    info: make('info', true),
    warn: make('warn', true),
    error: make('error', true),
};
