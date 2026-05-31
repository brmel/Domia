import { injectable } from 'tsyringe';
import { pino, type Logger as PinoLogger, type LevelWithSilent } from 'pino';
import { ILogger } from '@domain/ports/platform/ILogger';
import { LogLevel } from '@domain/enums';

const LEVEL_TO_PINO: Record<LogLevel, LevelWithSilent> = {
    [LogLevel.ERROR]: 'error',
    [LogLevel.WARN]: 'warn',
    [LogLevel.INFO]: 'info',
    [LogLevel.DEBUG]: 'debug',
};

@injectable()
export class ConsoleLogger implements ILogger {
    private readonly logger: PinoLogger = pino({ level: 'info' });

    setLevel(level: LogLevel): void {
        this.logger.level = LEVEL_TO_PINO[level];
    }

    info(message: string, context?: Record<string, unknown>): void {
        this.logger.info(context ?? {}, message);
    }
    warn(message: string, context?: Record<string, unknown>): void {
        this.logger.warn(context ?? {}, message);
    }
    error(message: string, error?: unknown, context?: Record<string, unknown>): void {
        this.logger.error({ ...(context ?? {}), err: error }, message);
    }
    debug(message: string, context?: Record<string, unknown>): void {
        this.logger.debug(context ?? {}, message);
    }
}
