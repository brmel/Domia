import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import os from 'os';
import fs from 'fs-extra';
import path from 'path';
import { PluginGatewayService } from './PluginGatewayService';
import { PluginCapabilityPolicyService } from './PluginCapabilityPolicyService';
import { PluginExecutionAdapterRegistryService } from './PluginExecutionAdapterRegistryService';
import { PluginApprovalService } from './PluginApprovalService';

describe('PluginGatewayService', () => {
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    };

    it('blocks invocation when policy does not allow', () => {
        const gateway = new PluginGatewayService(
            new PluginCapabilityPolicyService(),
            new PluginExecutionAdapterRegistryService(),
            new PluginApprovalService(),
            logger
        );

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

    it('requires explicit approval for escalated capabilities', () => {
        const gateway = new PluginGatewayService(
            new PluginCapabilityPolicyService(),
            new PluginExecutionAdapterRegistryService(),
            new PluginApprovalService(),
            logger
        );

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
        expect(result.message).toContain('approval');
    });

    it('executes fs.read via adapter when capability is allowed', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'domia-plugin-read-'));
        const previousCwd = process.cwd();

        try {
            const filePath = path.join(tempDir, 'readme.txt');
            fs.writeFileSync(filePath, 'plugin-read-content');
            process.chdir(tempDir);

            const gateway = new PluginGatewayService(
                new PluginCapabilityPolicyService(),
                new PluginExecutionAdapterRegistryService(),
                new PluginApprovalService(),
                logger
            );

            const result = gateway.invoke(
                {
                    id: 'plugin-2',
                    version: '1.0.0',
                    name: 'Reader',
                    trust: 'trusted',
                    capabilities: ['fs.read']
                },
                {
                    runId: 'r2',
                    pluginId: 'plugin-2',
                    capability: 'fs.read',
                    payload: {
                        path: 'readme.txt'
                    }
                }
            );

            expect(result.success).toBe(true);
            expect(result.data?.['preview']).toContain('plugin-read-content');
        } finally {
            process.chdir(previousCwd);
            fs.removeSync(tempDir);
        }
    });
});
