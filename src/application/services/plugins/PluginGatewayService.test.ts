import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { PluginGatewayService } from './PluginGatewayService';
import { PluginCapabilityPolicyService } from './PluginCapabilityPolicyService';

describe('PluginGatewayService', () => {
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    };

    it('blocks invocation when policy does not allow', () => {
        const gateway = new PluginGatewayService(new PluginCapabilityPolicyService(), logger);

        const result = gateway.invoke(
            {
                id: 'plugin-1',
                version: '1.0.0',
                name: 'Plugin',
                trust: 'restricted',
                capabilities: ['fs.write']
            },
            {
                runId: 'r1',
                pluginId: 'plugin-1',
                capability: 'fs.write',
                payload: {}
            }
        );

        expect(result.success).toBe(false);
    });
});
