import { inject, injectable } from 'tsyringe';
import type { IEventBus } from '@domain/ports/platform/IEventBus';
import type { ILogger } from '@domain/ports';

@injectable()
export class EventLogger {
    constructor(
        @inject('IEventBus') private readonly events: IEventBus,
        @inject('ILogger') private readonly logger: ILogger,
    ) {}

    install(): void {
        this.events.on('run.started', (e) => this.logger.info('run.started', { runId: String(e.runId), url: e.url }));
        this.events.on('run.completed', (e) => this.logger.info('run.completed', { runId: String(e.runId), success: e.success, summary: e.summary }));
        this.events.on('run.failed', (e) => this.logger.warn('run.failed', { runId: String(e.runId), error: e.error }));
        this.events.on('run.cancelled', (e) => this.logger.info('run.cancelled', { runId: String(e.runId) }));
        this.events.on('plugin.loaded', (e) => this.logger.info('plugin.loaded', { name: e.name, version: e.version, description: e.description, toolCount: e.toolCount }));
        this.events.on('config.changed', (e) => this.logger.info('config.changed', { keys: [...e.keys] }));
        this.events.on('run.degraded', (e) => this.logger.warn('run.degraded', { runId: String(e.runId), metric: e.metric, baselineMs: e.baselineMs, currentMs: e.currentMs }));
        this.events.on('run.suspended', (e) => this.logger.info('run.suspended', { runId: String(e.runId), reason: e.reason }));
        this.events.on('run.resumed', (e) => this.logger.info('run.resumed', { runId: String(e.runId) }));
        this.events.on('agent.outcome', (e) => this.logger.info('agent.outcome', { runId: String(e.runId), kind: e.outcome.kind }));
        this.events.on('step.persisted', (e) => this.logger.debug('step.persisted', { runId: String(e.runId), stepNumber: e.stepNumber, action: e.action.type }));
    }
}
