import { injectable } from 'tsyringe';
import { ILogger } from '@domain/ports/ILogger';

@injectable()
export class ConsoleLogger implements ILogger {
    private formatMessage(level: string, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    }

    info(message: string, context?: Record<string, unknown>): void {
        console.info(this.formatMessage('info', message));
        if (context) {
            console.info(JSON.stringify(context, null, 2));
        }
    }

    warn(message: string, context?: Record<string, unknown>): void {
        console.warn(this.formatMessage('warn', message));
        if (context) {
            console.warn(JSON.stringify(context, null, 2));
        }
    }

    error(message: string, error?: unknown, context?: Record<string, unknown>): void {
        console.error(this.formatMessage('error', message));
        if (error) {
            console.error(error);
        }
        if (context) {
            console.error(JSON.stringify(context, null, 2));
        }
    }

    debug(message: string, context?: Record<string, unknown>): void {
        if (process.env['NODE_ENV'] === 'development' || process.env['DEBUG']) {
            console.debug(this.formatMessage('debug', message));
            if (context) {
                console.debug(JSON.stringify(context, null, 2));
            }
        }
    }
}
