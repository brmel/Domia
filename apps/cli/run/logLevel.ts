import { LogLevel } from '@domain/enums';

export const LOG_LEVEL_CHOICES = ['error', 'warn', 'info', 'debug'] as const;
export type LogLevelChoice = typeof LOG_LEVEL_CHOICES[number];

export function parseLogLevel(value: string): LogLevelChoice {
    const lower = value.toLowerCase() as LogLevelChoice;
    if (!LOG_LEVEL_CHOICES.includes(lower)) {
        throw new Error(`Invalid log level: ${value}. Must be one of: ${LOG_LEVEL_CHOICES.join(', ')}`);
    }
    return lower;
}

export function toLogLevelEnum(level: LogLevelChoice): LogLevel {
    const map: Record<LogLevelChoice, LogLevel> = {
        error: LogLevel.ERROR,
        warn: LogLevel.WARN,
        info: LogLevel.INFO,
        debug: LogLevel.DEBUG,
    };
    return map[level];
}
