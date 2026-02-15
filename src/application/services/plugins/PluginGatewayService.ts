import { inject, injectable } from 'tsyringe';
import type { ILogger } from '@domain/ports';
import type { PluginInvocationRequest, PluginInvocationResult, PluginManifest } from '@domain/plugins/PluginManifest';
import { PluginCapabilityPolicyService } from './PluginCapabilityPolicyService';
import { PluginExecutionAdapterRegistryService } from './PluginExecutionAdapterRegistryService';
import { PluginApprovalService } from './PluginApprovalService';

@injectable()
export class PluginGatewayService {
    constructor(
        @inject(PluginCapabilityPolicyService) private readonly policy: PluginCapabilityPolicyService,
        @inject(PluginExecutionAdapterRegistryService) private readonly adapterRegistry: PluginExecutionAdapterRegistryService,
        @inject(PluginApprovalService) private readonly approvalService: PluginApprovalService,
        @inject('ILogger') private readonly logger: ILogger
    ) {}

    invoke(manifest: PluginManifest, request: PluginInvocationRequest): PluginInvocationResult {
        const decision = this.policy.decide(manifest, request.capability);

        if (decision === 'deny') {
            this.logger.warn('[PluginGatewayService] Plugin invocation denied by capability policy', {
                runId: request.runId,
                pluginId: request.pluginId,
                capability: request.capability
            });

            return {
                success: false,
                message: 'Plugin invocation denied by capability policy'
            };
        }

        if (decision === 'escalate' && !this.approvalService.isApproved(request)) {
            this.logger.warn('[PluginGatewayService] Plugin invocation blocked awaiting approval', {
                runId: request.runId,
                pluginId: request.pluginId,
                capability: request.capability
            });

            return {
                success: false,
                message: 'Plugin invocation requires explicit approval'
            };
        }

        const adapter = this.adapterRegistry.resolve(request.capability);
        if (!adapter) {
            this.logger.warn('[PluginGatewayService] Plugin invocation blocked: no adapter registered for capability', {
                runId: request.runId,
                pluginId: request.pluginId,
                capability: request.capability
            });

            return {
                success: false,
                message: `Plugin invocation blocked: no adapter for capability '${request.capability}'`
            };
        }

        try {
            const result = adapter.execute(manifest, request);

            this.logger.info('[PluginGatewayService] Plugin invocation completed through adapter', {
                runId: request.runId,
                pluginId: request.pluginId,
                capability: request.capability,
                success: result.success
            });

            return result;
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);

            this.logger.error('[PluginGatewayService] Plugin adapter execution failed', {
                runId: request.runId,
                pluginId: request.pluginId,
                capability: request.capability,
                reason
            });

            return {
                success: false,
                message: `Plugin adapter execution failed: ${reason}`
            };
        }
    }
}
