import { injectable } from 'tsyringe';
import type { PluginCapability, PluginManifest } from '@domain/plugins/PluginManifest';

export type PluginPolicyDecision = 'allow' | 'deny' | 'escalate';

@injectable()
export class PluginCapabilityPolicyService {
    decide(manifest: PluginManifest, capability: PluginCapability): PluginPolicyDecision {
        if (!manifest.capabilities.includes(capability)) {
            return 'deny';
        }

        if (manifest.trust === 'restricted' && capability.endsWith('.write')) {
            return 'escalate';
        }

        return manifest.trust === 'sandboxed' && capability === 'device.control' ? 'escalate' : 'allow';
    }
}
