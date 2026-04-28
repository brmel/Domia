export const ObservationProfile = {
    Off: 'off',
    OnDemand: 'on-demand',
    LongWait: 'long-wait',
    QuickAction: 'quick-action',
    HighFidelity: 'high-fidelity',
} as const;
export type ObservationProfile = typeof ObservationProfile[keyof typeof ObservationProfile];

export const DEFAULT_OBSERVATION_PROFILE: ObservationProfile = ObservationProfile.OnDemand;
