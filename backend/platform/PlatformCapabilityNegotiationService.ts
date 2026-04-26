import { injectable } from 'tsyringe';
import type { BuiltInPlatformType } from '@domain/types/PlatformConfig';
import type { WorkflowStepDefinition } from '@domain/entities/Workflow';

type Capability = 'navigate' | 'locate' | 'interact' | 'extract' | 'validate' | 'app-control' | 'system-control';
type Support = 'supported' | 'degraded' | 'unsupported';

const MATRIX: Record<BuiltInPlatformType, Record<Capability, Support>> = {
    web:      { navigate: 'supported', locate: 'supported', interact: 'supported', extract: 'supported', validate: 'supported', 'app-control': 'unsupported', 'system-control': 'unsupported' },
    electron: { navigate: 'degraded',  locate: 'supported', interact: 'supported', extract: 'supported', validate: 'supported', 'app-control': 'supported',   'system-control': 'degraded' },
};

const CAPABILITY_PATTERNS: readonly [Capability, RegExp][] = [
    ['navigate',       /navigate|open\s+url|visit\s+|go\s+to/],
    ['extract',        /extract|scrape|read\s+text|capture\s+text/],
    ['validate',       /verify|validate|assert|check/],
    ['app-control',    /window|tray|menu\s+bar|launch\s+app|quit\s+app/],
    ['system-control', /terminal|shell|filesystem|file\s+system|os\s+level|system\s+settings/],
];

@injectable()
export class PlatformCapabilityNegotiationService {
    can(capability: Capability, platform: BuiltInPlatformType) {
        return { capability, support: MATRIX[platform][capability] };
    }

    assessStep(step: WorkflowStepDefinition, platform: BuiltInPlatformType) {
        const prompt = step.prompt.toLowerCase();
        const required: Capability[] = ['interact'];
        for (const [cap, pattern] of CAPABILITY_PATTERNS) {
            if (pattern.test(prompt)) required.push(cap);
        }

        const decisions = required.map(cap => ({
            capability: cap,
            support: MATRIX[platform][cap],
            reason: `Capability '${cap}' is ${MATRIX[platform][cap]} on platform '${platform}' for step '${step.name}'`,
        }));

        const unsupported = decisions.find(d => d.support === 'unsupported');
        return {
            requiredCapabilities: required,
            decisions,
            blocked: Boolean(unsupported),
            ...(unsupported ? { reason: unsupported.reason } : {}),
        };
    }
}
