import { injectable } from 'tsyringe';
import { ILogger } from '@domain/ports/ILogger';
import { MAX_LOG_CONTEXT_LENGTH } from '@shared/defaults';

@injectable()
export class ConsoleLogger implements ILogger {
    private static readonly MAX_CONTEXT_LENGTH = MAX_LOG_CONTEXT_LENGTH;

    private formatMessage(level: string, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    }

    private formatContext(context: Record<string, unknown>): string {
        const raw = JSON.stringify(context, null, 2);
        if (raw.length <= ConsoleLogger.MAX_CONTEXT_LENGTH) return raw;
        return raw.slice(0, ConsoleLogger.MAX_CONTEXT_LENGTH) + `\n... [truncated ${raw.length - ConsoleLogger.MAX_CONTEXT_LENGTH} chars]`;
    }

    info(message: string, context?: Record<string, unknown>): void {
        console.info(this.formatMessage('info', message));
        if (context) {
            console.info(this.formatContext(context));
        }
    }

    warn(message: string, context?: Record<string, unknown>): void {
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
        if (process.env['NODE_ENV'] === 'development' || process.env['DEBUG']) {
            console.debug(this.formatMessage('debug', message));
            if (context) {
                console.debug(this.formatContext(context));
            }
        }
    }
}
