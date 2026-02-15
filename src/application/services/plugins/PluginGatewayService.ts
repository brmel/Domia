import { inject, injectable } from 'tsyringe';
import type { ILogger } from '@domain/ports';
import type { PluginInvocationRequest, PluginInvocationResult, PluginManifest } from '@domain/plugins/PluginManifest';
import { PluginCapabilityPolicyService } from './PluginCapabilityPolicyService';

@injectable()
export class PluginGatewayService {
    constructor(
        @inject(PluginCapabilityPolicyService) private readonly policy: PluginCapabilityPolicyService,
        @inject('ILogger') private readonly logger: ILogger
    ) {}

    invoke(manifest: PluginManifest, request: PluginInvocationRequest): PluginInvocationResult {
        const decision = this.policy.decide(manifest, request.capability);

        if (decision !== 'allow') {
            this.logger.warn('[PluginGatewayService] Plugin invocation blocked by policy scaffold', {
                runId: request.runId,
                pluginId: request.pluginId,
                capability: request.capability,
                decision
            });

            return {
                success: false,
                message: `Plugin invocation requires ${decision}`
            };
        }

        this.logger.info('[PluginGatewayService] Plugin invocation accepted by scaffold policy', {
            runId: request.runId,
            pluginId: request.pluginId,
            capability: request.capability
        });

        return {
            success: true,
            message: 'Scaffold gateway: execution adapter not implemented yet'
        };
    }
}
