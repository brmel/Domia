import { injectable, inject } from 'tsyringe';
import { IViewHost, ViewOptions } from '@domain/ports';
import type { ILogger } from '@domain/ports';

@injectable()
export class ConsoleViewHost implements IViewHost {
    constructor(@inject('ILogger') private logger: ILogger) { }

    async show(options: ViewOptions): Promise<void> {
        this.logger.info(`[ConsoleViewHost] Simulating View Show: ${options.width}x${options.height}`);
    }

    async hide(): Promise<void> {
        this.logger.info('[ConsoleViewHost] Simulating View Hide');
    }

    async getCDPWebSocketURL(): Promise<string> {
        throw new Error('ConsoleViewHost does not support CDP connection. Use launch() instead of connect().');
    }
}
