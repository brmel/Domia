import { injectable, inject } from 'tsyringe';
import type { ILogger } from '@domain/ports';
import type { PluginRegistryService } from '../../plugins/PluginRegistryService';
import type { PluginGatewayService } from '../../plugins/PluginGatewayService';
import type { RunTestInput } from '@application/dtos';

@injectable()
export class PluginPreflightCoordinator {
    constructor(
        @inject('PluginRegistryService') private readonly pluginRegistry: PluginRegistryService,
        @inject('PluginGatewayService') private readonly pluginGateway: PluginGatewayService,
        @inject('ILogger') private readonly logger: ILogger
    ) {}

    evaluate(input: RunTestInput, runId: string): void {
        const preflight = input.options?.pluginPreflight;
        if (!preflight) {
            return;
        }

        try {
            const manifest = this.pluginRegistry.get(preflight.pluginId);
            if (!manifest) {
                this.logger.warn('[PluginPreflightCoordinator] Plugin preflight skipped: plugin not found', {
                    runId,
                    pluginId: preflight.pluginId
                });
                return;
            }

            const result = this.pluginGateway.authorize(manifest, {
                runId,
                pluginId: preflight.pluginId,
                capability: preflight.capability,
                payload: {}
            });

            this.logger.info('[PluginPreflightCoordinator] Plugin preflight evaluated', {
                runId,
                pluginId: preflight.pluginId,
                capability: preflight.capability,
                success: result.success,
                message: result.message
            });
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.logger.warn('[PluginPreflightCoordinator] Plugin preflight failed non-fatally', {
                runId,
                pluginId: preflight.pluginId,
                reason
            });
        }
    }
}
