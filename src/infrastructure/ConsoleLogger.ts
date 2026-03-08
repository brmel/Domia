import { injectable } from 'tsyringe';
import { ILogger } from '@domain/ports/ILogger';
import { LogLevel } from '@domain/enums';
import { MAX_LOG_CONTEXT_LENGTH } from '@shared/defaults';

@injectable()
export class ConsoleLogger implements ILogger {
    private level: LogLevel = LogLevel.INFO;

    private formatMessage(level: string, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    }

    private formatContext(context: Record<string, unknown>): string {
        const raw = JSON.stringify(context, null, 2);
        if (raw.length <= MAX_LOG_CONTEXT_LENGTH) return raw;
        return raw.slice(0, MAX_LOG_CONTEXT_LENGTH) + `\n... [truncated ${raw.length - MAX_LOG_CONTEXT_LENGTH} chars]`;
    }

    setLevel(level: LogLevel): void {
        this.level = level;
    }

    info(message: string, context?: Record<string, unknown>): void {
        if (this.level < LogLevel.INFO) return;
        console.info(this.formatMessage('info', message));
        if (context) {
            console.info(this.formatContext(context));
        }
    }

    warn(message: string, context?: Record<string, unknown>): void {
        if (this.level < LogLevel.WARN) return;
        console.warn(this.formatMessage('warn', message));
        if (context) {
            console.warn(this.formatContext(context));
        }
    }

    error(message: string, error?: unknown, context?: Record<string, unknown>): void {
        console.error(this.formatMessage('error', message));
        if (error) {
            console.error(error);
        }
        if (context) {
            console.error(this.formatContext(context));
        }
    }

    debug(message: string, context?: Record<string, unknown>): void {
        if (this.level < LogLevel.DEBUG) return;
        console.debug(this.formatMessage('debug', message));
        if (context) {
            console.debug(this.formatContext(context));
        }
    }
}
