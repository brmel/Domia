import type { LogLevel } from '../enums/LogLevel';

export interface ILogger {
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, error?: unknown, context?: Record<string, unknown>): void;
    debug(message: string, context?: Record<string, unknown>): void;
    setLevel(level: LogLevel): void;
}
