import type {
    WebPlatformConfig,
    ElectronPlatformConfig,
} from '@domain/types/PlatformConfig';

export type UIPlatformType = 'web' | 'electron';

export type PlatformFieldValue =
    | Omit<WebPlatformConfig, 'platform'>
    | Omit<ElectronPlatformConfig, 'platform'>;

export interface FieldRenderProps {
    value: PlatformFieldValue;
    onChange: (value: PlatformFieldValue) => void;
    errors: Record<string, string>;
    disabled: boolean;
}
