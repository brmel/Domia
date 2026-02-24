import { injectable } from 'tsyringe';
import type { PluginInvocationRequest } from '@domain/plugins/PluginManifest';
import crypto from 'crypto';

interface PluginApprovalArtifact {
    readonly id: string;
    readonly runId: string;
    readonly pluginId: string;
    readonly capability: string;
    readonly grantedBy: string;
    readonly expiresAt: string;
    readonly signature: string;
}

@injectable()
export class PluginApprovalService {
    isApproved(request: PluginInvocationRequest): boolean {
        const rawApproval = request.payload['approval'];
        if (!this.isApprovalArtifact(rawApproval)) {
            return false;
        }

        if (rawApproval.runId !== request.runId) {
            return false;
        }

        if (rawApproval.pluginId !== request.pluginId) {
            return false;
        }

        if (rawApproval.capability !== request.capability) {
            return false;
        }

        const expiresAtMs = Date.parse(rawApproval.expiresAt);
        if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
            return false;
        }

        const secret = process.env['DOMIA_PLUGIN_APPROVAL_SECRET'];
        if (!secret || secret.trim().length === 0) {
            return false;
        }

        const expectedSignature = this.computeSignature(rawApproval, secret);
        if (expectedSignature.length !== rawApproval.signature.length) {
            return false;
        }

        return crypto.timingSafeEqual(
            Buffer.from(expectedSignature, 'utf8'),
            Buffer.from(rawApproval.signature, 'utf8')
        );
    }

    private computeSignature(approval: PluginApprovalArtifact, secret: string): string {
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

    private isApprovalArtifact(input: unknown): input is PluginApprovalArtifact {
        if (!input || typeof input !== 'object') {
            return false;
        }

        const candidate = input as Record<string, unknown>;
        return typeof candidate['id'] === 'string'
            && typeof candidate['runId'] === 'string'
            && typeof candidate['pluginId'] === 'string'
            && typeof candidate['capability'] === 'string'
            && typeof candidate['grantedBy'] === 'string'
            && typeof candidate['expiresAt'] === 'string'
            && typeof candidate['signature'] === 'string';
    }
}
