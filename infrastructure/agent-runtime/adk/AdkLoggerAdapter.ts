import { setLogger, setLogLevel, type Logger as AdkLogger, LogLevel as AdkLogLevel } from '@google/adk';
import type { ILogger } from '@domain/ports';
import { LogLevel as DomainLogLevel } from '@domain/enums';

const ADK_TAG = '[ADK]';

const DOMAIN_TO_ADK_LEVEL: Record<DomainLogLevel, AdkLogLevel> = {
    [DomainLogLevel.ERROR]: AdkLogLevel.ERROR,
    [DomainLogLevel.WARN]: AdkLogLevel.WARN,
    [DomainLogLevel.INFO]: AdkLogLevel.INFO,
    [DomainLogLevel.DEBUG]: AdkLogLevel.DEBUG,
};

export function installAdkLoggerAdapter(logger: ILogger, level: DomainLogLevel = DomainLogLevel.INFO): void {
    const adapter: AdkLogger = {
        log(level, ...args) {
            const message = formatArgs(args);
            switch (level) {
                case AdkLogLevel.ERROR: logger.error(`${ADK_TAG} ${message}`); return;
                case AdkLogLevel.WARN:  logger.warn(`${ADK_TAG} ${message}`); return;
                case AdkLogLevel.INFO:  logger.info(`${ADK_TAG} ${message}`); return;
                case AdkLogLevel.DEBUG: logger.debug(`${ADK_TAG} ${message}`); return;
            }
        },
        debug: (...args) => logger.debug(`${ADK_TAG} ${formatArgs(args)}`),
        info:  (...args) => logger.info(`${ADK_TAG} ${formatArgs(args)}`),
        warn:  (...args) => logger.warn(`${ADK_TAG} ${formatArgs(args)}`),
        error: (...args) => logger.error(`${ADK_TAG} ${formatArgs(args)}`),
    };
    setLogger(adapter);
    setLogLevel(DOMAIN_TO_ADK_LEVEL[level]);
}

function formatArgs(args: unknown[]): string {
    return args.map((a) => (typeof a === 'string' ? a : safeStringify(a))).join(' ');
}

function safeStringify(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}
