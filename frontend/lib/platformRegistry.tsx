import type { BasePlatformConfig } from '@domain/types/PlatformConfig';
import { WebPlatformFields } from '@frontend/features/runs/components/platform/WebPlatformFields';
import { ElectronPlatformFields } from '@frontend/features/runs/components/platform/ElectronPlatformFields';
import { WebConfigSchema, ElectronConfigSchema } from '@shared/contracts/platform';
import { z } from 'zod';
import type { UIPlatformType, PlatformFieldValue, FieldRenderProps } from './platformFieldTypes';

export type { UIPlatformType, PlatformFieldValue, FieldRenderProps } from './platformFieldTypes';

interface PlatformDefinition<T extends BasePlatformConfig> {
    type: T['platform'];
    label: string;
    description: string;
    icon: string;
    renderFields: React.ComponentType<FieldRenderProps>;
    validate: (value: PlatformFieldValue) => Record<string, string>;
    defaultValues: Omit<T, 'platform'>;
}

function zodValidate(schema: z.ZodTypeAny, platform: string, value: PlatformFieldValue): Record<string, string> {
    const result = schema.safeParse({ platform, ...value });
    if (result.success) return {};
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
        const path = issue.path.filter((p) => p !== 'platform').join('.');
        if (path) errors[path] = issue.message;
    }
    return errors;
}

export const platformRegistry: Record<UIPlatformType, PlatformDefinition<BasePlatformConfig> & { defaultValues: PlatformFieldValue }> = {
    web: {
        type: 'web',
        label: 'Web Browser',
        description: 'Automate web applications and websites',
        icon: '🌐',
        renderFields: WebPlatformFields,
        validate: (v) => zodValidate(WebConfigSchema, 'web', v),
        defaultValues: { url: 'https://ibraverse.ca' },
    },
    electron: {
        type: 'electron',
        label: 'Electron App',
        description: 'Automate Electron desktop applications',
        icon: '⚡',
        renderFields: ElectronPlatformFields,
        validate: (v) => zodValidate(ElectronConfigSchema, 'electron', v),
        defaultValues: {
            connection: { type: 'cdp', cdpUrl: 'http://localhost:9222' },
        },
    },
};

export function getAvailablePlatforms(): Array<PlatformDefinition<BasePlatformConfig>> {
    return Object.values(platformRegistry);
}
