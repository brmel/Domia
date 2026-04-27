import { ObservationProfile } from '@domain/value-objects/ObservationProfile';
import {
    OBSERVATION_FPS_LONG_WAIT,
    OBSERVATION_FPS_QUICK_ACTION,
    OBSERVATION_FPS_HIGH_FIDELITY,
} from '@shared/defaults';

export interface PlaywrightProfileSettings {
    readonly fps: number;
    readonly captureAria: boolean;
    readonly hookConsole: boolean;
    readonly hookNetwork: boolean;
    readonly hookPageError: boolean;
}

const SETTINGS: Record<ObservationProfile, PlaywrightProfileSettings | null> = {
    [ObservationProfile.Off]: null,
    [ObservationProfile.OnDemand]: null,
    [ObservationProfile.LongWait]: {
        fps: OBSERVATION_FPS_LONG_WAIT,
        captureAria: false,
        hookConsole: true,
        hookNetwork: false,
        hookPageError: true,
    },
    [ObservationProfile.QuickAction]: {
        fps: OBSERVATION_FPS_QUICK_ACTION,
        captureAria: true,
        hookConsole: true,
        hookNetwork: true,
        hookPageError: true,
    },
    [ObservationProfile.HighFidelity]: {
        fps: OBSERVATION_FPS_HIGH_FIDELITY,
        captureAria: true,
        hookConsole: true,
        hookNetwork: true,
        hookPageError: true,
    },
};

export function translateProfile(profile: ObservationProfile): PlaywrightProfileSettings | null {
    return SETTINGS[profile];
}
