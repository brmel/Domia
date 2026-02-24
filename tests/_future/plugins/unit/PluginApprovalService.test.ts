import 'reflect-metadata';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { PluginApprovalService } from '@application/services/plugins/PluginApprovalService';

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

describe('PluginApprovalService', () => {
    const originalSecret = process.env['DOMIA_PLUGIN_APPROVAL_SECRET'];

    beforeEach(() => {
        process.env['DOMIA_PLUGIN_APPROVAL_SECRET'] = 'plugin-approval-secret';
    });

    afterEach(() => {
        process.env['DOMIA_PLUGIN_APPROVAL_SECRET'] = originalSecret;
    });

    it('approves only when artifact matches request and signature is valid', () => {
        const service = new PluginApprovalService();

        const approval = {
            id: 'approval-1',
            runId: 'run-1',
            pluginId: 'plugin-1',
            capability: 'fs.write',
            grantedBy: 'security-admin',
            expiresAt: new Date(Date.now() + 60_000).toISOString()
        };

        const signature = signApproval(approval, process.env['DOMIA_PLUGIN_APPROVAL_SECRET'] as string);

        const result = service.isApproved({
            runId: 'run-1',
            pluginId: 'plugin-1',
            capability: 'fs.write',
            payload: {
                approval: {
                    ...approval,
                    signature
                }
            }
        });

        expect(result).toBe(true);
    });

    it('rejects expired approvals', () => {
        const service = new PluginApprovalService();

        const approval = {
            id: 'approval-2',
            runId: 'run-1',
            pluginId: 'plugin-1',
            capability: 'fs.write',
            grantedBy: 'security-admin',
            expiresAt: new Date(Date.now() - 60_000).toISOString()
        };

        const signature = signApproval(approval, process.env['DOMIA_PLUGIN_APPROVAL_SECRET'] as string);

        const result = service.isApproved({
            runId: 'run-1',
            pluginId: 'plugin-1',
            capability: 'fs.write',
            payload: {
                approval: {
                    ...approval,
                    signature
                }
            }
        });

        expect(result).toBe(false);
    });

    it('rejects approvals with mismatched scope', () => {
        const service = new PluginApprovalService();

        const approval = {
            id: 'approval-3',
            runId: 'run-1',
            pluginId: 'plugin-1',
            capability: 'fs.write',
            grantedBy: 'security-admin',
            expiresAt: new Date(Date.now() + 60_000).toISOString()
        };

        const signature = signApproval(approval, process.env['DOMIA_PLUGIN_APPROVAL_SECRET'] as string);

        const result = service.isApproved({
            runId: 'run-1',
            pluginId: 'plugin-2',
            capability: 'fs.write',
            payload: {
                approval: {
                    ...approval,
                    signature
                }
            }
        });

        expect(result).toBe(false);
    });
});
