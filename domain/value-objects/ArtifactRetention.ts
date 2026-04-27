export const ArtifactRetention = {
    All: 'all',
    OnFailure: 'on-failure',
    None: 'none',
} as const;
export type ArtifactRetention = typeof ArtifactRetention[keyof typeof ArtifactRetention];

export const DEFAULT_ARTIFACT_RETENTION: ArtifactRetention = ArtifactRetention.All;
