export const Platform = {
    Web: 'web',
    Electron: 'electron',
    Mobile: 'mobile',
} as const;

export type BuiltInPlatformType = typeof Platform[keyof typeof Platform];

/** A built-in platform, or any string (plugins/future adapters register their own). */
export type PlatformType = BuiltInPlatformType | (string & NonNullable<unknown>);
