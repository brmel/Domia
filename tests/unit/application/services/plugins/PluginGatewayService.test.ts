import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import os from 'os';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { PluginGatewayService } from '@application/services/plugins/PluginGatewayService';
import { PluginCapabilityPolicyService } from '@application/services/plugins/PluginCapabilityPolicyService';
import { PluginExecutionAdapterRegistryService } from '@application/services/plugins/PluginExecutionAdapterRegistryService';
import { PluginApprovalService } from '@application/services/plugins/PluginApprovalService';

describe('PluginGatewayService', () => {
    const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    };

    const originalApprovalSecret = process.env['DOMIA_PLUGIN_APPROVAL_SECRET'];

    function signApproval(approval: {
        id: string;
        runId: string;
        pluginId: string;
        capability: string;
        grantedBy: string;
        expiresAt: string;
    }, secret: string): string {
        return crypto
            .createHash('sha256')
            .update([
                approval.id,
                approval.runId,
                approval.pluginId,
                approval.capability,
                approval.grantedBy,
                approval.expiresAt,
                secret
            ].join('|'))
            .digest('hex');
    }

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

    it('authorizes preflight without executing adapters', () => {
        const adapterRegistry = {
            resolve: vi.fn()
        };

        const gateway = new PluginGatewayService(
            new PluginCapabilityPolicyService(),
            adapterRegistry as unknown as PluginExecutionAdapterRegistryService,
            new PluginApprovalService(),
            logger
        );

        const result = gateway.authorize(
            {
                id: 'plugin-allow',
                version: '1.0.0',
                name: 'AllowPlugin',
                trust: 'trusted',
                capabilities: ['fs.read']
            },
            {
                runId: 'r3',
                pluginId: 'plugin-allow',
                capability: 'fs.read',
                payload: {}
            }
        );

        expect(result.success).toBe(true);
        expect(result.decision).toBe('allow');
        expect(adapterRegistry.resolve).not.toHaveBeenCalled();
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

    it('executes escalated capability when approval artifact is valid', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'domia-plugin-read-'));
        const previousCwd = process.cwd();

        try {
            process.env['DOMIA_PLUGIN_APPROVAL_SECRET'] = 'gateway-approval-secret';
            const filePath = path.join(tempDir, 'readme.txt');
            fs.writeFileSync(filePath, 'plugin-read-content-approved');
            process.chdir(tempDir);

            const gateway = new PluginGatewayService(
                new PluginCapabilityPolicyService(),
                new PluginExecutionAdapterRegistryService(),
                new PluginApprovalService(),
                logger
            );

            const approval = {
                id: 'approval-escalated',
                runId: 'r4',
                pluginId: 'plugin-4',
                capability: 'fs.write',
                grantedBy: 'security-admin',
                expiresAt: new Date(Date.now() + 60_000).toISOString()
            };

            const result = gateway.invoke(
                {
                    id: 'plugin-4',
                    version: '1.0.0',
                    name: 'Escalated Reader',
                    trust: 'restricted',
                    capabilities: ['fs.write', 'fs.read']
                },
                {
                    runId: 'r4',
                    pluginId: 'plugin-4',
                    capability: 'fs.write',
                    payload: {
                        path: 'readme.txt',
                        approval: {
                            ...approval,
                            signature: signApproval(approval, process.env['DOMIA_PLUGIN_APPROVAL_SECRET'] as string)
                        }
                    }
                }
            );

            expect(result.success).toBe(false);
            expect(result.message).toContain('no adapter');
        } finally {
            process.chdir(previousCwd);
            process.env['DOMIA_PLUGIN_APPROVAL_SECRET'] = originalApprovalSecret;
            fs.removeSync(tempDir);
        }
    });
});
